"""institution_admin_operations

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-08-16

Supports the institution-admin operational endpoints:
  - lab_sessions.title            admin-facing session label
  - lab_sessions.experiment_id    now nullable — the admin books the slot, the
                                  instructor attaches the experiment later
  - institutions.notification_prefs  JSON blob of admin notification toggles
"""
from alembic import op
import sqlalchemy as sa

revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('lab_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('title', sa.Text(), nullable=True))
        batch_op.alter_column('experiment_id',
                              existing_type=sa.String(36),
                              nullable=True)

    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notification_prefs', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.drop_column('notification_prefs')

    with op.batch_alter_table('lab_sessions', schema=None) as batch_op:
        # Rows with a NULL experiment_id must be cleared before the column can
        # go back to NOT NULL; they are admin-booked slots with no experiment.
        batch_op.drop_column('title')
    op.execute("DELETE FROM lab_sessions WHERE experiment_id IS NULL")
    with op.batch_alter_table('lab_sessions', schema=None) as batch_op:
        batch_op.alter_column('experiment_id',
                              existing_type=sa.String(36),
                              nullable=False)
