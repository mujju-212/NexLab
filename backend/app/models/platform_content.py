"""
Free Course Platform Models
- PlatformCourse  : platform-curated course catalog
- PlatformExercise: individual coding/MCQ problems inside a course
- PlatformProgress: per-user completion record
"""
import uuid
from datetime import datetime
from sqlalchemy import func
from app.extensions import db


class PlatformCourse(db.Model):
    __tablename__ = 'platform_courses'

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug        = db.Column(db.String(80), unique=True, nullable=False)  # e.g. "python-basics"
    title       = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text)
    thumbnail_url = db.Column(db.Text)
    difficulty  = db.Column(db.String(20), default='beginner')  # beginner|intermediate|advanced
    tags        = db.Column(db.JSON)                             # ["python", "arrays"]
    language    = db.Column(db.String(20), default='python')     # primary language
    is_published= db.Column(db.Boolean, default=False)
    order_index = db.Column(db.Integer, default=0)               # display order
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    exercises   = db.relationship('PlatformExercise', backref='course',
                                  order_by='PlatformExercise.order_index', lazy='dynamic')

    def to_dict(self, with_stats=False):
        exs = self.exercises.all()
        calc_xp = sum(e.xp_reward or 0 for e in exs)
        d = {
            'id':           self.id,
            'slug':         self.slug,
            'title':        self.title,
            'description':  self.description,
            'thumbnail_url':self.thumbnail_url,
            'difficulty':   self.difficulty,
            'tags':         self.tags or [],
            'language':     self.language,
            'is_published': self.is_published,
            'order_index':  self.order_index,
            'exercise_count': len(exs),
            'total_xp':     calc_xp,
        }
        return d


class PlatformExercise(db.Model):
    __tablename__ = 'platform_exercises'
    __table_args__ = (
        db.Index('ix_platform_exercises_course_order', 'course_id', 'order_index'),
    )

    id           = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    course_id    = db.Column(db.String(36), db.ForeignKey('platform_courses.id'), nullable=False)
    order_index  = db.Column(db.Integer, default=0)

    title        = db.Column(db.Text, nullable=False)
    description  = db.Column(db.Text)       # problem statement (markdown)
    hint_text    = db.Column(db.Text)        # static hint (no AI needed)
    difficulty   = db.Column(db.String(20), default='easy')  # easy|medium|hard

    # Coding exercise fields
    starter_code     = db.Column(db.JSON)    # {"python": "def solve():\n    pass", "cpp": "..."}
    allowed_languages= db.Column(db.JSON)    # ["python", "cpp", "java"]
    test_cases       = db.Column(db.JSON)    # [{"input": "5", "expected": "25", "hidden": false}]
    time_limit_sec   = db.Column(db.Integer, default=5)
    memory_limit_kb  = db.Column(db.Integer, default=131072)

    # Exercise type: coding | mcq | reading | simulation
    exercise_type    = db.Column(db.String(10), default='coding')
    # For simulation exercises: static HTML lab served by the frontend
    # (e.g. '/simulations/python-programming-lab/loops.html')
    simulation_path  = db.Column(db.Text)
    # For MCQ exercises:
    mcq_options      = db.Column(db.JSON)    # ["Option A", "Option B", ...]
    mcq_answer       = db.Column(db.String(2))  # "A"|"B"|"C"|"D"
    mcq_explanation  = db.Column(db.Text)

    tags             = db.Column(db.JSON)    # e.g. ["Arrays", "Searching"]
    acceptance_rate  = db.Column(db.Float, default=None)
    solves_count     = db.Column(db.Integer, default=0)

    xp_reward        = db.Column(db.Integer, default=10)
    is_published     = db.Column(db.Boolean, default=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_answer=False, actual_solves=None):
        # Progress rows are the source of truth; the old denormalized counter
        # may be stale for activity recorded before solve-count maintenance.
        # Callers serializing a collection can pass a grouped count to avoid N+1.
        if actual_solves is None:
            actual_solves = db.session.query(func.count(PlatformProgress.id)).filter_by(
                exercise_id=self.id, status='solved'
            ).scalar() or 0
        d = {
            'id':           self.id,
            'course_id':    self.course_id,
            'order_index':  self.order_index,
            'title':        self.title,
            'description':  self.description,
            'hint_text':    self.hint_text,
            'difficulty':   self.difficulty,
            'exercise_type':self.exercise_type,
            'tags':         self.tags or [],
            'acceptance_rate': round(float(self.acceptance_rate), 1) if self.acceptance_rate is not None else None,
            'solves_count': actual_solves,
            'allowed_languages': self.allowed_languages or ['python'],
            'starter_code': self.starter_code or {},
            'xp_reward':    self.xp_reward,
            # Only expose non-hidden test cases
            'test_cases': [
                tc for tc in (self.test_cases or [])
                if not tc.get('hidden', False)
            ],
        }
        if self.exercise_type == 'mcq':
            d['mcq_options'] = self.mcq_options
            if include_answer:
                d['mcq_answer'] = self.mcq_answer
                d['mcq_explanation'] = self.mcq_explanation
        if self.exercise_type == 'simulation':
            d['simulation_path'] = self.simulation_path
        return d


class PlatformProgress(db.Model):
    __tablename__ = 'platform_progress'

    id           = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    exercise_id  = db.Column(db.String(36), db.ForeignKey('platform_exercises.id'), nullable=False, index=True)
    course_id    = db.Column(db.String(36), db.ForeignKey('platform_courses.id'), nullable=False, index=True)

    status       = db.Column(db.String(10), default='attempted')  # attempted | solved
    attempts     = db.Column(db.Integer, default=0)
    best_score   = db.Column(db.Float, default=0.0)   # % of test cases passed
    last_code    = db.Column(db.Text)                 # last submitted code
    language_used= db.Column(db.String(20))
    xp_earned    = db.Column(db.Integer, default=0)
    solved_at    = db.Column(db.DateTime)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'exercise_id', name='uq_platform_progress'),
        db.Index('ix_platform_progress_user_course', 'user_id', 'course_id', 'status'),
    )

    def to_dict(self):
        return {
            'exercise_id':   self.exercise_id,
            'course_id':     self.course_id,
            'status':        self.status,
            'attempts':      self.attempts,
            'best_score':    self.best_score,
            'last_code':     self.last_code,
            'language_used': self.language_used,
            'xp_earned':     self.xp_earned,
            'solved_at':     self.solved_at.isoformat() if self.solved_at else None,
        }
