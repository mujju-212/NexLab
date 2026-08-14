import uuid
import bcrypt
from datetime import datetime, timedelta
from app.extensions import db

OTP_EXPIRY_MINUTES = 10
OTP_MAX_ATTEMPTS = 5
# How long a verified OTP stays usable to complete the actual registration call
OTP_VERIFIED_GRACE_MINUTES = 20


class EmailOTP(db.Model):
    """
    One-time email verification codes.

    Used ONLY for self-service account creation:
      - purpose='individual_register'  -> POST /auth/register (free_user)
      - purpose='institution_register' -> POST /auth/register (institution_admin + new Institution)

    NOT used for accounts created by an institution/platform admin
    (POST /institution/users, bulk upload, POST /admin/institutions) —
    those are trusted, admin-initiated creations and skip OTP entirely.
    """
    __tablename__ = 'email_otps'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email          = db.Column(db.Text, nullable=False, index=True)
    purpose        = db.Column(db.String(30), nullable=False)
    code_hash      = db.Column(db.Text, nullable=False)

    attempts       = db.Column(db.Integer, default=0)
    verified       = db.Column(db.Boolean, default=False)
    verified_at    = db.Column(db.DateTime)

    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at     = db.Column(db.DateTime, nullable=False)

    @staticmethod
    def hash_code(code: str) -> str:
        return bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()

    def check_code(self, code: str) -> bool:
        return bcrypt.checkpw(code.encode(), self.code_hash.encode())

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() > self.expires_at

    @property
    def is_verification_still_fresh(self) -> bool:
        """True if this record was verified recently enough to trust during registration."""
        if not self.verified or not self.verified_at:
            return False
        return datetime.utcnow() <= self.verified_at + timedelta(minutes=OTP_VERIFIED_GRACE_MINUTES)
