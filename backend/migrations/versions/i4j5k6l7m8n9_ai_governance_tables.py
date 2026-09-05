"""ai_governance_tables: add ai_usage_log, ai_policy, ai_agent_run

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-08-30

Adds three tables for the P2 AI governance layer:
  - ai_usage_log   : one row per AI call, token counts + cost estimate
  - ai_policy      : per-institution AI settings (on/off, quotas, per-feature flags)
  - ai_agent_run   : audit trail for agentic (WS-D) AI sessions
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers — used by Alembic
revision = 'i4j5k6l7m8n9'
down_revision = 'h3i4j5k6l7m8'
branch_labels = None
depends_on = None


def upgrade():
    # ── ai_policy ─────────────────────────────────────────────────────────
    # One row per institution; created lazily by AIPolicy.get_or_create().
    op.create_table(
        'ai_policy',
        sa.Column('institution_id', sa.String(length=36), nullable=False),
        sa.Column('ai_enabled_global', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('ai_enabled_students', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('ai_enabled_instructors', sa.Boolean(), nullable=False, server_default='true'),
        # JSON stored as Text for SQLite compat; treated as dict in Python
        sa.Column('features_enabled', sa.Text(), nullable=True),
        sa.Column('daily_token_quota', sa.Integer(), nullable=True),
        sa.Column('monthly_token_quota', sa.Integer(), nullable=True),
        sa.Column('per_student_daily_quota', sa.Integer(), nullable=True),
        sa.Column('hard_stop', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('updated_by', sa.String(length=36), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('institution_id'),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], ondelete='CASCADE'),
    )

    # ── ai_usage_log ──────────────────────────────────────────────────────
    # High-volume table — one row per AI call.  Indexes are critical.
    op.create_table(
        'ai_usage_log',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('institution_id', sa.String(length=36), nullable=True),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('role', sa.String(length=30), nullable=True),
        sa.Column('feature', sa.String(length=40), nullable=False),
        sa.Column('model', sa.String(length=80), nullable=True),
        sa.Column('provider', sa.String(length=20), nullable=True, server_default='groq'),
        sa.Column('prompt_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completion_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost_usd', sa.Numeric(12, 8), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('section_subject_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    # Three indexes for the typical admin-dashboard query patterns
    op.create_index('ix_ai_usage_inst_date',      'ai_usage_log', ['institution_id', 'created_at'])
    op.create_index('ix_ai_usage_inst_user_date', 'ai_usage_log', ['institution_id', 'user_id', 'created_at'])
    op.create_index('ix_ai_usage_inst_feature',   'ai_usage_log', ['institution_id', 'feature'])

    # ── ai_agent_run ──────────────────────────────────────────────────────
    # Audit trail for agentic AI sessions (WS-D / P4).
    op.create_table(
        'ai_agent_run',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('institution_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=True),
        sa.Column('tool_calls', sa.Text(), nullable=True),   # JSON
        sa.Column('result', sa.Text(), nullable=True),
        sa.Column('total_tokens', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ai_agent_run_inst', 'ai_agent_run', ['institution_id', 'created_at'])


def downgrade():
    op.drop_index('ix_ai_agent_run_inst',      table_name='ai_agent_run')
    op.drop_table('ai_agent_run')

    op.drop_index('ix_ai_usage_inst_feature',   table_name='ai_usage_log')
    op.drop_index('ix_ai_usage_inst_user_date', table_name='ai_usage_log')
    op.drop_index('ix_ai_usage_inst_date',      table_name='ai_usage_log')
    op.drop_table('ai_usage_log')

    op.drop_table('ai_policy')
