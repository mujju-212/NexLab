import uuid
from datetime import datetime
from app.extensions import db


class ConceptMastery(db.Model):
    """Per-student, per-concept knowledge mastery (0–100)"""
    __tablename__ = 'concept_mastery'
    __table_args__ = (
        db.Index('ix_concept_mastery_inst_student', 'institution_id', 'student_id'),
        db.Index('ix_concept_mastery_inst_concept', 'institution_id', 'concept'),
    )
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
        # trajectory + dashboard IN-list
        db.Index('ix_student_rankings_student_id', 'student_id'),
    )

    def to_dict(self):
        # Components are nullable: a student with no measurable factor keeps
        # NULLs so the UI can print an em dash instead of a fake 0.0.
        def _r(v):
            return None if v is None else round(v, 1)

        return {
            'section_subject_id': self.section_subject_id,
            'rank_score': _r(self.rank_score),
            'rank_position': self.rank_position,
            'components': {
                'mastery': _r(self.mastery_score),
                'engagement': _r(self.engagement_score),
                'effort': _r(self.effort_score),
                'efficiency': _r(self.efficiency_score),
                'consistency': _r(self.consistency_score),
            },
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class FocusScore(db.Model):
    """Focus score records per student per 30-second interval"""
    __tablename__ = 'focus_scores'
    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id  = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    session_id  = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=False, index=True)

    # All 6 behavioral signals stored as JSON
    # {tab_switches_per_min, idle_seconds, typing_speed_wpm,
    #  backspace_ratio, copy_paste_count, window_focus_ratio}
    signals     = db.Column(db.JSON, default=dict)

    focus_score = db.Column(db.Float)     # 0-100 from RF model
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        db.Index('ix_focus_session_recorded', 'session_id', 'recorded_at'),
        db.Index('ix_focus_student_session', 'student_id', 'session_id'),
    )

    def to_dict(self):
        return {
            'student_id':  self.student_id,
            'focus_score': self.focus_score,
            'signals':     self.signals or {},
            'recorded_at': self.recorded_at.isoformat() if self.recorded_at else None,
        }


class ExperimentConcept(db.Model):
    """Explicit mapping between experiments and curriculum knowledge concepts"""
    __tablename__ = 'experiment_concepts'
    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id  = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False, index=True)
    concept        = db.Column(db.String(100), nullable=False, index=True)
    weight         = db.Column(db.Float, default=1.0)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('experiment_id', 'concept', name='uq_exp_concept'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'experiment_id': self.experiment_id,
            'concept': self.concept,
            'weight': self.weight,
        }


class ConceptPrereq(db.Model):
    """Concept dependency graph: concept requires requires_concept"""
    __tablename__ = 'concept_prereqs'
    id               = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    concept          = db.Column(db.String(100), nullable=False, index=True)
    requires_concept = db.Column(db.String(100), nullable=False, index=True)
    subject_id       = db.Column(db.String(36), db.ForeignKey('subjects.id'), nullable=True, index=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('concept', 'requires_concept', 'subject_id', name='uq_concept_prereq_sub'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'concept': self.concept,
            'requires_concept': self.requires_concept,
            'subject_id': self.subject_id,
        }

