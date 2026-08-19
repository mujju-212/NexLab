"""focus_scores: add signals JSON column

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-08-23

The focus_scores table was created before the `signals` JSON column was
added to the FocusScore model.  The full-schema migration
f52545adbcdb_focus_score_json_signals.py lists the column in its
CREATE TABLE DDL, but many databases were already initialised with only
the earlier column set.  This targeted migration adds the column without
touching any existing rows.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h3i4j5k6l7m8'
down_revision = 'g2h3i4j5k6l7'
branch_labels = None
depends_on = None


def upgrade():
    # Only add the column if it is genuinely missing (guards against applying
    # this migration twice on a DB that already has the column from the
    # initial full-schema migration).
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {col['name'] for col in inspector.get_columns('focus_scores')}
    if 'signals' not in existing:
        op.add_column(
            'focus_scores',
            sa.Column('signals', sa.JSON(), nullable=True)
        )


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing = {col['name'] for col in inspector.get_columns('focus_scores')}
    if 'signals' in existing:
        op.drop_column('focus_scores', 'signals')
