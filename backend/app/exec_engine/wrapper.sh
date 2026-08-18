#!/bin/sh
# wrapper.sh — runs INSIDE the container as the container's CMD.
# Copied into /work before docker start.
# Contract:
#   Env vars injected by runner.py:
#     COMPILE_CMD      — compile command, empty string if no compile step
#     RUN_CMD          — run command
#     COMPILE_TIMEOUT  — max seconds for the compile phase (whole seconds)
#     RUN_TIMEOUT      — max seconds for the run phase (whole seconds)
#   Files already in /work before start:
#     source file  — e.g. main.py, Main.java, …
#     stdin.txt    — program's stdin (may be empty)
#   Files written by this script:
#     /work/compile.txt  — compile stdout+stderr (created even if empty)
#     /work/meta.json    — timing, exit codes, peak memory
#     /work/phase.txt    — current phase ("compile" or "run"), for timeout reporting
#     /work/timeout.txt  — "compile" or "run" when a phase hit its time limit
#
# Exit code: ALWAYS 0 — lets runner.py distinguish "wrapper ran" from "container died".
# A non-zero compile or run exit is reported inside meta.json.
set -u

# `timeout -s KILL N` exits 137 (= 128 + SIGKILL) on BOTH GNU coreutils
# (Debian: python/gcc/dotnet/r) and busybox (Alpine: jvm/node/shell) when the
# phase runs over budget. But 137 is ALSO what an OOM SIGKILL produces, so we
# can't tell timeout from OOM by exit code alone — we confirm with elapsed time.
KILLED=137

# Millisecond clock that degrades gracefully. GNU `date +%s%3N` gives ms;
# busybox has no %N, so `+%s%3N` yields just seconds (no ms digits). We detect
# that (value not longer than the plain seconds string) and scale up, so timing
# is always in milliseconds regardless of image family.
now_ms() {
    s=$(date +%s)
    ms=$(date +%s%3N 2>/dev/null || echo "$s")
    # If %3N wasn't expanded, `ms` == `s` (seconds only) → convert to ms.
    if [ "${#ms}" -le "${#s}" ]; then
        ms="${s}000"
    fi
    echo "$ms"
}

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
    ct="${COMPILE_TIMEOUT:-10}"
    ts_start=$(now_ms)
    timeout -s KILL "$ct" sh -c "$COMPILE_CMD" > /work/compile.txt 2>&1
    compile_exit=$?
    ts_end=$(now_ms)
    compile_ms=$(( ts_end - ts_start ))
    # 137 + we spent at least the whole budget ⇒ compiler timed out (not OOM,
    # which would trip far sooner). Report it as a compile timeout.
    if [ "$compile_exit" -eq "$KILLED" ] && [ "$compile_ms" -ge $(( ct * 1000 )) ]; then
        echo -n "compile" > /work/timeout.txt
        printf '\ncompiler timed out after %ss\n' "$ct" >> /work/compile.txt
    fi
    if [ $compile_exit -ne 0 ]; then
        write_meta
        exit 0   # compile failed (or timed out) — report it, do not run
    fi
else
    # No compile step — create empty compile output file
    : > /work/compile.txt
fi

# ── Run phase ─────────────────────────────────────────────────────────────────
echo -n "run" > /work/phase.txt
rt="${RUN_TIMEOUT:-5}"
ts_start=$(now_ms)
timeout -s KILL "$rt" sh -c "$RUN_CMD" < /work/stdin.txt
run_exit=$?
ts_end=$(now_ms)
run_ms=$(( ts_end - ts_start ))
# 137 + ran the full budget ⇒ time limit exceeded. 137 in less than the budget
# ⇒ OOM SIGKILL — leave timeout.txt unset so verdict.py reports a runtime error.
if [ "$run_exit" -eq "$KILLED" ] && [ "$run_ms" -ge $(( rt * 1000 )) ]; then
    echo -n "run" > /work/timeout.txt
fi

write_meta
exit 0
