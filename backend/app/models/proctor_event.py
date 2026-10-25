"""
ProctorEvent — persistent record of every proctoring event emitted during a live session.

Events written here are emitted by the student's browser via Socket.io and persisted
by the server-side handler in sockets/events.py.  The analytics/proctoring endpoint
can then query discrete event counts (per-student, per-session) instead of relying
solely on aggregated FocusScore signals.

Event types:
  'tab_switch'         — Page Visibility API detected hidden tab
  'fullscreen_exit'    — Student exited fullscreen while lockdown_enabled
  'lockdown_violation' — Blocked action attempted (copy/paste/right-click/devtools)
  'screen_share_stop'  — Student stopped screen share
"""
import uuid
from datetime import datetime
from app.extensions import db


class ProctorEvent(db.Model):
    """One row per proctoring event observed during a live session."""
    __tablename__ = 'proctor_events'

    id             = db.Column(db.String(36), primary_key=True,
                               default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), nullable=False, index=True)
    # An event belongs to EITHER a live session OR a timed exam attempt.
    session_id     = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'),
                               nullable=True, index=True)
    exam_id        = db.Column(db.String(36), db.ForeignKey('exams.id'),
                               nullable=True)
    attempt_id     = db.Column(db.String(36), nullable=True)
    student_id     = db.Column(db.String(36), db.ForeignKey('users.id'),
                               nullable=False, index=True)
    event_type     = db.Column(db.String(40), nullable=False)  # tab_switch / fullscreen_exit / …
    payload        = db.Column(db.JSON, nullable=True)         # extra context (count, action, …)
    severity       = db.Column(db.String(10), nullable=True)   # 'high' | 'medium' | 'low'
    recorded_at    = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_proctor_events_inst_session',   'institution_id', 'session_id'),
        db.Index('ix_proctor_events_inst_student',   'institution_id', 'student_id'),
        db.Index('ix_proctor_events_inst_date',      'institution_id', 'recorded_at'),
        db.Index('ix_proctor_events_exam_attempt',   'exam_id', 'attempt_id'),
        db.Index('ix_proctor_events_exam_student',   'exam_id', 'student_id'),
    )

    def to_dict(self):
        return {
            'id':             self.id,
            'session_id':     self.session_id,
            'exam_id':        self.exam_id,
            'attempt_id':     self.attempt_id,
            'student_id':     self.student_id,
            'event_type':     self.event_type,
            'payload':        self.payload or {},
            'severity':       self.severity,
            'recorded_at':    self.recorded_at.isoformat() if self.recorded_at else None,
        }
