"""
backend/app/exec_engine/runner.py
Container lifecycle using docker run with a bind-mounted work directory.

Approach: write all source files to a temp dir on the host, then bind-mount
that dir into the container as /work. This avoids `docker cp` entirely and
works correctly on Docker Desktop for Windows.

Every run is one throwaway container (--rm).
The reaper exists only for the edge case where the Python process is killed
between `docker run` starting and the container exiting.
"""
import json
import os
import subprocess
import tempfile
import threading
import logging
from pathlib import Path

from app.exec_engine.sandbox import build_flags
from app.exec_engine.specs import get as get_spec
from app.exec_engine.verdict import from_meta, internal_error

log = logging.getLogger(__name__)

# Location of wrapper.sh (same package directory)
_WRAPPER_SH = Path(__file__).parent / 'wrapper.sh'

# Per-stream output cap (bytes) — read from config on first call
_OUTPUT_CAP_BYTES = None


def _get_output_cap() -> int:
    global _OUTPUT_CAP_BYTES
    if _OUTPUT_CAP_BYTES is None:
        try:
            from flask import current_app
            _OUTPUT_CAP_BYTES = current_app.config.get('EXEC_OUTPUT_CAP_KB', 256) * 1024
        except RuntimeError:
            _OUTPUT_CAP_BYTES = 256 * 1024
    return _OUTPUT_CAP_BYTES


def run(code: str, language: str, stdin: str = '') -> dict:
    """
    Execute `code` in the language's Docker container.
    Returns the same dict shape as _shape_result() in execution/routes.py.
    """
    spec = get_spec(language)
    if not spec:
        return internal_error(f"Unsupported language for Docker engine: {language}") | _empty_io()

    if spec['engine'] == 'browser':
        return internal_error("Browser languages are rendered client-side.") | _empty_io()

    try:
        from flask import current_app
        cfg = current_app.config
        docker_bin      = cfg.get('DOCKER_BIN', 'docker')
        memory_mb       = cfg.get('EXEC_MEMORY_MB', 256)
        compile_timeout = spec['compile_timeout'] or cfg.get('EXEC_COMPILE_TIMEOUT_SEC', 10)
        run_timeout     = cfg.get('EXEC_RUN_TIMEOUT_SEC', 5)
    except RuntimeError:
        docker_bin      = 'docker'
        memory_mb       = 256
        compile_timeout = 10
        run_timeout     = 5

    # Hard deadline = compile + run + 3 s grace
    hard_deadline = compile_timeout + run_timeout + 3

    with tempfile.TemporaryDirectory(prefix='nexlab_run_') as tmpdir:
        tmpdir_path = Path(tmpdir)

        # Write source, stdin, wrapper into the temp dir
        (tmpdir_path / spec['filename']).write_text(code, encoding='utf-8')
        (tmpdir_path / 'stdin.txt').write_text(stdin or '', encoding='utf-8')

        # wrapper.sh — normalise to Unix line endings
        wrapper_bytes = _WRAPPER_SH.read_bytes().replace(b'\r\n', b'\n')
        (tmpdir_path / 'wrapper.sh').write_bytes(wrapper_bytes)

        # Build env vars for the wrapper (COMPILE_CMD, RUN_CMD)
        env = {}
        if spec['compile_cmd']:
            env['COMPILE_CMD'] = spec['compile_cmd']
        env['RUN_CMD'] = spec['run_cmd']

        # Get security flags (no tmpfs since we're bind-mounting now)
        flags = build_flags(spec['image'], memory_mb, env)

        # Bind-mount the temp dir as /work (read-write so wrapper can write meta.json)
        # On Docker Desktop for Windows, forward slashes work in volume paths.
        host_path = str(tmpdir_path).replace('\\', '/')
        volume_flag = ['-v', f'{host_path}:/work']

        # --rm means Docker removes the container on exit — cleaner than manual rm
        # We still label it nexlab.run=1 so the reaper catches any orphans
        run_flags = ['run', '--rm'] + volume_flag + flags

        container_id = None
        try:
            stdout_buf, stderr_buf, timed_out, container_id = _docker_run(
                docker_bin, run_flags, spec['image'], hard_deadline
            )

            # Determine timeout phase from wrapper's phase.txt
            timeout_phase = 'run'
            if timed_out:
                phase_file = tmpdir_path / 'phase.txt'
                if phase_file.exists():
                    timeout_phase = phase_file.read_text().strip() or 'run'

            # OOMKilled — only inspectable if container still exists (--rm removes it)
            # We can't inspect after --rm exits, so rely on exit code 137
            oom_killed = False  # handled via exit code below if needed

            # Read meta.json written by wrapper.sh
            meta = {}
            meta_file = tmpdir_path / 'meta.json'
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text())
                except Exception:
                    pass

            # Read compile output
            compile_out = ''
            compile_file = tmpdir_path / 'compile.txt'
            if compile_file.exists():
                compile_out = compile_file.read_text(encoding='utf-8', errors='replace')

            verdict = from_meta(meta, oom_killed=oom_killed,
                                 timed_out=timed_out, timeout_phase=timeout_phase)

            cap       = _get_output_cap()
            stdout    = _decode_truncate(stdout_buf, cap)
            stderr    = _decode_truncate(stderr_buf, cap)
            truncated = (len(stdout_buf) > cap or len(stderr_buf) > cap)

            return verdict | {
                'stdout':          stdout,
                'stderr':          stderr,
                'compile_output':  compile_out,
                'time_ms':         int(meta.get('run_ms', 0)),
                'compile_ms':      int(meta.get('compile_ms', 0)),
                'memory_kb':       _peak_kb(meta.get('peak_bytes')),
                'truncated':       truncated,
                'engine':          'docker',
                'image':           spec['image'],
            }

        except _DockerError as exc:
            log.error("Docker engine error for %s: %s", language, exc)
            return internal_error(str(exc)) | _empty_io()

        finally:
            # --rm containers clean themselves. If container_id is set, it was
            # a Popen that was killed (timeout) — try to force-remove it.
            if container_id:
                try:
                    subprocess.run([docker_bin, 'rm', '-f', container_id],
                                   capture_output=True, timeout=10)
                except Exception:
                    pass


# ── Internals ─────────────────────────────────────────────────────────────────

class _DockerError(RuntimeError):
    pass


def _docker(docker_bin: str, args: list[str], timeout: int) -> str:
    """Run a docker sub-command synchronously. Raises _DockerError on failure."""
    try:
        r = subprocess.run(
            [docker_bin] + args,
            capture_output=True,
            timeout=timeout,
        )
        if r.returncode != 0:
            raise _DockerError(
                f"docker {args[0]} failed (rc={r.returncode}): "
                f"{r.stderr.decode('utf-8', errors='replace').strip()}"
            )
        return r.stdout.decode('utf-8', errors='replace')
    except subprocess.TimeoutExpired:
        raise _DockerError(f"docker {args[0]} timed out after {timeout}s")
    except FileNotFoundError:
        raise _DockerError("Docker binary not found — is Docker Desktop running?")


def _docker_run(docker_bin: str, run_flags: list[str], image: str, deadline: int):
    """
    Launch `docker run ...` and stream stdout+stderr concurrently.
    Returns (stdout_bytes, stderr_bytes, timed_out, container_id_or_None).
    container_id is only returned if we killed the process (timeout case),
    so the caller can try to force-remove the container.
    """
    cmd = [docker_bin] + run_flags + [image, 'sh', '/work/wrapper.sh']
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
        )
    except FileNotFoundError:
        raise _DockerError("Docker binary not found — is Docker Desktop running?")

    stdout_chunks: list[bytes] = []
    stderr_chunks: list[bytes] = []

    def _read(pipe, buf):
        cap = _get_output_cap()
        total = 0
        for chunk in iter(lambda: pipe.read(4096), b''):
            total += len(chunk)
            if total <= cap + 4096:
                buf.append(chunk)
        pipe.close()

    t_out = threading.Thread(target=_read, args=(proc.stdout, stdout_chunks), daemon=True)
    t_err = threading.Thread(target=_read, args=(proc.stderr, stderr_chunks), daemon=True)
    t_out.start()
    t_err.start()

    timed_out = False
    container_id = None
    try:
        proc.wait(timeout=deadline)
    except subprocess.TimeoutExpired:
        timed_out = True
        proc.kill()
        # Try to extract the container name from stderr (docker prints it on start)
        # or let the reaper clean it up
        container_id = _find_container_by_label(docker_bin)

    t_out.join(timeout=5)
    t_err.join(timeout=5)

    if timed_out and container_id:
        try:
            subprocess.run([docker_bin, 'kill', container_id],
                           capture_output=True, timeout=5)
        except Exception:
            pass

    return b''.join(stdout_chunks), b''.join(stderr_chunks), timed_out, container_id


def _find_container_by_label(docker_bin: str) -> str | None:
    """Find any running nexlab container (used on timeout to kill it)."""
    try:
        r = subprocess.run(
            [docker_bin, 'ps', '-q', '--filter', 'label=nexlab.run=1'],
            capture_output=True, timeout=5,
        )
        ids = [x for x in r.stdout.decode().split() if x]
        return ids[0] if ids else None
    except Exception:
        return None


def _decode_truncate(raw: bytes, cap: int) -> str:
    text = raw[:cap].decode('utf-8', errors='replace')
    if len(raw) > cap:
        text += f"\n... output truncated at {cap // 1024} KB ..."
    return text


def _peak_kb(peak_bytes) -> int | None:
    if peak_bytes is None or peak_bytes == '':
        return None
    try:
        return int(peak_bytes) // 1024
    except (ValueError, TypeError):
        return None


def _empty_io() -> dict:
    return {
        'stdout': '', 'stderr': '', 'compile_output': '',
        'time_ms': 0, 'compile_ms': 0, 'memory_kb': None,
        'truncated': False, 'engine': 'docker', 'image': '',
    }
