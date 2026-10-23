"""Add anonymous-feedback submission receipts.

Revision ID: y1z2a3b4c5d6
Revises: pgdoc1
Create Date: 2026-10-23
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'y1z2a3b4c5d6'
down_revision = 'pgdoc1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if 'session_feedback_receipts' not in sa_inspect(bind).get_table_names():
        op.create_table(
            'session_feedback_receipts',
            sa.Column('session_id', sa.String(36), nullable=False),
            sa.Column('student_id', sa.String(36), nullable=False),
            sa.Column('submitted_at', sa.DateTime(), nullable=False,
                      server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['session_id'], ['lab_sessions.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('session_id', 'student_id'),
        )
    indexes = {index['name'] for index in sa_inspect(bind).get_indexes('session_feedback_receipts')}
    if 'ix_feedback_receipts_student' not in indexes:
        op.create_index('ix_feedback_receipts_student', 'session_feedback_receipts', ['student_id'])


def downgrade():
    bind = op.get_bind()
    if 'session_feedback_receipts' in sa_inspect(bind).get_table_names():
        op.drop_table('session_feedback_receipts')
