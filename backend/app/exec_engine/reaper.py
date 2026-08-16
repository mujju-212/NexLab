"""
backend/app/exec_engine/reaper.py
Background thread that sweeps orphaned nexlab containers (§12 row 15).

Containers get the label nexlab.run=1 at create time. If the app dies between
create and the finally-rm, those containers linger. The reaper finds and kills
them every EXEC_REAPER_INTERVAL_SEC seconds.
"""
import subprocess
import threading
import logging

log = logging.getLogger(__name__)

_reaper_thread: threading.Thread | None = None


def _sweep(docker_bin: str):
    """Find and remove all containers with label nexlab.run=1."""
    try:
        r = subprocess.run(
            [docker_bin, 'ps', '-a', '-q', '--filter', 'label=nexlab.run=1'],
            capture_output=True, timeout=15,
        )
        ids = r.stdout.decode().split()
        if ids:
            log.warning("Reaper: found %d orphaned container(s): %s", len(ids), ids)
            subprocess.run(
                [docker_bin, 'rm', '-f'] + ids,
                capture_output=True, timeout=30,
            )
            log.info("Reaper: removed %d orphaned container(s).", len(ids))
    except Exception as exc:
        log.error("Reaper sweep error: %s", exc)


def init_app(app):
    """Start the reaper background thread once per app instance."""
    global _reaper_thread
    if _reaper_thread is not None and _reaper_thread.is_alive():
        return   # already running

    interval   = app.config.get('EXEC_REAPER_INTERVAL_SEC', 300)
    docker_bin = app.config.get('DOCKER_BIN', 'docker')

    def _loop():
        event = threading.Event()
        while not event.wait(timeout=interval):
            _sweep(docker_bin)

    _reaper_thread = threading.Thread(target=_loop, name='nexlab-reaper', daemon=True)
    _reaper_thread.start()
    log.info("Reaper started (interval=%ds, docker=%s).", interval, docker_bin)
