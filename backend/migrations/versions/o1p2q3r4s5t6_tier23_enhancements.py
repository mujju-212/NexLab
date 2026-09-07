"""tier2 tier3 instructor enhancements

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
Create Date: 2026-09-01

Additive changes:
  question_bank            — shared MCQ pool across experiments (T3-12)
  teacher_notes            — private per-student instructor notes (T3-14)
  experiments.ranking_visible — public-ranking opt-out per experiment (T3-15)
  session_polls            — in-class quick polls (T2-10)
"""
from alembic import op
import sqlalchemy as sa

revision = 'o1p2q3r4s5t6'
down_revision = 'n0o1p2q3r4s5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'question_bank',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('options', sa.JSON(), nullable=True),
        sa.Column('correct_answer', sa.String(length=5), nullable=True),
        sa.Column('explanation', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_qbank_inst', 'question_bank', ['institution_id'])
    op.create_index('ix_qbank_creator', 'question_bank', ['created_by'])

    op.create_table(
        'teacher_notes',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=False),
        sa.Column('student_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('note', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_tnote_student', 'teacher_notes', ['student_id', 'created_at'])

    op.create_table(
        'session_polls',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('lab_sessions.id'), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('options', sa.JSON(), nullable=True),          # ["A text", "B text", …]
        sa.Column('responses', sa.JSON(), nullable=True),        # {student_id: option_index}
        sa.Column('is_open', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_poll_session', 'session_polls', ['session_id'])

    op.add_column('experiments', sa.Column('ranking_visible', sa.Boolean(),
                                           nullable=True, server_default='true'))


def downgrade():
    op.drop_column('experiments', 'ranking_visible')
    op.drop_index('ix_poll_session', table_name='session_polls')
    op.drop_table('session_polls')
    op.drop_index('ix_tnote_student', table_name='teacher_notes')
    op.drop_table('teacher_notes')
    op.drop_index('ix_qbank_creator', table_name='question_bank')
    op.drop_index('ix_qbank_inst', table_name='question_bank')
    op.drop_table('question_bank')
