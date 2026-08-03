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
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    sections       = db.relationship('Section', backref='batch', lazy='dynamic')

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'program': self.program}


class Section(db.Model):
    __tablename__ = 'sections'
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    batch_id       = db.Column(db.String(36), db.ForeignKey('batches.id'), nullable=False)
    name           = db.Column(db.String(10), nullable=False)  # e.g. "A", "B"
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'batch_id': self.batch_id}


class SectionStudent(db.Model):
    """Many-to-many: students enrolled in sections"""
    __tablename__ = 'section_students'
    section_id  = db.Column(db.String(36), db.ForeignKey('sections.id'), primary_key=True)
    student_id  = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    enrolled_at = db.Column(db.DateTime, default=datetime.utcnow)


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
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    actor_id       = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    action         = db.Column(db.String(50), nullable=False)
    # actions: force_logout | create_user | deactivate_user | bulk_upload
    #          send_announcement | assign_instructor | enroll_students | delete_experiment
    target_type    = db.Column(db.String(30))   # user | session | experiment | section
    target_id      = db.Column(db.String(36))
    detail         = db.Column(db.Text)         # human-readable description
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'actor_id':    self.actor_id,
            'action':      self.action,
            'target_type': self.target_type,
            'target_id':   self.target_id,
            'detail':      self.detail,
            'created_at':  self.created_at.isoformat() if self.created_at else None,
        }
