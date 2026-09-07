"""workflow_fixes: must_change_password + scheduled_announcements

Revision ID: l8m9n0o1p2q3
Revises: k6l7m8n9o0p1
Create Date: 2026-08-31

Two additive changes for the admin workflow round:
  1. users.must_change_password — set on admin-issued temp credentials; the
     login flow and require_role gate bounce the user to change their
     password before anything else.
  2. scheduled_announcements — P5: drafts with a future send_at, dispatched
     nightly/every-5-min by the scheduler. Null send_at never fires.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers — used by Alembic
revision = 'l8m9n0o1p2q3'
down_revision = 'k6l7m8n9o0p1'
branch_labels = None
depends_on = None


def upgrade():
    # ── users.must_change_password ────────────────────────────────────────
    op.add_column(
        'users',
        sa.Column('must_change_password', sa.Boolean(), nullable=False,
                  server_default='false'),
    )

    # ── scheduled_announcements ───────────────────────────────────────────
    op.create_table(
        'scheduled_announcements',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('institution_id', sa.String(length=36), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('target', sa.String(length=20), nullable=False,
                  server_default='all'),
        sa.Column('department_id', sa.String(length=36), nullable=True),
        sa.Column('batch_id', sa.String(length=36), nullable=True),
        sa.Column('section_id', sa.String(length=36), nullable=True),
        sa.Column('academic_year', sa.Integer(), nullable=True),
        sa.Column('send_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='pending'),  # pending | sent | cancelled
        sa.Column('sent_at', sa.DateTime(), nullable=True),
        sa.Column('recipients_sent', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
    )
    op.create_index('ix_sched_ann_inst_status',
                    'scheduled_announcements',
                    ['institution_id', 'status'])
    op.create_index('ix_sched_ann_status_sendat',
                    'scheduled_announcements', ['status', 'send_at'])


def downgrade():
    op.drop_index('ix_sched_ann_status_sendat', table_name='scheduled_announcements')
    op.drop_index('ix_sched_ann_inst_status', table_name='scheduled_announcements')
    op.drop_table('scheduled_announcements')
    op.drop_column('users', 'must_change_password')
