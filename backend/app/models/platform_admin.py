import uuid
from datetime import datetime
from app.extensions import db


class PlatformUserChangeRequest(db.Model):
    """Two-person approval record for platform-admin role/institution moves."""
    __tablename__ = 'platform_user_change_requests'
    __table_args__ = (
        db.Index('ix_platform_user_change_requests_status_created', 'status', 'created_at'),
        db.Index('ix_platform_user_change_requests_target_status', 'user_id', 'status'),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    requested_by = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    approved_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    from_role = db.Column(db.String(30), nullable=False)
    from_institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'))
    to_role = db.Column(db.String(30), nullable=False)
    to_institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'))
    reason = db.Column(db.Text, nullable=False)
    review_note = db.Column(db.Text)
    status = db.Column(db.String(16), nullable=False, default='pending')
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    decided_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'requested_by': self.requested_by,
            'approved_by': self.approved_by,
            'from_role': self.from_role,
            'from_institution_id': self.from_institution_id,
            'to_role': self.to_role,
            'to_institution_id': self.to_institution_id,
            'reason': self.reason,
            'review_note': self.review_note,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'decided_at': self.decided_at.isoformat() if self.decided_at else None,
        }
