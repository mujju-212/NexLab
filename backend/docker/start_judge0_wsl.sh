#!/bin/bash
# Run this inside Ubuntu WSL2 terminal AFTER enabling Docker Desktop WSL Integration
# for Ubuntu in Docker Desktop Settings → Resources → WSL Integration
#
# Open Ubuntu WSL2:  Windows Start → search "Ubuntu" → open terminal
# Then run:  bash /mnt/d/AVTIVE\ PROJ/Major\ project/backend/docker/start_judge0_wsl.sh

set -e

echo "================================================================"
echo "  Judge0 — Starting via Ubuntu WSL2 (full Linux kernel)"
echo "================================================================"
echo ""

# Check Docker is accessible
if ! command -v docker &>/dev/null; then
    echo "❌ Docker not found in this WSL2 distro."
    echo ""
    echo "Fix: Docker Desktop → Settings → Resources → WSL Integration"
    echo "     Enable toggle for 'Ubuntu' → Apply & Restart Docker Desktop"
    exit 1
fi

echo "✅ Docker found: $(docker --version)"

# Stop existing containers (docker-desktop ones)
echo ""
echo "Stopping any existing Judge0 containers..."
docker stop vlab_judge0 vlab_judge0_workers vlab_judge0_db vlab_judge0_redis 2>/dev/null || true
docker rm   vlab_judge0 vlab_judge0_workers vlab_judge0_db vlab_judge0_redis 2>/dev/null || true

# Navigate to docker folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "Starting Judge0 stack from Ubuntu WSL2..."
docker-compose -f docker-compose.judge0.yml up -d

echo ""
echo "Waiting 10s for containers to initialize..."
sleep 10

echo ""
echo "Container status:"
docker ps --filter "name=vlab" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "Testing Java (will work now with full Linux kernel)..."
sleep 3

# Quick Java test
python3 -c "
import requests, base64
def b64d(s):
    if not s: return ''
    try: return base64.b64decode(s).decode('utf-8')
    except: return s

r = requests.post('http://localhost:2358/submissions?wait=true', json={
    'source_code': 'public class Main { public static void main(String[] args) { System.out.println(\"Java works on Linux!\"); } }',
    'language_id': 62, 'stdin': ''
}, timeout=30)
d = r.json()
print(f'Java test: {d[\"status\"][\"description\"]}')
print(f'Output: {b64d(d.get(\"stdout\"))}')
print(f'Error: {b64d(d.get(\"compile_output\"))}')
" 2>/dev/null || echo "python3 requests not available — test manually at http://localhost:8765/test_ui.html"

echo ""
echo "================================================================"
echo "  Judge0 running at: http://localhost:2358"
echo "  Test UI at:        http://localhost:8765/test_ui.html"
echo "================================================================"
