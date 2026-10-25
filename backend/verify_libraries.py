"""verify_libraries.py — external-library regression across languages."""
import os, sys
os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')
from app import create_app
app = create_app('development')
app.config.update(DOCKER_RUNNER_ENABLED=True, TESTING=True)

CASES = [
    # (label, language, packages, code, expect_in_stdout)
    ('py numpy (preinstalled)', 'python', ['numpy'],
     'import numpy as np\nprint("np", int(np.array([1,2,3]).sum()))', 'np 6'),
    ('py pandas (preinstalled)', 'python', ['pandas'],
     'import pandas as pd\ndf = pd.DataFrame({"a":[1,2]})\nprint("pd", len(df))', 'pd 2'),
    ('py sympy (AUTO-detected)', 'python', None,
     'import sympy\nx = sympy.symbols("x")\nprint("sympy", sympy.integrate(2*x, x))', 'sympy x**2'),
    ('py requests (network lib)', 'python', ['requests'],
     'import requests\nprint("requests-ok", requests.__name__)', 'requests-ok'),
    ('py bs4 (runtime pip install)', 'python', ['beautifulsoup4'],
     'from bs4 import BeautifulSoup\nprint("bs4", BeautifulSoup("<p>hi</p>").p.text)', 'bs4 hi'),
    ('py pypi:sqlalchemy (install)', 'python', ['sqlalchemy'],
     'import sqlalchemy\nprint("sa", sqlalchemy.__version__[:4])', 'sa 2.'),
    ('js node builtin fs', 'javascript', None,
     'const fs = require("fs"); console.log("fs-ok");', 'fs-ok'),
    ('js npm: axios (attempt)', 'javascript', ['axios'],
     'const ax = require("axios"); console.log("axios-ok");', 'axios-ok'),
    ('c stdio (no pkg)', 'c', None,
     '#include <stdio.h>\nint main(){printf("c-ok\\n");return 0;}', 'c-ok'),
    ('java stdlib', 'java', None,
     'public class Main{public static void main(String[] a){System.out.println("java-ok");}}', 'java-ok'),
    ('sql pg', 'sql', None, "SELECT 'sql-ok';", 'sql-ok'),
]

results = []
with app.app_context():
    from app.exec_engine import runner
    for label, lang, pkgs, code, expect in CASES:
        try:
            r = runner.run(code=code, language=lang, stdin='', packages=pkgs)
            out = (r.get('stdout') or '') + (r.get('compile_output') or '')
            ok = r.get('status_id') == 3 and expect.lower() in out.lower()
            results.append((label, ok, f'sid={r.get("status_id")} out={out.strip()[:60]!r}'))
        except Exception as e:
            results.append((label, False, f'EXC {e}'))

for label, ok, detail in results:
    print(f"  {'PASS' if ok else 'FAIL'}  {label:32} {detail}")
fails = [r for r in results if not r[1]]
print(f'RESULT: {len(results)-len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
