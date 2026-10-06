"""
Read-only DB audit: which indexes actually exist on the hot admin tables,
and what Alembic thinks the schema revision is.

Run from the backend dir with the venv python:
    venv/Scripts/python.exe scripts/audit_db_performance.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.config import config  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402

URI = config['development'].SQLALCHEMY_DATABASE_URI

HOT_TABLES = [
    'users', 'audit_logs', 'lab_sessions', 'section_students',
    'section_subjects', 'departments', 'subjects', 'batches', 'sections',
    'session_attendance', 'academic_years', 'institutions',
]

# Indexes this pass expects to exist after the new migration runs.
EXPECTED_NEW = [
    ('users', 'ix_users_department_id'),
    ('users', 'ix_users_institution_id_full_name'),
    ('users', 'ix_users_institution_id_role_is_active'),
    ('audit_logs', 'ix_audit_logs_institution_created'),
    ('audit_logs', 'ix_audit_logs_institution_action'),
    ('audit_logs', 'ix_audit_logs_institution_module'),
    ('audit_logs', 'ix_audit_logs_institution_severity'),
    ('lab_sessions', 'ix_lab_sessions_iid_status_scheduled'),
    ('lab_sessions', 'ix_lab_sessions_iid_scheduled'),
    ('section_students', 'ix_section_students_student_id'),
]


def main():
    print(f'DATABASE URI : {URI}')
    if not URI.startswith('postgresql'):
        print('\n!! NOT connected to Postgres — falling back to sqlite.')
        print('!! Fix: run from the backend dir so .env is loaded (DATABASE_URL must be set).')
        return 1

    engine = create_engine(URI)
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    with engine.connect() as conn:
        try:
            revs = conn.execute(text('SELECT version_num FROM alembic_version')).scalars().all()
            print(f'alembic_version: {revs}')
        except Exception as exc:
            print(f'alembic_version: unavailable ({exc})')

        print('\n── row counts ──')
        for t in HOT_TABLES:
            if t not in tables:
                print(f'  {t:<22} TABLE MISSING')
                continue
            n = conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar()
            print(f'  {t:<22} {n:>9,} rows')

    print('\n── indexes on hot tables ──')
    for t in HOT_TABLES:
        if t not in tables:
            continue
        idx = insp.get_indexes(t)
        print(f'\n{t} ({len(idx)} index(es))')
        for i in sorted(idx, key=lambda x: x['name']):
            flag = 'uq' if i.get('unique') else ''
            # sqlite inspector uses 'colnames', postgres uses 'column_names'
            cols = i.get('column_names') or i.get('colnames') or []
            print(f"   {i['name']:<46} ({', '.join(cols)}) {flag}")

        # FK columns with no index leading with them -> unindexed joins/checks
        idx_cols = {tuple(i.get('column_names') or i.get('colnames') or [])
                    for i in idx}
        for fk in insp.get_foreign_keys(t):
            cols = tuple(fk['constrained_columns'])
            covered = any(c[:len(cols)] == cols for c in idx_cols)
            if not covered:
                print(f'   !! UNINDEXED FK: {", ".join(cols)}')

    print('\n── expected new indexes ──')
    present = {(t, i['name']) for t in tables for i in insp.get_indexes(t)}
    for t, name in EXPECTED_NEW:
        print(f'   {"ok  " if (t, name) in present else "TODO"}  {t}.{name}')

    print('\n── Postgres extension check (for future trigram search) ──')
    with engine.connect() as conn:
        try:
            exts = conn.execute(text('SELECT name FROM pg_available_extensions '
                                     "WHERE name IN ('pg_trgm','btree_gin')")).scalars().all()
            print(f'   available: {list(exts) or "none"}')
            inst = conn.execute(text("SELECT name FROM pg_extension")).scalars().all()
            print(f'   installed: {list(inst)}')
        except Exception as exc:
            print(f'   check failed: {exc}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
