"""reconcile_missing_schema_objects

Revision ID: u7v8w9x0y1
Revises: t6u7v8w9x0
Create Date: 2026-09-15

The Postgres database was seeded from an older snapshot: several models
(announcements, invoices, security events, help/FAQ, AI governance/quota,
copilot tables, admin support tickets) were added on the sqlite dev.db side
only, and a handful of columns (audit enrichment, institution billing,
user profile) were applied there via ad-hoc scripts (migrate_audit_columns.py,
migrate_profile_columns.py) without ever going through alembic.

This migration closes exactly that gap on any database missing these objects:

  tables:  announcements, announcement_interactions, faq_articles,
           support_tickets, invoices, payment_methods, compliance_settings,
           security_events, ai_feature_configs, ai_user_quotas
  columns: audit_logs.module / .ip_address / .severity
           institutions.billing_cycle / .auto_renewal / .next_billing_date /
                      .billing_contact_person
           users.bio / .timezone / .language / .two_factor_enabled

Everything is existence-guarded so it is a no-op on databases that already
received these objects by hand (e.g. the local dev.db). Deliberately does NOT
touch indexes, FK constraints, or column types — no destructive reconciliation.

Also creates the audit_logs composites that t6u7v8w9x0 had to skip on
databases where the module/severity columns didn't exist yet.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'u7v8w9x0y1'
down_revision = 't6u7v8w9x0'
branch_labels = None
depends_on = None


def _insp():
    return sa_inspect(op.get_bind())


def _tables():
    return set(_insp().get_table_names())


def _cols(table):
    return {c['name'] for c in _insp().get_columns(table)}


def _has_index(table, name):
    return name in {i['name'] for i in _insp().get_indexes(table)}


def upgrade():
    tables = _tables()

    # ── audit_logs enrichment columns (see migrate_audit_columns.py) ────────
    if 'audit_logs' in tables:
        cols = _cols('audit_logs')
        with op.batch_alter_table('audit_logs', schema=None) as b:
            if 'module' not in cols:
                b.add_column(sa.Column('module', sa.String(50), nullable=True))
            if 'ip_address' not in cols:
                b.add_column(sa.Column('ip_address', sa.String(45), nullable=True))
            if 'severity' not in cols:
                b.add_column(sa.Column('severity', sa.String(20),
                                       nullable=False, server_default='low'))
        # Indexes t6u7v8w9x0 skipped because these columns didn't exist yet
        if not _has_index('audit_logs', 'ix_audit_logs_institution_module'):
            op.create_index('ix_audit_logs_institution_module', 'audit_logs',
                            ['institution_id', 'module'])
        if not _has_index('audit_logs', 'ix_audit_logs_institution_severity'):
            op.create_index('ix_audit_logs_institution_severity', 'audit_logs',
                            ['institution_id', 'severity'])

    # ── institutions billing columns (see b2c3d4e5f6a7 on sqlite side) ─────
    if 'institutions' in tables:
        cols = _cols('institutions')
        with op.batch_alter_table('institutions', schema=None) as b:
            if 'billing_cycle' not in cols:
                b.add_column(sa.Column('billing_cycle', sa.String(20),
                                       nullable=True, server_default='monthly'))
            if 'auto_renewal' not in cols:
                b.add_column(sa.Column('auto_renewal', sa.Boolean(),
                                       nullable=True, server_default=sa.true()))
            if 'next_billing_date' not in cols:
                b.add_column(sa.Column('next_billing_date', sa.String(30),
                                       nullable=True, server_default='10 Oct 2026'))
            if 'billing_contact_person' not in cols:
                b.add_column(sa.Column('billing_contact_person', sa.String(100),
                                       nullable=True,
                                       server_default='Institution Admin'))

    # ── users profile columns (see migrate_profile_columns.py) ──────────────
    if 'users' in tables:
        cols = _cols('users')
        with op.batch_alter_table('users', schema=None) as b:
            if 'bio' not in cols:
                b.add_column(sa.Column('bio', sa.Text(),
                                       server_default='Empowering education through technology.'))
            if 'timezone' not in cols:
                b.add_column(sa.Column('timezone', sa.String(50),
                                       server_default='(GMT+05:30) Asia/Kolkata'))
            if 'language' not in cols:
                b.add_column(sa.Column('language', sa.String(50),
                                       server_default='English (India)'))
            if 'two_factor_enabled' not in cols:
                b.add_column(sa.Column('two_factor_enabled', sa.Boolean(),
                                       server_default=sa.false()))

    # ── tables that never got a migration at all ────────────────────────────
    if 'announcements' not in tables:
        op.create_table(
            'announcements',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('author_id', sa.String(36),
                       sa.ForeignKey('users.id'), nullable=False),
            sa.Column('author_role', sa.String(30), nullable=False),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('priority', sa.String(20), nullable=False),
            sa.Column('category', sa.String(30), nullable=False),
            sa.Column('target', sa.String(30), nullable=False),
            sa.Column('department_id', sa.String(36), nullable=True),
            sa.Column('academic_year', sa.Integer(), nullable=True),
            sa.Column('batch_id', sa.String(36), nullable=True),
            sa.Column('section_id', sa.String(36), nullable=True),
            sa.Column('section_subject_id', sa.String(36), nullable=True),
            sa.Column('attachment_name', sa.String(255), nullable=True),
            sa.Column('attachment_url', sa.Text(), nullable=True),
            sa.Column('attachment_size', sa.String(50), nullable=True),
            sa.Column('status', sa.String(20), nullable=False),
            sa.Column('send_at', sa.DateTime(), nullable=True),
            sa.Column('sent_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.Column('reach_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('views_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('likes_count', sa.Integer(), nullable=False, server_default='0'),
        )
        for idx, cols_ in [
            ('ix_announcements_institution_id', ['institution_id']),
            ('ix_announcements_author_id', ['author_id']),
            ('ix_announcements_status', ['status']),
            ('ix_announcements_send_at', ['send_at']),
            ('ix_announcements_inst_created', ['institution_id', 'created_at']),
            ('ix_announcements_inst_status', ['institution_id', 'status']),
        ]:
            op.create_index(idx, 'announcements', cols_)

    if 'announcement_interactions' not in _tables():
        op.create_table(
            'announcement_interactions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('announcement_id', sa.String(36),
                       sa.ForeignKey('announcements.id', ondelete='CASCADE'), nullable=False),
            sa.Column('user_id', sa.String(36),
                       sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('read_at', sa.DateTime(), nullable=True),
            sa.Column('liked', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.UniqueConstraint('announcement_id', 'user_id',
                                 name='uq_announcement_user_interaction'),
        )
        op.create_index('ix_announcement_interactions_announcement_id',
                        'announcement_interactions', ['announcement_id'])
        op.create_index('ix_announcement_interactions_user_id',
                        'announcement_interactions', ['user_id'])

    if 'faq_articles' not in tables:
        op.create_table(
            'faq_articles',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('category', sa.String(50), nullable=False),
            sa.Column('category_title', sa.String(100), nullable=False),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('answer', sa.Text(), nullable=False),
            sa.Column('helpful_count', sa.Integer(), server_default='0'),
            sa.Column('unhelpful_count', sa.Integer(), server_default='0'),
            sa.Column('is_published', sa.Boolean(), server_default=sa.true()),
            sa.Column('order', sa.Integer(), server_default='0'),
            sa.Column('tags', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_faq_articles_category', 'faq_articles', ['category'])

    if 'support_tickets' not in tables:
        op.create_table(
            'support_tickets',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('ticket_number', sa.String(50), nullable=False, unique=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('user_id', sa.String(36),
                       sa.ForeignKey('users.id'), nullable=False),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('category', sa.String(50), nullable=True),
            sa.Column('priority', sa.String(20), nullable=True),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('status', sa.String(20), server_default='open'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_support_tickets_institution_id', 'support_tickets',
                        ['institution_id'])
        op.create_index('ix_support_tickets_ticket_number', 'support_tickets',
                        ['ticket_number'], unique=True)

    if 'invoices' not in tables:
        op.create_table(
            'invoices',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('invoice_number', sa.String(50), nullable=False, unique=True),
            sa.Column('amount', sa.Float(), nullable=False),
            sa.Column('currency', sa.String(10), server_default='INR'),
            sa.Column('plan', sa.String(50), nullable=True),
            sa.Column('billing_date', sa.DateTime(), nullable=True),
            sa.Column('status', sa.String(20), server_default='paid'),
            sa.Column('payment_method', sa.String(50), nullable=True),
            sa.Column('items_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_invoices_institution_id', 'invoices', ['institution_id'])
        op.create_index('ix_invoices_invoice_number', 'invoices',
                        ['invoice_number'], unique=True)

    if 'payment_methods' not in tables:
        op.create_table(
            'payment_methods',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('card_brand', sa.String(30), nullable=True),
            sa.Column('last4', sa.String(4), nullable=False),
            sa.Column('exp_month', sa.Integer(), nullable=False),
            sa.Column('exp_year', sa.Integer(), nullable=False),
            sa.Column('cardholder_name', sa.String(100), nullable=True),
            sa.Column('is_default', sa.Boolean(), server_default=sa.false()),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_payment_methods_institution_id', 'payment_methods',
                        ['institution_id'])

    if 'compliance_settings' not in tables:
        op.create_table(
            'compliance_settings',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('security_score', sa.Integer(), nullable=True),
            sa.Column('compliance_status', sa.String(30), nullable=True),
            sa.Column('last_assessed', sa.String(30), nullable=True),
            sa.Column('frameworks_json', sa.Text(), nullable=True),
            sa.Column('retention_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_compliance_settings_institution_id',
                        'compliance_settings', ['institution_id'])

    if 'security_events' not in tables:
        op.create_table(
            'security_events',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'),
                       nullable=True),
            sa.Column('user_name', sa.String(120), nullable=True),
            sa.Column('event_type', sa.String(50), nullable=False),
            sa.Column('title', sa.String(150), nullable=False),
            sa.Column('ip_address', sa.String(45), nullable=True),
            sa.Column('location', sa.String(100), nullable=True),
            sa.Column('severity', sa.String(20), nullable=True),
            sa.Column('details', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
        )
        for idx, cols_ in [
            ('ix_security_events_institution_id', ['institution_id']),
            ('ix_security_events_user_id', ['user_id']),
            ('ix_security_events_event_type', ['event_type']),
            ('ix_security_events_created_at', ['created_at']),
        ]:
            op.create_index(idx, 'security_events', cols_)

    if 'ai_feature_configs' not in tables:
        op.create_table(
            'ai_feature_configs',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('feature_id', sa.String(50), nullable=False),
            sa.Column('name', sa.String(100), nullable=False),
            sa.Column('category', sa.String(50), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('available_roles', sa.Text(), nullable=True),
            sa.Column('default_model', sa.String(80), nullable=True),
            sa.Column('rate_limit_per_hour', sa.Integer(), nullable=True),
            sa.Column('cost_per_1k', sa.Float(), nullable=True),
            sa.Column('supported_content', sa.String(100), nullable=True),
            sa.Column('enabled_since', sa.String(30), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('institution_id', 'feature_id',
                                 name='uq_inst_feature_id'),
        )
        op.create_index('ix_ai_feature_configs_institution_id',
                        'ai_feature_configs', ['institution_id'])
        op.create_index('ix_ai_feature_configs_feature_id',
                        'ai_feature_configs', ['feature_id'])

    if 'ai_user_quotas' not in tables:
        op.create_table(
            'ai_user_quotas',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('institution_id', sa.String(36),
                       sa.ForeignKey('institutions.id'), nullable=False),
            sa.Column('user_id', sa.String(36),
                       sa.ForeignKey('users.id'), nullable=False),
            sa.Column('monthly_token_quota', sa.Integer(), nullable=False,
                       server_default='1000000'),
            sa.Column('current_month_tokens', sa.Integer(), nullable=False,
                       server_default='0'),
            sa.Column('reset_date', sa.String(30), nullable=True),
            sa.Column('status', sa.String(20), server_default='active'),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.UniqueConstraint('institution_id', 'user_id',
                                 name='uq_inst_user_quota'),
        )
        op.create_index('ix_ai_user_quotas_institution_id', 'ai_user_quotas',
                        ['institution_id'])
        op.create_index('ix_ai_user_quotas_user_id', 'ai_user_quotas', ['user_id'])


def downgrade():
    # Intentionally a no-op for the added columns/tables: every one of them is
    # already written to by live app code, and dropping them on a database
    # that has been using this schema would be destructive. Reverting this
    # revision means "go back to the old broken state" — not something an
    # automated downgrade should do quietly. Drop explicitly if you mean it.
    pass
