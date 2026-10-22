import uuid
from datetime import datetime
from app.extensions import db


def _iso_z(dt):
    """Serialize a naive-UTC datetime to ISO-8601 with a trailing 'Z' so JS
    `new Date(...)` parses it as UTC (not local). Returns None when dt is None."""
    if dt is None:
        return None
    return dt.isoformat() + ('' if dt.isoformat().endswith('+00:00') else 'Z')


class Experiment(db.Model):
    __tablename__ = 'experiments'
    __table_args__ = (
        db.Index('ix_experiments_inst_subj', 'institution_id', 'subject_id'),
        db.Index('ix_experiments_instructor', 'instructor_id'),
    )
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    subject_id      = db.Column(db.String(36), db.ForeignKey('subjects.id'), nullable=False)
    instructor_id   = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)

    exp_number      = db.Column(db.Integer, nullable=False)
    title           = db.Column(db.Text, nullable=False)
    aim             = db.Column(db.Text)
    theory          = db.Column(db.Text)
    problem_statement = db.Column(db.Text)
    input_format    = db.Column(db.Text)
    output_format   = db.Column(db.Text)

    difficulty_level    = db.Column(db.Integer, default=1)   # 1-4 (DPKT paper framework)
    concept_tags        = db.Column(db.JSON)                 # REQUIRED: ["arrays", "sorting"]
    allowed_languages   = db.Column(db.JSON)                 # ["python", "cpp", "java", "c"]

    # Multi-file support
    is_multi_file       = db.Column(db.Boolean, default=False)
    file_structure      = db.Column(db.JSON)
    # e.g. [{"name": "main.py", "role": "entry"}, {"name": "utils.py", "role": "helper"}]

    # Grading rubric weights (must sum to 100; quiz_only experiments use rubric_quiz)
    rubric_test_cases   = db.Column(db.Integer, default=60)
    rubric_lab_report   = db.Column(db.Integer, default=20)
    rubric_code_quality = db.Column(db.Integer, default=10)
    rubric_viva         = db.Column(db.Integer, default=10)
    rubric_quiz         = db.Column(db.Integer, default=0)   # quiz component weight (P0 §2.6)

    enable_viva         = db.Column(db.Boolean, default=False)
    enable_lockdown     = db.Column(db.Boolean, default=False)  # full browser lockdown
    allow_ai_hints      = db.Column(db.Boolean, default=True)   # instructor can disable AI hints
    time_limit_sec      = db.Column(db.Integer, default=10)
    memory_limit_kb     = db.Column(db.Integer, default=262144)

    # Simulation upload
    simulation_entry    = db.Column(db.Text)    # filename of entry point (index.html)
    simulation_files    = db.Column(db.Text)    # JSON list of uploaded files

    is_published        = db.Column(db.Boolean, default=False)
    ranking_visible     = db.Column(db.Boolean, default=True)  # public-ranking opt-out (T3-15)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at          = db.Column(db.DateTime, onupdate=datetime.utcnow)

    # ── Staged publishing (draft → republish) ────────────────────────────────
    # published_content    — frozen snapshot of pages/modules/questions that students read.
    #                        Live rows are the instructor's working draft; students only
    #                        ever see this snapshot until the instructor republishes.
    # content_dirty        — live edits exist that are not yet in published_content.
    # content_published_at — timestamp (UTC) of the last publish/republish.
    published_content      = db.Column(db.JSON)
    content_dirty          = db.Column(db.Boolean, default=False)
    content_published_at   = db.Column(db.DateTime)

    # ── Experiment type (D6): coding | quiz_only | mixed | reading ─────────────
    experiment_type     = db.Column(db.String(20), default='coding')

    # ── Delivery mode (unification: practice | lab | exam) ───────────────────
    delivery_mode       = db.Column(db.String(10), default='lab')

    # ── Exam-mode fields (active when delivery_mode == 'exam') ───────────────
    available_from      = db.Column(db.DateTime)       # window start (UTC)
    due_at              = db.Column(db.DateTime)       # window end (UTC)
    max_attempts        = db.Column(db.Integer, default=1)
    pass_threshold      = db.Column(db.Integer, default=40)    # % to pass
    shuffle_questions   = db.Column(db.Boolean, default=False)

    # ── Proctor defaults (JSON of 6 toggles matching ProctorPolicy columns) ────
    proctor_defaults    = db.Column(db.JSON, default=dict)

    # Phase-2 grading rollup fields
    # weightage  — how many marks this experiment contributes toward Subject.total_marks
    # grade_scale — the denominator of this experiment's own score (100-point or 10-point tasks)
    #   subject_score = Σ (experiment_score / grade_scale) × weightage
    weightage           = db.Column(db.Integer, default=1)   # marks assigned to this experiment
    grade_scale         = db.Column(db.Integer, default=100) # 100 or 10

    test_cases      = db.relationship('TestCase', backref='experiment', lazy='dynamic')
    content_modules = db.relationship('ContentModule', backref='experiment',
                                      order_by='ContentModule.display_order', lazy='dynamic')
    exam_questions  = db.relationship('ExamQuestion', backref='experiment', lazy='dynamic', cascade='all, delete-orphan')
    exam_attempts   = db.relationship('ExamAttempt', backref='experiment', lazy='dynamic', cascade='all, delete-orphan')

    def window_state(self, now=None):
        """'upcoming' | 'open' | 'closed' based on the availability window."""
        now = now or datetime.utcnow()
        if self.available_from and now < self.available_from:
            return 'upcoming'
        if self.due_at and now > self.due_at:
            return 'closed'
        return 'open'

    def validate(self):
        """Returns list of validation error strings. Empty list = valid."""
        errors = []
        # Rule 1: concept_tags must be a non-empty list
        if not self.concept_tags or not isinstance(self.concept_tags, list) or len(self.concept_tags) == 0:
            errors.append('concept_tags is required and must be a non-empty list (e.g. ["arrays", "sorting"])')
        # Rule 2: difficulty_level must be 1-4
        if self.difficulty_level not in (1, 2, 3, 4):
            errors.append(f'difficulty_level must be 1, 2, 3, or 4 — got {self.difficulty_level}')
        # Rule 3: rubric weights (including quiz) must sum to 100
        rubric_sum = (
            (self.rubric_test_cases or 0) + (self.rubric_lab_report or 0) +
            (self.rubric_code_quality or 0) + (self.rubric_viva or 0) + (self.rubric_quiz or 0)
        )
        if rubric_sum != 100:
            errors.append(
                f'Rubric weights must sum to 100 — got {rubric_sum} '
                f'(test_cases={self.rubric_test_cases}, lab_report={self.rubric_lab_report}, '
                f'code_quality={self.rubric_code_quality}, viva={self.rubric_viva}, quiz={self.rubric_quiz or 0})'
            )
        return errors

    def to_dict(self):
        return {
            'id': self.id, 'exp_number': self.exp_number,
            'title': self.title, 'aim': self.aim,
            'subject_id': self.subject_id,
            'theory': self.theory,
            'problem_statement': self.problem_statement,
            'input_format': self.input_format,
            'output_format': self.output_format,
            'difficulty_level': self.difficulty_level,
            'concept_tags': self.concept_tags or [],
            'allowed_languages': self.allowed_languages,
            'is_multi_file': self.is_multi_file,
            'file_structure': self.file_structure,
            'enable_viva': self.enable_viva,
            'enable_lockdown': self.enable_lockdown,
            'allow_ai_hints': self.allow_ai_hints,
            'time_limit_sec': self.time_limit_sec,
            'is_published': self.is_published,
            'ranking_visible': self.ranking_visible if self.ranking_visible is not None else True,
            'content_dirty': bool(self.content_dirty),
            'content_published_at': _iso_z(self.content_published_at),
            'has_published_content': self.published_content is not None,
            'weightage': self.weightage,
            'grade_scale': self.grade_scale,
            'experiment_type': self.experiment_type or 'coding',
            'delivery_mode': self.delivery_mode or 'lab',
            'available_from': _iso_z(self.available_from),
            'due_at': _iso_z(self.due_at),
            'duration_minutes': (self.time_limit_sec // 60) if self.time_limit_sec else 30,
            'max_attempts': self.max_attempts or 1,
            'pass_threshold': self.pass_threshold or 40,
            'shuffle_questions': bool(self.shuffle_questions),
            'window_state': self.window_state() if (self.delivery_mode == 'exam') else 'open',
            'proctor_defaults': self.proctor_defaults or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'rubric': {
                'test_cases':   self.rubric_test_cases,
                'lab_report':   self.rubric_lab_report,
                'code_quality': self.rubric_code_quality,
                'viva':         self.rubric_viva,
                'quiz':         self.rubric_quiz or 0,
                'sum': (
                    (self.rubric_test_cases or 0) + (self.rubric_lab_report or 0) +
                    (self.rubric_code_quality or 0) + (self.rubric_viva or 0) +
                    (self.rubric_quiz or 0)
                ),
            },
        }


class TestCase(db.Model):
    __tablename__ = 'test_cases'
    __table_args__ = (
        db.Index('ix_test_cases_experiment', 'experiment_id'),
    )
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    input_data      = db.Column(db.Text)
    expected_output = db.Column(db.Text)
    is_hidden       = db.Column(db.Boolean, default=False)   # hidden = not shown to student
    points_weight   = db.Column(db.Float, default=1.0)
    description     = db.Column(db.Text)                     # optional hint for visible cases

    def to_dict(self, include_hidden=False):
        if self.is_hidden and not include_hidden:
            return None   # never expose hidden test case content to students
        return {
            'id': self.id,
            'input_data': self.input_data,
            'expected_output': self.expected_output,
            'is_hidden': self.is_hidden,
            'description': self.description,
        }


class ContentPage(db.Model):
    """A page (tab) inside an experiment's pre-lab. Blocks (ContentModule) are
    grouped under a page via ContentModule.page_id. Pages are ordered by
    display_order; a NULL page_id on a module means it predates pages / is
    unassigned (rendered in a default first group).

    Scheduling fields:
      release_at  — if set, the page is only visible to students at/after this datetime.
      is_live     — instructor's "publish now" toggle; overrides release_at when True.
    A page is visible to a student when: is_live=True OR (release_at IS NOT NULL AND release_at <= now).
    """
    __tablename__ = 'content_pages'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False, index=True)
    title           = db.Column(db.Text, nullable=False)
    display_order   = db.Column(db.Integer, nullable=False, default=0)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    # ── Per-page scheduling (Feature 1) ───────────────────────────────────────
    release_at      = db.Column(db.DateTime, nullable=True)   # scheduled go-live datetime (UTC)
    is_live         = db.Column(db.Boolean, default=False, nullable=False)  # instant go-live toggle

    def is_visible_to_students(self):
        """True if a student should be able to see this page right now."""
        if self.is_live:
            return True
        if self.release_at is not None and datetime.utcnow() >= self.release_at:
            return True
        return False

    def to_dict(self):
        return {
            'id': self.id,
            'experiment_id': self.experiment_id,
            'title': self.title,
            'display_order': self.display_order,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'release_at': self.release_at.isoformat() if self.release_at else None,
            'is_live': self.is_live,
        }


class ContentModule(db.Model):
    """Pre-lab content blocks: text, video, pdf, quiz"""
    __tablename__ = 'content_modules'
    __table_args__ = (
        db.Index('ix_content_modules_exp_order', 'experiment_id', 'display_order'),
    )
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    page_id         = db.Column(db.String(36), db.ForeignKey('content_pages.id'), nullable=True, index=True)
    module_type     = db.Column(db.String(10), nullable=False)  # text|markdown|code|image|video|pdf|html|link|file|quiz|assign|viva
    title           = db.Column(db.Text, nullable=False)
    content_data    = db.Column(db.JSON)
    # text:  {"html": "<p>...</p>"}
    # video: {"url": "cloudinary_url", "duration_sec": 300}
    # pdf:   {"url": "cloudinary_url", "pages": 12}
    # quiz:  {"pass_threshold": 70, "max_attempts": 3, "cooldown_minutes": 30, "shuffle": true}
    # viva:  {"mode": "topics"|"content", "topics": [...], "count": 5, "difficulty": 2,
    #         "pass_threshold": 70, "questions": [{"question", "expected_answer", "topics": [...], "difficulty"}]}
    display_order   = db.Column(db.Integer, nullable=False)
    min_watch_pct   = db.Column(db.Integer, default=80)   # for video modules only

    quiz_questions  = db.relationship('QuizQuestion', backref='module', lazy='dynamic')


class QuizQuestion(db.Model):
    __tablename__ = 'quiz_questions'
    __table_args__ = (
        db.Index('ix_quiz_questions_module', 'module_id'),
    )
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    module_id       = db.Column(db.String(36), db.ForeignKey('content_modules.id'), nullable=False)
    question_text   = db.Column(db.Text, nullable=False)
    options         = db.Column(db.JSON)   # ["option A", "option B", "option C", "option D"]
    correct_answer  = db.Column(db.String(5))  # "A" | "B" | "C" | "D"
    points          = db.Column(db.Integer, default=1)
    explanation     = db.Column(db.Text)   # shown after answer


class ContentProgress(db.Model):
    """Tracks student completion of each content module"""
    __tablename__ = 'content_progress'
    __table_args__ = (
        # quiz-gate analytics (features.py:662)
        db.Index('ix_content_progress_module_id', 'module_id'),
    )
    student_id      = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    module_id       = db.Column(db.String(36), db.ForeignKey('content_modules.id'), primary_key=True)
    completed       = db.Column(db.Boolean, default=False)
    score           = db.Column(db.Float)          # for quiz modules
    attempts        = db.Column(db.Integer, default=0)
    # Per-question breakdown for quiz modules (per-question analytics):
    # {question_id: {"answer": "A", "correct": true}}
    answers         = db.Column(db.JSON)
    watch_pct       = db.Column(db.Float)          # for video modules
    last_attempt_at = db.Column(db.DateTime)
    completed_at    = db.Column(db.DateTime)
