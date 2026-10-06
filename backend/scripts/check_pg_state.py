"""Read-only: what revision/tables does the 5433 Postgres currently hold?"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402
import urllib.parse as up  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

load_dotenv()
p = up.urlparse(os.environ['DATABASE_URL'])
dsn = 'postgresql+psycopg2://%s:%s@%s:%s/%s' % (
    p.username, p.password, p.hostname, p.port or 5432, p.path.lstrip('/'))
try:
    e = create_engine(dsn)
    with e.connect() as c:
        print('CONNECTED to', p.hostname, p.port)
        try:
            rows = [r[0] for r in c.execute(text('select version_num from alembic_version'))]
            print('alembic_version:', rows)
        except Exception as exc:
            print('alembic_version: none —', str(exc)[:80])
        try:
            print('tables:', c.execute(text(
                "select count(*) from information_schema.tables "
                "where table_schema='public'")).scalar())
            print('users rows:', c.execute(text('select count(*) from users')).scalar())
        except Exception as exc:
            print('users: missing —', str(exc)[:80])
except Exception as exc:
    print('CONNECT FAILED:', type(exc).__name__, str(exc)[:120])
