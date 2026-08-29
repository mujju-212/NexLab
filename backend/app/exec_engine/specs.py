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
        'image': 'nexlab/python:3.12',
        'filename': 'main.py',
        'compile_cmd': '',
        'run_cmd': 'python -u main.py',
        'compile_timeout': None,   # interpreted — no compile step
        'version_label': 'Python 3.12 (SciPy/Matplotlib)',
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
    # kotlinc is heavy: it needs a big heap AND writes jansi's native lib to
    # java.io.tmpdir (defaults to /tmp, which is read-only here). JAVA_OPTS is
    # read by the kotlinc launcher script (not by the `java` run phase), so we
    # scope both fixes to compile: redirect tmpdir to the writable /work and
    # give the compiler a 768 MB heap inside a 1 GB container.
    {
        'id': 'kotlin',
        'engine': 'docker',
        'image': 'nexlab/jvm:25',
        'filename': 'Main.kt',
        'compile_cmd': 'kotlinc Main.kt -include-runtime -d app.jar',
        'run_cmd': 'java -jar app.jar',
        'compile_timeout': 40,   # cold kotlinc + -include-runtime bundling (§5)
        'version_label': 'Kotlin 2.4 / JDK 25',
        # kotlinc is the heaviest compiler here. Measured floor for a small
        # program is ~512 MB; 768 MB container / 512 MB heap leaves headroom for
        # real multi-file programs without the 1 GB we used before tuning.
        'memory_mb': 768,
        'env_extra': {'JAVA_OPTS': '-Xmx512m -Djava.io.tmpdir=/work'},
    },
    # ── C# ───────────────────────────────────────────────────────────────────
    # .NET 10. `dotnet run Main.cs` (file-based) forces an online NuGet restore,
    # which --network none blocks. So nexlab/csharp:10 bakes a pre-restored
    # console project at /opt/csapp; at run time we copy it into the writable
    # /work, drop the student's code in as Program.cs, and build OFFLINE
    # (--no-restore) reusing the baked package cache. Needs a writable /tmp
    # (tmpfs) for .NET's mutex/shm — provided by sandbox.py for this image.
    {
        'id': 'csharp',
        'engine': 'docker',
        'image': 'nexlab/csharp:10',
        'filename': 'Main.cs',
        'compile_cmd': (
            'cp -r /opt/csapp /work/proj && '
            'cp /work/Main.cs /work/proj/Program.cs && '
            'cd /work/proj && dotnet build -c Release --no-restore -o ./out'
        ),
        'run_cmd': 'dotnet /work/proj/out/app.dll',
        'compile_timeout': 30,   # offline build of a console app ~6–10 s
        'version_label': '.NET 10 / C# 14',
        # .NET Server GC (the default) creates ONE heap per logical CPU it sees,
        # and it sees all host cores despite --cpus 1.0 (that caps quota, not the
        # visible count). It then tries to reserve memory for every heap and
        # aborts with a bogus "Out of memory" in ~1.5 s. DOTNET_gcServer=0 forces
        # the single-heap Workstation GC — correct and frugal for a 1-core box.
        # DOTNET_CLI_USE_MSBUILD_SERVER=0 keeps the build single-process.
        # With Workstation GC the measured floor is ~256 MB; 512 MB leaves 2x
        # headroom for real programs (the old 1 GB was masking the fsize bug).
        'memory_mb': 512,
        # The runner's default 8 MB RLIMIT_FSIZE makes dotnet build abort with a
        # bogus "Out of memory": .NET reserves its GC heap via a memory-mapped
        # file it ftruncates far past 8 MB. Raise the single-file write ceiling
        # to 512 MB for this toolchain (sparse — no real disk until written).
        'fsize_bytes': 536870912,
        # .NET writes its mutex/shm to /tmp regardless of HOME, so /tmp must be
        # writable even though the rootfs is --read-only. HOME=/tmp keeps the
        # CLI's own scratch off the read-only rootfs too.
        'tmpfs': ['/tmp'],
        'env_extra': {
            'HOME': '/tmp',
            'DOTNET_CLI_HOME': '/tmp',
            'DOTNET_CLI_USE_MSBUILD_SERVER': '0',
            'DOTNET_gcServer': '0',
        },
    },
    # ── R ────────────────────────────────────────────────────────────────────
    # Rscript needs a writable TMPDIR; with --read-only only /work is writable.
    # Setting TMPDIR=/work and R_USER_TEMPDIR=/work redirects R's session temp.
    {
        'id': 'r',
        'engine': 'docker',
        'image': 'r-base:latest',  # pinned by digest after first prepull
        'filename': 'main.R',
        'compile_cmd': '',
        'run_cmd': 'TMPDIR=/work R_USER_TEMPDIR=/work Rscript main.R',
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
