"""admin_hot_path_indexes

Revision ID: t6u7v8w9x0
Revises: s4t5u6v7w8
Create Date: 2026-09-15

Indexes for the queries the institution-admin pages actually run, plus the
declarations added to the models (users/audit_logs/lab_sessions/section_students)
so schema and database converge. The earlier performance_indexes migration
covered single-column FK hygiene; these composites match the real predicates:

  users:     ?department_id= filters, the role+active dashboard counts,
             and order_by(full_name) after an institution filter
  audit_logs: the paged newest-first list (institution + created_at DESC)
             and the action/module/severity dropdown filters
  lab_sessions: upcoming/live (institution + status IN + scheduled_at) and
             history/calendar (institution + scheduled_at)
  section_students: the student_id IN (...) lookup in the users-list enrichment
             (its PK leads with section_id, so student_id was unindexed)

Idempotent: every statement is guarded by an existence check, so this is safe
to run against databases that already received these indexes by hand.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision = 't6u7v8w9x0'
down_revision = 's4t5u6v7w8'
branch_labels = None
depends_on = None


# (index_name, table, columns, unique)
INDEXES = [
    ('ix_users_department_id',                'users', ['department_id'], False),
    ('ix_users_institution_id_full_name',     'users', ['institution_id', 'full_name'], False),
    # Supersedes ix_users_institution_id_role (from performance_indexes):
    # the old 2-col index is a strict prefix of this one, so it's redundant
    # and only costs write throughput. Dropped below.
    ('ix_users_institution_id_role_is_active','users', ['institution_id', 'role', 'is_active'], False),

    ('ix_audit_logs_institution_created',     'audit_logs', ['institution_id', 'created_at'], False),
    ('ix_audit_logs_institution_action',      'audit_logs', ['institution_id', 'action'], False),
    ('ix_audit_logs_institution_module',      'audit_logs', ['institution_id', 'module'], False),
    ('ix_audit_logs_institution_severity',    'audit_logs', ['institution_id', 'severity'], False),

    ('ix_lab_sessions_iid_status_scheduled',  'lab_sessions', ['institution_id', 'status', 'scheduled_at'], False),
    ('ix_lab_sessions_iid_scheduled',         'lab_sessions', ['institution_id', 'scheduled_at'], False),

    ('ix_section_students_student_id',        'section_students', ['student_id'], False),
]

# Redundant once the composite superseding them exists.
DROP_INDEXES = [
    ('ix_users_institution_id_role', 'users'),
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
        # Some databases predate the enrichment migrations (audit_logs.module
        # etc. were added ad hoc); indexing a column that isn't there would
        # abort the whole upgrade — skip it instead, the enrichment migration
        # or a re-run will add it.
        cols_present = _cols_of(insp, table)
        if not all(c in cols_present for c in columns):
            continue
        existing = {i['name'] for i in insp.get_indexes(table)}
        if name in existing:
            continue
        op.create_index(name, table, columns, unique=unique)

    insp = _tables_and_indexes()  # re-inspect after creates
    for name, table in DROP_INDEXES:
        if table not in tables:
            continue
        existing = {i['name'] for i in insp.get_indexes(table)}
        if name in existing:
            op.drop_index(name, table_name=table)


def downgrade():
    insp = _tables_and_indexes()
    tables = set(insp.get_table_names())
    for name, table in DROP_INDEXES:
        if table in tables:
            existing = {i['name'] for i in insp.get_indexes(table)}
            if name not in existing:
                op.create_index(name, table,
                                ['institution_id', 'role'])
    for name, table, columns, unique in reversed(INDEXES):
        if table not in tables:
            continue
        existing = {i['name'] for i in insp.get_indexes(table)}
        if name not in existing:
            continue
        op.drop_index(name, table_name=table)
