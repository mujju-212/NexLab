"""free_exercises.simulation_path column (interactive HTML lab exercises)

Revision ID: c4d5e6f7a8b9
Revises: 00af19be25e0
Create Date: 2026-08-13

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4d5e6f7a8b9'
down_revision = '00af19be25e0'
branch_labels = None
depends_on = None


def upgrade():
    # ── free_exercises.simulation_path column ─────────────────────────────
    op.add_column(
        'free_exercises',
        sa.Column('simulation_path', sa.Text(), nullable=True)
    )


def downgrade():
    op.drop_column('free_exercises', 'simulation_path')
