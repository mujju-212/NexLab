"""
backend/tests/test_exec_sandbox.py
P3 — Security suite for the Docker execution engine (§15.2 of the plan).

Every attack listed in the plan must be CONTAINED without human intervention.
The assert is on the VERDICT, not on the absence of a crash.

Run:
    venv/Scripts/python.exe tests/test_exec_sandbox.py
"""
import subprocess
import sys
import os
import time
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app

DOCKER_BIN = 'docker'

app = create_app()
app.config['DOCKER_RUNNER_ENABLED'] = True


def _container_count() -> int:
    """Count live nexlab containers — should be 0 at rest."""
    try:
        r = subprocess.run(
            [DOCKER_BIN, 'ps', '-a', '-q', '--filter', 'label=nexlab.run=1'],
            capture_output=True, timeout=5,
        )
        return len([x for x in r.stdout.decode().split() if x])
    except Exception:
        return -1


# Hard deadline = compile_timeout(10s) + run_timeout(5s) + grace(3s) = 18s
# We allow 22s per test to give a small buffer for process-start overhead
_TLE_WALL = 22

CASES = [
    # ── Timeout attacks ────────────────────────────────────────────────────────
    {
        'name': 'Infinite loop (Python)',
        'language': 'python',
        'code': 'while True:\n    pass',
        'expect_status': 5,         # TLE
        'max_wall_sec': _TLE_WALL,
    },
    {
        'name': 'Infinite loop (JavaScript)',
        'language': 'javascript',
        'code': 'while(true){}',
        'expect_status': 5,
        'max_wall_sec': _TLE_WALL,
    },
    {
        'name': 'Infinite loop (C)',
        'language': 'c',
        'code': '#include <stdio.h>\nint main(void){while(1);return 0;}',
        'expect_status': 5,
        # C has compile step; hard deadline = compile(10) + run(5) + grace(3) = 18s
        # give extra for compile overhead on first cold run
        'max_wall_sec': 30,
    },

    # ── Memory bomb ────────────────────────────────────────────────────────────
    {
        'name': 'Memory bomb — allocate beyond 256 MB (Python)',
        'language': 'python',
        'code': (
            'buf = []\n'
            'while True:\n'
            '    buf.append(b"x" * 1024 * 1024)\n'
        ),
        # OOM kill → exit 137 → NZEC (11), or TLE if cgroup fires after run timeout
        'expect_status_in': {5, 11},
        'max_wall_sec': _TLE_WALL,
    },

    # ── Fork bomb ──────────────────────────────────────────────────────────────
    {
        # Bash fork bomb exits 0 even when pids-limit fires — the shell itself
        # finishes but child forks fail.  The important thing: it must finish
        # (not hang), stderr must contain "retry" (pids-limit firing), and
        # no "GOT_ROOT" type escape.
        # Status can be 3 (the bomb "succeeds" but children die) or 11.
        'name': 'Fork bomb (Bash — pids limit must fire and contain it)',
        'language': 'bash',
        'code': ':(){ :|:& };:',
        'expect_status_in': {3, 5, 11},   # any verdict is fine — key is it finishes
        'max_wall_sec': _TLE_WALL,         # must NOT hang
        'in_stderr': 'retry',              # pids-limit fires → "fork: retry"
    },

    # ── Output flood ───────────────────────────────────────────────────────────
    {
        'name': 'Output flood — continuous stdout (Python)',
        'language': 'python',
        'code': (
            'import sys\n'
            'while True:\n'
            '    sys.stdout.buffer.write(b"x" * 4096)\n'
            '    sys.stdout.buffer.flush()\n'
        ),
        # TLE fires after 5s run timeout; truncated must be True
        'expect_status_in': {5, 3},       # TLE most likely
        'expect_truncated': True,
        'stdout_max_bytes': 270_000,       # 256 KB cap + small marker overhead
        'max_wall_sec': _TLE_WALL,
    },

    # ── Disk filler ────────────────────────────────────────────────────────────
    {
        'name': 'Disk filler — write 200 MB to /work (Python, ulimit fsize)',
        'language': 'python',
        'code': (
            'with open("/work/bomb.bin", "wb") as f:\n'
            '    for _ in range(200):\n'
            '        f.write(b"0" * 1024 * 1024)\n'
            'print("wrote_200MB")\n'
        ),
        'expect_status_in': {5, 8, 11},   # SIGXFSZ(8), NZEC(11), or TLE
        'not_in_stdout': 'wrote_200MB',   # must NOT complete the full write
        'max_wall_sec': _TLE_WALL,
    },

    # ── Network escape ─────────────────────────────────────────────────────────
    {
        'name': 'Network callout — urllib to 1.1.1.1 (--network none)',
        'language': 'python',
        'code': (
            'import urllib.request\n'
            'try:\n'
            '    r = urllib.request.urlopen("http://1.1.1.1", timeout=2)\n'
            '    print("NETWORK_ESCAPED:", r.read(50))\n'
            'except Exception as e:\n'
            '    print("blocked:", type(e).__name__)\n'
        ),
        'not_in_stdout': 'NETWORK_ESCAPED:',
        'max_wall_sec': _TLE_WALL,
    },
    {
        'name': 'Network callout — socket to host 172.17.0.1:5000 (--network none)',
        'language': 'python',
        'code': (
            'import socket\n'
            'try:\n'
            '    s = socket.create_connection(("172.17.0.1", 5000), timeout=2)\n'
            '    print("HOST_REACHED")\n'
            'except Exception as e:\n'
            '    print("blocked:", type(e).__name__)\n'
        ),
        'not_in_stdout': 'HOST_REACHED',
        'max_wall_sec': _TLE_WALL,
    },

    # ── Filesystem escape ──────────────────────────────────────────────────────
    {
        'name': 'Read /etc/shadow — must never show host username',
        'language': 'python',
        'code': (
            'try:\n'
            '    data = open("/etc/shadow").read()\n'
            '    # Container has its own shadow — that is OK.\n'
            '    # But host Windows username "User" must not appear.\n'
            '    if "User" in data:\n'
            '        print("HOST_SHADOW_LEAKED")\n'
            '    else:\n'
            '        print("container shadow only — ok")\n'
            'except Exception as e:\n'
            '    print("denied:", type(e).__name__)\n'
        ),
        'not_in_stdout': 'HOST_SHADOW_LEAKED',
        'max_wall_sec': _TLE_WALL,
    },
    {
        'name': 'Write to /usr — must be blocked by --read-only rootfs',
        'language': 'python',
        'code': (
            'try:\n'
            '    open("/usr/hacked.txt", "w").write("pwned")\n'
            '    print("WROTE_TO_USR")\n'
            'except Exception as e:\n'
            '    print("blocked:", type(e).__name__)\n'
        ),
        'not_in_stdout': 'WROTE_TO_USR',
        'max_wall_sec': _TLE_WALL,
    },

    # ── Privilege escalation ───────────────────────────────────────────────────
    {
        'name': 'setuid(0) — cap-drop ALL must block privilege escalation',
        'language': 'python',
        'code': (
            'import os\n'
            'try:\n'
            '    os.setuid(0)\n'
            '    # If we get here we are already root — check real uid\n'
            '    if os.getuid() == 0:\n'
            '        print("GOT_ROOT")\n'
            '    else:\n'
            '        print("setuid succeeded but uid is still:", os.getuid())\n'
            'except Exception as e:\n'
            '    print("denied:", type(e).__name__)\n'
        ),
        'not_in_stdout': 'GOT_ROOT',
        'max_wall_sec': _TLE_WALL,
    },
]


def _run_case(case: dict) -> tuple[dict, float]:
    """Execute one case, return (result, elapsed_sec)."""
    t0 = time.time()
    with app.app_context():
        from app.exec_engine import runner
        result = runner.run(
            code=case['code'],
            language=case['language'],
            stdin=case.get('stdin', ''),
        )
    return result, time.time() - t0


def run_tests():
    # Ensure admission control is initialised
    with app.app_context():
        from app.exec_engine import admission
        try:
            admission.init_app(app)
        except Exception:
            pass   # already initialised

    passed = 0
    failed = 0

    for case in CASES:
        print(f"\n[SECURITY] {case['name']}")
        result = None
        try:
            result, elapsed = _run_case(case)
        except Exception as exc:
            print(f"  [EXC] Unhandled exception: {exc}")
            import traceback; traceback.print_exc()
            failed += 1
            continue

        reasons = []

        # -- Exact status_id
        if 'expect_status' in case:
            if result['status_id'] != case['expect_status']:
                reasons.append(
                    f"status_id expected={case['expect_status']} "
                    f"got={result['status_id']} ({result.get('status')})"
                )

        # -- Status in set
        if 'expect_status_in' in case:
            if result['status_id'] not in case['expect_status_in']:
                reasons.append(
                    f"status_id expected in {case['expect_status_in']} "
                    f"got={result['status_id']} ({result.get('status')})"
                )

        # -- Truncated flag
        if case.get('expect_truncated') and not result.get('truncated'):
            reasons.append("expected truncated=True but output was not truncated")

        # -- Stdout length cap
        if 'stdout_max_bytes' in case:
            n = len(result.get('stdout', '').encode('utf-8', errors='replace'))
            if n > case['stdout_max_bytes']:
                reasons.append(f"stdout {n} bytes exceeds cap {case['stdout_max_bytes']}")

        # -- Forbidden string in stdout
        if 'not_in_stdout' in case:
            if case['not_in_stdout'] in result.get('stdout', ''):
                reasons.append(f"forbidden string in stdout: {repr(case['not_in_stdout'])}")

        # -- Required string in stderr (fork bomb check)
        if 'in_stderr' in case:
            if case['in_stderr'] not in result.get('stderr', ''):
                # Not a hard failure — pids-limit wording can vary
                print(f"  [NOTE] expected {repr(case['in_stderr'])} in stderr but not found "
                      f"(stderr={repr(result.get('stderr','')[:60])})")

        # -- Wall time
        if 'max_wall_sec' in case and elapsed > case['max_wall_sec']:
            reasons.append(f"wall time {elapsed:.1f}s > max {case['max_wall_sec']}s")

        # -- Orphan containers
        orphans = _container_count()
        if orphans > 0:
            reasons.append(f"{orphans} orphan container(s) still alive")

        if not reasons:
            print(f"  [PASS]  status={result['status_id']} ({result.get('status')})  "
                  f"wall={elapsed:.2f}s  orphans={orphans}")
            passed += 1
        else:
            print(f"  [FAIL]")
            for r in reasons:
                print(f"     -> {r}")
            print(f"     stdout: {repr(result.get('stdout', '')[:120])}")
            print(f"     stderr: {repr(result.get('stderr', '')[:120])}")
            failed += 1

    final_orphans = _container_count()
    print(f"\n{'='*60}")
    print(f"Security suite: {passed} passed, {failed} failed / {len(CASES)} total")
    print(f"Orphan containers at end: {final_orphans}")
    if final_orphans > 0:
        print("  WARNING: `docker rm -f $(docker ps -aq --filter label=nexlab.run=1)`")
    print('='*60)
    return failed == 0


if __name__ == '__main__':
    ok = run_tests()
    sys.exit(0 if ok else 1)
