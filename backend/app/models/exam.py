"""
Standalone Timed Exam entity.

An Exam is an assessment independent of any LabSession: it has an availability
window (available_from → due_at), a per-attempt countdown (duration_minutes →
expires_at), and its own questions (MCQ and/or coding). Server time is
authoritative for every deadline; clients only render countdowns derived from
server-provided timestamps.

exam_type:
  - 'mcq'    → only multiple-choice questions
  - 'coding' → only docker-graded coding questions
  - 'mixed'  → both
"""
import uuid
from datetime import datetime

from app.extensions import db
from app.models.session import _iso_z


class Exam(db.Model):
    __tablename__ = 'exams'
    __table_args__ = (
        db.Index('ix_exams_inst_subj', 'institution_id', 'subject_id'),
    )

    id                = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id    = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    subject_id        = db.Column(db.String(36), db.ForeignKey('subjects.id'), nullable=False)
    created_by        = db.Column(db.String(36), db.ForeignKey('users.id'))

    title             = db.Column(db.Text, nullable=False)
    description       = db.Column(db.Text)
    exam_type         = db.Column(db.String(10), default='mcq')   # mcq | coding | mixed

    # Availability window (UTC, naive). NULL = unbounded on that side.
    available_from    = db.Column(db.DateTime)
    due_at            = db.Column(db.DateTime)

    duration_minutes  = db.Column(db.Integer, default=30)         # per-attempt countdown
    max_attempts      = db.Column(db.Integer, default=1)
    pass_threshold    = db.Column(db.Integer, default=40)         # % to pass
    shuffle_questions = db.Column(db.Boolean, default=True)
    is_published      = db.Column(db.Boolean, default=False)
    # Contribution to the student's final grade (0.0–1.0 = 0–100%).
    # e.g. 0.3 means this exam counts as 30% of the overall grade.
    grade_weight      = db.Column(db.Float, default=0.0)

    created_at        = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at        = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    questions         = db.relationship(
        'ExamQuestion', backref='exam', lazy='dynamic',
        cascade='all, delete-orphan', order_by='ExamQuestion.display_order'
    )
    attempts          = db.relationship(
        'ExamAttempt', backref='exam', lazy='dynamic', cascade='all, delete-orphan'
    )

    def window_state(self, now=None):
        """'upcoming' | 'open' | 'closed' based on the availability window."""
        now = now or datetime.utcnow()
        if self.available_from and now < self.available_from:
            return 'upcoming'
        if self.due_at and now > self.due_at:
            return 'closed'
        return 'open'

    def to_dict(self, include_questions=False):
        d = {
            'id': self.id,
            'institution_id': self.institution_id,
            'subject_id': self.subject_id,
            'created_by': self.created_by,
            'title': self.title,
            'description': self.description,
            'exam_type': self.exam_type or 'mcq',
            'available_from': _iso_z(self.available_from),
            'due_at': _iso_z(self.due_at),
            'duration_minutes': self.duration_minutes,
            'max_attempts': self.max_attempts,
            'pass_threshold': self.pass_threshold,
            'shuffle_questions': bool(self.shuffle_questions),
            'is_published': bool(self.is_published),
            'grade_weight': float(self.grade_weight or 0.0),
            'window_state': self.window_state(),
            'question_count': self.questions.count(),
            'created_at': _iso_z(self.created_at),
            'updated_at': _iso_z(self.updated_at),
        }
        if include_questions:
            d['questions'] = [q.to_dict(instructor=True) for q in self.questions.all()]
        return d


class ExamQuestion(db.Model):
    __tablename__ = 'exam_questions'
    __table_args__ = (
        db.Index('ix_exam_questions_exam', 'exam_id', 'display_order'),
        db.Index('ix_exam_questions_exp', 'experiment_id', 'display_order'),
    )

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id         = db.Column(db.String(36), db.ForeignKey('exams.id'), nullable=True)
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=True)

    question_type   = db.Column(db.String(10), default='mcq')     # mcq | coding
    prompt          = db.Column(db.Text, nullable=False)
    points          = db.Column(db.Float, default=1.0)
    display_order   = db.Column(db.Integer, default=0)
    explanation     = db.Column(db.Text)

    # ── MCQ fields ──────────────────────────────────────────────────────
    options         = db.Column(db.JSON)          # ["opt A", "opt B", ...]
    correct_answer  = db.Column(db.String(10))    # letter index e.g. "0"/"A"

    # ── Coding fields ───────────────────────────────────────────────────
    language        = db.Column(db.String(30))    # python | cpp | java ...
    starter_code    = db.Column(db.Text)
    test_cases      = db.Column(db.JSON)          # [{input, expected, hidden, weight}]

    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, instructor=False):
        """
        instructor=True  → include correct_answer / hidden test cases (authoring view).
        instructor=False → student-safe (no answers; coding test cases stripped to visible).
        """
        d = {
            'id': self.id,
            'exam_id': self.exam_id,
            'experiment_id': self.experiment_id,
            'question_type': self.question_type or 'mcq',
            'prompt': self.prompt,
            'points': self.points,
            'display_order': self.display_order,
            'explanation': self.explanation if instructor else None,
        }
        if (self.question_type or 'mcq') == 'mcq':
            d['options'] = self.options or []
            if instructor:
                d['correct_answer'] = self.correct_answer
        else:
            d['language'] = self.language
            d['starter_code'] = self.starter_code
            cases = self.test_cases or []
            if instructor:
                d['test_cases'] = cases
            else:
                # Students only see non-hidden cases (input/expected), never hidden ones.
                d['test_cases'] = [
                    {'input': c.get('input', ''), 'expected': c.get('expected', ''), 'hidden': False}
                    for c in cases if not c.get('hidden')
                ]
        return d


class ExamAttempt(db.Model):
    __tablename__ = 'exam_attempts'
    __table_args__ = (
        db.Index('ix_exam_attempts_student_exam', 'student_id', 'exam_id'),
        db.Index('ix_exam_attempts_student_exp', 'student_id', 'experiment_id'),
    )

    id            = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    exam_id       = db.Column(db.String(36), db.ForeignKey('exams.id'), nullable=True)
    experiment_id = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=True)
    student_id    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)

    started_at    = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at    = db.Column(db.DateTime)        # started_at + duration (capped at due_at)
    submitted_at  = db.Column(db.DateTime)

    score         = db.Column(db.Float, default=0.0)     # percentage 0-100
    total_points  = db.Column(db.Float, default=0.0)     # earned raw points
    max_points    = db.Column(db.Float, default=0.0)     # total available points
    passed        = db.Column(db.Boolean, default=False)
    status        = db.Column(db.String(20), default='in_progress')  # in_progress|submitted|expired

    # Per-question answers/detail. Shape:
    #   { "<question_id>": {"answer": ..., "earned": float, "points": float,
    #                        "correct": bool, "results": [...]} }
    answers       = db.Column(db.JSON)

    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_answers=False):
        d = {
            'id': self.id,
            'exam_id': self.exam_id,
            'experiment_id': self.experiment_id,
            'student_id': self.student_id,
            'started_at': _iso_z(self.started_at),
            'expires_at': _iso_z(self.expires_at),
            'submitted_at': _iso_z(self.submitted_at),
            'score': self.score,
            'total_points': self.total_points,
            'max_points': self.max_points,
            'passed': bool(self.passed),
            'status': self.status,
            'created_at': _iso_z(self.created_at),
        }
        if include_answers:
            d['answers'] = self.answers or {}
        return d
