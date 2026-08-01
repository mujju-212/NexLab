"""
SQLAlchemy Models — import all here so Flask-Migrate sees them
"""
from app.models.user import User
from app.models.institution import Institution
from app.models.academic import AcademicYear, Batch, Section, SectionStudent, SectionSubject
from app.models.subject import Subject, EnvironmentProfile
from app.models.experiment import Experiment, TestCase, ContentModule, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeVersion, CodeAttempt
from app.models.grading import Grade, InlineComment, VivaSession, VivaAnswer, HintLog
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.models.feedback import SessionFeedback, PlagiarismFlag

__all__ = [
    'User', 'Institution',
    'AcademicYear', 'Batch', 'Section', 'SectionStudent', 'SectionSubject',
    'Subject', 'EnvironmentProfile',
    'Experiment', 'TestCase', 'ContentModule', 'QuizQuestion',
    'LabSession', 'SessionAttendance',
    'CodeVersion', 'CodeAttempt',
    'Grade', 'InlineComment', 'VivaSession', 'VivaAnswer', 'HintLog',
    'ConceptMastery', 'StudentRanking', 'FocusScore',
    'SessionFeedback', 'PlagiarismFlag',
]
