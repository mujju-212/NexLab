import uuid
from datetime import datetime
from app.extensions import db


class Subject(db.Model):
    __tablename__ = 'subjects'
    __table_args__ = (
        db.Index('ix_subjects_inst_dept', 'institution_id', 'department_id'),
    )
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    name            = db.Column(db.Text, nullable=False)
    code            = db.Column(db.String(20))               # e.g. "CS3401"
    description     = db.Column(db.Text)
    icon            = db.Column(db.Text, default='datastruct')  # preset name OR Cloudinary URL
    color           = db.Column(db.String(30), default='#7c3aed')
    department_id   = db.Column(db.String(36), db.ForeignKey('departments.id'))
    subject_type    = db.Column(db.String(30), default='Theory')  # Theory, Practical, Lab, Elective
    is_active       = db.Column(db.Boolean, default=True)
    env_profile_id  = db.Column(db.String(36), db.ForeignKey('environment_profiles.id'))
    total_marks     = db.Column(db.Integer, default=100)     # sum of all experiment weightages → max marks for the subject
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    experiments     = db.relationship('Experiment', backref='subject', lazy='dynamic')

    def to_dict(self):
        dept = self.department if hasattr(self, 'department') and self.department else None
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code or '',
            'description': self.description or '',
            'icon': self.icon or 'datastruct',
            'color': self.color or '#7c3aed',
            'department_id': self.department_id,
            'department_name': dept.name if dept else None,
            'subject_type': self.subject_type or 'Theory',
            'is_active': bool(self.is_active) if self.is_active is not None else True,
            'env_profile_id': self.env_profile_id,
            'total_marks': self.total_marks or 100,
        }


class EnvironmentProfile(db.Model):
    """Docker image profiles — predefined or instructor-requested custom"""
    __tablename__ = 'environment_profiles'
    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id      = db.Column(db.String(36), db.ForeignKey('institutions.id'))
    # NULL institution_id = platform-wide default profile

    name                = db.Column(db.Text, unique=True, nullable=False)  # 'data-science'
    display_name        = db.Column(db.Text, nullable=False)               # 'Data Science (numpy, pandas, sklearn)'
    docker_image        = db.Column(db.Text, nullable=False)               # 'virtuallab/data-science:latest'
    is_platform_default = db.Column(db.Boolean, default=False)
    pip_packages        = db.Column(db.JSON)                               # ["numpy==1.26.4", ...]
    apt_packages        = db.Column(db.JSON)
    build_status        = db.Column(db.String(20), default='active')
    # build_status: pending | building | active | failed

    created_by          = db.Column(db.String(36), db.ForeignKey('users.id'))
    approved_by         = db.Column(db.String(36), db.ForeignKey('users.id'))
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'name': self.name,
            'display_name': self.display_name,
            'docker_image': self.docker_image,
            'is_platform_default': bool(self.is_platform_default),
            'pip_packages': self.pip_packages or [],
            'apt_packages': self.apt_packages or [],
            'build_status': self.build_status,
            'created_by': self.created_by,
            'approved_by': self.approved_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
