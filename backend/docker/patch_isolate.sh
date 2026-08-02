#!/bin/bash
# Patch isolate_job.rb to remove the -m memory flag from isolate commands
# This allows Java JVM and Node.js V8 to allocate virtual address space freely
# CPU time limits still apply — only the virtual address space cap is removed

FILE="/api/app/jobs/isolate_job.rb"

echo "Backing up $FILE..."
cp "$FILE" "${FILE}.bak"

echo "Patching -m memory limit lines..."

# Remove -m MAX_MEMORY_LIMIT from compile and extract phases (lines 97, 143)
# Remove -m submission.memory_limit from run phase (line 215)
python3 - <<'PYEOF'
import re

with open('/api/app/jobs/isolate_job.rb', 'r') as f:
    content = f.read()

original = content

# Pattern 1: remove the -m MAX_MEMORY_LIMIT line from isolate commands
content = re.sub(
    r'\s*\#\{submission\.enable_per_process_and_thread_memory_limit \? "-m " : "--cg-mem="\}\#\{Config::MAX_MEMORY_LIMIT\} \\\\\n',
    ' \\\n',
    content
)

# Pattern 2: remove the -m submission.memory_limit line from run command
content = re.sub(
    r'\s*\#\{submission\.enable_per_process_and_thread_memory_limit \? "-m " : "--cg-mem="\}\#\{submission\.memory_limit\} \\\\\n',
    ' \\\n',
    content
)

if content == original:
    print("ERROR: No changes made — patterns not found. Checking file...")
    import subprocess
    subprocess.run(['grep', '-n', 'enable_per_process_and_thread_memory_limit', '/api/app/jobs/isolate_job.rb'])
else:
    with open('/api/app/jobs/isolate_job.rb', 'w') as f:
        f.write(content)
    print("SUCCESS: Memory limit flags removed from isolate commands")

# Verify
with open('/api/app/jobs/isolate_job.rb', 'r') as f:
    lines = f.readlines()
for i, line in enumerate(lines, 1):
    if 'memory_limit' in line and 'enable_per_process' in line:
        print(f"Line {i}: {line.rstrip()}")
PYEOF

echo ""
echo "Verifying patch..."
grep -n "enable_per_process_and_thread_memory_limit" "$FILE"
echo ""
echo "Done. Restarting Rails server..."
kill -HUP 1 2>/dev/null || true
