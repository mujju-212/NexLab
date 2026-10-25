"""
migrate_admin_p3.py — Platform Admin Phase 3 (idempotent, data-preserving).

Creates platform_metrics_daily: one row per (day, metric, scope) with the
platform-wide or per-institution value. institution_id uses the sentinel
'platform' for platform-wide rows so the composite primary key stays
NOT-NULL clean.

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          ./venv/Scripts/python.exe migrate_admin_p3.py
"""
import os

from sqlalchemy import create_engine, text

DB_URL = os.environ.get(
    'DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')


def main():
    eng = create_engine(DB_URL)
    with eng.begin() as c:
        exists = c.execute(text(
            "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='platform_metrics_daily'"
        )).first()
        if exists:
            print('[1] platform_metrics_daily already present')
        else:
            c.execute(text("""
                CREATE TABLE platform_metrics_daily (
                    day             DATE   NOT NULL,
                    metric          VARCHAR(60) NOT NULL,
                    institution_id  VARCHAR(36) NOT NULL DEFAULT 'platform',
                    value           NUMERIC  NOT NULL DEFAULT 0,
                    computed_at     TIMESTAMP NOT NULL DEFAULT now(),
                    PRIMARY KEY (day, metric, institution_id)
                )
            """))
            c.execute(text(
                "CREATE INDEX ix_pmd_metric_day ON platform_metrics_daily (metric, day)"))
            print('[1] platform_metrics_daily created')
        print('MIGRATION OK')


if __name__ == '__main__':
    main()
