import uuid
from datetime import datetime
from app.extensions import db


class Grade(db.Model):
    __tablename__ = 'grades'
    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    experiment_id       = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'))

    auto_grade          = db.Column(db.Float)       # from Judge0 test cases
    manual_grade        = db.Column(db.Float)       # instructor adjustment
    manual_feedback     = db.Column(db.Text)        # overall feedback
    viva_grade          = db.Column(db.Float)       # from viva session
    hint_deduction      = db.Column(db.Float, default=0.0)  # penalty for hints used
    final_grade         = db.Column(db.Float)       # calculated final

    # Code quality component (from radon analysis)
    code_quality_grade  = db.Column(db.Float)       # 0-10 score from quality metrics

    graded_by           = db.Column(db.String(36), db.ForeignKey('users.id'))
    graded_at           = db.Column(db.DateTime)
    is_locked           = db.Column(db.Boolean, default=False)  # locked after student views
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    inline_comments     = db.relationship('InlineComment', backref='grade', lazy='dynamic')

    def calculate_final(self, rubric):
        """Calculate final grade from components based on rubric weights"""
        tc_score   = (self.auto_grade or 0)
        lab_score  = (self.manual_grade or 0)
        code_score = (self.code_quality_grade or 0)
        viva_score = (self.viva_grade or 0)

        final = (
            tc_score   * (rubric['test_cases'] / 100) +
            lab_score  * (rubric['lab_report'] / 100) +
            code_score * (rubric['code_quality'] / 100) +
            viva_score * (rubric['viva'] / 100)
        )
        self.final_grade = max(0, final - (self.hint_deduction or 0))
        return self.final_grade

    def to_dict(self):
        return {
            'id': self.id,
            'auto_grade': self.auto_grade,
            'manual_grade': self.manual_grade,
            'manual_feedback': self.manual_feedback,
            'viva_grade': self.viva_grade,
            'code_quality_grade': self.code_quality_grade,
            'hint_deduction': self.hint_deduction,
            'final_grade': self.final_grade,
            'graded_at': self.graded_at.isoformat() if self.graded_at else None,
            'is_locked': self.is_locked,
        }


class InlineComment(db.Model):
    __tablename__ = 'inline_comments'
    id          = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    grade_id    = db.Column(db.String(36), db.ForeignKey('grades.id'), nullable=False)
    file_name   = db.Column(db.String(100), default='main')  # for multi-file support
    line_number = db.Column(db.Integer, nullable=False)
    comment     = db.Column(db.Text, nullable=False)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)


class HintLog(db.Model):
    __tablename__ = 'hint_logs'
    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    experiment_id       = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'))

    hint_level          = db.Column(db.Integer, nullable=False)  # 1 | 2 | 3
    prompt_sent         = db.Column(db.Text)
    response_received   = db.Column(db.Text)
    model_used          = db.Column(db.String(50))
    latency_ms          = db.Column(db.Integer)
    is_fallback         = db.Column(db.Boolean, default=False)   # True if Groq was down
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)


class VivaSession(db.Model):
    __tablename__ = 'viva_sessions'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id      = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    grade_id        = db.Column(db.String(36), db.ForeignKey('grades.id'))
    questions       = db.Column(db.JSON)   # [{"q": "...", "score": 8, "feedback": "..."}]
    total_score     = db.Column(db.Float)
    status          = db.Column(db.String(20), default='pending')  # pending | active | completed
    started_at      = db.Column(db.DateTime)
    completed_at    = db.Column(db.DateTime)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)

    answers         = db.relationship('VivaAnswer', backref='viva_session', lazy='dynamic')


class VivaAnswer(db.Model):
    __tablename__ = 'viva_answers'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    viva_session_id = db.Column(db.String(36), db.ForeignKey('viva_sessions.id'), nullable=False)
    question_index  = db.Column(db.Integer, nullable=False)
    question_text   = db.Column(db.Text)
    answer_text     = db.Column(db.Text)
    score           = db.Column(db.Float)
    ai_feedback     = db.Column(db.Text)
    submitted_at    = db.Column(db.DateTime, default=datetime.utcnow)
