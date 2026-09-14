"""Admin AI Copilot tables (chat sessions, messages, documents).

Revision ID: s4t5u6v7w8
Revises: r3s4t5u6v7
Create Date: 2026-09-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 's4t5u6v7w8'
down_revision = 'r3s4t5u6v7'
branch_labels = None
depends_on = None


def _table_exists(name):
    conn = op.get_bind()
    return name in sa_inspect(conn).get_table_names()


def _index_exists(name):
    conn = op.get_bind()
    insp = sa_inspect(conn)
    for tbl in insp.get_table_names():
        for idx in insp.get_indexes(tbl):
            if idx['name'] == name:
                return True
    return False


def upgrade():
    if not _table_exists('admin_chat_sessions'):
        op.create_table(
            'admin_chat_sessions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('title', sa.String(255), server_default='New Conversation'),
            sa.Column('mode', sa.String(20), server_default='chat'),
            sa.Column('is_pinned', sa.Boolean(), server_default=sa.text('0')),
            sa.Column('created_at', sa.DateTime()),
            sa.Column('updated_at', sa.DateTime()),
        )
    for idx, tbl, cols in [
        ('ix_admin_chat_sessions_institution_id', 'admin_chat_sessions', ['institution_id']),
        ('ix_admin_chat_sessions_user_id', 'admin_chat_sessions', ['user_id']),
        ('ix_admin_chat_sessions_created_at', 'admin_chat_sessions', ['created_at']),
        ('ix_admin_chat_sessions_updated_at', 'admin_chat_sessions', ['updated_at']),
    ]:
        if not _index_exists(idx):
            op.create_index(idx, tbl, cols)

    if not _table_exists('admin_chat_messages'):
        op.create_table(
            'admin_chat_messages',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('session_id', sa.String(36),
                       sa.ForeignKey('admin_chat_sessions.id', ondelete='CASCADE'), nullable=False),
            sa.Column('role', sa.String(20), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('mode', sa.String(20), server_default='chat'),
            sa.Column('tool_calls', sa.JSON()),
            sa.Column('pending_action', sa.JSON(), nullable=True),
            sa.Column('sources', sa.JSON()),
            sa.Column('total_tokens', sa.Integer(), server_default='0'),
            sa.Column('created_at', sa.DateTime()),
        )
    for idx, tbl, cols in [
        ('ix_admin_chat_messages_session_id', 'admin_chat_messages', ['session_id']),
        ('ix_admin_chat_messages_created_at', 'admin_chat_messages', ['created_at']),
    ]:
        if not _index_exists(idx):
            op.create_index(idx, tbl, cols)

    if not _table_exists('institution_documents'):
        op.create_table(
            'institution_documents',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('uploaded_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('filename', sa.String(255), nullable=False),
            sa.Column('file_path', sa.String(512), nullable=False),
            sa.Column('file_size', sa.Integer(), server_default='0'),
            sa.Column('page_count', sa.Integer(), server_default='0'),
            sa.Column('chunks', sa.JSON()),
            sa.Column('status', sa.String(20), server_default="'indexed'"),
            sa.Column('created_at', sa.DateTime()),
        )
    if not _index_exists('ix_institution_documents_institution_id'):
        op.create_index('ix_institution_documents_institution_id', 'institution_documents', ['institution_id'])


def downgrade():
    op.drop_table('admin_chat_messages')
    op.drop_table('admin_chat_sessions')
    op.drop_table('institution_documents')
