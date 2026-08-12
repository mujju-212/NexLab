"""add_audit_logs_table

Revision ID: 00af19be25e0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-10 18:05:00

"""
from alembic import op
import sqlalchemy as sa

revision = '00af19be25e0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'audit_logs',
        sa.Column('id',             sa.String(36),  primary_key=True),
        sa.Column('institution_id', sa.String(36),  sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('actor_id',       sa.String(36),  sa.ForeignKey('users.id'),        nullable=False),
        sa.Column('action',         sa.String(50),  nullable=False),
        sa.Column('target_type',    sa.String(30)),
        sa.Column('target_id',      sa.String(36)),
        sa.Column('detail',         sa.Text),
        sa.Column('created_at',     sa.DateTime,    server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_institution', 'audit_logs', ['institution_id'])
    op.create_index('ix_audit_logs_created_at',  'audit_logs', ['created_at'])


def downgrade():
    op.drop_index('ix_audit_logs_created_at',  table_name='audit_logs')
    op.drop_index('ix_audit_logs_institution',  table_name='audit_logs')
    op.drop_table('audit_logs')
