"""
backend/app/exec_engine/verdict.py
Map container exit information to Judge0-compatible status ids (§9.3).

The frontend branches on status_id / is_compile_error / is_runtime_error, so these
numbers are a stable contract — the console needs no change when the engine changes.

Status ID reference:
  3   Accepted
  5   Time Limit Exceeded
  6   Compilation Error
  7   Runtime Error (SIGSEGV) — exit 139
  8   Runtime Error (SIGXFSZ) — exit 153
  9   Runtime Error (SIGFPE)  — exit 136
  10  Runtime Error (SIGABRT) — exit 134
  11  Runtime Error (NZEC / OOM / other non-zero)
  13  Internal Error (engine failure — never the student's code)
"""

# Signals that map to specific runtime error ids (exit = 128 + signum)
_SIGNAL_STATUS = {
    139: (7,  "Runtime Error (SIGSEGV)"),   # SIGSEGV = 11
    153: (8,  "Runtime Error (SIGXFSZ)"),   # SIGXFSZ = 25
    136: (9,  "Runtime Error (SIGFPE)"),    # SIGFPE  = 8
    134: (10, "Runtime Error (SIGABRT)"),   # SIGABRT = 6
}

_COMPILE_ERROR_ID  = 6
_RUNTIME_ERROR_IDS = frozenset({7, 8, 9, 10, 11})


def from_meta(
    meta: dict,
    oom_killed: bool = False,
    timed_out: bool = False,
    timeout_phase: str = 'run',
) -> dict:
    """
    Convert runner meta-data into a verdict dict.

    Parameters
    ----------
    meta          : dict parsed from /work/meta.json
    oom_killed    : True when docker inspect reports OOMKilled == true
    timed_out     : True when the host deadline fired before the container exited
    timeout_phase : 'compile' | 'run' — which phase was alive when killed
    """
    compile_exit = int(meta.get('compile_exit', 0))
    run_exit     = int(meta.get('run_exit', 0))

    # ── Timeout ──────────────────────────────────────────────────────────────
    if timed_out:
        if timeout_phase == 'compile':
            return _make(6, "Compilation Error",
                         note="compiler timed out — partial output above")
        return _make(5, "Time Limit Exceeded")

    # ── Compile failure ───────────────────────────────────────────────────────
    if compile_exit != 0:
        return _make(6, "Compilation Error")

    # ── OOM ──────────────────────────────────────────────────────────────────
    if oom_killed:
        return _make(11, "Runtime Error", note="memory limit exceeded (256 MB)")

    # ── Clean exit ────────────────────────────────────────────────────────────
    if run_exit == 0:
        return _make(3, "Accepted")

    # ── Signal-specific ───────────────────────────────────────────────────────
    if run_exit in _SIGNAL_STATUS:
        sid, desc = _SIGNAL_STATUS[run_exit]
        return _make(sid, desc)

    # ── Any other non-zero exit ───────────────────────────────────────────────
    return _make(11, f"Runtime Error (exit {run_exit})")


def internal_error(message: str) -> dict:
    """Status 13 — platform failure, not the student's code."""
    return _make(13, "Internal Error", note=message)


def _make(status_id: int, description: str, note: str = '') -> dict:
    return {
        'status_id':        status_id,
        'status':           description,
        'note':             note,
        'success':          status_id == 3,
        'is_compile_error': status_id == _COMPILE_ERROR_ID,
        'is_runtime_error': status_id in _RUNTIME_ERROR_IDS,
    }
