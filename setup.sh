#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup.sh — one-shot local bootstrap for NexLab (no Docker)
#   Postgres 17 (*:5433) → Python deps → schema + seeds → Node deps
# Idempotent: safe to re-run.
# ─────────────────────────────────────────────────────────────────────────────
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"

# Demo/seed data is OFF by default — pass --seed to load it.
SEED=0
[ "${1:-}" = "--seed" ] && SEED=1

echo "═══ 1/5  PostgreSQL ═══"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql postgresql-contrib
fi
if ! grep -q '^port = 5433' /etc/postgresql/17/main/postgresql.conf; then
  sudo sed -i "s/^#\?port = .*/port = 5433/" /etc/postgresql/17/main/postgresql.conf
fi
sudo pg_ctlcluster 17 main start 2>/dev/null || true
for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p 5433 -q && break; sleep 1; done
sudo -u postgres psql -p 5433 -c "ALTER USER postgres WITH PASSWORD 'vlabpass';" >/dev/null
sudo -u postgres psql -p 5433 -tc "SELECT 1 FROM pg_database WHERE datname='virtuallab'" | grep -q 1 \
  || sudo -u postgres createdb -p 5433 virtuallab
echo "  ✓ postgres on :5433 / db virtuallab"

echo "═══ 2/5  Swap (1.9 GB RAM box needs headroom for Next.js) ═══"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "  ✓ 4 GB swapfile enabled"
else
  sudo swapon /swapfile 2>/dev/null || true
  echo "  ✓ swapfile present"
fi

echo "═══ 3/5  Python deps ═══"
pip install -q flask==3.0.3 flask-sqlalchemy==3.1.1 flask-migrate==4.0.7 \
  flask-jwt-extended==4.6.0 flask-cors==4.0.1 flask-socketio==5.3.6 \
  "simple-websocket>=1.0" flask-limiter==3.7.0 sqlalchemy==2.0.36 waitress==3.0.2 \
  apscheduler==3.10.4 requests==2.32.3 tenacity==8.3.0 bcrypt==4.1.3 \
  python-dotenv==1.0.1 python-dateutil==2.9.0 pypdf==4.3.1 pytest==8.2.2 pytest-flask==1.3.0 \
  sib-api-v3-sdk==7.6.0
# 2.9.9 has no cp313 wheel — 2.9.13 does
pip install -q "psycopg2-binary>=2.9.10"
echo "  ✓ python packages installed"

echo "═══ 4/5  Database schema + seed data ═══"
cd "$ROOT/backend"
# NOTE: the alembic chain is broken from scratch (migration f52545adbcdb re-creates
# the whole schema), so we build tables from the models — the project's own
# migrate_missing_columns.py helper does exactly this.
python3 migrate_missing_columns.py
# Raw-SQL tables that db.create_all() cannot build (idempotent):
python3 migrate_admin_p3.py   # platform_metrics_daily (platform admin metrics)
export PGPASSWORD=vlabpass
for t in free_courses free_exercises practice_problems; do
  psql -h 127.0.0.1 -p 5433 -U postgres -d virtuallab -q \
    -c "ALTER TABLE $t ALTER COLUMN difficulty TYPE VARCHAR(20);" 2>/dev/null || true
done
if [ "$SEED" = "1" ]; then
  echo "  → --seed passed: loading demo data"
  python3 run_all_seeds.py || true
  python3 database/seed_free_courses.py || true
  python3 database/seed_simulation_courses.py || true
else
  echo "  ✓ schema only — no demo data (use ./setup.sh --seed if you want it)"
fi

echo "═══ 5/5  Frontend deps ═══"
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
  # npm's strict peer resolver rejects next@15.0.0 + react@19.0.0 (the combo in package-lock.json)
  npm ci --legacy-peer-deps --no-audit --no-fund
fi
echo "  ✓ node_modules ready"

echo
echo "Done. Run ./start-all.sh to launch."
