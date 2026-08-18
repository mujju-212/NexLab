"""practice library tables (problems, test cases, submissions, study plans, xp, badges)

Revision ID: d9e0f1a2b3c4
Revises: b8c9d0e1f2a3
Create Date: 2026-08-18

Creates the 8 NexLab Practice Library tables. Idempotent: any table that
already exists (e.g. created earlier via create_all) is skipped, so this can be
applied safely whether or not part of the schema is already present.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd9e0f1a2b3c4'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def _existing_tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade():
    have = _existing_tables()

    if 'practice_problems' not in have:
        op.create_table(
            'practice_problems',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('slug', sa.String(length=120), nullable=False),
            sa.Column('lc_id', sa.String(length=10), nullable=True),
            sa.Column('title', sa.String(length=300), nullable=False),
            sa.Column('difficulty', sa.String(length=10), nullable=False),
            sa.Column('nexlab_topic', sa.String(length=60), nullable=False),
            sa.Column('topics', sa.JSON(), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('examples', sa.JSON(), nullable=True),
            sa.Column('constraints', sa.JSON(), nullable=True),
            sa.Column('hints', sa.JSON(), nullable=True),
            sa.Column('starter_code', sa.JSON(), nullable=True),
            sa.Column('acceptance', sa.Float(), nullable=True),
            sa.Column('source', sa.String(length=30), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('is_daily', sa.Boolean(), nullable=True),
            sa.Column('daily_date', sa.Date(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug'),
        )
        op.create_index('ix_practice_problems_lc_id', 'practice_problems', ['lc_id'])
        op.create_index('ix_practice_problems_nexlab_topic', 'practice_problems', ['nexlab_topic'])
    if 'practice_test_cases' not in have:
        op.create_table(
            'practice_test_cases',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('problem_id', sa.String(length=36), nullable=False),
            sa.Column('input_data', sa.Text(), nullable=False),
            sa.Column('expected', sa.Text(), nullable=False),
            sa.Column('is_sample', sa.Boolean(), nullable=True),
            sa.Column('order_index', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['problem_id'], ['practice_problems.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_practice_test_cases_problem_id', 'practice_test_cases', ['problem_id'])

    if 'practice_submissions' not in have:
        op.create_table(
            'practice_submissions',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('student_id', sa.String(length=36), nullable=False),
            sa.Column('problem_id', sa.String(length=36), nullable=False),
            sa.Column('language', sa.String(length=20), nullable=False),
            sa.Column('code', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('passed', sa.Integer(), nullable=True),
            sa.Column('total', sa.Integer(), nullable=True),
            sa.Column('time_ms', sa.Integer(), nullable=True),
            sa.Column('memory_kb', sa.Integer(), nullable=True),
            sa.Column('xp_earned', sa.Integer(), nullable=True),
            sa.Column('is_run', sa.Boolean(), nullable=True),
            sa.Column('submitted_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['problem_id'], ['practice_problems.id'], ),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_practice_submissions_student_id', 'practice_submissions', ['student_id'])
        op.create_index('ix_practice_submissions_problem_id', 'practice_submissions', ['problem_id'])

    if 'practice_study_plans' not in have:
        op.create_table(
            'practice_study_plans',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('slug', sa.String(length=80), nullable=False),
            sa.Column('title', sa.String(length=120), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('icon', sa.String(length=10), nullable=True),
            sa.Column('total_problems', sa.Integer(), nullable=True),
            sa.Column('difficulty_mix', sa.String(length=60), nullable=True),
            sa.Column('estimated_days', sa.Integer(), nullable=True),
            sa.Column('is_premium', sa.Boolean(), nullable=True),
            sa.Column('badge_id', sa.String(length=30), nullable=True),
            sa.Column('order_index', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('slug'),
        )
    if 'practice_plan_sections' not in have:
        op.create_table(
            'practice_plan_sections',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('plan_id', sa.String(length=36), nullable=False),
            sa.Column('title', sa.String(length=120), nullable=False),
            sa.Column('order_index', sa.Integer(), nullable=True),
            sa.Column('problem_ids', sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(['plan_id'], ['practice_study_plans.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_practice_plan_sections_plan_id', 'practice_plan_sections', ['plan_id'])

    if 'practice_plan_progress' not in have:
        op.create_table(
            'practice_plan_progress',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('student_id', sa.String(length=36), nullable=False),
            sa.Column('plan_id', sa.String(length=36), nullable=False),
            sa.Column('solved_slugs', sa.JSON(), nullable=True),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('badge_awarded', sa.Boolean(), nullable=True),
            sa.ForeignKeyConstraint(['plan_id'], ['practice_study_plans.id'], ),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('student_id', 'plan_id', name='uq_student_plan'),
        )
        op.create_index('ix_practice_plan_progress_student_id', 'practice_plan_progress', ['student_id'])
        op.create_index('ix_practice_plan_progress_plan_id', 'practice_plan_progress', ['plan_id'])

    if 'practice_student_xp' not in have:
        op.create_table(
            'practice_student_xp',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('student_id', sa.String(length=36), nullable=False),
            sa.Column('total_xp', sa.Integer(), nullable=True),
            sa.Column('level', sa.Integer(), nullable=True),
            sa.Column('level_name', sa.String(length=30), nullable=True),
            sa.Column('streak_days', sa.Integer(), nullable=True),
            sa.Column('streak_last_date', sa.Date(), nullable=True),
            sa.Column('freeze_used_month', sa.Integer(), nullable=True),
            sa.Column('problems_solved', sa.Integer(), nullable=True),
            sa.Column('easy_solved', sa.Integer(), nullable=True),
            sa.Column('medium_solved', sa.Integer(), nullable=True),
            sa.Column('hard_solved', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('student_id'),
        )

    if 'practice_student_badges' not in have:
        op.create_table(
            'practice_student_badges',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('student_id', sa.String(length=36), nullable=False),
            sa.Column('badge_id', sa.String(length=30), nullable=False),
            sa.Column('earned_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('student_id', 'badge_id', name='uq_student_badge'),
        )
        op.create_index('ix_practice_student_badges_student_id', 'practice_student_badges', ['student_id'])


def downgrade():
    have = _existing_tables()
    for tbl in (
        'practice_student_badges', 'practice_student_xp', 'practice_plan_progress',
        'practice_plan_sections', 'practice_study_plans', 'practice_submissions',
        'practice_test_cases', 'practice_problems',
    ):
        if tbl in have:
            op.drop_table(tbl)
