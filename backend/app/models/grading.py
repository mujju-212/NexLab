import uuid
from datetime import datetime
from app.extensions import db


class Grade(db.Model):
    __tablename__ = 'grades'
    __table_args__ = (
        # analytics trends grade bucket per session
        db.Index('ix_grades_session_id', 'session_id'),
        db.Index('ix_grades_student_exp', 'student_id', 'experiment_id'),
        db.Index('ix_grades_exp_final', 'experiment_id', 'final_grade'),
        db.Index('ix_grades_student_created', 'student_id', 'created_at'),
        db.Index('ix_grades_student_exam', 'student_id', 'exam_id'),
    )
    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    # A Grade belongs to EITHER a lab Experiment or a standalone Exam.
    experiment_id       = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=True)
    exam_id             = db.Column(db.String(36), db.ForeignKey('exams.id'), nullable=True, index=True)
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'))

    auto_grade          = db.Column(db.Float)       # from code test cases
    manual_grade        = db.Column(db.Float)       # instructor adjustment
    manual_feedback     = db.Column(db.Text)        # overall feedback
    viva_grade          = db.Column(db.Float)       # from viva session
    hint_deduction      = db.Column(db.Float, default=0.0)  # penalty for hints used
    final_grade         = db.Column(db.Float)       # calculated final

    # Code quality component (from radon analysis)
    # NOTE: stored 0-100 like every other rubric component. The rubric weight
    # (Experiment.rubric_code_quality) is what turns it into marks — do not
    # rescale it here; an earlier x10 hack inflated genuine low scores.
    code_quality_grade  = db.Column(db.Float)       # 0-100 score from quality metrics

    # Quiz grade component (populated on session end — D3)
    quiz_grade          = db.Column(db.Float)       # 0-100

    graded_by           = db.Column(db.String(36), db.ForeignKey('users.id'))
    graded_at           = db.Column(db.DateTime)
    is_locked           = db.Column(db.Boolean, default=False)  # locked after student views
    # Explicit "this component has been graded" ticks, set by the instructor.
    # {component: true/false}. A component that is NOT ticked is left out of the
    # calculation entirely (its weight is removed from the denominator) instead of
    # silently counting as a zero. See calculate_final().
    assessed_components = db.Column(db.JSON)
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)

    inline_comments     = db.relationship('InlineComment', backref='grade', lazy='dynamic')
    experiment          = db.relationship('Experiment', backref='grades')

    # Rubric components, in the order the UI shows them.
    COMPONENTS = ('test_cases', 'lab_report', 'code_quality', 'viva', 'quiz')

    def component_score(self, key):
        """The stored 0-100 score for a rubric component, or None if unmarked."""
        return {
            'test_cases':   self.auto_grade,
            'lab_report':   self.manual_grade,
            'code_quality': self.code_quality_grade,
            'viva':         self.viva_grade,
            'quiz':         self.quiz_grade,
        }.get(key)

    def assessed_map(self, rubric):
        """Which rubric components count towards this mark.

        The instructor ticks each component once it has actually been marked.
        A ticked component contributes its weight to the denominator; an
        unticked one is excluded completely. When no tick has been recorded we
        fall back to "has a score", which is the honest reading of the data.
        Weight-0 components are never part of the mark at all.
        """
        stored = self.assessed_components if isinstance(self.assessed_components, dict) else {}
        out = {}
        for key in self.COMPONENTS:
            if (rubric.get(key) or 0) <= 0:
                continue
            if key in stored:
                out[key] = bool(stored[key])
            else:
                out[key] = self.component_score(key) is not None
        return out

    def calculate_final(self, rubric, assessed=None):
        """Final mark = score weighted over the components that were graded.

        final = Σ(score × weight) / Σ(weight of graded components)

        Rescaling by the weight actually assessed is what stops "not marked yet"
        from being read as "scored zero": a student marked 88 on a 20%-weight
        report in a 50/20/10/10/10 rubric gets 88, not 17.6 — flagged as
        provisional until the remaining 80% of the weight is assessed.
        """
        if assessed is None:
            assessed = self.assessed_map(rubric)

        earned = 0.0
        weight_used = 0.0
        for key in self.COMPONENTS:
            weight = rubric.get(key) or 0
            if weight <= 0 or not assessed.get(key):
                continue
            score = self.component_score(key)
            if score is None:
                # Ticked but no mark recorded: nothing to add, nothing to divide by.
                continue
            earned += float(score) * weight
            weight_used += weight

        if weight_used <= 0:
            # No graded component: there is no mark. Never invent a zero.
            self.final_grade = None
            return self.final_grade

        final = earned / weight_used
        self.final_grade = max(0, round(final - (self.hint_deduction or 0), 2))
        return self.final_grade

    def assessed_weight(self, rubric):
        """Total rubric weight (out of 100) that currently has a mark."""
        assessed = self.assessed_map(rubric)
        return sum(
            (rubric.get(k) or 0)
            for k in self.COMPONENTS
            if (rubric.get(k) or 0) > 0 and assessed.get(k) and self.component_score(k) is not None
        )

    def to_dict(self):
        return {
            'id': self.id,
            'experiment_id': self.experiment_id,
            'exam_id': getattr(self, 'exam_id', None),
            'auto_grade': self.auto_grade,
            'manual_grade': self.manual_grade,
            'manual_feedback': self.manual_feedback,
            'viva_grade': self.viva_grade,
            'quiz_grade': self.quiz_grade,
            'code_quality_grade': self.code_quality_grade,
            'hint_deduction': self.hint_deduction,
            'final_grade': self.final_grade,
            'graded_at': self.graded_at.isoformat() if self.graded_at else None,
            'is_locked': self.is_locked,
            'assessed_components': self.assessed_components or {},
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
    __table_args__ = (
        # hint_effectiveness grouping by experiment + student
        db.Index('ix_hint_logs_experiment_student', 'experiment_id', 'student_id'),
    )
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
    __table_args__ = (
        # /vivas order-by
        db.Index('ix_viva_sessions_experiment_created', 'experiment_id', 'created_at'),
    )
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
