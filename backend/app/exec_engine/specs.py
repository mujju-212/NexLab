"""
backend/app/exec_engine/specs.py
Per-language image, filenames, compile/run commands, and timeout overrides.

All 10 executable languages from §5 of the v2 plan, plus the 2 browser-only
languages (html, css) with engine='browser' so the caller can branch early.
"""

# Each entry:
#   id             — must match languages.py catalog id
#   engine         — 'docker' | 'browser'
#   image          — Docker image to run
#   filename       — source file name written into /work
#   compile_cmd    — shell command to compile (empty = interpreted, no compile step)
#   run_cmd        — shell command to run the program (may reference compiled output)
#   compile_timeout — seconds; defaults to EXEC_COMPILE_TIMEOUT_SEC from config
#   version_label  — human-readable version (updated after first prepull.sh run)

SPECS: list[dict] = [
    # ── Python ───────────────────────────────────────────────────────────────
    {
        'id': 'python',
        'engine': 'docker',
        'image': 'python:3.14-slim',
        'filename': 'main.py',
        'compile_cmd': '',
        'run_cmd': 'python -u main.py',
        'compile_timeout': None,   # interpreted — no compile step
        'version_label': 'Python 3.14',
    },
    # ── JavaScript ───────────────────────────────────────────────────────────
    {
        'id': 'javascript',
        'engine': 'docker',
        'image': 'nexlab/node:24',
        'filename': 'main.js',
        'compile_cmd': '',
        'run_cmd': 'node main.js',
        'compile_timeout': None,
        'version_label': 'Node.js 24',
    },
    # ── TypeScript ────────────────────────────────────────────────────────────
    {
        'id': 'typescript',
        'engine': 'docker',
        'image': 'nexlab/node:24',
        'filename': 'main.ts',
        'compile_cmd': 'tsc --target es2023 main.ts',
        'run_cmd': 'node main.js',
        'compile_timeout': None,   # tsc 7 (Go) is fast
        'version_label': 'TypeScript 7 / Node 24',
    },
    # ── C ────────────────────────────────────────────────────────────────────
    {
        'id': 'c',
        'engine': 'docker',
        'image': 'gcc:16',
        'filename': 'main.c',
        'compile_cmd': 'gcc -O1 -std=c23 -o prog main.c -lm',
        'run_cmd': './prog',
        'compile_timeout': None,
        'version_label': 'GCC 16 / C23',
    },
    # ── C++ ──────────────────────────────────────────────────────────────────
    {
        'id': 'cpp',
        'engine': 'docker',
        'image': 'gcc:16',
        'filename': 'main.cpp',
        'compile_cmd': 'g++ -O1 -std=c++23 -o prog main.cpp',
        'run_cmd': './prog',
        'compile_timeout': None,
        'version_label': 'GCC 16 / C++23',
    },
    # ── Java ─────────────────────────────────────────────────────────────────
    {
        'id': 'java',
        'engine': 'docker',
        'image': 'nexlab/jvm:25',
        'filename': 'Main.java',
        'compile_cmd': 'javac Main.java',
        'run_cmd': 'java Main',
        'compile_timeout': None,
        'version_label': 'JDK 25',
    },
    # ── Kotlin ───────────────────────────────────────────────────────────────
    {
        'id': 'kotlin',
        'engine': 'docker',
        'image': 'nexlab/jvm:25',
        'filename': 'Main.kt',
        'compile_cmd': 'kotlinc Main.kt -include-runtime -d app.jar',
        'run_cmd': 'java -jar app.jar',
        'compile_timeout': 20,   # kotlinc is genuinely slow (§5)
        'version_label': 'Kotlin 2.4 / JDK 25',
    },
    # ── C# ───────────────────────────────────────────────────────────────────
    # .NET 10 file-based apps — top-level statements, no class wrapper.
    # `dotnet run` compiles + runs in one step (no explicit compile_cmd).
    {
        'id': 'csharp',
        'engine': 'docker',
        'image': 'mcr.microsoft.com/dotnet/sdk:10.0',
        'filename': 'Main.cs',
        'compile_cmd': '',
        'run_cmd': 'dotnet run --project . Main.cs',
        'compile_timeout': None,
        'version_label': '.NET 10 / C# 14',
    },
    # ── R ────────────────────────────────────────────────────────────────────
    {
        'id': 'r',
        'engine': 'docker',
        'image': 'r-base:latest',  # pinned by digest after first prepull
        'filename': 'main.R',
        'compile_cmd': '',
        'run_cmd': 'Rscript main.R',
        'compile_timeout': None,
        'version_label': 'R 4.5+',  # updated by prepull.sh
    },
    # ── Bash ─────────────────────────────────────────────────────────────────
    {
        'id': 'bash',
        'engine': 'docker',
        'image': 'nexlab/shell:1',
        'filename': 'main.sh',
        'compile_cmd': '',
        'run_cmd': 'bash main.sh',
        'compile_timeout': None,
        'version_label': 'Bash 5.3',
    },
    # ── SQL (SQLite) ──────────────────────────────────────────────────────────
    {
        'id': 'sql',
        'engine': 'docker',
        'image': 'nexlab/shell:1',
        'filename': 'script.sql',
        'compile_cmd': '',
        'run_cmd': 'sqlite3 -batch :memory: < script.sql',
        'compile_timeout': None,
        'version_label': 'SQLite 3.5x',
    },
    # ── Browser-rendered (no container) ──────────────────────────────────────
    {
        'id': 'html',
        'engine': 'browser',
        'image': None,
        'filename': 'index.html',
        'compile_cmd': '',
        'run_cmd': '',
        'compile_timeout': None,
        'version_label': 'Browser',
    },
    {
        'id': 'css',
        'engine': 'browser',
        'image': None,
        'filename': 'style.css',
        'compile_cmd': '',
        'run_cmd': '',
        'compile_timeout': None,
        'version_label': 'Browser',
    },
]

# Fast lookup
_BY_ID: dict[str, dict] = {s['id']: s for s in SPECS}


def get(lang_id: str) -> dict | None:
    """Return the spec for a language id, or None if not in scope."""
    return _BY_ID.get(lang_id)
