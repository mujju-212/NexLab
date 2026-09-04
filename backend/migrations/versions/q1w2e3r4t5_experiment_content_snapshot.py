"""experiment published_content snapshot (draft -> republish)

Revision ID: q1w2e3r4t5
Revises: p2q3r4s5t6u7
Create Date: 2026-09-06

Adds staged-publishing columns to `experiments`:
- published_content    JSON      — frozen snapshot students read until republish
- content_dirty        BOOLEAN   — live edits not yet published
- content_published_at DATETIME  — last publish/republish timestamp (UTC)

Idempotent: each column is skipped if it already exists, so this can be applied
safely on a partially-migrated DB.
"""
from alembic import op
import sqlalchemy as sa

revision = 'q1w2e3r4t5'
down_revision = 'p2q3r4s5t6u7'
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _existing_tables():
    return set(_inspector().get_table_names())


def _columns(table):
    return {c['name'] for c in _inspector().get_columns(table)}


def upgrade():
    have = _existing_tables()
    if 'experiments' not in have:
        return

    cols = _columns('experiments')
    if 'published_content' not in cols:
        op.add_column('experiments', sa.Column('published_content', sa.JSON(), nullable=True))
    if 'content_dirty' not in cols:
        op.add_column('experiments', sa.Column('content_dirty', sa.Boolean(), nullable=True))
    if 'content_published_at' not in cols:
        op.add_column('experiments', sa.Column('content_published_at', sa.DateTime(), nullable=True))


def downgrade():
    have = _existing_tables()
    if 'experiments' not in have:
        return

    cols = _columns('experiments')
    for col in ('content_published_at', 'content_dirty', 'published_content'):
        if col in cols:
            op.drop_column('experiments', col)
