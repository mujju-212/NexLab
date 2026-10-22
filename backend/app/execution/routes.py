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


# ── Live-session rules (server-side enforcement of D2 + Stage-0 gate) ────────
def _enforce_live_session_rules(session_id):
    """
    Enforce, server-side, what the student client previously enforced alone:
      a) enrollment  — only students of the session's section may run code in it
      b) mode matrix — code execution only during the 'working' phase (D2)
      c) pre-lab gate — every gate quiz of the experiment passed at threshold
    Returns None when execution may proceed, or a (response, status) tuple.

    Only applies while the session is ACTIVE: practice outside class,
    catch-up after the session ended, and pre-lab submissions are unaffected.
    Instructors/admins are exempt (they may demo inside a live session).
    """
    if not session_id or getattr(g, 'role', None) != 'student':
        return None

    from app.models.session import LabSession
    from app.models.academic import SectionSubject, SectionStudent
    from app.models.experiment import ContentModule, ContentProgress

    sess = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id).first()
    if not sess:
        return jsonify({'error': 'Session not found in your institution.'}), 404
    if sess.status != 'active':
        return None   # ended/scheduled → normal rules (catch-up, practice)

    # a) Enrollment
    ss = SectionSubject.query.get(sess.section_subject_id)
    enrolled = ss and SectionStudent.query.filter_by(
        section_id=ss.section_id, student_id=g.user_id).first()
    if not enrolled:
        return jsonify({'error': 'You are not enrolled in this session.'}), 403

    # b) Mode capability matrix — 'working' is the only exec-friendly phase
    mode = sess.current_mode or 'briefing'
    MODE_BLOCK = {
        'briefing':    'the instructor has not opened the working phase yet',
        'quiz_active': 'a quiz is active — the editor is locked',
        'paused':      'the session is paused by the instructor',
        'debrief':     'the working phase is over — editor is read-only',
        'ended':       'the session has ended',
    }
    if mode in MODE_BLOCK:
        return jsonify({'error': f'Code execution is disabled: {MODE_BLOCK[mode]}.'}), 403

    # ── Pre-lab gate: REMOVED as a blocker (product decision — it broke the
    # join flow). The quiz remains available in pre-lab content and its score
    # is still reported via check-gate; it simply no longer stops execution.
    return None


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

    # Live-session rules: enrollment + mode matrix + pre-lab gate, enforced
    # server-side so a modified client can't bypass them (D2 / Stage 0).
    blocked = _enforce_live_session_rules(session_id)
    if blocked:
        return blocked

    # For single execution, use main file
    primary_code = code_files.get('main', next(iter(code_files.values()), ''))

    # ── Execute in the Docker sandbox ─────────────────────────────────────
    result, error = _run_docker(primary_code, spec['id'], stdin, g.user_id, packages=packages, extra_files=code_files)
    if error:
        return error

    # ── Test Cases Evaluation (Live Lab & Grading) ────────────────────────
    tc_results = []
    tc_passed = 0
    tc_total = 0
    if experiment_id:
        from app.models.experiment import TestCase
        cases = TestCase.query.filter_by(experiment_id=experiment_id).all()
        if cases:
            tc_total = len(cases)
            for tc in cases:
                tc_in = tc.input_data or ''
                c_res, _ = _run_docker(primary_code, spec['id'], tc_in, g.user_id, packages=packages)
                actual_stdout = c_res.get('stdout') or '' if c_res else ''
                ok = bool(c_res and c_res.get('status_id') == 3 and _norm_stdout(actual_stdout) == _norm_stdout(tc.expected_output))
                if ok:
                    tc_passed += 1
                tc_results.append({
                    'test_case_id': tc.id,
                    'passed': ok,
                    'execution_time_ms': int(c_res.get('time_ms') or 0) if c_res else 0,
                    'is_hidden': bool(tc.is_hidden),
                    'input': tc_in if not tc.is_hidden else None,
                    'expected': tc.expected_output if not tc.is_hidden else None,
                    'actual': actual_stdout if not tc.is_hidden else None,
                    'status': c_res.get('status') if c_res else 'error'
                })
            result['test_cases_passed'] = tc_passed
            result['test_cases_total'] = tc_total
            result['test_results'] = [
                {
                    'test_case_id': r['test_case_id'],
                    'passed': r['passed'],
                    'is_hidden': r['is_hidden'],
                    'input': r['input'],
                    'expected': r['expected'],
                    'actual': r['actual'],
                    'status': r['status'],
                }
                for r in tc_results
            ]

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
            test_cases_passed=tc_passed if tc_total > 0 else result.get('test_cases_passed', 0),
            test_cases_total=tc_total if tc_total > 0 else result.get('test_cases_total', 0),
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
        db.session.flush()

        # Save TestCaseResult rows
        if tc_results:
            from app.models.conductor import TestCaseResult, CheckpointProgress, Checkpoint
            for row in tc_results:
                db.session.add(TestCaseResult(
                    attempt_id=attempt.id,
                    test_case_id=row['test_case_id'],
                    passed=row['passed'],
                    execution_time_ms=row['execution_time_ms'],
                ))

            # Auto-verify checkpoints if mapped test cases all passed
            if session_id:
                passed_ids = {r['test_case_id'] for r in tc_results if r['passed']}
                checkpoints = Checkpoint.query.filter_by(experiment_id=experiment_id).all()
                newly_verified = []
                for cp in checkpoints:
                    mapped = set(cp.test_case_ids or [])
                    is_cp_verified = (mapped.issubset(passed_ids) if mapped else (tc_total > 0 and tc_passed == tc_total))
                    if is_cp_verified:
                        prog = CheckpointProgress.query.filter_by(
                            session_id=session_id, student_id=g.user_id, checkpoint_id=cp.id).first()
                        if not prog:
                            prog = CheckpointProgress(
                                session_id=session_id, student_id=g.user_id, checkpoint_id=cp.id)
                            db.session.add(prog)
                        if prog.status in ('pending', 'claimed', 'failed'):
                            prog.status = 'verified'
                            prog.passed_at = datetime.utcnow()
                            prog.last_signal_at = datetime.utcnow()
                            newly_verified.append(cp.id)

                if newly_verified:
                    try:
                        from app.extensions import socketio as _sio
                        for cp_id in newly_verified:
                            payload = {'checkpoint_id': cp_id, 'student_id': g.user_id, 'status': 'verified'}
                            _sio.emit('checkpoint_update', payload, room=f"session_{session_id}_instructor")
                            _sio.emit('my_checkpoint_update', payload, room=f"student_{g.user_id}")
                    except Exception:
                        pass

        # Save code version on every run
        _save_code_version(g.user_id, experiment_id, session_id, code_files, 'on_run')
        db.session.commit()

        if is_submit:
            result['quality_metrics'] = quality_metrics
            result['quality_score']   = quality_score

            # ── Real Data Collection: Persist Grade & Concept Mastery ──
            try:
                passed_cases = attempt.test_cases_passed or 0
                total_cases = attempt.test_cases_total or 0
                if total_cases > 0:
                    grade_val = round((passed_cases / total_cases) * 100.0, 1)
                else:
                    grade_val = float(quality_score) if quality_score is not None else (100.0 if result.get('status') == 'success' else 0.0)

                from app.services.grading_service import sync_student_experiment_grade
                sync_student_experiment_grade(
                    student_id=g.user_id,
                    experiment_id=experiment_id,
                    session_id=session_id,
                )

                # Update Concept Mastery
                from app.models.experiment import Experiment
                from app.ml.knowledge_tracing import update_concept_mastery
                exp = Experiment.query.get(experiment_id)
                if exp:
                    inst_id = getattr(g, 'institution_id', None)
                    if not inst_id:
                        from app.models.user import User
                        u = User.query.get(g.user_id)
                        inst_id = u.institution_id if u else None

                    if inst_id:
                        tags = list(exp.concept_tags or [])
                        if not tags:
                            if exp.title:
                                tags.append(exp.title)
                            if exp.subject and exp.subject.name:
                                tags.append(exp.subject.name)
                        if not tags:
                            tags = ['Programming Fundamentals']

                        is_passed = (passed_cases == total_cases and total_cases > 0) if total_cases > 0 else (grade_val >= 50.0)
                        update_concept_mastery(
                            student_id=g.user_id,
                            institution_id=inst_id,
                            concept_tags=tags,
                            result={
                                'passed': is_passed,
                                'score_pct': grade_val / 100.0,
                                'attempt_count': attempt.attempt_number or 1,
                                'hints_used': 0,
                                'difficulty': exp.difficulty_level or 1,
                            }
                        )
            except Exception as exc:
                current_app.logger.warning(f"[execution] Grade / Mastery persistence failed (non-fatal): {exc}")
                try:
                    db.session.rollback()
                except Exception:
                    pass

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
        newly_verified = []
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
                    # D-S1 relay: execution verdicts update the SPARK grid live —
                    # otherwise the instructor only sees verified on manual refresh.
                    newly_verified.append(cp.id)

        if newly_verified:
            try:
                from app.extensions import socketio as _sio
                for cp_id in newly_verified:
                    payload = {'checkpoint_id': cp_id, 'student_id': student_id, 'status': 'verified'}
                    _sio.emit('checkpoint_update', payload, room=f"session_{session_id}_instructor")
                    _sio.emit('my_checkpoint_update', payload, room=f"student_{student_id}")
            except Exception:
                pass   # relay is best-effort; persistence already committed

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
