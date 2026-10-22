"""AI Harness document chunk table (pgvector-ready semantic RAG).

Revision ID: pgdoc1
Revises: x0y1z2a3b4
Create Date: 2026-10-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'pgdoc1'
down_revision = 'x0y1z2a3b4'
branch_labels = None
depends_on = None


def _table_exists(name):
    return name in sa_inspect(op.get_bind()).get_table_names()


def upgrade():
    if not _table_exists('ai_document_chunks'):
        op.create_table(
            'ai_document_chunks',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('document_id', sa.String(36),
                      sa.ForeignKey('institution_documents.id', ondelete='CASCADE'), nullable=False),
            sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=True),
            sa.Column('scope_type', sa.String(30), server_default='institution'),
            sa.Column('scope_id', sa.String(36), nullable=True),
            sa.Column('chunk_index', sa.Integer(), server_default='0'),
            sa.Column('chunk_id', sa.String(255), nullable=False),
            sa.Column('text', sa.Text(), nullable=False),
            sa.Column('page', sa.Integer(), nullable=True),
            sa.Column('embedding', sa.JSON(), nullable=True),  # portable; pgvector type enabled at model layer
            sa.Column('created_at', sa.DateTime()),
        )
    for idx, tbl, cols in [
        ('ix_ai_chunks_document_id', 'ai_document_chunks', ['document_id']),
        ('ix_ai_chunks_scope', 'ai_document_chunks', ['institution_id', 'scope_type', 'scope_id']),
    ]:
        if idx not in [i['name'] for i in sa_inspect(op.get_bind()).get_indexes(tbl)]:
            op.create_index(idx, tbl, cols)


def downgrade():
    if _table_exists('ai_document_chunks'):
        op.drop_table('ai_document_chunks')
