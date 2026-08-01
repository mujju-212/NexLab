import uuid
from datetime import datetime
from app.extensions import db


class CodeVersion(db.Model):
    """Every auto-save and on-run save — versioned for code replay"""
    __tablename__ = 'code_versions'
    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id      = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    experiment_id   = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    session_id      = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'))

    version_number  = db.Column(db.Integer, nullable=False)
    # Multi-file: files stored as JSON {"main.py": "code...", "utils.py": "code..."}
    # Single-file: files = {"main": "code..."}
    files           = db.Column(db.JSON, nullable=False)
    is_full_snapshot = db.Column(db.Boolean, default=True)   # True for v1 and every 10th
    diff_from_prev  = db.Column(db.Text)                     # unified diff (None for snapshots)

    saved_at        = db.Column(db.DateTime, default=datetime.utcnow)
    save_type       = db.Column(db.String(15))  # auto | on_run | on_submit


class CodeAttempt(db.Model):
    """Every Judge0 execution — all attempts, not just final"""
    __tablename__ = 'code_attempts'
    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id          = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    experiment_id       = db.Column(db.String(36), db.ForeignKey('experiments.id'), nullable=False)
    session_id          = db.Column(db.String(36), db.ForeignKey('lab_sessions.id'))

    attempt_number      = db.Column(db.Integer, nullable=False)
    language            = db.Column(db.String(10), nullable=False)  # python | cpp | c | java
    files               = db.Column(db.JSON, nullable=False)        # multi-file support
    stdin               = db.Column(db.Text)

    compile_status      = db.Column(db.String(20))  # success | compile_error | runtime_error | timeout
    compile_output      = db.Column(db.Text)
    stdout              = db.Column(db.Text)
    stderr              = db.Column(db.Text)

    test_cases_passed   = db.Column(db.Integer, default=0)
    test_cases_total    = db.Column(db.Integer, default=0)
    execution_time_ms   = db.Column(db.Integer)
    memory_used_kb      = db.Column(db.Integer)

    # Code quality metrics (from radon — populated on final submission)
    loc                 = db.Column(db.Integer)     # lines of code
    cyclomatic_complexity = db.Column(db.Float)
    quality_grade       = db.Column(db.String(2))   # A | B | C | D | E | F (radon grades)

    is_final_submission = db.Column(db.Boolean, default=False)
    is_catchup          = db.Column(db.Boolean, default=False)
    submitted_at        = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'attempt_number': self.attempt_number,
            'language': self.language,
            'compile_status': self.compile_status,
            'stdout': self.stdout,
            'stderr': self.stderr,
            'compile_output': self.compile_output,
            'test_cases_passed': self.test_cases_passed,
            'test_cases_total': self.test_cases_total,
            'execution_time_ms': self.execution_time_ms,
            'loc': self.loc,
            'cyclomatic_complexity': self.cyclomatic_complexity,
            'quality_grade': self.quality_grade,
            'is_final_submission': self.is_final_submission,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
        }
