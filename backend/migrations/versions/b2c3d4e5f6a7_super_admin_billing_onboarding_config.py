"""super_admin_billing_onboarding_config

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-04

Adds:
  - institutions: billing fields (plan_updated_at, groq_limit_override,
                  billing_notes, billing_email)
  - institutions: onboarding fields (onboarding_status, onboarding_completed_at,
                  has_users, has_experiments, has_environment)
  - platform_config table (key-value store for feature flags & global config)
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # ── institutions: billing columns ─────────────────────────────────────
    op.add_column('institutions', sa.Column('plan_updated_at',     sa.DateTime(), nullable=True))
    op.add_column('institutions', sa.Column('groq_limit_override', sa.Integer(),  nullable=True))
    op.add_column('institutions', sa.Column('billing_notes',       sa.Text(),     nullable=True))
    op.add_column('institutions', sa.Column('billing_email',       sa.Text(),     nullable=True))

    # ── institutions: onboarding columns ─────────────────────────────────
    op.add_column('institutions', sa.Column('onboarding_status',
                  sa.String(20), nullable=True, server_default='active'))
    op.add_column('institutions', sa.Column('onboarding_completed_at', sa.DateTime(), nullable=True))
    op.add_column('institutions', sa.Column('has_users',       sa.Boolean(), server_default='false'))
    op.add_column('institutions', sa.Column('has_experiments', sa.Boolean(), server_default='false'))
    op.add_column('institutions', sa.Column('has_environment', sa.Boolean(), server_default='false'))

    # ── platform_config table ─────────────────────────────────────────────
    op.create_table(
        'platform_config',
        sa.Column('key',         sa.String(100), primary_key=True),
        sa.Column('value',       sa.Text(),      nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('updated_at',  sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_by',  sa.String(36), sa.ForeignKey('users.id'), nullable=True),
    )

    # Seed default config values
    op.execute("""
        INSERT INTO platform_config (key, value, description) VALUES
        ('groq_daily_limit',       '200',   'Default daily Groq API calls per institution'),
        ('maintenance_mode',       'false', 'Put platform in maintenance mode'),
        ('maintenance_message',    'NexLab is under scheduled maintenance. Back soon.', 'Message shown during maintenance'),
        ('ai_hints_enabled',       'true',  'Enable AI hint feature platform-wide'),
        ('code_execution_enabled', 'true',  'Enable Judge0 code execution'),
        ('max_students_free',      '100',   'Max students on free plan'),
        ('max_students_pro',       '500',   'Max students on pro plan'),
        ('max_students_enterprise','99999', 'Max students on enterprise plan'),
        ('allow_self_registration','false', 'Allow institutions to self-register')
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade():
    op.drop_table('platform_config')
    for col in ['has_environment', 'has_experiments', 'has_users',
                'onboarding_completed_at', 'onboarding_status',
                'billing_email', 'billing_notes', 'groq_limit_override', 'plan_updated_at']:
        op.drop_column('institutions', col)
