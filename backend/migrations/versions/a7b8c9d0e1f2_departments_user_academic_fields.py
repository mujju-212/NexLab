"""departments_user_academic_fields

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-14

Adds:
  - departments table (academic department CRUD, e.g. Computer Science)
  - users: first_name, last_name, staff_id, department_id, year_of_study, semester
  - sections: class_teacher_id
"""
from alembic import op
import sqlalchemy as sa

revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    # ── departments ──────────────────────────────────────────────────────────
    op.create_table(
        'departments',
        sa.Column('id',             sa.String(36), nullable=False),
        sa.Column('institution_id', sa.String(36), nullable=False),
        sa.Column('name',           sa.Text,       nullable=False),
        sa.Column('code',           sa.String(20), nullable=True),
        sa.Column('created_at',     sa.DateTime,   nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_departments_institution_id', 'departments', ['institution_id'])

    # ── users: name split, staff ID, department, year/semester ─────────────────
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('first_name', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('last_name', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('staff_id', sa.String(30), nullable=True))
        batch_op.add_column(sa.Column('department_id', sa.String(36), nullable=True))
        batch_op.add_column(sa.Column('year_of_study', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('semester', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_users_department_id', 'departments', ['department_id'], ['id'])
    op.create_index('ix_users_department_id', 'users', ['department_id'])

    # ── sections: class teacher assignment ──────────────────────────────────────
    with op.batch_alter_table('sections', schema=None) as batch_op:
        batch_op.add_column(sa.Column('class_teacher_id', sa.String(36), nullable=True))
        batch_op.create_foreign_key('fk_sections_class_teacher_id', 'users', ['class_teacher_id'], ['id'])
    op.create_index('ix_sections_class_teacher_id', 'sections', ['class_teacher_id'])


def downgrade():
    op.drop_index('ix_sections_class_teacher_id', table_name='sections')
    with op.batch_alter_table('sections', schema=None) as batch_op:
        batch_op.drop_constraint('fk_sections_class_teacher_id', type_='foreignkey')
        batch_op.drop_column('class_teacher_id')

    op.drop_index('ix_users_department_id', table_name='users')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_department_id', type_='foreignkey')
        batch_op.drop_column('semester')
        batch_op.drop_column('year_of_study')
        batch_op.drop_column('department_id')
        batch_op.drop_column('staff_id')
        batch_op.drop_column('last_name')
        batch_op.drop_column('first_name')

    op.drop_index('ix_departments_institution_id', table_name='departments')
    op.drop_table('departments')
