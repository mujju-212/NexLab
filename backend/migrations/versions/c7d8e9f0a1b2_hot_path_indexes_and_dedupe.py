"""hot-path FK indexes and duplicate index dedupe

Revision ID: c7d8e9f0a1b2
Revises: bfbd6e000e37
Create Date: 2026-10-25

Performance hardening for concurrent-request handling:

- Create the 15 hot-path FK indexes now declared in the models. Postgres does
  not auto-index FK columns; without these, per-session/per-exam lookups and
  parent-row deletes degrade to sequential scans under load:
  proctor_events(session_id, student_id), exam_attempts(experiment_id),
  grades(exam_id), checkpoint_progress(student_id, checkpoint_id),
  platform_progress(exercise_id, course_id), practice_bookmarks(problem_id),
  contest_participants(user_id), chat_messages(from_id, to_id),
  support_tickets(user_id), recurring_plans(instructor_id),
  ai_agent_run(user_id).
- Drop 4 exact duplicate indexes (same table + same columns as a kept index):
  ix_experiments_instructor (== ix_experiments_instructor_id),
  ix_test_cases_experiment (== ix_test_cases_experiment_id),
  ix_quiz_questions_module (== ix_quiz_questions_module_id),
  ix_ai_chunks_document_id (== ix_ai_document_chunks_document_id).

NOTE: the other DB-only extra indexes (trgm_* GIN search indexes and the
remaining ix_* perf extras) are intentionally kept and will keep showing up
in autogenerate proposals — do not act on those.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'c7d8e9f0a1b2'
down_revision = 'bfbd6e000e37'
branch_labels = None
depends_on = None

NEW_INDEXES = [
    ('ix_proctor_events_session_id', 'proctor_events', ['session_id']),
    ('ix_proctor_events_student_id', 'proctor_events', ['student_id']),
    ('ix_exam_attempts_experiment_id', 'exam_attempts', ['experiment_id']),
    ('ix_grades_exam_id', 'grades', ['exam_id']),
    ('ix_checkpoint_progress_student_id', 'checkpoint_progress', ['student_id']),
    ('ix_checkpoint_progress_checkpoint_id', 'checkpoint_progress', ['checkpoint_id']),
    ('ix_platform_progress_exercise_id', 'platform_progress', ['exercise_id']),
    ('ix_platform_progress_course_id', 'platform_progress', ['course_id']),
    ('ix_practice_bookmarks_problem_id', 'practice_bookmarks', ['problem_id']),
    ('ix_contest_participants_user_id', 'contest_participants', ['user_id']),
    ('ix_chat_messages_from_id', 'chat_messages', ['from_id']),
    ('ix_chat_messages_to_id', 'chat_messages', ['to_id']),
    ('ix_support_tickets_user_id', 'support_tickets', ['user_id']),
    ('ix_recurring_plans_instructor_id', 'recurring_plans', ['instructor_id']),
    ('ix_ai_agent_run_user_id', 'ai_agent_run', ['user_id']),
]

DUPLICATE_INDEXES = [
    ('ix_experiments_instructor', 'experiments'),
    ('ix_test_cases_experiment', 'test_cases'),
    ('ix_quiz_questions_module', 'quiz_questions'),
    ('ix_ai_chunks_document_id', 'ai_document_chunks'),
]


def upgrade():
    for name, table, cols in NEW_INDEXES:
        op.create_index(name, table, cols, unique=False)
    for name, table in DUPLICATE_INDEXES:
        op.drop_index(name, table_name=table)


def downgrade():
    for name, table in DUPLICATE_INDEXES:
        op.create_index(name, table, _cols_for(name), unique=False)
    for name, table, cols in reversed(NEW_INDEXES):
        op.drop_index(name, table_name=table)


def _cols_for(name):
    # duplicates mirror the surviving index's columns
    return {
        'ix_experiments_instructor': ['instructor_id'],
        'ix_test_cases_experiment': ['experiment_id'],
        'ix_quiz_questions_module': ['module_id'],
        'ix_ai_chunks_document_id': ['document_id'],
    }[name]
