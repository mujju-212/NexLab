#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-all.sh — launch the full local stack (no Docker)
#   Postgres 17 :5433  ->  Flask API :5000  ->  Next.js :3000
#
# Production build is used (not `next dev`) because this box has 1.9 GB RAM;
# the dev compiler gets killed on the heavy analytics routes. A production
# build serves the same pages in ~10 ms with no on-demand compiling.
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"

echo "▶ Postgres (5433)..."
if ! pg_isready -h 127.0.0.1 -p 5433 -q 2>/dev/null; then
  sudo pg_ctlcluster 17 main start 2>/dev/null || true
  for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p 5433 -q && break; sleep 1; done
fi
pg_isready -h 127.0.0.1 -p 5433 -q && echo "  ✓ database ready"

# swap keeps Node from being OOM-killed on a 1.9 GB box
if [ -f /swapfile ] && ! grep -q swapfile /proc/swaps; then
  sudo swapon /swapfile 2>/dev/null || true
fi

echo "▶ Backend (Flask on :5000)..."
pkill -f "python3 run.py" 2>/dev/null || true
( cd backend && PORT=5000 HOST=0.0.0.0 FLASK_ENV=development \
    nohup python3 run.py > /tmp/backend.log 2>&1 & )
for i in $(seq 1 45); do curl -sf -o /dev/null http://127.0.0.1:5000/ && break; sleep 1; done
curl -sf -o /dev/null http://127.0.0.1:5000/ && echo "  ✓ API ready ($(grep -c route backend/app/__init__.py >/dev/null; echo up))"

echo "▶ Frontend (Next.js on :3000)..."
[ -d frontend/node_modules ] || ( cd frontend && npm ci --legacy-peer-deps --no-audit --no-fund )
if [ ! -f frontend/.next/BUILD_ID ]; then
  echo "  building (first run only, ~2 min)..."
  ( cd frontend && NODE_OPTIONS="--max-old-space-size=1536" NEXT_LOCAL_START=1 \
      npx next build > /tmp/build.log 2>&1 ) || { echo "  ✗ build failed — see /tmp/build.log"; exit 1; }
fi
pkill -f "next start" 2>/dev/null || true
( cd frontend && NODE_OPTIONS="--max-old-space-size=1200" \
    nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/frontend.log 2>&1 & )
for i in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3000/login && break; sleep 1; done
curl -sf -o /dev/null http://127.0.0.1:3000/login && echo "  ✓ UI ready"

echo
echo "──────────────────────────────────────────────────────────────"
echo " Frontend : http://localhost:3000"
echo " Backend  : http://localhost:5000"
echo " Postgres : postgresql://postgres:vlabpass@localhost:5433/virtuallab"
echo " Logs     : /tmp/backend.log  /tmp/frontend.log  /tmp/build.log"
echo "──────────────────────────────────────────────────────────────"
echo " Login    : superadmin@nexlab.io / SuperAdmin@2026  (platform admin)"
