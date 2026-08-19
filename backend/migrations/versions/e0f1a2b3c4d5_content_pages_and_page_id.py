"""content pages + page_id on content_modules

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-08-22

Adds multi-page support to experiment pre-lab content:
- new `content_pages` table (a page/tab inside an experiment)
- nullable `page_id` FK + index on `content_modules` (which page a block lives on)

Idempotent: the table is skipped if it already exists, and the column is skipped
if it is already present, so this can be applied safely on a partially-migrated DB.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e0f1a2b3c4d5'
down_revision = 'd9e0f1a2b3c4'
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

    if 'content_pages' not in have:
        op.create_table(
            'content_pages',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('experiment_id', sa.String(length=36), nullable=False),
            sa.Column('title', sa.Text(), nullable=False),
            sa.Column('display_order', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_content_pages_experiment_id', 'content_pages', ['experiment_id'])

    if 'content_modules' in have and 'page_id' not in _columns('content_modules'):
        op.add_column('content_modules', sa.Column('page_id', sa.String(length=36), nullable=True))
        op.create_index('ix_content_modules_page_id', 'content_modules', ['page_id'])
        op.create_foreign_key(
            'fk_content_modules_page_id', 'content_modules', 'content_pages',
            ['page_id'], ['id'],
        )


def downgrade():
    have = _existing_tables()

    if 'content_modules' in have and 'page_id' in _columns('content_modules'):
        try:
            op.drop_constraint('fk_content_modules_page_id', 'content_modules', type_='foreignkey')
        except Exception:
            pass
        try:
            op.drop_index('ix_content_modules_page_id', table_name='content_modules')
        except Exception:
            pass
        op.drop_column('content_modules', 'page_id')

    if 'content_pages' in have:
        op.drop_table('content_pages')
