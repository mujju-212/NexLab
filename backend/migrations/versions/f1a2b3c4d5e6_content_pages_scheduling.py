"""content_pages scheduling: release_at + is_live

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-08-22

Per-page scheduling for instructor-controlled content release:
  - release_at   TIMESTAMP NULL   — schedule a future go-live UTC datetime
  - is_live      BOOLEAN NOT NULL DEFAULT FALSE — instant publish toggle

A page is visible to students when is_live=True OR release_at <= now().

Idempotent: each ALTER is skipped if the column already exists.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e0f1a2b3c4d5'
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _columns(table):
    return {c['name'] for c in _inspector().get_columns(table)}


def upgrade():
    cols = _columns('content_pages')

    if 'release_at' not in cols:
        op.add_column('content_pages', sa.Column('release_at', sa.DateTime(), nullable=True))

    if 'is_live' not in cols:
        op.add_column(
            'content_pages',
            sa.Column('is_live', sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade():
    cols = _columns('content_pages')

    if 'is_live' in cols:
        op.drop_column('content_pages', 'is_live')

    if 'release_at' in cols:
        op.drop_column('content_pages', 'release_at')
