"""tier1 instructor tools: interventions + extensions

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
Create Date: 2026-09-01

Two new tables for the instructor management layer:
  interventions — closes the loop on at-risk flags (action, note, follow-up,
                  outcome).
  extensions    — per-(student, experiment) deadline relief and excused
                  absences, honored by check-gate and catch-up logic.
"""
from alembic import op
import sqlalchemy as sa

revision = 'n0o1p2q3r4s5'
down_revision = 'm9n0o1p2q3r4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'interventions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('institution_id', sa.String(length=36), nullable=False),
        sa.Column('student_id', sa.String(length=36), nullable=False),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('action_type', sa.String(length=30), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('follow_up_at', sa.DateTime(), nullable=True),
        sa.Column('outcome', sa.String(length=20), nullable=True,
                  server_default='open'),
        sa.Column('outcome_note', sa.Text(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_intervention_student_status', 'interventions',
                    ['student_id', 'outcome'])
    op.create_index('ix_intervention_followup', 'interventions', ['follow_up_at'])
    op.create_index('ix_intervention_created', 'interventions', ['created_at'])
    op.create_index('ix_intervention_inst', 'interventions', ['institution_id'])

    op.create_table(
        'extensions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('institution_id', sa.String(length=36), nullable=False),
        sa.Column('student_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('experiment_id', sa.String(36), sa.ForeignKey('experiments.id'), nullable=False),
        sa.Column('granted_by', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('extension_until', sa.DateTime(), nullable=False),
        sa.Column('excused', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['institution_id'], ['institutions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['student_id'], ['users.id']),
        sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id']),
        sa.ForeignKeyConstraint(['granted_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_extension_student_exp', 'extensions', ['student_id', 'experiment_id'])
    op.create_index('ix_extension_inst', 'extensions', ['institution_id'])


def downgrade():
    op.drop_index('ix_extension_inst', table_name='extensions')
    op.drop_index('ix_extension_student_exp', table_name='extensions')
    op.drop_table('extensions')
    op.drop_index('ix_intervention_inst', table_name='interventions')
    op.drop_index('ix_intervention_created', table_name='interventions')
    op.drop_index('ix_intervention_followup', table_name='interventions')
    op.drop_index('ix_intervention_student_status', table_name='interventions')
    op.drop_table('interventions')
