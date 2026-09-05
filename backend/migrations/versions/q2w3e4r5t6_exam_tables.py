"""exam tables (standalone timed exams)

Revision ID: q2w3e4r5t6
Revises: q1w2e3r4t5
Create Date: 2026-09-06

Adds the standalone Exam entity:
- exams           — assessment settings + availability window
- exam_questions  — MCQ / coding questions belonging to an exam
- exam_attempts   — per-student attempts with server-authoritative timing

Idempotent: each table is created only if absent, each column added only if
missing, so this can be applied safely on a partially-migrated DB.
"""
from alembic import op
import sqlalchemy as sa

revision = 'q2w3e4r5t6'
down_revision = 'q1w2e3r4t5'
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _existing_tables():
    return set(_inspector().get_table_names())


def _columns(table):
    return {c['name'] for c in _inspector().get_columns(table)}


def _indexes(table):
    return {ix['name'] for ix in _inspector().get_indexes(table)}


def upgrade():
    have = _existing_tables()

    # ── exams ────────────────────────────────────────────────────────────────
    if 'exams' not in have:
        op.create_table(
            'exams',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36), sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('subject_id', sa.String(36), sa.ForeignKey('subjects.id'), nullable=False),
            sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('title', sa.Text, nullable=False),
            sa.Column('description', sa.Text, nullable=True),
            sa.Column('exam_type', sa.String(10), server_default='mcq'),
            sa.Column('available_from', sa.DateTime, nullable=True),
            sa.Column('due_at', sa.DateTime, nullable=True),
            sa.Column('duration_minutes', sa.Integer, server_default='30'),
            sa.Column('max_attempts', sa.Integer, server_default='1'),
            sa.Column('pass_threshold', sa.Integer, server_default='40'),
            sa.Column('shuffle_questions', sa.Boolean, server_default='true'),
            sa.Column('is_published', sa.Boolean, server_default='false'),
            sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
        )
        op.create_index('ix_exams_institution', 'exams', ['institution_id'])
        op.create_index('ix_exams_subject', 'exams', ['subject_id'])

    # ── exam_questions ───────────────────────────────────────────────────────
    if 'exam_questions' not in have:
        op.create_table(
            'exam_questions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('exam_id', sa.String(36), sa.ForeignKey('exams.id'), nullable=False),
            sa.Column('question_type', sa.String(10), server_default='mcq'),
            sa.Column('prompt', sa.Text, nullable=False),
            sa.Column('points', sa.Float, server_default='1'),
            sa.Column('display_order', sa.Integer, server_default='0'),
            sa.Column('explanation', sa.Text, nullable=True),
            sa.Column('options', sa.JSON, nullable=True),
            sa.Column('correct_answer', sa.String(10), nullable=True),
            sa.Column('language', sa.String(30), nullable=True),
            sa.Column('starter_code', sa.Text, nullable=True),
            sa.Column('test_cases', sa.JSON, nullable=True),
            sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        )
        op.create_index('ix_exam_questions_exam', 'exam_questions', ['exam_id'])

    # ── exam_attempts ────────────────────────────────────────────────────────
    if 'exam_attempts' not in have:
        op.create_table(
            'exam_attempts',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('exam_id', sa.String(36), sa.ForeignKey('exams.id'), nullable=False),
            sa.Column('student_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('started_at', sa.DateTime, server_default=sa.func.now()),
            sa.Column('expires_at', sa.DateTime, nullable=True),
            sa.Column('submitted_at', sa.DateTime, nullable=True),
            sa.Column('score', sa.Float, server_default='0'),
            sa.Column('total_points', sa.Float, server_default='0'),
            sa.Column('max_points', sa.Float, server_default='0'),
            sa.Column('passed', sa.Boolean, server_default='false'),
            sa.Column('status', sa.String(20), server_default='in_progress'),
            sa.Column('answers', sa.JSON, nullable=True),
            sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        )
        op.create_index('ix_exam_attempts_exam', 'exam_attempts', ['exam_id'])
        op.create_index('ix_exam_attempts_student', 'exam_attempts', ['student_id'])
        op.create_index('ix_exam_attempts_exam_student', 'exam_attempts', ['exam_id', 'student_id'])


def downgrade():
    have = _existing_tables()
    for table in ('exam_attempts', 'exam_questions', 'exams'):
        if table in have:
            op.drop_table(table)
