"""
Platform-user enhancement models (Tier: retention + social layer):

ProblemBookmark    — star + private note per (user, problem)
PlaygroundSession  — saved playground work with optional share slugs
ProblemCollection  — user-built problem playlists
CollectionItem     — playlist membership
CodingContest      — timed problem sets (platform-admin curated)
ContestParticipant — enrollment + solved tracking per contest
"""
import uuid
import secrets
from datetime import datetime
from app.extensions import db


class ProblemBookmark(db.Model):
    __tablename__ = 'practice_bookmarks'

    id         = db.Column(db.String(36), primary_key=True,
                           default=lambda: str(uuid.uuid4()))
    user_id    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    problem_id = db.Column(db.String(36), db.ForeignKey('practice_problems.id'),
                           nullable=False, index=True)
    note       = db.Column(db.Text)   # private note — visible only to the author
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    problem = db.relationship('Problem')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'problem_id', name='uq_practice_bookmark'),
    )

    def to_dict(self, with_problem=True):
        d = {
            'id':         self.id,
            'problem_id': self.problem_id,
            'note':       self.note,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
        if with_problem and self.problem:
            d['problem'] = {
                'slug':        self.problem.slug,
                'title':       self.problem.title,
                'difficulty':  self.problem.difficulty,
                'nexlab_topic': self.problem.nexlab_topic,
            }
        return d


class PlaygroundSession(db.Model):
    __tablename__ = 'playground_sessions'

    id         = db.Column(db.String(36), primary_key=True,
                           default=lambda: str(uuid.uuid4()))
    user_id    = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    title      = db.Column(db.String(200))
    language   = db.Column(db.String(30), nullable=False, default='python')
    code       = db.Column(db.Text, nullable=False)
    stdin_data = db.Column(db.Text)
    # share_slug: set when the user publishes the session; public read-only view
    share_slug = db.Column(db.String(20), unique=True, index=True)
    is_shared  = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    def to_dict(self, include_code=True):
        d = {
            'id':         self.id,
            'title':      self.title,
            'language':   self.language,
            'is_shared':  self.is_shared,
            'share_slug': self.share_slug,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }
        if include_code:
            d['code'] = self.code
            d['stdin_data'] = self.stdin_data
        return d

    @staticmethod
    def new_slug() -> str:
        return secrets.token_urlsafe(9)[:12]


class ProblemCollection(db.Model):
    __tablename__ = 'problem_collections'

    id          = db.Column(db.String(36), primary_key=True,
                            default=lambda: str(uuid.uuid4()))
    user_id     = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, item_count=0):
        return {
            'id':          self.id,
            'title':       self.title,
            'description': self.description,
            'item_count':  item_count,
            'created_at':  self.created_at.isoformat() + 'Z' if self.created_at else None,
        }


class CollectionItem(db.Model):
    __tablename__ = 'collection_items'

    id            = db.Column(db.String(36), primary_key=True,
                              default=lambda: str(uuid.uuid4()))
    collection_id = db.Column(db.String(36), db.ForeignKey('problem_collections.id'),
                              nullable=False)
    problem_id    = db.Column(db.String(36), db.ForeignKey('practice_problems.id'),
                              nullable=False)
    order_index   = db.Column(db.Integer, default=0)

    problem = db.relationship('Problem')

    __table_args__ = (
        db.UniqueConstraint('collection_id', 'problem_id', name='uq_collection_item'),
    )

    def to_dict(self):
        return {
            'id':           self.id,
            'problem_id':   self.problem_id,
            'order_index':  self.order_index,
            'problem': {
                'slug':       self.problem.slug if self.problem else None,
                'title':      self.problem.title if self.problem else None,
                'difficulty': self.problem.difficulty if self.problem else None,
                'nexlab_topic': self.problem.nexlab_topic if self.problem else None,
            },
        }


class CodingContest(db.Model):
    __tablename__ = 'coding_contests'

    id          = db.Column(db.String(36), primary_key=True,
                            default=lambda: str(uuid.uuid4()))
    title       = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    starts_at   = db.Column(db.DateTime, nullable=False)
    ends_at     = db.Column(db.DateTime, nullable=False)
    problem_ids = db.Column(db.JSON)   # [practice_problems.id, …] judged set
    created_by  = db.Column(db.String(36), db.ForeignKey('users.id'))
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, with_problem_count=True):
        d = {
            'id':           self.id,
            'title':        self.title,
            'description':  self.description,
            'starts_at':    self.starts_at.isoformat() + 'Z' if self.starts_at else None,
            'ends_at':      self.ends_at.isoformat() + 'Z' if self.ends_at else None,
            'created_at':   self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
        if with_problem_count:
            d['problem_count'] = len(self.problem_ids or [])
        return d

    def status_now(self):
        now = datetime.utcnow()
        if now < self.starts_at:
            return 'upcoming'
        if now > self.ends_at:
            return 'past'
        return 'live'


class ContestParticipant(db.Model):
    __tablename__ = 'contest_participants'

    id          = db.Column(db.String(36), primary_key=True,
                            default=lambda: str(uuid.uuid4()))
    contest_id  = db.Column(db.String(36), db.ForeignKey('coding_contests.id'),
                            nullable=False)
    user_id     = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    joined_at   = db.Column(db.DateTime, default=datetime.utcnow)
    solved_slugs = db.Column(db.JSON, default=list)
    score       = db.Column(db.Integer, default=0)

    __table_args__ = (
        db.UniqueConstraint('contest_id', 'user_id', name='uq_contest_participant'),
    )

    def to_dict(self):
        return {
            'contest_id':   self.contest_id,
            'user_id':      self.user_id,
            'solved_slugs': self.solved_slugs or [],
            'score':        self.score or 0,
            'joined_at':    self.joined_at.isoformat() + 'Z' if self.joined_at else None,
        }
