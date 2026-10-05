"""instructor_hot_path_indexes

Revision ID: w9x0y1z2a3
Revises: v8w9x0y1z2
Create Date: 2026-09-16

Indexes for the instructor hot-path queries identified in Phase A,
plus the matching db.Index declarations added to the models
(session.py, submission.py, grading.py, feedback.py, knowledge.py, experiment.py)
so schema and database converge.

Verified against actual route predicates:
  lab_sessions: dashboard active/upcoming, attention starting-soon, sessions order
  session_attendance: live_dashboard/roster status filters (PK leads session_id; status adds)
  code_attempts: A4 attempt counts, session analytics, dashboard pending/recent finals
  grades: analytics trends grade bucket
  plagiarism_flags: grading flags, session_plagiarism
  viva_sessions: /vivas order-by
  content_progress: quiz-gate analytics (features.py:662)
  hint_logs: hint_effectiveness grouping
  session_feedback: feedback order-by
  student_rankings: trajectory + dashboard IN-list

Idempotent: every statement guarded by existence check, so safe to run
against databases that already received these indexes by hand.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 'w9x0y1z2a3'
down_revision = 'v8w9x0y1z2'
branch_labels = None
depends_on = None


# (index_name, table, columns, unique)
INDEXES = [
    # lab_sessions: dashboard active/upcoming (institution_id + status + scheduled_at)
    ('ix_lab_sessions_ss_status_scheduled',
     'lab_sessions', ['section_subject_id', 'status', 'scheduled_at'], False),

    # session_attendance: live_dashboard/roster status filters
    ('ix_session_attendance_session_status',
     'session_attendance', ['session_id', 'status'], False),

    # code_attempts: A4 attempt counts per session, session analytics
    ('ix_code_attempts_session_id',
     'code_attempts', ['session_id'], False),

    # code_attempts: dashboard pending/recent finals (is_final_submission + submitted_at)
    ('ix_code_attempts_exp_final_submitted',
     'code_attempts', ['experiment_id', 'is_final_submission', 'submitted_at'], False),

    # grades: analytics trends grade bucket per session
    ('ix_grades_session_id',
     'grades', ['session_id'], False),

    # plagiarism_flags: grading flags (institution + status), session_plagiarism
    ('ix_plagiarism_flags_institution_status',
     'plagiarism_flags', ['institution_id', 'status'], False),
    ('ix_plagiarism_flags_session_id',
     'plagiarism_flags', ['session_id'], False),

    # viva_sessions: /vivas order-by experiment + created_at
    ('ix_viva_sessions_experiment_created',
     'viva_sessions', ['experiment_id', 'created_at'], False),

    # content_progress: quiz-gate analytics (features.py:662)
    ('ix_content_progress_module_id',
     'content_progress', ['module_id'], False),

    # hint_logs: hint_effectiveness grouping by experiment + student
    ('ix_hint_logs_experiment_student',
     'hint_logs', ['experiment_id', 'student_id'], False),

    # session_feedback: feedback order-by session + submitted_at
    ('ix_session_feedback_session_submitted',
     'session_feedback', ['session_id', 'submitted_at'], False),

    # student_rankings: trajectory + dashboard IN-list
    ('ix_student_rankings_student_id',
     'student_rankings', ['student_id'], False),
]


def _tables_and_indexes():
    conn = op.get_bind()
    insp = sa_inspect(conn)
    return insp


def _cols_of(insp, table):
    return {c['name'] for c in insp.get_columns(table)}


def upgrade():
    insp = _tables_and_indexes()
    tables = set(insp.get_table_names())
    for name, table, columns, unique in INDEXES:
        if table not in tables:
            continue
        cols_present = _cols_of(insp, table)
        if not all(c in cols_present for c in columns):
            continue
        existing = {i['name'] for i in insp.get_indexes(table)}
        if name in existing:
            continue
        op.create_index(name, table, columns, unique=unique)


def downgrade():
    insp = _tables_and_indexes()
    tables = set(insp.get_table_names())
    for name, table, columns, unique in reversed(INDEXES):
        if table not in tables:
            continue
        existing = {i['name'] for i in insp.get_indexes(table)}
        if name not in existing:
            continue
        op.drop_index(name, table_name=table)