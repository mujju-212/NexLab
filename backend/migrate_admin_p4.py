"""
migrate_admin_p4.py — Platform Admin Phase 4: governance tables (idempotent).

  impersonation_sessions : one row per admin "view as user" session —
                           who, target, mandatory reason, start/end, revoked
  data_export_jobs       : GDPR/portability export bundles with expiry

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          ./venv/Scripts/python.exe migrate_admin_p4.py
"""
import os

from sqlalchemy import create_engine, text

DB_URL = os.environ.get(
    'DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')


def table_exists(c, name):
    return c.execute(text(
        "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=:n"
    ), {'n': name}).first() is not None


def main():
    eng = create_engine(DB_URL)
    with eng.begin() as c:
        if not table_exists(c, 'impersonation_sessions'):
            c.execute(text("""
                CREATE TABLE impersonation_sessions (
                    id          VARCHAR(36) PRIMARY KEY,
                    admin_id    VARCHAR(36) NOT NULL REFERENCES users(id),
                    target_id   VARCHAR(36) NOT NULL REFERENCES users(id),
                    reason      TEXT NOT NULL,
                    started_at  TIMESTAMP NOT NULL DEFAULT now(),
                    ended_at    TIMESTAMP,
                    revoked     BOOLEAN NOT NULL DEFAULT false
                )
            """))
            c.execute(text(
                "CREATE INDEX ix_imp_sessions_target ON impersonation_sessions (target_id)"))
            print('[1] impersonation_sessions created')
        else:
            print('[1] impersonation_sessions already present')

        if not table_exists(c, 'data_export_jobs'):
            c.execute(text("""
                CREATE TABLE data_export_jobs (
                    id           VARCHAR(36) PRIMARY KEY,
                    user_id      VARCHAR(36) NOT NULL REFERENCES users(id),
                    requested_by VARCHAR(36) NOT NULL REFERENCES users(id),
                    kind         VARCHAR(20) NOT NULL,
                    status       VARCHAR(16) NOT NULL DEFAULT 'pending',
                    file_path    TEXT,
                    created_at   TIMESTAMP NOT NULL DEFAULT now(),
                    expires_at   TIMESTAMP NOT NULL
                )
            """))
            c.execute(text(
                "CREATE INDEX ix_export_jobs_user ON data_export_jobs (user_id)"))
            print('[2] data_export_jobs created')
        else:
            print('[2] data_export_jobs already present')
        print('MIGRATION OK')


if __name__ == '__main__':
    main()
