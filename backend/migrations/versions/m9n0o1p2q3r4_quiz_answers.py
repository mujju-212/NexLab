"""quiz per-question responses

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-09-01

Adds content_progress.answers (JSON) — per-question quiz breakdown:
  {question_id: {"answer": "A", "correct": true}}

Powers instructor per-question analytics (most-missed questions) which was
impossible while ContentProgress.score was the only quiz signal.
"""
from alembic import op
import sqlalchemy as sa

revision = 'm9n0o1p2q3r4'
down_revision = 'l8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('content_progress', sa.Column('answers', sa.JSON, nullable=True))


def downgrade():
    op.drop_column('content_progress', 'answers')
