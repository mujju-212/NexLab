"""phase2 grading rollup fields

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-23

Adds per-experiment grading rollup columns so that subject scores can be
computed as:

    subject_score = Σ (experiment_score / grade_scale) × weightage

Columns added:
  subjects.total_marks      INTEGER NOT NULL DEFAULT 100
      — the total marks available for the subject (denominator for rollup display)
  experiments.weightage     INTEGER NOT NULL DEFAULT 1
      — how many marks this experiment contributes toward the subject total
  experiments.grade_scale   INTEGER NOT NULL DEFAULT 100
      — the denominator of this experiment's own score (100-point or 10-point scale)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'g2h3i4j5k6l7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    # Guard: add total_marks to subjects only if it doesn't exist yet
    conn = op.get_bind()
    insp = sa.inspect(conn)

    subject_cols = {c['name'] for c in insp.get_columns('subjects')}
    if 'total_marks' not in subject_cols:
        op.add_column('subjects',
            sa.Column('total_marks', sa.Integer(), nullable=False, server_default='100'))

    exp_cols = {c['name'] for c in insp.get_columns('experiments')}
    if 'weightage' not in exp_cols:
        op.add_column('experiments',
            sa.Column('weightage', sa.Integer(), nullable=False, server_default='1'))
    if 'grade_scale' not in exp_cols:
        op.add_column('experiments',
            sa.Column('grade_scale', sa.Integer(), nullable=False, server_default='100'))


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    exp_cols = {c['name'] for c in insp.get_columns('experiments')}
    if 'grade_scale' in exp_cols:
        op.drop_column('experiments', 'grade_scale')
    if 'weightage' in exp_cols:
        op.drop_column('experiments', 'weightage')

    subject_cols = {c['name'] for c in insp.get_columns('subjects')}
    if 'total_marks' in subject_cols:
        op.drop_column('subjects', 'total_marks')
