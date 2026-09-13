"""Add grade_weight column to exams table.

Revision ID: r3s4t5u6v7
Revises: q2w3e4r5t6
Create Date: 2026-09-13
"""
from alembic import op
import sqlalchemy as sa

revision = 'r3s4t5u6v7'
down_revision = 'q2w3e4r5t6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('grade_weight', sa.Float(), nullable=True, server_default='0')
        )


def downgrade():
    with op.batch_alter_table('exams', schema=None) as batch_op:
        batch_op.drop_column('grade_weight')
