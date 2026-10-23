#!/usr/bin/env bash
# up.sh — keep the whole stack alive in one process tree.
#
#   postgres :5433  ->  Flask :5000  ->  Next.js :3000   (local only, no tunnel)
#
# Every child is re-launched if it exits, and the public URL is printed to
# /home/user/.tunnel-url so it can be read without scraping a log.
set -u
cd "$(dirname "$0")"
ROOT="$(pwd)"

say() { echo "[up] $*"; }

# ── postgres ────────────────────────────────────────────────────────────────
if ! (exec 3<>/dev/tcp/127.0.0.1/5433) 2>/dev/null; then
  say "starting postgres"
  sudo pg_ctlcluster 17 main start 2>/dev/null || true
  sleep 3
fi

# ── backend ─────────────────────────────────────────────────────────────────
ensure_backend() {
  if (exec 3<>/dev/tcp/127.0.0.1/5000) 2>/dev/null; then return; fi
  say "starting backend :5000"
  ( cd "$ROOT/backend" && PORT=5000 HOST=0.0.0.0 FLASK_ENV=development \
      nohup python3 run.py >> /tmp/backend.log 2>&1 & )
  for _ in $(seq 1 40); do
    (exec 3<>/dev/tcp/127.0.0.1/5000) 2>/dev/null && return
    sleep 1
  done
}

# ── frontend ────────────────────────────────────────────────────────────────
ensure_frontend() {
  if (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then return; fi
  # node_modules and .next are NOT part of the persisted snapshot, so after a
  # sandbox restart they are missing; rebuild before trying to serve.
  if [ ! -d "$ROOT/frontend/node_modules" ]; then
    say "node_modules missing — npm ci (about 15s)"
    ( cd "$ROOT/frontend" && npm ci --legacy-peer-deps --no-audit --no-fund >> /tmp/frontend.log 2>&1 )
  fi
  if [ ! -f "$ROOT/frontend/.next/BUILD_ID" ]; then
    say "no production build — next build (about 2 min)"
    ( cd "$ROOT/frontend" && NODE_OPTIONS="--max-old-space-size=2000" NEXT_LOCAL_START=1 \
        npx next build >> /tmp/build.log 2>&1 )
  fi
  say "starting frontend :3000"
  ( cd "$ROOT/frontend" && NODE_OPTIONS="--max-old-space-size=1500" \
      nohup npx next start -H 0.0.0.0 -p 3000 >> /tmp/frontend.log 2>&1 & )
  for _ in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && return
    sleep 1
  done
}

ensure_backend
ensure_frontend

say "stack up — supervising (Ctrl-C to stop)"
while true; do
  ensure_backend
  ensure_frontend
  sleep 20
done
