import uuid
from datetime import datetime
from app.extensions import db


class Institution(db.Model):
    __tablename__ = 'institutions'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name            = db.Column(db.Text, nullable=False)
    code            = db.Column(db.String(20), unique=True, nullable=False)  # e.g. "KCT"
    email_domain    = db.Column(db.Text)                # e.g. "kct.ac.in"
    logo_url        = db.Column(db.Text)
    address         = db.Column(db.Text)
    contact_email   = db.Column(db.Text)
    plan            = db.Column(db.String(20), default='free')  # free | pro | enterprise
    is_active       = db.Column(db.Boolean, default=True)
    onboarded_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    users           = db.relationship('User', backref='institution', lazy='dynamic')
    subjects        = db.relationship('Subject', backref='institution', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'email_domain': self.email_domain,
            'logo_url': self.logo_url,
            'plan': self.plan,
            'is_active': self.is_active,
            'onboarded_at': self.onboarded_at.isoformat() if self.onboarded_at else None,
        }
