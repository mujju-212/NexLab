#!/usr/bin/env bash
# backend/docker/images/prepull.sh
# Pull the 4 stock images and build the 3 custom NexLab images.
# Run this ONCE before enabling DOCKER_RUNNER_ENABLED=true.
# Safe to re-run — docker pull/build is idempotent.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "=== NexLab Execution Engine v2 — Image Prepull ==="
echo ""

# ── 1. Pull stock images ─────────────────────────────────────────────────────
stock_images=(
    "python:3.14-slim"
    "gcc:16"
    "mcr.microsoft.com/dotnet/sdk:10.0"   # base for nexlab/csharp:10 (built below)
    "r-base:latest"          # pinned by tag after first pull — see §18
)

echo "[1/2] Pulling stock images..."
for img in "${stock_images[@]}"; do
    echo "  pulling $img ..."
    docker pull "$img"
done

# ── 2. Build custom NexLab images ────────────────────────────────────────────
echo ""
echo "[2/2] Building NexLab custom images..."

echo "  building nexlab/csharp:10 (.NET 10, pre-restored console project) ..."
docker build \
    -f "${SCRIPT_DIR}/csharp.Dockerfile" \
    -t nexlab/csharp:10 \
    "${SCRIPT_DIR}"

echo "  building nexlab/jvm:25 (Java 25 + Kotlin 2.4.10) ..."
docker build \
    -f "${SCRIPT_DIR}/jvm.Dockerfile" \
    -t nexlab/jvm:25 \
    "${SCRIPT_DIR}"

echo "  building nexlab/node:24 (Node 24 + TypeScript 7) ..."
docker build \
    -f "${SCRIPT_DIR}/node.Dockerfile" \
    -t nexlab/node:24 \
    "${SCRIPT_DIR}"

echo "  building nexlab/shell:1 (Bash 5.3 + SQLite 3.5x) ..."
docker build \
    -f "${SCRIPT_DIR}/shell.Dockerfile" \
    -t nexlab/shell:1 \
    "${SCRIPT_DIR}"

# ── 3. Record versions ───────────────────────────────────────────────────────
echo ""
echo "=== Version verification ==="

echo ""
echo "Python:"
docker run --rm python:3.14-slim python --version

echo "GCC:"
docker run --rm gcc:16 gcc --version | head -1

echo ".NET SDK:"
docker run --rm mcr.microsoft.com/dotnet/sdk:10.0 dotnet --version

echo "R:"
r_version=$(docker run --rm r-base:latest Rscript -e "cat(R.version\$major, R.version\$minor, sep='.')")
echo "  R version: $r_version"
# Extract image digest so we can pin it
r_digest=$(docker inspect --format='{{index .RepoDigests 0}}' r-base:latest 2>/dev/null || echo "n/a")
echo "  r-base digest: $r_digest"

echo "Java (nexlab/jvm:25):"
docker run --rm nexlab/jvm:25 java -version 2>&1 | head -1

echo "Kotlin (nexlab/jvm:25):"
docker run --rm nexlab/jvm:25 kotlinc -version 2>&1

echo "Node (nexlab/node:24):"
docker run --rm nexlab/node:24 node --version

echo "TypeScript (nexlab/node:24):"
docker run --rm nexlab/node:24 tsc --version

echo "SQLite (nexlab/shell:1):"
docker run --rm nexlab/shell:1 sqlite3 --version

echo "Bash (nexlab/shell:1):"
docker run --rm nexlab/shell:1 bash --version | head -1

echo ""
echo "=== Disk usage ==="
docker images --format "table {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep -E "(python|gcc|dotnet|r-base|nexlab)" | sort

echo ""
echo "=== Done! All images ready. ==="
echo "    Set DOCKER_RUNNER_ENABLED=true to enable the v2 engine."
echo ""
