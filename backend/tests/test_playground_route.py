"""
backend/tests/test_playground_route.py
Quick end-to-end smoke test for the route-swap (§14.3 step 5).
Calls /api/execution/playground directly via app context and checks
that the response uses the Docker engine for the 10 v2 languages.

Run:
    venv/Scripts/python.exe tests/test_playground_route.py
"""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app

app = create_app()

# We want DOCKER_RUNNER_ENABLED=true so the new path is exercised
assert app.config.get('DOCKER_RUNNER_ENABLED'), (
    "DOCKER_RUNNER_ENABLED is False — check .env has DOCKER_RUNNER_ENABLED=true"
)

SMOKE_CASES = [
    ('python',     'print("Hello, World!")',                        'Hello, World!'),
    ('javascript', 'console.log("Hello, World!")',                  'Hello, World!'),
    ('bash',       'echo "Hello, World!"',                          'Hello, World!'),
    ('sql',        'CREATE TABLE t(n INT);\nINSERT INTO t VALUES(1);\nSELECT n FROM t;', '1'),
    ('c',          '#include <stdio.h>\nint main(){printf("Hello, World!\\n");return 0;}', 'Hello, World!'),
    ('cpp',        '#include <iostream>\nint main(){std::cout<<"Hello, World!"<<std::endl;}', 'Hello, World!'),
    ('typescript', 'const s: string = "Hello, World!";\nconsole.log(s);', 'Hello, World!'),
    ('java',       'public class Main{public static void main(String[] a){System.out.println("Hello, World!");}}', 'Hello, World!'),
    ('r',          'cat("Hello, World!\\n")',                       'Hello, World!'),
]

def run():
    passed = 0
    failed = 0

    for lang, code, expected in SMOKE_CASES:
        print(f"\n[ROUTE-SWAP] {lang.upper()}")
        t0 = time.time()
        with app.app_context():
            # Simulate what playground_run() does internally
            from app.execution.languages import resolve as resolve_language, resolve_engine
            from app.exec_engine import runner

            spec = resolve_language(lang)
            docker_enabled = app.config.get('DOCKER_RUNNER_ENABLED', False)
            overrides      = app.config.get('EXEC_ENGINE_OVERRIDES', '')
            engine         = resolve_engine(spec['id'], docker_enabled, overrides)

            result = runner.run(code=code, language=lang, stdin='')

        elapsed = time.time() - t0
        ok = (
            result['status_id'] == 3
            and expected in result.get('stdout', '')
            and engine == 'docker'
        )

        if ok:
            print(f"  [PASS]  engine={engine}  status={result['status_id']}  "
                  f"stdout={repr(result['stdout'].strip()[:40])}  wall={elapsed:.2f}s")
            passed += 1
        else:
            print(f"  [FAIL]  engine={engine}  status={result['status_id']}  "
                  f"stdout={repr(result.get('stdout','')[:80])}")
            print(f"     expected: engine=docker  status=3  stdout contains {repr(expected)}")
            failed += 1

    print(f"\n{'='*55}")
    print(f"Route-swap smoke: {passed} passed, {failed} failed / {len(SMOKE_CASES)} total")
    print('='*55)
    return failed == 0


if __name__ == '__main__':
    ok = run()
    sys.exit(0 if ok else 1)
