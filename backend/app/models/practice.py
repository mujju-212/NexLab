"""
NexLab Practice Library — Database Models
==========================================
8 new models:
  Problem, TestCase, PracticeSubmission
  StudyPlan, StudyPlanSection, StudyPlanProgress
  StudentXP, StudentBadge
"""
import uuid
from datetime import datetime, date
from app.extensions import db


# ─── Problem Library ──────────────────────────────────────────────────────────

class Problem(db.Model):
    """A coding problem in the NexLab Practice Library."""
    __tablename__ = 'practice_problems'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug            = db.Column(db.String(120), unique=True, nullable=False, index=True)
    lc_id           = db.Column(db.String(10), index=True)          # LeetCode problem number e.g. "1"
    title           = db.Column(db.String(300), nullable=False)
    difficulty      = db.Column(db.String(10), nullable=False)       # Easy | Medium | Hard
    nexlab_topic    = db.Column(db.String(60), nullable=False, index=True)  # primary NexLab group
    topics          = db.Column(db.JSON, default=list)               # all LeetCode tags
    description     = db.Column(db.Text)                             # Markdown / HTML
    examples        = db.Column(db.JSON, default=list)               # [{input, output, explanation}]
    constraints     = db.Column(db.JSON, default=list)               # ["2 <= n <= 10^4", ...]
    hints           = db.Column(db.JSON, default=list)               # reveal one at a time
    starter_code    = db.Column(db.JSON, default=dict)               # {python: "...", java: "..."}
    acceptance      = db.Column(db.Float, default=0.0)              # 0.49 = 49%
    source          = db.Column(db.String(30), default='leetcode')   # leetcode | custom | instructor

    is_active       = db.Column(db.Boolean, default=True)
    is_daily        = db.Column(db.Boolean, default=False)
    daily_date      = db.Column(db.Date, nullable=True)              # set when is_daily=True
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    test_cases      = db.relationship('PracticeTestCase', backref='problem', lazy='dynamic',
                                       cascade='all, delete-orphan')
    submissions     = db.relationship('PracticeSubmission', backref='problem', lazy='dynamic')

    def to_dict(self, include_description=False):
        d = {
            'id':            self.id,
            'slug':          self.slug,
            'lc_id':         self.lc_id,
            'title':         self.title,
            'difficulty':    self.difficulty,
            'nexlab_topic':  self.nexlab_topic,
            'topics':        self.topics or [],
            'constraints':   self.constraints or [],
            'hints':         self.hints or [],
            'acceptance':    round(float(self.acceptance or 0), 4),
            'source':        self.source,
            'is_daily':      self.is_daily,
            'daily_date':    self.daily_date.isoformat() if self.daily_date else None,
        }
        if include_description:
            d['description']   = self.description
            d['examples']      = self.examples or []
            d['starter_code']  = self.starter_code or {}
        return d

    def to_list_dict(self):
        """Lightweight dict for problem list table (no description)."""
        return {
            'id':           self.id,
            'slug':         self.slug,
            'lc_id':        self.lc_id,
            'title':        self.title,
            'difficulty':   self.difficulty,
            'nexlab_topic': self.nexlab_topic,
            'topics':       self.topics or [],
            'acceptance':   round(float(self.acceptance or 0), 4),
            'is_daily':     self.is_daily,
        }


class PracticeTestCase(db.Model):
    """Test cases for a practice problem (sample + hidden)."""
    __tablename__ = 'practice_test_cases'

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    problem_id  = db.Column(db.String(36), db.ForeignKey('practice_problems.id'), nullable=False, index=True)
    input_data  = db.Column(db.Text, nullable=False)
    expected    = db.Column(db.Text, nullable=False)
    is_sample   = db.Column(db.Boolean, default=False)   # True = shown in Examples; False = hidden judge
    order_index = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id':         self.id,
            'input_data': self.input_data,
            'expected':   self.expected,
            'is_sample':  self.is_sample,
        }


class PracticeSubmission(db.Model):
    """A student's submission for a practice problem."""
    __tablename__ = 'practice_submissions'

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id  = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    problem_id  = db.Column(db.String(36), db.ForeignKey('practice_problems.id'), nullable=False, index=True)
    language    = db.Column(db.String(20), nullable=False)          # python | java | cpp | js
    code        = db.Column(db.Text, nullable=False)
    status      = db.Column(db.String(20), nullable=False)          # Accepted | WrongAnswer | TLE | RE | CE
    passed      = db.Column(db.Integer, default=0)                  # test cases passed
    total       = db.Column(db.Integer, default=0)                  # test cases total
    time_ms     = db.Column(db.Integer)
    memory_kb   = db.Column(db.Integer)
    xp_earned   = db.Column(db.Integer, default=0)
    is_run      = db.Column(db.Boolean, default=False)              # True = "Run" only, False = full submit
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':           self.id,
            'student_id':   self.student_id,
            'problem_id':   self.problem_id,
            'language':     self.language,
            'status':       self.status,
            'passed':       self.passed,
            'total':        self.total,
            'time_ms':      self.time_ms,
            'memory_kb':    self.memory_kb,
            'xp_earned':    self.xp_earned,
            'is_run':       self.is_run,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
        }


# ─── Study Plans ──────────────────────────────────────────────────────────────

class StudyPlan(db.Model):
    """A curated study plan (e.g. NexLab 75, DP Mastery)."""
    __tablename__ = 'practice_study_plans'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slug            = db.Column(db.String(80), unique=True, nullable=False)
    title           = db.Column(db.String(120), nullable=False)
    description     = db.Column(db.Text)
    icon            = db.Column(db.String(10), default='🎯')        # emoji
    total_problems  = db.Column(db.Integer, default=0)
    difficulty_mix  = db.Column(db.String(60), default='Mixed')     # "Easy–Hard", "Medium–Hard"
    estimated_days  = db.Column(db.Integer)
    is_premium      = db.Column(db.Boolean, default=False)
    badge_id        = db.Column(db.String(30))                      # badge awarded on completion
    order_index     = db.Column(db.Integer, default=0)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    sections        = db.relationship('StudyPlanSection', backref='plan', lazy='dynamic',
                                       order_by='StudyPlanSection.order_index',
                                       cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id':             self.id,
            'slug':           self.slug,
            'title':          self.title,
            'description':    self.description,
            'icon':           self.icon,
            'total_problems': self.total_problems,
            'difficulty_mix': self.difficulty_mix,
            'estimated_days': self.estimated_days,
            'badge_id':       self.badge_id,
        }


class StudyPlanSection(db.Model):
    """A section within a study plan (e.g. 'Section 1: Arrays & Hashing')."""
    __tablename__ = 'practice_plan_sections'

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id     = db.Column(db.String(36), db.ForeignKey('practice_study_plans.id'), nullable=False, index=True)
    title       = db.Column(db.String(120), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    problem_ids = db.Column(db.JSON, default=list)                  # ordered list of problem slugs

    def to_dict(self):
        return {
            'id':          self.id,
            'plan_id':     self.plan_id,
            'title':       self.title,
            'order_index': self.order_index,
            'problem_ids': self.problem_ids or [],
            'count':       len(self.problem_ids or []),
        }


class StudyPlanProgress(db.Model):
    """A student's progress through a study plan."""
    __tablename__ = 'practice_plan_progress'

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    plan_id             = db.Column(db.String(36), db.ForeignKey('practice_study_plans.id'), nullable=False, index=True)
    solved_slugs        = db.Column(db.JSON, default=list)          # list of solved problem slugs
    started_at          = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at        = db.Column(db.DateTime, nullable=True)
    badge_awarded       = db.Column(db.Boolean, default=False)

    __table_args__ = (db.UniqueConstraint('student_id', 'plan_id', name='uq_student_plan'),)

    def to_dict(self):
        return {
            'id':            self.id,
            'student_id':    self.student_id,
            'plan_id':       self.plan_id,
            'solved_count':  len(self.solved_slugs or []),
            'solved_slugs':  self.solved_slugs or [],
            'started_at':    self.started_at.isoformat() if self.started_at else None,
            'completed_at':  self.completed_at.isoformat() if self.completed_at else None,
            'badge_awarded': self.badge_awarded,
        }


# ─── Gamification ─────────────────────────────────────────────────────────────

# XP per difficulty
XP_TABLE = {'Easy': 10, 'Medium': 25, 'Hard': 50}

LEVELS = [
    (1,  'Newcomer',     0),
    (2,  'Beginner',     100),
    (3,  'Apprentice',   300),
    (4,  'Practitioner', 700),
    (5,  'Intermediate', 1500),
    (6,  'Skilled',      3000),
    (7,  'Advanced',     5500),
    (8,  'Expert',       9000),
    (9,  'Master',       14000),
    (10, 'Legend',       20000),
]


def xp_to_level(total_xp: int) -> tuple[int, str]:
    level_num, level_name = 1, 'Newcomer'
    for num, name, req in LEVELS:
        if total_xp >= req:
            level_num, level_name = num, name
        else:
            break
    return level_num, level_name


class StudentXP(db.Model):
    """Tracks XP, level, and streak for each student."""
    __tablename__ = 'practice_student_xp'

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), unique=True, nullable=False, index=True)
    total_xp            = db.Column(db.Integer, default=0)
    level               = db.Column(db.Integer, default=1)
    level_name          = db.Column(db.String(30), default='Newcomer')
    streak_days         = db.Column(db.Integer, default=0)
    streak_last_date    = db.Column(db.Date, nullable=True)         # last day activity was logged
    freeze_used_month   = db.Column(db.Integer, nullable=True)      # month number when freeze was used
    problems_solved     = db.Column(db.Integer, default=0)
    easy_solved         = db.Column(db.Integer, default=0)
    medium_solved       = db.Column(db.Integer, default=0)
    hard_solved         = db.Column(db.Integer, default=0)

    def add_xp(self, amount: int):
        self.total_xp += amount
        self.level, self.level_name = xp_to_level(self.total_xp)

    def update_streak(self):
        """Call once per day when student solves any problem."""
        today = date.today()
        if self.streak_last_date == today:
            return  # already counted today
        from datetime import timedelta
        yesterday = today - timedelta(days=1)
        if self.streak_last_date == yesterday:
            self.streak_days += 1
        else:
            self.streak_days = 1
        self.streak_last_date = today

    def to_dict(self):
        level_num, level_name = xp_to_level(self.total_xp)
        # Next level XP required
        next_level_xp = None
        for num, name, req in LEVELS:
            if req > self.total_xp:
                next_level_xp = req
                break
        return {
            'student_id':      self.student_id,
            'total_xp':        self.total_xp,
            'level':           level_num,
            'level_name':      level_name,
            'next_level_xp':   next_level_xp,
            'streak_days':     self.streak_days,
            'problems_solved': self.problems_solved,
            'easy_solved':     self.easy_solved,
            'medium_solved':   self.medium_solved,
            'hard_solved':     self.hard_solved,
        }


# Badge definitions (badge_id → display info)
BADGE_CATALOG = {
    'first_solve':      {'icon': '🌱', 'title': 'First Steps',    'desc': 'Solve your first problem'},
    'streak_7':         {'icon': '🔥', 'title': 'Week Warrior',   'desc': '7-day streak'},
    'streak_30':        {'icon': '🔥', 'title': 'Month Master',   'desc': '30-day streak'},
    'nexlab75':         {'icon': '🎯', 'title': 'NexLab 75',      'desc': 'Complete NexLab 75'},
    'beginner_path':    {'icon': '🌱', 'title': 'Beginner Badge', 'desc': 'Complete Beginner Path'},
    'dp_mastery':       {'icon': '🧠', 'title': 'DP Expert',      'desc': 'Complete DP Mastery'},
    'trees_graphs':     {'icon': '🌳', 'title': 'Tree Climber',   'desc': 'Complete Trees & Graphs'},
    'sql_50':           {'icon': '🗄️',  'title': 'SQL Pro',        'desc': 'Complete SQL 50'},
    'interview_ready':  {'icon': '💼', 'title': 'Interview Ready','desc': 'Complete Interview Ready'},
    'centurion':        {'icon': '💯', 'title': 'Centurion',      'desc': 'Solve 100 problems'},
    'speed_demon':      {'icon': '⚡', 'title': 'Speed Demon',    'desc': 'Submit & accepted under 5 min'},
    'top_10':           {'icon': '🏆', 'title': 'Top 10',         'desc': 'Top 10 in institution leaderboard'},
}


class StudentBadge(db.Model):
    """Badges earned by students."""
    __tablename__ = 'practice_student_badges'

    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id  = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    badge_id    = db.Column(db.String(30), nullable=False)          # key in BADGE_CATALOG
    earned_at   = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (db.UniqueConstraint('student_id', 'badge_id', name='uq_student_badge'),)

    def to_dict(self):
        meta = BADGE_CATALOG.get(self.badge_id, {})
        return {
            'badge_id':   self.badge_id,
            'icon':       meta.get('icon', '🏅'),
            'title':      meta.get('title', self.badge_id),
            'desc':       meta.get('desc', ''),
            'earned_at':  self.earned_at.isoformat() if self.earned_at else None,
        }
