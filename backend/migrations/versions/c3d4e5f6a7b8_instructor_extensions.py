"""instructor_extensions_simulation_ai_hints

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-04

Adds:
  - experiments.allow_ai_hints
  - experiments.simulation_entry
  - experiments.simulation_files
"""
from alembic import op
import sqlalchemy as sa

revision    = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on    = None


def upgrade():
    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'allow_ai_hints', sa.Boolean(), nullable=True, server_default='true'
        ))
        batch_op.add_column(sa.Column(
            'simulation_entry', sa.Text(), nullable=True
        ))
        batch_op.add_column(sa.Column(
            'simulation_files', sa.Text(), nullable=True
        ))


def downgrade():
    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.drop_column('simulation_files')
        batch_op.drop_column('simulation_entry')
        batch_op.drop_column('allow_ai_hints')
