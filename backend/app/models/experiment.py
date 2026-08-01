import uuid
from datetime import datetime
from app.extensions import db


class Experiment(db.Model):
    __tablename__ = 'experiments'
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

    difficulty_level    = db.Column(db.Integer, default=1)   # 1-4
    concept_tags        = db.Column(db.JSON)                 # ["arrays", "sorting"]
    allowed_languages   = db.Column(db.JSON)                 # ["python", "cpp", "java", "c"]

    # Multi-file support
    is_multi_file       = db.Column(db.Boolean, default=False)
    file_structure      = db.Column(db.JSON)
    # e.g. [{"name": "main.py", "role": "entry"}, {"name": "utils.py", "role": "helper"}]

    # Grading rubric weights (must sum to 100)
    rubric_test_cases   = db.Column(db.Integer, default=60)
    rubric_lab_report   = db.Column(db.Integer, default=20)
    rubric_code_quality = db.Column(db.Integer, default=10)
    rubric_viva         = db.Column(db.Integer, default=10)

    enable_viva         = db.Column(db.Boolean, default=False)
    enable_lockdown     = db.Column(db.Boolean, default=False)  # full browser lockdown
    time_limit_sec      = db.Column(db.Integer, default=10)
    memory_limit_kb     = db.Column(db.Integer, default=262144)

    is_published        = db.Column(db.Boolean, default=False)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at          = db.Column(db.DateTime, onupdate=datetime.utcnow)

    test_cases      = db.relationship('TestCase', backref='experiment', lazy='dynamic')
    content_modules = db.relationship('ContentModule', backref='experiment',
                                      order_by='ContentModule.display_order', lazy='dynamic')

    def to_dict(self):
        return {
            'id': self.id, 'exp_number': self.exp_number,
            'title': self.title, 'aim': self.aim,
            'difficulty_level': self.difficulty_level,
            'concept_tags': self.concept_tags,
            'allowed_languages': self.allowed_languages,
            'is_multi_file': self.is_multi_file,
            'file_structure': self.file_structure,
            'enable_viva': self.enable_viva,
            'enable_lockdown': self.enable_lockdown,
            'is_published': self.is_published,
        }


class TestCase(db.Model):
    __tablename__ = 'test_cases'
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


class ContentModule(db.Model):
    """Pre-lab content blocks: text, video, pdf, quiz"""
    __tablename__ = 'content_modules'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    module_type     = db.Column(db.String(10), nullable=False)  # text | video | pdf | quiz
    title           = db.Column(db.Text, nullable=False)
    content_data    = db.Column(db.JSON)
    # text:  {"html": "<p>...</p>"}
    # video: {"url": "cloudinary_url", "duration_sec": 300}
    # pdf:   {"url": "cloudinary_url", "pages": 12}
    # quiz:  {"pass_threshold": 70, "max_attempts": 3, "cooldown_minutes": 30, "shuffle": true}
    display_order   = db.Column(db.Integer, nullable=False)
    min_watch_pct   = db.Column(db.Integer, default=80)   # for video modules only

    quiz_questions  = db.relationship('QuizQuestion', backref='module', lazy='dynamic')


class QuizQuestion(db.Model):
    __tablename__ = 'quiz_questions'
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
    student_id      = db.Column(db.String(36), db.ForeignKey('users.id'), primary_key=True)
    module_id       = db.Column(db.String(36), db.ForeignKey('content_modules.id'), primary_key=True)
    completed       = db.Column(db.Boolean, default=False)
    score           = db.Column(db.Float)          # for quiz modules
    attempts        = db.Column(db.Integer, default=0)
    watch_pct       = db.Column(db.Float)          # for video modules
    last_attempt_at = db.Column(db.DateTime)
    completed_at    = db.Column(db.DateTime)
