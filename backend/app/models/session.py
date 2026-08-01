import uuid
from datetime import datetime
from app.extensions import db


class LabSession(db.Model):
    __tablename__ = 'lab_sessions'
    id                      = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id          = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    section_subject_id      = db.Column(db.String(36), db.ForeignKey('section_subjects.id'), nullable=False)
    experiment_id           = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)

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

    jitsi_room_name         = db.Column(db.Text)
    started_at              = db.Column(db.DateTime)
    ended_at                = db.Column(db.DateTime)
    created_at              = db.Column(db.DateTime, default=datetime.utcnow)

    attendances             = db.relationship('SessionAttendance', backref='session', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'experiment_id': self.experiment_id,
            'scheduled_at': self.scheduled_at.isoformat() if self.scheduled_at else None,
            'duration_minutes': self.duration_minutes,
            'gate_score_threshold': self.gate_score_threshold,
            'focus_ml_enabled': self.focus_ml_enabled,
            'lockdown_enabled': self.lockdown_enabled,
            'catchup_enabled': self.catchup_enabled,
            'catchup_deadline': self.catchup_deadline.isoformat() if self.catchup_deadline else None,
            'status': self.status,
            'jitsi_room_name': self.jitsi_room_name,
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
