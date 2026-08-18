"""
backend/app/exec_engine/routes_v2.py
Health endpoint for the Docker execution engine.

GET /api/execution/engine-health — Docker daemon status, image presence,
    per-language routing, and active/orphan container counts.

Code execution itself is served by /api/execution/playground and /run
(app/execution/routes.py); this module only exposes engine diagnostics.
"""
import subprocess
from flask import Blueprint, jsonify, current_app
from app.auth.utils import require_auth

exec_v2_bp = Blueprint('exec_v2', __name__)

# Images backing the Docker language specs — used for the health endpoint
_DOCKER_IMAGES = [
    'python:3.14-slim',
    'gcc:16',
    'r-base:latest',
    'nexlab/csharp:10',
    'nexlab/jvm:25',
    'nexlab/node:24',
    'nexlab/shell:1',
]


@exec_v2_bp.route('/engine-health', methods=['GET'])
@require_auth
def engine_health():
    """
    Reports Docker engine availability, image presence, per-language routing,
    and active/orphan container counts. Consumed by the admin monitoring page.
    """
    docker_bin = current_app.config.get('DOCKER_BIN', 'docker')
    enabled    = current_app.config.get('DOCKER_RUNNER_ENABLED', False)
    overrides  = current_app.config.get('EXEC_ENGINE_OVERRIDES', '')

    # ── Docker daemon ────────────────────────────────────────────────────────
    daemon_ok      = False
    daemon_version = ''
    daemon_error   = ''
    try:
        r = subprocess.run(
            [docker_bin, 'version', '--format', '{{.Server.Version}}'],
            capture_output=True, timeout=5,
        )
        if r.returncode == 0:
            daemon_ok      = True
            daemon_version = r.stdout.decode('utf-8', errors='replace').strip()
        else:
            daemon_error = r.stderr.decode('utf-8', errors='replace').strip()
    except Exception as exc:
        daemon_error = str(exc)

    # ── Image presence ───────────────────────────────────────────────────────
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

    # ── Active + orphan containers ───────────────────────────────────────────
    active_containers = 0
    orphan_containers = 0
    try:
        # Running containers
        r = subprocess.run(
            [docker_bin, 'ps', '-q', '--filter', 'label=nexlab.run=1'],
            capture_output=True, timeout=5,
        )
        active_containers = len([x for x in r.stdout.decode().split() if x])
        # All (including exited) = orphans
        r2 = subprocess.run(
            [docker_bin, 'ps', '-a', '-q', '--filter', 'label=nexlab.run=1'],
            capture_output=True, timeout=5,
        )
        orphan_containers = len([x for x in r2.stdout.decode().split() if x])
    except Exception:
        pass

    # ── Per-language routing table (docker / browser only) ───────────────────
    from app.execution.languages import LANGUAGES, resolve_engine
    routing = []
    for spec in LANGUAGES:
        routing.append({
            'id':      spec['id'],
            'label':   spec['label'],
            'version': spec['version'],
            'engine':  resolve_engine(spec['id'], enabled, overrides),
            'group':   spec['group'],
        })
    docker_count = sum(1 for r in routing if r['engine'] == 'docker')

    missing = [img for img, present in images.items() if not present]
    ready   = daemon_ok and not missing

    return jsonify({
        # Engine status
        'enabled':           enabled,
        'daemon_ok':         daemon_ok,
        'daemon_version':    daemon_version,
        'daemon_error':      daemon_error,
        'ready':             ready,
        # Images
        'images':            images,
        'missing_images':    missing,
        'action':            'run backend/docker/images/prepull.sh' if missing else None,
        # Container counts
        'active_containers': active_containers,
        'orphan_containers': orphan_containers,
        # Routing
        'routing':           routing,
        'docker_languages':  docker_count,
        'overrides':         overrides,
    }), 200
