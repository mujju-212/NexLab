#!/bin/sh
# wrapper.sh — runs INSIDE the container as the container's CMD.
# Copied into /work before docker start.
# Contract:
#   Env vars injected by runner.py:
#     COMPILE_CMD  — compile command, empty string if no compile step
#     RUN_CMD      — run command
#   Files already in /work before start:
#     source file  — e.g. main.py, Main.java, …
#     stdin.txt    — program's stdin (may be empty)
#   Files written by this script:
#     /work/compile.txt  — compile stdout+stderr (created even if empty)
#     /work/meta.json    — timing, exit codes, peak memory
#     /work/phase.txt    — current phase ("compile" or "run"), for timeout reporting
#
# Exit code: ALWAYS 0 — lets runner.py distinguish "wrapper ran" from "container died".
# A non-zero compile or run exit is reported inside meta.json.
set -u

write_meta() {
    # peak memory: try cgroup v1 first, then v2
    peak=$(cat /sys/fs/cgroup/memory/memory.max_usage_in_bytes 2>/dev/null \
        || cat /sys/fs/cgroup/memory.peak 2>/dev/null \
        || echo "")
    cat > /work/meta.json <<EOF
{
  "compile_exit": ${compile_exit:-0},
  "run_exit":     ${run_exit:-0},
  "compile_ms":   ${compile_ms:-0},
  "run_ms":       ${run_ms:-0},
  "peak_bytes":   ${peak:-null}
}
EOF
}

compile_exit=0
run_exit=0
compile_ms=0
run_ms=0

# ── Compile phase (optional) ──────────────────────────────────────────────────
if [ -n "${COMPILE_CMD:-}" ]; then
    echo -n "compile" > /work/phase.txt
    ts_start=$(date +%s%3N 2>/dev/null || date +%s)
    sh -c "$COMPILE_CMD" > /work/compile.txt 2>&1
    compile_exit=$?
    ts_end=$(date +%s%3N 2>/dev/null || date +%s)
    compile_ms=$(( ts_end - ts_start ))
    if [ $compile_exit -ne 0 ]; then
        write_meta
        exit 0   # compile failed — report it, do not run
    fi
else
    # No compile step — create empty compile output file
    : > /work/compile.txt
fi

# ── Run phase ─────────────────────────────────────────────────────────────────
echo -n "run" > /work/phase.txt
ts_start=$(date +%s%3N 2>/dev/null || date +%s)
sh -c "$RUN_CMD" < /work/stdin.txt
run_exit=$?
ts_end=$(date +%s%3N 2>/dev/null || date +%s)
run_ms=$(( ts_end - ts_start ))

write_meta
exit 0
