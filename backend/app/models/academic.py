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
