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
    plan            = db.Column(db.String(20), default='free')   # free | pro | enterprise
    is_active       = db.Column(db.Boolean, default=True)
    onboarded_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # ── Billing ──────────────────────────────────────────────────────────
    plan_updated_at     = db.Column(db.DateTime)
    groq_limit_override = db.Column(db.Integer)         # NULL -> use global default
    billing_notes       = db.Column(db.Text)            # free-form admin notes
    billing_email       = db.Column(db.Text)            # separate billing contact

    # ── Onboarding workflow ───────────────────────────────────────────────
    # status: pending | active | suspended
    onboarding_status       = db.Column(db.String(20), default='active')
    onboarding_completed_at = db.Column(db.DateTime)
    # checklist flags (set true as each step is done)
    has_users               = db.Column(db.Boolean, default=False)
    has_experiments         = db.Column(db.Boolean, default=False)
    has_environment         = db.Column(db.Boolean, default=False)

    # Relationships
    users           = db.relationship('User', backref='institution', lazy='dynamic')
    subjects        = db.relationship('Subject', backref='institution', lazy='dynamic')

    def to_dict(self):
        return {
            'id':                       self.id,
            'name':                     self.name,
            'code':                     self.code,
            'email_domain':             self.email_domain,
            'logo_url':                 self.logo_url,
            'plan':                     self.plan,
            'is_active':                self.is_active,
            'onboarded_at':             self.onboarded_at.isoformat() if self.onboarded_at else None,
            'plan_updated_at':          self.plan_updated_at.isoformat() if self.plan_updated_at else None,
            'groq_limit_override':      self.groq_limit_override,
            'billing_notes':            self.billing_notes,
            'billing_email':            self.billing_email,
            'onboarding_status':        self.onboarding_status,
            'onboarding_completed_at':  self.onboarding_completed_at.isoformat() if self.onboarding_completed_at else None,
            'checklist': {
                'has_users':        self.has_users,
                'has_experiments':  self.has_experiments,
                'has_environment':  self.has_environment,
            },
        }


class PlatformConfig(db.Model):
    """Key-value store for platform-wide configuration and feature flags."""
    __tablename__ = 'platform_config'

    key         = db.Column(db.String(100), primary_key=True)
    value       = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by  = db.Column(db.String(36), db.ForeignKey('users.id'))

    # Defaults seeded on first run
    DEFAULTS = {
        'groq_daily_limit':         '200',
        'maintenance_mode':         'false',
        'maintenance_message':      'NexLab is under scheduled maintenance. Back soon.',
        'ai_hints_enabled':         'true',
        'code_execution_enabled':   'true',
        'max_students_free':        '100',
        'max_students_pro':         '500',
        'max_students_enterprise':  '99999',
        'allow_self_registration':  'false',
    }

    def to_dict(self):
        return {
            'key':         self.key,
            'value':       self.value,
            'description': self.description,
            'updated_at':  self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def get(cls, key, default=None):
        row = cls.query.get(key)
        return row.value if row else cls.DEFAULTS.get(key, default)

    @classmethod
    def set(cls, key, value, updated_by=None):
        row = cls.query.get(key)
        if row:
            row.value = str(value)
            row.updated_at = datetime.utcnow()
            row.updated_by = updated_by
        else:
            row = cls(key=key, value=str(value), updated_by=updated_by)
            db.session.add(row)
        return row

    @classmethod
    def seed_defaults(cls):
        """Call once on app startup to ensure all defaults exist."""
        for k, v in cls.DEFAULTS.items():
            if not cls.query.get(k):
                db.session.add(cls(key=k, value=v))
        db.session.commit()
