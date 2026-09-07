"""free user enhancement round 2

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-09-01

Additive tables for the platform-direct (free user) experience:
  practice_bookmarks      — star + private note per (user, problem)
  playground_sessions     — saved playground work + share slugs
  problem_collections     — user-built playlists
  collection_items        — playlist membership
  coding_contests         — timed problem sets
  contest_participants    — enrollment + per-user solve tracking
And columns:
  practice_student_xp.profile_public, profile_slug — public showcase opt-in
  practice_plan_progress.certificate_path            — plan-completion PDF
"""
from alembic import op
import sqlalchemy as sa

revision = 'p2q3r4s5t6u7'
down_revision = 'o1p2q3r4s5t6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'practice_bookmarks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('problem_id', sa.String(36), sa.ForeignKey('practice_problems.id'), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('user_id', 'problem_id', name='uq_practice_bookmark'),
    )
    op.create_index('ix_pbookmark_user', 'practice_bookmarks', ['user_id'])

    op.create_table(
        'playground_sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=True),
        sa.Column('language', sa.String(30), nullable=False),
        sa.Column('code', sa.Text(), nullable=False),
        sa.Column('stdin_data', sa.Text(), nullable=True),
        sa.Column('share_slug', sa.String(20), nullable=True, unique=True),
        sa.Column('is_shared', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_pgsess_user', 'playground_sessions', ['user_id'])
    op.create_index('ix_pgsess_slug', 'playground_sessions', ['share_slug'])

    op.create_table(
        'problem_collections',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_pcoll_user', 'problem_collections', ['user_id'])

    op.create_table(
        'collection_items',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('collection_id', sa.String(36), sa.ForeignKey('problem_collections.id'), nullable=False),
        sa.Column('problem_id', sa.String(36), sa.ForeignKey('practice_problems.id'), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=True),
        sa.UniqueConstraint('collection_id', 'problem_id', name='uq_collection_item'),
    )
    op.create_index('ix_citem_coll', 'collection_items', ['collection_id'])

    op.create_table(
        'coding_contests',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('starts_at', sa.DateTime(), nullable=False),
        sa.Column('ends_at', sa.DateTime(), nullable=False),
        sa.Column('problem_ids', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_contest_window', 'coding_contests', ['starts_at', 'ends_at'])

    op.create_table(
        'contest_participants',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('contest_id', sa.String(36), sa.ForeignKey('coding_contests.id'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('joined_at', sa.DateTime(), nullable=True),
        sa.Column('solved_slugs', sa.JSON(), nullable=True),
        sa.Column('score', sa.Integer(), nullable=True),
        sa.UniqueConstraint('contest_id', 'user_id', name='uq_contest_participant'),
    )
    op.create_index('ix_cpart_contest', 'contest_participants', ['contest_id'])

    op.add_column('practice_student_xp',
                  sa.Column('profile_public', sa.Boolean(), nullable=True, server_default='false'))
    op.add_column('practice_student_xp',
                  sa.Column('profile_slug', sa.String(40), nullable=True))
    op.create_index('ix_xp_slug', 'practice_student_xp', ['profile_slug'], unique=False)

    op.add_column('practice_plan_progress',
                  sa.Column('certificate_path', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('practice_plan_progress', 'certificate_path')
    op.drop_index('ix_xp_slug', table_name='practice_student_xp')
    op.drop_column('practice_student_xp', 'profile_slug')
    op.drop_column('practice_student_xp', 'profile_public')
    op.drop_index('ix_cpart_contest', table_name='contest_participants')
    op.drop_table('contest_participants')
    op.drop_index('ix_contest_window', table_name='coding_contests')
    op.drop_table('coding_contests')
    op.drop_index('ix_citem_coll', table_name='collection_items')
    op.drop_table('collection_items')
    op.drop_index('ix_pcoll_user', table_name='problem_collections')
    op.drop_table('problem_collections')
    op.drop_index('ix_pgsess_slug', table_name='playground_sessions')
    op.drop_index('ix_pgsess_user', table_name='playground_sessions')
    op.drop_table('playground_sessions')
    op.drop_index('ix_pbookmark_user', table_name='practice_bookmarks')
    op.drop_table('practice_bookmarks')
