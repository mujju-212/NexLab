import uuid
from datetime import datetime
from app.extensions import db


class AcademicYear(db.Model):
    __tablename__ = 'academic_years'
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    year_label     = db.Column(db.String(20), nullable=False)   # e.g. "2024-2025"
    is_active      = db.Column(db.Boolean, default=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    batches        = db.relationship('Batch', backref='academic_year', lazy='dynamic')

    def to_dict(self):
        return {'id': self.id, 'year_label': self.year_label, 'is_active': self.is_active}


class Batch(db.Model):
    __tablename__ = 'batches'
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    year_id        = db.Column(db.String(36), db.ForeignKey('academic_years.id'), nullable=False)
    name           = db.Column(db.Text, nullable=False)       # e.g. "CSE 2nd Year"
    program        = db.Column(db.String(20))                 # e.g. "B.E. CSE"
    department_id  = db.Column(db.String(36), db.ForeignKey('departments.id'), nullable=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    sections       = db.relationship('Section', backref='batch', lazy='dynamic')
    department     = db.relationship('Department', foreign_keys=[department_id], lazy='joined')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'program': self.program,
            'year_id': self.year_id,
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else None,
        }


class Department(db.Model):
    """Academic department, e.g. Computer Science, Mechanical Engineering."""
    __tablename__ = 'departments'
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    name           = db.Column(db.Text, nullable=False)        # e.g. "Computer Science"
    code           = db.Column(db.String(20))                  # e.g. "CSE"
    description    = db.Column(db.Text)
    color          = db.Column(db.String(30), default='#7c3aed')
    is_active      = db.Column(db.Boolean, default=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    users          = db.relationship('User', backref='department', lazy='dynamic')
    subjects       = db.relationship('Subject', backref='department', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'description': self.description or '',
            'color': self.color or '#7c3aed',
            'is_active': bool(self.is_active) if self.is_active is not None else True,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Section(db.Model):
    __tablename__ = 'sections'
    id                = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id    = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    batch_id          = db.Column(db.String(36), db.ForeignKey('batches.id'), nullable=False)
    name              = db.Column(db.String(10), nullable=False)  # e.g. "A", "B"
    section_code      = db.Column(db.String(50))
    max_students      = db.Column(db.Integer, default=60)
    is_active         = db.Column(db.Boolean, default=True)
    class_teacher_id  = db.Column(db.String(36), db.ForeignKey('users.id'))
    created_at        = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'section_code': self.section_code or '',
            'max_students': self.max_students or 60,
            'is_active': bool(self.is_active) if self.is_active is not None else True,
            'batch_id': self.batch_id,
            'class_teacher_id': self.class_teacher_id,
        }


class SectionStudent(db.Model):
    """Many-to-many: students enrolled in sections"""
    __tablename__ = 'section_students'
    # PK covers (section_id, student_id). The users-list enrichment queries
    # by student_id IN (...) and the section-students tab by section_id, so
    # student_id needs its own index the PK ordering can't serve.
    __table_args__ = (
        db.Index('ix_section_students_student_id', 'student_id'),
    )
    section_id  = db.Column(db.String(36), db.ForeignKey('sections.id'), primary_key=True)
    student_id  = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)


class SectionSubject(db.Model):
    """Maps subjects to sections + assigns instructor"""
    __tablename__ = 'section_subjects'
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    section_id     = db.Column(db.String(36), db.ForeignKey('sections.id'), nullable=False)
    subject_id     = db.Column(db.String(36), db.ForeignKey('subjects.id'), nullable=False)
    instructor_id  = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    co_instructor_id = db.Column(db.String(36), db.ForeignKey('users.id'))
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'section_id': self.section_id,
            'subject_id': self.subject_id,
            'instructor_id': self.instructor_id,
        }


class AuditLog(db.Model):
    """Admin action history — tracks all sensitive operations per institution"""
    __tablename__ = 'audit_logs'

    # The audit-log page always filters institution_id + a created_at window
    # and orders created_at DESC with offset/limit — the (institution_id,
    # created_at) composite turns that from a sort-into-a-temp-set into a
    # backward index scan. The other three back the DISTINCT filter-choice
    # queries and the ?action=/?severity= dropdown filters.
    __table_args__ = (
        db.Index('ix_audit_logs_institution_id', 'institution_id'),
        db.Index('ix_audit_logs_actor_id', 'actor_id'),
        db.Index('ix_audit_logs_institution_created',
                 'institution_id', 'created_at'),
        db.Index('ix_audit_logs_institution_action',
                 'institution_id', 'action'),
        db.Index('ix_audit_logs_institution_module',
                 'institution_id', 'module'),
        db.Index('ix_audit_logs_institution_severity',
                 'institution_id', 'severity'),
    )

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    actor_id       = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    action         = db.Column(db.String(50), nullable=False)
    # actions: force_logout | create_user | deactivate_user | bulk_upload
    #          send_announcement | assign_instructor | enroll_students | delete_experiment
    target_type    = db.Column(db.String(30))   # user | session | experiment | section
    target_id      = db.Column(db.String(36))
    detail         = db.Column(db.Text)         # human-readable description
    module         = db.Column(db.String(50), nullable=True, default='System')
    ip_address     = db.Column(db.String(45), nullable=True, default='192.168.1.24')
    severity       = db.Column(db.String(20), default='low', nullable=False)  # low | medium | high
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    # Actor relationship. selectin (not joined): with joined, every paged
    # audit query gets rewritten as SELECT DISTINCT ... LEFT JOIN users, and
    # Postgres must hash/sort the full text rows to dedupe — the actor is then
    # fetched in one cheap IN-batch query instead.
    actor          = db.relationship('User', foreign_keys=[actor_id], lazy='selectin')

    def to_dict(self):
        return {
            'id':          self.id,
            'actor_id':    self.actor_id,
            'actor_name':  self.actor.full_name if self.actor else 'Unknown User',
            'actor_email': self.actor.email if self.actor else None,
            'actor_role':  self.actor.role if self.actor else None,
            'action':      self.action,
            'module':      self.module or 'System',
            'target_type': self.target_type,
            'target_id':   self.target_id,
            'detail':      self.detail,
            'ip_address':  self.ip_address or '192.168.1.24',
            'severity':    self.severity or 'low',
            'created_at':  self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
