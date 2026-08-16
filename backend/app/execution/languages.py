"""
Language catalog for the code execution engine.

Single source of truth shared by:
  - app/execution/routes.py          (Judge0 + GET /api/execution/languages)
  - app/exec_engine/                 (Docker runner — v2)
  - the student Compiler page        (fetches catalog, renders picker + starter)

`engine` field values
  'judge0'  – submitted to Judge0 CE (current default for all compiled langs)
  'docker'  – executed in a throwaway Docker container (v2)
  'browser' – rendered client-side in an iframe; never reaches the backend

Judge0 IDs: stock CE ids from judge0/judge0:1.13.0 (docker-compose.judge0.yml).
Version strings: Judge0-era versions now; will be updated to current on cutover.

Notes on quirks surfaced as `hint` for the UI:
  - Java       : the public class MUST be named `Main`.
  - C# (v2)    : .NET 10 top-level statements — no class wrapper needed.
  - TypeScript  : avoid top-level `name`/`length` (DOM globals in Judge0 tsc).
  - SQL (82)    : SQLite; fresh empty DB per run — create tables in the script.
  - Kotlin      : kotlinc is slow (3–5 s); gets its own 20 s compile timeout.
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

    'python2': '''# NexLab Compiler - Python 2
app_name = "NexLab"
print "Hello, %s!" % app_name
for i in range(1, 6):
    print "%d squared = %d" % (i, i * i)
''',

    'java': '''// NexLab Compiler - Java
// The public class must be named Main, otherwise Judge0 cannot run it.
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
    'csharp': '''// NexLab Compiler - C# (Mono)
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
    'go': '''// NexLab Compiler - Go
package main

import "fmt"

func main() {
	appName := "NexLab"
	fmt.Printf("Hello, %s!\\n", appName)
	for i := 1; i <= 5; i++ {
		fmt.Printf("%d squared = %d\\n", i, i*i)
	}
}
''',

    'ruby': '''# NexLab Compiler - Ruby
app_name = "NexLab"
puts "Hello, #{app_name}!"

(1..5).each do |i|
  puts "#{i} squared = #{i * i}"
end
''',

    'php': '''<?php
// NexLab Compiler - PHP
$appName = "NexLab";
echo "Hello, $appName!\\n";

for ($i = 1; $i <= 5; $i++) {
    echo "$i squared = " . ($i * $i) . "\\n";
}
''',

    'rust': '''// NexLab Compiler - Rust
fn main() {
    let app_name = "NexLab";
    println!("Hello, {}!", app_name);
    for i in 1..=5 {
        println!("{} squared = {}", i, i * i);
    }
}
''',

    'swift': '''// NexLab Compiler - Swift
let appName = "NexLab"
print("Hello, \\(appName)!")

for i in 1...5 {
    print("\\(i) squared = \\(i * i)")
}
''',

    'octave': '''% NexLab Compiler - Octave
app_name = "NexLab";
printf("Hello, %s!\\n", app_name);

for i = 1:5
  printf("%d squared = %d\\n", i, i * i);
end
''',
}


# ── Language catalog ──────────────────────────────────────────────────────────
# `editor_mode` selects the client-side syntax highlighter profile.
# `group` drives the optgroup headings in the picker.
# `hint` is shown as a one-line tip under the picker (None = no tip).
LANGUAGES = [
    # ── Popular ────────────────────────────────────────────────────────────
    {
        'id': 'python', 'label': 'Python', 'version': '3.8.1',
        'engine': 'judge0',   # v2: python:3.14-slim
        'judge0_id': 71, 'editor_mode': 'python', 'filename': 'main.py',
        'line_comment': '#', 'group': 'Popular', 'aliases': ['py', 'python3'],
        'hint': None,
    },
    {
        'id': 'java', 'label': 'Java', 'version': 'OpenJDK 13.0.1',
        'engine': 'judge0',   # v2: nexlab/jvm:25 (JDK 25)
        'judge0_id': 62, 'editor_mode': 'clike', 'filename': 'Main.java',
        'line_comment': '//', 'group': 'Popular', 'aliases': [],
        'hint': 'The public class must be named Main.',
    },
    {
        'id': 'c', 'label': 'C', 'version': 'GCC 9.2.0',
        'engine': 'judge0',   # v2: gcc:16 (-std=c23)
        'judge0_id': 50, 'editor_mode': 'clike', 'filename': 'main.c',
        'line_comment': '//', 'group': 'Popular', 'aliases': [],
        'hint': None,
    },
    {
        'id': 'cpp', 'label': 'C++', 'version': 'GCC 9.2.0',
        'engine': 'judge0',   # v2: gcc:16 (-std=c++23)
        'judge0_id': 54, 'editor_mode': 'clike', 'filename': 'main.cpp',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['c++'],
        'hint': None,
    },
    {
        'id': 'csharp', 'label': 'C#', 'version': 'Mono 6.6.0',
        'engine': 'judge0',   # v2: dotnet/sdk:10.0 — top-level statements
        'judge0_id': 51, 'editor_mode': 'clike', 'filename': 'Main.cs',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['cs', 'c#'],
        'hint': 'Needs a class with a static Main method.',
    },
    {
        'id': 'javascript', 'label': 'JavaScript', 'version': 'Node.js 12.14.0',
        'engine': 'judge0',   # v2: nexlab/node:24
        'judge0_id': 63, 'editor_mode': 'javascript', 'filename': 'main.js',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['js', 'node'],
        'hint': None,
    },
    {
        'id': 'typescript', 'label': 'TypeScript', 'version': '3.7.4',
        'engine': 'judge0',   # v2: nexlab/node:24 + tsc 7
        'judge0_id': 74, 'editor_mode': 'javascript', 'filename': 'main.ts',
        'line_comment': '//', 'group': 'Popular', 'aliases': ['ts'],
        'hint': 'Compiled with lib.dom — avoid top-level `name` or `length`.',
    },
    {
        'id': 'html', 'label': 'HTML', 'version': 'Browser',
        'engine': 'browser',  # rendered client-side in a sandboxed iframe
        'judge0_id': None, 'editor_mode': 'html', 'filename': 'index.html',
        'line_comment': None, 'group': 'Popular', 'aliases': [],
        'hint': 'Rendered live in a sandboxed preview — no backend involved.',
    },
    {
        'id': 'css', 'label': 'CSS', 'version': 'Browser',
        'engine': 'browser',  # rendered client-side in a sandboxed iframe
        'judge0_id': None, 'editor_mode': 'css', 'filename': 'style.css',
        'line_comment': None, 'group': 'Popular', 'aliases': [],
        'hint': 'Applied to a demo document — styling shows instantly.',
    },
    # ── JVM & Systems ──────────────────────────────────────────────────────
    {
        'id': 'kotlin', 'label': 'Kotlin', 'version': '1.3.70',
        'engine': 'judge0',   # v2: nexlab/jvm:25 + kotlinc 2.4.10 (20 s compile timeout)
        'judge0_id': 78, 'editor_mode': 'clike', 'filename': 'Main.kt',
        'line_comment': '//', 'group': 'JVM & Systems', 'aliases': ['kt'],
        'hint': 'Kotlin compilation takes 3–5 s — this is normal.',
    },
    # ── Data & Scripting ───────────────────────────────────────────────────
    {
        'id': 'r', 'label': 'R', 'version': '4.0.0',
        'engine': 'judge0',   # v2: r-base:<pin>
        'judge0_id': 80, 'editor_mode': 'r', 'filename': 'main.r',
        'line_comment': '#', 'group': 'Data & Scripting', 'aliases': [],
        'hint': None,
    },
    {
        'id': 'sql', 'label': 'SQL', 'version': 'SQLite 3.27.2',
        'engine': 'judge0',   # v2: nexlab/shell:1 + sqlite3
        'judge0_id': 82, 'editor_mode': 'sql', 'filename': 'script.sql',
        'line_comment': '--', 'group': 'Data & Scripting', 'aliases': ['sqlite'],
        'hint': 'Runs on a fresh empty SQLite DB — create your tables in the script.',
    },
    {
        'id': 'bash', 'label': 'Bash', 'version': '5.0.0',
        'engine': 'judge0',   # v2: nexlab/shell:1
        'judge0_id': 46, 'editor_mode': 'shell', 'filename': 'main.sh',
        'line_comment': '#', 'group': 'Data & Scripting', 'aliases': ['sh', 'shell'],
        'hint': None,
    },
    # ── Legacy (Judge0 only — not in v2 scope) ─────────────────────────────
    {
        'id': 'go', 'label': 'Go', 'version': '1.13.5',
        'engine': 'judge0',
        'judge0_id': 60, 'editor_mode': 'clike', 'filename': 'main.go',
        'line_comment': '//', 'group': 'JVM & Systems', 'aliases': ['golang'],
        'hint': None,
    },
    {
        'id': 'rust', 'label': 'Rust', 'version': '1.40.0',
        'engine': 'judge0',
        'judge0_id': 73, 'editor_mode': 'clike', 'filename': 'main.rs',
        'line_comment': '//', 'group': 'JVM & Systems', 'aliases': ['rs'],
        'hint': None,
    },
    {
        'id': 'swift', 'label': 'Swift', 'version': '5.2.3',
        'engine': 'judge0',
        'judge0_id': 83, 'editor_mode': 'clike', 'filename': 'main.swift',
        'line_comment': '//', 'group': 'JVM & Systems', 'aliases': [],
        'hint': None,
    },
    {
        'id': 'ruby', 'label': 'Ruby', 'version': '2.7.0',
        'engine': 'judge0',
        'judge0_id': 72, 'editor_mode': 'ruby', 'filename': 'main.rb',
        'line_comment': '#', 'group': 'Data & Scripting', 'aliases': ['rb'],
        'hint': None,
    },
    {
        'id': 'php', 'label': 'PHP', 'version': '7.4.1',
        'engine': 'judge0',
        'judge0_id': 68, 'editor_mode': 'php', 'filename': 'main.php',
        'line_comment': '//', 'group': 'Data & Scripting', 'aliases': [],
        'hint': 'Wrap your code in <?php ... ?>.',
    },
    {
        'id': 'python2', 'label': 'Python 2', 'version': '2.7.17',
        'engine': 'judge0',
        'judge0_id': 70, 'editor_mode': 'python', 'filename': 'main.py',
        'line_comment': '#', 'group': 'Legacy', 'aliases': [],
        'hint': None,
    },
    {
        'id': 'octave', 'label': 'Octave / MATLAB', 'version': '5.1.0',
        'engine': 'judge0',
        'judge0_id': 66, 'editor_mode': 'matlab', 'filename': 'main.m',
        'line_comment': '%', 'group': 'Legacy', 'aliases': ['matlab'],
        'hint': None,
    },
]

GROUP_ORDER = ['Popular', 'JVM & Systems', 'Data & Scripting', 'Legacy']

# Languages that have a Docker v2 image (excludes browser-rendered and legacy)
_DOCKER_LANGS = frozenset([
    'python', 'java', 'c', 'cpp', 'csharp', 'javascript',
    'typescript', 'kotlin', 'r', 'sql', 'bash',
])

# canonical id -> spec
BY_ID = {spec['id']: spec for spec in LANGUAGES}

# every accepted name (canonical id + aliases) -> Judge0 language id.
# Kept as a flat dict because app/execution/routes.py and the older
# /run + /run-dev endpoints already look languages up this way.
LANGUAGE_IDS = {}
for _spec in LANGUAGES:
    LANGUAGE_IDS[_spec['id']] = _spec['judge0_id']
    for _alias in _spec['aliases']:
        LANGUAGE_IDS[_alias] = _spec['judge0_id']

# every accepted name -> canonical id
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


def judge0_id(lang):
    """Judge0 language id for any accepted name, or None if unknown."""
    spec = resolve(lang)
    return spec['judge0_id'] if spec else None


def starter_code(lang):
    """Starter snippet for any accepted name ('' when none is defined)."""
    spec = resolve(lang)
    return STARTERS.get(spec['id'], '') if spec else ''


def resolve_engine(lang, docker_enabled: bool = False, overrides: str = '') -> str:
    """
    Determine which execution engine to use for a language.

    Resolution order (§14.2 of the v2 plan):
      1. lang.engine == 'browser'            → always 'browser'
      2. overrides string has an entry       → that value
      3. lang.engine                         → that value
      4. result == 'docker' but not enabled  → 'judge0' (safety net)
    """
    spec = resolve(lang)
    if not spec:
        return 'judge0'
    if spec['engine'] == 'browser':
        return 'browser'
    # parse overrides: "python=docker,java=judge0"
    override_map = {}
    for pair in overrides.split(','):
        pair = pair.strip()
        if '=' in pair:
            k, v = pair.split('=', 1)
            override_map[k.strip()] = v.strip()
    engine = override_map.get(spec['id'], spec['engine'])
    if engine == 'docker' and not docker_enabled:
        return 'judge0'
    return engine


def catalog():
    """Serialisable catalog for GET /api/execution/languages."""
    return [{
        'id':            spec['id'],
        'label':         spec['label'],
        'version':       spec['version'],
        'engine':        spec['engine'],
        'judge0_id':     spec.get('judge0_id'),
        'editor_mode':   spec['editor_mode'],
        'filename':      spec['filename'],
        'line_comment':  spec['line_comment'],
        'group':         spec['group'],
        'hint':          spec['hint'],
        'starter':       STARTERS.get(spec['id'], ''),
    } for spec in LANGUAGES]
