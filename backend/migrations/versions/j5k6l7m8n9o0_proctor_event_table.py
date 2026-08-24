"""proctor_event_table: add proctor_events for persistent integrity event log

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-08-30

Adds proctor_events table — one row per tab-switch, fullscreen-exit,
lockdown-violation, or screen-share-stop event observed during a live session.
Replaces the analytics/proctoring endpoint's reliance on FocusScore aggregates
for discrete event counting.
"""
from alembic import op
import sqlalchemy as sa

revision      = 'j5k6l7m8n9o0'
down_revision = 'i4j5k6l7m8n9'
branch_labels = None
depends_on    = None


def upgrade():
    op.create_table(
        'proctor_events',
        sa.Column('id',             sa.String(length=36), nullable=False),
        sa.Column('institution_id', sa.String(length=36), nullable=False),
        sa.Column('session_id',     sa.String(length=36), nullable=False),
        sa.Column('student_id',     sa.String(length=36), nullable=False),
        sa.Column('event_type',     sa.String(length=40),  nullable=False),
        sa.Column('payload',        sa.JSON(),             nullable=True),
        sa.Column('severity',       sa.String(length=10),  nullable=True),
        sa.Column('recorded_at',    sa.DateTime(),         nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['session_id'], ['lab_sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id'],        ondelete='CASCADE'),
    )
    op.create_index('ix_proctor_events_inst_session', 'proctor_events',
                    ['institution_id', 'session_id'])
    op.create_index('ix_proctor_events_inst_student', 'proctor_events',
                    ['institution_id', 'student_id'])
    op.create_index('ix_proctor_events_inst_date',    'proctor_events',
                    ['institution_id', 'recorded_at'])


def downgrade():
    op.drop_index('ix_proctor_events_inst_date',    table_name='proctor_events')
    op.drop_index('ix_proctor_events_inst_student', table_name='proctor_events')
    op.drop_index('ix_proctor_events_inst_session', table_name='proctor_events')
    op.drop_table('proctor_events')
