import uuid
from datetime import datetime
from app.extensions import db


class User(db.Model):
    __tablename__ = 'users'

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
    profile_pic_url = db.Column(db.Text)
    is_active       = db.Column(db.Boolean, default=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    last_login      = db.Column(db.DateTime)
    force_logout_at = db.Column(db.DateTime)   # set by admin — invalidates all older tokens
    must_change_password = db.Column(db.Boolean, default=False)   # set on temp credentials

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
            'profile_pic_url': self.profile_pic_url,
            'is_active': self.is_active,
            'must_change_password': bool(self.must_change_password),
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
        return data
