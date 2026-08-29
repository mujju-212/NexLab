from flask import Blueprint, request, jsonify, current_app, g
from app.auth.utils import require_auth
from app.extensions import db, limiter
from app.models.submission import CodeVersion, CodeAttempt
from app.ml.code_quality import analyze_code_quality, quality_to_score
from app.execution.languages import (
    GROUP_ORDER,
    catalog,
    resolve as resolve_language,
)
from datetime import datetime

execution_bp = Blueprint('execution', __name__)


# ── Playground / run guard rails ──────────────────────────────────────────────
MAX_CODE_CHARS  = 60_000    # ~1.5k lines — generous for a lab exercise
MAX_STDIN_CHARS = 20_000


# ── Shared Docker execution path ──────────────────────────────────────────────
def _run_docker(code: str, lang_id: str, stdin: str, user_id, packages=None, extra_files=None):
    """
    Execute code in the Docker sandbox under admission control.

    Returns (result, error) where exactly one is non-None:
      result — the runner.run() dict (status_id / stdout / stderr / time_ms / …)
      error  — a ready (response, status_code) tuple to hand straight back:
                 429 + Retry-After when the queue is full / per-user cap hit,
                 503 when the engine itself failed (status_id 13, not the code).
    A compile/runtime error (status 6/11/…) is a normal `result`, not an error —
    the caller still stores it, because a failed attempt is a real attempt.
    """
    from app.exec_engine import runner as _runner
    from app.exec_engine import admission as _adm
    try:
        with _adm.get().acquire(user_id):
            result = _runner.run(code=code, language=lang_id, stdin=stdin, packages=packages, extra_files=extra_files)
    except _adm.AdmissionError as exc:
        resp = jsonify({'error': str(exc)})
        resp.headers['Retry-After'] = str(exc.retry_after)
        return None, (resp, 429)
    if result.get('status_id') == 13:   # Internal Error — platform, never the student
        return None, (jsonify({'error': result.get('note') or 'Execution engine error.'}), 503)
    return result, None


@execution_bp.route('/run', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")   # prevent Run-button spam
def run_code():
    """
    Execute student code in the Docker sandbox.
    Stores every attempt (even failed/non-compiling) per srcML-DKT paper.
    """
    data          = request.get_json()
    code_files    = data.get('files', {})       # {"main": "code..."} or multi-file
    language      = data.get('language', 'python')
    stdin         = data.get('stdin', '')
    packages      = data.get('packages')
    experiment_id = data.get('experiment_id')
    session_id    = data.get('session_id')
    is_submit     = data.get('is_final_submission', False)

    spec = resolve_language(language)
    if not code_files or not spec:
        return jsonify({'error': 'Invalid code or language'}), 400
    if spec['engine'] == 'browser':
        return jsonify({'error': 'Browser languages run client-side only.'}), 400
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    # For single execution, use main file
    primary_code = code_files.get('main', next(iter(code_files.values()), ''))

    # ── Execute in the Docker sandbox ─────────────────────────────────────
    result, error = _run_docker(primary_code, spec['id'], stdin, g.user_id, packages=packages, extra_files=code_files)
    if error:
        return error

    # ── Store attempt (EVERY run, not just final) ─────────────────────────
    if experiment_id:
        attempt_count = CodeAttempt.query.filter_by(
            student_id=g.user_id,
            experiment_id=experiment_id
        ).count()

        quality_metrics = {}
        quality_score   = None
        if is_submit:
            quality_metrics = analyze_code_quality(primary_code, language)
            quality_score   = quality_to_score(quality_metrics)

        attempt = CodeAttempt(
            student_id=g.user_id,
            experiment_id=experiment_id,
            session_id=session_id,
            attempt_number=attempt_count + 1,
            language=language,
            files=code_files,
            stdin=stdin,
            compile_status=result.get('status'),
            compile_output=result.get('compile_output'),
            stdout=result.get('stdout'),
            stderr=result.get('stderr'),
            test_cases_passed=result.get('test_cases_passed', 0),
            test_cases_total=result.get('test_cases_total', 0),
            # runner.run() reports wall time already in ms and memory in KB —
            # no Judge0-style seconds→ms conversion needed.
            execution_time_ms=int(result.get('time_ms') or 0),
            memory_used_kb=result.get('memory_kb') or None,
            loc=quality_metrics.get('loc'),
            cyclomatic_complexity=quality_metrics.get('cyclomatic_complexity'),
            quality_grade=quality_metrics.get('quality_grade'),
            is_final_submission=is_submit,
        )
        db.session.add(attempt)

        # Save code version on every run
        _save_code_version(g.user_id, experiment_id, session_id, code_files, 'on_run')
        db.session.commit()

        if is_submit:
            result['quality_metrics'] = quality_metrics
            result['quality_score']   = quality_score

    return jsonify(result), 200


@execution_bp.route('/save', methods=['POST'])
@require_auth
def auto_save():
    """Auto-save code version every 30 seconds"""
    data = request.get_json()
    _save_code_version(
        student_id=g.user_id,
        experiment_id=data.get('experiment_id'),
        session_id=data.get('session_id'),
        files=data.get('files', {}),
        save_type='auto'
    )
    db.session.commit()
    return jsonify({'status': 'saved'}), 200


def grade_against_test_cases(code, language, experiment_id, student_id, session_id=None,
                             packages=None, persist_attempt=True):
    """
    Run `code` against the experiment's `test_cases` table rows (the SPARK source
    of truth — D4), writing one `TestCaseResult` row per case, updating the
    aggregate CodeAttempt counters, and auto-verifying checkpoints whose mapped
    test cases all pass (C16).

    Returns (passed, total) on success, or None on hard engine failure.

    Falls back to no-op when the experiment has no TestCase rows (embedded
    content_data cases are handled by the caller).
    """
    from app.models.experiment import TestCase
    from app.models.submission import CodeAttempt as _CA
    from app.models.conductor import CheckpointProgress, Checkpoint, TestCaseResult

    cases = TestCase.query.filter_by(experiment_id=experiment_id).all()
    if not cases:
        return None

    try:
        from app.execution.languages import resolve as _resolve
        spec = _resolve(language)
        if not spec or spec['engine'] != 'docker':
            return None
    except Exception:
        return None

    passed = 0
    per_case = []
    for tc in cases:
        stdin = tc.input_data or ''
        result, error = _run_docker(code, spec['id'], stdin, student_id, packages=packages)
        if error:
            # queue full / engine down — surface, grade nothing
            return None
        ok = (result.get('status_id') == 3
              and _norm_stdout(result.get('stdout')) == _norm_stdout(tc.expected_output))
        if ok:
            passed += 1
        per_case.append({'test_case_id': tc.id, 'passed': ok,
                         'execution_time_ms': int(result.get('time_ms') or 0)})

    total = len(cases)

    attempt = None
    if persist_attempt:
        attempt_count = _CA.query.filter_by(
            student_id=student_id, experiment_id=experiment_id).count()
        attempt = _CA(
            student_id=student_id,
            experiment_id=experiment_id,
            session_id=session_id,
            attempt_number=attempt_count + 1,
            language=language,
            files={'main': code},
            stdin='',
            compile_status='graded',
            test_cases_passed=passed,
            test_cases_total=total,
            is_final_submission=True,
        )
        from app.extensions import db
        db.session.add(attempt)
        db.session.flush()

    # ── TestCaseResult rows (B12) ───────────────────────────────────────────
    from app.extensions import db
    for row in per_case:
        db.session.add(TestCaseResult(
            attempt_id=attempt.id if attempt else None,
            test_case_id=row['test_case_id'],
            passed=row['passed'],
            execution_time_ms=row['execution_time_ms'],
        ))

    # ── Auto-verify checkpoints (C16): verified iff ALL mapped cases passed ──
    if session_id and attempt:
        passed_ids = {r['test_case_id'] for r in per_case if r['passed']}
        checkpoints = Checkpoint.query.filter_by(experiment_id=experiment_id).all()
        for cp in checkpoints:
            mapped = set(cp.test_case_ids or [])
            if mapped and mapped.issubset(passed_ids):
                prog = CheckpointProgress.query.filter_by(
                    session_id=session_id, student_id=student_id, checkpoint_id=cp.id).first()
                if not prog:
                    prog = CheckpointProgress(
                        session_id=session_id, student_id=student_id, checkpoint_id=cp.id)
                    db.session.add(prog)
                from datetime import datetime as _dt
                if prog.status in ('pending', 'claimed', 'failed'):
                    prog.status = 'verified'
                    prog.passed_at = _dt.utcnow()
                    prog.last_signal_at = _dt.utcnow()

    from app.extensions import db
    db.session.commit()
    return passed, total


def _norm_stdout(s):
    """Trailing-space + trailing-newline tolerant comparison key."""
    text = (s or '').replace('\r\n', '\n').rstrip('\n')
    return '\n'.join(line.rstrip() for line in text.split('\n'))


def _save_code_version(student_id, experiment_id, session_id, files, save_type):
    if not experiment_id:
        return
    version_num = CodeVersion.query.filter_by(
        student_id=student_id,
        experiment_id=experiment_id
    ).count() + 1

    is_snapshot = (version_num == 1 or version_num % 10 == 0)
    version = CodeVersion(
        student_id=student_id,
        experiment_id=experiment_id,
        session_id=session_id,
        version_number=version_num,
        files=files,
        is_full_snapshot=is_snapshot,
        saved_at=datetime.utcnow(),
        save_type=save_type
    )
    db.session.add(version)


# ══ Compiler / Playground ═════════════════════════════════════════════════════
# Free-form code execution for the student Compiler page. Unlike /run it is not
# tied to an experiment, so it never writes CodeAttempt or CodeVersion rows and
# never touches grading.

@execution_bp.route('/languages', methods=['GET', 'OPTIONS'])
def list_languages():
    if request.method == 'OPTIONS':
        return '', 204
    """Language catalog for the compiler picker (ids, versions, starter code)."""
    return jsonify({'languages': catalog(), 'groups': GROUP_ORDER}), 200


@execution_bp.route('/playground', methods=['POST'])
@require_auth
@limiter.limit("20 per minute")
def playground_run():
    """
    Execute arbitrary code in any supported language and return the full
    terminal picture: stdout, stderr, compiler diagnostics, exit code,
    wall time and peak memory — all from the Docker sandbox.
    """
    data        = request.get_json(silent=True) or {}
    code        = data.get('code') or ''
    stdin       = data.get('stdin') or ''
    language    = data.get('language') or 'python'
    packages    = data.get('packages')
    extra_files = data.get('files') or data.get('extra_files')

    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if spec['engine'] == 'browser':
        # client renders these in a sandboxed iframe; never a backend call
        return jsonify({'error': 'Browser languages run client-side only.'}), 400
    if not code.strip():
        return jsonify({'error': 'Nothing to run — the editor is empty.'}), 400
    if len(code) > MAX_CODE_CHARS:
        return jsonify({'error': f'Source is too large (limit {MAX_CODE_CHARS:,} characters).'}), 413
    if len(stdin) > MAX_STDIN_CHARS:
        return jsonify({'error': f'Input is too large (limit {MAX_STDIN_CHARS:,} characters).'}), 413
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    result, error = _run_docker(code, spec['id'], stdin, g.user_id, packages=packages, extra_files=extra_files)
    if error:
        return error

    result['language'] = spec['id']
    result['label']    = f"{spec['label']} {spec['version']}"
    result['engine']   = 'docker'
    return jsonify(result), 200
