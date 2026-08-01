import uuid
from datetime import datetime
from app.extensions import db


class ConceptMastery(db.Model):
    """Per-student, per-concept knowledge mastery (0–100)"""
    __tablename__ = 'concept_mastery'
    student_id      = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    concept         = db.Column(db.Text, primary_key=True)   # e.g. 'recursion'
    mastery_score   = db.Column(db.Float, default=0.0)       # 0–100
    experiment_count = db.Column(db.Integer, default=0)      # how many experiments tested this
    last_updated    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'concept': self.concept,
            'mastery_score': round(self.mastery_score, 1),
            'experiment_count': self.experiment_count,
            'last_updated': self.last_updated.isoformat() if self.last_updated else None,
        }


class StudentRanking(db.Model):
    """Holistic rank per student per section-subject"""
    __tablename__ = 'student_rankings'
    id                      = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id              = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    section_subject_id      = db.Column(db.String(36), db.ForeignKey('section_subjects.id'), nullable=False)
    institution_id          = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)

    # Component scores (0–100 each)
    mastery_score       = db.Column(db.Float, default=0.0)    # 30% weight
    engagement_score    = db.Column(db.Float, default=0.0)    # 20% weight
    effort_score        = db.Column(db.Float, default=0.0)    # 20% weight
    efficiency_score    = db.Column(db.Float, default=0.0)    # 15% weight
    consistency_score   = db.Column(db.Float, default=0.0)    # 15% weight

    rank_score          = db.Column(db.Float, default=0.0)    # weighted final
    rank_position       = db.Column(db.Integer)               # 1st, 2nd... (computed post-update)
    updated_at          = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'section_subject_id', name='uq_student_section_subject'),
    )

    def to_dict(self):
        return {
            'rank_score': round(self.rank_score, 1),
            'rank_position': self.rank_position,
            'components': {
                'mastery': round(self.mastery_score, 1),
                'engagement': round(self.engagement_score, 1),
                'effort': round(self.effort_score, 1),
                'efficiency': round(self.efficiency_score, 1),
                'consistency': round(self.consistency_score, 1),
            },
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class FocusScore(db.Model):
    """Focus score records per student per 30-second interval"""
    __tablename__ = 'focus_scores'
    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=False)

    # Raw signals from client
    tab_switches        = db.Column(db.Integer, default=0)
    window_blurs        = db.Column(db.Integer, default=0)
    idle_seconds        = db.Column(db.Integer, default=0)
    copy_paste_count    = db.Column(db.Integer, default=0)
    face_present_pct    = db.Column(db.Float, default=1.0)
    gaze_score          = db.Column(db.Float, default=1.0)
    large_paste_detected = db.Column(db.Boolean, default=False)
    typing_speed_avg    = db.Column(db.Float, default=0.0)

    focus_score         = db.Column(db.Float)       # 0–100 from RF model
    recorded_at         = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'focus_score': self.focus_score,
            'recorded_at': self.recorded_at.isoformat() if self.recorded_at else None,
            'signals': {
                'tab_switches': self.tab_switches,
                'face_present_pct': self.face_present_pct,
                'large_paste_detected': self.large_paste_detected,
            }
        }
