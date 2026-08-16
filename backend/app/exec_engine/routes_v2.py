"""
backend/app/exec_engine/routes_v2.py
New endpoints for the Docker execution engine (v2).

POST /api/execution/playground-v2   — execute code, identical response shape to /playground
GET  /api/execution/engine-health   — reports which images are present

Judge0's /playground is NOT touched. This route is alongside it, behind
DOCKER_RUNNER_ENABLED, until cutover (§14.3 step 5).
"""
import subprocess
from flask import Blueprint, request, jsonify, current_app, g
from app.auth.utils import require_auth
from app.execution.languages import resolve_engine

exec_v2_bp = Blueprint('exec_v2', __name__)

# Languages that have Docker specs — used for the health endpoint
_DOCKER_IMAGES = [
    'python:3.14-slim',
    'gcc:16',
    'mcr.microsoft.com/dotnet/sdk:10.0',
    'r-base:latest',
    'nexlab/jvm:25',
    'nexlab/node:24',
    'nexlab/shell:1',
]


@exec_v2_bp.route('/playground-v2', methods=['POST', 'OPTIONS'])
@require_auth
def playground_v2():
    """
    Execute arbitrary code via Docker sandbox.
    Same request/response shape as /playground so the frontend can switch
    by changing one URL string.
    """
    if request.method == 'OPTIONS':
        return '', 204

    from app.exec_engine.specs import get as get_spec
    from app.exec_engine import runner
    from app.exec_engine import admission as adm

    data     = request.get_json(silent=True) or {}
    code     = (data.get('code') or '').strip()
    stdin    = data.get('stdin') or ''
    language = data.get('language') or 'python'

    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({
            'error': 'Docker execution engine is not enabled on this server.'
        }), 503

    spec = get_spec(language)
    if not spec or spec['engine'] == 'browser':
        return jsonify({'error': f'Unsupported language for Docker engine: {language}'}), 400

    if not code:
        return jsonify({'error': 'Nothing to run — the editor is empty.'}), 400

    max_chars = current_app.config.get('MAX_CODE_CHARS', 60_000)
    if len(code) > max_chars:
        return jsonify({'error': f'Source is too large (limit {max_chars:,} characters).'}), 413

    user_id = getattr(g, 'user_id', 'anonymous')
    try:
        with adm.get().acquire(user_id):
            result = runner.run(code=code, language=language, stdin=stdin)
    except adm.AdmissionError as exc:
        resp = jsonify({'error': str(exc)})
        resp.headers['Retry-After'] = str(exc.retry_after)
        return resp, 429

    return jsonify(result), 200


@exec_v2_bp.route('/engine-health', methods=['GET'])
@require_auth
def engine_health():
    """
    Reports Docker engine availability and which images are present.
    Used by /system_info dashboards and the cutover checklist.
    """
    docker_bin = current_app.config.get('DOCKER_BIN', 'docker')
    enabled    = current_app.config.get('DOCKER_RUNNER_ENABLED', False)

    # Check daemon
    daemon_ok = False
    daemon_error = ''
    try:
        r = subprocess.run(
            [docker_bin, 'version', '--format', '{{.Server.Version}}'],
            capture_output=True, timeout=5,
        )
        if r.returncode == 0:
            daemon_ok = True
        else:
            daemon_error = r.stderr.decode('utf-8', errors='replace').strip()
    except Exception as exc:
        daemon_error = str(exc)

    # Check images
    images = {}
    for img in _DOCKER_IMAGES:
        try:
            r = subprocess.run(
                [docker_bin, 'image', 'inspect', '--format', '{{.Id}}', img],
                capture_output=True, timeout=5,
            )
            images[img] = r.returncode == 0
        except Exception:
            images[img] = False

    # Orphan count
    orphans = 0
    try:
        r = subprocess.run(
            [docker_bin, 'ps', '-a', '-q', '--filter', 'label=nexlab.run=1'],
            capture_output=True, timeout=5,
        )
        orphans = len([x for x in r.stdout.decode().split() if x])
    except Exception:
        pass

    missing = [img for img, present in images.items() if not present]
    ready   = daemon_ok and not missing

    return jsonify({
        'enabled':       enabled,
        'daemon_ok':     daemon_ok,
        'daemon_error':  daemon_error,
        'images':        images,
        'missing_images': missing,
        'orphan_containers': orphans,
        'ready':         ready,
        'action':        'run backend/docker/images/prepull.sh' if missing else None,
    }), 200
