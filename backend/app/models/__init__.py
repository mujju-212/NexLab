"""
SQLAlchemy Models — import all here so Flask-Migrate sees them
"""
from app.models.user import User
from app.models.institution import Institution, PlatformConfig
from app.models.academic import (
    AcademicYear, Batch, Department, Section, SectionStudent, SectionSubject, AuditLog,
)
from app.models.subject import Subject, EnvironmentProfile
from app.models.experiment import (
    Experiment, TestCase, ContentModule, ContentPage, ContentProgress, QuizQuestion,
)
from app.models.session import LabSession, SessionAttendance
from app.models.exam import Exam, ExamQuestion, ExamAttempt
from app.models.submission import CodeVersion, CodeAttempt
from app.models.grading import Grade, InlineComment, VivaSession, VivaAnswer, HintLog
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore, ExperimentConcept, ConceptPrereq
from app.models.feedback import SessionFeedback, SessionFeedbackReceipt, PlagiarismFlag, Notification
from app.models.free import FreeCourse, FreeExercise, FreeProgress
from app.models.otp import EmailOTP
from app.models.ai_usage import AIUsageLog, AIPolicy, AIAgentRun
from app.models.proctor_event import ProctorEvent
from app.models.scheduled_announcement import ScheduledAnnouncement
from app.models.intervention import Intervention, Extension
from app.models.enhancements import BankQuestion, TeacherNote, SessionPoll
from app.models.free_extra import (
    ProblemBookmark, PlaygroundSession, ProblemCollection,
    CollectionItem, CodingContest, ContestParticipant,
)
from app.models.practice import (
    Problem, PracticeTestCase, PracticeSubmission,
    StudyPlan, StudyPlanSection, StudyPlanProgress,
    StudentXP, StudentBadge, PlatformRating, PlatformRatingPeriod,
    StudentQuestClaim,
)
from app.models.conductor import (
    Checkpoint, CheckpointProgress,
    LivePageState, ProctorPolicy,
    SessionModeTransition, ChatMessage,
    TestCaseResult, Report, InstructorSettings,
)
from app.models.planner import RecurringPlan
from app.models.announcement import Announcement, AnnouncementInteraction
from app.models.billing import Invoice, PaymentMethod
from app.models.help import FAQArticle, SupportTicket
from app.models.ai_governance import AIUserQuota, AIFeatureConfig, SecurityEvent, ComplianceSetting
from app.models.admin_copilot import (
    AdminChatSession, AdminChatMessage, InstitutionDocument,
    AIGeneratedDocument, AIConversation, AIMessage,
)
from app.models.ai_documents import DocumentChunk
from app.models.analytics_config import AnalyticsConfig
from app.models.analytics_snapshot import StudentMetricSnapshot, InstitutionDailyKPI
from app.models.analytics_rank import RankSnapshot

__all__ = [
    'User', 'Institution', 'PlatformConfig',
    'AcademicYear', 'Batch', 'Department', 'Section', 'SectionStudent', 'SectionSubject', 'AuditLog',
    'Subject', 'EnvironmentProfile',
    'Experiment', 'TestCase', 'ContentModule', 'QuizQuestion', 'ContentPage', 'ContentProgress',
    'LabSession', 'SessionAttendance',
    'Exam', 'ExamQuestion', 'ExamAttempt',
    'CodeVersion', 'CodeAttempt',
    'Grade', 'InlineComment', 'VivaSession', 'VivaAnswer', 'HintLog',
    'ConceptMastery', 'StudentRanking', 'FocusScore',
    'SessionFeedback', 'SessionFeedbackReceipt', 'PlagiarismFlag', 'Notification',
    'FreeCourse', 'FreeExercise', 'FreeProgress',
    'EmailOTP',
    'AIUsageLog', 'AIPolicy', 'AIAgentRun',
    'ProctorEvent',
    'ScheduledAnnouncement',
    'Announcement', 'AnnouncementInteraction',
    'Intervention', 'Extension',
    'BankQuestion', 'TeacherNote', 'SessionPoll',
    'ProblemBookmark', 'PlaygroundSession', 'ProblemCollection',
    'CollectionItem', 'CodingContest', 'ContestParticipant',
    # Practice Library
    'Problem', 'PracticeTestCase', 'PracticeSubmission',
    'StudyPlan', 'StudyPlanSection', 'StudyPlanProgress',
    'StudentXP', 'StudentBadge', 'PlatformRating', 'PlatformRatingPeriod',
    'StudentQuestClaim',
    # Conductor / SPARK / analytics / settings
    'Checkpoint', 'CheckpointProgress',
    'LivePageState', 'ProctorPolicy',
    'SessionModeTransition', 'ChatMessage',
    'TestCaseResult', 'Report', 'InstructorSettings',
    'RecurringPlan',
    'Invoice', 'PaymentMethod',
    'FAQArticle', 'SupportTicket',
    'AIUserQuota', 'AIFeatureConfig', 'SecurityEvent', 'ComplianceSetting',
    'AdminChatSession', 'AdminChatMessage', 'InstitutionDocument',
    'DocumentChunk',
    'AIGeneratedDocument', 'AIConversation', 'AIMessage',
    'AnalyticsConfig', 'StudentMetricSnapshot', 'InstitutionDailyKPI',
    'RankSnapshot', 'ExperimentConcept', 'ConceptPrereq',
]
