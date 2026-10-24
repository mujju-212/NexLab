"""
Conductor models — all new tables for the Live Lab Conductor, SPARK, and grading system.
Added in the instructor-experience implementation (P0 migration).

Tables:
  checkpoint            — instructor-defined milestones per experiment
  checkpoint_progress   — durable per-student checkpoint state (SPARK grid)
  live_page_states      — in-session pacing / page launch control
  proctor_policies      — granular, per-page, live-overrideable proctoring config
  session_mode_transitions  — audit log of mode changes
  chat_messages         — live session chat (instructor <-> student, 1:1 or broadcast)
  test_case_results     — per-test-case pass/fail per code attempt (for heatmap)
  reports               — async report generation job tracking
  instructor_settings   — per-instructor defaults (proctoring, rubric, etc.)

Also: adds columns to Experiment, Grade, LabSession via migration (see conductor_migration.py)
"""
import uuid
from datetime import datetime
from app.extensions import db


# ══════════════════════════════════════════════════════════════════════════════
# SPARK — Checkpoint system
# ══════════════════════════════════════════════════════════════════════════════

class Checkpoint(db.Model):
    """Instructor-defined milestones within an experiment."""
    __tablename__ = 'checkpoints'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    order           = db.Column(db.Integer, nullable=False, default=0)
    title           = db.Column(db.Text, nullable=False)
    description     = db.Column(db.Text)
    # JSON list of TestCase IDs that auto-verify this checkpoint
    test_case_ids   = db.Column(db.JSON, default=list)
    # Contribution weight to the experiment's code component (1-100)
    weight          = db.Column(db.Integer, default=10)
    # When True: student cannot proceed to next page/problem until this is verified
    is_gated        = db.Column(db.Boolean, default=False)
    # Optional FK to ContentPage for auto-pacing (D8)
    page_id         = db.Column(db.String(36), db.ForeignKey('content_pages.id'), nullable=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_checkpoints_experiment', 'experiment_id'),
    )

    progress = db.relationship('CheckpointProgress', backref='checkpoint', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id,
            'experiment_id': self.experiment_id,
            'order': self.order,
            'title': self.title,
            'description': self.description,
            'test_case_ids': self.test_case_ids or [],
            'weight': self.weight,
            'is_gated': self.is_gated,
            'page_id': self.page_id,
        }


class CheckpointProgress(db.Model):
    """Durable per-student checkpoint state. Powers the SPARK heat-map grid."""
    __tablename__ = 'checkpoint_progress'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id      = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=False)
    student_id      = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    checkpoint_id   = db.Column(db.String(36), db.ForeignKey('checkpoints.id'), nullable=False)

    # Status vocab (D-S1 Hybrid model):
    #   pending     — not started
    #   claimed     — student self-report via checkpoint_passed socket
    #   verified    — code execution confirms ALL test_case_ids passed
    #   failed      — execution shows required test case(s) failing
    #   manual_pass — instructor override (authoritative)
    #   manual_fail — instructor override (authoritative)
    status          = db.Column(db.String(20), default='pending')

    passed_at       = db.Column(db.DateTime)
    attempts        = db.Column(db.Integer, default=0)
    last_signal_at  = db.Column(db.DateTime)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_cp_session_student', 'session_id', 'student_id'),
        db.Index('ix_cp_session_checkpoint', 'session_id', 'checkpoint_id'),
        db.UniqueConstraint('session_id', 'student_id', 'checkpoint_id', name='uq_cp_sscp'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'student_id': self.student_id,
            'checkpoint_id': self.checkpoint_id,
            'status': self.status,
            'passed_at': self.passed_at.isoformat() if self.passed_at else None,
            'attempts': self.attempts,
            'last_signal_at': self.last_signal_at.isoformat() if self.last_signal_at else None,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Live Session Conductor
# ══════════════════════════════════════════════════════════════════════════════

class LivePageState(db.Model):
    """In-session pacing / page launch control.

    current_page_id   — the page the instructor has launched for all students
    launched_quiz_module_id — if set, this quiz module is accessible even if unpublished
      (session whitelist pattern, D-QuizFetch)
    page_timer_ends_at — when set, a countdown is active and an event fires on expiry
    """
    __tablename__ = 'live_page_states'

    id                      = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id              = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'),
                                        nullable=False, unique=True)
    current_page_id         = db.Column(db.String(36), db.ForeignKey('content_pages.id'), nullable=True)
    launched_page_ids       = db.Column(db.JSON, default=list)   # history of launched page ids
    page_timer_ends_at      = db.Column(db.DateTime, nullable=True)
    launched_quiz_module_id = db.Column(db.String(36), db.ForeignKey('content_modules.id'), nullable=True)
    updated_by              = db.Column(db.String(36), db.ForeignKey('users.id'))
    updated_at              = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'current_page_id': self.current_page_id,
            'launched_page_ids': self.launched_page_ids or [],
            'page_timer_ends_at': self.page_timer_ends_at.isoformat() if self.page_timer_ends_at else None,
            'launched_quiz_module_id': self.launched_quiz_module_id,
        }


class ProctorPolicy(db.Model):
    """Granular proctoring config, per-page, overrideable live.

    Can be attached to an experiment (defaults) or to a live_page_state row
    (live override for a specific session/page). Instructor can flip any single
    control for a specific page, mid-session (D-Proctor).
    """
    __tablename__ = 'proctor_policies'

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # One of these will be set; both nullable to allow experiment-level or session-level rows
    experiment_id       = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=True)
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=True)
    page_id             = db.Column(db.String(36), db.ForeignKey('content_pages.id'), nullable=True)

    lockdown_fullscreen = db.Column(db.Boolean, default=True)
    block_copy_paste    = db.Column(db.Boolean, default=True)
    block_tab_switch    = db.Column(db.Boolean, default=True)
    plagiarism_scan     = db.Column(db.Boolean, default=True)
    focus_ml            = db.Column(db.Boolean, default=True)
    webcam_required     = db.Column(db.Boolean, default=False)

    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at          = db.Column(db.DateTime, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'lockdown_fullscreen': self.lockdown_fullscreen,
            'block_copy_paste': self.block_copy_paste,
            'block_tab_switch': self.block_tab_switch,
            'plagiarism_scan': self.plagiarism_scan,
            'focus_ml': self.focus_ml,
            'webcam_required': self.webcam_required,
        }


class SessionModeTransition(db.Model):
    """Audit log of mode changes (D1).

    Mode state machine:
      briefing -> working, ended
      working  -> quiz_active, paused, debrief, ended
      quiz_active -> working, paused, ended
      paused   -> working, quiz_active, debrief, ended
      debrief  -> working, ended
      ended    -> (terminal)
    """
    __tablename__ = 'session_mode_transitions'

    VALID_MODES = {'briefing', 'working', 'quiz_active', 'paused', 'debrief', 'ended'}
    LEGAL_TRANSITIONS = {
        'briefing':    {'working', 'ended'},
        'working':     {'quiz_active', 'paused', 'debrief', 'ended'},
        'quiz_active': {'working', 'paused', 'ended'},
        'paused':      {'working', 'quiz_active', 'debrief', 'ended'},
        'debrief':     {'working', 'ended'},
        'ended':       set(),
    }

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id  = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=False)
    from_mode   = db.Column(db.String(20))
    to_mode     = db.Column(db.String(20), nullable=False)
    actor_id    = db.Column(db.String(36), db.ForeignKey('users.id'))
    reason      = db.Column(db.Text)
    at          = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_smt_session', 'session_id'),
    )

    def to_dict(self):
        return {
            'from_mode': self.from_mode, 'to_mode': self.to_mode,
            'at': self.at.isoformat() if self.at else None,
        }


class ChatMessage(db.Model):
    """Live session chat. Students -> instructor only; instructor -> broadcast or 1:1."""
    __tablename__ = 'chat_messages'

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id  = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'), nullable=False)
    from_id     = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    to_id       = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)  # NULL = broadcast
    text        = db.Column(db.Text, nullable=False)
    at          = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_chat_session', 'session_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'from_id': self.from_id,
            'to_id': self.to_id,
            'text': self.text,
            'at': self.at.isoformat() if self.at else None,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Analytics
# ══════════════════════════════════════════════════════════════════════════════

class TestCaseResult(db.Model):
    """Per-test-case pass/fail for a single CodeAttempt (A1 — heatmap prerequisite).

    Populated in exec_engine/verdict.py alongside the existing
    aggregate test_cases_passed/total counters (backward compatible).
    """
    __tablename__ = 'test_case_results'

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    attempt_id          = db.Column(db.String(36), db.ForeignKey('code_attempts.id'), nullable=False)
    test_case_id        = db.Column(db.String(36), db.ForeignKey('test_cases.id'), nullable=False)
    passed              = db.Column(db.Boolean, nullable=False)
    execution_time_ms   = db.Column(db.Integer)
    # Truncated to 2 KB to keep storage manageable
    output              = db.Column(db.Text)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_tcr_attempt', 'attempt_id'),
        db.Index('ix_tcr_test_case', 'test_case_id'),
    )

    def to_dict(self):
        return {
            'test_case_id': self.test_case_id,
            'passed': self.passed,
            'execution_time_ms': self.execution_time_ms,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Reports
# ══════════════════════════════════════════════════════════════════════════════

class Report(db.Model):
    """Async report generation job tracking (R2).

    Kinds: gradebook | session_summary | student_progress | experiment_performance
           at_risk | cross_section | viva_consolidated | catch_up
    Statuses: pending | generating | ready | failed
    """
    __tablename__ = 'reports'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), nullable=False)
    created_by      = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    kind            = db.Column(db.String(40), nullable=False)
    params          = db.Column(db.JSON)          # {section_subject_id, session_id, from, to, ...}
    status          = db.Column(db.String(20), default='pending')
    file_path       = db.Column(db.Text)          # local path to generated CSV or PDF
    error           = db.Column(db.Text)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at    = db.Column(db.DateTime)

    __table_args__ = (
        db.Index('ix_reports_inst_creator', 'institution_id', 'created_by'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'kind': self.kind,
            'status': self.status,
            'params': self.params,
            'file_path': self.file_path,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error': self.error,
        }


# ══════════════════════════════════════════════════════════════════════════════
# Instructor Settings
# ══════════════════════════════════════════════════════════════════════════════

class InstructorSettings(db.Model):
    """Per-instructor defaults for proctoring policy, rubric, AI, session config.
    Defaults pre-fill new experiments and sessions.
    """
    __tablename__ = 'instructor_settings'

    instructor_id               = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    institution_id              = db.Column(db.String(36), nullable=False)

    # Default proctoring toggles (JSON stored as the 6-field dict)
    default_proctor_policy      = db.Column(db.JSON, default=dict)

    # Default rubric weights (JSON: {test_cases, quiz, viva, quality, lab_report})
    default_rubric              = db.Column(db.JSON, default=dict)

    # Default session config
    default_session_duration_min = db.Column(db.Integer, default=90)
    default_late_join_window_min = db.Column(db.Integer, default=10)
    default_gate_threshold       = db.Column(db.Integer, default=70)

    # AI defaults
    allow_ai_hints               = db.Column(db.Boolean, default=True)
    hint_strictness              = db.Column(db.String(30), default='Balanced')

    # Additional grading defaults
    passing_threshold            = db.Column(db.Integer, default=40)
    late_submission_penalty      = db.Column(db.Integer, default=0)
    max_retry_attempts           = db.Column(db.Integer, default=3)
    grace_marks                  = db.Column(db.Integer, default=0)

    # At-risk thresholds (DB2)
    at_risk_avg_threshold        = db.Column(db.Integer, default=40)
    at_risk_min_threshold        = db.Column(db.Integer, default=20)
    min_attempts_analysis        = db.Column(db.Integer, default=3)
    consider_last_sessions       = db.Column(db.Integer, default=5)

    # Notification prefs and delivery settings
    notification_prefs           = db.Column(db.JSON, default=list)
    notification_delivery        = db.Column(db.JSON, default=dict)

    updated_at                   = db.Column(db.DateTime, onupdate=datetime.utcnow)

    def to_dict(self):
        default_policy = {
            'lockdown_fullscreen': True, 'block_copy_paste': True,
            'block_tab_switch': True, 'plagiarism_scan': True,
            'focus_ml': True, 'webcam_required': False,
            'screen_recording': True, 'browser_security': True,
        }
        if self.default_proctor_policy:
            default_policy.update(self.default_proctor_policy)

        default_delivery = {
            'notify_at_risk_new': True,
            'notify_at_risk_recovered': True,
            'notify_integrity_violations': True,
            'show_at_risk_in_roster': True,
            'include_suggested_actions': True,
            'persist_notifications': True,
        }
        if self.notification_delivery:
            default_delivery.update(self.notification_delivery)

        return {
            'default_proctor_policy': default_policy,
            'default_rubric': self.default_rubric or {
                'test_cases': 60, 'lab_report': 20, 'code_quality': 10, 'viva': 10, 'quiz': 0
            },
            'default_session_duration_min': self.default_session_duration_min if self.default_session_duration_min is not None else 90,
            'default_late_join_window_min': self.default_late_join_window_min if self.default_late_join_window_min is not None else 10,
            'default_gate_threshold': self.default_gate_threshold if self.default_gate_threshold is not None else 70,
            'allow_ai_hints': self.allow_ai_hints if self.allow_ai_hints is not None else True,
            'hint_strictness': self.hint_strictness or 'Balanced',
            'passing_threshold': self.passing_threshold if self.passing_threshold is not None else 40,
            'late_submission_penalty': self.late_submission_penalty if self.late_submission_penalty is not None else 0,
            'max_retry_attempts': self.max_retry_attempts if self.max_retry_attempts is not None else 3,
            'grace_marks': self.grace_marks if self.grace_marks is not None else 0,
            'at_risk_avg_threshold': self.at_risk_avg_threshold if self.at_risk_avg_threshold is not None else 40,
            'at_risk_min_threshold': self.at_risk_min_threshold if self.at_risk_min_threshold is not None else 20,
            'min_attempts_analysis': self.min_attempts_analysis if self.min_attempts_analysis is not None else 3,
            'consider_last_sessions': self.consider_last_sessions if self.consider_last_sessions is not None else 5,
            'notification_delivery': default_delivery,
            'notification_prefs': self.notification_prefs or [],
        }
