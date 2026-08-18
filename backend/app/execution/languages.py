"""
Language catalog for the code execution engine.

Single source of truth shared by:
  - app/execution/routes.py     (/run, /playground, GET /api/execution/languages)
  - app/exec_engine/            (Docker runner)
  - the student Compiler page   (fetches catalog, renders picker + starter)

`engine` field values
  'docker'  – executed in a throwaway Docker container (the only server engine)
  'browser' – rendered client-side in an iframe; never reaches the backend

Notes on quirks surfaced as `hint` for the UI:
  - Java       : the public class MUST be named `Main`.
  - C#         : .NET 10 — top-level statements work (no class wrapper needed).
  - TypeScript : avoid top-level `name`/`length` (they clash with lib.dom in tsc).
  - SQL        : SQLite; fresh empty DB per run — create tables in the script.
  - Kotlin     : kotlinc is slow (3–5 s); gets its own longer compile timeout.
"""

STARTERS = {
    'python': '''# NexLab Compiler - Python 3
def main():
    app_name = "NexLab"
    print(f"Hello, {app_name}!")
    for i in range(1, 6):
        print(f"{i} squared = {i * i}")


if __name__ == "__main__":
    main()
''',

    'java': '''// NexLab Compiler - Java
// The public class must be named Main, otherwise the runner cannot run it.
public class Main {
    public static void main(String[] args) {
        String appName = "NexLab";
        System.out.println("Hello, " + appName + "!");
        for (int i = 1; i <= 5; i++) {
            System.out.println(i + " squared = " + (i * i));
        }
    }
}
''',

    'c': '''/* NexLab Compiler - C */
#include <stdio.h>

int main(void) {
    printf("Hello, NexLab!\\n");
    for (int i = 1; i <= 5; i++) {
        printf("%d squared = %d\\n", i, i * i);
    }
    return 0;
}
''',

    'cpp': '''// NexLab Compiler - C++
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, NexLab!" << endl;
    for (int i = 1; i <= 5; i++) {
        cout << i << " squared = " << i * i << endl;
    }
    return 0;
}
''',
    'csharp': '''// NexLab Compiler - C# (.NET 10)
using System;

class Program
{
    static void Main()
    {
        string appName = "NexLab";
        Console.WriteLine($"Hello, {appName}!");
        for (int i = 1; i <= 5; i++)
        {
            Console.WriteLine($"{i} squared = {i * i}");
        }
    }
}
''',

    'javascript': '''// NexLab Compiler - JavaScript (Node.js)
const appName = "NexLab";
console.log(`Hello, ${appName}!`);

for (let i = 1; i <= 5; i++) {
  console.log(`${i} squared = ${i * i}`);
}
''',

    'typescript': '''// NexLab Compiler - TypeScript
// Avoid top-level `name` / `length`: tsc includes lib.dom, so they clash.
const appName: string = "NexLab";
console.log(`Hello, ${appName}!`);

for (let i: number = 1; i <= 5; i++) {
  console.log(`${i} squared = ${i * i}`);
}
''',

    'kotlin': '''// NexLab Compiler - Kotlin
fun main() {
    val appName = "NexLab"
    println("Hello, $appName!")
    for (i in 1..5) {
        println("$i squared = ${i * i}")
    }
}
''',
    'r': '''# NexLab Compiler - R
app_name <- "NexLab"
cat(sprintf("Hello, %s!\\n", app_name))

for (i in 1:5) {
  cat(sprintf("%d squared = %d\\n", i, i * i))
}
''',

    'sql': '''-- NexLab Compiler - SQL (SQLite)
-- The script runs against a fresh empty database, so create your tables here.
CREATE TABLE students (
    id    INTEGER PRIMARY KEY,
    name  TEXT    NOT NULL,
    score INTEGER NOT NULL
);

INSERT INTO students (name, score) VALUES
    ('Aarav', 88),
    ('Diya',  94),
    ('Kabir', 76),
    ('Meera', 91);

SELECT name,
       score,
       CASE WHEN score >= 90 THEN 'A'
            WHEN score >= 80 THEN 'B'
            ELSE 'C' END AS grade
FROM students
ORDER BY score DESC;
''',

    'bash': '''#!/bin/bash
# NexLab Compiler - Bash
APP_NAME="NexLab"
echo "Hello, $APP_NAME!"

for i in $(seq 1 5); do
  echo "$i squared = $(( i * i ))"
done
''',
}


# ── Language catalog ──────────────────────────────────────────────────────────
# `editor_mode` selects the client-side syntax highlighter profile.
# `group` drives the optgroup headings in the picker.
# `hint` is shown as a one-line tip under the picker (None = no tip).
LANGUAGES = [
    # ── Popular ────────────────────────────────────────────────────────────
    {
        'id': 'python', 'label': 'Python', 'version': '3.14',
        'engine': 'docker',   # nexlab runner: python:3.14-slim
        'editor_mode': 'python', 'filename': 'main.py',
        'line_comment': '#', 'group': 'Popular', 'aliases': ['py', 'python3'],
        'hint': None,
    },
    {
        'id': 'java', 'label': 'Java', 'version': 'JDK 25',
        'engine': 'docker',   # nexlab runner: nexlab/jvm:25
        'editor_mode': 'clike', 'filename': 'Main.java',
        'line_comment': '//', 'group': 'Popular', 'aliases': [],
        'hint': 'The public class must be named Main.',
    },
    {
        'id': 'c', 'label': 'C', 'version': 'GCC 16 / C23',
        'engine': 'docker',   # nexlab runner: gcc:16 -std=c23
        'editor_mode': 'clike', 'filename': 'main.c',
        'line_comment': '//', 'group': 'Popular', 'aliases': [],
        'hint': None,
    },
    {
        'id': 'cpp', 'label': 'C++', 'version': 'GCC 16 / C++23',
        'engine': 'docker',   # nexlab runner: gcc:16 -std=c++23
        'editor_mode': 'clike', 'filename': 'main.cpp',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['c++'],
        'hint': None,
    },
    {
        'id': 'csharp', 'label': 'C#', 'version': '.NET 10 / C# 14',
        'engine': 'docker',   # nexlab runner: nexlab/csharp:10 top-level statements
        'editor_mode': 'clike', 'filename': 'Main.cs',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['cs', 'c#'],
        'hint': 'Top-level statements — no class or Main method wrapper needed.',
    },
    {
        'id': 'javascript', 'label': 'JavaScript', 'version': 'Node.js 24',
        'engine': 'docker',   # nexlab runner: nexlab/node:24
        'editor_mode': 'javascript', 'filename': 'main.js',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['js', 'node'],
        'hint': None,
    },
    {
        'id': 'typescript', 'label': 'TypeScript', 'version': '7.0 / Node 24',
        'engine': 'docker',   # nexlab runner: nexlab/node:24 + tsc 7 (Go compiler)
        'editor_mode': 'javascript', 'filename': 'main.ts',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['ts'],
        'hint': None,
    },
    {
        'id': 'html', 'label': 'HTML', 'version': 'Browser',
        'engine': 'browser',  # rendered client-side in a sandboxed iframe
        'editor_mode': 'html', 'filename': 'index.html',
        'line_comment': None, 'group': 'Popular', 'aliases': [],
        'hint': 'Rendered live in a sandboxed preview — no backend involved.',
    },
    {
        'id': 'css', 'label': 'CSS', 'version': 'Browser',
        'engine': 'browser',  # rendered client-side in a sandboxed iframe
        'editor_mode': 'css', 'filename': 'style.css',
        'line_comment': None, 'group': 'Popular', 'aliases': [],
        'hint': 'Applied to a demo document — styling shows instantly.',
    },
    # ── JVM & Systems ──────────────────────────────────────────────────────
    {
        'id': 'kotlin', 'label': 'Kotlin', 'version': '2.4 / JDK 25',
        'engine': 'docker',   # nexlab runner: nexlab/jvm:25 + kotlinc 2.4.10
        'editor_mode': 'clike', 'filename': 'Main.kt',
        'line_comment': '//', 'group': 'JVM & Systems', 'aliases': ['kt'],
        'hint': 'Kotlin compilation takes 3–5 s — this is normal.',
    },
    # ── Data & Scripting ───────────────────────────────────────────────────
    {
        'id': 'r', 'label': 'R', 'version': '4.5+',
        'engine': 'docker',   # nexlab runner: r-base:latest
        'editor_mode': 'r', 'filename': 'main.r',
        'line_comment': '#', 'group': 'Data & Scripting', 'aliases': [],
        'hint': None,
    },
    {
        'id': 'sql', 'label': 'SQL', 'version': 'SQLite 3.5x',
        'engine': 'docker',   # nexlab runner: nexlab/shell:1 + sqlite3
        'editor_mode': 'sql', 'filename': 'script.sql',
        'line_comment': '--', 'group': 'Data & Scripting', 'aliases': ['sqlite'],
        'hint': 'Runs on a fresh empty SQLite DB — create your tables in the script.',
    },
    {
        'id': 'bash', 'label': 'Bash', 'version': '5.3',
        'engine': 'docker',   # nexlab runner: nexlab/shell:1
        'editor_mode': 'shell', 'filename': 'main.sh',
        'line_comment': '#', 'group': 'Data & Scripting', 'aliases': ['sh', 'shell'],
        'hint': None,
    },
]

GROUP_ORDER = ['Popular', 'JVM & Systems', 'Data & Scripting']

# canonical id -> spec
BY_ID = {spec['id']: spec for spec in LANGUAGES}

# every accepted name (canonical id + aliases) -> canonical id
_ALIAS_TO_ID = {}
for _spec in LANGUAGES:
    _ALIAS_TO_ID[_spec['id']] = _spec['id']
    for _alias in _spec['aliases']:
        _ALIAS_TO_ID[_alias] = _spec['id']


def resolve(lang):
    """Normalise any accepted language name to its spec, or None if unknown."""
    if not lang:
        return None
    return BY_ID.get(_ALIAS_TO_ID.get(str(lang).strip().lower()))


def starter_code(lang):
    """Starter snippet for any accepted name ('' when none is defined)."""
    spec = resolve(lang)
    return STARTERS.get(spec['id'], '') if spec else ''


def resolve_engine(lang, docker_enabled: bool = True, overrides: str = '') -> str:
    """
    Which engine runs a language. Docker is the only server-side engine now
    (Judge0 was removed); browser languages are rendered client-side.

    Resolution:
      1. lang.engine == 'browser'      → 'browser'
      2. an override entry for the lang → that value (only 'browser' is honoured;
                                          anything else collapses to 'docker')
      3. otherwise                      → 'docker'

    `docker_enabled` is accepted for call-site compatibility but no longer
    changes the answer — whether the engine is actually available is reported
    separately by /engine-health, not encoded in the routing label.
    """
    spec = resolve(lang)
    if not spec:
        return 'docker'
    if spec['engine'] == 'browser':
        return 'browser'
    # parse overrides: "html=browser,css=browser"
    override_map = {}
    for pair in overrides.split(','):
        pair = pair.strip()
        if '=' in pair:
            k, v = pair.split('=', 1)
            override_map[k.strip()] = v.strip()
    engine = override_map.get(spec['id'], spec['engine'])
    return 'browser' if engine == 'browser' else 'docker'


def catalog():
    """Serialisable catalog for GET /api/execution/languages."""
    return [{
        'id':            spec['id'],
        'label':         spec['label'],
        'version':       spec['version'],
        'engine':        spec['engine'],
        'editor_mode':   spec['editor_mode'],
        'filename':      spec['filename'],
        'line_comment':  spec['line_comment'],
        'group':         spec['group'],
        'hint':          spec['hint'],
        'starter':       STARTERS.get(spec['id'], ''),
    } for spec in LANGUAGES]
