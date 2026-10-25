"""
migrate_admin_p1.py — Platform Admin Phase 1 (idempotent, data-preserving).

  1. users: administrative lifecycle columns
       status            'active' | 'suspended' | 'pending_deletion'
       suspension_reason TEXT
       suspended_until   TIMESTAMP (optional temp-ban expiry)
     (JWT revocation reuses the existing users.force_logout_at mechanism —
      no token_version column needed.)
  2. audit_logs.institution_id -> NULLable, so platform-scope admin actions
     (users with no tenant) can be audited. Tenant views filter by
     institution_id and never see NULL rows; the platform audit viewer
     shows everything.

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          ./venv/Scripts/python.exe migrate_admin_p1.py
"""
import os
import sys

from sqlalchemy import create_engine, text

DB_URL = os.environ.get(
    'DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')


def column_exists(c, table, column):
    return c.execute(text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=:t AND column_name=:c"
    ), {'t': table, 'c': column}).first() is not None


def main():
    eng = create_engine(DB_URL)
    with eng.begin() as c:
        # 1. users lifecycle columns
        for ddl, name in (
            ("ALTER TABLE users ADD COLUMN status VARCHAR(16) DEFAULT 'active'", 'status'),
            ("ALTER TABLE users ADD COLUMN suspension_reason TEXT", 'suspension_reason'),
            ("ALTER TABLE users ADD COLUMN suspended_until TIMESTAMP", 'suspended_until'),
        ):
            if not column_exists(c, 'users', name):
                c.execute(text(ddl))
                print(f"[1] users.{name} added")
            else:
                print(f"[1] users.{name} already present")
        n = c.execute(text(
            "UPDATE users SET status='active' WHERE status IS NULL")).rowcount
        print(f"[1] backfilled status='active' on {n} row(s)")

        # 2. audit_logs.institution_id nullable
        null_ok = c.execute(text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='audit_logs' "
            "AND column_name='institution_id'")).scalar()
        if null_ok == 'NO':
            c.execute(text(
                'ALTER TABLE audit_logs ALTER COLUMN institution_id DROP NOT NULL'))
            print('[2] audit_logs.institution_id is now NULLable (platform-scope audits)')
        else:
            print('[2] audit_logs.institution_id already nullable')

        cols = [r[0] for r in c.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='users' AND column_name IN "
            "('status','suspension_reason','suspended_until')"))]
        assert len(cols) == 3, f'missing columns: {cols}'
        print('MIGRATION OK')


if __name__ == '__main__':
    main()
