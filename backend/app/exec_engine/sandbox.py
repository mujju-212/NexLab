"""
backend/app/exec_engine/sandbox.py
Exact Docker flag set for every container run (§7 of the v2 plan).

ALL flags live here — nothing is hard-coded in runner.py — so the whole
security posture is visible in one place and can be reviewed / adjusted
without touching execution logic.
"""


def build_flags(image: str, memory_mb: int, env: dict) -> list[str]:
    """
    Return the docker-run flag list (not including the image name or command).

    Parameters
    ----------
    image      : e.g. 'python:3.14-slim' or 'nexlab/jvm:25'
    memory_mb  : hard RAM cap in megabytes (e.g. 256)
    env        : dict of environment variables to inject (COMPILE_CMD, RUN_CMD)
    """
    mem = f"{memory_mb}m"
    flags = [
        # ── Network ─────────────────────────────────────────────────────────
        "--network", "none",          # no outbound calls, no lateral movement

        # ── Memory ──────────────────────────────────────────────────────────
        "--memory", mem,              # hard RAM cap
        "--memory-swap", mem,         # equal → swap disabled (bomb dies, not thrash)

        # ── CPU ─────────────────────────────────────────────────────────────
        "--cpus", "1.0",              # one core max

        # ── Process limits ──────────────────────────────────────────────────
        "--pids-limit", "64",         # kills fork bombs

        # ── File descriptor / write limits ──────────────────────────────────
        "--ulimit", "nofile=256:256", # fd exhaustion
        "--ulimit", "fsize=8388608",  # 8 MB write ceiling — stops disk fillers

        # ── Privilege drop ──────────────────────────────────────────────────
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        # Note: --user 65534:65534 (nobody) is omitted — Docker Desktop for Windows
        # bind-mounted dirs are owned by the Windows user, not uid 65534.
        # Isolation is still enforced by --cap-drop ALL, no-new-privileges, --network none.

        # ── Filesystem ──────────────────────────────────────────────────────
        # /work is bind-mounted by runner.py (host temp dir → container /work).
        # No tmpfs needed. workdir and HOME are set here so toolchains behave.
        "--workdir", "/work",
        "-e", "HOME=/work",           # toolchains that need a writable HOME




        # ── Orphan detection ────────────────────────────────────────────────
        "--label", "nexlab.run=1",    # lets the reaper find orphans

        # ── Stdin/out — no TTY ──────────────────────────────────────────────
        # stdout and stderr stay on separate multiplexed frames automatically
        # when no TTY is allocated — which is what the console UI expects.
    ]

    # Inject environment variables (COMPILE_CMD + RUN_CMD from specs.py)
    for k, v in env.items():
        flags += ["-e", f"{k}={v}"]

    return flags
