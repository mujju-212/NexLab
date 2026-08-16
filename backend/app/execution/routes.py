import base64
import time
import requests
from flask import Blueprint, request, jsonify, current_app, g
from app.auth.utils import require_auth, require_role
from app.extensions import db, limiter
from app.models.submission import CodeVersion, CodeAttempt
from app.ml.code_quality import analyze_code_quality, quality_to_score
from app.execution.languages import (
    LANGUAGE_IDS as _LANGUAGE_IDS,
    GROUP_ORDER,
    catalog,
    resolve as resolve_language,
)
from datetime import datetime

execution_bp = Blueprint('execution', __name__)

# ── Judge0 safe value parsers ─────────────────────────────────────────────────
# Judge0 sometimes returns time as a repeated string e.g. "0.0860.086"
# This happens when polling returns the value multiple times concatenated.
# We take the FIRST valid float in the string.
def _safe_float(val, default=0.0):
    """Parse first float from a possibly-repeated string like '0.0860.086'"""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        s = str(val)
        # Find first valid float prefix
        import re
        m = re.match(r'[-+]?\d*\.?\d+', s)
        return float(m.group()) if m else default

def _safe_int(val, default=0):
    """Parse first int from a possibly-repeated string"""
    return int(_safe_float(val, default))

LANGUAGE_IDS = _LANGUAGE_IDS


# ── Blocking I/O under whichever server is actually running ───────────────────
def _run_blocking(fn):
    """
    Call `fn` (blocking HTTP + sleeps) in a way that suits the live server.

    Under eventlet the sockets are monkey-patched, so blocking `requests`
    would stall the whole hub — the work has to go to a real OS thread via
    `eventlet.tpool`. Under the threading server (what `socketio.run` uses
    here, see `async_mode='threading'`) there is no hub at all: `tpool` then
    deadlocks as soon as two request threads reach it together, because they
    each try to drive eventlet's shared completion pipe from their own hub.
    A plain call is already on a real thread there, so just make it.
    """
    try:
        from eventlet.patcher import is_monkey_patched
    except ImportError:
        return fn()                      # eventlet not installed at all
    if not is_monkey_patched('socket'):
        return fn()                      # threading / plain WSGI server
    from eventlet import tpool           # `import eventlet` does not bind this
    return tpool.execute(fn)


# ── Playground guard rails ────────────────────────────────────────────────────
MAX_CODE_CHARS  = 60_000    # ~1.5k lines — generous for a lab exercise
MAX_STDIN_CHARS = 20_000
POLL_ATTEMPTS   = 60        # 60 × 0.5s = 30s ceiling
POLL_INTERVAL   = 0.5


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
            execution_time_ms=_safe_int((result.get('time') or 0), 0) * 1000,
            memory_used_kb=_safe_int(result.get('memory'), 0) or None,
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
    Judge0 calls go through `_run_blocking` so they behave under both the
    threading server and an eventlet one.
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
        """Submit to Judge0 and poll — blocking, so it runs via _run_blocking."""
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

    d = _run_blocking(_call_judge0)

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
    wall time and peak memory.
    """
    data     = request.get_json(silent=True) or {}
    code     = data.get('code') or ''
    stdin    = data.get('stdin') or ''
    language = data.get('language') or 'python'

    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if not code.strip():
        return jsonify({'error': 'Nothing to run — the editor is empty.'}), 400
    if len(code) > MAX_CODE_CHARS:
        return jsonify({'error': f'Source is too large (limit {MAX_CODE_CHARS:,} characters).'}), 413
    if len(stdin) > MAX_STDIN_CHARS:
        return jsonify({'error': f'Input is too large (limit {MAX_STDIN_CHARS:,} characters).'}), 413

    result = _judge0_execute(code, spec['judge0_id'], stdin)
    if '_error' in result:
        return jsonify({'error': result['_error']}), 502

    result['language'] = spec['id']
    result['label']    = f"{spec['label']} {spec['version']}"
    return jsonify(result), 200


def _b64(text: str) -> str:
    return base64.b64encode((text or '').encode('utf-8')).decode('ascii')


def _unb64(value) -> str:
    """Decode a base64 field from Judge0; tolerate nulls and odd bytes."""
    if not value:
        return ''
    try:
        return base64.b64decode(value).decode('utf-8', errors='replace')
    except Exception:
        return str(value)


def _judge0_execute(code: str, lang_id: int, stdin: str) -> dict:
    """
    Submit to Judge0 and poll until the verdict is in.

    Uses base64 transport so unicode and binary-ish output survive the round
    trip, and hands the blocking HTTP calls to `_run_blocking` so they work
    under both the threading server and eventlet.
    Returns {'_error': msg} when the engine itself is unreachable.
    """
    judge0_url = current_app.config.get('JUDGE0_URL', 'http://localhost:2358')
    cpu_limit  = current_app.config.get('CODE_TIME_LIMIT_SEC', 10)
    mem_limit  = current_app.config.get('CODE_MEMORY_LIMIT_KB', 262144)
    api_key    = current_app.config.get('JUDGE0_API_KEY', '')
    headers    = {'X-Auth-Token': api_key} if api_key else {}

    FIELDS = ('status,stdout,stderr,compile_output,message,'
              'exit_code,exit_signal,time,memory')

    def _call():
        import time as _time
        try:
            r = requests.post(
                f"{judge0_url}/submissions",
                params={'base64_encoded': 'true'},
                headers=headers,
                json={
                    'source_code':     _b64(code),
                    'language_id':     lang_id,
                    'stdin':           _b64(stdin),
                    'cpu_time_limit':  cpu_limit,
                    'memory_limit':    mem_limit,
                },
                timeout=10,
            )
            r.raise_for_status()
            token = r.json().get('token')
            if not token:
                return {'_error': 'Execution engine did not return a submission token.'}

            for _ in range(POLL_ATTEMPTS):
                _time.sleep(POLL_INTERVAL)
                pr = requests.get(
                    f"{judge0_url}/submissions/{token}",
                    params={'base64_encoded': 'true', 'fields': FIELDS},
                    headers=headers,
                    timeout=10,
                )
                pr.raise_for_status()
                payload   = pr.json()
                status_id = (payload.get('status') or {}).get('id')
                if status_id and status_id not in (1, 2):   # not Queued / Processing
                    return payload
            return {'_error': 'Execution timed out waiting for the engine (30s).'}

        except requests.RequestException as exc:
            return {'_error': f'Cannot reach the code execution engine: {exc}'}

    raw = _run_blocking(_call)

    if '_error' in raw:
        return raw
    return _shape_result(raw)


# Judge0 status ids that mean "the program itself blew up" rather than
# "the platform failed" — used to pick the console banner on the client.
_COMPILE_ERROR_ID = 6
_RUNTIME_ERROR_IDS = frozenset({7, 8, 9, 10, 11, 12})


def _shape_result(raw: dict) -> dict:
    """Flatten a Judge0 submission payload into the compiler's console shape."""
    status      = raw.get('status') or {}
    status_id   = status.get('id')
    time_sec    = _safe_float(raw.get('time'), 0.0)

    return {
        'status':          status.get('description') or 'Unknown',
        'status_id':       status_id,
        'success':         status_id == 3,
        'is_compile_error': status_id == _COMPILE_ERROR_ID,
        'is_runtime_error': status_id in _RUNTIME_ERROR_IDS,
        'stdout':          _unb64(raw.get('stdout')),
        'stderr':          _unb64(raw.get('stderr')),
        'compile_output':  _unb64(raw.get('compile_output')),
        'message':         _unb64(raw.get('message')),
        'exit_code':       raw.get('exit_code'),
        'exit_signal':     raw.get('exit_signal'),
        'time_ms':         round(time_sec * 1000, 1),
        'memory_kb':       _safe_int(raw.get('memory'), 0),
    }
