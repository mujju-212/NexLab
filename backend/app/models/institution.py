import uuid
from datetime import datetime
from app.extensions import db


class Institution(db.Model):
    __tablename__ = 'institutions'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name            = db.Column(db.Text, nullable=False)
    code            = db.Column(db.String(20), unique=True, nullable=False)  # e.g. "KCT"
    institution_type = db.Column(db.String(30))         # University | College | School | Coaching
    email_domain    = db.Column(db.Text)                # e.g. "kct.ac.in"
    logo_url        = db.Column(db.Text)
    address         = db.Column(db.Text)
    contact_email   = db.Column(db.Text)
    phone           = db.Column(db.String(20))          # includes country code, e.g. "+91XXXXXXXXXX"
    website         = db.Column(db.Text)                # must start with http:// or https://
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

    # ── Admin notification preferences ────────────────────────────────────
    # JSON blob; see NOTIFICATION_DEFAULTS for the accepted keys.
    notification_prefs      = db.Column(db.Text)

    NOTIFICATION_DEFAULTS = {
        'email_sessions':       True,   # session scheduled / started / ended
        'email_announcements':  True,   # copy announcements to the admin inbox
        'email_user_activity':  False,  # users created / deactivated / modified
        'email_weekly_digest':  True,   # Monday summary of institution activity
        'push_sessions':        True,   # real-time alert when a session goes live
        'push_announcements':   False,  # push when an announcement is sent
    }

    def notifications(self) -> dict:
        """Stored preferences merged over the defaults (defaults win on gaps)."""
        import json
        prefs = dict(self.NOTIFICATION_DEFAULTS)
        if self.notification_prefs:
            try:
                stored = json.loads(self.notification_prefs)
                if isinstance(stored, dict):
                    prefs.update({k: bool(v) for k, v in stored.items()
                                  if k in self.NOTIFICATION_DEFAULTS})
            except (ValueError, TypeError):
                pass
        return prefs

    # Relationships
    users           = db.relationship('User', backref='institution', lazy='dynamic')
    subjects        = db.relationship('Subject', backref='institution', lazy='dynamic')

    def to_dict(self):
        return {
            'id':                       self.id,
            'name':                     self.name,
            'code':                     self.code,
            'institution_type':         self.institution_type,
            'email_domain':             self.email_domain,
            'logo_url':                 self.logo_url,
            'address':                  self.address,
            'contact_email':            self.contact_email,
            'phone':                    self.phone,
            'website':                  self.website,
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
        'allow_self_registration':  'true',
        # Free-tier AI meter (platform-direct users, no institution):
        # daily AI calls per user, enforced by _check_quota in ai/routes.py.
        'free_user_daily_ai_calls': '10',
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

        # Ensure allow_self_registration is 'true' so individual users can register.
        # The initial migration seeded it as 'false'; correct it here if still at that value.
        row = cls.query.get('allow_self_registration')
        if row and row.value == 'false':
            row.value = 'true'

        db.session.commit()
