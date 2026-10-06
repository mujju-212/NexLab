"""Read-only: compare the live sqlite dev.db against any reachable Postgres.

Prints table row counts for the same set of hot tables on each backend, and
whether the `virtuallab` database exists at all. Never prints credentials.
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

TABLES = ['users', 'problems', 'institutions', 'subjects', 'experiments',
          'lab_sessions', 'audit_logs', 'departments', 'sections']


def probe_sqlite(path):
    if not os.path.exists(path):
        print(f'\n[sqlite] {path} — file missing')
        return
    print(f'\n[sqlite] {path}  ({os.path.getsize(path)/1e6:.1f} MB)')
    con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    try:
        have = {r[0] for r in con.execute(
            "select name from sqlite_master where type='table'")}
        print(f'  tables: {len(have)}')
        for t in TABLES:
            if t in have:
                n = con.execute(f'select count(*) from "{t}"').fetchone()[0]
                print(f'  {t:<18} {n:>8,}')
    except Exception as exc:
        print('  read failed:', type(exc).__name__, exc)
    finally:
        con.close()


def probe_pg(host, port, dbname, user, password):
    import urllib.parse as up
    from sqlalchemy import create_engine, text
    dsn = (f"postgresql+psycopg2://{up.quote(user)}:{up.quote(password)}"
           f"@{host}:{port}/{dbname}")
    try:
        e = create_engine(dsn, pool_pre_ping=True)
        with e.connect() as c:
            v = c.execute(text('select version()')).scalar().split(' ')[0]
            print(f'\n[postgres] {host}:{port}/{dbname} — CONNECTED ({v})')
            dbs = c.execute(text(
                "select datname from pg_database where datistemplate = false"
            )).scalars().all()
            print('  databases:', list(dbs))
        from sqlalchemy import inspect
        insp = inspect(e)
        tabs = set(insp.get_table_names())
        print(f'  tables: {len(tabs)}')
        for t in TABLES:
            if t in tabs:
                with e.connect() as c:
                    n = c.execute(text(f'select count(*) from "{t}"')).scalar()
                print(f'  {t:<18} {n:>8,}')
        with e.connect() as c:
            try:
                revs = c.execute(text(
                    'select version_num from alembic_version')).scalars().all()
                print('  alembic_version:', revs)
            except Exception:
                print('  alembic_version: none')
    except Exception as exc:
        print(f'\n[postgres] {host}:{port}/{dbname} — FAILED '
              f'({type(exc).__name__}: {str(exc)[:120]})')


if __name__ == '__main__':
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    probe_sqlite(os.path.join(base, 'dev.db'))

    url = os.environ.get('DATABASE_URL', '')
    if url.startswith('postgresql'):
        import urllib.parse as up
        p = up.urlparse(url)
        print(f'\n.env DATABASE_URL -> host={p.hostname} port={p.port} db={p.path.lstrip("/")}')
        probe_pg(p.hostname, p.port or 5432,
                 p.path.lstrip('/'), p.username, p.password or '')
        # same credentials, default port 5432 (native service)
        if (p.port or 5432) != 5432:
            probe_pg('127.0.0.1', 5432, p.path.lstrip('/'), p.username,
                     p.password or '')
    else:
        print('\n.env DATABASE_URL is not postgres')
