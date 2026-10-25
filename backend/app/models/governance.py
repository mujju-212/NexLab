"""Governance models — impersonation sessions and data-export jobs (Phase 4)."""
import uuid
from datetime import datetime

from app.extensions import db


class ImpersonationSession(db.Model):
    """One admin 'view as user' session. Fully audited; the minted JWT carries
    an `imp` claim so every request can be gated read-only."""
    __tablename__ = 'impersonation_sessions'

    id         = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id   = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    target_id  = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    reason     = db.Column(db.Text, nullable=False)
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at   = db.Column(db.DateTime)
    revoked    = db.Column(db.Boolean, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'admin_id': self.admin_id,
            'target_id': self.target_id,
            'reason': self.reason,
            'started_at': self.started_at.isoformat() + 'Z' if self.started_at else None,
            'ended_at': self.ended_at.isoformat() + 'Z' if self.ended_at else None,
            'revoked': bool(self.revoked),
            'active': self.ended_at is None and not self.revoked,
        }


class DataExportJob(db.Model):
    """GDPR / portability export bundle. File expires after 7 days."""
    __tablename__ = 'data_export_jobs'

    id           = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    requested_by = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    kind         = db.Column(db.String(20), nullable=False)      # gdpr
    status       = db.Column(db.String(16), default='pending')   # pending|ready|failed|expired
    file_path    = db.Column(db.Text)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at   = db.Column(db.DateTime, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'requested_by': self.requested_by,
            'kind': self.kind,
            'status': self.status,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'expires_at': self.expires_at.isoformat() + 'Z' if self.expires_at else None,
        }
