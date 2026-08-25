"""
backend/app/exec_engine/sandbox.py
Exact Docker flag set for every container run (§7 of the v2 plan).

ALL flags live here — nothing is hard-coded in runner.py — so the whole
security posture is visible in one place and can be reviewed / adjusted
without touching execution logic.
"""


def build_flags(image: str, memory_mb: int, env: dict,
                tmpfs: list | None = None,
                fsize_bytes: int = 8388608,
                allow_network: bool = False) -> list[str]:
    """
    Return the docker-run flag list (not including the image name or command).

    Parameters
    ----------
    image      : e.g. 'python:3.14-slim' or 'nexlab/jvm:25'
    memory_mb  : hard RAM cap in megabytes (e.g. 256)
    env        : dict of environment variables to inject (COMPILE_CMD, RUN_CMD)
    tmpfs      : optional list of container paths to mount as writable in-memory
                 tmpfs (e.g. ['/tmp']). Needed by toolchains that insist on
                 writing outside /work under --read-only (e.g. .NET's mutex/shm
                 in /tmp). Each tmpfs is size-capped and RAM-backed, so it adds
                 no persistent disk and is wiped when the container exits.
    fsize_bytes: RLIMIT_FSIZE — the largest single file the process may create.
                 Defaults to 8 MB (stops disk fillers). A few toolchains need
                 more: .NET reserves its GC heap through a memory-mapped file it
                 ftruncates to a large size, and an 8 MB cap makes that fail as
                 a bogus "Out of memory" abort — so the C# spec raises this.
    allow_network: if True, use bridge network for downloading packages during setup/compile.
    """
    mem = f"{memory_mb}m"
    net_arg = "bridge" if allow_network else "none"
    flags = [
        # ── Network ─────────────────────────────────────────────────────────
        "--network", net_arg,

        # ── Memory ──────────────────────────────────────────────────────────
        "--memory", mem,              # hard RAM cap
        "--memory-swap", mem,         # equal → swap disabled (bomb dies, not thrash)

        # ── CPU ─────────────────────────────────────────────────────────────
        "--cpus", "1.0",              # one core max

        # ── Process limits ──────────────────────────────────────────────────
        "--pids-limit", "64",         # kills fork bombs

        # ── File descriptor / write limits ──────────────────────────────────
        "--ulimit", "nofile=256:256", # fd exhaustion
        "--ulimit", f"fsize={fsize_bytes}",  # single-file write ceiling

        # ── Privilege drop ──────────────────────────────────────────────────
        "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges",
        # Run as nobody (uid 65534) — never root inside the container.
        # runner.py does chmod(tmpdir, 0o777) so the bind-mounted /work
        # is writable by uid 65534 even though the host owns it.
        "--user", "65534:65534",

        # ── Filesystem ──────────────────────────────────────────────────────
        # /work is bind-mounted by runner.py (host temp dir → container /work).
        # --read-only blocks all rootfs writes (image layers).
        # The bind-mounted /work is still writable (bind mounts bypass --read-only).
        "--read-only",
        "--workdir", "/work",
        "-e", "HOME=/work",           # toolchains that need a writable HOME




        # ── Orphan detection ────────────────────────────────────────────────
        "--label", "nexlab.run=1",    # lets the reaper find orphans

        # ── Stdin/out — no TTY ──────────────────────────────────────────────
        # stdout and stderr stay on separate multiplexed frames automatically
        # when no TTY is allocated — which is what the console UI expects.
    ]

    # ── Writable in-memory scratch (opt-in per language) ────────────────────
    # Size-capped so it can't be used to exhaust host RAM beyond --memory, and
    # RAM-backed so nothing persists to disk. `nosuid`/`nodev` are standard
    # hardening. We deliberately do NOT add `noexec`: .NET extracts and execs
    # helper binaries from /tmp during `dotnet build`, and it buys no real
    # security here anyway — the bind-mounted /work is already exec-capable, and
    # the process is already nobody + --cap-drop ALL + --no-new-privileges.
    for path in (tmpfs or []):
        flags += ["--tmpfs", f"{path}:rw,nosuid,nodev,size={memory_mb}m"]

    # Inject environment variables (COMPILE_CMD + RUN_CMD from specs.py)
    for k, v in env.items():
        flags += ["-e", f"{k}={v}"]

    return flags
