import uuid
from datetime import datetime, timezone
from app.extensions import db


def _iso_z(dt):
    """
    Serialize a naive-UTC datetime with an explicit 'Z' suffix.

    Without the suffix, JS `new Date('2026-09-01T05:30:00')` parses the value
    as *local* time — a UTC 05:30 (11:00 IST) renders as 05:30 on campus
    screens. With 'Z', every client converts to its own local time correctly.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + 'Z'
    return dt.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')


class LabSession(db.Model):
    __tablename__ = 'lab_sessions'
    id                      = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id          = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    section_subject_id      = db.Column(db.String(36), db.ForeignKey('section_subjects.id'), nullable=False)
    # NULL when an institution admin books the slot first and the instructor
    # attaches the experiment later.
    experiment_id           = db.Column(db.String(36), db.ForeignKey('experiments.id'))

    title                   = db.Column(db.Text)        # admin-facing label, e.g. "DS Lab 5"
    scheduled_at            = db.Column(db.DateTime, nullable=False)
    duration_minutes        = db.Column(db.Integer, nullable=False)
    gate_score_threshold    = db.Column(db.Integer, default=70)     # % to pass pre-lab quiz
    late_join_window_min    = db.Column(db.Integer, default=10)     # minutes after start allowed

    # Catch-up config
    catchup_enabled         = db.Column(db.Boolean, default=False)
    catchup_deadline        = db.Column(db.DateTime)

    # Features
    focus_ml_enabled        = db.Column(db.Boolean, default=False)
    lockdown_enabled        = db.Column(db.Boolean, default=False)

    status                  = db.Column(db.String(20), default='scheduled')
    # status: scheduled | active | ended | cancelled

    # ── Session mode machine (D1) ──────────────────────────────────────────────
    # briefing | working | quiz_active | paused | debrief | ended
    current_mode            = db.Column(db.String(20), default='briefing')
    live_page_state_id      = db.Column(db.String(36), nullable=True)  # FK set after LivePageState created

    jitsi_room_name         = db.Column(db.Text)
    started_at              = db.Column(db.DateTime)
    ended_at                = db.Column(db.DateTime)
    created_at              = db.Column(db.DateTime, default=datetime.utcnow)

    attendances             = db.relationship('SessionAttendance', backref='session', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'section_subject_id': self.section_subject_id,
            'experiment_id': self.experiment_id,
            'scheduled_at': _iso_z(self.scheduled_at),
            'duration_minutes': self.duration_minutes,
            'gate_score_threshold': self.gate_score_threshold,
            'focus_ml_enabled': self.focus_ml_enabled,
            'lockdown_enabled': self.lockdown_enabled,
            'catchup_enabled': self.catchup_enabled,
            'catchup_deadline': _iso_z(self.catchup_deadline),
            'status': self.status,
            'current_mode': self.current_mode or 'briefing',
            'jitsi_room_name': self.jitsi_room_name,
            'started_at': _iso_z(self.started_at),
            'ended_at': _iso_z(self.ended_at),
        }


class SessionAttendance(db.Model):
    __tablename__ = 'session_attendance'
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), primary_key=True)
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    joined_at           = db.Column(db.DateTime)
    left_at             = db.Column(db.DateTime)
    reconnect_count     = db.Column(db.Integer, default=0)
    total_time_seconds  = db.Column(db.Integer, default=0)
    is_catchup          = db.Column(db.Boolean, default=False)

    status              = db.Column(db.String(25), default='absent')
    # present | late | partial | absent | inactive_present

    is_active_participant = db.Column(db.Boolean, default=False)  # ran at least 1 line of code
    override_reason     = db.Column(db.Text)
    override_by         = db.Column(db.String(36), db.ForeignKey('users.id'))

    def to_dict(self):
        return {
            'student_id': self.student_id,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'total_time_seconds': self.total_time_seconds,
            'status': self.status,
            'is_active_participant': self.is_active_participant,
        }
