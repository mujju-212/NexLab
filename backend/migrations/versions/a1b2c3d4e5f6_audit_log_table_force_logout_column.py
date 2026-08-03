"""audit_log_table_force_logout_column

Revision ID: a1b2c3d4e5f6
Revises: f52545adbcdb
Create Date: 2026-08-02

Adds:
  - audit_logs table (admin action history)
  - users.force_logout_at column (for force logout by admin)
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f52545adbcdb'
branch_labels = None
depends_on = None


def upgrade():
    # ── audit_logs table ─────────────────────────────────────────
    op.create_table(
        'audit_logs',
        sa.Column('id',             sa.String(36), primary_key=True),
        sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('actor_id',       sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action',         sa.String(50), nullable=False),
        sa.Column('target_type',    sa.String(30)),
        sa.Column('target_id',      sa.String(36)),
        sa.Column('detail',         sa.Text()),
        sa.Column('created_at',     sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_audit_logs_institution', 'audit_logs', ['institution_id'])
    op.create_index('ix_audit_logs_actor',       'audit_logs', ['actor_id'])

    # ── users.force_logout_at column ─────────────────────────────
    op.add_column(
        'users',
        sa.Column('force_logout_at', sa.DateTime(), nullable=True)
    )


def downgrade():
    op.drop_column('users', 'force_logout_at')
    op.drop_index('ix_audit_logs_actor',       table_name='audit_logs')
    op.drop_index('ix_audit_logs_institution', table_name='audit_logs')
    op.drop_table('audit_logs')
