"""conductor_system_tables

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-08-31

Adds all tables and columns required by the Instructor Experience system design
(Parts I-IV): Checkpoint, CheckpointProgress, LivePageState, ProctorPolicy,
SessionModeTransition, ChatMessage, TestCaseResult, Report, InstructorSettings.

Also adds nullable columns to existing tables:
  - experiments: experiment_type, rubric_quiz, proctor_defaults
  - grades: quiz_grade
  - lab_sessions: current_mode, live_page_state_id

All additions are nullable/defaulted → backwards compatible.
"""
from alembic import op
import sqlalchemy as sa

revision = 'k6l7m8n9o0p1'
down_revision = 'j5k6l7m8n9o0'
branch_labels = None
depends_on = None


def upgrade():
    # ── checkpoints ──────────────────────────────────────────────────────────
    op.create_table(
        'checkpoints',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('experiment_id', sa.String(36), sa.ForeignKey('experiments.id'), nullable=False),
        sa.Column('order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('title', sa.Text, nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('test_case_ids', sa.JSON),
        sa.Column('weight', sa.Integer, server_default='10'),
        sa.Column('is_gated', sa.Boolean, server_default='false'),
        sa.Column('page_id', sa.String(36), sa.ForeignKey('content_pages.id'), nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_checkpoints_experiment', 'checkpoints', ['experiment_id'])

    # ── checkpoint_progress ──────────────────────────────────────────────────
    op.create_table(
        'checkpoint_progress',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('lab_sessions.id'), nullable=False),
        sa.Column('student_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('checkpoint_id', sa.String(36), sa.ForeignKey('checkpoints.id'), nullable=False),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('passed_at', sa.DateTime),
        sa.Column('attempts', sa.Integer, server_default='0'),
        sa.Column('last_signal_at', sa.DateTime),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('session_id', 'student_id', 'checkpoint_id', name='uq_cp_sscp'),
    )
    op.create_index('ix_cp_session_student',     'checkpoint_progress', ['session_id', 'student_id'])
    op.create_index('ix_cp_session_checkpoint',  'checkpoint_progress', ['session_id', 'checkpoint_id'])

    # ── live_page_states ─────────────────────────────────────────────────────
    op.create_table(
        'live_page_states',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('lab_sessions.id'), nullable=False, unique=True),
        sa.Column('current_page_id', sa.String(36), sa.ForeignKey('content_pages.id'), nullable=True),
        sa.Column('launched_page_ids', sa.JSON),
        sa.Column('page_timer_ends_at', sa.DateTime),
        sa.Column('launched_quiz_module_id', sa.String(36), sa.ForeignKey('content_modules.id'), nullable=True),
        sa.Column('updated_by', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now()),
    )

    # ── proctor_policies ─────────────────────────────────────────────────────
    op.create_table(
        'proctor_policies',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('experiment_id', sa.String(36), sa.ForeignKey('experiments.id'), nullable=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('lab_sessions.id'), nullable=True),
        sa.Column('page_id', sa.String(36), sa.ForeignKey('content_pages.id'), nullable=True),
        sa.Column('lockdown_fullscreen', sa.Boolean, server_default='true'),
        sa.Column('block_copy_paste', sa.Boolean, server_default='true'),
        sa.Column('block_tab_switch', sa.Boolean, server_default='true'),
        sa.Column('plagiarism_scan', sa.Boolean, server_default='true'),
        sa.Column('focus_ml', sa.Boolean, server_default='false'),
        sa.Column('webcam_required', sa.Boolean, server_default='false'),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime),
    )

    # ── session_mode_transitions ─────────────────────────────────────────────
    op.create_table(
        'session_mode_transitions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('lab_sessions.id'), nullable=False),
        sa.Column('from_mode', sa.String(20)),
        sa.Column('to_mode', sa.String(20), nullable=False),
        sa.Column('actor_id', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('reason', sa.Text),
        sa.Column('at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_smt_session', 'session_mode_transitions', ['session_id'])

    # ── chat_messages ────────────────────────────────────────────────────────
    op.create_table(
        'chat_messages',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('lab_sessions.id'), nullable=False),
        sa.Column('from_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('to_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('text', sa.Text, nullable=False),
        sa.Column('at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_chat_session', 'chat_messages', ['session_id'])

    # ── test_case_results ────────────────────────────────────────────────────
    op.create_table(
        'test_case_results',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('attempt_id', sa.String(36), sa.ForeignKey('code_attempts.id'), nullable=False),
        sa.Column('test_case_id', sa.String(36), sa.ForeignKey('test_cases.id'), nullable=False),
        sa.Column('passed', sa.Boolean, nullable=False),
        sa.Column('execution_time_ms', sa.Integer),
        sa.Column('output', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_tcr_attempt',    'test_case_results', ['attempt_id'])
    op.create_index('ix_tcr_test_case',  'test_case_results', ['test_case_id'])

    # ── reports ──────────────────────────────────────────────────────────────
    op.create_table(
        'reports',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('institution_id', sa.String(36), nullable=False),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('kind', sa.String(40), nullable=False),
        sa.Column('params', sa.JSON),
        sa.Column('status', sa.String(20), server_default='pending'),
        sa.Column('file_path', sa.Text),
        sa.Column('error', sa.Text),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime),
    )
    op.create_index('ix_reports_inst_creator', 'reports', ['institution_id', 'created_by'])

    # ── instructor_settings ──────────────────────────────────────────────────
    op.create_table(
        'instructor_settings',
        sa.Column('instructor_id', sa.String(36), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('institution_id', sa.String(36), nullable=False),
        sa.Column('default_proctor_policy', sa.JSON),
        sa.Column('default_rubric', sa.JSON),
        sa.Column('default_session_duration_min', sa.Integer, server_default='90'),
        sa.Column('default_late_join_window_min', sa.Integer, server_default='10'),
        sa.Column('default_gate_threshold', sa.Integer, server_default='70'),
        sa.Column('allow_ai_hints', sa.Boolean, server_default='true'),
        sa.Column('at_risk_avg_threshold', sa.Integer, server_default='40'),
        sa.Column('at_risk_min_threshold', sa.Integer, server_default='20'),
        sa.Column('notification_prefs', sa.JSON),
        sa.Column('updated_at', sa.DateTime),
    )

    # ── Column additions to existing tables ──────────────────────────────────
    op.add_column('experiments', sa.Column('experiment_type', sa.String(20), server_default='coding'))
    op.add_column('experiments', sa.Column('rubric_quiz', sa.Integer, server_default='0'))
    op.add_column('experiments', sa.Column('proctor_defaults', sa.JSON))

    op.add_column('grades', sa.Column('quiz_grade', sa.Float))

    op.add_column('lab_sessions', sa.Column('current_mode', sa.String(20), server_default='briefing'))
    op.add_column('lab_sessions', sa.Column('live_page_state_id', sa.String(36)))


def downgrade():
    op.drop_column('lab_sessions', 'live_page_state_id')
    op.drop_column('lab_sessions', 'current_mode')
    op.drop_column('grades', 'quiz_grade')
    op.drop_column('experiments', 'proctor_defaults')
    op.drop_column('experiments', 'rubric_quiz')
    op.drop_column('experiments', 'experiment_type')

    op.drop_table('instructor_settings')
    op.drop_table('reports')
    op.drop_index('ix_tcr_test_case',    table_name='test_case_results')
    op.drop_index('ix_tcr_attempt',      table_name='test_case_results')
    op.drop_table('test_case_results')
    op.drop_index('ix_chat_session',     table_name='chat_messages')
    op.drop_table('chat_messages')
    op.drop_index('ix_smt_session',      table_name='session_mode_transitions')
    op.drop_table('session_mode_transitions')
    op.drop_table('proctor_policies')
    op.drop_table('live_page_states')
    op.drop_index('ix_cp_session_checkpoint', table_name='checkpoint_progress')
    op.drop_index('ix_cp_session_student',    table_name='checkpoint_progress')
    op.drop_table('checkpoint_progress')
    op.drop_index('ix_checkpoints_experiment', table_name='checkpoints')
    op.drop_table('checkpoints')
