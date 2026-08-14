"""email_otp_institution_fields

Revision ID: e5f6a7b8c9d0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-13

Adds:
  - email_otps table (self-registration OTP verification: individual + institution)
  - institutions.institution_type, institutions.phone, institutions.website
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade():
    # ── email_otps ────────────────────────────────────────────────────────────
    op.create_table(
        'email_otps',
        sa.Column('id',          sa.String(36), nullable=False),
        sa.Column('email',       sa.Text,       nullable=False),
        sa.Column('purpose',     sa.String(30), nullable=False),
        sa.Column('code_hash',   sa.Text,       nullable=False),
        sa.Column('attempts',    sa.Integer,    nullable=True, server_default='0'),
        sa.Column('verified',    sa.Boolean,    nullable=True, server_default='false'),
        sa.Column('verified_at', sa.DateTime,   nullable=True),
        sa.Column('created_at',  sa.DateTime,   nullable=True),
        sa.Column('expires_at',  sa.DateTime,   nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_email_otps_email', 'email_otps', ['email'])

    # ── institutions: self-registration profile fields ─────────────────────────
    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('institution_type', sa.String(30), nullable=True))
        batch_op.add_column(sa.Column('phone', sa.String(20), nullable=True))
        batch_op.add_column(sa.Column('website', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.drop_column('website')
        batch_op.drop_column('phone')
        batch_op.drop_column('institution_type')

    op.drop_index('ix_email_otps_email', table_name='email_otps')
    op.drop_table('email_otps')
