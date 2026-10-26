"""Add durable, editable lesson blocks to platform exercises.

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-10-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'd8e9f0a1b2c3'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if 'platform_exercises' not in sa_inspect(bind).get_table_names():
        return
    columns = {column['name'] for column in sa_inspect(bind).get_columns('platform_exercises')}
    if 'content_blocks' not in columns:
        op.add_column('platform_exercises', sa.Column('content_blocks', sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    if 'platform_exercises' not in sa_inspect(bind).get_table_names():
        return
    columns = {column['name'] for column in sa_inspect(bind).get_columns('platform_exercises')}
    if 'content_blocks' in columns:
        op.drop_column('platform_exercises', 'content_blocks')
