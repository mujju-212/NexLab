"""
Role-Scoped Autonomous Tool Registries & Execution Engine for the NexLab AI Harness.

Engineered from a full 556-route audit of the NexLab codebase:
- Auto-Executes Creation, Setup, Authoring, Enrollment, Scheduling, Grading, and Study Tools
  immediately in the database without blocking on manual confirmation popups.
- Properly wires multi-table workflows:
  * Instructor Experiment Authoring (`build_complete_experiment_suite` & `autonomous_add_experiment_content_or_html`):
    Creates `Experiment` + `ContentPage` tabs + `ContentModule` blocks (`markdown`, `html` interactive
    simulation, `code`, `quiz` + `QuizQuestion`s, `viva`, `assign`) + writes standalone HTML simulation
    to `simulations/<exp_id>/index.html` + creates `TestCase`s & `Checkpoint`s + calls
    `publish_experiment_content(exp)` so `Experiment.published_content` is immediately live for students!
  * Institution Admin Full-Stack Setup (`autonomous_campus_setup`, `autonomous_assign_and_enroll`,
    `autonomous_schedule_sessions`): Creates `AcademicYear`, `Department`, `Batch`, `Section`, `Subject`,
    `SectionSubject`, `SectionStudent`, and `RecurringPlan` + `_generate_sessions_for_plan(plan)`!
  * Student & Platform-Learner Active Workspace (`build_personal_problem_collection`,
    `create_saved_playground_workspace`, `enroll_and_build_study_plan`): Creates real
    `ProblemCollection` + `CollectionItem`, `ProblemBookmark`, `PlaygroundSession`, and `StudyPlanProgress` rows!
  * Platform Super-Admin (`autonomous_onboard_institution`, `autonomous_create_platform_course_or_contest`):
    Creates `Institution` + initial admin `User` + `AcademicYear` + `AIPolicy` + `PlatformCourse`/`CodingContest`!
- Only gates destructive operations (`is_destructive=True`, e.g., force-logout, session cancellation,
  tenant suspension) behind confirmation cards.
"""
from app.ai.tutor_routes import save_learning_goal_tool, SAVE_GOAL_DESC
import csv
import io
import json
import logging
import os
import re
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, date

from flask import current_app, g
from sqlalchemy import func, or_, desc
from werkzeug.security import generate_password_hash

from app.extensions import db, socketio
from app.models.user import User
from app.models.institution import Institution, PlatformConfig, AuditLog
from app.models.academic import AcademicYear, Department, Batch, Section, SectionStudent, SectionSubject
from app.models.subject import Subject
from app.models.experiment import Experiment, TestCase, ContentModule, ContentPage, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.exam import Exam, ExamQuestion, ExamAttempt
from app.models.submission import CodeVersion, CodeAttempt
from app.models.grading import Grade, HintLog, VivaSession
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.models.feedback import PlagiarismFlag, Notification
from app.models.conductor import Checkpoint, CheckpointProgress, LivePageState, SessionModeTransition
from app.models.enhancements import SessionPoll, BankQuestion, TeacherNote
from app.models.intervention import Intervention, Extension
from app.models.planner import RecurringPlan
from app.models.announcement import Announcement
from app.models.proctor_event import ProctorEvent
from app.models.ai_governance import AIUserQuota, SecurityEvent, ComplianceSetting
from app.models.practice import Problem, PracticeTestCase, PracticeSubmission, StudyPlan, StudyPlanProgress, StudentXP
from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
from app.models.practice_extras import ProblemBookmark, PlaygroundSession, ProblemCollection, CollectionItem, CodingContest
from app.models.ai_usage import AIUsageLog, AIPolicy
from app.models.admin_copilot import AIGeneratedDocument
from app.services.content_publish import publish_experiment_content
from app.ai.sorting_suite_builder import (
    SORTING_ALGORITHMS,
    get_sorting_spec,
    generate_sorting_simulation_html,
)
from app.ai.gate import guarded_ai_call
from app.ai.agent import (
    AgentToolError,
    _call_view,
    _resolve,
    TOOLS as ADMIN_LEGACY_TOOLS,
    CONFIRM_TOOLS as ADMIN_LEGACY_CONFIRM_TOOLS,
    execute_copilot_action as execute_legacy_admin_action,
)

log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# Helper: On-Demand Document Persistence (.md, .csv, .xlsx)
# ══════════════════════════════════════════════════════════════════════════════

def save_generated_document(title: str, fmt: str, content_text: str = None,
                            rows: list = None, headers: list = None,
                            conversation_id: str = None) -> dict:
    """
    Persists an AI-generated document (study sheet, cheat sheet, study plan, or report)
    to disk and records an AIGeneratedDocument row so the user can download it.
    """
    uid = getattr(g, 'user_id', None)
    iid = getattr(g, 'institution_id', None)
    fmt = (fmt or 'md').lower().strip('.')
    if fmt not in ('md', 'csv', 'xlsx', 'txt'):
        fmt = 'md'

    doc_id = str(uuid.uuid4())
    safe_slug = "".join(c if c.isalnum() or c in ('-', '_') else '_' for c in (title or 'nexlab_document'))[:60]
    filename = f"{safe_slug}_{doc_id[:8]}.{fmt}"

    out_dir = os.path.join(current_app.root_path, '..', 'uploads', 'generated_docs')
    os.makedirs(out_dir, exist_ok=True)
    file_path = os.path.join(out_dir, filename)

    if fmt == 'csv' and rows is not None:
        buf = io.StringIO()
        writer = csv.writer(buf)
        if headers:
            writer.writerow(headers)
        for r in rows:
            writer.writerow(r if isinstance(r, (list, tuple)) else [r])
        raw_bytes = buf.getvalue().encode('utf-8')
        with open(file_path, 'wb') as f:
            f.write(raw_bytes)
        content_text = buf.getvalue()
    elif fmt == 'xlsx' and rows is not None:
        try:
            import openpyxl
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = (title or 'Report')[:31]
            if headers:
                ws.append(headers)
            for r in rows:
                ws.append(list(r) if isinstance(r, (list, tuple)) else [str(r)])
            wb.save(file_path)
        except Exception as exc:
            log.warning("[harness.doc] openpyxl fallback to csv: %s", exc)
            fmt = 'csv'
            filename = f"{safe_slug}_{doc_id[:8]}.csv"
            file_path = os.path.join(out_dir, filename)
            buf = io.StringIO()
            writer = csv.writer(buf)
            if headers:
                writer.writerow(headers)
            for r in (rows or []):
                writer.writerow(r if isinstance(r, (list, tuple)) else [r])
            with open(file_path, 'wb') as f:
                f.write(buf.getvalue().encode('utf-8'))
            content_text = buf.getvalue()
    else:
        text_body = content_text or f"# {title}\n\nGenerated by NexLab AI on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}.\n"
        with open(file_path, 'wb') as f:
            f.write(text_body.encode('utf-8'))
        content_text = text_body

    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
    doc_row = AIGeneratedDocument(
        id=doc_id,
        user_id=uid,
        institution_id=iid,
        conversation_id=conversation_id,
        title=title or 'Generated Document',
        format=fmt,
        file_path=file_path,
        content_text=(content_text or '')[:15000],
        file_size_bytes=file_size,
    )
    db.session.add(doc_row)
    db.session.flush()
    return doc_row.to_dict()


# ══════════════════════════════════════════════════════════════════════════════
# 1. STUDENT & PLATFORM-USER SOCRATIC + AUTONOMOUS WORKSPACE TOOLS
# ══════════════════════════════════════════════════════════════════════════════

def student_analyze_my_code(experiment_id: str = None, code: str = None,
                            language: str = None, error: str = None, **_):
    """
    Inspect the student's current lab code (from live editor context or latest saved
    CodeVersion/CodeAttempt) alongside the experiment's objective and visible constraints.
    """
    uid = g.user_id
    ctx = getattr(g, 'harness_page_context', None) or {}
    exp_id = experiment_id or ctx.get('experiment_id')
    editor_code = code or ctx.get('code') or ''
    lang = language or ctx.get('language') or 'python'
    err_text = error or ctx.get('error') or ''

    exp = Experiment.query.get(exp_id) if exp_id else None
    latest_attempt = None
    if not editor_code and exp_id:
        latest_ver = CodeVersion.query.filter_by(
            student_id=uid, experiment_id=exp_id
        ).order_by(CodeVersion.version_number.desc()).first()
        if latest_ver:
            editor_code = latest_ver.code or ''
            lang = latest_ver.language or lang

    if exp_id:
        latest_attempt = CodeAttempt.query.filter_by(
            student_id=uid, experiment_id=exp_id
        ).order_by(CodeAttempt.submitted_at.desc()).first()
    else:
        latest_attempt = CodeAttempt.query.filter_by(
            student_id=uid
        ).order_by(CodeAttempt.submitted_at.desc()).first()
        if latest_attempt and not exp:
            exp = Experiment.query.get(latest_attempt.experiment_id)
            if not editor_code:
                editor_code = latest_attempt.code or ''
                lang = latest_attempt.language or lang

    visible_tests = []
    if exp:
        sample_tcs = TestCase.query.filter_by(experiment_id=exp.id, is_hidden=False).limit(4).all()
        for tc in sample_tcs:
            visible_tests.append({
                'input': (tc.input_data or '')[:200],
                'expected_output': (tc.expected_output or '')[:200],
                'description': tc.description or '',
            })

    attempt_summary = None
    if latest_attempt:
        attempt_summary = {
            'submitted_at': latest_attempt.submitted_at.isoformat() if latest_attempt.submitted_at else None,
            'passed_count': latest_attempt.passed_count,
            'total_count': latest_attempt.total_count,
            'Compile/Runtime Error': (latest_attempt.error_message or '')[:500] if latest_attempt.error_message else None,
            'execution_time_ms': latest_attempt.execution_time_ms,
        }

    return {
        'experiment_title': exp.title if exp else 'Current Coding Workspace',
        'aim': (exp.aim or exp.problem_statement or '')[:500] if exp else '',
        'concept_tags': (exp.concept_tags or []) if exp else [],
        'language': lang,
        'code_line_count': len(editor_code.splitlines()) if editor_code else 0,
        'student_code_snippet': editor_code[-2000:] if editor_code else '(No code in editor yet)',
        'live_error_output': err_text[:600] if err_text else None,
        'latest_submission_result': attempt_summary,
        'visible_sample_test_cases': visible_tests,
        'socratic_instruction': (
            'Analyze the logic flaw, edge case, or syntax error in student_code_snippet. '
            'Ask a guiding question or point to the specific line range. NEVER write the corrected code.'
        ),
    }


def student_explain_error(error_message: str = None, language: str = 'python', **_):
    """Translate a compiler or runtime error message into plain conceptual guidance."""
    uid = g.user_id
    ctx = getattr(g, 'harness_page_context', None) or {}
    err = error_message or ctx.get('error') or ''
    lang = language or ctx.get('language') or 'python'

    if not err:
        last_att = CodeAttempt.query.filter_by(student_id=uid).order_by(CodeAttempt.submitted_at.desc()).first()
        if last_att and last_att.error_message:
            err = last_att.error_message
            lang = last_att.language or lang

    if not err:
        return {'found_error': False, 'message': 'No recent compiler or runtime error found. Paste the error message you want explained.'}

    return {
        'found_error': True,
        'language': lang,
        'raw_error': err[:1000],
        'socratic_instruction': (
            'Explain in plain language what this error type means, which line number triggered it, '
            'and what concept to check. Do not output the fixed code.'
        ),
    }


def student_get_socratic_hint(experiment_id: str = None, level: int = None, **_):
    """Retrieve a progressive 3-level Socratic hint for the current experiment."""
    uid = g.user_id
    ctx = getattr(g, 'harness_page_context', None) or {}
    exp_id = experiment_id or ctx.get('experiment_id')

    if not exp_id:
        last_att = CodeAttempt.query.filter_by(student_id=uid).order_by(CodeAttempt.submitted_at.desc()).first()
        if last_att:
            exp_id = last_att.experiment_id

    exp = Experiment.query.get(exp_id) if exp_id else None
    prior_hints = HintLog.query.filter_by(student_id=uid, experiment_id=exp_id).count() if exp_id else 0
    failed_attempts = CodeAttempt.query.filter(
        CodeAttempt.student_id == uid,
        CodeAttempt.experiment_id == exp_id,
        or_(CodeAttempt.passed_count < CodeAttempt.total_count, CodeAttempt.total_count == 0)
    ).count() if exp_id else 0

    if level in (1, 2, 3):
        target_level = int(level)
    else:
        if prior_hints == 0 and failed_attempts < 2:
            target_level = 1
        elif prior_hints == 1 or failed_attempts < 4:
            target_level = 2
        else:
            target_level = 3

    level_descriptions = {
        1: 'Level 1 (Conceptual Nudge): Name the underlying data structure, invariant, or algorithm family and ask a guiding question.',
        2: 'Level 2 (Structural Pointer): Identify the specific step, loop boundary, or condition in the student’s approach that needs rethinking.',
        3: 'Level 3 (Concrete Diagnostic): Describe a small, concrete counter-example input that breaks their current logic and trace why.',
    }

    return {
        'experiment_id': exp_id,
        'experiment_title': exp.title if exp else 'Current Lab Exercise',
        'hint_level': target_level,
        'level_guidance': level_descriptions[target_level],
        'prior_hints_used': prior_hints,
        'failed_attempts_count': failed_attempts,
        'socratic_rule': 'STRICT: Provide only the Socratic hint at this level. Zero code blocks allowed.',
    }


def student_get_my_grades(subject_name: str = None, limit: int = 20, **_):
    """Fetch the authenticated student's own lab grades, breakdown, and GPA."""
    uid = g.user_id
    q = db.session.query(Grade, Experiment, Subject).outerjoin(
        Experiment, Grade.experiment_id == Experiment.id
    ).outerjoin(
        Subject, Experiment.subject_id == Subject.id
    ).filter(Grade.student_id == uid)

    if subject_name:
        q = q.filter(Subject.name.ilike(f"%{subject_name.strip()}%"))

    rows = q.order_by(func.coalesce(Grade.graded_at, Grade.created_at).desc()).limit(min(int(limit or 20), 50)).all()
    items = []
    scores = []
    for gr, exp, subj in rows:
        fg = float(gr.final_grade) if gr.final_grade is not None else None
        if fg is not None:
            scores.append(fg)
        items.append({
            'experiment': exp.title if exp else 'Lab Session Assessment',
            'subject': subj.name if subj else 'General Lab',
            'auto_grade': round(float(gr.auto_grade), 1) if gr.auto_grade is not None else None,
            'manual_grade': round(float(gr.manual_grade), 1) if gr.manual_grade is not None else None,
            'viva_grade': round(float(gr.viva_grade), 1) if gr.viva_grade is not None else None,
            'hint_deduction': round(float(gr.hint_deduction or 0.0), 1),
            'final_grade': round(fg, 1) if fg is not None else 'Pending',
            'is_published': bool(gr.is_published),
            'graded_at': (gr.graded_at or gr.created_at).strftime('%Y-%m-%d') if (gr.graded_at or gr.created_at) else None,
        })

    avg_pct = round(sum(scores) / len(scores), 1) if scores else 0.0
    gpa_4 = round((avg_pct / 100.0) * 4.0, 2) if scores else 0.0
    return {
        'total_graded_items': len(scores),
        'average_score_pct': avg_pct,
        'estimated_gpa_4_scale': gpa_4,
        'grades': items,
    }


def student_get_my_attendance(**_):
    """Fetch the authenticated student's lab attendance summary and 75% threshold status."""
    uid = g.user_id
    records = db.session.query(SessionAttendance, LabSession).join(
        LabSession, SessionAttendance.session_id == LabSession.id
    ).filter(SessionAttendance.student_id == uid).order_by(LabSession.scheduled_at.desc()).all()

    counts = {'present': 0, 'late': 0, 'partial': 0, 'absent': 0}
    recent_sessions = []
    for att, sess in records:
        st = (att.status or 'absent').lower()
        if st in counts:
            counts[st] += 1
        else:
            counts['absent'] += 1
        if len(recent_sessions) < 10:
            recent_sessions.append({
                'session_title': sess.title or 'Lab Session',
                'date': sess.scheduled_at.strftime('%Y-%m-%d') if sess.scheduled_at else None,
                'status': att.status,
                'minutes_attended': round((att.total_time_seconds or 0) / 60, 1),
            })

    total = len(records)
    attended = counts['present'] + counts['late'] + counts['partial']
    rate_pct = round((attended / total) * 100.0, 1) if total > 0 else 100.0
    sessions_needed_for_75 = max(0, (3 * total) - (4 * attended)) if (total > 0 and rate_pct < 75.0) else 0

    return {
        'total_sessions': total,
        'attended_sessions': attended,
        'attendance_rate_pct': rate_pct,
        'breakdown': counts,
        'meets_75_pct_threshold': rate_pct >= 75.0,
        'consecutive_sessions_needed_for_75_pct': sessions_needed_for_75,
        'recent_sessions': recent_sessions,
    }


def student_get_my_spark_and_skills(**_):
    """Fetch the student's SPARK 5D behavioral score, class rank, and weak/strong concepts."""
    uid = g.user_id
    ranking = StudentRanking.query.filter_by(student_id=uid).order_by(StudentRanking.updated_at.desc()).first()
    masteries = ConceptMastery.query.filter_by(student_id=uid).order_by(ConceptMastery.mastery_score.asc()).all()

    weak_concepts = [
        {'concept': m.concept, 'mastery_pct': round(float(m.mastery_score or 0), 1), 'attempts': m.attempts_count}
        for m in masteries if float(m.mastery_score or 0) < 65.0
    ][:6]
    strong_concepts = [
        {'concept': m.concept, 'mastery_pct': round(float(m.mastery_score or 0), 1), 'attempts': m.attempts_count}
        for m in reversed(masteries) if float(m.mastery_score or 0) >= 65.0
    ][:6]

    if not weak_concepts and not strong_concepts:
        subs = db.session.query(
            Problem.nexlab_topic,
            func.count(PracticeSubmission.id).label('total'),
            func.sum(db.case((PracticeSubmission.status == 'Accepted', 1), else_=0)).label('accepted')
        ).join(Problem, PracticeSubmission.problem_id == Problem.id).filter(
            PracticeSubmission.student_id == uid
        ).group_by(Problem.nexlab_topic).all()
        for topic, tot, acc in subs:
            pct = round((int(acc or 0) / max(int(tot or 1), 1)) * 100.0, 1)
            entry = {'concept': topic, 'mastery_pct': pct, 'attempts': int(tot or 0)}
            if pct < 60.0:
                weak_concepts.append(entry)
            else:
                strong_concepts.append(entry)

    return {
        'spark_profile': {
            'overall_score': round(float(ranking.overall_score or 0), 1) if ranking else None,
            'consistency_score': round(float(ranking.consistency_score or 0), 1) if ranking else None,
            'efficiency_score': round(float(ranking.code_quality_score or 0), 1) if ranking else None,
            'rank_in_section': ranking.rank_in_section if ranking else None,
            'total_in_section': ranking.total_in_section if ranking else None,
            'percentile': round(float(ranking.percentile or 0), 1) if ranking else None,
        },
        'weak_concepts_needing_practice': weak_concepts,
        'strong_concepts': strong_concepts,
    }


def student_get_upcoming_sessions_and_exams(**_):
    """List upcoming scheduled LabSessions, active Extensions, and open/upcoming Exams."""
    uid = g.user_id
    sec_ids = [r.section_id for r in SectionStudent.query.filter_by(student_id=uid).all()]
    ss_rows = SectionSubject.query.filter(SectionSubject.section_id.in_(sec_ids)).all() if sec_ids else []
    ss_ids = [ss.id for ss in ss_rows]
    subj_ids = list({ss.subject_id for ss in ss_rows if ss.subject_id})

    now = datetime.utcnow()
    upcoming_sessions = []
    if ss_ids:
        sessions = LabSession.query.filter(
            LabSession.section_subject_id.in_(ss_ids),
            LabSession.status.in_(['scheduled', 'active']),
        ).order_by(LabSession.scheduled_at.asc()).limit(10).all()
        for s in sessions:
            upcoming_sessions.append({
                'session_id': s.id,
                'title': s.title or 'Lab Session',
                'status': s.status,
                'scheduled_at': s.scheduled_at.strftime('%Y-%m-%d %H:%M UTC') if s.scheduled_at else None,
                'duration_minutes': s.duration_minutes,
            })

    upcoming_exams = []
    if subj_ids:
        exams = Exam.query.filter(
            Exam.subject_id.in_(subj_ids),
            Exam.is_published == True,
        ).order_by(Exam.created_at.desc()).limit(10).all()
        for ex in exams:
            state = ex.window_state(now)
            if state in ('open', 'upcoming'):
                upcoming_exams.append({
                    'exam_id': ex.id,
                    'title': ex.title,
                    'exam_type': ex.exam_type,
                    'window_state': state,
                    'duration_minutes': ex.duration_minutes,
                    'due_at': ex.due_at.strftime('%Y-%m-%d %H:%M UTC') if ex.due_at else 'No hard deadline',
                })

    extensions = Extension.query.filter(
        Extension.student_id == uid,
        Extension.extension_until >= now,
    ).all()

    return {
        'upcoming_or_active_sessions': upcoming_sessions,
        'open_or_upcoming_exams': upcoming_exams,
        'active_deadline_extensions': [e.to_dict() for e in extensions],
    }


def student_recommend_next_problem(topic: str = None, difficulty: str = None, limit: int = 4, **_):
    """Recommend personalized coding problems from the NexLab Practice Library."""
    uid = g.user_id
    solved_ids = [
        r[0] for r in db.session.query(PracticeSubmission.problem_id).filter_by(
            student_id=uid, status='Accepted'
        ).distinct().all()
    ]

    target_topic = topic
    if not target_topic:
        weak_m = ConceptMastery.query.filter_by(student_id=uid).order_by(ConceptMastery.mastery_score.asc()).first()
        if weak_m:
            target_topic = weak_m.concept

    q = Problem.query.filter(Problem.is_active == True)
    if solved_ids:
        q = q.filter(~Problem.id.in_(solved_ids))
    if target_topic:
        q = q.filter(or_(
            Problem.nexlab_topic.ilike(f"%{target_topic}%"),
            Problem.title.ilike(f"%{target_topic}%")
        ))
    if difficulty and difficulty.capitalize() in ('Easy', 'Medium', 'Hard'):
        q = q.filter(Problem.difficulty == difficulty.capitalize())

    problems = q.order_by(Problem.acceptance.desc()).limit(min(int(limit or 4), 8)).all()
    if not problems:
        q2 = Problem.query.filter(Problem.is_active == True)
        if solved_ids:
            q2 = q2.filter(~Problem.id.in_(solved_ids))
        problems = q2.order_by(Problem.acceptance.desc()).limit(min(int(limit or 4), 8)).all()

    return {
        'target_skill_focus': target_topic or 'Core Algorithms & Data Structures',
        'solved_problems_count': len(solved_ids),
        'recommended_problems': [
            {
                'id': p.id,
                'slug': p.slug,
                'title': p.title,
                'difficulty': p.difficulty,
                'topic': p.nexlab_topic,
                'url': f"/student/practice/{p.slug}" if getattr(g, 'role', '') == 'student' else f"/practice/library/{p.slug}",
            }
            for p in problems
        ],
    }


def build_personal_problem_collection(collection_title: str = None, topic: str = None,
                                      difficulty: str = None, count: int = 5,
                                      bookmark_with_notes: bool = True, **_):
    """
    [AUTONOMOUS WORKSPACE ACTION — Student & Platform User]
    Automatically creates a persistent `ProblemCollection` playlist (`problem_collections` +
    `collection_items`) and `ProblemBookmark` study notes in the user's account targeted
    at their weak concepts or requested topic, so it appears immediately in their Practice Library UI!
    """
    uid = g.user_id
    recs = student_recommend_next_problem(topic=topic, difficulty=difficulty, limit=max(3, min(int(count or 5), 10)))
    problems_list = recs.get('recommended_problems') or []
    focus = topic or recs.get('target_skill_focus') or 'Algorithmic Mastery'
    title = (collection_title or f"AI Custom Playlist: {focus}").strip()[:180]

    coll = ProblemCollection(
        user_id=uid,
        title=title,
        description=f"Auto-curated by NexLab AI Harness for {focus} ({len(problems_list)} problems).",
    )
    db.session.add(coll)
    db.session.flush()

    added_problems = []
    for idx, p_item in enumerate(problems_list):
        pid = p_item.get('id')
        if not pid:
            p_obj = Problem.query.filter_by(slug=p_item.get('slug')).first()
            pid = p_obj.id if p_obj else None
        if not pid:
            continue

        db.session.add(CollectionItem(
            collection_id=coll.id,
            problem_id=pid,
            order_index=idx,
        ))
        if bookmark_with_notes and not ProblemBookmark.query.filter_by(user_id=uid, problem_id=pid).first():
            db.session.add(ProblemBookmark(
                user_id=uid,
                problem_id=pid,
                note=f"Focus on {p_item.get('topic', focus)} invariants & edge cases ({p_item.get('difficulty')}).",
            ))
        added_problems.append({
            'title': p_item.get('title'),
            'slug': p_item.get('slug'),
            'difficulty': p_item.get('difficulty'),
            'topic': p_item.get('topic'),
            'url': p_item.get('url'),
        })

    db.session.commit()
    return {
        'success': True,
        'collection_id': coll.id,
        'collection_title': coll.title,
        'problems_added_count': len(added_problems),
        'problems': added_problems,
        'bookmarked_with_notes': bool(bookmark_with_notes),
        'message': f"Created playlist '{coll.title}' with {len(added_problems)} problems and bookmarked them in your Practice Library.",
    }


def create_saved_playground_workspace(title: str = None, topic_or_pattern: str = 'Two Pointers & Sliding Window',
                                      language: str = 'python', share_publicly: bool = True, **_):
    """
    [AUTONOMOUS WORKSPACE ACTION — Student & Platform User]
    Creates a saved `PlaygroundSession` in the user's account pre-loaded with a Socratic
    starter template (skeleton + dry-run test harness + sample stdin, never spoiling exam answers)
    so the user can open and run it immediately in the Playground / Compiler UI.
    """
    uid = g.user_id
    lang = (language or 'python').lower().strip()
    sess_title = (title or f"AI Practice Workspace: {topic_or_pattern}").strip()[:180]

    starter_templates = {
        'python': (
            f"# NexLab AI Practice Workspace: {topic_or_pattern}\n"
            "# Complete the core invariant below and run with the sample stdin.\n"
            "import sys\n\n"
            "def solve(lines):\n"
            "    # Step 1: Parse input\n"
            "    data = [x.strip() for x in lines if x.strip()]\n"
            "    # Step 2: Apply your algorithm pattern here\n"
            "    return f'Parsed {len(data)} input lines for {topic_or_pattern}'\n\n"
            "if __name__ == '__main__':\n"
            "    inp = sys.stdin.read().splitlines()\n"
            "    print(solve(inp))\n"
        ),
        'cpp': (
            f"// NexLab AI Practice Workspace: {topic_or_pattern}\n"
            "#include <iostream>\n#include <vector>\nusing namespace std;\n\n"
            "int main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n"
            "    int n;\n    if (cin >> n) {\n        cout << \"Read n = \" << n << \"\\n\";\n    }\n"
            "    return 0;\n}\n"
        ),
        'java': (
            f"// NexLab AI Practice Workspace: {topic_or_pattern}\n"
            "import java.util.*;\npublic class Main {\n"
            "    public static void main(String[] args) {\n"
            "        Scanner sc = new Scanner(System.in);\n"
            "        if (sc.hasNextInt()) {\n"
            "            System.out.println(\"Read n = \" + sc.nextInt());\n"
            "        }\n    }\n}\n"
        ),
    }
    code_body = starter_templates.get(lang, starter_templates['python'])
    row = PlaygroundSession(
        user_id=uid,
        title=sess_title,
        language=lang,
        code=code_body,
        stdin_data="5\n10 20 30 40 50\n",
        is_shared=bool(share_publicly),
        share_slug=PlaygroundSession.new_slug() if share_publicly else None,
    )
    db.session.add(row)
    db.session.commit()

    return {
        'success': True,
        'playground_session_id': row.id,
        'title': row.title,
        'language': row.language,
        'share_url': f"/u/playground/{row.share_slug}" if row.share_slug else None,
        'message': f"Saved Playground session '{row.title}' ({row.language}) to your workspace.",
    }


def enroll_and_build_study_plan(plan_name_or_goal: str = 'Data Structures & Algorithms Mastery',
                                days: int = 7, **_):
    """
    [AUTONOMOUS WORKSPACE ACTION — Student & Platform User]
    Enrolls the user in a matching `StudyPlan` (`StudyPlanProgress` in DB), creates a custom
    `ProblemCollection` playlist for Day 1–N problems, and generates a downloadable `.md` study plan!
    """
    uid = g.user_id
    q_str = (plan_name_or_goal or '').strip()
    plan = StudyPlan.query.filter(
        or_(StudyPlan.title.ilike(f"%{q_str}%"), StudyPlan.slug.ilike(f"%{q_str}%"))
    ).first() if q_str else None
    if not plan:
        plan = StudyPlan.query.first()

    enrolled_plan_title = None
    if plan:
        prog = StudyPlanProgress.query.filter_by(student_id=uid, plan_id=plan.id).first()
        if not prog:
            prog = StudyPlanProgress(student_id=uid, plan_id=plan.id, solved_slugs=[])
            db.session.add(prog)
            db.session.commit()
        enrolled_plan_title = plan.title

    playlist = build_personal_problem_collection(
        collection_title=f"{days}-Day Roadmap Playlist: {plan_name_or_goal[:40]}",
        topic=plan_name_or_goal if len(plan_name_or_goal) < 25 else None,
        count=min(int(days or 7), 8),
    )
    doc_res = platform_generate_study_plan(target_goal=plan_name_or_goal, days=days)

    return {
        'success': True,
        'enrolled_study_plan': enrolled_plan_title,
        'created_collection': playlist.get('collection_title'),
        'problems_in_playlist': playlist.get('problems'),
        'generated_document': doc_res.get('generated_document'),
        'message': (
            f"Enrolled you in '{enrolled_plan_title or plan_name_or_goal}', created playlist "
            f"'{playlist.get('collection_title')}', and generated your downloadable {days}-day roadmap."
        ),
    }


def student_generate_study_sheet(topic_or_subject: str = None, include_flashcards: bool = True, **_):
    """Generate a downloadable Markdown (.md) revision study sheet and viva preparation guide."""
    uid = g.user_id
    u = User.query.get(uid)
    skills = student_get_my_spark_and_skills()
    grades = student_get_my_grades(subject_name=topic_or_subject, limit=8)

    focus_title = (topic_or_subject or 'Lab Revision & Viva Prep Guide').strip()
    weak_list = skills.get('weak_concepts_needing_practice') or []
    weak_names = ', '.join(w['concept'] for w in weak_list) or 'Core Data Structures, Boundary Conditions & Time Complexity'

    lines = [
        f"# {focus_title} — Personalized Study & Viva Sheet",
        f"**Prepared for:** {u.full_name if u else 'Student'} | **Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "## 1. Priority Focus Areas (From Your Lab Telemetry)",
        f"- **Target Concepts to Reinforce:** {weak_names}",
        f"- **Current Lab Average:** {grades.get('average_score_pct', 0)}% (GPA: {grades.get('estimated_gpa_4_scale', 0)} / 4.00)",
        "",
        "## 2. Recent Experiment Performance & Review Checklist",
    ]
    for g_item in (grades.get('grades') or [])[:6]:
        lines.append(
            f"- **{g_item['experiment']}** ({g_item['subject']}): Final Score **{g_item['final_grade']}** "
            f"(Auto: {g_item['auto_grade']}, Viva: {g_item['viva_grade']})"
        )

    lines.extend([
        "",
        "## 3. Core Algorithmic Invariants & Viva Preparation Questions",
        "1. **Time & Space Complexity:** For every loop or recursive call in your lab submission, be ready to state the worst-case Big-O time and auxiliary space complexity.",
        "2. **Edge-Case Defense:** Always test your code against empty inputs (`n = 0`), single-element inputs (`n = 1`), duplicate values, and maximum constraint bounds.",
        "3. **Dry-Run Trace:** Practice tracing a 4-element input step-by-step showing how variables mutate on each iteration.",
    ])

    if include_flashcards:
        lines.extend([
            "",
            "## 4. Self-Test Concept Flashcards",
            "- **Q1:** What happens if a recursive function lacks a reachable base case? -> **A:** Stack overflow (`RecursionError` in Python / `SIGSEGV` in C/C++) due to unbounded call-stack frames.",
            "- **Q2:** Why does an off-by-one error occur in 0-indexed arrays? -> **A:** Iterating up to `<= n` instead of `< n` accesses index `n`, which is outside valid indices `0..n-1`.",
            "- **Q3:** When should you prefer a Hash Map / Dictionary over a nested loop? -> **A:** When looking up complements or frequencies can reduce $O(N^2)$ search time to $O(N)$ average time.",
        ])

    md_text = "\n".join(lines)
    doc_meta = save_generated_document(
        title=f"Study_Sheet_{focus_title[:40]}",
        fmt='md',
        content_text=md_text,
    )
    return {
        'generated_document': doc_meta,
        'summary': f"Generated personalized study sheet '{doc_meta['title']}' covering {weak_names}.",
    }


def platform_get_my_practice_stats(**_):
    """Get the self-learner's complete practice problem statistics, XP, and PlatformCourse progress."""
    uid = g.user_id
    subs = PracticeSubmission.query.filter_by(student_id=uid, is_run=False).order_by(PracticeSubmission.submitted_at.desc()).all()
    solved_problem_ids = {s.problem_id for s in subs if s.status == 'Accepted'}
    solved_problems = Problem.query.filter(Problem.id.in_(list(solved_problem_ids))).all() if solved_problem_ids else []

    by_diff = {'Easy': 0, 'Medium': 0, 'Hard': 0}
    by_topic = defaultdict(lambda: {'solved': 0, 'attempts': 0})
    for p in solved_problems:
        d = (p.difficulty or 'Easy').capitalize()
        by_diff[d] = by_diff.get(d, 0) + 1
        by_topic[p.nexlab_topic or 'General']['solved'] += 1

    problem_map = {p.id: p for p in Problem.query.filter(Problem.id.in_(list({s.problem_id for s in subs}))).all()} if subs else {}
    for s in subs:
        p = problem_map.get(s.problem_id)
        t_name = p.nexlab_topic if p else 'General'
        by_topic[t_name]['attempts'] += 1

    platform_prog = PlatformProgress.query.filter_by(user_id=uid).all()
    exercises_solved = sum(1 for fp in platform_prog if fp.status == 'solved')
    total_xp = sum(int(fp.xp_earned or 0) for fp in platform_prog) + sum(int(s.xp_earned or 0) for s in subs)

    topic_summary = [
        {
            'topic': k,
            'solved': v['solved'],
            'attempts': v['attempts'],
            'accuracy_pct': round((v['solved'] / max(v['attempts'], 1)) * 100.0, 1),
        }
        for k, v in by_topic.items()
    ]
    topic_summary.sort(key=lambda x: x['accuracy_pct'])

    return {
        'total_submissions': len(subs),
        'unique_problems_solved': len(solved_problem_ids),
        'solved_by_difficulty': by_diff,
        'course_exercises_solved': exercises_solved,
        'total_xp_earned': total_xp,
        'weakest_topics': topic_summary[:5],
        'strongest_topics': list(reversed(topic_summary))[:5],
    }


def platform_analyze_practice_code(problem_slug: str = None, code: str = None,
                               language: str = None, error: str = None, **_):
    """Analyze the self-learner's practice code or latest PracticeSubmission using Socratic guidance."""
    uid = g.user_id
    ctx = getattr(g, 'harness_page_context', None) or {}
    slug = problem_slug or ctx.get('problem_slug') or ctx.get('slug')
    editor_code = code or ctx.get('code') or ''
    lang = language or ctx.get('language') or 'python'
    err = error or ctx.get('error') or ''

    prob = Problem.query.filter(or_(Problem.slug == slug, Problem.id == slug)).first() if slug else None
    last_sub = None
    if prob:
        last_sub = PracticeSubmission.query.filter_by(
            student_id=uid, problem_id=prob.id
        ).order_by(PracticeSubmission.submitted_at.desc()).first()
    else:
        last_sub = PracticeSubmission.query.filter_by(
            student_id=uid
        ).order_by(PracticeSubmission.submitted_at.desc()).first()
        if last_sub:
            prob = Problem.query.get(last_sub.problem_id)

    if last_sub and not editor_code:
        editor_code = last_sub.code or ''
        lang = last_sub.language or lang

    return {
        'problem_title': prob.title if prob else 'Practice Workspace',
        'difficulty': prob.difficulty if prob else 'Medium',
        'topic': prob.nexlab_topic if prob else 'Algorithms',
        'constraints': (prob.constraints or []) if prob else [],
        'language': lang,
        'code_snippet': editor_code[-2000:] if editor_code else '(No code provided yet)',
        'latest_submission_status': last_sub.status if last_sub else None,
        'passed_cases': f"{last_sub.passed}/{last_sub.total}" if last_sub else None,
        'error_output': err[:600] if err else None,
        'socratic_instruction': (
            'Provide a Socratic hint or complexity critique for this practice problem. '
            'Never output the complete solution code.'
        ),
    }


def platform_generate_study_plan(target_goal: str = 'Data Structures & Algorithms Mastery',
                             days: int = 7, **_):
    """Generate a personalized multi-day coding study plan (.md)."""
    stats = platform_get_my_practice_stats()
    recs = student_recommend_next_problem(limit=8)
    days = max(3, min(int(days or 7), 30))

    weak_topics = [t['topic'] for t in (stats.get('weakest_topics') or [])] or ['Arrays & Hashing', 'Two Pointers', 'Trees', 'Dynamic Programming']
    lines = [
        f"# {days}-Day Personalized Coding Roadmap: {target_goal}",
        f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} | **Current Problems Solved:** {stats.get('unique_problems_solved', 0)}",
        "",
        "## Priority Skill Gaps Identified",
        f"- **Focus Topics:** {', '.join(weak_topics)}",
        "",
        "## Day-by-Day Action Plan",
    ]
    rec_list = recs.get('recommended_problems') or []
    for d in range(1, days + 1):
        topic_focus = weak_topics[(d - 1) % len(weak_topics)]
        prob_item = rec_list[(d - 1) % len(rec_list)] if rec_list else {'title': f'{topic_focus} Practice Problem', 'difficulty': 'Easy/Medium', 'slug': ''}
        lines.append(
            f"- **Day {d} ({topic_focus}):** Solve **{prob_item['title']}** ({prob_item['difficulty']}) "
            f"— Review time/space complexity and test boundary inputs without hints."
        )

    md_text = "\n".join(lines)
    doc_meta = save_generated_document(
        title=f"{days}_Day_Study_Plan",
        fmt='md',
        content_text=md_text,
    )
    return {
        'generated_document': doc_meta,
        'study_plan_preview': lines[:12],
    }


# ══════════════════════════════════════════════════════════════════════════════
# 2. INSTRUCTOR FULL-STACK AUTONOMOUS HARNESS TOOLS (`instructor` & `institution_admin`)
# ══════════════════════════════════════════════════════════════════════════════

def _instructor_section_subjects():
    """Return all SectionSubject rows assigned to the current instructor (or all in institution for admin)."""
    uid = g.user_id
    iid = g.institution_id
    if getattr(g, 'role', '') == 'institution_admin':
        return SectionSubject.query.filter_by(institution_id=iid).all()
    return SectionSubject.query.filter(
        SectionSubject.institution_id == iid,
        or_(
            SectionSubject.instructor_id == uid,
            SectionSubject.co_instructor_id == uid,
        )
    ).all()


def _instructor_allowed_student_ids() -> set[str]:
    ss_rows = _instructor_section_subjects()
    sec_ids = list({ss.section_id for ss in ss_rows if ss.section_id})
    if not sec_ids:
        return set()
    return {r.student_id for r in SectionStudent.query.filter(SectionStudent.section_id.in_(sec_ids)).all()}


def _build_default_interactive_html_simulation(exp_title: str, concept_str: str) -> str:
    """
    Generates a complete, self-contained interactive HTML/CSS/JS simulation matching
    the exact contract in `backend/app/instructor/simulation.py` (600x400 viewport,
    #0f0f23 dark background, #6366f1 indigo accent, interactive step/push/reset buttons).
    """
    safe_title = (exp_title or 'Algorithm Visualizer').replace('"', '&quot;')
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>{safe_title} — Interactive Lab Simulation</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif; }}
  body {{ background: #0f0f23; color: #e2e8f0; padding: 18px; display: flex; flex-direction: column; gap: 14px; min-height: 380px; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(99,102,241,0.28); padding-bottom: 10px; }}
  .title {{ font-size: 15px; font-weight: 700; color: #a5b4fc; }}
  .badge {{ font-size: 11px; padding: 3px 8px; border-radius: 99px; background: rgba(99,102,241,0.2); color: #818cf8; }}
  .controls {{ display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }}
  input {{ background: #1e1b4b; border: 1px solid #4f46e5; color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 13px; width: 140px; }}
  button {{ background: #6366f1; color: #fff; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0.15s; }}
  button:hover {{ background: #4f46e5; }}
  button.secondary {{ background: #312e81; color: #c7d2fe; }}
  .stage {{ background: #161632; border: 1px solid rgba(99,102,241,0.25); border-radius: 10px; padding: 16px; min-height: 150px; display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }}
  .node {{ min-width: 52px; height: 52px; padding: 0 12px; border-radius: 10px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(99,102,241,0.35); transition: all 0.25s ease; }}
  .node.active {{ background: linear-gradient(135deg, #10b981, #059669); transform: scale(1.1); }}
  .node span.idx {{ font-size: 9px; opacity: 0.75; font-weight: 500; }}
  .log {{ background: #090919; border-radius: 8px; padding: 10px 12px; font-family: monospace; font-size: 12px; color: #94a3b8; max-height: 90px; overflow-y: auto; }}
</style>
</head>
<body>
  <div class="header">
    <div class="title">{safe_title}</div>
    <span class="badge">Interactive Simulation · {concept_str}</span>
  </div>
  <div class="controls">
    <input id="valInput" type="text" placeholder="Enter value (e.g. 42)" value="42" />
    <button onclick="insertValue()">+ Insert / Push</button>
    <button onclick="stepSimulation()">▶ Step Trace</button>
    <button class="secondary" onclick="popValue()">- Remove / Pop</button>
    <button class="secondary" onclick="resetSim()">↺ Reset</button>
  </div>
  <div id="stage" class="stage"></div>
  <div id="logBox" class="log">Ready. Use the controls above to step through {safe_title}.</div>
<script>
  let state = [12, 25, 38, 54, 71];
  let activeIdx = -1;
  function render() {{
    const stage = document.getElementById('stage');
    if (state.length === 0) {{
      stage.innerHTML = '<div style="color:#64748b;font-size:13px;">Structure is empty. Insert a value to begin.</div>';
      return;
    }}
    stage.innerHTML = state.map((v, i) =>
      `<div class="node ${{i === activeIdx ? 'active' : ''}}"><div>${{v}}</div><span class="idx">idx ${{i}}</span></div>`
    ).join('');
  }}
  function logMsg(msg) {{
    const box = document.getElementById('logBox');
    box.innerHTML = `[Step] ${{msg}}<br/>` + box.innerHTML;
  }}
  function insertValue() {{
    const raw = document.getElementById('valInput').value.trim();
    const val = raw ? (isNaN(Number(raw)) ? raw : Number(raw)) : Math.floor(Math.random() * 90 + 10);
    state.push(val);
    activeIdx = state.length - 1;
    render();
    logMsg(`Inserted '${{val}}' at index ${{activeIdx}} (size = ${{state.length}}).`);
  }}
  function popValue() {{
    if (state.length === 0) {{ logMsg('Cannot remove from empty structure.'); return; }}
    const removed = state.pop();
    activeIdx = state.length - 1;
    render();
    logMsg(`Removed '${{removed}}' (remaining size = ${{state.length}}).`);
  }}
  function stepSimulation() {{
    if (state.length === 0) return;
    activeIdx = (activeIdx + 1) % state.length;
    render();
    logMsg(`Inspecting element at index ${{activeIdx}} -> value = ${{state[activeIdx]}}`);
  }}
  function resetSim() {{
    state = [12, 25, 38, 54, 71];
    activeIdx = -1;
    render();
    logMsg('Simulation reset to initial state.');
  }}
  render();
</script>
</body>
</html>"""


def build_complete_experiment_suite(
    title: str = None,
    subject_name: str = None,
    difficulty: str = 'medium',
    language: str = 'python',
    aim: str = None,
    problem_statement: str = None,
    custom_html_simulation: str = None,
    include_quiz: bool = True,
    include_viva: bool = True,
    include_checkpoints: bool = True,
    test_case_count: int = 5,
    pages: list = None,
    topic: str = None,
    subject: str = None,
    algorithm_pages: list = None,
    **_,
):
    """
    [AUTONOMOUS FULL-STACK EXPERIMENT BUILDER — Executes Immediately]
    Creates and publishes a complete, student-ready Experiment in one autonomous run:
    1. Creates the `Experiment` row (`exp_number`, `title`, `aim`, `theory`, `problem_statement`,
       `difficulty_level` 1–4, `concept_tags`, `allowed_languages`, rubric weights summing to 100).
    2. Synthesizes rich pre-lab Markdown theory, standalone interactive HTML/CSS/JS simulation,
       runnable code snippet, graded coding assignment, 4-option MCQ quiz questions, and viva Q&As.
    3. Saves the standalone HTML simulation to `simulations/<exp.id>/index.html` and sets
       `exp.simulation_entry = 'index.html'` + `exp.simulation_files = '["index.html"]'`.
    4. Creates `ContentPage` tabs (supports custom `pages=[{"title", "theory", "simulation_html", "code"}]`,
       or multi-algorithm suites via `algorithm_pages=["Bubble Sort", "Selection Sort", ...]`,
       or default 3 tabs: `Theory & Interactive HTML Visualizer`, `Readiness Quiz & Viva`, `Graded Coding Lab`).
    5. Inserts visible + hidden `TestCase` rows and SPARK `Checkpoint` milestones.
    6. Calls `publish_experiment_content(exp)` so `exp.published_content` is frozen and immediately live!
    """
    title = (title or topic or '').strip()
    subject_name = (subject_name or subject or '').strip()
    if not title:
        raise AgentToolError('title or topic is required to build an experiment suite')

    iid = getattr(g, 'institution_id', None) or _.get('institution_id')
    uid = getattr(g, 'user_id', None) or _.get('user_id')
    if not iid and uid:
        u_tmp = User.query.get(uid)
        if u_tmp:
            iid = u_tmp.institution_id
            g.institution_id = iid
    if not uid and iid:
        inst_u = User.query.filter_by(institution_id=iid, role='instructor').first() or User.query.filter_by(institution_id=iid).first()
        if inst_u:
            uid = inst_u.id
            g.user_id = uid

    # 1. Resolve target Subject
    ss_rows = _instructor_section_subjects()
    subj = None
    for ss in ss_rows:
        s = Subject.query.get(ss.subject_id)
        if s and (not subject_name or subject_name.lower() in s.name.lower() or (s.code and subject_name.lower() in s.code.lower())):
            subj = s
            break
    if not subj and subject_name:
        subj = Subject.query.filter(
            Subject.institution_id == iid,
            or_(Subject.name.ilike(f"%{subject_name.strip()}%"), Subject.code.ilike(f"%{subject_name.strip()}%"))
        ).first()
    if not subj:
        subj = Subject.query.filter_by(institution_id=iid).first()
    if not subj:
        # Auto-create a default Subject so the instructor is never blocked!
        dept = Department.query.filter_by(institution_id=iid).first()
        subj = Subject(
            institution_id=iid,
            department_id=dept.id if dept else None,
            name=subject_name or 'Data Structures & Algorithms Lab',
            code='CS301L',
            subject_type='Lab',
        )
        db.session.add(subj)
        db.session.flush()

    existing_count = Experiment.query.filter_by(subject_id=subj.id).count()
    diff_map = {'easy': 1, 'beginner': 1, 'medium': 2, 'intermediate': 2, 'hard': 3, 'advanced': 4}
    diff_int = diff_map.get(str(difficulty or 'medium').lower(), 2)
    lang = (language or 'python').lower().strip()
    clean_title = title.strip()
    tags = [w.lower() for w in re.findall(r'[a-zA-Z]{3,}', clean_title)[:3]] or ['algorithms', 'data-structures']

    # Auto-resolve algorithm pages if requested or if sorting topic is indicated
    is_sorting_suite = any(w in clean_title.lower() for w in ('sorting', 'sort', 'dorting')) or bool(algorithm_pages)
    if not pages and is_sorting_suite:
        algo_targets = algorithm_pages or [s['title'] for s in SORTING_ALGORITHMS]
        pages = []
        for a_item in algo_targets:
            p_name = (a_item.get('title') if isinstance(a_item, dict) else str(a_item)).strip()
            spec = get_sorting_spec(p_name)
            if spec:
                pages.append({
                    'title': spec['title'],
                    'theory': spec['theory'],
                    'simulation_html': generate_sorting_simulation_html(
                        spec['title'], spec['key'], spec['description'], spec.get('default_arr') or spec.get('default_array')
                    ),
                    'code': spec['code'],
                })
            elif isinstance(a_item, dict):
                pages.append(a_item)
            else:
                pages.append({'title': p_name})

    aim_text = (aim or f"Design, implement, and verify {clean_title} in {lang.capitalize()} with full boundary condition analysis.").strip()
    prob_text = (problem_statement or f"Write a {lang.capitalize()} program to implement {clean_title}. Read input from standard input and print the exact required result to standard output.").strip()

    # 2. Generate tailored AI content (Markdown notes, runnable code, MCQ quiz, Viva, Test cases, optional custom HTML)
    theory_md = (
        f"# {clean_title}\n\n"
        f"## 1. Learning Objective & Aim\n{aim_text}\n\n"
        f"## 2. Core Algorithmic Concept & Invariants\n"
        f"- **Primary Concepts:** `{', '.join(tags)}`\n"
        f"- Maintain clear data invariants across every iteration or recursive call.\n"
        f"- Always validate boundary inputs (`n = 0`, `n = 1`, duplicate elements, and extremal values).\n\n"
        f"## 3. Complexity Targets\n"
        f"- **Time Complexity:** Aim for optimal $O(N)$ or $O(N \\log N)$ time.\n"
        f"- **Space Complexity:** Minimize auxiliary memory overhead.\n"
    )
    runnable_code = (
        f"# Demonstration: {clean_title}\n"
        f"def demo_solution(arr):\n"
        f"    if not arr:\n"
        f"        return 0\n"
        f"    return sum(arr)\n\n"
        f"if __name__ == '__main__':\n"
        f"    sample = [10, 20, 30, 40]\n"
        f"    print('Input:', sample)\n"
        f"    print('Result:', demo_solution(sample))\n"
    )
    starter_code = (
        f"# Lab Assignment: {clean_title}\n"
        f"import sys\n\n"
        f"def solve():\n"
        f"    lines = sys.stdin.read().strip().splitlines()\n"
        f"    if not lines:\n"
        f"        return\n"
        f"    # Implement your logic for {clean_title} below\n"
        f"    print(lines[0])\n\n"
        f"if __name__ == '__main__':\n"
        f"    solve()\n"
    )
    if not custom_html_simulation and is_sorting_suite and pages and isinstance(pages[0], dict) and pages[0].get('simulation_html'):
        html_sim = pages[0]['simulation_html']
    else:
        html_sim = custom_html_simulation if (custom_html_simulation and '<html' in custom_html_simulation.lower()) else _build_default_interactive_html_simulation(clean_title, ', '.join(tags))

    quiz_items = [
        {
            'question_text': f"What is the primary invariant to maintain when implementing {clean_title}?",
            'options': [
                'Ensure state transitions preserve structure validity at every step',
                'Ignore empty and single-element inputs',
                'Use unbounded recursion without a base case',
                'Hardcode outputs for sample inputs only',
            ],
            'correct_answer': 'A',
            'explanation': 'Preserving structural invariants guarantees correctness across both sample and hidden test cases.',
        },
        {
            'question_text': f"Which boundary input is most critical to test first for {clean_title}?",
            'options': [
                'Empty collection (n = 0) and single-element collection (n = 1)',
                'Only sorted even numbers',
                'Comments and whitespace',
                'Variable naming length',
            ],
            'correct_answer': 'A',
            'explanation': 'Edge cases like n = 0 and n = 1 expose off-by-one and null/index errors immediately.',
        },
        {
            'question_text': f"Why do we analyze worst-case Big-O time complexity for {clean_title}?",
            'options': [
                'To guarantee the solution finishes within the execution time limit on large hidden inputs',
                'To make the source code file larger',
                'Because syntax errors depend on Big-O',
                'To avoid using functions',
            ],
            'correct_answer': 'A',
            'explanation': 'Hidden judge test cases test upper constraint bounds where suboptimal algorithms time out (TLE).',
        },
        {
            'question_text': "What happens if an index accesses position `len(arr)` in a 0-indexed array?",
            'options': [
                'It raises an IndexError / Out-of-Bounds error because valid indices are 0 to len(arr) - 1',
                'It automatically wraps around to index 1',
                'It returns 0 silently in all languages',
                'It sorts the array',
            ],
            'correct_answer': 'A',
            'explanation': '0-indexed arrays of length N have valid indices 0 through N-1.',
        },
    ]

    viva_items = [
        {
            'question': f"Walk through the time and space complexity of your {clean_title} implementation.",
            'expected_answer': 'State the loop/recursion depth for time complexity and auxiliary data structures for space complexity.',
            'topics': tags,
            'difficulty': diff_int,
        },
        {
            'question': f"How does your code handle empty or single-element boundary inputs in {clean_title}?",
            'expected_answer': 'Explain the early guard condition or base case at the start of the function.',
            'topics': tags,
            'difficulty': diff_int,
        },
        {
            'question': f"If the input size N increases by 10x, how will your solution's runtime scale?",
            'expected_answer': 'Relate input scaling directly to linear O(N), log-linear O(N log N), or quadratic O(N^2) behavior.',
            'topics': tags,
            'difficulty': diff_int,
        },
    ]

    tc_list = [
        {'input_data': '5\n1 2 3 4 5', 'expected_output': '15', 'is_hidden': False, 'points_weight': 1.0, 'description': f'Sample baseline case for {clean_title}'},
        {'input_data': '1\n42', 'expected_output': '42', 'is_hidden': False, 'points_weight': 1.0, 'description': 'Single-element visible boundary case'},
        {'input_data': '0\n', 'expected_output': '0', 'is_hidden': True, 'points_weight': 2.0, 'description': 'Hidden empty input boundary case'},
        {'input_data': '6\n-10 -5 0 5 10 20', 'expected_output': '20', 'is_hidden': True, 'points_weight': 2.0, 'description': 'Hidden negative & mixed values test case'},
        {'input_data': '10\n100 200 300 400 500 600 700 800 900 1000', 'expected_output': '5500', 'is_hidden': True, 'points_weight': 2.0, 'description': 'Hidden stress test case'},
    ][:max(2, min(int(test_case_count or 5), 10))]

    # Try enriching via Groq fast/quality call if live key is active (only if custom pages not provided and not a sorting suite)
    if not pages and not is_sorting_suite:
        try:
            synth_prompt = [
                {
                    'role': 'system',
                    'content': (
                        'You are an academic curriculum architect. Return ONLY a valid JSON object with keys: '
                        '{"theory_md": "...", "runnable_code": "...", "starter_code": "...", '
                        '"html_simulation": "<!DOCTYPE html><html>...</html>", '
                        '"test_cases": [{"input_data": "...", "expected_output": "...", "is_hidden": false, "description": "..."}]}'
                    ),
                },
                {
                    'role': 'user',
                    'content': (
                        f"Create complete experiment material for '{clean_title}' in {lang}. "
                        f"Aim: {aim_text}. Problem: {prob_text}. "
                        "html_simulation must be a complete self-contained dark-themed (#0f0f23) interactive HTML/CSS/JS visualizer."
                    ),
                },
            ]
            ai_txt, _, is_fb, _ = guarded_ai_call(
                'agent', institution_id=iid, user_id=uid, role=g.role,
                messages=synth_prompt, pool='quality', max_tokens=2200, temperature=0.25,
            )
            if ai_txt and not is_fb:
                m = re.search(r'\{.*\}', ai_txt, re.DOTALL)
                if m:
                    parsed = json.loads(m.group())
                    if isinstance(parsed.get('theory_md'), str) and len(parsed['theory_md']) > 80:
                        theory_md = parsed['theory_md']
                    if isinstance(parsed.get('runnable_code'), str) and len(parsed['runnable_code']) > 20:
                        runnable_code = parsed['runnable_code']
                    if isinstance(parsed.get('starter_code'), str) and len(parsed['starter_code']) > 20:
                        starter_code = parsed['starter_code']
                    if not custom_html_simulation and isinstance(parsed.get('html_simulation'), str) and '<html' in parsed['html_simulation'].lower():
                        html_sim = parsed['html_simulation']
                    if isinstance(parsed.get('test_cases'), list) and len(parsed['test_cases']) >= 2:
                        tc_list = parsed['test_cases'][:max(2, min(int(test_case_count or 5), 10))]
        except Exception as exc:
            log.warning("[harness.experiment] AI enrichment fallback used: %s", exc)

    # 3. Create Experiment row (rubric weights sum to 100)
    exp = Experiment(
        institution_id=iid,
        subject_id=subj.id,
        instructor_id=uid,
        exp_number=existing_count + 1,
        title=clean_title,
        aim=aim_text,
        theory=theory_md,
        problem_statement=prob_text,
        input_format='Standard input lines representing test parameters.',
        output_format='Exact computed output printed to standard output.',
        difficulty_level=diff_int,
        concept_tags=tags,
        allowed_languages=[lang, 'python', 'cpp', 'java'] if lang not in ('python', 'cpp', 'java') else ['python', 'cpp', 'java'],
        rubric_test_cases=60,
        rubric_lab_report=15,
        rubric_code_quality=10,
        rubric_viva=10,
        rubric_quiz=5,
        enable_viva=bool(include_viva),
        allow_ai_hints=True,
        is_published=True,
    )
    db.session.add(exp)
    db.session.flush()

    # 4. Write standalone HTML simulation to `simulations/<exp.id>/index.html`
    try:
        sim_base = os.path.join(current_app.root_path, '..', 'simulations', exp.id)
        os.makedirs(sim_base, exist_ok=True)
        sim_file_path = os.path.join(sim_base, 'index.html')
        with open(sim_file_path, 'w', encoding='utf-8') as f:
            f.write(html_sim)
        exp.simulation_entry = 'index.html'
        exp.simulation_files = json.dumps(['index.html'])
    except Exception as exc:
        log.warning("[harness.simulation] could not write simulation file: %s", exc)

    # 5. Create official TestCase rows
    created_tcs = []
    for tc in tc_list:
        tc_row = TestCase(
            experiment_id=exp.id,
            input_data=str(tc.get('input_data') or tc.get('input') or ''),
            expected_output=str(tc.get('expected_output') or tc.get('expected') or ''),
            is_hidden=bool(tc.get('is_hidden', tc.get('hidden', False))),
            points_weight=float(tc.get('points_weight') or tc.get('weight') or 1.0),
            description=str(tc.get('description') or ''),
        )
        db.session.add(tc_row)
        created_tcs.append(tc_row)
    db.session.flush()

    # 6. Create ContentPages & ContentModules
    if isinstance(pages, list) and len(pages) > 0:
        created_pages = []
        mod_order = 1
        for p_idx, p_data in enumerate(pages):
            p_title = (p_data.get('title') if isinstance(p_data, dict) else str(p_data)) or f"Page {p_idx + 1}"
            spec = get_sorting_spec(p_title)

            cp = ContentPage(experiment_id=exp.id, title=p_title, display_order=p_idx + 1, is_live=True)
            db.session.add(cp)
            db.session.flush()
            created_pages.append(cp)

            raw_theory = p_data.get('theory') if isinstance(p_data, dict) else None
            if raw_theory and len(str(raw_theory).strip()) > 40:
                p_theory = str(raw_theory).strip()
            elif spec:
                p_theory = spec['theory']
            else:
                p_theory = (p_data.get('content') if isinstance(p_data, dict) else None) or f"### {p_title}\n\nTheory walkthrough and algorithmic derivations."

            mod_th = ContentModule(
                experiment_id=exp.id,
                page_id=cp.id,
                module_type='markdown',
                title=f"{p_title} — Theory & Notes",
                content_data={'md': p_theory, 'text': p_theory, 'content': p_theory},
                display_order=mod_order,
            )
            mod_order += 1
            db.session.add(mod_th)

            p_sim = p_data.get('simulation_html') or p_data.get('html') if isinstance(p_data, dict) else None
            if not p_sim or '<html' not in p_sim.lower():
                if spec:
                    p_sim = generate_sorting_simulation_html(
                        spec['title'], spec['key'], spec['description'], spec.get('default_arr') or spec.get('default_array')
                    )
                else:
                    p_sim = _build_default_interactive_html_simulation(p_title, ', '.join(tags))
            mod_s = ContentModule(
                experiment_id=exp.id,
                page_id=cp.id,
                module_type='html',
                title=f"{p_title} — Interactive Simulation",
                content_data={'html': p_sim, 'content': p_sim},
                display_order=mod_order,
            )
            mod_order += 1
            db.session.add(mod_s)

            p_code = p_data.get('code') or p_data.get('runnable_code') if isinstance(p_data, dict) else None
            if not p_code and spec:
                p_code = spec.get('code')

            if p_code:
                mod_c = ContentModule(
                    experiment_id=exp.id,
                    page_id=cp.id,
                    module_type='code',
                    title=f"{p_title} — Implementation",
                    content_data={'language': lang, 'code': p_code, 'runnable': True},
                    display_order=mod_order,
                )
                mod_order += 1
                db.session.add(mod_c)

        db.session.flush()

        cp_created = 0
        if include_checkpoints:
            cps = [
                Checkpoint(
                    experiment_id=exp.id, order=1,
                    title=f"Milestone 1: {created_pages[0].title}",
                    description=f"Explore interactive visualizer and theory for {created_pages[0].title}.",
                    weight=40, is_gated=False, page_id=created_pages[0].id,
                ),
                Checkpoint(
                    experiment_id=exp.id, order=2,
                    title="Milestone 2: Multi-Algorithm Analysis & Verification",
                    description="Complete all visualizer traces and verify test cases.",
                    weight=60, is_gated=False, page_id=created_pages[-1].id,
                ),
            ]
            db.session.add_all(cps)
            cp_created = len(cps)
        db.session.flush()

        publish_experiment_content(exp, commit=True)
        return {
            'success': True,
            'experiment_id': exp.id,
            'exp_number': exp.exp_number,
            'title': exp.title,
            'subject_name': subj.name,
            'pages_created': [p.title for p in created_pages],
            'modules_count': mod_order - 1,
            'simulation_preview_url': f'/api/instructor/experiments/{exp.id}/simulation/preview',
            'test_cases_created': len(created_tcs),
            'spark_checkpoints_created': cp_created,
            'is_published_snapshot_live': True,
            'studio_url': f'/instructor/experiments/{exp.id}',
            'message': f"Created and published Experiment '{exp.title}' under {subj.name} with {len(created_pages)} dedicated algorithm pages and interactive simulations.",
        }

    page1 = ContentPage(experiment_id=exp.id, title='1. Theory & Interactive Visualizer', display_order=1, is_live=True)
    page2 = ContentPage(experiment_id=exp.id, title='2. Readiness Quiz & Viva Prep', display_order=2, is_live=True)
    page3 = ContentPage(experiment_id=exp.id, title='3. Coding Lab & Assignment', display_order=3, is_live=True)
    db.session.add_all([page1, page2, page3])
    db.session.flush()

    mod_order = 1
    # Page 1 Modules: Markdown Theory + HTML Interactive Visualizer + Runnable Code Example
    mod_md = ContentModule(
        experiment_id=exp.id,
        page_id=page1.id,
        module_type='markdown',
        title=f'{clean_title} — Theory & Walkthrough',
        content_data={'md': theory_md},
        display_order=mod_order,
    )
    mod_order += 1
    mod_html = ContentModule(
        experiment_id=exp.id,
        page_id=page1.id,
        module_type='html',
        title=f'{clean_title} — Interactive HTML Simulation',
        content_data={'html': html_sim},
        display_order=mod_order,
    )
    mod_order += 1
    mod_code = ContentModule(
        experiment_id=exp.id,
        page_id=page1.id,
        module_type='code',
        title=f'{clean_title} — Runnable Code Example',
        content_data={'language': lang, 'code': runnable_code, 'runnable': True, 'stdin': '5\n1 2 3 4 5'},
        display_order=mod_order,
    )
    mod_order += 1
    db.session.add_all([mod_md, mod_html, mod_code])
    db.session.flush()

    # Page 2 Modules: Quiz + Viva
    if include_quiz:
        mod_quiz = ContentModule(
            experiment_id=exp.id,
            page_id=page2.id,
            module_type='quiz',
            title=f'{clean_title} — Pre-Lab Readiness Quiz',
            content_data={'pass_threshold': 70, 'max_attempts': 3, 'cooldown_minutes': 15, 'shuffle': True},
            display_order=mod_order,
        )
        mod_order += 1
        db.session.add(mod_quiz)
        db.session.flush()
        for q_item in quiz_items:
            db.session.add(QuizQuestion(
                module_id=mod_quiz.id,
                question_text=q_item['question_text'],
                options=q_item['options'],
                correct_answer=q_item['correct_answer'],
                points=1,
                explanation=q_item['explanation'],
            ))

    if include_viva:
        mod_viva = ContentModule(
            experiment_id=exp.id,
            page_id=page2.id,
            module_type='viva',
            title=f'{clean_title} — AI Oral Viva Assessment',
            content_data={
                'mode': 'topics',
                'topics': tags,
                'count': len(viva_items),
                'difficulty': diff_int,
                'pass_threshold': 70,
                'questions': viva_items,
            },
            display_order=mod_order,
        )
        mod_order += 1
        db.session.add(mod_viva)

    # Page 3 Module: Graded Coding Assignment
    assign_tcs = [
        {
            'input': tc.input_data,
            'expected': tc.expected_output,
            'hidden': bool(tc.is_hidden),
            'weight': tc.points_weight or 1,
            'tc_id': tc.id,
            'description': tc.description,
        }
        for tc in created_tcs
    ]
    mod_assign = ContentModule(
        experiment_id=exp.id,
        page_id=page3.id,
        module_type='assign',
        title=f'{clean_title} — Graded Lab Implementation',
        content_data={
            'language': lang,
            'starter_code': starter_code,
            'instructions': f"### Problem Statement\n{prob_text}\n\n### Aim\n{aim_text}",
            'pass_threshold': 60,
            'time_limit_sec': 5,
            'test_cases': assign_tcs,
        },
        display_order=mod_order,
    )
    db.session.add(mod_assign)
    db.session.flush()

    # 7. Create SPARK Checkpoints
    cp_created = 0
    if include_checkpoints:
        vis_ids = [tc.id for tc in created_tcs if not tc.is_hidden]
        all_tc_ids = [tc.id for tc in created_tcs]
        cps = [
            Checkpoint(
                experiment_id=exp.id, order=1,
                title='Milestone 1: Pre-Lab Concept & Base Case Setup',
                description='Complete pre-lab visualizer & pass first sample test case.',
                weight=30, is_gated=False, page_id=page1.id, test_case_ids=vis_ids[:1],
            ),
            Checkpoint(
                experiment_id=exp.id, order=2,
                title='Milestone 2: Core Algorithm Verification (Sample Cases)',
                description='Pass all visible sample test cases.',
                weight=40, is_gated=True, page_id=page3.id, test_case_ids=vis_ids,
            ),
            Checkpoint(
                experiment_id=exp.id, order=3,
                title='Milestone 3: Full Boundary & Hidden Suite Pass',
                description='Pass all hidden edge-case and stress test cases.',
                weight=30, is_gated=False, page_id=page3.id, test_case_ids=all_tc_ids,
            ),
        ]
        db.session.add_all(cps)
        cp_created = len(cps)

    db.session.flush()

    # 8. Freeze and Publish `Experiment.published_content` snapshot so students see everything immediately!
    publish_experiment_content(exp, commit=True)

    return {
        'success': True,
        'experiment_id': exp.id,
        'exp_number': exp.exp_number,
        'title': exp.title,
        'subject_name': subj.name,
        'pages_created': [page1.title, page2.title, page3.title],
        'modules_created': ['markdown (Theory)', 'html (Interactive Simulation)', 'code (Runnable Demo)', 'quiz (4 MCQs)', 'viva (3 Oral Qs)', 'assign (Graded Coding Lab)'],
        'simulation_preview_url': f'/api/instructor/experiments/{exp.id}/simulation/preview',
        'test_cases_created': len(created_tcs),
        'spark_checkpoints_created': cp_created,
        'is_published_snapshot_live': True,
        'studio_url': f'/instructor/experiments/{exp.id}',
        'message': (
            f"Created and published Experiment #{exp.exp_number} '{exp.title}' under {subj.name} with "
            f"3 live ContentPages, an interactive HTML simulation, runnable code, {len(quiz_items)} quiz questions, "
            f"{len(viva_items)} viva questions, {len(created_tcs)} test cases, and {cp_created} SPARK checkpoints."
        ),
    }


def autonomous_add_experiment_content_or_html(
    experiment_title: str = None,
    module_type: str = 'html',
    module_title: str = None,
    content_body: str = None,
    page_title: str = None,
    **_,
):
    """
    [AUTONOMOUS AUTHORING ACTION — Executes Immediately]
    Adds a new `ContentPage` or `ContentModule` (`'html'`, `'markdown'`, `'code'`, `'quiz'`, `'assign'`, `'viva'`)
    or updates the interactive HTML simulation on an existing Experiment, and immediately republishes
    the `Experiment.published_content` snapshot!
    """
    iid = g.institution_id
    ss_rows = _instructor_section_subjects()
    subj_ids = list({ss.subject_id for ss in ss_rows if ss.subject_id})
    exp_q = Experiment.query.filter_by(institution_id=iid)
    if subj_ids and getattr(g, 'role', '') == 'instructor':
        exp_q = exp_q.filter(Experiment.subject_id.in_(subj_ids))
    if experiment_title:
        exp_q = exp_q.filter(Experiment.title.ilike(f"%{experiment_title.strip()}%"))
    exp = exp_q.order_by(Experiment.created_at.desc()).first()
    if not exp:
        raise AgentToolError(f"No experiment found matching '{experiment_title or 'latest'}'")

    m_type = (module_type or 'html').lower().strip()
    if m_type not in ('html', 'markdown', 'text', 'code', 'quiz', 'assign', 'viva'):
        m_type = 'html'

    # Find or create target ContentPage
    pg = None
    if page_title:
        pg = ContentPage.query.filter_by(experiment_id=exp.id).filter(ContentPage.title.ilike(f"%{page_title.strip()}%")).first()
    if not pg:
        pg = ContentPage.query.filter_by(experiment_id=exp.id).order_by(ContentPage.display_order.asc()).first()
    if not pg:
        pg = ContentPage(experiment_id=exp.id, title=page_title or 'Interactive Studio Page', display_order=1, is_live=True)
        db.session.add(pg)
        db.session.flush()

    max_ord = db.session.query(func.max(ContentModule.display_order)).filter_by(experiment_id=exp.id).scalar() or 0
    m_title = (module_title or f"{exp.title} — {m_type.upper()} Block").strip()

    if m_type == 'html':
        html_code = content_body if (content_body and '<html' in content_body.lower()) else _build_default_interactive_html_simulation(m_title, ', '.join(exp.concept_tags or ['simulation']))
        c_data = {'html': html_code}
        # Also update standalone simulation file
        try:
            sim_base = os.path.join(current_app.root_path, '..', 'simulations', exp.id)
            os.makedirs(sim_base, exist_ok=True)
            with open(os.path.join(sim_base, 'index.html'), 'w', encoding='utf-8') as f:
                f.write(html_code)
            exp.simulation_entry = 'index.html'
            exp.simulation_files = json.dumps(['index.html'])
        except Exception:
            pass
    elif m_type == 'markdown':
        c_data = {'md': content_body or f"## {m_title}\n\nKey concepts and walkthrough for {exp.title}."}
    elif m_type == 'code':
        c_data = {'language': 'python', 'code': content_body or f"# Example for {exp.title}\nprint('Ready')\n", 'runnable': True, 'stdin': ''}
    else:
        c_data = {'html': f"<p>{content_body or m_title}</p>"}

    mod = ContentModule(
        experiment_id=exp.id,
        page_id=pg.id,
        module_type=m_type,
        title=m_title,
        content_data=c_data,
        display_order=max_ord + 1,
    )
    db.session.add(mod)
    db.session.flush()
    publish_experiment_content(exp, commit=True)

    return {
        'success': True,
        'experiment_id': exp.id,
        'experiment_title': exp.title,
        'page_title': pg.title,
        'module_id': mod.id,
        'module_type': m_type,
        'module_title': mod.title,
        'republished': True,
        'message': f"Added '{mod.title}' ({m_type}) to page '{pg.title}' in '{exp.title}' and republished live snapshot.",
    }


def build_complete_exam(
    title: str = None,
    subject_name: str = None,
    exam_type: str = 'mixed',
    duration_minutes: int = 45,
    mcq_count: int = 3,
    coding_count: int = 1,
    pass_threshold: int = 40,
    days_open: int = 7,
    **_,
):
    """
    [AUTONOMOUS EXAM BUILDER — Executes Immediately]
    Creates and publishes a standalone timed `Exam` (`exams` + `exam_questions`) with both
    multiple-choice (`mcq`) and Docker-graded `coding` questions in one shot!
    """
    iid = g.institution_id
    uid = g.user_id
    ss_rows = _instructor_section_subjects()
    subj = None
    for ss in ss_rows:
        s = Subject.query.get(ss.subject_id)
        if s and (not subject_name or subject_name.lower() in s.name.lower()):
            subj = s
            break
    if not subj:
        subj = Subject.query.filter_by(institution_id=iid).first()
    if not subj:
        raise AgentToolError('No subject found to attach this exam.')

    e_type = (exam_type or 'mixed').lower().strip()
    if e_type not in ('mcq', 'coding', 'mixed'):
        e_type = 'mixed'

    now = datetime.utcnow()
    exam_title = (title or f"{subj.name} — Timed Assessment").strip()
    exam = Exam(
        institution_id=iid,
        subject_id=subj.id,
        created_by=uid,
        title=exam_title,
        description=f"Timed {e_type.upper()} assessment for {subj.name}.",
        exam_type=e_type,
        available_from=now - timedelta(minutes=5),
        due_at=now + timedelta(days=max(1, int(days_open or 7))),
        duration_minutes=int(duration_minutes or 45),
        max_attempts=1,
        pass_threshold=int(pass_threshold or 40),
        shuffle_questions=True,
        is_published=True,
        grade_weight=0.2,
    )
    db.session.add(exam)
    db.session.flush()

    order_idx = 1
    created_qs = []
    if e_type in ('mcq', 'mixed'):
        for i in range(max(1, min(int(mcq_count or 3), 8))):
            q = ExamQuestion(
                exam_id=exam.id,
                question_type='mcq',
                display_order=order_idx,
                points=2.0,
                prompt=f"Q{order_idx} ({subj.name}): Which statement best describes the optimal time-complexity design for problem #{i + 1}?",
                options=[
                    'Choosing an invariant-preserving data structure with O(N) or O(N log N) operations',
                    'Using nested brute-force loops regardless of constraint bounds',
                    'Skipping empty/boundary input checks',
                    'Allocating unbounded recursion frames',
                ],
                correct_answer='A',
                explanation='Optimal data structure selection prevents Time Limit Exceeded (TLE) on large inputs.',
            )
            db.session.add(q)
            created_qs.append('mcq')
            order_idx += 1

    if e_type in ('coding', 'mixed'):
        for i in range(max(1, min(int(coding_count or 1), 4))):
            q = ExamQuestion(
                exam_id=exam.id,
                question_type='coding',
                display_order=order_idx,
                points=10.0,
                prompt=f"Coding Problem {i + 1} ({subj.name}): Given N integers on standard input, compute and print the sum of all positive elements.",
                language='python',
                starter_code="import sys\n\ndef solve():\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    solve()\n",
                test_cases=[
                    {'input': '5\n1 -2 3 4 -5', 'expected': '8', 'hidden': False, 'weight': 1},
                    {'input': '3\n-1 -2 -3', 'expected': '0', 'hidden': True, 'weight': 2},
                    {'input': '4\n10 20 30 40', 'expected': '100', 'hidden': True, 'weight': 2},
                ],
            )
            db.session.add(q)
            created_qs.append('coding')
            order_idx += 1

    db.session.commit()
    return {
        'success': True,
        'exam_id': exam.id,
        'title': exam.title,
        'subject_name': subj.name,
        'exam_type': exam.exam_type,
        'duration_minutes': exam.duration_minutes,
        'questions_created': len(created_qs),
        'is_published': True,
        'message': f"Created and published Exam '{exam.title}' ({len(created_qs)} questions, {exam.duration_minutes} mins) under {subj.name}.",
    }


def autonomous_bulk_autograde(experiment_title: str = None, publish_immediately: bool = True, **_):
    """
    [AUTONOMOUS GRADING ACTION — Executes Immediately]
    Evaluates all student `CodeAttempt` submissions for an experiment, computes `auto_grade`
    and `final_grade` (factoring in `HintLog` deductions), updates `Grade` rows, and publishes them.
    """
    ss_rows = _instructor_section_subjects()
    subj_ids = list({ss.subject_id for ss in ss_rows if ss.subject_id})
    exp_q = Experiment.query.filter(Experiment.institution_id == g.institution_id)
    if subj_ids and getattr(g, 'role', '') == 'instructor':
        exp_q = exp_q.filter(Experiment.subject_id.in_(subj_ids))
    if experiment_title:
        exp_q = exp_q.filter(Experiment.title.ilike(f"%{experiment_title.strip()}%"))
    exp = exp_q.order_by(Experiment.created_at.desc()).first()
    if not exp:
        raise AgentToolError(f"No experiment found matching '{experiment_title or 'latest'}'")

    attempts = CodeAttempt.query.filter_by(experiment_id=exp.id).order_by(CodeAttempt.submitted_at.asc()).all()
    best_by_student = {}
    for att in attempts:
        pct = (float(att.passed_count or 0) / max(int(att.total_count or 1), 1)) * 100.0
        if att.student_id not in best_by_student or pct >= best_by_student[att.student_id]:
            best_by_student[att.student_id] = round(pct, 1)

    graded_count = 0
    for sid, auto_sc in best_by_student.items():
        gr = Grade.query.filter_by(student_id=sid, experiment_id=exp.id).first()
        if not gr:
            gr = Grade(student_id=sid, experiment_id=exp.id)
            db.session.add(gr)
        gr.auto_grade = auto_sc
        ded = float(gr.hint_deduction or 0.0)
        gr.final_grade = max(0.0, round(auto_sc - ded, 1))
        gr.graded_at = datetime.utcnow()
        gr.is_published = bool(publish_immediately)
        graded_count += 1

    db.session.commit()
    return {
        'success': True,
        'experiment_id': exp.id,
        'experiment_title': exp.title,
        'graded_count': graded_count,
        'published': bool(publish_immediately),
        'message': f"Auto-graded {graded_count} student submissions for '{exp.title}' (Published: {bool(publish_immediately)}).",
    }


def autonomous_live_session_conductor(
    session_id: str = None,
    command: str = 'switch_mode',
    target_mode: str = 'working',
    poll_question: str = None,
    poll_options: list = None,
    **_,
):
    """
    [AUTONOMOUS LIVE CLASSROOM CONTROL — Executes Immediately]
    Controls an active or scheduled LabSession: `start_session`, `switch_mode`
    (`briefing`|`working`|`quiz_active`|`paused`|`debrief`), `launch_poll`, or `end_session`.
    """
    ss_rows = _instructor_section_subjects()
    ss_ids = [ss.id for ss in ss_rows]

    sess = LabSession.query.get(session_id) if session_id else None
    if not sess and ss_ids:
        sess = LabSession.query.filter(
            LabSession.section_subject_id.in_(ss_ids),
            LabSession.status.in_(['active', 'scheduled']),
        ).order_by(LabSession.scheduled_at.desc()).first()
    if not sess:
        raise AgentToolError('No active or scheduled lab session found.')

    cmd = (command or 'switch_mode').lower().strip()
    if cmd == 'start_session':
        sess.status = 'active'
        sess.current_mode = 'working'
        sess.actual_start = datetime.utcnow()
        db.session.commit()
        try:
            socketio.emit('session_mode_changed', {'session_id': sess.id, 'mode': 'working'}, room=f"session_{sess.id}_students")
        except Exception:
            pass
        return {'success': True, 'session_id': sess.id, 'message': f"Session '{sess.title}' is now LIVE in 'working' mode."}

    if cmd == 'end_session':
        old_mode = sess.current_mode
        sess.status = 'completed'
        sess.current_mode = 'ended'
        sess.ended_at = datetime.utcnow()
        db.session.add(SessionModeTransition(session_id=sess.id, from_mode=old_mode, to_mode='ended', actor_id=g.user_id))
        db.session.commit()
        return {'success': True, 'session_id': sess.id, 'message': f"Session '{sess.title}' has been ended."}

    if cmd == 'launch_poll':
        poll = SessionPoll(
            session_id=sess.id,
            created_by=g.user_id,
            question=poll_question or 'How is the lab pacing so far?',
            options=poll_options or ['Clear & on track', 'Need a quick example', 'Stuck on test cases'],
            is_open=True,
            responses={},
        )
        db.session.add(poll)
        db.session.commit()
        try:
            socketio.emit('poll_started', poll.to_dict(), room=f"session_{sess.id}_students")
        except Exception:
            pass
        return {'success': True, 'poll_id': poll.id, 'message': f"Launched live poll '{poll.question}' to students."}

    old_mode = sess.current_mode
    new_mode = (target_mode or 'working').lower().strip()
    sess.current_mode = new_mode
    db.session.add(SessionModeTransition(session_id=sess.id, from_mode=old_mode, to_mode=new_mode, actor_id=g.user_id))
    db.session.commit()
    try:
        socketio.emit('session_mode_changed', {'session_id': sess.id, 'mode': new_mode}, room=f"session_{sess.id}_students")
    except Exception:
        pass
    return {'success': True, 'session_id': sess.id, 'message': f"Switched session '{sess.title}' mode from '{old_mode}' to '{new_mode}'."}


def autonomous_grant_extension_or_intervention(
    student_name: str = None,
    record_type: str = 'intervention',
    experiment_title: str = None,
    extra_days: int = 3,
    action_type: str = 'tutoring',
    note: str = None,
    **_,
):
    """
    [AUTONOMOUS STUDENT SUPPORT ACTION — Executes Immediately]
    Directly grants a deadline `Extension` or records an at-risk `Intervention` and notifies the student.
    """
    if not student_name:
        raise AgentToolError('student_name is required')

    q = User.query.filter(
        User.institution_id == g.institution_id,
        User.role == 'student',
        or_(
            User.full_name.ilike(f"%{student_name.strip()}%"),
            User.roll_number.ilike(f"%{student_name.strip()}%"),
            User.email.ilike(f"%{student_name.strip()}%"),
        )
    )
    stu = q.first()
    if not stu:
        raise AgentToolError(f"No student matching '{student_name}' found.")

    r_type = (record_type or 'intervention').lower().strip()
    if r_type == 'extension':
        exp = None
        if experiment_title:
            exp = Experiment.query.filter(
                Experiment.institution_id == g.institution_id,
                Experiment.title.ilike(f"%{experiment_title.strip()}%")
            ).first()
        if not exp:
            exp = Experiment.query.filter_by(institution_id=g.institution_id).order_by(Experiment.created_at.desc()).first()
        if not exp:
            raise AgentToolError('No experiment found to attach the extension.')

        deadline = datetime.utcnow() + timedelta(days=max(1, int(extra_days or 3)))
        ext = Extension(
            institution_id=g.institution_id,
            student_id=stu.id,
            experiment_id=exp.id,
            granted_by=g.user_id,
            reason=note or f'{extra_days}-day deadline extension granted.',
            extension_until=deadline,
            excused=True,
        )
        db.session.add(ext)
        db.session.add(Notification(
            user_id=stu.id,
            type='extension',
            title=f'Deadline Extended: {exp.title}',
            message=f"Your deadline for '{exp.title}' has been extended until {deadline.strftime('%Y-%m-%d %H:%M UTC')}.",
        ))
        db.session.commit()
        return {
            'success': True,
            'extension_id': ext.id,
            'student_name': stu.full_name,
            'experiment_title': exp.title,
            'extension_until': deadline.strftime('%Y-%m-%d %H:%M UTC'),
            'message': f"Granted {extra_days}-day extension to {stu.full_name} for '{exp.title}' and sent notification.",
        }

    iv = Intervention(
        institution_id=g.institution_id,
        student_id=stu.id,
        created_by=g.user_id,
        action_type=action_type or 'tutoring',
        note=note or f"Academic support follow-up for {stu.full_name}.",
        outcome='open',
    )
    db.session.add(iv)
    db.session.add(Notification(
        user_id=stu.id,
        type='intervention',
        title='Instructor Academic Support Note',
        message=note or 'Your instructor shared an academic support check-in. Check your dashboard for details.',
    ))
    db.session.commit()
    return {
        'success': True,
        'intervention_id': iv.id,
        'student_name': stu.full_name,
        'action_type': iv.action_type,
        'message': f"Recorded '{iv.action_type}' intervention for {stu.full_name} and notified the student.",
    }


def instructor_get_my_sections(**_):
    """List all sections and subjects assigned to the authenticated instructor."""
    ss_rows = _instructor_section_subjects()
    out = []
    for ss in ss_rows:
        sec = Section.query.get(ss.section_id)
        subj = Subject.query.get(ss.subject_id)
        stu_count = SectionStudent.query.filter_by(section_id=ss.section_id).count()
        exp_count = Experiment.query.filter_by(subject_id=ss.subject_id).count() if ss.subject_id else 0
        sess_count = LabSession.query.filter_by(section_subject_id=ss.id).count()
        out.append({
            'section_subject_id': ss.id,
            'section_id': ss.section_id,
            'section_name': sec.name if sec else 'Section',
            'subject_id': ss.subject_id,
            'subject_name': subj.name if subj else 'Subject',
            'subject_code': subj.code if subj else '',
            'enrolled_students': stu_count,
            'experiments_count': exp_count,
            'sessions_count': sess_count,
        })
    return {'assigned_classes_count': len(out), 'classes': out}


def instructor_get_section_analytics(section_name: str = None, subject_name: str = None, **_):
    """Get grade, attendance, submission, and at-risk student analytics for assigned sections."""
    ss_rows = _instructor_section_subjects()
    if not ss_rows:
        return {'found': False, 'message': 'No sections are currently assigned to your instructor account.'}

    matched_ss = []
    for ss in ss_rows:
        sec = Section.query.get(ss.section_id)
        subj = Subject.query.get(ss.subject_id)
        if section_name and sec and section_name.lower() not in sec.name.lower():
            continue
        if subject_name and subj and subject_name.lower() not in subj.name.lower():
            continue
        matched_ss.append((ss, sec, subj))

    if not matched_ss:
        matched_ss = [(ss, Section.query.get(ss.section_id), Subject.query.get(ss.subject_id)) for ss in ss_rows]

    summaries = []
    for ss, sec, subj in matched_ss:
        stu_ids = [r.student_id for r in SectionStudent.query.filter_by(section_id=ss.section_id).all()]
        grades = Grade.query.filter(Grade.student_id.in_(stu_ids), Grade.final_grade.isnot(None)).all() if stu_ids else []
        scores = [float(gr.final_grade) for gr in grades]
        avg_grade = round(sum(scores) / len(scores), 1) if scores else 0.0
        pass_rate = round((sum(1 for s in scores if s >= 50.0) / len(scores)) * 100.0, 1) if scores else 0.0

        sess_ids = [s.id for s in LabSession.query.filter_by(section_subject_id=ss.id).all()]
        atts = SessionAttendance.query.filter(SessionAttendance.session_id.in_(sess_ids)).all() if sess_ids else []
        present_cnt = sum(1 for a in atts if a.status in ('present', 'late', 'partial'))
        att_rate = round((present_cnt / len(atts)) * 100.0, 1) if atts else 0.0

        stu_scores = defaultdict(list)
        for gr in grades:
            stu_scores[gr.student_id].append(float(gr.final_grade))
        at_risk_students = []
        users_map = {u.id: u for u in User.query.filter(User.id.in_(stu_ids)).all()} if stu_ids else {}
        for sid in stu_ids:
            s_list = stu_scores.get(sid, [])
            s_avg = round(sum(s_list) / len(s_list), 1) if s_list else None
            if s_avg is not None and s_avg < 50.0:
                u_obj = users_map.get(sid)
                at_risk_students.append({
                    'student_id': sid,
                    'student_name': u_obj.full_name if u_obj else sid,
                    'roll_number': u_obj.roll_number if u_obj else '',
                    'avg_grade': s_avg,
                })

        summaries.append({
            'section': sec.name if sec else 'Section',
            'subject': subj.name if subj else 'Subject',
            'students_count': len(stu_ids),
            'avg_grade_pct': avg_grade,
            'pass_rate_pct': pass_rate,
            'attendance_rate_pct': att_rate,
            'at_risk_count': len(at_risk_students),
            'at_risk_students': at_risk_students[:10],
        })

    return {'sections_analyzed': len(summaries), 'analytics': summaries}


def instructor_get_common_errors(experiment_title: str = None, limit: int = 15, **_):
    """Cluster recent compiler/runtime errors and failed test cases across student submissions."""
    ss_rows = _instructor_section_subjects()
    subj_ids = list({ss.subject_id for ss in ss_rows if ss.subject_id})
    exp_q = Experiment.query.filter(Experiment.institution_id == g.institution_id)
    if subj_ids:
        exp_q = exp_q.filter(Experiment.subject_id.in_(subj_ids))
    if experiment_title:
        exp_q = exp_q.filter(Experiment.title.ilike(f"%{experiment_title.strip()}%"))
    exps = exp_q.all()
    exp_ids = [e.id for e in exps]
    exp_map = {e.id: e.title for e in exps}

    if not exp_ids:
        return {'total_failed_attempts': 0, 'error_clusters': []}

    failed = CodeAttempt.query.filter(
        CodeAttempt.experiment_id.in_(exp_ids),
        or_(CodeAttempt.error_message.isnot(None), CodeAttempt.passed_count < CodeAttempt.total_count)
    ).order_by(CodeAttempt.submitted_at.desc()).limit(100).all()

    clusters = defaultdict(lambda: {'count': 0, 'experiments': set(), 'sample_error': ''})
    for att in failed:
        err_raw = (att.error_message or '').strip()
        if not err_raw:
            err_type = 'Logic / Wrong Output on Test Cases'
        elif 'SyntaxError' in err_raw or 'IndentationError' in err_raw:
            err_type = 'Syntax / Indentation Error'
        elif 'IndexError' in err_raw or 'OutOfBounds' in err_raw:
            err_type = 'Array Index Out of Bounds'
        elif 'KeyError' in err_raw or 'TypeError' in err_raw or 'AttributeError' in err_raw:
            err_type = 'Type / Key / Attribute Error'
        elif 'TimeLimit' in err_raw or 'timeout' in err_raw.lower():
            err_type = 'Time Limit Exceeded (Infinite Loop / O(N^2))'
        else:
            err_type = err_raw.splitlines()[-1][:60]

        c = clusters[err_type]
        c['count'] += 1
        c['experiments'].add(exp_map.get(att.experiment_id, 'Lab'))
        if not c['sample_error'] and err_raw:
            c['sample_error'] = err_raw[:240]

    ranked = sorted(
        [
            {
                'error_pattern': k,
                'occurrences': v['count'],
                'affected_experiments': list(v['experiments'])[:4],
                'sample_stderr': v['sample_error'],
            }
            for k, v in clusters.items()
        ],
        key=lambda x: x['occurrences'],
        reverse=True,
    )
    return {
        'total_failed_attempts_inspected': len(failed),
        'error_clusters': ranked[:min(int(limit or 10), 15)],
    }


def instructor_query_submissions_and_plagiarism(experiment_title: str = None, **_):
    """Query submission completion rates, ungraded submissions, and plagiarism flags."""
    ss_rows = _instructor_section_subjects()
    subj_ids = list({ss.subject_id for ss in ss_rows if ss.subject_id})
    allowed_sids = _instructor_allowed_student_ids()

    exp_q = Experiment.query.filter(Experiment.institution_id == g.institution_id)
    if subj_ids:
        exp_q = exp_q.filter(Experiment.subject_id.in_(subj_ids))
    if experiment_title:
        exp_q = exp_q.filter(Experiment.title.ilike(f"%{experiment_title.strip()}%"))
    exps = exp_q.order_by(Experiment.exp_number.asc()).limit(15).all()

    exp_summaries = []
    for exp in exps:
        att_q = CodeAttempt.query.filter_by(experiment_id=exp.id)
        if allowed_sids:
            att_q = att_q.filter(CodeAttempt.student_id.in_(list(allowed_sids)))
        total_attempts = att_q.count()
        unique_submitters = db.session.query(func.count(func.distinct(CodeAttempt.student_id))).filter(
            CodeAttempt.experiment_id == exp.id,
            CodeAttempt.student_id.in_(list(allowed_sids)) if allowed_sids else True,
        ).scalar() or 0

        graded_cnt = Grade.query.filter(
            Grade.experiment_id == exp.id,
            Grade.final_grade.isnot(None),
        ).count()
        plag_cnt = PlagiarismFlag.query.filter_by(experiment_id=exp.id).count()

        exp_summaries.append({
            'experiment_id': exp.id,
            'exp_number': exp.exp_number,
            'title': exp.title,
            'unique_students_submitted': int(unique_submitters),
            'total_code_attempts': total_attempts,
            'graded_submissions': graded_cnt,
            'ungraded_pending': max(0, int(unique_submitters) - graded_cnt),
            'plagiarism_flags_count': plag_cnt,
        })

    return {
        'experiments_inspected': len(exp_summaries),
        'submissions_breakdown': exp_summaries,
    }


def instructor_get_student_360(student_name_or_roll: str = None, **_):
    """Get a complete 360-degree profile for a student in the instructor's sections."""
    if not student_name_or_roll:
        raise AgentToolError('student_name_or_roll is required')

    allowed_sids = _instructor_allowed_student_ids()
    q = User.query.filter(
        User.institution_id == g.institution_id,
        User.role == 'student',
        or_(
            User.full_name.ilike(f"%{student_name_or_roll.strip()}%"),
            User.roll_number.ilike(f"%{student_name_or_roll.strip()}%"),
            User.email.ilike(f"%{student_name_or_roll.strip()}%"),
        )
    )
    if allowed_sids and getattr(g, 'role', '') == 'instructor':
        q = q.filter(User.id.in_(list(allowed_sids)))
    stu = q.first()
    if not stu:
        return {'found': False, 'message': f"No student matching '{student_name_or_roll}' found."}

    grades = Grade.query.filter_by(student_id=stu.id).all()
    g_scores = [float(gr.final_grade) for gr in grades if gr.final_grade is not None]
    avg_grade = round(sum(g_scores) / len(g_scores), 1) if g_scores else 0.0

    atts = SessionAttendance.query.filter_by(student_id=stu.id).all()
    present_cnt = sum(1 for a in atts if a.status in ('present', 'late', 'partial'))
    att_rate = round((present_cnt / len(atts)) * 100.0, 1) if atts else 100.0

    ranking = StudentRanking.query.filter_by(student_id=stu.id).order_by(StudentRanking.updated_at.desc()).first()
    interventions = Intervention.query.filter_by(student_id=stu.id).order_by(Intervention.created_at.desc()).limit(5).all()
    extensions = Extension.query.filter_by(student_id=stu.id).order_by(Extension.created_at.desc()).limit(5).all()
    proctor_high = ProctorEvent.query.filter_by(student_id=stu.id, severity='high').count()

    return {
        'found': True,
        'student': {
            'id': stu.id,
            'full_name': stu.full_name,
            'roll_number': stu.roll_number,
            'email': stu.email,
        },
        'academic_summary': {
            'graded_experiments': len(g_scores),
            'avg_grade_pct': avg_grade,
            'attendance_rate_pct': att_rate,
            'sessions_attended': f"{present_cnt}/{len(atts)}",
            'spark_overall_score': round(float(ranking.overall_score or 0), 1) if ranking else None,
            'high_severity_proctor_flags': proctor_high,
        },
        'interventions': [iv.to_dict() for iv in interventions],
        'extensions': [ex.to_dict() for ex in extensions],
    }


def instructor_get_live_session_telemetry(session_id: str = None, **_):
    """Get real-time classroom conductor telemetry for an active or recent LabSession."""
    ss_rows = _instructor_section_subjects()
    ss_ids = [ss.id for ss in ss_rows]

    sess = None
    if session_id:
        sess = LabSession.query.filter_by(id=session_id, institution_id=g.institution_id).first()
    if not sess and ss_ids:
        sess = LabSession.query.filter(
            LabSession.section_subject_id.in_(ss_ids),
            LabSession.status == 'active',
        ).order_by(LabSession.scheduled_at.desc()).first()
    if not sess and ss_ids:
        sess = LabSession.query.filter(
            LabSession.section_subject_id.in_(ss_ids)
        ).order_by(LabSession.scheduled_at.desc()).first()

    if not sess:
        return {'found': False, 'message': 'No active or scheduled lab sessions found for your sections.'}

    atts = SessionAttendance.query.filter_by(session_id=sess.id).all()
    status_counts = defaultdict(int)
    for a in atts:
        status_counts[a.status or 'absent'] += 1

    cp_rows = CheckpointProgress.query.filter_by(session_id=sess.id).all()
    cp_counts = defaultdict(int)
    for cp in cp_rows:
        cp_counts[cp.status or 'pending'] += 1

    focus_rows = FocusScore.query.filter_by(session_id=sess.id).all()
    avg_focus = round(sum(float(f.focus_score or 0) for f in focus_rows) / len(focus_rows), 1) if focus_rows else None

    return {
        'found': True,
        'session_id': sess.id,
        'title': sess.title,
        'status': sess.status,
        'current_mode': sess.current_mode or 'working',
        'scheduled_at': sess.scheduled_at.isoformat() if sess.scheduled_at else None,
        'attendance_breakdown': dict(status_counts),
        'checkpoint_progress_summary': dict(cp_counts),
        'average_focus_score': avg_focus,
    }


def instructor_generate_section_report(section_name: str = None, report_type: str = 'section_gradebook',
                                       fmt: str = 'csv', **_):
    """Generate a downloadable CSV, XLSX, or Markdown report for the instructor's sections."""
    r_type = (report_type or 'section_gradebook').lower().strip()
    if r_type == 'error_clusters':
        err_data = instructor_get_common_errors()
        headers = ['Error Pattern', 'Occurrences', 'Affected Experiments', 'Sample Stderr']
        rows = [
            [
                c['error_pattern'],
                c['occurrences'],
                ', '.join(c['affected_experiments']),
                c['sample_stderr'],
            ]
            for c in (err_data.get('error_clusters') or [])
        ]
        doc_meta = save_generated_document(
            title='Instructor_Error_Cluster_Report',
            fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
            headers=headers,
            rows=rows,
        )
        return {'generated_document': doc_meta, 'clusters_included': len(rows)}

    data = instructor_get_section_analytics(section_name=section_name)
    analytics_list = data.get('analytics') or []

    if r_type == 'at_risk_roster':
        headers = ['Section', 'Subject', 'Student Name', 'Roll Number', 'Average Grade (%)']
        rows = []
        for a in analytics_list:
            for st in (a.get('at_risk_students') or []):
                rows.append([a['section'], a['subject'], st['student_name'], st['roll_number'], st['avg_grade']])
        doc_meta = save_generated_document(
            title=f"At_Risk_Students_{section_name or 'All_Sections'}",
            fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
            headers=headers,
            rows=rows,
        )
        return {'generated_document': doc_meta, 'at_risk_students_included': len(rows)}

    headers = ['Section', 'Subject', 'Enrolled Students', 'Avg Grade (%)', 'Pass Rate (%)', 'Attendance Rate (%)', 'At-Risk Count']
    rows = [
        [
            a['section'],
            a['subject'],
            a['students_count'],
            a['avg_grade_pct'],
            a['pass_rate_pct'],
            a['attendance_rate_pct'],
            a['at_risk_count'],
        ]
        for a in analytics_list
    ]
    doc_meta = save_generated_document(
        title=f"Instructor_Section_Report_{section_name or 'All'}",
        fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
        headers=headers,
        rows=rows,
    )
    return {
        'generated_document': doc_meta,
        'sections_included': len(rows),
    }


# ══════════════════════════════════════════════════════════════════════════════
# 3. INSTITUTION ADMIN FULL-STACK AUTONOMOUS SETUP & LIFECYCLE TOOLS
# ══════════════════════════════════════════════════════════════════════════════

def autonomous_campus_setup(
    year_label: str = '2026-2027',
    department_name: str = 'Computer Science & Engineering',
    department_code: str = 'CSE',
    batch_name: str = 'CSE 2nd Year',
    program: str = 'B.Tech CSE',
    section_names: list = None,
    subject_names: list = None,
    instructor_name_or_email: str = None,
    enroll_matching_students: bool = True,
    schedule_days: list = None,
    start_time: str = '10:00',
    duration_minutes: int = 90,
    weeks: int = 8,
    **_,
):
    """
    [AUTONOMOUS END-TO-END CAMPUS & SEMESTER SETUP — Executes Immediately]
    Executes the entire institutional setup pipeline in one transaction without manual forms:
    1. Creates/resolves `AcademicYear` (`year_label`).
    2. Creates/resolves `Department` (`department_name`, `department_code`).
    3. Creates/resolves `Batch` (`batch_name`, `program`).
    4. Creates/resolves `Section`s (`section_names`, e.g. `['A', 'B']`).
    5. Creates/resolves `Subject`s (`subject_names`, e.g. `['Data Structures Lab', 'Operating Systems Lab']`).
    6. Resolves or provisions the `instructor` `User` and maps `SectionSubject` assignments.
    7. Bulk-enrolls matching students (`SectionStudent`) into the created sections.
    8. Creates an active `RecurringPlan` and generates weekly conflict-checked `LabSession`s across `weeks`!
    """
    from app.institution.audit import write_audit
    from app.institution.planner import _generate_sessions_for_plan

    iid = g.institution_id
    uid = g.user_id

    # 1. Academic Year
    yr_lbl = (year_label or '2026-2027').strip()
    yr = AcademicYear.query.filter_by(institution_id=iid, year_label=yr_lbl).first()
    if not yr:
        yr = AcademicYear(institution_id=iid, year_label=yr_lbl, is_active=True)
        db.session.add(yr)
        db.session.flush()

    # 2. Department
    d_name = (department_name or 'Computer Science & Engineering').strip()
    d_code = (department_code or ''.join(w[0].upper() for w in d_name.split() if w[0].isalpha())[:6] or 'CSE').strip()
    dept = Department.query.filter(
        Department.institution_id == iid,
        or_(Department.name.ilike(d_name), Department.code.ilike(d_code))
    ).first()
    if not dept:
        dept = Department(institution_id=iid, name=d_name, code=d_code, color='#7c3aed', is_active=True)
        db.session.add(dept)
        db.session.flush()

    # 3. Batch
    b_name = (batch_name or f"{d_code} Batch {yr_lbl[:4]}").strip()
    batch = Batch.query.filter_by(institution_id=iid, name=b_name).first()
    if not batch:
        batch = Batch(
            institution_id=iid,
            year_id=yr.id,
            department_id=dept.id,
            name=b_name,
            program=program or f"B.Tech {d_code}",
        )
        db.session.add(batch)
        db.session.flush()

    # 4. Sections
    sec_list_raw = section_names if isinstance(section_names, list) and section_names else ['A', 'B']
    created_sections = []
    for s_nm in sec_list_raw:
        s_clean = str(s_nm).replace('Section', '').strip()[:10] or 'A'
        sec = Section.query.filter_by(institution_id=iid, batch_id=batch.id, name=s_clean).first()
        if not sec:
            sec = Section(
                institution_id=iid,
                batch_id=batch.id,
                name=s_clean,
                section_code=f"{d_code}-{s_clean}",
                max_students=60,
                is_active=True,
            )
            db.session.add(sec)
            db.session.flush()
        created_sections.append(sec)

    # 5. Subjects
    subj_list_raw = subject_names if isinstance(subject_names, list) and subject_names else [f"{d_code} Core Programming Lab"]
    created_subjects = []
    for idx, sub_nm in enumerate(subj_list_raw, start=1):
        sub_clean = str(sub_nm).strip()
        sub = Subject.query.filter(
            Subject.institution_id == iid,
            Subject.name.ilike(sub_clean)
        ).first()
        if not sub:
            sub_code = f"{d_code}{300 + idx}L"
            if Subject.query.filter_by(institution_id=iid, code=sub_code).first():
                sub_code = f"{sub_code}-{str(uuid.uuid4())[:3].upper()}"
            sub = Subject(
                institution_id=iid,
                department_id=dept.id,
                name=sub_clean,
                code=sub_code,
                subject_type='Lab',
            )
            db.session.add(sub)
            db.session.flush()
        created_subjects.append(sub)

    # 6. Resolve or Provision Instructor & Map SectionSubjects
    instr = None
    if instructor_name_or_email:
        q_in = instructor_name_or_email.strip()
        instr = User.query.filter(
            User.institution_id == iid,
            User.role == 'instructor',
            or_(User.full_name.ilike(f"%{q_in}%"), User.email.ilike(f"%{q_in}%"))
        ).first()
        if not instr:
            email_val = q_in.lower() if '@' in q_in else f"{re.sub(r'[^a-z0-9]+', '.', q_in.lower()).strip('.')}@campus.edu"
            if not User.query.filter_by(email=email_val).first():
                instr = User(
                    institution_id=iid,
                    department_id=dept.id,
                    email=email_val,
                    full_name=q_in if '@' not in q_in else q_in.split('@')[0].replace('.', ' ').title(),
                    role='instructor',
                    password_hash=generate_password_hash('NexLab@2026'),
                    is_active=True,
                )
                db.session.add(instr)
                db.session.flush()
    if not instr:
        instr = User.query.filter_by(institution_id=iid, role='instructor').first()

    ss_created = 0
    if instr:
        for sec in created_sections:
            for sub in created_subjects:
                ss = SectionSubject.query.filter_by(
                    institution_id=iid, section_id=sec.id, subject_id=sub.id
                ).first()
                if not ss:
                    ss = SectionSubject(
                        institution_id=iid,
                        section_id=sec.id,
                        subject_id=sub.id,
                        instructor_id=instr.id,
                    )
                    db.session.add(ss)
                    ss_created += 1
                else:
                    ss.instructor_id = instr.id
        db.session.flush()

    # 7. Bulk-Enroll Matching Students into Sections
    enrolled_total = 0
    if enroll_matching_students and created_sections:
        stu_q = User.query.filter_by(institution_id=iid, role='student', is_active=True)
        dept_stus = stu_q.filter_by(department_id=dept.id).limit(120).all() or stu_q.limit(60).all()
        target_sec = created_sections[0]
        for st in dept_stus:
            if not SectionStudent.query.filter_by(section_id=target_sec.id, student_id=st.id).first():
                db.session.add(SectionStudent(section_id=target_sec.id, student_id=st.id))
                enrolled_total += 1
        db.session.flush()

    # 8. Create RecurringPlan & Generate Conflict-Checked LabSessions
    days_list = schedule_days if isinstance(schedule_days, list) and schedule_days else ['Tue', 'Thu']
    start_dt = date.today()
    end_dt = start_dt + timedelta(weeks=max(1, min(int(weeks or 8), 20)))
    plan = RecurringPlan(
        institution_id=iid,
        name=f"{b_name} — {', '.join(s.name for s in created_subjects)} Track",
        description=f"Autonomous timetable created by NexLab AI Harness for {d_name}.",
        department_id=dept.id,
        batch_id=batch.id,
        academic_year_id=yr.id,
        sections_json=json.dumps([s.name for s in created_sections]),
        subjects_json=json.dumps([s.name for s in created_subjects]),
        schedule_days_json=json.dumps(days_list),
        start_time=start_time or '10:00',
        duration_minutes=int(duration_minutes or 90),
        start_date=start_dt,
        end_date=end_dt,
        room='Virtual Lab Studio 1',
        instructor_id=instr.id if instr else None,
        status='active',
    )
    db.session.add(plan)
    db.session.flush()

    sessions_generated = _generate_sessions_for_plan(plan)
    plan.sessions_generated_count = sessions_generated
    db.session.commit()

    write_audit(
        uid, iid, 'harness_autonomous_setup', 'institution', iid,
        f"Autonomous setup: Year={yr.year_label}, Dept={dept.code}, Batch={batch.name}, "
        f"Sections={[s.name for s in created_sections]}, Subjects={[s.name for s in created_subjects]}, "
        f"Students Enrolled={enrolled_total}, Sessions Generated={sessions_generated}"
    )

    return {
        'success': True,
        'academic_year': yr.year_label,
        'department': {'id': dept.id, 'name': dept.name, 'code': dept.code},
        'batch': {'id': batch.id, 'name': batch.name},
        'sections': [{'id': s.id, 'name': s.name} for s in created_sections],
        'subjects': [{'id': s.id, 'name': s.name, 'code': s.code} for s in created_subjects],
        'assigned_instructor': instr.full_name if instr else None,
        'section_subject_mappings_created': ss_created,
        'students_enrolled': enrolled_total,
        'recurring_plan_id': plan.id,
        'lab_sessions_scheduled': sessions_generated,
        'message': (
            f"Completed full setup: Academic Year '{yr.year_label}', Department '{dept.name} ({dept.code})', "
            f"Batch '{batch.name}', Sections {[s.name for s in created_sections]}, Subjects {[s.name for s in created_subjects]}, "
            f"enrolled {enrolled_total} students, and scheduled {sessions_generated} recurring lab sessions."
        ),
    }


def autonomous_create_academic_entity(
    entity_type: str = 'subject',
    name: str = None,
    code: str = None,
    department_name: str = None,
    batch_name: str = None,
    semester: int = 3,
    max_students: int = 60,
    **_,
):
    """
    [AUTONOMOUS ACADEMIC CREATION — Executes Immediately]
    Directly creates a `department`, `academic_year`, `batch`, `section`, or `subject`
    in the database without requiring manual form clicks.
    """
    from app.institution.audit import write_audit
    iid = g.institution_id
    uid = g.user_id
    e_type = (entity_type or 'subject').lower().strip()

    if e_type in ('year', 'academic_year'):
        lbl = (name or code or '2026-2027').strip()
        yr = AcademicYear.query.filter_by(institution_id=iid, year_label=lbl).first()
        if not yr:
            yr = AcademicYear(institution_id=iid, year_label=lbl, is_active=True)
            db.session.add(yr)
            db.session.commit()
            write_audit(uid, iid, 'create_academic_year', 'academic_year', yr.id, f"Created Academic Year {lbl}")
        return {'success': True, 'entity_type': 'academic_year', 'id': yr.id, 'year_label': yr.year_label, 'message': f"Academic Year '{yr.year_label}' is active."}

    if e_type in ('department', 'dept'):
        if not name:
            raise AgentToolError('Department name is required.')
        d_code = (code or ''.join(w[0].upper() for w in name.split() if w[0].isalpha())[:6] or 'DEPT').strip()
        dept = Department.query.filter(
            Department.institution_id == iid,
            or_(Department.name.ilike(name.strip()), Department.code.ilike(d_code))
        ).first()
        if not dept:
            dept = Department(institution_id=iid, name=name.strip(), code=d_code, color='#7c3aed', is_active=True)
            db.session.add(dept)
            db.session.commit()
            write_audit(uid, iid, 'create_department', 'department', dept.id, f"Created Department {dept.name} ({dept.code})")
        return {'success': True, 'entity_type': 'department', 'id': dept.id, 'name': dept.name, 'code': dept.code, 'message': f"Department '{dept.name} ({dept.code})' created."}

    dept = None
    if department_name:
        dept = Department.query.filter(
            Department.institution_id == iid,
            or_(Department.name.ilike(f"%{department_name.strip()}%"), Department.code.ilike(f"%{department_name.strip()}%"))
        ).first()
    if not dept:
        dept = Department.query.filter_by(institution_id=iid).first()

    if e_type == 'batch':
        if not name:
            raise AgentToolError('Batch name is required.')
        yr = AcademicYear.query.filter_by(institution_id=iid, is_active=True).first() or AcademicYear.query.filter_by(institution_id=iid).first()
        if not yr:
            yr = AcademicYear(institution_id=iid, year_label='2026-2027', is_active=True)
            db.session.add(yr)
            db.session.flush()
        b = Batch.query.filter_by(institution_id=iid, name=name.strip()).first()
        if not b:
            b = Batch(institution_id=iid, year_id=yr.id, department_id=dept.id if dept else None, name=name.strip(), program=code or 'B.Tech')
            db.session.add(b)
            db.session.commit()
            write_audit(uid, iid, 'create_batch', 'batch', b.id, f"Created Batch {b.name}")
        return {'success': True, 'entity_type': 'batch', 'id': b.id, 'name': b.name, 'message': f"Batch '{b.name}' created."}

    if e_type == 'section':
        s_name = (name or 'A').replace('Section', '').strip()[:10]
        batch = None
        if batch_name:
            batch = Batch.query.filter(Batch.institution_id == iid, Batch.name.ilike(f"%{batch_name.strip()}%")).first()
        if not batch:
            batch = Batch.query.filter_by(institution_id=iid).first()
        if not batch:
            yr = AcademicYear.query.filter_by(institution_id=iid).first() or AcademicYear(institution_id=iid, year_label='2026-2027', is_active=True)
            db.session.add(yr)
            db.session.flush()
            batch = Batch(institution_id=iid, year_id=yr.id, department_id=dept.id if dept else None, name=batch_name or 'Default Batch', program='B.Tech')
            db.session.add(batch)
            db.session.flush()
        sec = Section.query.filter_by(institution_id=iid, batch_id=batch.id, name=s_name).first()
        if not sec:
            sec = Section(institution_id=iid, batch_id=batch.id, name=s_name, section_code=code or f"SEC-{s_name}", max_students=int(max_students or 60), is_active=True)
            db.session.add(sec)
            db.session.commit()
            write_audit(uid, iid, 'create_section', 'section', sec.id, f"Created Section {sec.name} in {batch.name}")
        return {'success': True, 'entity_type': 'section', 'id': sec.id, 'name': sec.name, 'batch_name': batch.name, 'message': f"Section '{sec.name}' created under '{batch.name}'."}

    # Default: Subject
    if not name:
        raise AgentToolError('Subject name is required.')
    s_code = (code or ''.join(w[0].upper() for w in name.split()[:3] if w[0].isalpha()) + str(semester or 3) + '01').strip()
    if Subject.query.filter_by(institution_id=iid, code=s_code).first():
        s_code = f"{s_code}-{str(uuid.uuid4())[:3].upper()}"
    subj = Subject(
        institution_id=iid,
        department_id=dept.id if dept else None,
        name=name.strip(),
        code=s_code,
        subject_type='Lab',
    )
    db.session.add(subj)
    db.session.commit()
    write_audit(uid, iid, 'create_subject', 'subject', subj.id, f"Created Subject {subj.name} ({subj.code})")
    return {'success': True, 'entity_type': 'subject', 'id': subj.id, 'name': subj.name, 'code': subj.code, 'message': f"Subject '{subj.name} ({subj.code})' created."}


def autonomous_assign_and_enroll(
    section_name: str = None,
    subject_name: str = None,
    instructor_name_or_email: str = None,
    enroll_students: bool = False,
    student_names_or_emails: list = None,
    department_name: str = None,
    max_enroll_count: int = 40,
    **_,
):
    """
    [AUTONOMOUS ASSIGNMENT & ENROLLMENT — Executes Immediately]
    Assigns an instructor + subject to a section (`SectionSubject`) AND/OR enrolls
    specific or department-matching students (`SectionStudent`) into that section immediately!
    """
    from app.institution.audit import write_audit
    iid = g.institution_id
    uid = g.user_id

    sec = Section.query.filter(
        Section.institution_id == iid,
        Section.name.ilike(f"%{(section_name or 'A').replace('Section', '').strip()}%")
    ).first()
    if not sec:
        sec = Section.query.filter_by(institution_id=iid).first()
    if not sec:
        raise AgentToolError(f"Section '{section_name}' not found.")

    assigned_info = None
    if subject_name or instructor_name_or_email:
        subj = Subject.query.filter(
            Subject.institution_id == iid,
            or_(Subject.name.ilike(f"%{(subject_name or '').strip()}%"), Subject.code.ilike(f"%{(subject_name or '').strip()}%"))
        ).first() if subject_name else Subject.query.filter_by(institution_id=iid).first()

        instr = User.query.filter(
            User.institution_id == iid,
            User.role == 'instructor',
            or_(User.full_name.ilike(f"%{(instructor_name_or_email or '').strip()}%"), User.email.ilike(f"%{(instructor_name_or_email or '').strip()}%"))
        ).first() if instructor_name_or_email else User.query.filter_by(institution_id=iid, role='instructor').first()

        if subj and instr:
            ss = SectionSubject.query.filter_by(institution_id=iid, section_id=sec.id, subject_id=subj.id).first()
            if not ss:
                ss = SectionSubject(institution_id=iid, section_id=sec.id, subject_id=subj.id, instructor_id=instr.id)
                db.session.add(ss)
            else:
                ss.instructor_id = instr.id
            db.session.flush()
            assigned_info = {'section': sec.name, 'subject': subj.name, 'instructor': instr.full_name}
            write_audit(uid, iid, 'assign_subject', 'section_subject', ss.id, f"Assigned {subj.name} ({instr.full_name}) to Section {sec.name}")

    enrolled_count = 0
    if enroll_students or student_names_or_emails:
        existing_sids = {r.student_id for r in SectionStudent.query.filter_by(section_id=sec.id).all()}
        candidates = []
        if isinstance(student_names_or_emails, list) and student_names_or_emails:
            for token in student_names_or_emails:
                t_str = str(token).strip()
                u_match = User.query.filter(
                    User.institution_id == iid,
                    User.role == 'student',
                    or_(User.full_name.ilike(f"%{t_str}%"), User.email.ilike(f"%{t_str}%"), User.roll_number.ilike(f"%{t_str}%"))
                ).first()
                if u_match and u_match.id not in existing_sids:
                    candidates.append(u_match)
        else:
            stu_q = User.query.filter_by(institution_id=iid, role='student', is_active=True)
            if department_name:
                dept = Department.query.filter(
                    Department.institution_id == iid,
                    or_(Department.name.ilike(f"%{department_name}%"), Department.code.ilike(f"%{department_name}%"))
                ).first()
                if dept:
                    stu_q = stu_q.filter_by(department_id=dept.id)
            candidates = [u for u in stu_q.limit(100).all() if u.id not in existing_sids][:int(max_enroll_count or 40)]

        for st in candidates:
            db.session.add(SectionStudent(section_id=sec.id, student_id=st.id))
            enrolled_count += 1
        if enrolled_count:
            write_audit(uid, iid, 'enroll_students', 'section', sec.id, f"Enrolled {enrolled_count} students into Section {sec.name}")

    db.session.commit()
    return {
        'success': True,
        'section_name': sec.name,
        'subject_assignment': assigned_info,
        'students_enrolled_count': enrolled_count,
        'message': (
            f"Updated Section '{sec.name}': "
            + (f"assigned {assigned_info['subject']} to {assigned_info['instructor']}; " if assigned_info else "")
            + f"enrolled {enrolled_count} student(s)."
        ),
    }


def autonomous_schedule_sessions(
    title: str = None,
    section_name: str = None,
    subject_name: str = None,
    schedule_days: list = None,
    date_str: str = None,
    start_time: str = '10:00',
    duration_minutes: int = 90,
    recurring_weeks: int = 0,
    **_,
):
    """
    [AUTONOMOUS SESSION & RECURRING TIMETABLE SCHEDULER — Executes Immediately]
    Schedules either a single `LabSession` (when `recurring_weeks == 0`) or creates an active
    `RecurringPlan` and generates weekly `LabSession`s across `recurring_weeks`!
    """
    from app.institution.audit import write_audit
    from app.institution.planner import _generate_sessions_for_plan, _parse_time_str

    iid = g.institution_id
    uid = g.user_id

    sec = Section.query.filter(
        Section.institution_id == iid,
        Section.name.ilike(f"%{(section_name or 'A').replace('Section', '').strip()}%")
    ).first() or Section.query.filter_by(institution_id=iid).first()

    subj = Subject.query.filter(
        Subject.institution_id == iid,
        or_(Subject.name.ilike(f"%{(subject_name or '').strip()}%"), Subject.code.ilike(f"%{(subject_name or '').strip()}%"))
    ).first() if subject_name else Subject.query.filter_by(institution_id=iid).first()

    if not sec or not subj:
        raise AgentToolError('Matching section or subject not found.')

    ss = SectionSubject.query.filter_by(institution_id=iid, section_id=sec.id, subject_id=subj.id).first()
    if not ss:
        instr = User.query.filter_by(institution_id=iid, role='instructor').first() or User.query.get(uid)
        ss = SectionSubject(institution_id=iid, section_id=sec.id, subject_id=subj.id, instructor_id=instr.id)
        db.session.add(ss)
        db.session.flush()

    if int(recurring_weeks or 0) > 0 or (isinstance(schedule_days, list) and len(schedule_days) > 0):
        wks = max(2, min(int(recurring_weeks or 6), 20))
        days = schedule_days if isinstance(schedule_days, list) and schedule_days else ['Tue', 'Thu']
        plan = RecurringPlan(
            institution_id=iid,
            name=title or f"{subj.name} — Section {sec.name} Weekly Lab",
            sections_json=json.dumps([sec.name]),
            subjects_json=json.dumps([subj.name]),
            schedule_days_json=json.dumps(days),
            start_time=start_time or '10:00',
            duration_minutes=int(duration_minutes or 90),
            start_date=date.today(),
            end_date=date.today() + timedelta(weeks=wks),
            room='Virtual Lab Studio 1',
            instructor_id=ss.instructor_id,
            status='active',
        )
        db.session.add(plan)
        db.session.flush()
        cnt = _generate_sessions_for_plan(plan)
        plan.sessions_generated_count = cnt
        db.session.commit()
        write_audit(uid, iid, 'schedule_recurring_plan', 'recurring_plan', plan.id, f"Generated {cnt} sessions for {plan.name}")
        return {
            'success': True,
            'mode': 'recurring_plan',
            'plan_id': plan.id,
            'plan_name': plan.name,
            'sessions_generated': cnt,
            'schedule_days': days,
            'start_time': start_time,
            'message': f"Created recurring timetable '{plan.name}' and scheduled {cnt} lab sessions across {wks} weeks.",
        }

    # Single session
    target_d = date.today() + timedelta(days=1)
    if date_str:
        dl = date_str.lower().strip()
        if dl == 'today':
            target_d = date.today()
        elif dl == 'tomorrow':
            target_d = date.today() + timedelta(days=1)
        else:
            try:
                target_d = datetime.strptime(dl[:10], '%Y-%m-%d').date()
            except ValueError:
                pass

    hr, mn = _parse_time_str(start_time or '10:00')
    sched_dt = datetime(target_d.year, target_d.month, target_d.day, hr, mn)
    sess = LabSession(
        institution_id=iid,
        section_subject_id=ss.id,
        title=title or f"{subj.name} — Section {sec.name} Lab",
        scheduled_at=sched_dt,
        duration_minutes=int(duration_minutes or 90),
        status='scheduled',
    )
    db.session.add(sess)
    db.session.commit()
    write_audit(uid, iid, 'schedule_session', 'session', sess.id, f"Scheduled {sess.title} at {sched_dt}")
    return {
        'success': True,
        'mode': 'single_session',
        'session_id': sess.id,
        'title': sess.title,
        'section': sec.name,
        'subject': subj.name,
        'scheduled_at': sched_dt.strftime('%Y-%m-%d %H:%M UTC'),
        'duration_minutes': sess.duration_minutes,
        'message': f"Scheduled '{sess.title}' for {sched_dt.strftime('%Y-%m-%d %H:%M UTC')} ({sess.duration_minutes} mins).",
    }


def autonomous_manage_user_and_governance(
    action_kind: str = 'create_user',
    full_name: str = None,
    email: str = None,
    role: str = 'student',
    department_name: str = None,
    section_name: str = None,
    roll_number: str = None,
    monthly_token_quota: int = None,
    daily_institution_quota: int = None,
    **_,
):
    """
    [AUTONOMOUS USER & AI GOVERNANCE ACTION — Executes Immediately]
    Directly creates a new user (`student`, `instructor`, `institution_admin`) with optional
    department & section enrollment, OR updates user/institution AI token quotas!
    """
    from app.institution.audit import write_audit
    iid = g.institution_id
    uid = g.user_id
    kind = (action_kind or 'create_user').lower().strip()

    if kind in ('update_quota', 'update_governance') or monthly_token_quota or daily_institution_quota:
        if daily_institution_quota:
            pol = AIPolicy.get_or_create(iid, updated_by=uid)
            pol.daily_token_quota = int(daily_institution_quota)
            db.session.commit()
            return {'success': True, 'daily_token_quota': pol.daily_token_quota, 'message': f"Updated institution daily AI token quota to {pol.daily_token_quota:,}."}
        if email or full_name:
            q_str = (email or full_name).strip()
            u = User.query.filter(
                User.institution_id == iid,
                or_(User.email.ilike(f"%{q_str}%"), User.full_name.ilike(f"%{q_str}%"))
            ).first()
            if not u:
                raise AgentToolError(f"User '{q_str}' not found.")
            q_row = AIUserQuota.query.filter_by(institution_id=iid, user_id=u.id).first()
            if not q_row:
                q_row = AIUserQuota(institution_id=iid, user_id=u.id, monthly_token_quota=int(monthly_token_quota or 100000))
                db.session.add(q_row)
            else:
                q_row.monthly_token_quota = int(monthly_token_quota or 100000)
            db.session.commit()
            return {'success': True, 'user': u.full_name, 'monthly_token_quota': q_row.monthly_token_quota, 'message': f"Updated {u.full_name}'s monthly AI quota to {q_row.monthly_token_quota:,} tokens."}

    # Create User
    if not full_name and not email:
        raise AgentToolError('full_name or email is required to create a user.')
    u_name = (full_name or email.split('@')[0].replace('.', ' ').title()).strip()
    u_email = (email or f"{re.sub(r'[^a-z0-9]+', '.', u_name.lower()).strip('.')}@campus.edu").strip().lower()
    u_role = (role or 'student').lower().strip()
    if u_role not in ('student', 'instructor', 'institution_admin'):
        u_role = 'student'

    dept = None
    if department_name:
        dept = Department.query.filter(
            Department.institution_id == iid,
            or_(Department.name.ilike(f"%{department_name}%"), Department.code.ilike(f"%{department_name}%"))
        ).first()
    if not dept:
        dept = Department.query.filter_by(institution_id=iid).first()

    u = User.query.filter_by(email=u_email).first()
    if not u:
        u = User(
            institution_id=iid,
            department_id=dept.id if dept else None,
            email=u_email,
            full_name=u_name,
            role=u_role,
            roll_number=roll_number,
            password_hash=generate_password_hash('NexLab@2026'),
            is_active=True,
        )
        db.session.add(u)
        db.session.flush()

    enrolled_sec = None
    if u_role == 'student' and section_name:
        sec = Section.query.filter(
            Section.institution_id == iid,
            Section.name.ilike(f"%{section_name.replace('Section', '').strip()}%")
        ).first()
        if sec and not SectionStudent.query.filter_by(section_id=sec.id, student_id=u.id).first():
            db.session.add(SectionStudent(section_id=sec.id, student_id=u.id))
            enrolled_sec = sec.name

    db.session.commit()
    write_audit(uid, iid, 'create_user', 'user', u.id, f"Created {u.role} {u.full_name} ({u.email})")
    return {
        'success': True,
        'user_id': u.id,
        'full_name': u.full_name,
        'email': u.email,
        'role': u.role,
        'department': dept.name if dept else None,
        'enrolled_section': enrolled_sec,
        'message': f"Created {u.role} account for '{u.full_name}' ({u.email})" + (f" and enrolled in Section {enrolled_sec}." if enrolled_sec else "."),
    }


def autonomous_broadcast_announcement(
    title: str = None,
    message: str = None,
    target: str = 'all',
    priority: str = 'important',
    category: str = 'general',
    **_,
):
    """
    [AUTONOMOUS ANNOUNCEMENT BROADCAST — Executes Immediately]
    Creates and broadcasts an institutional `Announcement` + in-app `Notification` rows immediately!
    """
    from app.institution.routes import _send_targeted_announcement
    from app.institution.audit import write_audit
    if not title or not message:
        raise AgentToolError('Both title and message are required.')
    payload, status = _send_targeted_announcement({
        'title': title.strip(),
        'message': message.strip(),
        'target': (target or 'all').lower(),
        'priority': (priority or 'important').lower(),
        'category': (category or 'general').lower(),
    })
    write_audit(g.user_id, g.institution_id, 'broadcast_announcement', 'announcement', None, f"Broadcast: {title}")
    return {
        'success': status < 300,
        'title': title,
        'sent_to': payload.get('sent_to', 0),
        'message': f"Broadcast announcement '{title}' to {payload.get('sent_to', 0)} recipients.",
    }


def admin_query_analytics_domain(domain: str = 'grades', days: int = 30,
                                 department_id: str = None, section_id: str = None,
                                 student_id: str = None, **_):
    """
    Query any of the Institution Analytics domains directly using live database aggregations:
    domain can be: 'grades' | 'attendance' | 'spark' | 'ai_usage' | 'funnel' | 'integrity' | 'outcomes' | 'behavior' | 'benchmark' | 'student_360'.
    """
    d_key = (domain or 'grades').lower().strip().replace('-', '_')
    params = {'days': days}
    if department_id:
        params['department_id'] = department_id
    if section_id:
        params['section_id'] = section_id

    route_map = {
        'grades': ('app.institution.extended', 'analytics_grades'),
        'attendance': ('app.institution.extended', 'analytics_attendance'),
        'spark': ('app.institution.extended', 'analytics_spark'),
        'ai_usage': ('app.institution.extended', 'analytics_ai_usage'),
        'funnel': ('app.institution.routes', 'analytics_funnel'),
        'integrity': ('app.institution.routes', 'analytics_integrity'),
        'outcomes': ('app.institution.routes', 'analytics_outcomes'),
        'behavior': ('app.institution.extended', 'analytics_behavior'),
        'benchmark': ('app.institution.routes', 'analytics_benchmark'),
    }

    if d_key == 'student_360' and student_id:
        fn = _resolve('app.institution.routes', 'student_360_profile')
        return _call_view(lambda: fn(student_id), params)

    target = route_map.get(d_key, route_map['grades'])
    fn = _resolve(target[0], target[1])
    res = _call_view(fn, params)
    if isinstance(res, dict) and 'rows' in res and isinstance(res['rows'], list):
        res['rows_sample'] = res['rows'][:15]
        res['total_rows_count'] = len(res['rows'])
        del res['rows']
    return res


def admin_query_academic_catalog_deep(**_):
    """Deep audit of the institution's academic hierarchy and unassigned gaps."""
    iid = g.institution_id
    years = AcademicYear.query.filter_by(institution_id=iid).all()
    depts = Department.query.filter_by(institution_id=iid).all()
    batches = Batch.query.filter_by(institution_id=iid).all()
    sections = Section.query.filter_by(institution_id=iid).all()
    subjects = Subject.query.filter_by(institution_id=iid).all()
    ss_rows = SectionSubject.query.filter_by(institution_id=iid).all()

    assigned_subj_ids = {ss.subject_id for ss in ss_rows}
    unassigned_subjects = [
        {'id': s.id, 'name': s.name, 'code': s.code}
        for s in subjects if s.id not in assigned_subj_ids
    ]

    empty_sections = []
    for sec in sections:
        cnt = SectionStudent.query.filter_by(section_id=sec.id).count()
        if cnt == 0:
            empty_sections.append({'id': sec.id, 'name': sec.name, 'max_students': sec.max_students})

    return {
        'academic_years': [y.to_dict() for y in years],
        'departments': [d.to_dict() for d in depts],
        'batches': [b.to_dict() for b in batches],
        'sections': [s.to_dict() for s in sections],
        'subjects': [{'id': s.id, 'name': s.name, 'code': s.code, 'semester': s.semester} for s in subjects],
        'section_subject_assignments_count': len(ss_rows),
        'unassigned_subjects': unassigned_subjects,
        'empty_sections_without_students': empty_sections,
    }


def admin_query_audit_and_security_logs(severity: str = None, action_filter: str = None, limit: int = 20, **_):
    """Query recent institutional AuditLog and SecurityEvent records."""
    iid = g.institution_id
    aq = AuditLog.query.filter_by(institution_id=iid)
    if severity:
        aq = aq.filter_by(severity=severity.lower().strip())
    if action_filter:
        aq = aq.filter(AuditLog.action.ilike(f"%{action_filter.strip()}%"))
    audit_rows = aq.order_by(AuditLog.created_at.desc()).limit(min(int(limit or 20), 40)).all()

    sq = SecurityEvent.query.filter_by(institution_id=iid)
    if severity:
        sq = sq.filter_by(severity=severity.lower().strip())
    sec_rows = sq.order_by(SecurityEvent.created_at.desc()).limit(10).all()

    return {
        'audit_logs_count': len(audit_rows),
        'audit_logs': [a.to_dict() for a in audit_rows],
        'security_events_count': len(sec_rows),
        'security_events': [s.to_dict() for s in sec_rows],
    }


def admin_propose_force_logout_users(target_role_or_email: str = 'student', reason: str = 'Security policy refresh', **_):
    """
    [DESTRUCTIVE ACTION — Confirmation Gated] Propose forcing an immediate JWT session revocation
    (`force_logout_at`) for a specific user email or an entire role cohort.
    """
    iid = g.institution_id
    target = (target_role_or_email or 'student').strip()
    if '@' in target:
        u = User.query.filter_by(institution_id=iid, email=target.lower()).first()
        if not u:
            raise AgentToolError(f"User with email '{target}' not found.")
        return {
            'requires_confirmation': True,
            'action': 'admin_force_logout',
            'draft': {
                'action': 'admin_force_logout',
                'scope': 'single_user',
                'target_user_id': u.id,
                'target_label': f"{u.full_name} ({u.email})",
                'affected_users_count': 1,
                'reason': reason,
            },
        }

    role_key = target.lower() if target.lower() in ('student', 'instructor') else 'student'
    cnt = User.query.filter_by(institution_id=iid, role=role_key, is_active=True).count()
    return {
        'requires_confirmation': True,
        'action': 'admin_force_logout',
        'draft': {
            'action': 'admin_force_logout',
            'scope': 'role_cohort',
            'target_role': role_key,
            'target_label': f"All active {role_key}s",
            'affected_users_count': cnt,
            'reason': reason,
        },
    }


def admin_generate_executive_report(report_type: str = 'executive_summary', fmt: str = 'csv', **_):
    """
    Generate a downloadable institutional report (.csv, .xlsx, or .md):
    report_type: 'executive_summary' | 'naac_nba_accreditation' | 'at_risk_intervention_roster' | 'faculty_workload_matrix' | 'ai_governance_audit'.
    """
    iid = g.institution_id
    inst = Institution.query.get(iid) if iid else None
    r_type = (report_type or 'executive_summary').lower().strip()
    inst_prefix = (inst.name if inst else 'NexLab').replace(' ', '_')[:25]

    if r_type == 'naac_nba_accreditation':
        subjects = Subject.query.filter_by(institution_id=iid).all()
        headers = ['Subject Code', 'Subject Title', 'Semester', 'Experiments Published', 'Graded Submissions', 'Mean Score (%)', 'Pass Rate (>=50%)', 'CO Attainment Level (1-3)']
        rows = []
        for s in subjects:
            exps = Experiment.query.filter_by(subject_id=s.id).all()
            exp_ids = [e.id for e in exps]
            grades = Grade.query.filter(Grade.experiment_id.in_(exp_ids), Grade.final_grade.isnot(None)).all() if exp_ids else []
            scores = [float(gr.final_grade) for gr in grades]
            avg_sc = round(sum(scores) / len(scores), 1) if scores else 0.0
            pass_rt = round((sum(1 for sc in scores if sc >= 50.0) / len(scores)) * 100.0, 1) if scores else 0.0
            co_lvl = 3 if pass_rt >= 75.0 else (2 if pass_rt >= 60.0 else (1 if scores else 0))
            rows.append([s.code or 'N/A', s.name, s.semester or 1, len(exps), len(scores), avg_sc, f"{pass_rt}%", co_lvl])
        doc_meta = save_generated_document(
            title=f"{inst_prefix}_NAAC_NBA_Attainment_Matrix",
            fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
            headers=headers,
            rows=rows,
        )
        return {'generated_document': doc_meta, 'report_type': r_type, 'subjects_included': len(rows)}

    if r_type == 'faculty_workload_matrix':
        instructors = User.query.filter_by(institution_id=iid, role='instructor').all()
        headers = ['Instructor Name', 'Email', 'Assigned Sections', 'Assigned Subjects', 'Sessions Scheduled/Conducted']
        rows = []
        for ins in instructors:
            ss_list = SectionSubject.query.filter_by(institution_id=iid, instructor_id=ins.id).all()
            ss_ids = [ss.id for ss in ss_list]
            sess_cnt = LabSession.query.filter(LabSession.section_subject_id.in_(ss_ids)).count() if ss_ids else 0
            rows.append([
                ins.full_name,
                ins.email,
                len({ss.section_id for ss in ss_list}),
                len({ss.subject_id for ss in ss_list}),
                sess_cnt,
            ])
        doc_meta = save_generated_document(
            title=f"{inst_prefix}_Faculty_Workload_Matrix",
            fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
            headers=headers,
            rows=rows,
        )
        return {'generated_document': doc_meta, 'report_type': r_type, 'instructors_included': len(rows)}

    if r_type == 'at_risk_intervention_roster':
        students = User.query.filter_by(institution_id=iid, role='student').all()
        sids = [u.id for u in students]
        grades = Grade.query.filter(Grade.student_id.in_(sids), Grade.final_grade.isnot(None)).all() if sids else []
        by_stu = defaultdict(list)
        for gr in grades:
            by_stu[gr.student_id].append(float(gr.final_grade))
        headers = ['Student Name', 'Roll Number', 'Email', 'Graded Labs', 'Avg Grade (%)', 'Risk Band']
        rows = []
        for u in students:
            sc = by_stu.get(u.id, [])
            if sc:
                avg = round(sum(sc) / len(sc), 1)
                if avg < 55.0:
                    rows.append([u.full_name, u.roll_number or '', u.email, len(sc), avg, 'Critical' if avg < 40 else 'At-Risk'])
        doc_meta = save_generated_document(
            title=f"{inst_prefix}_At_Risk_Intervention_Roster",
            fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
            headers=headers,
            rows=rows,
        )
        return {'generated_document': doc_meta, 'report_type': r_type, 'at_risk_students_included': len(rows)}

    if r_type == 'ai_governance_audit':
        aggs = db.session.query(
            AIUsageLog.user_id,
            AIUsageLog.role,
            func.count(AIUsageLog.id).label('calls'),
            func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label('tokens'),
        ).filter(AIUsageLog.institution_id == iid).group_by(AIUsageLog.user_id, AIUsageLog.role).order_by(desc('tokens')).limit(100).all()
        u_map = {u.id: u for u in User.query.filter_by(institution_id=iid).all()}
        headers = ['User Name', 'Email', 'Role', 'Total AI Calls', 'Total Tokens Consumed']
        rows = []
        for uid, rl, calls, tkns in aggs:
            u = u_map.get(uid)
            rows.append([u.full_name if u else uid, u.email if u else '', rl, int(calls or 0), int(tkns or 0)])
        doc_meta = save_generated_document(
            title=f"{inst_prefix}_AI_Governance_Usage_Audit",
            fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
            headers=headers,
            rows=rows,
        )
        return {'generated_document': doc_meta, 'report_type': r_type, 'users_included': len(rows)}

    depts = Department.query.filter_by(institution_id=iid).all() if iid else []
    headers = ['Department', 'Code', 'Students', 'Instructors', 'Subjects']
    rows = []
    for d in depts:
        s_cnt = User.query.filter_by(institution_id=iid, department_id=d.id, role='student').count()
        i_cnt = User.query.filter_by(institution_id=iid, department_id=d.id, role='instructor').count()
        subj_cnt = Subject.query.filter_by(institution_id=iid, department_id=d.id).count()
        rows.append([d.name, d.code or '', s_cnt, i_cnt, subj_cnt])

    doc_meta = save_generated_document(
        title=f"{inst_prefix}_{r_type}",
        fmt=fmt if fmt in ('csv', 'xlsx', 'md') else 'csv',
        headers=headers,
        rows=rows,
    )
    return {
        'generated_document': doc_meta,
        'report_type': r_type,
        'departments_included': len(rows),
    }


# ══════════════════════════════════════════════════════════════════════════════
# 4. PLATFORM SUPER-ADMIN AUTONOMOUS TOOLS (`admin` role)
# ══════════════════════════════════════════════════════════════════════════════

def platform_get_overview(**_):
    """Query global cross-tenant platform metrics, user counts, AI tokens, and PlatformConfig flags."""
    inst_count = Institution.query.count()
    role_counts = dict(
        db.session.query(User.role, func.count(User.id)).group_by(User.role).all()
    )
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    tokens_today = db.session.query(func.coalesce(func.sum(AIUsageLog.total_tokens), 0)).filter(
        AIUsageLog.created_at >= today_start
    ).scalar() or 0

    configs = {c.key: c.value for c in PlatformConfig.query.all()}
    return {
        'total_institutions': inst_count,
        'total_users': sum(role_counts.values()),
        'users_by_role': role_counts,
        'global_ai_tokens_today': int(tokens_today),
        'platform_configs': configs,
    }


def platform_list_institutions(search: str = None, **_):
    """List all institutions on the platform with subscription plan, status, seat usage, and AI token consumption."""
    q = Institution.query
    if search:
        q = q.filter(or_(Institution.name.ilike(f"%{search}%"), Institution.subdomain.ilike(f"%{search}%")))
    insts = q.order_by(Institution.created_at.desc()).limit(30).all()

    out = []
    for inst in insts:
        stu_cnt = User.query.filter_by(institution_id=inst.id, role='student').count()
        instr_cnt = User.query.filter_by(institution_id=inst.id, role='instructor').count()
        tkns = db.session.query(func.coalesce(func.sum(AIUsageLog.total_tokens), 0)).filter_by(
            institution_id=inst.id
        ).scalar() or 0
        out.append({
            'id': inst.id,
            'name': inst.name,
            'subdomain': inst.subdomain,
            'plan': inst.plan,
            'status': inst.status,
            'students': f"{stu_cnt}/{inst.max_students or 0}",
            'instructors': f"{instr_cnt}/{inst.max_instructors or 10}",
            'total_ai_tokens': int(tkns),
        })
    return {'institutions': out}


def autonomous_onboard_institution(
    name: str = None,
    subdomain: str = None,
    plan: str = 'enterprise',
    admin_email: str = None,
    max_students: int = 1000,
    daily_token_quota: int = 500000,
    **_,
):
    """
    [AUTONOMOUS MULTI-TENANT ONBOARDING — Executes Immediately]
    Provisions a new `Institution` tenant, creates its initial `institution_admin` `User`,
    creates default `AcademicYear` (`2026-2027`), and configures `AIPolicy` in one shot!
    """
    if not name:
        raise AgentToolError('Institution name is required.')
    sub = (subdomain or ''.join(c for c in name.lower() if c.isalnum())[:16]).strip()
    inst = Institution.query.filter_by(subdomain=sub).first()
    if not inst:
        inst = Institution(
            name=name.strip(),
            subdomain=sub,
            plan=(plan or 'enterprise').lower().strip(),
            status='active',
            max_students=int(max_students or 1000),
            max_instructors=50,
            onboarding_status='completed',
        )
        db.session.add(inst)
        db.session.flush()

    adm_email = (admin_email or f"admin@{sub}.edu").strip().lower()
    adm_user = User.query.filter_by(email=adm_email).first()
    if not adm_user:
        adm_user = User(
            institution_id=inst.id,
            email=adm_email,
            full_name=f"{inst.name} Administrator",
            role='institution_admin',
            password_hash=generate_password_hash('NexLab@2026'),
            is_active=True,
        )
        db.session.add(adm_user)
        db.session.flush()

    yr = AcademicYear.query.filter_by(institution_id=inst.id).first()
    if not yr:
        yr = AcademicYear(institution_id=inst.id, year_label='2026-2027', is_active=True)
        db.session.add(yr)

    pol = AIPolicy.get_or_create(inst.id, updated_by=adm_user.id)
    pol.daily_token_quota = int(daily_token_quota or 500000)
    db.session.commit()

    return {
        'success': True,
        'institution_id': inst.id,
        'name': inst.name,
        'subdomain': inst.subdomain,
        'plan': inst.plan,
        'admin_email': adm_user.email,
        'daily_token_quota': pol.daily_token_quota,
        'message': f"Onboarded institution '{inst.name}' ({inst.subdomain}), provisioned admin '{adm_user.email}', and set {pol.daily_token_quota:,} daily AI token quota.",
    }


def autonomous_create_platform_course_or_contest(
    entity_type: str = 'platform_course',
    title: str = None,
    difficulty: str = 'beginner',
    language: str = 'python',
    exercise_count: int = 3,
    **_,
):
    """
    [AUTONOMOUS PLATFORM CONTENT BUILDER — Executes Immediately]
    Creates and publishes a global `PlatformCourse` (with `PlatformExercise` coding/MCQ/simulation items)
    or a platform-wide `CodingContest`!
    """
    if not title:
        raise AgentToolError('title is required.')
    e_type = (entity_type or 'platform_course').lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:60]

    if e_type == 'contest':
        if CodingContest.query.filter_by(slug=slug).first():
            slug = f"{slug}-{str(uuid.uuid4())[:4]}"
        probs = Problem.query.filter_by(is_active=True).limit(4).all()
        now = datetime.utcnow()
        contest = CodingContest(
            slug=slug,
            title=title.strip(),
            description=f"Platform-wide competitive coding contest: {title.strip()}",
            starts_at=now,
            ends_at=now + timedelta(days=3),
            problem_ids=[p.id for p in probs],
            created_by=g.user_id,
        )
        db.session.add(contest)
        db.session.commit()
        return {
            'success': True,
            'contest_id': contest.id,
            'slug': contest.slug,
            'title': contest.title,
            'problems_count': len(probs),
            'message': f"Created live Coding Contest '{contest.title}' with {len(probs)} problems.",
        }

    if PlatformCourse.query.filter_by(slug=slug).first():
        slug = f"{slug}-{str(uuid.uuid4())[:4]}"
    course = PlatformCourse(
        slug=slug,
        title=title.strip(),
        description=f"Interactive hands-on course on {title.strip()}.",
        difficulty=(difficulty or 'beginner').lower(),
        language=(language or 'python').lower(),
        tags=[language or 'python', 'algorithms'],
        is_published=True,
    )
    db.session.add(course)
    db.session.flush()

    ex_cnt = max(1, min(int(exercise_count or 3), 8))
    for i in range(1, ex_cnt + 1):
        ex = PlatformExercise(
            course_id=course.id,
            order_index=i,
            title=f"{title.strip()} — Module {i}",
            description=f"Implement the solution for Module {i} of {title.strip()}.",
            hint_text='Check base cases and loop boundaries first.',
            difficulty='easy' if i == 1 else 'medium',
            exercise_type='coding',
            starter_code={'python': f"# Module {i}\ndef solve():\n    pass\n"},
            allowed_languages=['python', 'cpp', 'java'],
            test_cases=[{'input': '5', 'expected': '5', 'hidden': False}],
            xp_reward=20,
            is_published=True,
        )
        db.session.add(ex)
    db.session.commit()
    return {
        'success': True,
        'course_id': course.id,
        'slug': course.slug,
        'title': course.title,
        'exercises_created': ex_cnt,
        'message': f"Created and published Platform Course '{course.title}' with {ex_cnt} interactive exercises.",
    }


def autonomous_update_tenant_or_platform_config(
    institution_name_or_subdomain: str = None,
    plan: str = None,
    status: str = None,
    max_students: int = None,
    config_key: str = None,
    config_value: str = None,
    **_,
):
    """
    [AUTONOMOUS PLATFORM GOVERNANCE — Executes Immediately]
    Updates an institution tenant's plan/seat cap OR updates a global `PlatformConfig` key.
    """
    if config_key and config_value is not None:
        PlatformConfig.set(config_key.strip(), str(config_value).strip(), updated_by=g.user_id)
        db.session.commit()
        return {'success': True, 'config_key': config_key, 'config_value': str(config_value), 'message': f"Updated PlatformConfig '{config_key}' = '{config_value}'."}

    if not institution_name_or_subdomain:
        raise AgentToolError('Provide either institution_name_or_subdomain or config_key/config_value.')
    q_str = institution_name_or_subdomain.strip()
    inst = Institution.query.filter(
        or_(Institution.name.ilike(f"%{q_str}%"), Institution.subdomain.ilike(f"%{q_str}%"))
    ).first()
    if not inst:
        raise AgentToolError(f"Institution '{q_str}' not found.")
    if plan:
        inst.plan = plan.lower().strip()
    if status and status.lower() != 'suspended':
        inst.status = status.lower().strip()
    if max_students:
        inst.max_students = int(max_students)
    db.session.commit()
    return {'success': True, 'institution': inst.name, 'plan': inst.plan, 'max_students': inst.max_students, 'message': f"Updated '{inst.name}' (Plan: {inst.plan}, Max Students: {inst.max_students})."}


# ══════════════════════════════════════════════════════════════════════════════
# Unified Role Tool Catalogs (All Non-Destructive Tools Available in Both Modes!)
# ══════════════════════════════════════════════════════════════════════════════

STUDENT_TOOLS = {
    'save_learning_goal': (
        save_learning_goal_tool,
        SAVE_GOAL_DESC,
        'both',
    ),
    'analyze_my_code': (
        student_analyze_my_code,
        'analyze_my_code(experiment_id?, code?, language?, error?) — Inspect my current editor code or latest lab attempt for logic/syntax issues (Socratic mode)',
        'both',
    ),
    'explain_error': (
        student_explain_error,
        'explain_error(error_message?, language?) — Explain a compiler or runtime error in plain language without giving away code',
        'both',
    ),
    'get_socratic_hint': (
        student_get_socratic_hint,
        'get_socratic_hint(experiment_id?, level?) — Get a progressive Level 1 (Conceptual), Level 2 (Structural), or Level 3 (Diagnostic) hint',
        'both',
    ),
    'get_my_grades': (
        student_get_my_grades,
        'get_my_grades(subject_name?, limit?) — Check my lab experiment grades, auto/manual/viva breakdown, and GPA',
        'both',
    ),
    'get_my_attendance': (
        student_get_my_attendance,
        'get_my_attendance() — Check my lab session attendance rate, present/absent count, and 75% threshold status',
        'both',
    ),
    'get_my_spark_and_skills': (
        student_get_my_spark_and_skills,
        'get_my_spark_and_skills() — Check my SPARK 5-dimension behavioral score, class rank, and weak/strong coding concepts',
        'both',
    ),
    'get_upcoming_sessions_and_exams': (
        student_get_upcoming_sessions_and_exams,
        'get_upcoming_sessions_and_exams() — List my upcoming scheduled lab sessions, active exams, and deadline extensions',
        'both',
    ),
    'recommend_next_problem': (
        student_recommend_next_problem,
        'recommend_next_problem(topic?, difficulty?, limit?) — Recommend practice problems targeted at my weak skill areas',
        'both',
    ),
    'build_personal_problem_collection': (
        build_personal_problem_collection,
        'build_personal_problem_collection(collection_title?, topic?, difficulty?, count=5, bookmark_with_notes=True) — Autonomously create a Practice Problem Collection playlist and bookmarks in my account',
        'both',
    ),
    'create_saved_playground_workspace': (
        create_saved_playground_workspace,
        'create_saved_playground_workspace(title?, topic_or_pattern?, language="python") — Autonomously create and save a starter Playground coding session in my account',
        'both',
    ),
    'enroll_and_build_study_plan': (
        enroll_and_build_study_plan,
        'enroll_and_build_study_plan(plan_name_or_goal?, days=7) — Autonomously enroll in a Study Plan, build a problem playlist, and generate a downloadable multi-day roadmap',
        'both',
    ),
    'generate_study_sheet': (
        student_generate_study_sheet,
        'generate_study_sheet(topic_or_subject?, include_flashcards=True) — Generate a downloadable Markdown study sheet & viva prep guide',
        'both',
    ),
}

PLATFORM_USER_TOOLS = {
    'save_learning_goal': (
        save_learning_goal_tool,
        SAVE_GOAL_DESC,
        'both',
    ),
    'get_my_practice_stats': (
        platform_get_my_practice_stats,
        'get_my_practice_stats() — Get my solved problem counts (Easy/Medium/Hard), topic accuracy, XP, and course progress',
        'both',
    ),
    'analyze_practice_code': (
        platform_analyze_practice_code,
        'analyze_practice_code(problem_slug?, code?, language?, error?) — Socratic review of my current practice code or last submission',
        'both',
    ),
    'explain_error': (
        student_explain_error,
        'explain_error(error_message?, language?) — Explain a compiler or runtime error in plain language',
        'both',
    ),
    'recommend_next_problem': (
        student_recommend_next_problem,
        'recommend_next_problem(topic?, difficulty?, limit?) — Recommend unsolved practice problems matching my skill gaps',
        'both',
    ),
    'build_personal_problem_collection': (
        build_personal_problem_collection,
        'build_personal_problem_collection(collection_title?, topic?, difficulty?, count=5, bookmark_with_notes=True) — Autonomously create a custom Problem Collection playlist and bookmarks in my account',
        'both',
    ),
    'create_saved_playground_workspace': (
        create_saved_playground_workspace,
        'create_saved_playground_workspace(title?, topic_or_pattern?, language="python") — Autonomously create and save a starter Playground coding session in my account',
        'both',
    ),
    'enroll_and_build_study_plan': (
        enroll_and_build_study_plan,
        'enroll_and_build_study_plan(plan_name_or_goal?, days=7) — Autonomously enroll in a Study Plan, create a playlist, and generate a downloadable multi-day roadmap',
        'both',
    ),
    'generate_study_plan': (
        platform_generate_study_plan,
        'generate_study_plan(target_goal?, days?) — Generate a personalized downloadable multi-day coding study plan (.md)',
        'both',
    ),
    'generate_study_sheet': (
        student_generate_study_sheet,
        'generate_study_sheet(topic_or_subject?, include_flashcards?) — Generate a downloadable algorithm cheat sheet & flashcards (.md)',
        'both',
    ),
}

INSTRUCTOR_TOOLS = {
    'build_complete_experiment_suite': (
        build_complete_experiment_suite,
        'build_complete_experiment_suite(title?, topic?, subject_name?, difficulty="medium", language="python", aim?, problem_statement?, custom_html_simulation?, include_quiz=True, include_viva=True, include_checkpoints=True, test_case_count=5, algorithm_pages=["Bubble Sort", "Selection Sort", "Insertion Sort", "Merge Sort", "Quick Sort"], pages?) — Autonomously create and publish a complete Experiment with ContentPages, interactive HTML simulation visualizers, theory, runnable code, Quiz, Viva, TestCases & SPARK Checkpoints. For multi-algorithm suites like Sorting or Searching, specify algorithm_pages=[...] without writing raw HTML.',
        'both',
    ),
    'autonomous_add_experiment_content_or_html': (
        autonomous_add_experiment_content_or_html,
        "autonomous_add_experiment_content_or_html(experiment_title?, module_type='html'|'markdown'|'code', module_title?, content_body?, page_title?) — Autonomously add an interactive HTML visualizer, Markdown, or Code block to an experiment and republish",
        'both',
    ),
    'build_complete_exam': (
        build_complete_exam,
        "build_complete_exam(title, subject_name?, exam_type='mixed'|'mcq'|'coding', duration_minutes=45, mcq_count=3, coding_count=1) — Autonomously create and publish a timed Exam with AI-generated MCQ and Coding questions",
        'both',
    ),
    'autonomous_bulk_autograde': (
        autonomous_bulk_autograde,
        'autonomous_bulk_autograde(experiment_title?, publish_immediately=True) — Autonomously grade all student submissions for an experiment and publish grades',
        'both',
    ),
    'autonomous_live_session_conductor': (
        autonomous_live_session_conductor,
        "autonomous_live_session_conductor(session_id?, command='start_session'|'switch_mode'|'launch_poll'|'end_session', target_mode='working', poll_question?, poll_options?) — Autonomously control live classroom session mode or launch a poll",
        'both',
    ),
    'autonomous_grant_extension_or_intervention': (
        autonomous_grant_extension_or_intervention,
        "autonomous_grant_extension_or_intervention(student_name, record_type='extension'|'intervention', experiment_title?, extra_days=3, action_type='tutoring', note?) — Autonomously grant a student deadline extension or log an intervention",
        'both',
    ),
    'autonomous_schedule_sessions': (
        autonomous_schedule_sessions,
        'autonomous_schedule_sessions(title?, section_name?, subject_name?, schedule_days?, date_str?, start_time="10:00", duration_minutes=90, recurring_weeks=0) — Autonomously schedule a single LabSession or recurring weekly timetable',
        'both',
    ),
    'get_my_sections': (
        instructor_get_my_sections,
        'get_my_sections() — List all sections and subjects assigned to me with student, experiment, and session counts',
        'both',
    ),
    'get_section_analytics': (
        instructor_get_section_analytics,
        'get_section_analytics(section_name?, subject_name?) — Get grade average, pass rate, attendance rate, and at-risk students for my sections',
        'both',
    ),
    'get_common_errors': (
        instructor_get_common_errors,
        'get_common_errors(experiment_title?, limit?) — Cluster common compiler/runtime/logic errors across student submissions in my experiments',
        'both',
    ),
    'query_submissions_and_plagiarism': (
        instructor_query_submissions_and_plagiarism,
        'query_submissions_and_plagiarism(experiment_title?) — Check student submission counts, ungraded queue, and plagiarism flags',
        'both',
    ),
    'get_instructor_student_360': (
        instructor_get_student_360,
        'get_instructor_student_360(student_name_or_roll) — Get complete 360 profile (grades, attendance, SPARK, proctor flags, interventions) for a student',
        'both',
    ),
    'get_live_session_telemetry': (
        instructor_get_live_session_telemetry,
        'get_live_session_telemetry(session_id?) — Get live session mode, attendance breakdown, SPARK checkpoint progress, and focus scores',
        'both',
    ),
    'generate_section_report': (
        instructor_generate_section_report,
        "generate_section_report(section_name?, report_type='section_gradebook'|'at_risk_roster'|'error_clusters', fmt='csv'|'xlsx') — Generate a downloadable section gradebook, at-risk roster, or error report",
        'both',
    ),
}

def platform_admin_user_lookup(q: str = '', role: str = '', status: str = '', **_):
    """Platform-admin AI tool: search the global user directory (P1 engine)."""
    from app.models.user import User as _U
    from app.models.institution import Institution as _I
    query = _U.query
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(_U.full_name.ilike(like), _U.email.ilike(like)))
    if role:
        query = query.filter_by(role=role)
    if status:
        query = query.filter_by(status=status)
    rows = query.order_by(_U.last_login.desc().nullslast()).limit(8).all()
    inst_names = {i.id: i.name for i in _I.query.all()}
    return {'users': [{
        'id': u.id, 'name': u.full_name, 'email': u.email, 'role': u.role,
        'institution': inst_names.get(u.institution_id) or 'direct',
        'status': u.status or 'active',
        'last_login': u.last_login.isoformat() + 'Z' if u.last_login else None,
    } for u in rows]}


def platform_admin_user_stats(user_id: str = '', email: str = '', **_):
    """Platform-admin AI tool: User-360 quick stats (solves, XP, submissions)."""
    from app.models.user import User as _U
    from app.models.practice import StudentXP, PracticeSubmission
    from app.models.platform_content import PlatformProgress
    u = _U.query.get(user_id) if user_id else _U.query.filter_by(email=email).first()
    if not u:
        return {'error': 'User not found.'}
    xp = StudentXP.query.filter_by(student_id=u.id).first()
    return {
        'user': {'name': u.full_name, 'email': u.email, 'role': u.role,
                 'status': u.status or 'active'},
        'course_solves': PlatformProgress.query.filter_by(user_id=u.id, status='solved').count(),
        'practice_accepted': PracticeSubmission.query.filter_by(
            student_id=u.id, status='Accepted', is_run=False).count(),
        'total_xp': (xp.total_xp or 0) if xp else 0,
        'level': (xp.level, xp.level_name) if xp else None,
    }


PLATFORM_ADMIN_TOOLS = {
    'platform_admin_user_lookup': (
        platform_admin_user_lookup,
        'platform_admin_user_lookup(q?, role?, status?) — Search the global user directory by name/email with role and status filters. Returns up to 8 users with institution, status, last login.',
        'both',
    ),
    'platform_admin_user_stats': (
        platform_admin_user_stats,
        'platform_admin_user_stats(user_id? or email?) — User-360 quick stats for one account: solves, accepted submissions, XP, level, status.',
        'both',
    ),
    'get_platform_overview': (
        platform_get_overview,
        'get_platform_overview() — Get cross-tenant institution count, users by role, global AI token usage, and platform flags',
        'both',
    ),
    'list_platform_institutions': (
        platform_list_institutions,
        'list_platform_institutions(search?) — List institutions on the platform with plan, status, seat usage, and AI token burn',
        'both',
    ),
    'autonomous_onboard_institution': (
        autonomous_onboard_institution,
        'autonomous_onboard_institution(name, subdomain?, plan="enterprise", admin_email?, max_students=1000, daily_token_quota=500000) — Autonomously onboard a new Institution tenant, provision its initial admin user, academic year, and AI quota',
        'both',
    ),
    'autonomous_create_platform_course_or_contest': (
        autonomous_create_platform_course_or_contest,
        "autonomous_create_platform_course_or_contest(entity_type='platform_course'|'contest', title, difficulty='beginner', language='python', exercise_count=3) — Autonomously create and publish a global Platform Course or Coding Contest",
        'both',
    ),
    'autonomous_update_tenant_or_platform_config': (
        autonomous_update_tenant_or_platform_config,
        'autonomous_update_tenant_or_platform_config(institution_name_or_subdomain?, plan?, status?, max_students?, config_key?, config_value?) — Autonomously update a tenant plan/seat cap or global PlatformConfig setting',
        'both',
    ),
}


def get_tools_for_role(role: str) -> dict:
    """Return the complete tool map for a given user role."""
    r = (role or 'student').lower().strip()
    if r == 'student':
        return STUDENT_TOOLS
    if r == 'platform_user':
        return PLATFORM_USER_TOOLS
    if r == 'instructor':
        return INSTRUCTOR_TOOLS
    if r in ('admin', 'platform_admin'):
        return PLATFORM_ADMIN_TOOLS

    # Default: institution_admin (includes autonomous campus setup, entity creation, assignment/enrollment,
    # recurring scheduling, user/quota management, announcement broadcast, experiment builder, 7-domain analytics, and reports)
    merged = {}
    for k, (fn, desc, _m) in ADMIN_LEGACY_TOOLS.items():
        merged[k] = (fn, desc, 'both')

    merged.update({
        'autonomous_campus_setup': (
            autonomous_campus_setup,
            'autonomous_campus_setup(year_label="2026-2027", department_name="Computer Science & Engineering", department_code="CSE", batch_name="CSE 2nd Year", section_names=["A","B"], subject_names=["Data Structures Lab"], instructor_name_or_email?, enroll_matching_students=True, schedule_days=["Tue","Thu"], start_time="10:00", duration_minutes=90, weeks=8) — Autonomously execute complete end-to-end setup of AcademicYear, Department, Batch, Sections, Subjects, Instructor mapping, Student enrollment, and Recurring LabSessions',
            'both',
        ),
        'autonomous_create_academic_entity': (
            autonomous_create_academic_entity,
            "autonomous_create_academic_entity(entity_type='department'|'academic_year'|'batch'|'section'|'subject', name, code?, department_name?, batch_name?, semester=3, max_students=60) — Autonomously create a Department, Academic Year, Batch, Section, or Subject immediately",
            'both',
        ),
        'autonomous_assign_and_enroll': (
            autonomous_assign_and_enroll,
            'autonomous_assign_and_enroll(section_name, subject_name?, instructor_name_or_email?, enroll_students=False, student_names_or_emails?, department_name?, max_enroll_count=40) — Autonomously assign a Subject + Instructor to a Section and/or bulk-enroll students into that Section',
            'both',
        ),
        'autonomous_schedule_sessions': (
            autonomous_schedule_sessions,
            'autonomous_schedule_sessions(title?, section_name?, subject_name?, schedule_days?, date_str?, start_time="10:00", duration_minutes=90, recurring_weeks=0) — Autonomously schedule a single LabSession or a multi-week RecurringPlan timetable',
            'both',
        ),
        'autonomous_manage_user_and_governance': (
            autonomous_manage_user_and_governance,
            "autonomous_manage_user_and_governance(action_kind='create_user'|'update_quota', full_name?, email?, role='student'|'instructor', department_name?, section_name?, roll_number?, monthly_token_quota?, daily_institution_quota?) — Autonomously create a Student/Instructor account (and enroll in section) or update AI token quotas",
            'both',
        ),
        'autonomous_broadcast_announcement': (
            autonomous_broadcast_announcement,
            "autonomous_broadcast_announcement(title, message, target='all'|'students'|'instructors', priority='important', category='general') — Autonomously broadcast an announcement across the institution",
            'both',
        ),
        'build_complete_experiment_suite': (
            build_complete_experiment_suite,
            'build_complete_experiment_suite(title?, topic?, subject_name?, difficulty="medium", language="python", aim?, problem_statement?, custom_html_simulation?, include_quiz=True, include_viva=True, include_checkpoints=True, test_case_count=5, algorithm_pages=["Bubble Sort", "Selection Sort", "Insertion Sort", "Merge Sort", "Quick Sort"], pages?) — Autonomously create and publish a complete Experiment with ContentPages, interactive HTML simulation visualizers, Quiz, Viva, TestCases & SPARK Checkpoints. For multi-algorithm suites like Sorting or Searching, specify algorithm_pages=[...] without writing raw HTML.',
            'both',
        ),
        'query_analytics_domain': (
            admin_query_analytics_domain,
            "query_analytics_domain(domain='grades'|'attendance'|'spark'|'ai_usage'|'funnel'|'integrity'|'outcomes'|'behavior'|'benchmark'|'student_360', days=30, department_id?, section_id?, student_id?) — Query any institutional analytics domain",
            'both',
        ),
        'query_academic_catalog_deep': (
            admin_query_academic_catalog_deep,
            'query_academic_catalog_deep() — Audit academic years, departments, batches, sections, subjects, and detect unassigned subjects or empty sections',
            'both',
        ),
        'query_audit_and_security_logs': (
            admin_query_audit_and_security_logs,
            'query_audit_and_security_logs(severity?, action_filter?, limit=20) — Query institutional AuditLog and SecurityEvent records',
            'both',
        ),
        'propose_force_logout_users': (
            admin_propose_force_logout_users,
            'propose_force_logout_users(target_role_or_email="student", reason?) — [Destructive Gate] Propose forcing immediate JWT session revocation for a user or role cohort',
            'both',
        ),
        'generate_executive_report': (
            admin_generate_executive_report,
            "generate_executive_report(report_type='executive_summary'|'naac_nba_accreditation'|'at_risk_intervention_roster'|'faculty_workload_matrix'|'ai_governance_audit', fmt='csv'|'xlsx'|'md') — Generate a downloadable institutional or accreditation report",
            'both',
        ),
    })
    return merged


# Only truly destructive operations require a confirmation card!
CONFIRM_ACTION_NAMES = {
    'propose_force_logout_users',
    'reschedule_or_cancel_session',
}


def execute_role_action(action_payload: dict, institution_id: str, user_id: str, role: str) -> dict:
    """
    Execute a confirmed pending_action for any authorized role (`instructor`, `institution_admin`, `admin`)
    with strict server-side role verification, database transactions, and `write_audit()` logging.
    """
    from app.institution.audit import write_audit

    action = (action_payload or {}).get('action')
    if not action:
        raise AgentToolError('Missing action type in payload')

    # ── INSTRUCTOR CONFIRMED ACTIONS (Phase 3) ────────────────────────────────
    if action == 'instructor_create_experiment':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Only instructors or institution admins can create experiments.')
        subj_id = action_payload.get('subject_id')
        exp_num = int(action_payload.get('exp_number') or (Experiment.query.filter_by(subject_id=subj_id).count() + 1))
        title_str = action_payload.get('title') or 'New Experiment'
        aim_str = (action_payload.get('aim') or f"Hands-on implementation and verification of {title_str}.").strip()
        prob_str = (action_payload.get('problem_statement') or aim_str).strip()
        theory_str = (action_payload.get('theory') or f"# {title_str}\n\n## Conceptual Overview\nThis experiment focuses on hands-on algorithmic principles, core invariants, and time/space complexity analysis for **{title_str}**.\n\n### Key Concepts\n- Algorithmic invariants and complexity bounds\n- Proper handling of edge and boundary conditions\n- Verification via structured unit tests\n").strip()
        lang_list = action_payload.get('allowed_languages') or ['python']
        if isinstance(lang_list, str):
            lang_list = [lang_list]

        exp = Experiment(
            institution_id=institution_id,
            subject_id=subj_id,
            instructor_id=user_id,
            exp_number=exp_num,
            title=title_str,
            aim=aim_str,
            theory=theory_str,
            problem_statement=prob_str,
            difficulty_level=int(action_payload.get('difficulty_level') or 2),
            concept_tags=action_payload.get('concept_tags') or ['algorithms', title_str.split()[0].lower()],
            allowed_languages=[l.lower() for l in lang_list],
            is_published=True,
        )
        db.session.add(exp)
        db.session.flush()

        # 1. Create default ContentPage
        page = ContentPage(
            experiment_id=exp.id,
            title='Theory & Objectives',
            display_order=1,
            is_live=True,
        )
        db.session.add(page)
        db.session.flush()

        # 2. Add Theory Markdown Module
        mod_theory = ContentModule(
            experiment_id=exp.id,
            page_id=page.id,
            module_type='markdown',
            title='Conceptual Background',
            content_data={'text': theory_str},
            display_order=1,
        )
        db.session.add(mod_theory)

        # 3. Add Procedure Module
        proc_str = action_payload.get('procedure') or f"### Step-by-Step Procedure\n1. Review the conceptual requirements for **{title_str}**.\n2. Formulate the data structure and edge cases.\n3. Implement your solution in {lang_list[0].capitalize()}.\n4. Run the test suite and verify all visible & hidden assertions pass."
        mod_proc = ContentModule(
            experiment_id=exp.id,
            page_id=page.id,
            module_type='markdown',
            title='Lab Procedure & Guidelines',
            content_data={'text': proc_str},
            display_order=2,
        )
        db.session.add(mod_proc)

        # 4. Add Starter Code Module if present
        starter_code = action_payload.get('starter_code')
        if starter_code:
            mod_code = ContentModule(
                experiment_id=exp.id,
                page_id=page.id,
                module_type='code',
                title='Starter Code Template',
                content_data={'code': starter_code, 'language': lang_list[0].lower()},
                display_order=3,
            )
            db.session.add(mod_code)

        # 5. Add initial test cases if present
        test_cases = action_payload.get('test_cases') or []
        created_tcs = 0
        for tc in test_cases:
            tc_row = TestCase(
                experiment_id=exp.id,
                input_data=str(tc.get('input_data') or ''),
                expected_output=str(tc.get('expected_output') or ''),
                is_hidden=bool(tc.get('is_hidden', False)),
                points_weight=float(tc.get('points_weight') or 1.0),
                description=tc.get('description') or '',
            )
            db.session.add(tc_row)
            created_tcs += 1

        # 6. Publish snapshot so it appears immediately in the student lab viewer
        try:
            from app.services.content_publish import publish_experiment_content
            publish_experiment_content(exp, commit=False)
        except Exception as pub_exc:
            log.warning("[role_tools] auto-publish experiment content failed: %s", pub_exc)

        db.session.commit()
        return {
            'success': True,
            'experiment_id': exp.id,
            'exp_number': exp.exp_number,
            'pages_created': 1,
            'modules_created': 3 if starter_code else 2,
            'test_cases_created': created_tcs,
            'message': f"Experiment #{exp.exp_number} '{exp.title}' created with theory markdown, procedure, and {created_tcs} test cases under {action_payload.get('subject_name', 'Subject')}.",
        }

    if action == 'instructor_add_test_cases':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        exp_id = action_payload.get('experiment_id')
        cases = action_payload.get('test_cases') or []
        created_cnt = 0
        for tc in cases:
            row = TestCase(
                experiment_id=exp_id,
                input_data=str(tc.get('input_data') or ''),
                expected_output=str(tc.get('expected_output') or ''),
                is_hidden=bool(tc.get('is_hidden', False)),
                points_weight=float(tc.get('points_weight') or 1.0),
                description=tc.get('description') or '',
            )
            db.session.add(row)
            created_cnt += 1
        db.session.commit()
        return {
            'success': True,
            'message': f"Added {created_cnt} test cases to '{action_payload.get('experiment_title', 'Experiment')}'.",
        }

    if action == 'instructor_create_quiz_module':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        exp_id = action_payload.get('experiment_id')
        mod_count = ContentModule.query.filter_by(experiment_id=exp_id).count()
        mod = ContentModule(
            experiment_id=exp_id,
            module_type='quiz',
            title=action_payload.get('quiz_title') or 'Concept Readiness Quiz',
            content_data={'pass_threshold': 70, 'max_attempts': 3, 'shuffle': True},
            display_order=mod_count + 1,
        )
        db.session.add(mod)
        db.session.flush()
        for q_item in (action_payload.get('questions') or []):
            qq = QuizQuestion(
                module_id=mod.id,
                question_text=q_item.get('question_text') or 'Question',
                options=q_item.get('options') or ['A', 'B', 'C', 'D'],
                correct_answer=str(q_item.get('correct_answer') or 'A')[:5],
                points=1,
                explanation=q_item.get('explanation') or '',
            )
            db.session.add(qq)
        db.session.commit()
        return {
            'success': True,
            'module_id': mod.id,
            'message': f"Created quiz module '{mod.title}' with {len(action_payload.get('questions') or [])} questions.",
        }

    if action == 'instructor_create_checkpoints':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        exp_id = action_payload.get('experiment_id')
        cps = action_payload.get('checkpoints') or []
        for cp in cps:
            row = Checkpoint(
                experiment_id=exp_id,
                order=int(cp.get('order') or 1),
                title=cp.get('title') or 'Milestone',
                description=cp.get('description') or '',
                weight=int(cp.get('weight') or 25),
                is_gated=bool(cp.get('is_gated', False)),
                test_case_ids=cp.get('test_case_ids') or [],
            )
            db.session.add(row)
        db.session.commit()
        return {
            'success': True,
            'message': f"Configured {len(cps)} SPARK checkpoints for '{action_payload.get('experiment_title', 'Experiment')}'.",
        }

    if action == 'instructor_live_session_control':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        sess = LabSession.query.get(action_payload.get('session_id'))
        if not sess:
            raise AgentToolError('Session not found.')
        cmd = action_payload.get('command') or 'switch_mode'
        if cmd == 'start_session':
            sess.status = 'active'
            sess.current_mode = 'working'
            sess.actual_start = datetime.utcnow()
            db.session.commit()
            try:
                socketio.emit('session_mode_changed', {'session_id': sess.id, 'mode': 'working'}, room=f"session_{sess.id}_students")
            except Exception:
                pass
            return {'success': True, 'message': f"Session '{sess.title}' is now LIVE in 'working' mode."}
        elif cmd == 'end_session':
            old_mode = sess.current_mode
            sess.status = 'completed'
            sess.current_mode = 'ended'
            sess.ended_at = datetime.utcnow()
            db.session.add(SessionModeTransition(session_id=sess.id, from_mode=old_mode, to_mode='ended', actor_id=user_id))
            db.session.commit()
            return {'success': True, 'message': f"Session '{sess.title}' has been ended."}
        elif cmd == 'launch_poll':
            poll = SessionPoll(
                session_id=sess.id,
                created_by=user_id,
                question=action_payload.get('poll_question') or 'How is the lab pacing so far?',
                options=action_payload.get('poll_options') or ['Clear', 'Need help', 'Finished'],
                is_open=True,
                responses={},
            )
            db.session.add(poll)
            db.session.commit()
            try:
                socketio.emit('poll_started', poll.to_dict(), room=f"session_{sess.id}_students")
            except Exception:
                pass
            return {'success': True, 'message': f"Launched live poll '{poll.question}' to students."}
        else:
            old_mode = sess.current_mode
            new_mode = action_payload.get('target_mode') or 'working'
            sess.current_mode = new_mode
            db.session.add(SessionModeTransition(session_id=sess.id, from_mode=old_mode, to_mode=new_mode, actor_id=user_id))
            db.session.commit()
            try:
                socketio.emit('session_mode_changed', {'session_id': sess.id, 'mode': new_mode}, room=f"session_{sess.id}_students")
            except Exception:
                pass
            return {'success': True, 'message': f"Switched session '{sess.title}' mode from '{old_mode}' to '{new_mode}'."}

    if action == 'instructor_bulk_autograde':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        exp_id = action_payload.get('experiment_id')
        publish = bool(action_payload.get('publish_immediately', False))
        attempts = CodeAttempt.query.filter_by(experiment_id=exp_id).order_by(CodeAttempt.submitted_at.asc()).all()
        best_by_student = {}
        for att in attempts:
            pct = (float(att.test_cases_passed or 0) / max(int(att.test_cases_total or 1), 1)) * 100.0
            if att.student_id not in best_by_student or pct >= best_by_student[att.student_id]:
                best_by_student[att.student_id] = round(pct, 1)

        graded_count = 0
        for sid, auto_sc in best_by_student.items():
            gr = Grade.query.filter_by(student_id=sid, experiment_id=exp_id).first()
            if not gr:
                gr = Grade(student_id=sid, experiment_id=exp_id)
                db.session.add(gr)
            gr.auto_grade = auto_sc
            ded = float(gr.hint_deduction or 0.0)
            gr.final_grade = max(0.0, round(auto_sc - ded, 1))
            gr.graded_at = datetime.utcnow()
            if publish and hasattr(gr, 'is_published'):
                gr.is_published = True
            graded_count += 1
        db.session.commit()
        return {
            'success': True,
            'graded_count': graded_count,
            'message': f"Auto-graded {graded_count} student submissions for '{action_payload.get('experiment_title')}' (Published: {publish}).",
        }

    if action == 'instructor_grant_extension':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        ext = Extension(
            institution_id=institution_id,
            student_id=action_payload.get('student_id'),
            experiment_id=action_payload.get('experiment_id'),
            granted_by=user_id,
            reason=action_payload.get('reason') or 'Instructor deadline extension',
            extension_until=datetime.utcnow() + timedelta(days=3),
            excused=True,
        )
        db.session.add(ext)
        db.session.commit()
        return {
            'success': True,
            'message': f"Granted deadline extension to {action_payload.get('student_name')} for '{action_payload.get('experiment_title')}'.",
        }

    if action == 'instructor_log_intervention':
        if role not in ('instructor', 'institution_admin'):
            raise AgentToolError('Unauthorized')
        iv = Intervention(
            institution_id=institution_id,
            student_id=action_payload.get('student_id'),
            created_by=user_id,
            action_type=action_payload.get('action_type') or 'tutoring',
            note=action_payload.get('note') or '',
            outcome='open',
        )
        db.session.add(iv)
        db.session.commit()
        return {
            'success': True,
            'message': f"Recorded academic intervention for {action_payload.get('student_name')}.",
        }

    # ── INSTITUTION ADMIN PHASE 4 LIFECYCLE ACTIONS ──────────────────────────
    if action == 'admin_create_academic_year':
        if role != 'institution_admin':
            raise AgentToolError('Unauthorized')
        yr = AcademicYear(
            institution_id=institution_id,
            year_label=action_payload.get('year_label') or '2026-2027',
            is_active=bool(action_payload.get('is_active', True)),
        )
        db.session.add(yr)
        db.session.commit()
        write_audit(user_id, institution_id, 'copilot_create_year', 'academic_year', yr.id, f"Created Academic Year {yr.year_label}")
        return {'success': True, 'message': f"Created Academic Year '{yr.year_label}'."}

    if action == 'admin_create_batch':
        if role != 'institution_admin':
            raise AgentToolError('Unauthorized')
        yr_id = action_payload.get('year_id')
        if not yr_id:
            yr = AcademicYear.query.filter_by(institution_id=institution_id).first()
            if not yr:
                yr = AcademicYear(institution_id=institution_id, year_label='2026-2027', is_active=True)
                db.session.add(yr)
                db.session.flush()
            yr_id = yr.id
        b = Batch(
            institution_id=institution_id,
            year_id=yr_id,
            name=action_payload.get('name') or 'New Batch',
            program=action_payload.get('program') or 'B.Tech',
            department_id=action_payload.get('department_id'),
        )
        db.session.add(b)
        db.session.commit()
        write_audit(user_id, institution_id, 'copilot_create_batch', 'batch', b.id, f"Created Batch {b.name}")
        return {'success': True, 'message': f"Created Batch '{b.name}' under {action_payload.get('department_name', 'Institution')}."}

    if action == 'admin_create_subject':
        if role != 'institution_admin':
            raise AgentToolError('Unauthorized')
        code = action_payload.get('code') or 'CS101'
        if Subject.query.filter_by(institution_id=institution_id, code=code).first():
            code = f"{code}-{str(uuid.uuid4())[:4].upper()}"
        subj = Subject(
            institution_id=institution_id,
            department_id=action_payload.get('department_id'),
            name=action_payload.get('name') or 'New Subject',
            code=code,
            subject_type='Lab',
        )
        db.session.add(subj)
        db.session.commit()
        write_audit(user_id, institution_id, 'copilot_create_subject', 'subject', subj.id, f"Created Subject {subj.name} ({subj.code})")
        return {'success': True, 'message': f"Created Subject '{subj.name}' ({subj.code})."}

    if action == 'admin_bulk_enroll_students':
        if role != 'institution_admin':
            raise AgentToolError('Unauthorized')
        sec_id = action_payload.get('section_id')
        sids = action_payload.get('student_ids') or []
        added = 0
        for sid in sids:
            if not SectionStudent.query.filter_by(section_id=sec_id, student_id=sid).first():
                db.session.add(SectionStudent(section_id=sec_id, student_id=sid))
                added += 1
        db.session.commit()
        write_audit(user_id, institution_id, 'copilot_bulk_enroll', 'section', sec_id, f"Bulk enrolled {added} students")
        return {'success': True, 'message': f"Enrolled {added} students into Section '{action_payload.get('section_name')}'."}

    if action == 'admin_force_logout':
        if role != 'institution_admin':
            raise AgentToolError('Unauthorized')
        now = datetime.utcnow()
        if action_payload.get('scope') == 'single_user':
            u = User.query.filter_by(id=action_payload.get('target_user_id'), institution_id=institution_id).first()
            if u:
                u.force_logout_at = now
                db.session.commit()
                write_audit(user_id, institution_id, 'force_logout', 'user', u.id, f"Force logout: {u.email}")
                return {'success': True, 'message': f"Revoked active sessions for {u.full_name}."}
        else:
            r_key = action_payload.get('target_role') or 'student'
            users = User.query.filter_by(institution_id=institution_id, role=r_key, is_active=True).all()
            for u in users:
                u.force_logout_at = now
            db.session.commit()
            write_audit(user_id, institution_id, 'force_logout_cohort', 'user', None, f"Force logout {len(users)} {r_key}s")
            return {'success': True, 'message': f"Revoked active sessions for {len(users)} {r_key} accounts."}

    # ── PLATFORM SUPER-ADMIN CONFIRMED ACTIONS (Phase 4) ─────────────────────
    if action == 'platform_provision_institution':
        if role != 'admin':
            raise AgentToolError('Only Platform Admins can provision institutions.')
        inst = Institution(
            name=action_payload.get('name'),
            subdomain=action_payload.get('subdomain'),
            plan=action_payload.get('plan') or 'pro',
            status='active',
            max_students=int(action_payload.get('max_students') or 500),
            max_instructors=25,
        )
        db.session.add(inst)
        db.session.flush()

        adm_email = action_payload.get('admin_email')
        if adm_email and not User.query.filter_by(email=adm_email).first():
            adm_user = User(
                institution_id=inst.id,
                email=adm_email,
                full_name=f"{inst.name} Admin",
                role='institution_admin',
                password_hash=generate_password_hash('NexLab@2026'),
                is_active=True,
            )
            db.session.add(adm_user)
        db.session.commit()
        return {
            'success': True,
            'institution_id': inst.id,
            'message': f"Provisioned Institution '{inst.name}' (subdomain: {inst.subdomain}, plan: {inst.plan}).",
        }

    if action == 'platform_update_tenant':
        if role != 'admin':
            raise AgentToolError('Only Platform Admins can update tenant plans.')
        inst = Institution.query.get(action_payload.get('institution_id'))
        if not inst:
            raise AgentToolError('Institution not found.')
        if action_payload.get('new_plan'):
            inst.plan = action_payload['new_plan']
        if action_payload.get('new_status'):
            inst.status = action_payload['new_status']
        if action_payload.get('new_max_students'):
            inst.max_students = int(action_payload['new_max_students'])
        db.session.commit()
        return {
            'success': True,
            'message': f"Updated '{inst.name}' -> Plan: {inst.plan}, Status: {inst.status}, Max Students: {inst.max_students}.",
        }

    if action == 'platform_update_config':
        if role != 'admin':
            raise AgentToolError('Only Platform Admins can modify global PlatformConfig settings.')
        key = action_payload.get('key')
        val = action_payload.get('value')
        PlatformConfig.set(key, val, updated_by=user_id)
        db.session.commit()
        return {
            'success': True,
            'message': f"PlatformConfig '{key}' updated to '{val}'.",
        }

    # Delegate all legacy institution_admin actions to the existing executor
    if role != 'institution_admin':
        raise AgentToolError(f"Role '{role}' is not authorized to execute administrative action '{action}'.")
    return execute_legacy_admin_action(action_payload, institution_id=institution_id, user_id=user_id)
