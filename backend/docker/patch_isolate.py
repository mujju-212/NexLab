#!/usr/bin/env python3
"""
patch_isolate.py
─────────────────
Removes isolate's -m (virtual address space) flag from Judge0's isolate_job.rb.

WHY: Java JVM and Node.js V8 require large virtual address space mappings at
startup (typically 512MB-1GB virtual). Isolate's -m flag caps this, causing:
  "Could not reserve enough space for 256000KB object heap"
Removing the -m flag means virtual memory is unlimited; CPU time limits still
apply so runaway code is still killed.

This script is mounted into the container and runs before the server/workers
start so the patch is applied fresh on every container launch.
"""

import sys, os

TARGET = "/api/app/jobs/isolate_job.rb"
BACKUP = TARGET + ".orig"

def main():
    if not os.path.exists(TARGET):
        print(f"[patch] ERROR: {TARGET} not found", flush=True)
        sys.exit(0)  # don't block startup

    with open(TARGET, "r") as f:
        lines = f.readlines()

    # Save original once
    if not os.path.exists(BACKUP):
        with open(BACKUP, "w") as f:
            f.writelines(lines)
        print(f"[patch] Original saved to {BACKUP}", flush=True)

    # Lines to remove (1-indexed): the three -m / --cg-mem= lines
    # We identify them by content rather than hardcoded line numbers
    # so this works across judge0 version minor changes
    REMOVE_PATTERNS = [
        'enable_per_process_and_thread_memory_limit ? "-m " : "--cg-mem="',
    ]

    removed = 0
    new_lines = []
    for i, line in enumerate(lines, 1):
        should_remove = any(p in line for p in REMOVE_PATTERNS)
        # Keep the @cgroups assignment line (line ~57) — only remove isolate command args
        if should_remove and ("MAX_MEMORY_LIMIT" in line or "submission.memory_limit}" in line):
            print(f"[patch] Removing line {i}: {line.strip()[:70]}", flush=True)
            removed += 1
            # Don't add this line (effectively removes it)
        else:
            new_lines.append(line)

    if removed == 0:
        print("[patch] Already patched or patterns not found — no changes made", flush=True)
    else:
        with open(TARGET, "w") as f:
            f.writelines(new_lines)
        print(f"[patch] ✅ Patched {removed} line(s) — isolate -m flag removed", flush=True)

if __name__ == "__main__":
    main()
