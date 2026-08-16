"""
Manual end-to-end test for the Docker execution engine.
Run: venv/Scripts/python.exe tests/test_exec_engine.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app

app = create_app()
app.config['DOCKER_RUNNER_ENABLED'] = True

CASES = [
    {
        'name': 'Python 3.14 — hello world',
        'language': 'python',
        'code': 'import sys\nprint("Hello from Docker!")\nprint("Python", sys.version.split()[0])',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from Docker!',
    },
    {
        'name': 'Python 3.14 — stdin read',
        'language': 'python',
        'code': 'name = input()\nprint(f"Hi, {name}!")',
        'stdin': 'NexLab',
        'expect_status': 3,
        'expect_in_stdout': 'Hi, NexLab!',
    },
    {
        'name': 'JavaScript — Node 24',
        'language': 'javascript',
        'code': 'console.log("Hello from Node", process.version)',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from Node',
    },
    {
        'name': 'Bash',
        'language': 'bash',
        'code': 'echo "Hello from Bash"\nbash --version | head -1',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from Bash',
    },
    {
        'name': 'SQL (SQLite)',
        'language': 'sql',
        'code': 'CREATE TABLE greet(msg TEXT);\nINSERT INTO greet VALUES("Hello from SQLite");\nSELECT msg FROM greet;',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from SQLite',
    },
    {
        'name': 'C — GCC 16',
        'language': 'c',
        'code': '#include <stdio.h>\nint main(void) {\n    printf("Hello from C!\\n");\n    return 0;\n}',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from C!',
    },
    {
        'name': 'C++ — GCC 16',
        'language': 'cpp',
        'code': '#include <iostream>\nint main() {\n    std::cout << "Hello from C++!" << std::endl;\n    return 0;\n}',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from C++!',
    },
    {
        'name': 'TypeScript — tsc 7 + Node 24',
        'language': 'typescript',
        'code': 'const msg: string = "Hello from TypeScript!";\nconsole.log(msg);',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from TypeScript!',
    },
    {
        'name': 'Java — JDK 25',
        'language': 'java',
        'code': 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from Java!',
    },
    {
        'name': 'R — r-base',
        'language': 'r',
        'code': 'cat("Hello from R!\\n")',
        'stdin': '',
        'expect_status': 3,
        'expect_in_stdout': 'Hello from R!',
    },
    {
        'name': 'Python — infinite loop (timeout)',
        'language': 'python',
        'code': 'while True:\n    pass',
        'stdin': '',
        'expect_status': 5,   # Time Limit Exceeded
        'expect_in_stdout': None,
    },
    {
        'name': 'Python — compile error (syntax)',
        'language': 'python',
        'code': 'def broken(:',
        'stdin': '',
        'expect_status': 11,  # Runtime Error — Python SyntaxError exits non-zero at runtime
        'expect_in_stdout': None,
    },
]

def run_tests():
    passed = 0
    failed = 0
    with app.app_context():
        from app.exec_engine import runner
        from app.exec_engine import admission
        admission.init_app(app)

        for case in CASES:
            print(f"\n[TEST] {case['name']}")
            try:
                result = runner.run(
                    code=case['code'],
                    language=case['language'],
                    stdin=case['stdin'],
                )
                got_status = result['status_id']
                got_stdout = result['stdout']

                status_ok = (got_status == case['expect_status'])
                stdout_ok = (
                    case['expect_in_stdout'] is None or
                    case['expect_in_stdout'] in got_stdout
                )

                if status_ok and stdout_ok:
                    print(f"  [PASS]  status_id={got_status}  stdout={repr(got_stdout[:80])}")
                    passed += 1
                else:
                    print(f"  [FAIL]")
                    if not status_ok:
                        print(f"     status_id expected={case['expect_status']} got={got_status} ({result['status']})")
                    if not stdout_ok:
                        print(f"     stdout expected to contain {repr(case['expect_in_stdout'])}")
                        print(f"     got: {repr(got_stdout[:200])}")
                    if result['stderr']:
                        print(f"     stderr: {repr(result['stderr'][:200])}")
                    failed += 1
            except Exception as exc:
                print(f"  [EXC] EXCEPTION: {exc}")
                import traceback; traceback.print_exc()
                failed += 1

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed out of {len(CASES)} tests")
    print('='*50)
    return failed == 0

if __name__ == '__main__':
    ok = run_tests()
    sys.exit(0 if ok else 1)
