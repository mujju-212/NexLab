"""performance_indexes

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-14

Adds indexes on foreign-key / filter columns that are queried constantly
across the app but had NO index beyond primary keys and a few unique
constraints. This app is multi-tenant (institution_id filters on almost
every query) and does frequent per-student / per-experiment / per-session
lookups, all of which were previously full table scans.

Also adds a composite index on email_otps(email, purpose, created_at) to
match the exact lookup pattern used by /auth/otp/send and /auth/otp/verify.
"""
from alembic import op

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


# (table, column_or_columns, index_name)
INDEXES = [
    # ── Multi-tenancy: institution_id is filtered on nearly every query ────────
    ('users',               ['institution_id'],                 'ix_users_institution_id'),
    ('users',               ['institution_id', 'role'],         'ix_users_institution_id_role'),
    ('experiments',         ['institution_id'],                 'ix_experiments_institution_id'),
    ('experiments',         ['subject_id'],                     'ix_experiments_subject_id'),
    ('experiments',         ['instructor_id'],                  'ix_experiments_instructor_id'),
    ('subjects',            ['institution_id'],                 'ix_subjects_institution_id'),
    ('environment_profiles',['institution_id'],                 'ix_environment_profiles_institution_id'),
    ('academic_years',      ['institution_id'],                 'ix_academic_years_institution_id'),
    ('batches',             ['institution_id'],                 'ix_batches_institution_id'),
    ('batches',             ['year_id'],                        'ix_batches_year_id'),
    ('sections',            ['institution_id'],                 'ix_sections_institution_id'),
    ('sections',            ['batch_id'],                       'ix_sections_batch_id'),
    ('section_subjects',    ['institution_id'],                 'ix_section_subjects_institution_id'),
    ('section_subjects',    ['section_id'],                     'ix_section_subjects_section_id'),
    ('section_subjects',    ['subject_id'],                     'ix_section_subjects_subject_id'),
    ('section_subjects',    ['instructor_id'],                  'ix_section_subjects_instructor_id'),
    ('audit_logs',          ['institution_id'],                 'ix_audit_logs_institution_id'),
    ('audit_logs',          ['actor_id'],                       'ix_audit_logs_actor_id'),
    ('concept_mastery',     ['institution_id'],                 'ix_concept_mastery_institution_id'),
    ('session_feedback',    ['institution_id'],                 'ix_session_feedback_institution_id'),
    ('session_feedback',    ['session_id'],                     'ix_session_feedback_session_id'),
    ('plagiarism_flags',    ['institution_id'],                 'ix_plagiarism_flags_institution_id'),
    ('plagiarism_flags',    ['experiment_id'],                  'ix_plagiarism_flags_experiment_id'),

    # ── Lab sessions: dashboards & schedulers filter by these constantly ───────
    ('lab_sessions',        ['institution_id'],                 'ix_lab_sessions_institution_id'),
    ('lab_sessions',        ['institution_id', 'status'],       'ix_lab_sessions_institution_id_status'),
    ('lab_sessions',        ['section_subject_id'],             'ix_lab_sessions_section_subject_id'),
    ('lab_sessions',        ['experiment_id'],                  'ix_lab_sessions_experiment_id'),

    # ── Pre-lab content chain: fetched on every session gate-check ─────────────
    ('test_cases',          ['experiment_id'],                  'ix_test_cases_experiment_id'),
    ('content_modules',     ['experiment_id'],                  'ix_content_modules_experiment_id'),
    ('quiz_questions',      ['module_id'],                      'ix_quiz_questions_module_id'),

    # ── Code execution & grading: high write volume + frequent reads ───────────
    ('code_versions',       ['student_id'],                     'ix_code_versions_student_id'),
    ('code_versions',       ['experiment_id'],                  'ix_code_versions_experiment_id'),
    ('code_attempts',       ['student_id'],                     'ix_code_attempts_student_id'),
    ('code_attempts',       ['experiment_id'],                  'ix_code_attempts_experiment_id'),
    ('grades',              ['student_id'],                     'ix_grades_student_id'),
    ('grades',              ['experiment_id'],                  'ix_grades_experiment_id'),
    ('inline_comments',     ['grade_id'],                       'ix_inline_comments_grade_id'),

    # ── AI hints / viva ──────────────────────────────────────────────────────
    ('hint_logs',           ['student_id'],                     'ix_hint_logs_student_id'),
    ('hint_logs',           ['experiment_id'],                  'ix_hint_logs_experiment_id'),
    ('viva_sessions',       ['student_id'],                     'ix_viva_sessions_student_id'),
    ('viva_sessions',       ['experiment_id'],                  'ix_viva_sessions_experiment_id'),
    ('viva_answers',        ['viva_session_id'],                'ix_viva_answers_viva_session_id'),

    # ── Proctoring: focus_scores is written every ~30s per student in a live
    #    session, and read repeatedly for instructor dashboards ────────────────
    ('focus_scores',        ['session_id'],                     'ix_focus_scores_session_id'),
    ('focus_scores',        ['student_id'],                     'ix_focus_scores_student_id'),

    # ── Rankings, notifications, attendance ─────────────────────────────────────
    ('student_rankings',    ['section_subject_id'],             'ix_student_rankings_section_subject_id'),
    ('notifications',       ['user_id'],                        'ix_notifications_user_id'),
    ('session_attendance',  ['student_id'],                     'ix_session_attendance_student_id'),

    # ── OTP: exact lookup pattern used by /auth/otp/send and /auth/otp/verify ──
    ('email_otps',          ['email', 'purpose', 'created_at'], 'ix_email_otps_email_purpose_created'),
]


def upgrade():
    for table, columns, name in INDEXES:
        op.create_index(name, table, columns)


def downgrade():
    for table, columns, name in reversed(INDEXES):
        op.drop_index(name, table_name=table)
