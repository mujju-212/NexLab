import base64
import time
import requests
from flask import Blueprint, request, jsonify, current_app, g
from app.auth.utils import require_auth, require_role
from app.extensions import db, limiter
from app.models.submission import CodeVersion, CodeAttempt
from app.ml.code_quality import analyze_code_quality, quality_to_score
from datetime import datetime

execution_bp = Blueprint('execution', __name__)

LANGUAGE_IDS = {
    'python':     71,
    'cpp':        54,
    'c':          49,
    'java':       62,
    'javascript': 63,
    'js':         63,
    'r':          80,
    'octave':     66,
    'matlab':     66,
}


@execution_bp.route('/run', methods=['POST'])
@require_auth
@limiter.limit("10 per minute")   # prevent Run-button spam
def run_code():
    """
    Execute student code via Judge0.
    Stores every attempt (even failed/non-compiling) per srcML-DKT paper.
    """
    data          = request.get_json()
    code_files    = data.get('files', {})       # {"main": "code..."} or multi-file
    language      = data.get('language', 'python')
    stdin         = data.get('stdin', '')
    experiment_id = data.get('experiment_id')
    session_id    = data.get('session_id')
    is_submit     = data.get('is_final_submission', False)

    if not code_files or language not in LANGUAGE_IDS:
        return jsonify({'error': 'Invalid code or language'}), 400

    # For single execution, use main file
    primary_code = code_files.get('main', next(iter(code_files.values()), ''))

    # ── Execute via Judge0 ────────────────────────────────────────────────
    mode = current_app.config['JUDGE0_MODE']
    if mode == 'polling':
        result = _run_polling(primary_code, language, stdin)
    else:
        result = _run_webhook(primary_code, language, stdin, g.user_id)
        return jsonify({'status': 'pending', 'message': 'Executing...'}), 202

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
            execution_time_ms=int((result.get('time') or 0) * 1000),
            memory_used_kb=result.get('memory'),
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


@execution_bp.route('/callback', methods=['PUT'])
def judge0_callback():
    """Judge0 webhook callback (production mode)"""
    # Verify webhook secret
    secret = request.headers.get('Authorization', '')
    if secret != current_app.config.get('JUDGE0_WEBHOOK_SECRET'):
        return '', 403

    result = request.get_json()
    student_id = result.get('metadata', {}).get('student_id')
    if student_id:
        from app.extensions import socketio
        socketio.emit('code_result', result, room=f"student_{student_id}")
    return '', 200


# ── Internal helpers ──────────────────────────────────────────────────────────

def _run_polling(code: str, language: str, stdin: str) -> dict:
    judge0_url = current_app.config['JUDGE0_URL']
    time_limit = current_app.config['CODE_TIME_LIMIT_SEC']
    mem_limit  = current_app.config['CODE_MEMORY_LIMIT_KB']

    # Submit
    resp = requests.post(f"{judge0_url}/submissions", json={
        'source_code': code,
        'language_id': LANGUAGE_IDS[language],
        'stdin':       stdin,
        'cpu_time_limit': time_limit,
        'memory_limit':   mem_limit,
    }, timeout=5)
    resp.raise_for_status()
    token = resp.json()['token']

    # Poll (max 10s)
    for _ in range(20):
        time.sleep(0.5)
        r = requests.get(f"{judge0_url}/submissions/{token}",
                         params={'fields': 'status,stdout,stderr,compile_output,time,memory'},
                         timeout=5)
        data = r.json()
        if data['status']['id'] not in (1, 2):  # not Queued/Processing
            return {
                'status':          data['status']['description'],
                'stdout':          data.get('stdout', ''),
                'stderr':          data.get('stderr', ''),
                'compile_output':  data.get('compile_output', ''),
                'time':            data.get('time', 0),
                'memory':          data.get('memory', 0),
            }
    return {'status': 'timeout', 'stdout': '', 'stderr': 'Execution timed out.'}


@execution_bp.route('/run-dev', methods=['POST', 'OPTIONS'])
def run_code_dev():
    """
    DEV-ONLY: Execute code without auth — for HTML test UI.
    Runs Judge0 calls inside eventlet.tpool to avoid monkey-patching
    interference with the requests library under eventlet/socketio.
    """
    if request.method == 'OPTIONS':
        return '', 204

    data     = request.get_json()
    code     = data.get('code', '')
    language = data.get('language', 'python').lower()
    stdin    = data.get('stdin', '')

    lang_id = LANGUAGE_IDS.get(language)
    if not lang_id:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not code.strip():
        return jsonify({'error': 'No code provided'}), 400

    judge0_url = current_app.config.get('JUDGE0_URL', 'http://localhost:2358')

    def _call_judge0():
        """Run in a real OS thread via tpool — bypasses eventlet socket patching."""
        try:
            # Submit async (no wait=true — avoids eventlet long-poll issues)
            r = requests.post(f"{judge0_url}/submissions",
                json={'source_code': code, 'language_id': lang_id, 'stdin': stdin},
                timeout=10)
            r.raise_for_status()
            token = r.json().get('token')
            if not token:
                return {'error': 'No token from Judge0'}

            # Poll until done (max 30s)
            import time as _time
            for _ in range(60):
                _time.sleep(0.5)
                pr = requests.get(f"{judge0_url}/submissions/{token}", timeout=10)
                pd = pr.json()
                sid = (pd.get('status') or {}).get('id')
                if sid and sid not in (1, 2):   # not In Queue / Processing
                    return pd
            return {'error': 'Execution timed out after 30s', 'status': {'id': None, 'description': 'Timeout'}}

        except Exception as e:
            return {'error': str(e)}

    # Run blocking I/O in a real thread — critical under eventlet
    try:
        import eventlet
        d = eventlet.tpool.execute(_call_judge0)
    except Exception:
        # Fallback if tpool unavailable
        d = _call_judge0()

    if 'error' in d and 'status' not in d:
        return jsonify({'error': d['error']}), 502

    status_id   = (d.get('status') or {}).get('id')
    status_desc = (d.get('status') or {}).get('description', 'Unknown')

    return jsonify({
        'status':         status_desc,
        'status_id':      status_id,
        'stdout':         d.get('stdout')  or '',
        'stderr':         d.get('stderr')  or '',
        'compile_output': d.get('compile_output') or '',
        'time':           d.get('time'),
        'memory':         d.get('memory'),
        'language':       language,
        'lang_id':        lang_id,
    }), 200


def _run_webhook(code: str, language: str, stdin: str, student_id: str) -> dict:
    judge0_url  = current_app.config['JUDGE0_URL']
    callback    = f"{current_app.config['BASE_URL']}/api/execution/callback"
    resp = requests.post(f"{judge0_url}/submissions", json={
        'source_code': code,
        'language_id': LANGUAGE_IDS[language],
        'stdin':       stdin,
        'callback_url': callback,
        'metadata':    {'student_id': student_id},
    }, timeout=5)
    return {'status': 'pending', 'token': resp.json().get('token')}


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
