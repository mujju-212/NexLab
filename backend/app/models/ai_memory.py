"""AI learner memory — the durable half of the personalized tutor (P-AI).

`snapshot`/`snapshot_at` cache the live learning profile (refreshed by the
context engine, 10-minute TTL) so every tutor turn starts informed without
recomputing analytics. `goal`, `preferred_language` and `tutor_notes` are the
USER-owned durable memory the tutor reads and (via the save_learning_goal
tool) updates across sessions.
"""
import uuid
from datetime import datetime

from app.extensions import db


class AILearnerMemory(db.Model):
    __tablename__ = 'ai_learner_memory'

    id                = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id           = db.Column(db.String(36), db.ForeignKey('users.id'), unique=True, nullable=False, index=True)
    goal              = db.Column(db.Text)                       # e.g. "master DP for interviews"
    preferred_language = db.Column(db.String(30))                # python | cpp | ...
    tutor_notes       = db.Column(db.Text)                       # durable tutor observations
    snapshot          = db.Column(db.Text)                       # cached live profile (markdown)
    snapshot_at       = db.Column(db.DateTime)
    updated_at        = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'user_id': self.user_id,
            'goal': self.goal,
            'preferred_language': self.preferred_language,
            'tutor_notes': self.tutor_notes,
            'snapshot_at': self.snapshot_at.isoformat() + 'Z' if self.snapshot_at else None,
        }
