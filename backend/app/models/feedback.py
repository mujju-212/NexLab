import uuid
from datetime import datetime
from app.extensions import db


class SessionFeedback(db.Model):
    """Anonymous session feedback — no student_id stored"""
    __tablename__ = 'session_feedback'
    id                      = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id              = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=False)
    institution_id          = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    # Intentionally NO student_id — truly anonymous

    experiment_clarity      = db.Column(db.Integer)   # 1–5
    session_pacing          = db.Column(db.Integer)   # 1–5
    ai_hint_helpfulness     = db.Column(db.Integer)   # 1–5
    overall_rating          = db.Column(db.Integer)   # 1–5
    comment                 = db.Column(db.Text)      # optional free text
    submitted_at            = db.Column(db.DateTime, default=datetime.utcnow)


class PlagiarismFlag(db.Model):
    """Similarity flags raised after session — instructor reviews"""
    __tablename__ = 'plagiarism_flags'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    session_id      = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'))

    student_a_id    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    student_b_id    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    similarity_pct  = db.Column(db.Float, nullable=False)   # 0–100

    detected_at     = db.Column(db.DateTime, default=datetime.utcnow)
    reviewed_by     = db.Column(db.String(36), db.ForeignKey('users.id'))
    reviewed_at     = db.Column(db.DateTime)
    status          = db.Column(db.String(20), default='pending')  # pending | cleared | actioned
    review_notes    = db.Column(db.Text)

    def to_dict(self):
        return {
            'id': self.id,
            'student_a_id': self.student_a_id,
            'student_b_id': self.student_b_id,
            'similarity_pct': self.similarity_pct,
            'status': self.status,
            'detected_at': self.detected_at.isoformat() if self.detected_at else None,
        }


class Notification(db.Model):
    __tablename__ = 'notifications'
    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    type        = db.Column(db.String(30))
    # session_reminder | grade_published | alert | announcement | catchup_available
    title       = db.Column(db.Text)
    message     = db.Column(db.Text)
    is_read     = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'type': self.type,
            'title': self.title,
            'message': self.message,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
