"""platform_user_two_person_approvals

Revision ID: e1f2a3b4c5d6
Revises: d8e9f0a1b2c3
Create Date: 2026-10-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = 'd8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'platform_user_change_requests',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('requested_by', sa.String(length=36), nullable=False),
        sa.Column('approved_by', sa.String(length=36), nullable=True),
        sa.Column('from_role', sa.String(length=30), nullable=False),
        sa.Column('from_institution_id', sa.String(length=36), nullable=True),
        sa.Column('to_role', sa.String(length=30), nullable=False),
        sa.Column('to_institution_id', sa.String(length=36), nullable=True),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=16), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['requested_by'], ['users.id']),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id']),
        sa.ForeignKeyConstraint(['from_institution_id'], ['institutions.id']),
        sa.ForeignKeyConstraint(['to_institution_id'], ['institutions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_platform_user_change_requests_status_created',
        'platform_user_change_requests', ['status', 'created_at'],
    )
    op.create_index(
        'ix_platform_user_change_requests_target_status',
        'platform_user_change_requests', ['user_id', 'status'],
    )


def downgrade():
    op.drop_index('ix_platform_user_change_requests_target_status', table_name='platform_user_change_requests')
    op.drop_index('ix_platform_user_change_requests_status_created', table_name='platform_user_change_requests')
    op.drop_table('platform_user_change_requests')
