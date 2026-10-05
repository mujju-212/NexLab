"""exam experiment unification and grading rollup

Revision ID: x0y1z2a3b4
Revises: w9x0y1z2a3
Create Date: 2026-10-09

Unifies the standalone Exam entity into Experiment, adding:
- experiments.delivery_mode ('lab', 'exam', 'practice')
- experiments.available_from (DATETIME)
- experiments.due_at (DATETIME)
- experiments.max_attempts (INTEGER)
- experiments.pass_threshold (INTEGER)
- experiments.shuffle_questions (BOOLEAN)
- exam_questions.experiment_id (VARCHAR(36))
- exam_attempts.experiment_id (VARCHAR(36))
"""
from alembic import op
import sqlalchemy as sa


revision = 'x0y1z2a3b4'
down_revision = 'w9x0y1z2a3'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    exp_cols = {c['name'] for c in insp.get_columns('experiments')}
    if 'delivery_mode' not in exp_cols:
        op.add_column('experiments', sa.Column('delivery_mode', sa.String(10), nullable=True, server_default='lab'))
    if 'available_from' not in exp_cols:
        op.add_column('experiments', sa.Column('available_from', sa.DateTime(), nullable=True))
    if 'due_at' not in exp_cols:
        op.add_column('experiments', sa.Column('due_at', sa.DateTime(), nullable=True))
    if 'max_attempts' not in exp_cols:
        op.add_column('experiments', sa.Column('max_attempts', sa.Integer(), nullable=True, server_default='1'))
    if 'pass_threshold' not in exp_cols:
        op.add_column('experiments', sa.Column('pass_threshold', sa.Integer(), nullable=True, server_default='40'))
    if 'shuffle_questions' not in exp_cols:
        op.add_column('experiments', sa.Column('shuffle_questions', sa.Boolean(), nullable=True, server_default=sa.false()))

    q_cols = {c['name'] for c in insp.get_columns('exam_questions')}
    if 'experiment_id' not in q_cols:
        op.add_column('exam_questions', sa.Column('experiment_id', sa.String(36), nullable=True))

    att_cols = {c['name'] for c in insp.get_columns('exam_attempts')}
    if 'experiment_id' not in att_cols:
        op.add_column('exam_attempts', sa.Column('experiment_id', sa.String(36), nullable=True))


def downgrade():
    conn = op.get_bind()
    insp = sa.inspect(conn)

    att_cols = {c['name'] for c in insp.get_columns('exam_attempts')}
    if 'experiment_id' in att_cols:
        op.drop_column('exam_attempts', 'experiment_id')

    q_cols = {c['name'] for c in insp.get_columns('exam_questions')}
    if 'experiment_id' in q_cols:
        op.drop_column('exam_questions', 'experiment_id')

    exp_cols = {c['name'] for c in insp.get_columns('experiments')}
    for col in ('shuffle_questions', 'pass_threshold', 'max_attempts', 'due_at', 'available_from', 'delivery_mode'):
        if col in exp_cols:
            op.drop_column('experiments', col)
