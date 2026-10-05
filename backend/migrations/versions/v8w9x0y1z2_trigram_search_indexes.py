"""trigram_search_indexes

Revision ID: v8w9x0y1z2
Revises: u7v8w9x0y1
Create Date: 2026-09-15

Postgres-only: GIN trigram indexes for the admin search boxes, which run
`ILIKE '%term%'` (list_users ?q=, /institution/search, audit-log ?q=).
A plain btree can't serve leading-wildcard patterns — at 279 users seq scans
are fine, but this is the index that keeps search fast as a tenant grows to
tens of thousands of rows. sqlite has no pg_trgm, so upgrade() no-ops there.

Run ANALYZE afterwards isn't required; Postgres updates stats on its own.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'v8w9x0y1z2'
down_revision = 'u7v8w9x0y1'
branch_labels = None
depends_on = None


# (index_name, table, expression_column)
TRIGRAM_INDEXES = [
    ('trgm_users_full_name',  'users', 'full_name'),
    ('trgm_users_email',      'users', 'email'),
    ('trgm_users_roll_number','users', 'roll_number'),
    ('trgm_users_staff_id',   'users', 'staff_id'),
    ('trgm_audit_detail',     'audit_logs', 'detail'),
    ('trgm_session_title',    'lab_sessions', 'title'),
    ('trgm_section_name',     'sections', 'name'),
]


def _is_postgres():
    return op.get_bind().dialect.name == 'postgresql'


def upgrade():
    if not _is_postgres():
        return
    conn = op.get_bind()
    conn.execute(sa.text('CREATE EXTENSION IF NOT EXISTS pg_trgm'))
    insp = sa_inspect(conn)
    tables = set(insp.get_table_names())
    for name, table, col in TRIGRAM_INDEXES:
        if table not in tables:
            continue
        cols_present = {c['name'] for c in insp.get_columns(table)}
        if col not in cols_present:
            continue
        existing = {i['name'] for i in insp.get_indexes(table)}
        if name in existing:
            continue
        conn.execute(sa.text(
            f'CREATE INDEX {name} ON {table} USING gin ({col} gin_trgm_ops)'))


def downgrade():
    if not _is_postgres():
        return
    conn = op.get_bind()
    for name, table, col in TRIGRAM_INDEXES:
        conn.execute(sa.text(f'DROP INDEX IF EXISTS {name}'))
