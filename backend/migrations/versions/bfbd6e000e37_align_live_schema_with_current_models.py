"""align live schema with current models

Revision ID: bfbd6e000e37
Revises: y1z2a3b4c5d6
Create Date: 2026-10-25 00:11:54.278429

Brings the live database in line with the SQLAlchemy models:

- pgvector: install the extension, convert ai_document_chunks.embedding from
  JSON to VECTOR(768) and add the ivfflat cosine index.
- Foreign keys: add the ones missing in the DB (ai_agent_run, ai_usage_log,
  exam_attempts, exam_questions, subjects.department_id, ai_policy.updated_by),
  recreate with no ON DELETE where the models declare plain references
  (ai_policy, extensions, interventions, proctor_events, scheduled_announcements),
  and drop duplicate constraints left behind on extensions.
- Nullability and column types per the models (ai_usage_log, exam_attempts,
  exam_questions, experiments, scheduled_announcements, users, sections,
  subjects, institutions, practice_problems, platform_exercises,
  session_feedback.helpful_count -> NOT NULL).
- Drop legacy columns the models no longer declare (focus_scores proctoring
  signal columns, interventions.notes / .updated_at) — all empty in the data.
- Add model-declared indexes that were missing.

Intentionally left untouched (present in the DB but not in the metadata):
- the raw-SQL groq_usage table,
- extra performance indexes (ix_* extras and the trgm_* GIN search indexes),
- the unique-constraint copies on invoices / support_tickets (uniqueness is
  also enforced by the model-named unique indexes, so the plain-constraint
  duplicates are dropped for parity).
- The free_* -> platform_* rename is assumed to have been applied already.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = 'bfbd6e000e37'
down_revision = 'y1z2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # --- ai_document_chunks: JSON -> VECTOR(768) + ivfflat cosine index ---
    with op.batch_alter_table('ai_document_chunks', schema=None) as batch_op:
        batch_op.alter_column('embedding',
                              existing_type=postgresql.JSON(astext_type=sa.Text()),
                              type_=Vector(768),
                              postgresql_using='embedding::text::vector(768)',
                              existing_nullable=True)
        batch_op.create_index('ix_ai_chunks_embedding', ['embedding'], unique=False,
                              postgresql_using='ivfflat',
                              postgresql_ops={'embedding': 'vector_cosine_ops'})

    # --- admin_chat_sessions: model-declared index missing in DB ---
    with op.batch_alter_table('admin_chat_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_admin_chat_sessions_role_scope'), ['role_scope'], unique=False)

    # --- ai_agent_run: nullability + missing indexes + missing FKs ---
    with op.batch_alter_table('ai_agent_run', schema=None) as batch_op:
        batch_op.alter_column('institution_id', existing_type=sa.VARCHAR(length=36), nullable=False)
        batch_op.alter_column('user_id', existing_type=sa.VARCHAR(length=36), nullable=False)
        batch_op.alter_column('created_at', existing_type=postgresql.TIMESTAMP(), nullable=True)
        batch_op.create_index(batch_op.f('ix_ai_agent_run_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_agent_run_institution_id'), ['institution_id'], unique=False)
        batch_op.create_foreign_key('fk_ai_agent_run_institution_id', 'institutions', ['institution_id'], ['id'])
        batch_op.create_foreign_key('fk_ai_agent_run_user_id', 'users', ['user_id'], ['id'])

    # --- ai_policy: institution FK must not cascade; updated_by FK missing ---
    with op.batch_alter_table('ai_policy', schema=None) as batch_op:
        batch_op.drop_constraint('ai_policy_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('ai_policy_institution_id_fkey', 'institutions', ['institution_id'], ['id'])
        batch_op.create_foreign_key('ai_policy_updated_by_fkey', 'users', ['updated_by'], ['id'])

    # --- ai_usage_log: types, nullability, indexes, FKs ---
    with op.batch_alter_table('ai_usage_log', schema=None) as batch_op:
        batch_op.alter_column('role', existing_type=sa.VARCHAR(length=30), type_=sa.String(length=20),
                              existing_nullable=True)
        batch_op.alter_column('feature', existing_type=sa.VARCHAR(length=40), type_=sa.String(length=30),
                              nullable=True)
        batch_op.alter_column('prompt_tokens', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('0'))
        batch_op.alter_column('completion_tokens', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('0'))
        batch_op.alter_column('total_tokens', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('0'))
        batch_op.alter_column('estimated_cost_usd', existing_type=sa.DOUBLE_PRECISION(precision=53),
                              type_=sa.Numeric(precision=12, scale=8),
                              postgresql_using='estimated_cost_usd::numeric(12, 8)',
                              existing_nullable=True)
        batch_op.alter_column('success', existing_type=sa.BOOLEAN(), nullable=True,
                              existing_server_default=sa.text('true'))
        batch_op.alter_column('created_at', existing_type=postgresql.TIMESTAMP(), nullable=True)
        batch_op.create_index(batch_op.f('ix_ai_usage_log_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_usage_log_feature'), ['feature'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_usage_log_institution_id'), ['institution_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_usage_log_total_tokens'), ['total_tokens'], unique=False)
        batch_op.create_index(batch_op.f('ix_ai_usage_log_user_id'), ['user_id'], unique=False)
        batch_op.create_foreign_key('fk_ai_usage_log_user_id', 'users', ['user_id'], ['id'])
        batch_op.create_foreign_key('fk_ai_usage_log_institution_id', 'institutions', ['institution_id'], ['id'])

    # --- exam_attempts / exam_questions: exam_id nullable, experiment FK, composite index ---
    with op.batch_alter_table('exam_attempts', schema=None) as batch_op:
        batch_op.alter_column('exam_id', existing_type=sa.VARCHAR(length=36), nullable=True)
        batch_op.create_foreign_key('fk_exam_attempts_experiment_id', 'experiments', ['experiment_id'], ['id'])

    with op.batch_alter_table('exam_questions', schema=None) as batch_op:
        batch_op.alter_column('exam_id', existing_type=sa.VARCHAR(length=36), nullable=True)
        batch_op.drop_index(batch_op.f('ix_exam_questions_exam'))
        batch_op.create_index('ix_exam_questions_exam', ['exam_id', 'display_order'], unique=False)
        batch_op.create_foreign_key('fk_exam_questions_experiment_id', 'experiments', ['experiment_id'], ['id'])

    # --- experiments: grade columns are nullable in the models ---
    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.alter_column('weightage', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('1'))
        batch_op.alter_column('grade_scale', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('100'))

    # --- extensions: index rename, no-cascade FK, drop duplicate constraints ---
    with op.batch_alter_table('extensions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_extension_inst'))
        batch_op.create_index(batch_op.f('ix_extensions_institution_id'), ['institution_id'], unique=False)
        batch_op.drop_constraint('extensions_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('extensions_institution_id_fkey', 'institutions', ['institution_id'], ['id'])
        batch_op.drop_constraint('extensions_experiment_id_fkey1', type_='foreignkey')
        batch_op.drop_constraint('extensions_granted_by_fkey1', type_='foreignkey')
        batch_op.drop_constraint('extensions_student_id_fkey1', type_='foreignkey')

    # --- focus_scores: model indexes + drop legacy (empty) signal columns ---
    with op.batch_alter_table('focus_scores', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_focus_scores_recorded_at'), ['recorded_at'], unique=False)
        batch_op.create_index('ix_focus_session_recorded', ['session_id', 'recorded_at'], unique=False)
        batch_op.create_index('ix_focus_student_session', ['student_id', 'session_id'], unique=False)
        batch_op.drop_column('gaze_score')
        batch_op.drop_column('tab_switches')
        batch_op.drop_column('window_blurs')
        batch_op.drop_column('typing_speed_avg')
        batch_op.drop_column('face_present_pct')
        batch_op.drop_column('idle_seconds')
        batch_op.drop_column('copy_paste_count')
        batch_op.drop_column('large_paste_detected')

    # --- institution_documents: model-declared single-column indexes ---
    with op.batch_alter_table('institution_documents', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_institution_documents_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_institution_documents_scope_id'), ['scope_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_institution_documents_scope_type'), ['scope_type'], unique=False)
        batch_op.create_index(batch_op.f('ix_institution_documents_uploaded_by'), ['uploaded_by'], unique=False)

    # --- institutions: onboarding_status back to String(20) ---
    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.alter_column('onboarding_status', existing_type=sa.VARCHAR(length=30),
                              type_=sa.String(length=20), existing_nullable=True,
                              existing_server_default=sa.text("'pending'::character varying"))

    # --- interventions: index rename, no-cascade FK, drop legacy (empty) columns ---
    with op.batch_alter_table('interventions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_intervention_created'))
        batch_op.drop_index(batch_op.f('ix_intervention_inst'))
        batch_op.create_index(batch_op.f('ix_interventions_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_interventions_institution_id'), ['institution_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_interventions_student_id'), ['student_id'], unique=False)
        batch_op.drop_constraint('interventions_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('interventions_institution_id_fkey', 'institutions', ['institution_id'], ['id'])
        batch_op.drop_column('notes')
        batch_op.drop_column('updated_at')

    # --- invoices: drop the constraint copy (unique index remains) ---
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_constraint('invoices_invoice_number_key', type_='unique')

    # --- playground_sessions: unique constraint -> model-named unique index ---
    with op.batch_alter_table('playground_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_pgsess_slug'))
        batch_op.drop_constraint('playground_sessions_share_slug_key', type_='unique')
        batch_op.create_index(batch_op.f('ix_playground_sessions_share_slug'), ['share_slug'], unique=True)

    # --- practice_problems / practice_student_xp ---
    with op.batch_alter_table('practice_problems', schema=None) as batch_op:
        batch_op.alter_column('difficulty', existing_type=sa.VARCHAR(length=20), type_=sa.String(length=10),
                              existing_nullable=False)

    with op.batch_alter_table('practice_student_xp', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_xp_slug'))
        batch_op.create_index(batch_op.f('ix_practice_student_xp_profile_slug'), ['profile_slug'], unique=False)

    # --- platform_exercises: align column types with the current models ---
    with op.batch_alter_table('platform_exercises', schema=None) as batch_op:
        batch_op.alter_column('tags', existing_type=postgresql.JSONB(astext_type=sa.Text()),
                              type_=sa.JSON(), postgresql_using='tags::text::json',
                              existing_nullable=True)
        batch_op.alter_column('acceptance_rate', existing_type=sa.REAL(), type_=sa.Float(),
                              existing_nullable=True)

    # --- proctor_events: FKs must not cascade ---
    with op.batch_alter_table('proctor_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_proctor_events_institution_id'), ['institution_id'], unique=False)
        batch_op.drop_constraint('proctor_events_student_id_fkey', type_='foreignkey')
        batch_op.drop_constraint('proctor_events_session_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('proctor_events_student_id_fkey', 'users', ['student_id'], ['id'])
        batch_op.create_foreign_key('proctor_events_session_id_fkey', 'lab_sessions', ['session_id'], ['id'])

    # --- question_bank: index rename ---
    with op.batch_alter_table('question_bank', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_qbank_creator'))
        batch_op.drop_index(batch_op.f('ix_qbank_inst'))
        batch_op.create_index(batch_op.f('ix_question_bank_created_by'), ['created_by'], unique=False)
        batch_op.create_index(batch_op.f('ix_question_bank_institution_id'), ['institution_id'], unique=False)

    # --- scheduled_announcements: nullability, indexes, no-cascade FK ---
    with op.batch_alter_table('scheduled_announcements', schema=None) as batch_op:
        batch_op.alter_column('target', existing_type=sa.VARCHAR(length=20), nullable=True,
                              existing_server_default=sa.text("'all'::character varying"))
        batch_op.alter_column('status', existing_type=sa.VARCHAR(length=20), nullable=True,
                              existing_server_default=sa.text("'pending'::character varying"))
        batch_op.alter_column('created_at', existing_type=postgresql.TIMESTAMP(), nullable=True)
        batch_op.create_index(batch_op.f('ix_scheduled_announcements_institution_id'), ['institution_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_scheduled_announcements_send_at'), ['send_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_scheduled_announcements_status'), ['status'], unique=False)
        batch_op.drop_constraint('scheduled_announcements_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('scheduled_announcements_institution_id_fkey', 'institutions',
                                    ['institution_id'], ['id'])

    # --- sections / session_feedback / session_polls ---
    with op.batch_alter_table('sections', schema=None) as batch_op:
        batch_op.alter_column('section_code', existing_type=sa.VARCHAR(length=20), type_=sa.String(length=50),
                              existing_nullable=True)

    with op.batch_alter_table('session_feedback', schema=None) as batch_op:
        batch_op.alter_column('helpful_count', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('0'))

    with op.batch_alter_table('session_polls', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_poll_session'))
        batch_op.create_index(batch_op.f('ix_session_polls_session_id'), ['session_id'], unique=False)

    # --- subjects: type, nullability, missing FK ---
    with op.batch_alter_table('subjects', schema=None) as batch_op:
        batch_op.alter_column('subject_type', existing_type=sa.VARCHAR(length=50), type_=sa.String(length=30),
                              existing_nullable=True,
                              existing_server_default=sa.text("'Theory'::character varying"))
        batch_op.alter_column('total_marks', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('100'))
        batch_op.create_foreign_key('fk_subjects_department_id', 'departments', ['department_id'], ['id'])

    # --- support_tickets: drop the constraint copy (unique index remains) ---
    with op.batch_alter_table('support_tickets', schema=None) as batch_op:
        batch_op.drop_constraint('support_tickets_ticket_number_key', type_='unique')

    # --- users ---
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('must_change_password', existing_type=sa.BOOLEAN(), nullable=True,
                              existing_server_default=sa.text('false'))


def downgrade():
    # --- users ---
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('must_change_password', existing_type=sa.BOOLEAN(), nullable=False,
                              existing_server_default=sa.text('false'))

    # --- support_tickets / subjects ---
    with op.batch_alter_table('support_tickets', schema=None) as batch_op:
        batch_op.create_unique_constraint('support_tickets_ticket_number_key', ['ticket_number'])

    with op.batch_alter_table('subjects', schema=None) as batch_op:
        batch_op.drop_constraint('fk_subjects_department_id', type_='foreignkey')
        batch_op.alter_column('total_marks', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('100'))
        batch_op.alter_column('subject_type', existing_type=sa.String(length=30), type_=sa.VARCHAR(length=50),
                              existing_nullable=True,
                              existing_server_default=sa.text("'Theory'::character varying"))

    # --- session_feedback / session_polls / sections ---
    with op.batch_alter_table('session_feedback', schema=None) as batch_op:
        batch_op.alter_column('helpful_count', existing_type=sa.INTEGER(), nullable=True,
                              existing_server_default=sa.text('0'))

    with op.batch_alter_table('session_polls', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_session_polls_session_id'))
        batch_op.create_index(batch_op.f('ix_poll_session'), ['session_id'], unique=False)

    with op.batch_alter_table('sections', schema=None) as batch_op:
        batch_op.alter_column('section_code', existing_type=sa.String(length=50), type_=sa.VARCHAR(length=20),
                              existing_nullable=True)

    # --- scheduled_announcements ---
    with op.batch_alter_table('scheduled_announcements', schema=None) as batch_op:
        batch_op.drop_constraint('scheduled_announcements_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('scheduled_announcements_institution_id_fkey', 'institutions',
                                    ['institution_id'], ['id'], ondelete='CASCADE')
        batch_op.drop_index(batch_op.f('ix_scheduled_announcements_status'))
        batch_op.drop_index(batch_op.f('ix_scheduled_announcements_send_at'))
        batch_op.drop_index(batch_op.f('ix_scheduled_announcements_institution_id'))
        batch_op.alter_column('created_at', existing_type=postgresql.TIMESTAMP(), nullable=False)
        batch_op.alter_column('status', existing_type=sa.VARCHAR(length=20), nullable=False,
                              existing_server_default=sa.text("'pending'::character varying"))
        batch_op.alter_column('target', existing_type=sa.VARCHAR(length=20), nullable=False,
                              existing_server_default=sa.text("'all'::character varying"))

    # --- question_bank ---
    with op.batch_alter_table('question_bank', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_question_bank_institution_id'))
        batch_op.drop_index(batch_op.f('ix_question_bank_created_by'))
        batch_op.create_index(batch_op.f('ix_qbank_inst'), ['institution_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_qbank_creator'), ['created_by'], unique=False)

    # --- proctor_events: restore cascade FKs ---
    with op.batch_alter_table('proctor_events', schema=None) as batch_op:
        batch_op.drop_constraint('proctor_events_student_id_fkey', type_='foreignkey')
        batch_op.drop_constraint('proctor_events_session_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('proctor_events_student_id_fkey', 'users', ['student_id'], ['id'],
                                    ondelete='CASCADE')
        batch_op.create_foreign_key('proctor_events_session_id_fkey', 'lab_sessions', ['session_id'], ['id'],
                                    ondelete='CASCADE')
        batch_op.drop_index(batch_op.f('ix_proctor_events_institution_id'))

    # --- platform_exercises ---
    with op.batch_alter_table('platform_exercises', schema=None) as batch_op:
        batch_op.alter_column('acceptance_rate', existing_type=sa.Float(), type_=sa.REAL(),
                              existing_nullable=True)
        batch_op.alter_column('tags', existing_type=sa.JSON(), type_=postgresql.JSONB(astext_type=sa.Text()),
                              postgresql_using='tags::text::jsonb', existing_nullable=True)

    # --- practice_problems / practice_student_xp ---
    with op.batch_alter_table('practice_problems', schema=None) as batch_op:
        batch_op.alter_column('difficulty', existing_type=sa.String(length=10), type_=sa.VARCHAR(length=20),
                              existing_nullable=False)

    with op.batch_alter_table('practice_student_xp', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_practice_student_xp_profile_slug'))
        batch_op.create_index(batch_op.f('ix_xp_slug'), ['profile_slug'], unique=False)

    # --- playground_sessions: back to constraint + plain index ---
    with op.batch_alter_table('playground_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_playground_sessions_share_slug'))
        batch_op.create_unique_constraint('playground_sessions_share_slug_key', ['share_slug'])
        batch_op.create_index(batch_op.f('ix_pgsess_slug'), ['share_slug'], unique=False)

    # --- invoices ---
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.create_unique_constraint('invoices_invoice_number_key', ['invoice_number'])

    # --- interventions ---
    with op.batch_alter_table('interventions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('updated_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('notes', sa.TEXT(), autoincrement=False, nullable=True))
        batch_op.drop_constraint('interventions_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('interventions_institution_id_fkey', 'institutions', ['institution_id'],
                                    ['id'], ondelete='CASCADE')
        batch_op.drop_index(batch_op.f('ix_interventions_student_id'))
        batch_op.drop_index(batch_op.f('ix_interventions_institution_id'))
        batch_op.drop_index(batch_op.f('ix_interventions_created_at'))
        batch_op.create_index(batch_op.f('ix_intervention_inst'), ['institution_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_intervention_created'), ['created_at'], unique=False)

    # --- institutions ---
    with op.batch_alter_table('institutions', schema=None) as batch_op:
        batch_op.alter_column('onboarding_status', existing_type=sa.String(length=20),
                              type_=sa.VARCHAR(length=30), existing_nullable=True,
                              existing_server_default=sa.text("'pending'::character varying"))

    # --- institution_documents ---
    with op.batch_alter_table('institution_documents', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_institution_documents_uploaded_by'))
        batch_op.drop_index(batch_op.f('ix_institution_documents_scope_type'))
        batch_op.drop_index(batch_op.f('ix_institution_documents_scope_id'))
        batch_op.drop_index(batch_op.f('ix_institution_documents_created_at'))

    # --- focus_scores: restore legacy columns + index removals ---
    with op.batch_alter_table('focus_scores', schema=None) as batch_op:
        batch_op.add_column(sa.Column('large_paste_detected', sa.BOOLEAN(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('copy_paste_count', sa.INTEGER(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('idle_seconds', sa.INTEGER(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('face_present_pct', sa.DOUBLE_PRECISION(precision=53), autoincrement=False,
                                      nullable=True))
        batch_op.add_column(sa.Column('typing_speed_avg', sa.DOUBLE_PRECISION(precision=53), autoincrement=False,
                                      nullable=True))
        batch_op.add_column(sa.Column('window_blurs', sa.INTEGER(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('tab_switches', sa.INTEGER(), autoincrement=False, nullable=True))
        batch_op.add_column(sa.Column('gaze_score', sa.DOUBLE_PRECISION(precision=53), autoincrement=False,
                                      nullable=True))
        batch_op.drop_index('ix_focus_student_session')
        batch_op.drop_index('ix_focus_session_recorded')
        batch_op.drop_index(batch_op.f('ix_focus_scores_recorded_at'))

    # --- extensions: restore cascade FK + duplicates ---
    with op.batch_alter_table('extensions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_extensions_institution_id'))
        batch_op.create_index(batch_op.f('ix_extension_inst'), ['institution_id'], unique=False)
        batch_op.drop_constraint('extensions_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('extensions_institution_id_fkey', 'institutions', ['institution_id'],
                                    ['id'], ondelete='CASCADE')
        batch_op.create_foreign_key('extensions_experiment_id_fkey1', 'experiments', ['experiment_id'], ['id'])
        batch_op.create_foreign_key('extensions_granted_by_fkey1', 'users', ['granted_by'], ['id'])
        batch_op.create_foreign_key('extensions_student_id_fkey1', 'users', ['student_id'], ['id'])

    # --- experiments ---
    with op.batch_alter_table('experiments', schema=None) as batch_op:
        batch_op.alter_column('grade_scale', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('100'))
        batch_op.alter_column('weightage', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('1'))

    # --- exam_questions / exam_attempts ---
    with op.batch_alter_table('exam_questions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_exam_questions_experiment_id', type_='foreignkey')
        batch_op.drop_index('ix_exam_questions_exam')
        batch_op.create_index(batch_op.f('ix_exam_questions_exam'), ['exam_id'], unique=False)
        batch_op.alter_column('exam_id', existing_type=sa.VARCHAR(length=36), nullable=False)

    with op.batch_alter_table('exam_attempts', schema=None) as batch_op:
        batch_op.drop_constraint('fk_exam_attempts_experiment_id', type_='foreignkey')
        batch_op.alter_column('exam_id', existing_type=sa.VARCHAR(length=36), nullable=False)

    # --- ai_usage_log ---
    with op.batch_alter_table('ai_usage_log', schema=None) as batch_op:
        batch_op.drop_constraint('fk_ai_usage_log_institution_id', type_='foreignkey')
        batch_op.drop_constraint('fk_ai_usage_log_user_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_ai_usage_log_user_id'))
        batch_op.drop_index(batch_op.f('ix_ai_usage_log_total_tokens'))
        batch_op.drop_index(batch_op.f('ix_ai_usage_log_institution_id'))
        batch_op.drop_index(batch_op.f('ix_ai_usage_log_feature'))
        batch_op.drop_index(batch_op.f('ix_ai_usage_log_created_at'))
        batch_op.alter_column('created_at', existing_type=postgresql.TIMESTAMP(), nullable=False)
        batch_op.alter_column('success', existing_type=sa.BOOLEAN(), nullable=False,
                              existing_server_default=sa.text('true'))
        batch_op.alter_column('estimated_cost_usd', existing_type=sa.Numeric(precision=12, scale=8),
                              type_=sa.DOUBLE_PRECISION(precision=53),
                              postgresql_using='estimated_cost_usd::double precision',
                              existing_nullable=True)
        batch_op.alter_column('total_tokens', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('0'))
        batch_op.alter_column('completion_tokens', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('0'))
        batch_op.alter_column('prompt_tokens', existing_type=sa.INTEGER(), nullable=False,
                              existing_server_default=sa.text('0'))
        batch_op.alter_column('feature', existing_type=sa.String(length=30), type_=sa.VARCHAR(length=40),
                              nullable=False)
        batch_op.alter_column('role', existing_type=sa.String(length=20), type_=sa.VARCHAR(length=30),
                              existing_nullable=True)

    # --- ai_policy ---
    with op.batch_alter_table('ai_policy', schema=None) as batch_op:
        batch_op.drop_constraint('ai_policy_updated_by_fkey', type_='foreignkey')
        batch_op.drop_constraint('ai_policy_institution_id_fkey', type_='foreignkey')
        batch_op.create_foreign_key('ai_policy_institution_id_fkey', 'institutions', ['institution_id'],
                                    ['id'], ondelete='CASCADE')

    # --- ai_agent_run ---
    with op.batch_alter_table('ai_agent_run', schema=None) as batch_op:
        batch_op.drop_constraint('fk_ai_agent_run_user_id', type_='foreignkey')
        batch_op.drop_constraint('fk_ai_agent_run_institution_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_ai_agent_run_institution_id'))
        batch_op.drop_index(batch_op.f('ix_ai_agent_run_created_at'))
        batch_op.alter_column('created_at', existing_type=postgresql.TIMESTAMP(), nullable=False)
        batch_op.alter_column('user_id', existing_type=sa.VARCHAR(length=36), nullable=True)
        batch_op.alter_column('institution_id', existing_type=sa.VARCHAR(length=36), nullable=True)

    # --- admin_chat_sessions ---
    with op.batch_alter_table('admin_chat_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_admin_chat_sessions_role_scope'))

    # --- ai_document_chunks: back to JSON, drop ivfflat ---
    with op.batch_alter_table('ai_document_chunks', schema=None) as batch_op:
        batch_op.drop_index('ix_ai_chunks_embedding', postgresql_using='ivfflat',
                            postgresql_ops={'embedding': 'vector_cosine_ops'})
        batch_op.alter_column('embedding', existing_type=Vector(768),
                              type_=postgresql.JSON(astext_type=sa.Text()),
                              postgresql_using='embedding::text::json',
                              existing_nullable=True)
