"""
Tier 2/3 instructor enhancement models:

BankQuestion — shared MCQ pool; authors pull from it instead of rewriting.
TeacherNote  — private per-student notes (visible only to the author).
SessionPoll  — in-class quick polls backed by the socket namespace.
"""
import uuid
from datetime import datetime
from app.extensions import db


class BankQuestion(db.Model):
    __tablename__ = 'question_bank'

    id             = db.Column(db.String(36), primary_key=True,
                               default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                               nullable=False, index=True)
    created_by     = db.Column(db.String(36), db.ForeignKey('users.id'),
                               nullable=False, index=True)
    question_text  = db.Column(db.Text, nullable=False)
    options        = db.Column(db.JSON)      # ["A text", "B text", …]
    correct_answer = db.Column(db.String(5)) # "A".."D"
    explanation    = db.Column(db.Text)
    tags           = db.Column(db.JSON)      # e.g. ["recursion","python"]
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self, include_answer=True):
        return {
            'id':             self.id,
            'question_text':  self.question_text,
            'options':        self.options or [],
            'correct_answer': self.correct_answer if include_answer else None,
            'explanation':    self.explanation,
            'tags':           self.tags or [],
            'created_at':     self.created_at.isoformat() + 'Z' if self.created_at else None,
        }


class TeacherNote(db.Model):
    __tablename__ = 'teacher_notes'

    id             = db.Column(db.String(36), primary_key=True,
                               default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                               nullable=False)
    student_id     = db.Column(db.String(36), db.ForeignKey('users.id'),
                               nullable=False)
    created_by     = db.Column(db.String(36), db.ForeignKey('users.id'),
                               nullable=False)
    note           = db.Column(db.Text, nullable=False)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    author_rel = db.relationship('User', foreign_keys=[created_by])

    def to_dict(self):
        return {
            'id':         self.id,
            'student_id': self.student_id,
            'note':       self.note,
            'created_by': self.created_by,
            'author':     self.author_rel.full_name if self.author_rel else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }


class SessionPoll(db.Model):
    __tablename__ = 'session_polls'

    id         = db.Column(db.String(36), primary_key=True,
                           default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'),
                           nullable=False, index=True)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'),
                           nullable=False)
    question   = db.Column(db.Text, nullable=False)
    options    = db.Column(db.JSON)    # ["Yes", "No", …]
    responses  = db.Column(db.JSON)    # {student_id: option_index}
    is_open    = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def results(self):
        """Tally per option index."""
        tally = [0] * len(self.options or [])
        for v in (self.responses or {}).values():
            try:
                tally[int(v)] += 1
            except (IndexError, ValueError, TypeError):
                continue
        return tally

    def to_dict(self, include_results=False):
        d = {
            'id':         self.id,
            'session_id': self.session_id,
            'question':   self.question,
            'options':    self.options or [],
            'is_open':    self.is_open,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
        if include_results:
            d['results'] = self.results()
            d['responses_count'] = len(self.responses or {})
        return d
