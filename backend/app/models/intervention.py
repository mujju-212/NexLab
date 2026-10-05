"""
Instructor management tools — Tier 1 features:

Intervention : closes the loop on at-risk flags. The attention panel says
               "this student is struggling"; the instructor records what they
               did about it and whether it worked.
Extension    : per-student deadline relief — extends the catch-up/gate window
               for one (student, experiment) pair and/or excuses a missed
               session so it drops out of attendance-sensitive rollups.
"""
import uuid
from datetime import datetime
from app.extensions import db


class Intervention(db.Model):
    __tablename__ = 'interventions'

    id            = db.Column(db.String(36), primary_key=True,
                              default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                               nullable=False, index=True)
    student_id    = db.Column(db.String(36), db.ForeignKey('users.id'),
                              nullable=False, index=True)
    created_by    = db.Column(db.String(36), db.ForeignKey('users.id'),
                              nullable=False)
    # talked_to_student | extended_deadline | re_graded | contacted_guardian
    # tutoring | resources_shared | other
    action_type   = db.Column(db.String(30), nullable=False)
    note          = db.Column(db.Text)
    follow_up_at  = db.Column(db.DateTime)     # optional reminder date
    # open | improved | no_change | worsened   (instructor-set outcome)
    outcome       = db.Column(db.String(20), default='open')
    outcome_note  = db.Column(db.Text)
    risk_score_before = db.Column(db.Float, nullable=True)
    risk_score_after  = db.Column(db.Float, nullable=True)
    resolved_at   = db.Column(db.DateTime)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    student_rel = db.relationship('User', foreign_keys=[student_id])
    creator_rel = db.relationship('User', foreign_keys=[created_by])

    __table_args__ = (
        db.Index('ix_intervention_student_status', 'student_id', 'outcome'),
        db.Index('ix_intervention_followup', 'follow_up_at'),
    )

    def to_dict(self):
        return {
            'id':             self.id,
            'institution_id': self.institution_id,
            'student_id':     self.student_id,
            'student_name':   self.student_rel.full_name if self.student_rel else None,
            'roll_number':    self.student_rel.roll_number if self.student_rel else None,
            'created_by':     self.created_by,
            'action_type':    self.action_type,
            'note':           self.note,
            'follow_up_at':   self.follow_up_at.isoformat() + 'Z' if self.follow_up_at else None,
            'outcome':        self.outcome,
            'outcome_note':   self.outcome_note,
            'risk_score_before': round(self.risk_score_before, 1) if self.risk_score_before is not None else None,
            'risk_score_after':  round(self.risk_score_after, 1) if self.risk_score_after is not None else None,
            'resolved_at':    self.resolved_at.isoformat() + 'Z' if self.resolved_at else None,
            'created_at':     self.created_at.isoformat() + 'Z' if self.created_at else None,
        }


class Extension(db.Model):
    __tablename__ = 'extensions'

    id            = db.Column(db.String(36), primary_key=True,
                              default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                               nullable=False, index=True)
    student_id    = db.Column(db.String(36), db.ForeignKey('users.id'),
                              nullable=False)
    experiment_id = db.Column(db.String(36), db.ForeignKey('experiments.id'),
                              nullable=False)
    granted_by    = db.Column(db.String(36), db.ForeignKey('users.id'),
                              nullable=False)
    reason        = db.Column(db.Text)
    # New catch-up/gate deadline for this student (overrides session window)
    extension_until = db.Column(db.DateTime, nullable=False)
    # Excuse a missed session: excluded from attendance-sensitive rollups
    excused       = db.Column(db.Boolean, default=False)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    student_rel = db.relationship('User', foreign_keys=[student_id])
    experiment_rel = db.relationship('Experiment')

    __table_args__ = (
        db.Index('ix_extension_student_exp', 'student_id', 'experiment_id'),
    )

    def to_dict(self):
        return {
            'id':              self.id,
            'institution_id':  self.institution_id,
            'student_id':      self.student_id,
            'student_name':    self.student_rel.full_name if self.student_rel else None,
            'experiment_id':   self.experiment_id,
            'experiment_title': self.experiment_rel.title if self.experiment_rel else None,
            'granted_by':      self.granted_by,
            'reason':          self.reason,
            'extension_until': self.extension_until.isoformat() + 'Z' if self.extension_until else None,
            'excused':         self.excused,
            'created_at':      self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
