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
import base64
import json
import os
import subprocess
import tempfile
import threading
import logging
import uuid
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


import re

AUTO_PACKAGE_MAP = {
    r'\bmatplotlib\b': 'matplotlib',
    r'\bpandas\b': 'pandas',
    r'\bnumpy\b': 'numpy',
    r'\bscipy\b': 'scipy',
    r'\bseaborn\b': 'seaborn',
    r'\brequests\b': 'requests',
    r'\bsklearn\b': 'scikit-learn',
    r'\bsympy\b': 'sympy',
    r'\bbs4\b|\bbeautifulsoup4\b': 'beautifulsoup4',
    r'\bPIL\b': 'Pillow',
    r'\bcv2\b': 'opencv-python',
}

def detect_packages(code: str, language: str, explicit_packages: list | str | None = None) -> list[str]:
    pkgs = []
    if explicit_packages:
        if isinstance(explicit_packages, str):
            raw = [p.strip() for p in explicit_packages.replace(',', ' ').split() if p.strip()]
        elif isinstance(explicit_packages, list):
            raw = [str(p).strip() for p in explicit_packages if str(p).strip()]
        else:
            raw = []
        for p in raw:
            if p not in pkgs:
                pkgs.append(p)

    if language == 'python':
        for pattern, pkg in AUTO_PACKAGE_MAP.items():
            if pkg not in pkgs and re.search(pattern, code):
                pkgs.append(pkg)

    return pkgs


def run(code: str, language: str, stdin: str = '', packages: list | str | None = None, extra_files: dict | None = None) -> dict:
    """
    Execute `code` in the language's Docker container.

    Returns a result dict combining the verdict fields from verdict.from_meta()
    (status_id / status / success / is_compile_error / …) with the captured
    stdout, stderr, compile_output, time_ms, compile_ms, memory_kb, truncated,
    engine and image. This is the single result shape the whole app consumes.
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
        # Compile-heavy toolchains (kotlinc, dotnet build) need far more RAM to
        # COMPILE than to run — a spec can raise the whole-container cap via
        # 'memory_mb'. Simple/interpreted languages keep the tight default.
        memory_mb       = spec.get('memory_mb') or cfg.get('EXEC_MEMORY_MB', 256)
        compile_timeout = spec['compile_timeout'] or cfg.get('EXEC_COMPILE_TIMEOUT_SEC', 10)
        run_timeout     = cfg.get('EXEC_RUN_TIMEOUT_SEC', 5)
    except RuntimeError:
        docker_bin      = 'docker'
        memory_mb       = spec.get('memory_mb') or 256
        compile_timeout = spec['compile_timeout'] or 10
        run_timeout     = 5

    pkg_list = detect_packages(code, language, packages)
    compile_cmd = spec['compile_cmd'] or ''
    allow_network = False

    PREINSTALLED_PKGS = {'matplotlib', 'numpy', 'pandas', 'scipy', 'requests', 'pillow', 'w1thermsensor'}
    if language == 'python' and pkg_list:
        needed_pkgs = [p for p in pkg_list if p.lower() not in PREINSTALLED_PKGS]
        if needed_pkgs:
            pip_cmd = f"pip install --cache-dir /pip_cache --prefer-binary --quiet --disable-pip-version-check --no-warn-script-location {' '.join(needed_pkgs)}"
            compile_cmd = f"{pip_cmd} && {compile_cmd}" if compile_cmd else pip_cmd
            allow_network = True
            compile_timeout = max(compile_timeout or 180, 180)
        else:
            pkg_list = []

    # Hard deadline = compile + run + 3 s grace
    hard_deadline = compile_timeout + run_timeout + 3

    # Ensure host persistent pip cache dir exists
    host_pip_cache_dir = (Path(__file__).parent.parent.parent / '.pip_cache').resolve()
    try:
        host_pip_cache_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(host_pip_cache_dir, 0o777)
    except Exception:
        pass

    with tempfile.TemporaryDirectory(prefix='nexlab_run_') as tmpdir:
        tmpdir_path = Path(tmpdir)

        # Make the work dir world-writable so uid 65534 (nobody) inside the
        # container can write meta.json / compile.txt back to the host mount.
        # On Windows / WSL2 this is a no-op for host security (NTFS ACLs own
        # the permissions), but it lets Linux containers honour the mode.
        try:
            os.chmod(tmpdir, 0o777)
        except OSError:
            pass  # Windows — NTFS doesn't map Unix modes, but Docker handles it

        # Write extra dataset/workspace files (e.g. CSVs, JSON, helper scripts) into /work
        if extra_files and isinstance(extra_files, dict):
            for fname, content in extra_files.items():
                if fname not in ('main', spec['filename']):
                    extra_path = tmpdir_path / fname
                    extra_path.parent.mkdir(parents=True, exist_ok=True)
                    if isinstance(content, bytes):
                        extra_path.write_bytes(content)
                    else:
                        extra_path.write_text(str(content or ''), encoding='utf-8')

        # Write source, stdin, wrapper into the temp dir
        code_to_write = code
        if language == 'python' and ('matplotlib' in code or 'matplotlib' in pkg_list):
            mpl_hook = (
                "import matplotlib\n"
                "matplotlib.use('Agg')\n"
                "import matplotlib.pyplot as plt\n"
                "_orig_show = plt.show\n"
                "def _auto_show(*args, **kwargs):\n"
                "    try:\n"
                "        plt.savefig('matplotlib_auto_plot.png', bbox_inches='tight')\n"
                "    except Exception:\n"
                "        pass\n"
                "    return _orig_show(*args, **kwargs)\n"
                "plt.show = _auto_show\n"
            )
            code_to_write = mpl_hook + "\n" + code

        (tmpdir_path / spec['filename']).write_text(code_to_write, encoding='utf-8')
        (tmpdir_path / 'stdin.txt').write_text(stdin or '', encoding='utf-8')

        # wrapper.sh — normalise to Unix line endings
        wrapper_bytes = _WRAPPER_SH.read_bytes().replace(b'\r\n', b'\n')
        (tmpdir_path / 'wrapper.sh').write_bytes(wrapper_bytes)

        # Build env vars for the wrapper (COMPILE_CMD, RUN_CMD, timeouts)
        env = {}
        if language == 'python':
            env['MPLBACKEND'] = 'Agg'
        if compile_cmd:
            env['COMPILE_CMD'] = compile_cmd
        env['RUN_CMD'] = spec['run_cmd']
        # Per-phase timeouts enforced INSIDE the container by wrapper.sh's
        # `timeout` calls, so EXEC_RUN_TIMEOUT_SEC is a real wall-clock cap
        # (not just the host-side backstop). Values are whole seconds.
        env['RUN_TIMEOUT'] = str(run_timeout)
        env['COMPILE_TIMEOUT'] = str(compile_timeout)
        if allow_network or pkg_list:
            env['PIP_CACHE_DIR'] = '/pip_cache'
        # Per-language env overrides (e.g. C# needs HOME=/tmp). Applied last so
        # a spec can override the sandbox default HOME=/work.
        env.update(spec.get('env_extra') or {})

        # Get security flags. Some languages need a writable in-memory /tmp
        # (e.g. .NET) even though the rootfs is --read-only; specs opt in via
        # a 'tmpfs' list. A few also need a higher single-file write ceiling
        # (e.g. .NET's mmap'd GC heap or package downloads) via 'fsize_bytes'.
        fsize_bytes = 67108864 if (allow_network or pkg_list) else spec.get('fsize_bytes', 8388608)
        flags = build_flags(spec['image'], memory_mb, env,
                             tmpfs=spec.get('tmpfs'),
                             fsize_bytes=fsize_bytes,
                             allow_network=allow_network)

        # Bind-mount the temp dir as /work and host .pip_cache as /pip_cache
        # On Docker Desktop for Windows, forward slashes work in volume paths.
        host_path = str(tmpdir_path).replace('\\', '/')
        host_pip_path = str(host_pip_cache_dir).replace('\\', '/')
        volume_flag = ['-v', f'{host_path}:/work', '-v', f'{host_pip_path}:/pip_cache']

        # Unique container name so we can kill THIS run on host-deadline without
        # touching another student's container (the old label lookup grabbed the
        # first nexlab container, which under load could be someone else's).
        container_name = f"nexlab_{uuid.uuid4().hex[:16]}"

        # --rm means Docker removes the container on exit — cleaner than manual rm
        # We still label it nexlab.run=1 so the reaper catches any orphans
        run_flags = ['run', '--rm', '--name', container_name] + volume_flag + flags

        container_id = None
        try:
            stdout_buf, stderr_buf, timed_out, container_id = _docker_run(
                docker_bin, run_flags, spec['image'], hard_deadline, container_name
            )

            # Timeout detection has two sources:
            #  1. wrapper.sh's own `timeout` fired and wrote /work/timeout.txt
            #     (the normal case — container exits cleanly, host never waits).
            #  2. the host `hard_deadline` backstop fired (`timed_out`), e.g. the
            #     container hung before wrapper could self-limit.
            # Either way we surface a timeout; timeout.txt also tells us the phase.
            timeout_phase = 'run'
            timeout_file = tmpdir_path / 'timeout.txt'
            container_timed_out = timeout_file.exists()
            if container_timed_out:
                timeout_phase = timeout_file.read_text().strip() or 'run'
            elif timed_out:
                phase_file = tmpdir_path / 'phase.txt'
                if phase_file.exists():
                    timeout_phase = phase_file.read_text().strip() or 'run'

            effective_timeout = timed_out or container_timed_out

            # Read meta.json written by wrapper.sh
            meta = {}
            meta_file = tmpdir_path / 'meta.json'
            if meta_file.exists():
                try:
                    meta = json.loads(meta_file.read_text())
                except Exception:
                    pass

            # OOMKilled — only inspectable if container still exists (--rm removes
            # it), so we can't `docker inspect`. wrapper.sh distinguishes OOM from
            # a real timeout by elapsed time, so a 137 run_exit WITHOUT timeout.txt
            # means the kernel OOM-killed the program. verdict.py maps that to a
            # clearer "memory limit exceeded" message instead of a bare exit code.
            oom_killed = False
            try:
                if not effective_timeout and int(meta.get('run_exit', 0)) == 137:
                    oom_killed = True
            except (TypeError, ValueError):
                pass

            # Read compile output
            compile_out = ''
            compile_file = tmpdir_path / 'compile.txt'
            if compile_file.exists():
                compile_out = compile_file.read_text(encoding='utf-8', errors='replace')

            verdict = from_meta(meta, oom_killed=oom_killed,
                                 timed_out=effective_timeout, timeout_phase=timeout_phase)

            cap       = _get_output_cap()
            stdout    = _decode_truncate(stdout_buf, cap)
            stderr    = _decode_truncate(stderr_buf, cap)
            truncated = (len(stdout_buf) > cap or len(stderr_buf) > cap)

            # Collect any generated image files (plots/graphs from matplotlib, etc.)
            images = []
            try:
                for img_path in sorted(tmpdir_path.glob('*')):
                    if img_path.is_file() and img_path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.svg', '.webp'):
                        if img_path.stat().st_size <= 5 * 1024 * 1024:  # 5MB cap
                            ext = img_path.suffix.lower().lstrip('.')
                            mime = 'image/svg+xml' if ext == 'svg' else ('image/jpeg' if ext in ('jpg', 'jpeg') else f'image/{ext}')
                            b64 = base64.b64encode(img_path.read_bytes()).decode('ascii')
                            images.append(f"data:{mime};base64,{b64}")
            except Exception as exc:
                log.warning("Failed to collect generated images: %s", exc)

            return verdict | {
                'stdout':          stdout,
                'stderr':          stderr,
                'compile_output':  compile_out,
                'images':          images,
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


def _docker_run(docker_bin: str, run_flags: list[str], image: str, deadline: int,
                container_name: str):
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
        # Host backstop fired (wrapper's internal `timeout` should normally
        # catch a runaway first). Kill THIS run's container by its exact name
        # — never a label lookup, which under load could hit another student's.
        timed_out = True
        try:
            subprocess.run([docker_bin, 'kill', container_name],
                           capture_output=True, timeout=5)
        except Exception:
            pass
        proc.kill()
        container_id = container_name

    t_out.join(timeout=5)
    t_err.join(timeout=5)

    return b''.join(stdout_chunks), b''.join(stderr_chunks), timed_out, container_id


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
