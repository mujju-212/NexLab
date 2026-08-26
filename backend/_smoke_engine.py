"""
Smoke-test every executable language through the REAL runner.run() path.
Exercises the actual Docker flag set (incl. tmpfs noexec on C#), wrapper.sh,
per-phase timeouts, and Judge0-compatible verdict mapping.

Run:  python _smoke_engine.py
"""
import sys
import time
from app.exec_engine import runner

# (lang_id, source, stdin, expected_substring_in_stdout)
TESTS = [
    ('python',
     'import sys\nd = sys.stdin.read().strip()\nprint("py", d, 6*7)',
     'STDIN_OK', 'py STDIN_OK 42'),

    ('javascript',
     'console.log("js", 6*7);',
     '', 'js 42'),

    ('typescript',
     'const x: number = 6 * 7;\nconsole.log("ts", x);',
     '', 'ts 42'),

    ('c',
     '#include <stdio.h>\nint main(){ printf("c %d\\n", 6*7); return 0; }',
     '', 'c 42'),

    ('cpp',
     '#include <iostream>\nint main(){ std::cout << "cpp " << 6*7 << std::endl; return 0; }',
     '', 'cpp 42'),

    ('java',
     'public class Main { public static void main(String[] a){ System.out.println("java " + (6*7)); } }',
     '', 'java 42'),

    ('kotlin',
     'fun main() { println("kotlin " + (6*7)) }',
     '', 'kotlin 42'),

    ('csharp',
     'System.Console.WriteLine($"csharp {6*7}");',
     '', 'csharp 42'),

    ('r',
     'cat("r", 6*7, "\\n")',
     '', 'r 42'),

    ('bash',
     'echo "bash $((6*7))"',
     '', 'bash 42'),

    ('sql',
     "SELECT 'sql ' || (6*7);",
     '', 'sql 42'),
]


def one_line(s, n=80):
    s = (s or '').replace('\n', '\\n').replace('\r', '')
    return s if len(s) <= n else s[:n] + '...'


def main():
    print("=" * 100)
    print(f"{'LANG':<12}{'ok':<4}{'sid':<5}{'ms':<7}{'STDOUT / error'}")
    print("=" * 100)
    passed = 0
    failed = []
    for lang, code, stdin, expect in TESTS:
        t0 = time.time()
        try:
            res = runner.run(code=code, language=lang, stdin=stdin)
        except Exception as exc:
            failed.append(lang)
            print(f"{lang:<12}{'EXC':<4}{'-':<5}{'-':<7}{type(exc).__name__}: {exc}")
            continue
        wall = int((time.time() - t0) * 1000)
        sid = res.get('status_id')
        out = res.get('stdout', '')
        err = res.get('stderr', '')
        comp = res.get('compile_output', '')
        ok = (sid == 3 and expect in out)
        if ok:
            passed += 1
            mark = 'OK'
        else:
            failed.append(lang)
            mark = 'XX'
        detail = one_line(out) if ok else f"OUT={one_line(out,40)} ERR={one_line(err,40)} COMP={one_line(comp,40)}"
        print(f"{lang:<12}{mark:<4}{str(sid):<5}{str(wall):<7}{detail}")

    print("=" * 100)
    print(f"PASSED {passed}/{len(TESTS)}" + (f"   FAILED: {', '.join(failed)}" if failed else "   ALL GREEN"))
    return 0 if not failed else 1


if __name__ == '__main__':
    sys.exit(main())
