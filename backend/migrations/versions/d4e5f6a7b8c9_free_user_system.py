"""free_user_system

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-09

Adds: free_courses, free_exercises, free_progress tables
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    # ── free_courses ──────────────────────────────────────────────────────────
    op.create_table('free_courses',
        sa.Column('id',           sa.String(36),  nullable=False),
        sa.Column('slug',         sa.String(80),  nullable=False),
        sa.Column('title',        sa.Text,        nullable=False),
        sa.Column('description',  sa.Text,        nullable=True),
        sa.Column('thumbnail_url',sa.Text,        nullable=True),
        sa.Column('difficulty',   sa.String(10),  nullable=True, server_default='beginner'),
        sa.Column('tags',         sa.JSON,        nullable=True),
        sa.Column('language',     sa.String(20),  nullable=True, server_default='python'),
        sa.Column('is_published', sa.Boolean,     nullable=True, server_default='false'),
        sa.Column('order_index',  sa.Integer,     nullable=True, server_default='0'),
        sa.Column('created_at',   sa.DateTime,    nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )

    # ── free_exercises ────────────────────────────────────────────────────────
    op.create_table('free_exercises',
        sa.Column('id',                sa.String(36), nullable=False),
        sa.Column('course_id',         sa.String(36), nullable=False),
        sa.Column('order_index',       sa.Integer,    nullable=True, server_default='0'),
        sa.Column('title',             sa.Text,       nullable=False),
        sa.Column('description',       sa.Text,       nullable=True),
        sa.Column('hint_text',         sa.Text,       nullable=True),
        sa.Column('difficulty',        sa.String(10), nullable=True, server_default='easy'),
        sa.Column('starter_code',      sa.JSON,       nullable=True),
        sa.Column('allowed_languages', sa.JSON,       nullable=True),
        sa.Column('test_cases',        sa.JSON,       nullable=True),
        sa.Column('time_limit_sec',    sa.Integer,    nullable=True, server_default='5'),
        sa.Column('memory_limit_kb',   sa.Integer,    nullable=True, server_default='131072'),
        sa.Column('exercise_type',     sa.String(10), nullable=True, server_default='coding'),
        sa.Column('mcq_options',       sa.JSON,       nullable=True),
        sa.Column('mcq_answer',        sa.String(2),  nullable=True),
        sa.Column('mcq_explanation',   sa.Text,       nullable=True),
        sa.Column('xp_reward',         sa.Integer,    nullable=True, server_default='10'),
        sa.Column('is_published',      sa.Boolean,    nullable=True, server_default='true'),
        sa.Column('created_at',        sa.DateTime,   nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['free_courses.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── free_progress ─────────────────────────────────────────────────────────
    op.create_table('free_progress',
        sa.Column('id',            sa.String(36), nullable=False),
        sa.Column('user_id',       sa.String(36), nullable=False),
        sa.Column('exercise_id',   sa.String(36), nullable=False),
        sa.Column('course_id',     sa.String(36), nullable=False),
        sa.Column('status',        sa.String(10), nullable=True, server_default='attempted'),
        sa.Column('attempts',      sa.Integer,    nullable=True, server_default='0'),
        sa.Column('best_score',    sa.Float,      nullable=True, server_default='0'),
        sa.Column('last_code',     sa.Text,       nullable=True),
        sa.Column('language_used', sa.String(20), nullable=True),
        sa.Column('xp_earned',     sa.Integer,    nullable=True, server_default='0'),
        sa.Column('solved_at',     sa.DateTime,   nullable=True),
        sa.Column('created_at',    sa.DateTime,   nullable=True),
        sa.Column('updated_at',    sa.DateTime,   nullable=True),
        sa.ForeignKeyConstraint(['course_id'],   ['free_courses.id']),
        sa.ForeignKeyConstraint(['exercise_id'], ['free_exercises.id']),
        sa.ForeignKeyConstraint(['user_id'],     ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'exercise_id', name='uq_free_progress'),
    )


def downgrade():
    op.drop_table('free_progress')
    op.drop_table('free_exercises')
    op.drop_table('free_courses')
