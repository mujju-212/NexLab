"""Read-only: diff every db.Model's columns against the live Postgres schema.

Prints, per table: missing columns (in model, not in DB) and their types.
Extra DB columns (in DB, not in model) are listed too — those are usually
fine (legacy) but flag them for review.
"""
import os
import sys
import urllib.parse as up

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

p = up.urlparse(os.environ['DATABASE_URL'])
os.environ['SQLALCHEMY_DATABASE_URI_OVERRIDE'] = '1'
from sqlalchemy import create_engine, inspect  # noqa: E402
from app.extensions import db  # noqa: E402
import app.models  # noqa: E402,F401  — registers all models

dsn = 'postgresql+psycopg2://%s:%s@%s:%s/%s' % (
    p.username, p.password, p.hostname, p.port or 5432, p.path.lstrip('/'))
e = create_engine(dsn)
insp = inspect(e)
db_tables = set(insp.get_table_names())

registry = db.Model.registry
problems = 0
for mapper in registry.mappers:
    t = mapper.local_table
    table = t.name
    if table not in db_tables:
        print(f'### TABLE MISSING in DB: {table} (model {mapper.class_.__name__})')
        problems += 1
        continue
    db_cols = {c['name'] for c in insp.get_columns(table)}
    model_cols = {c.name for c in t.columns}
    missing = model_cols - db_cols
    extra = db_cols - model_cols
    if missing:
        details = []
        for c in t.columns:
            if c.name in missing:
                details.append(f'{c.name} {c.type!r} null={not c.nullable}')
        print(f'### {table}: MISSING COLUMNS -> {details}')
        problems += 1
    if extra:
        print(f'    ({table}: extra-in-db (probably fine): {sorted(extra)})')

print(f'\nDone. {problems} table(s) with model/DB divergence.')
