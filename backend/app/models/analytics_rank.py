import uuid
from datetime import datetime
from app.extensions import db


class RankSnapshot(db.Model):
    """
    Multi-Scope Rank Snapshot:
    Stores holistic student rankings across experiment, subject, section, year,
    department, institution, and platform scopes.
    """
    __tablename__ = 'rank_snapshots'

    id                 = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id     = db.Column(db.String(36), nullable=True, index=True)
    student_id         = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    scope_level        = db.Column(db.String(30), nullable=False, index=True)  # experiment|subject|section|year|department|institution|platform
    scope_id           = db.Column(db.String(36), nullable=True, index=True)
    period             = db.Column(db.String(20), nullable=False, default='live')  # live | YYYY-WW | term

    mastery_score      = db.Column(db.Float, default=0.0)
    engagement_score   = db.Column(db.Float, default=0.0)
    effort_score       = db.Column(db.Float, default=0.0)
    efficiency_score   = db.Column(db.Float, default=0.0)
    consistency_score  = db.Column(db.Float, default=0.0)

    rank_score         = db.Column(db.Float, nullable=False, default=0.0)
    rank_position      = db.Column(db.Integer, nullable=False)
    cohort_size        = db.Column(db.Integer, nullable=False)
    percentile         = db.Column(db.Float, nullable=False, default=0.0)
    computed_at        = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'scope_level', 'scope_id', 'period', name='uq_rank_snap_student_scope_period'),
        db.Index('ix_rank_snap_lookup', 'scope_level', 'scope_id', 'period', 'rank_position'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'scope_level': self.scope_level,
            'scope_id': self.scope_id,
            'period': self.period,
            'rank_score': round(self.rank_score, 1),
            'rank_position': self.rank_position,
            'cohort_size': self.cohort_size,
            'percentile': round(self.percentile, 1),
            'components': {
                'mastery': round(self.mastery_score or 0.0, 1),
                'engagement': round(self.engagement_score or 0.0, 1),
                'effort': round(self.effort_score or 0.0, 1),
                'efficiency': round(self.efficiency_score or 0.0, 1),
                'consistency': round(self.consistency_score or 0.0, 1),
            },
            'computed_at': self.computed_at.isoformat() if self.computed_at else None,
        }
