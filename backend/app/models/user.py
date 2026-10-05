import uuid
from datetime import datetime
from app.extensions import db


class User(db.Model):
    __tablename__ = 'users'

    # Indexes are declared here as well as in migrations so `alembic
    # revision --autogenerate` doesn't propose dropping them, and so a fresh
    # `db.create_all()` gets the same shape as the migrated database.
    # Index names match the existing performance-indexes migration where they
    # overlap; the rest cover admin-side filters that were still seq-scanning.
    __table_args__ = (
        db.Index('ix_users_institution_id', 'institution_id'),
        # Every hot admin query filters institution_id + role (+ is_active for
        # the dashboard counts); this 3-col index replaces the old
        # (institution_id, role) one — role-only filters use its prefix.
        db.Index('ix_users_institution_id_role_is_active',
                 'institution_id', 'role', 'is_active'),
        # users page ?department_id= (plain FK — never indexed by any migration)
        db.Index('ix_users_department_id', 'department_id'),
        # both of these order_by(full_name) after filtering
        db.Index('ix_users_institution_id_full_name', 'institution_id', 'full_name'),
    )

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=True)
    # platform_admin has no institution_id (NULL)

    email           = db.Column(db.Text, unique=True, nullable=False)
    password_hash   = db.Column(db.Text, nullable=False)
    full_name       = db.Column(db.Text, nullable=False)
    first_name      = db.Column(db.Text)           # optional split name (full_name stays authoritative for display)
    last_name       = db.Column(db.Text)
    role            = db.Column(db.String(30), nullable=False)
    # roles: platform_admin | institution_admin | instructor | student

    roll_number     = db.Column(db.String(30))    # students: USN / roll number
    staff_id        = db.Column(db.String(30))    # instructors / institution_admin: employee/staff ID
    department_id   = db.Column(db.String(36), db.ForeignKey('departments.id'))
    year_of_study   = db.Column(db.Integer)        # students only, e.g. 1-6
    semester        = db.Column(db.Integer)        # students only, e.g. 1-12

    phone           = db.Column(db.String(15))
    location        = db.Column(db.String(100), default='Bengaluru, Karnataka')
    profile_pic_url = db.Column(db.Text)
    bio             = db.Column(db.Text, default='Empowering education through technology.')
    timezone        = db.Column(db.String(50), default='(GMT+05:30) Asia/Kolkata')
    language        = db.Column(db.String(50), default='English (India)')
    two_factor_enabled = db.Column(db.Boolean, default=False)
    is_active       = db.Column(db.Boolean, default=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    last_login      = db.Column(db.DateTime)
    force_logout_at = db.Column(db.DateTime)   # set by admin — invalidates all older tokens
    must_change_password = db.Column(db.Boolean, default=False)   # set on temp credentials

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    @property
    def name(self):
        return self.full_name

    def to_dict(self, include_sensitive=False):
        data = {
            'id': self.id,
            'institution_id': self.institution_id,
            'email': self.email,
            'full_name': self.full_name,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'role': self.role,
            'roll_number': self.roll_number,
            'staff_id': self.staff_id,
            'department_id': self.department_id,
            'year_of_study': self.year_of_study,
            'semester': self.semester,
            'phone': self.phone,
            'location': self.location or 'Bengaluru, Karnataka',
            'profile_pic_url': self.profile_pic_url,
            'bio': self.bio or 'Empowering education through technology.',
            'timezone': self.timezone or '(GMT+05:30) Asia/Kolkata',
            'language': self.language or 'English (India)',
            'two_factor_enabled': bool(self.two_factor_enabled),
            'is_active': self.is_active,
            'must_change_password': bool(self.must_change_password),
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'last_login': self.last_login.isoformat() + 'Z' if self.last_login else None,
        }
        return data
