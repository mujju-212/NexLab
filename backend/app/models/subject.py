import uuid
from datetime import datetime
from app.extensions import db


class Subject(db.Model):
    __tablename__ = 'subjects'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    name            = db.Column(db.Text, nullable=False)
    code            = db.Column(db.String(20))               # e.g. "CS3401"
    description     = db.Column(db.Text)
    env_profile_id  = db.Column(db.String(36), db.ForeignKey('environment_profiles.id'))
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    experiments     = db.relationship('Experiment', backref='subject', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'description': self.description,
            'env_profile_id': self.env_profile_id,
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
            'name': self.name,
            'display_name': self.display_name,
            'is_platform_default': self.is_platform_default,
            'pip_packages': self.pip_packages,
            'build_status': self.build_status,
        }
