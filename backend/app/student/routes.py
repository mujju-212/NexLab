"""
Student Blueprint
Handles: dashboard, pre-lab content, quiz gate, join session, catch-up,
         grades, analytics, notifications, feedback, lab record
"""
from flask import Blueprint, request, jsonify, g, current_app
from app.auth.utils import require_role
from app.extensions import db, limiter
from app.models.experiment import Experiment, ContentModule, ContentPage, ContentProgress, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, HintLog
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.ml.knowledge_tracing import update_concept_mastery
from app.models.feedback import SessionFeedback, SessionFeedbackReceipt, Notification
from app.models.academic import SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.user import User
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

student_bp = Blueprint('student', __name__)


def _iso_z(dt):
    """ISO-8601 with a trailing Z, or None."""
    if dt is None:
        return None
    return dt.isoformat().rstrip('Z') + 'Z'


def _parse_iso_z(raw):
    """Parse an ISO-8601 timestamp ('Z' or ±HH:MM) into a naive-UTC datetime.

    Used for the optional quiz time-limit / assignment deadline (Feature 3).
    Returns None for missing/invalid input so callers can skip enforcement.
    """
    if not raw:
        return None
    try:
        s = str(raw).strip()
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


# â”€â”€ My Subjects & Experiments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/subjects', methods=['GET'])
@require_role('student')
def my_subjects():
    """All section-subjects the student is enrolled in with dynamic progress and status"""
    from app.models.subject import Subject
    from app.models.experiment import Experiment
    from app.models.grading import Grade
    from app.models.submission import CodeAttempt

    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]

    section_subjects = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if section_ids else []

    result = []
    for ss in section_subjects:
        subject = Subject.query.get(ss.subject_id)
        if not subject:
            continue

        exps = Experiment.query.filter_by(
            subject_id=subject.id,
            institution_id=g.institution_id,
            is_published=True
        ).order_by(Experiment.exp_number).all()
        exp_ids = [e.id for e in exps]

        grades = {g_row.experiment_id: g_row for g_row in Grade.query.filter(
            Grade.student_id == g.user_id,
            Grade.experiment_id.in_(exp_ids)
        ).all()} if exp_ids else {}

        attempts = CodeAttempt.query.filter(
            CodeAttempt.student_id == g.user_id,
            CodeAttempt.experiment_id.in_(exp_ids)
        ).all() if exp_ids else []

        final_attempts = {
            a.experiment_id: a for a in attempts
            if a.is_final_submission or (a.test_cases_passed and a.test_cases_passed == a.test_cases_total)
        }
        any_attempts = {a.experiment_id: a for a in attempts}

        from app.models.exam import ExamAttempt
        from collections import defaultdict

        exam_attempts = ExamAttempt.query.filter(
            ExamAttempt.student_id == g.user_id,
            ExamAttempt.experiment_id.in_(exp_ids)
        ).all() if exp_ids else []
        submitted_exams = {ea.experiment_id for ea in exam_attempts if ea.status == 'submitted'}
        in_progress_exams = {ea.experiment_id for ea in exam_attempts if ea.status != 'submitted'}

        exp_modules = ContentModule.query.filter(
            ContentModule.experiment_id.in_(exp_ids)
        ).all() if exp_ids else []
        exp_mod_map = defaultdict(list)
        for m in exp_modules:
            exp_mod_map[m.experiment_id].append(m.id)

        all_mod_ids = [m.id for m in exp_modules]
        progress_rows = ContentProgress.query.filter(
            ContentProgress.student_id == g.user_id,
            ContentProgress.module_id.in_(all_mod_ids)
        ).all() if all_mod_ids else []
        completed_mod_set = {p.module_id for p in progress_rows if p.completed}
        any_mod_set = {p.module_id for p in progress_rows}

        completed_count = 0
        in_progress_count = 0
        all_tags = []
        for e in exps:
            if e.concept_tags and isinstance(e.concept_tags, list):
                for t in e.concept_tags:
                    if t and t not in all_tags:
                        all_tags.append(t)
            e_mods = exp_mod_map.get(e.id, [])
            all_mods_done = bool(e_mods and all(mid in completed_mod_set for mid in e_mods))
            any_mods_touched = bool(e_mods and any(mid in any_mod_set for mid in e_mods))

            if e.id in grades or e.id in final_attempts or e.id in submitted_exams or all_mods_done:
                completed_count += 1
            elif e.id in any_attempts or e.id in in_progress_exams or any_mods_touched:
                in_progress_count += 1

        total_exps = len(exps)
        pct = round((completed_count / total_exps) * 100) if total_exps > 0 else 0
        if total_exps > 0 and completed_count >= total_exps:
            sub_status = 'completed'
        elif completed_count > 0 or in_progress_count > 0:
            sub_status = 'in_progress'
        else:
            sub_status = 'not_started'

        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name,
            'subject_code': subject.code or '',
            'icon': getattr(subject, 'icon', None) or 'datastruct',
            'subject_icon': getattr(subject, 'icon', None) or 'datastruct',
            'description': subject.description or '',
            'instructor_id': ss.instructor_id,
            'total_experiments': total_exps,
            'completed_experiments': completed_count,
            'progress_percentage': pct,
            'status': sub_status,
            'concept_tags': all_tags[:8],
        })

    if not result:
        fallback_subs = []
        if g.institution_id:
            fallback_subs = Subject.query.filter_by(institution_id=g.institution_id, is_active=True).all()
            if not fallback_subs:
                fallback_subs = Subject.query.filter_by(institution_id=g.institution_id).all()
        if not fallback_subs and not g.institution_id:
            fallback_subs = Subject.query.filter_by(is_active=True).limit(10).all()
            if not fallback_subs:
                fallback_subs = Subject.query.limit(10).all()

        for subject in fallback_subs:
            exps = Experiment.query.filter_by(
                subject_id=subject.id,
                is_published=True
            ).order_by(Experiment.exp_number).all()
            total_exps = len(exps)
            result.append({
                'section_subject_id': subject.id,
                'subject_id': subject.id,
                'subject_name': subject.name,
                'subject_code': subject.code or '',
                'icon': getattr(subject, 'icon', None) or 'datastruct',
                'subject_icon': getattr(subject, 'icon', None) or 'datastruct',
                'description': subject.description or '',
                'instructor_id': None,
                'total_experiments': total_exps,
                'completed_experiments': 0,
                'progress_percentage': 0,
                'status': 'not_started',
                'concept_tags': [],
            })

    return jsonify({'subjects': result}), 200


@student_bp.route('/experiments/<subject_id>', methods=['GET'])
@require_role('student')
def list_experiments(subject_id):
    """Published experiments for a subject with student's personal completion status"""
    from app.models.experiment import Experiment
    from app.models.grading import Grade
    from app.models.submission import CodeAttempt

    exps = Experiment.query.filter_by(
        subject_id=subject_id,
        institution_id=g.institution_id,
        is_published=True
    ).order_by(Experiment.exp_number).all()

    from app.models.exam import ExamAttempt

    exp_ids = [e.id for e in exps]
    grades = {g_row.experiment_id: g_row for g_row in Grade.query.filter(
        Grade.student_id == g.user_id,
        Grade.experiment_id.in_(exp_ids)
    ).all()} if exp_ids else {}

    attempts = CodeAttempt.query.filter(
        CodeAttempt.student_id == g.user_id,
        CodeAttempt.experiment_id.in_(exp_ids)
    ).order_by(CodeAttempt.submitted_at.desc()).all() if exp_ids else []

    final_attempts = {}
    any_attempts = {}
    for a in attempts:
        if (a.is_final_submission or (a.test_cases_passed and a.test_cases_passed == a.test_cases_total)) and a.experiment_id not in final_attempts:
            final_attempts[a.experiment_id] = a
        if a.experiment_id not in any_attempts:
            any_attempts[a.experiment_id] = a

    exam_attempts = ExamAttempt.query.filter(
        ExamAttempt.student_id == g.user_id,
        ExamAttempt.experiment_id.in_(exp_ids)
    ).order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.started_at.desc()).all() if exp_ids else []

    latest_exam_attempts = {}
    for ea in exam_attempts:
        if ea.experiment_id not in latest_exam_attempts:
            latest_exam_attempts[ea.experiment_id] = ea

    from collections import defaultdict

    exp_modules = ContentModule.query.filter(
        ContentModule.experiment_id.in_(exp_ids)
    ).all() if exp_ids else []
    exp_mod_map = defaultdict(list)
    for m in exp_modules:
        exp_mod_map[m.experiment_id].append(m.id)

    all_mod_ids = [m.id for m in exp_modules]
    progress_rows = ContentProgress.query.filter(
        ContentProgress.student_id == g.user_id,
        ContentProgress.module_id.in_(all_mod_ids)
    ).all() if all_mod_ids else []
    completed_mod_set = {p.module_id for p in progress_rows if p.completed}
    any_mod_set = {p.module_id for p in progress_rows}

    enriched = []
    for e in exps:
        d = e.to_dict()
        e_mods = exp_mod_map.get(e.id, [])
        all_mods_done = bool(e_mods and all(mid in completed_mod_set for mid in e_mods))
        any_mods_touched = bool(e_mods and any(mid in any_mod_set for mid in e_mods))

        if e.id in grades:
            gr = grades[e.id]
            d['student_status'] = 'completed'
            d['completed_at'] = (gr.graded_at or gr.created_at).strftime('%b %d, %Y') if (gr.graded_at or gr.created_at) else None
            d['score'] = gr.final_grade
        elif e.delivery_mode == 'exam' and e.id in latest_exam_attempts:
            ea = latest_exam_attempts[e.id]
            if ea.status == 'submitted':
                d['student_status'] = 'completed'
                d['completed_at'] = ea.submitted_at.strftime('%b %d, %Y') if ea.submitted_at else None
                d['score'] = ea.score
            else:
                d['student_status'] = 'in_progress'
                d['completed_at'] = None
                d['score'] = None
        elif e.id in final_attempts:
            att = final_attempts[e.id]
            d['student_status'] = 'completed'
            d['completed_at'] = att.submitted_at.strftime('%b %d, %Y') if att.submitted_at else None
            d['score'] = att.test_cases_passed
        elif all_mods_done:
            d['student_status'] = 'completed'
            d['completed_at'] = None
            d['score'] = 100.0
        elif e.id in any_attempts or any_mods_touched:
            d['student_status'] = 'in_progress'
            d['completed_at'] = None
            d['score'] = None
        else:
            d['student_status'] = 'not_started'
            d['completed_at'] = None
            d['score'] = None
        enriched.append(d)

    # ── Standalone exams belong in the same list ──────────────────────────
    # A student should see "Assessments & Labs", not labs only. Exams are
    # emitted with kind='exam' and carry their own window/attempt state so the
    # UI can offer a Take/Continue button straight from the subject page.
    from app.models.exam import Exam
    from app.models.subject import Subject as _Subject
    _subj = _Subject.query.get(subject_id)
    _total_marks = (_subj.total_marks if _subj and _subj.total_marks else 100)
    subject_exams = Exam.query.filter(
        Exam.subject_id == subject_id,
        Exam.is_published.is_(True),
    ).filter(
        or_(Exam.institution_id == g.institution_id, Exam.institution_id.is_(None))
    ).order_by(Exam.created_at).all()

    exam_ids = [x.id for x in subject_exams]
    student_exam_attempts = ExamAttempt.query.filter(
        ExamAttempt.student_id == g.user_id,
        ExamAttempt.exam_id.in_(exam_ids),
    ).order_by(ExamAttempt.started_at.desc()).all() if exam_ids else []
    attempts_by_exam = {}
    for ea in student_exam_attempts:
        attempts_by_exam.setdefault(ea.exam_id, []).append(ea)

    for x in subject_exams:
        mine = attempts_by_exam.get(x.id, [])
        live = next((a for a in mine if a.status == 'in_progress'), None)
        submitted = [a for a in mine if a.status in ('submitted', 'expired')]
        best = max((a.score for a in submitted if a.score is not None), default=None)
        state = x.window_state() if hasattr(x, 'window_state') else 'open'
        attempts_used = len(submitted)

        enriched.append({
            'id': x.id,
            'exam_id': x.id,
            'kind': 'exam',
            'exp_number': None,
            'title': x.title,
            'aim': x.description or '',
            'concept_tags': [],
            'difficulty_level': None,
            'experiment_type': x.exam_type or 'mcq',
            'delivery_mode': 'exam',
            'is_published': True,
            'weightage': round((x.grade_weight or 0.0) * _total_marks, 2),
            'student_status': (
                'completed' if best is not None
                else 'in_progress' if live
                else 'not_started'
            ),
            'completed_at': (
                max(submitted, key=lambda a: a.submitted_at or a.started_at).submitted_at.strftime('%b %d, %Y')
                if submitted and submitted[-1].submitted_at else None
            ),
            'score': best,
            'window_state': state,
            'available_from': x.available_from.isoformat() + 'Z' if x.available_from else None,
            'due_at': x.due_at.isoformat() + 'Z' if x.due_at else None,
            'duration_minutes': x.duration_minutes,
            'max_attempts': x.max_attempts,
            'attempts_used': attempts_used,
            'attempts_remaining': max(0, (x.max_attempts or 1) - attempts_used),
            'can_attend': (
                state != 'closed' and attempts_used < (x.max_attempts or 1)
            ),
            'in_progress_attempt_id': live.id if live else None,
            'link': f'/student/exams/{x.id}',
        })

    # Labs first, then exams; each group in its own natural order.
    enriched.sort(key=lambda d: (d.get('kind') == 'exam', d.get('exp_number') or 0))

    return jsonify({'experiments': enriched}), 200


@student_bp.route('/subjects/<subject_id>/grade-summary', methods=['GET'])
@require_role('student')
def my_subject_grade_summary(subject_id):
    """Return the student's personal grade summary and rollup for a subject.

    Formula: subject_score = Σ (experiment_score / grade_scale) × weightage
    """
    from app.models.subject import Subject
    from app.models.experiment import Experiment
    from app.models.grading import Grade

    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id
    ).first_or_404()

    exps = Experiment.query.filter_by(
        subject_id=subject_id,
        institution_id=g.institution_id,
        is_published=True
    ).order_by(Experiment.exp_number).all()

    exp_ids = [e.id for e in exps]

    grades = {g_row.experiment_id: g_row for g_row in Grade.query.filter(
        Grade.student_id == g.user_id,
        Grade.experiment_id.in_(exp_ids)
    ).all()} if exp_ids else {}

    # ── Standalone exams are first-class marks too ────────────────────────
    # grade_weight is a fraction of the subject's total marks (0.25 -> 25 marks),
    # matching the instructor rollup so both views agree.
    from app.models.exam import Exam
    total_marks = subject.total_marks or 100
    standalone_exams = Exam.query.filter(
        Exam.subject_id == subject_id,
        Exam.is_published.is_(True),
    ).filter(
        or_(Exam.institution_id == g.institution_id, Exam.institution_id.is_(None))
    ).order_by(Exam.created_at).all()

    exam_grades = {}
    if standalone_exams:
        rows = Grade.query.filter(
            Grade.student_id == g.user_id,
            Grade.exam_id.in_([x.id for x in standalone_exams]),
        ).all()
        exam_grades = {r.exam_id: r for r in rows}

    total_weightage = sum(e.weightage or 0 for e in exps)
    total_weightage += sum((x.grade_weight or 0.0) * total_marks for x in standalone_exams)

    items = []
    earned_weighted_score = 0.0

    for e in exps:
        gr = grades.get(e.id)
        raw_score = float(gr.final_grade) if gr and gr.final_grade is not None else None
        scale = float(e.grade_scale or 100)
        weight = float(e.weightage or 0)
        weighted_score = (raw_score / scale) * weight if (scale > 0 and raw_score is not None) else None
        if weighted_score is not None:
            earned_weighted_score += weighted_score

        items.append({
            'experiment_id': e.id,
            'exp_number': e.exp_number,
            'title': e.title,
            'delivery_mode': getattr(e, 'delivery_mode', 'lab') or 'lab',
            'weightage': weight,
            'grade_scale': scale,
            'raw_score': raw_score,
            'weighted_score': round(weighted_score, 2) if weighted_score is not None else None,
            'is_graded': raw_score is not None,
            'status': 'completed' if raw_score is not None else 'pending',
            'window_state': e.window_state() if hasattr(e, 'window_state') else 'always_open',
            'available_from': e.available_from.isoformat() if getattr(e, 'available_from', None) else None,
            'due_at': e.due_at.isoformat() if getattr(e, 'due_at', None) else None,
        })

    for x in standalone_exams:
        gr = exam_grades.get(x.id)
        raw_score = float(gr.final_grade) if gr and gr.final_grade is not None else None
        weight = round((x.grade_weight or 0.0) * total_marks, 2)
        scale = 100.0
        weighted_score = (raw_score / scale) * weight if raw_score is not None else None
        if weighted_score is not None:
            earned_weighted_score += weighted_score
        items.append({
            'experiment_id': None,
            'exam_id': x.id,
            'kind': 'exam',
            'exp_number': None,
            'title': x.title,
            'delivery_mode': 'exam',
            'weightage': weight,
            'grade_scale': scale,
            'raw_score': raw_score,
            'weighted_score': round(weighted_score, 2) if weighted_score is not None else None,
            'is_graded': raw_score is not None,
            'status': 'completed' if raw_score is not None else 'pending',
            'window_state': x.window_state() if hasattr(x, 'window_state') else 'always_open',
            'available_from': x.available_from.isoformat() if getattr(x, 'available_from', None) else None,
            'due_at': x.due_at.isoformat() if getattr(x, 'due_at', None) else None,
        })

    return jsonify({
        'subject': {
            'id': subject.id,
            'name': subject.name,
            'code': subject.code,
            'total_marks': total_marks,
            'total_weightage': round(total_weightage, 2),
            'over_allocation': total_weightage > total_marks,
        },
        'earned_score': round(earned_weighted_score, 2),
        'total_possible_score': round(total_weightage, 2),
        'items': items,
    }), 200



# â”€â”€ Pre-Lab Content & Gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/prelab/<experiment_id>', methods=['GET'])
@require_role('student')
def get_prelab_content(experiment_id):
    """Get all content modules for an experiment (in display order).

    Only returns pages that are visible to students right now:
      is_live=True  OR  (release_at IS NOT NULL AND release_at <= now())
    Modules belonging to hidden pages are omitted. Pages with no published
    state at all (is_live=False, release_at=None) are excluded entirely â€”
    students see nothing until the instructor flips the toggle.

    Modules carry `page_id` so the client can group them into page tabs.
    Each page in `pages[]` includes `is_live`, `release_at` so the student
    UI can show a countdown if desired.
    """
    # ── Staged publishing: students read the frozen snapshot, not live drafts ──
    # Published experiments serve Experiment.published_content (the last
    # Publish/Republish). Unpublished experiments fall back to the live rows so
    # the conductor "launch an unpublished quiz live" flow keeps working.
    from app.services.content_publish import resolve_published_snapshot, snapshot_to_objects
    _exp_for_snapshot = Experiment.query.get(experiment_id)
    if not _exp_for_snapshot:
        return jsonify({'error': 'Experiment not found'}), 404
    if _exp_for_snapshot.institution_id != g.institution_id:
        return jsonify({'error': 'Unauthorized'}), 403

    # Check student enrollment in the subject
    my_sections = [e.section_id for e in SectionStudent.query.filter_by(student_id=g.user_id).all()]
    if my_sections:
        enrolled_subjects = {ss.subject_id for ss in SectionSubject.query.filter(
            SectionSubject.section_id.in_(my_sections),
            SectionSubject.institution_id == g.institution_id
        ).all()}
        if _exp_for_snapshot.subject_id not in enrolled_subjects:
            return jsonify({'error': 'You are not enrolled in this subject'}), 403
    else:
        return jsonify({'error': 'You are not enrolled in any sections'}), 403

    # Check window availability
    if hasattr(_exp_for_snapshot, 'window_state') and _exp_for_snapshot.window_state() == 'upcoming':
        return jsonify({'error': 'This experiment is not yet open for students'}), 403

    _snapshot = resolve_published_snapshot(_exp_for_snapshot)
    if _snapshot:
        all_pages, modules = snapshot_to_objects(_snapshot)
    else:
        modules = ContentModule.query.filter_by(
            experiment_id=experiment_id
        ).order_by(ContentModule.display_order).all()
        all_pages = ContentPage.query.filter_by(experiment_id=experiment_id)\
            .order_by(ContentPage.display_order, ContentPage.created_at).all()

    # Only expose pages that are currently visible to students
    visible_pages = [p for p in all_pages if p.is_visible_to_students()]

    # â”€â”€ C15 â€” launched-quiz whitelist (D-QuizFetch) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # If the instructor launched an unpublished quiz live for this experiment,
    # that quiz module (and its page) is accessible to students even though
    # is_live=False / release_at is in the future. Resolve the student's active
    # session for this experiment, then check its LivePageState.
    launched_quiz_module_id = None
    launched_page_id = None
    my_sections = [e.section_id for e in SectionStudent.query.filter_by(student_id=g.user_id).all()]
    active_session = None
    if my_sections:
        active_session = LabSession.query.join(
            SectionSubject, SectionSubject.id == LabSession.section_subject_id
        ).filter(
            SectionSubject.section_id.in_(my_sections),
            LabSession.experiment_id == experiment_id,
            LabSession.status == 'active',
        ).order_by(LabSession.started_at.desc()).first()
    if active_session:
        from app.models.conductor import LivePageState
        lps = LivePageState.query.filter_by(session_id=active_session.id).first()
        if lps and lps.launched_quiz_module_id:
            launched_quiz_module_id = lps.launched_quiz_module_id
            quiz_mod = ContentModule.query.get(launched_quiz_module_id)
            if quiz_mod and quiz_mod.experiment_id == experiment_id:
                launched_page_id = quiz_mod.page_id
                # Snapshot mode: the launched quiz may be an unpublished draft not
                # present in the frozen snapshot — expose the live module directly.
                if not any(m.id == launched_quiz_module_id for m in modules):
                    modules.append(quiz_mod)

    # Force-include the launched quiz's page (and any page holding it) so the
    # whitelisted module is not hidden behind a not-yet-live page.
    if launched_page_id:
        lp = next((p for p in all_pages if p.id == launched_page_id), None)
        if lp is None:
            # launched draft quiz lives on a page not in the snapshot — load it live
            lp = ContentPage.query.get(launched_page_id)
        if lp and lp.id not in [p.id for p in visible_pages]:
            visible_pages.append(lp)

    visible_page_ids = {p.id for p in visible_pages}

    result = []
    for module in modules:
        # Skip modules whose page is not yet released (unless it's the launched quiz)
        if module.id == launched_quiz_module_id:
            pass   # whitelisted â€” always expose
        elif module.page_id is not None and module.page_id not in visible_page_ids:
            continue

        # Get student's progress on this module
        progress = ContentProgress.query.filter_by(
            student_id=g.user_id, module_id=module.id
        ).first()

        module_data = {
            'id': module.id,
            'page_id': module.page_id,
            'type': module.module_type,
            'title': module.title,
            'display_order': module.display_order,
            'completed': progress.completed if progress else False,
            'score': progress.score if progress else None,
        }

        if module.module_type == 'quiz':
            config = module.content_data or {}
            module_data['quiz_config'] = {
                'pass_threshold': config.get('pass_threshold', 70),
                'max_attempts': config.get('max_attempts', 3),
                'cooldown_minutes': config.get('cooldown_minutes', 30),
                'shuffle': config.get('shuffle', True),
                'time_limit_minutes': config.get('time_limit_minutes'),
                'attempts_used': progress.attempts if progress else 0,
                'last_attempt_at': progress.last_attempt_at.isoformat() if (progress and progress.last_attempt_at) else None,
            }
        elif module.module_type == 'viva':
            # Never leak the stored expected_answer to students â€” return only
            # the question text + metadata. Grading happens server-side.
            config = module.content_data or {}
            questions = config.get('questions', []) or []
            module_data['viva_config'] = {
                'pass_threshold': config.get('pass_threshold', 70),
                'count': len(questions),
                'questions': [{
                    'index': i,
                    'question': (q or {}).get('question', ''),
                    'topics': (q or {}).get('topics', []),
                    'difficulty': (q or {}).get('difficulty'),
                } for i, q in enumerate(questions)],
                'attempts_used': progress.attempts if progress else 0,
            }
        elif module.module_type == 'assign':
            raw_cfg = dict(module.content_data or {})
            raw_cfg.pop('solution_code', None)
            raw_tcs = raw_cfg.get('test_cases') or []
            raw_cfg['test_cases'] = [
                {'input': tc.get('input', ''), 'expected': tc.get('expected', ''), 'hidden': False}
                if not tc.get('hidden') else {'hidden': True}
                for tc in raw_tcs
            ]
            module_data['content_data'] = raw_cfg
        else:
            # text/pdf/video/markdown/code/image/html/link/file
            module_data['content_data'] = module.content_data

        result.append(module_data)

    pages_out = [{
        'id': p.id,
        'title': p.title,
        'display_order': p.display_order,
        'is_live': p.is_live,
        'release_at': p.release_at.isoformat() if p.release_at else None,
    } for p in visible_pages]

    from app.models.subject import Subject
    exp = Experiment.query.get(experiment_id)
    exp_out = None
    if exp:
        sub = Subject.query.get(exp.subject_id) if exp.subject_id else None
        exp_out = {
            'id': exp.id,
            'title': exp.title,
            'exp_number': exp.exp_number,
            'aim': exp.aim,
            'subject_id': exp.subject_id,
            'subject_name': sub.name if sub else '',
            'subject_code': sub.code if sub else '',
            'icon': (getattr(sub, 'icon', None) or 'datastruct') if sub else 'datastruct',
            'concept_tags': exp.concept_tags or [],
            'difficulty_level': exp.difficulty_level,
            'allowed_languages': exp.allowed_languages or ['python'],
        }

    # Feature 3 — server_now lets the client render assignment/quiz deadline
    # countdowns without trusting its own clock (server time is authoritative).
    return jsonify({'modules': result, 'pages': pages_out, 'experiment': exp_out,
                    'server_now': datetime.utcnow().isoformat() + 'Z'}), 200


@student_bp.route('/prelab/<module_id>/quiz/start', methods=['GET'])
@require_role('student')
def get_quiz_questions(module_id):
    """Get shuffled quiz questions (without correct answers)"""
    from app.services.content_publish import resolve_published_snapshot, get_published_module
    module = ContentModule.query.get_or_404(module_id)
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()

    # Serve the PUBLISHED snapshot so edits made after publishing stay hidden
    # until the instructor republishes. Fall back to live rows when unpublished.
    _snap_mod = get_published_module(
        resolve_published_snapshot(Experiment.query.get(module.experiment_id)), module_id
    )
    config = (_snap_mod.get('content_data') if _snap_mod else module.content_data) or {}
    max_attempts = config.get('max_attempts', 3)
    cooldown_min = config.get('cooldown_minutes', 30)

    # Check attempt limit
    attempts_used = progress.attempts if progress else 0
    if attempts_used >= max_attempts:
        return jsonify({'error': 'Maximum attempts reached. Ask instructor to unlock.'}), 429

    # Check cooldown
    if progress and progress.last_attempt_at:
        next_allowed = progress.last_attempt_at + timedelta(minutes=cooldown_min)
        if datetime.utcnow() < next_allowed:
            wait_sec = int((next_allowed - datetime.utcnow()).total_seconds())
            return jsonify({'error': f'Cooldown active. Try again in {wait_sec} seconds.'}), 429

    # Build questions (never including correct_answer) from the snapshot when
    # available, else from live rows.
    if _snap_mod is not None and _snap_mod.get('questions') is not None:
        questions = [{
            'id': q['id'], 'question_text': q['question_text'],
            'options': q['options'], 'points': q.get('points', 1),
        } for q in _snap_mod['questions']]
    else:
        questions = [{
            'id': q.id, 'question_text': q.question_text,
            'options': q.options, 'points': q.points,
        } for q in QuizQuestion.query.filter_by(module_id=module_id).all()]

    import random
    if config.get('shuffle', True):
        random.shuffle(questions)

    # Feature 3 — optional per-quiz countdown (minutes). server_now lets the
    # client tick without trusting its own clock.
    return jsonify({
        'questions': questions,
        'time_limit_minutes': config.get('time_limit_minutes'),
        'server_now': datetime.utcnow().isoformat() + 'Z',
    }), 200


@student_bp.route('/prelab/<module_id>/quiz/submit', methods=['POST'])
@require_role('student')
def submit_quiz(module_id):
    """Submit quiz answers, get score, update gate status"""
    from app.services.content_publish import resolve_published_snapshot, get_published_module
    module = ContentModule.query.get_or_404(module_id)
    data   = request.get_json()
    answers = data.get('answers', {})   # {question_id: "A"|"B"|"C"|"D"}

    # Grade against the PUBLISHED snapshot so edits after publishing don't change
    # an in-flight quiz. Fall back to live rows when the module isn't snapshotted.
    _snap_mod = get_published_module(
        resolve_published_snapshot(Experiment.query.get(module.experiment_id)), module_id
    )
    if _snap_mod is not None and _snap_mod.get('questions') is not None:
        questions = [{'id': q['id'], 'points': q.get('points', 1),
                      'correct_answer': q.get('correct_answer')} for q in _snap_mod['questions']]
        config = _snap_mod.get('content_data') or {}
    else:
        questions = [{'id': q.id, 'points': q.points, 'correct_answer': q.correct_answer}
                     for q in QuizQuestion.query.filter_by(module_id=module_id).all()]
        config = module.content_data or {}

    # Feature 3 — optional per-quiz time limit (minutes). The client captures
    # server_now when it fetches questions and echoes it back as `started_at`.
    # We never discard work: an over-time submit is still graded (auto-grade)
    # but flagged `timed_out`. A small grace (~15s) absorbs submit latency.
    timed_out = False
    limit_min = config.get('time_limit_minutes')
    if limit_min:
        started_at = _parse_iso_z(data.get('started_at'))
        if started_at is not None:
            elapsed = (datetime.utcnow() - started_at).total_seconds()
            timed_out = elapsed > (float(limit_min) * 60 + 15)

    total_points = sum(q['points'] for q in questions)
    earned_points = sum(
        q['points'] for q in questions
        if answers.get(q['id']) == q['correct_answer']
    )
    score = (earned_points / total_points * 100) if total_points > 0 else 0

    # Update/create progress
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(
            student_id=g.user_id, module_id=module_id,
            attempts=0,          # explicit init â€” column default only applies at flush
            score=0.0,
        )
        db.session.add(progress)

    progress.attempts = (progress.attempts or 0) + 1
    progress.last_attempt_at = datetime.utcnow()
    progress.score = score
    # Per-question breakdown (per-question analytics + most-missed insights)
    progress.answers = {
        q['id']: {
            'answer':  answers.get(q['id']),
            'correct': answers.get(q['id']) == q['correct_answer'],
        }
        for q in questions
    }

    threshold = config.get('pass_threshold', 70)
    if score >= threshold:
        progress.completed  = True
        progress.completed_at = datetime.utcnow()

    db.session.commit()

    # ── Real Data Collection: Persist Grade ──
    try:
        from app.services.grading_service import sync_student_experiment_grade
        sync_student_experiment_grade(g.user_id, module.experiment_id)
    except Exception:
        pass

    # P0: Update concept mastery after quiz submission (with fallback tags)
    try:
        _exp = module.experiment
        if _exp:
            tags = list(_exp.concept_tags or [])
            if not tags:
                if _exp.title:
                    tags.append(_exp.title)
                if _exp.subject and _exp.subject.name:
                    tags.append(_exp.subject.name)
            if not tags:
                tags = ['Knowledge & Concepts']
            update_concept_mastery(
                student_id=g.user_id,
                institution_id=g.institution_id,
                concept_tags=tags,
                result={
                    'passed': score >= threshold,
                    'score_pct': score / 100.0,
                    'attempt_count': progress.attempts,
                    'hints_used': 0,
                    'difficulty': _exp.difficulty_level or 1,
                },
            )
    except Exception:
        pass  # mastery update is non-critical — never block the submission response

    return jsonify({
        'score': round(score, 1),
        'passed': score >= threshold,
        'threshold': threshold,
        'attempts_used': progress.attempts,
        'correct_count': int(earned_points),
        'total_points': total_points,
        'timed_out': timed_out,
    }), 200


# â”€â”€ Session Join â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@student_bp.route('/sessions/<session_id>/check-gate', methods=['GET'])
@require_role('student', 'free_user')
def check_gate(session_id):
    """Check if student passes pre-lab gate for a session.

    A session must be 'active' to hand out a Jitsi room.  A 'scheduled'
    session returns gate status so the student can prepare, but jitsi_room
    stays null until the session starts.  'ended' and 'cancelled' sessions
    never grant access (use the catch-up endpoint instead).
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    experiment_id  = session.experiment_id
    gate_threshold = session.gate_score_threshold

    # Get all quiz modules for this experiment
    quiz_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id, module_type='quiz'
    ).all()

    all_passed = True
    for qm in quiz_modules:
        progress = ContentProgress.query.filter_by(
            student_id=g.user_id, module_id=qm.id
        ).first()
        if not progress or not progress.completed or (progress.score or 0) < gate_threshold:
            all_passed = False
            break

    quiz_gate_passed = all_passed or not quiz_modules

    # Live join is gated ONLY by session status â€” the pre-lab quiz is
    # informational now (product decision: the gate was breaking the join
    # flow). gate_passed is still returned so the UI can show a nudge.
    # The live room is only open inside the scheduled window. A session left
    # 'active' past its end time must not keep handing out room access.
    from datetime import timedelta as _td
    now_utc = datetime.utcnow()
    starts_at = session.scheduled_at
    ends_at = (starts_at + _td(minutes=session.duration_minutes or 60)) if starts_at else None
    window_open = True
    window_state = 'open'
    if ends_at is not None:
        if now_utc < starts_at:
            window_open = False
            window_state = 'upcoming'
        elif now_utc > ends_at:
            window_open = False
            window_state = 'closed'

    can_join_live = session.status == 'active' and window_open

    # Mint the room token before creating attendance. If LiveKit is unavailable,
    # fail closed: a student must not be admitted without compulsory screen share.
    livekit_token = None
    if can_join_live:
        if not current_app.config.get('LIVEKIT_URL'):
            return jsonify({'error': 'Live video is unavailable; screen sharing is required to join this session.'}), 503
        from app.livekit_helper import make_token
        livekit_token = make_token(
            room_name=session.jitsi_room_name,
            identity=f"student-{g.user_id[:8]}",
            name=getattr(g, 'full_name', None) or 'Student',
            can_publish=True,
            can_subscribe=True,
        )
        if not livekit_token:
            return jsonify({'error': 'Live video is unavailable; screen sharing is required to join this session.'}), 503

    # This endpoint is read-only with respect to attendance. The student is
    # marked joined by the session socket only after the required screen
    # share is live; opening the pre-join page alone is not attendance.

    feedback_receipt = SessionFeedbackReceipt.query.filter_by(
        session_id=session_id, student_id=g.user_id
    ).first()
    feedback_attendance = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=g.user_id
    ).first()
    feedback_submitted = bool(feedback_receipt or (feedback_attendance and feedback_attendance.feedback_submitted))

    return jsonify({
        'gate_passed':      quiz_gate_passed,
        'feedback_submitted': feedback_submitted,
        'session':          session.to_dict(),
        'jitsi_room':       session.jitsi_room_name if can_join_live else None,  # kept for compat
        'livekit_token':    livekit_token,
        'livekit_url':      current_app.config.get('LIVEKIT_URL', '') if can_join_live else '',
        'focus_ml_enabled': session.focus_ml_enabled,
        'lockdown_enabled': session.lockdown_enabled,
        'session_status':   session.status,
        'can_join_live':    can_join_live,
        'window_state':     window_state,
        'window_starts_at': _iso_z(starts_at) if starts_at else None,
        'window_ends_at':   _iso_z(ends_at) if ends_at else None,
        'server_now':       _iso_z(now_utc),
        'window_message':   (
            'This session has ended — live access is closed.' if window_state == 'closed'
            else 'This session has not started yet.' if window_state == 'upcoming'
            else None
        ),
    }), 200


# â”€â”€ My Grades & Performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/grades', methods=['GET'])
@require_role('student')
def my_grades():
    grades = Grade.query.filter_by(student_id=g.user_id).all()

    result = []
    for grade in grades:
        # Lock grade once student views it
        if not grade.is_locked and grade.final_grade is not None:
            grade.is_locked = True
        result.append(grade.to_dict())

    db.session.commit()
    return jsonify({'grades': result}), 200


@student_bp.route('/mastery', methods=['GET'])
@require_role('student')
def my_mastery():
    masteries = ConceptMastery.query.filter_by(
        student_id=g.user_id, institution_id=g.institution_id
    ).order_by(ConceptMastery.mastery_score.desc()).all()
    return jsonify({'mastery': [m.to_dict() for m in masteries]}), 200


@student_bp.route('/rankings', methods=['GET'])
@require_role('student')
def my_rankings():
    """Student's rankings — only for section-subjects whose instructor kept
    rankings public (T3-15: the ranking_visible toggle follows the latest
    published experiment of that subject)."""
    # Enrolled section-subjects
    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    sec_ids = [e.section_id for e in enrollments]
    sec_subjects = SectionSubject.query.filter(
        SectionSubject.section_id.in_(sec_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if sec_ids else []

    # ONE engine: the canonical scoring in app/analytics/ranking.py.
    # student_rankings is now a write-through cache of that engine, so the
    # student's own card and the cohort leaderboard can never diverge.
    from app.analytics.ranking import compute_section_subject_ranks

    visible = []
    for ss in sec_subjects:
        latest = (Experiment.query.filter_by(
            subject_id=ss.subject_id, instructor_id=ss.instructor_id,
            is_published=True,
        ).order_by(Experiment.exp_number.desc()).first())
        if latest and latest.ranking_visible is False:
            continue

        try:
            rows = compute_section_subject_ranks(ss.id, g.institution_id)
        except Exception:
            rows = []

        mine = next((r for r in rows if r['student_id'] == g.user_id), None)
        if not mine or mine.get('rank_score') is None:
            continue

        subj = Subject.query.get(ss.subject_id) if ss.subject_id else None
        visible.append({
            'section_subject_id': ss.id,
            'student_id': mine['student_id'],
            'rank_position': mine['rank_position'],
            'rank_score': mine['rank_score'],
            'percentile': mine['percentile'],
            'percentile_available': mine['percentile_available'],
            'cohort_size': len(rows),
            'score_coverage': mine['score_coverage'],
            'score_factors_available': mine['score_factors_available'],
            'score_factors_missing': mine['score_factors_missing'],
            'components': {
                'mastery': mine['mastery_score'],
                'engagement': mine['engagement_score'],
                'effort': mine['effort_score'],
                'efficiency': mine['efficiency_score'],
                'consistency': mine['consistency_score'],
            },
            'updated_at': datetime.utcnow().isoformat(),
            'subject_name': subj.name if subj else None,
            'subject_code': (subj.code or '') if subj else '',
            'subject_color': (subj.color or '#7c3aed') if subj else '#7c3aed',
            'subject_icon': (subj.icon or 'datastruct') if subj else 'datastruct',
        })
    return jsonify({'rankings': visible}), 200


@student_bp.route('/notifications', methods=['GET'])
@require_role('student')
def my_notifications():
    notifications = Notification.query.filter_by(
        user_id=g.user_id
    ).order_by(Notification.created_at.desc()).limit(30).all()

    # Mark all as read
    Notification.query.filter_by(user_id=g.user_id, is_read=False).update({'is_read': True})
    db.session.commit()

    return jsonify({'notifications': [n.to_dict() for n in notifications]}), 200


# â”€â”€ Anonymous Feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/feedback', methods=['POST'])
@require_role('student')
def submit_feedback():
    """Submit one anonymous response per student and ended session."""
    data = request.get_json(silent=True) or {}
    session_id = data.get('session_id')
    if not session_id:
        return jsonify({'error': 'session_id is required.'}), 400

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()
    if session.status != 'ended' or not session.ended_at:
        return jsonify({'error': 'Feedback is available after the session has ended.'}), 400
    if datetime.utcnow() > session.ended_at + timedelta(hours=24):
        return jsonify({'error': 'Feedback window has closed (24 hours after session end).'}), 400

    rating_fields = (
        'experiment_clarity', 'session_pacing', 'ai_hint_helpfulness', 'overall_rating'
    )
    ratings = {}
    for field in rating_fields:
        value = data.get(field)
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
            return jsonify({'error': f'{field} must be an integer from 1 to 5.'}), 400
        ratings[field] = value

    comment = data.get('comment')
    if comment is not None and not isinstance(comment, str):
        return jsonify({'error': 'comment must be text.'}), 400
    comment = comment.strip() if isinstance(comment, str) else ''
    if len(comment) > 2000:
        return jsonify({'error': 'comment must be 2,000 characters or fewer.'}), 400

    # A recorded attendance row is sufficient; otherwise require active enrollment.
    # Never create or modify attendance to track a feedback submission.
    att = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=g.user_id
    ).first()
    if not att:
        enrolled = SectionStudent.query.join(
            SectionSubject, SectionSubject.section_id == SectionStudent.section_id
        ).filter(
            SectionStudent.student_id == g.user_id,
            SectionStudent.section_id == SectionSubject.section_id,
            SectionSubject.id == session.section_subject_id,
            SectionSubject.institution_id == g.institution_id,
        ).first()
        if not enrolled:
            return jsonify({'error': 'You are not enrolled in this session.'}), 403

    if (SessionFeedbackReceipt.query.filter_by(
            session_id=session_id, student_id=g.user_id
        ).first() or (att and att.feedback_submitted)):
        return jsonify({'error': 'You have already submitted feedback for this session.'}), 400

    feedback = SessionFeedback(
        session_id=session_id,
        institution_id=g.institution_id,
        # Student identity is intentionally stored only in the separate receipt table,
        # never on the feedback row returned to instructors or institution admins.
        experiment_clarity=ratings['experiment_clarity'],
        session_pacing=ratings['session_pacing'],
        ai_hint_helpfulness=ratings['ai_hint_helpfulness'],
        overall_rating=ratings['overall_rating'],
        comment=comment or None,
    )
    receipt = SessionFeedbackReceipt(session_id=session_id, student_id=g.user_id)
    db.session.add_all([feedback, receipt])
    if att:
        att.feedback_submitted = True
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'You have already submitted feedback for this session.'}), 400

    return jsonify({'message': 'Feedback submitted anonymously. Thank you!', 'submitted': True}), 201


# â”€â”€ PDF Lab Record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/lab-record/<subject_id>/download', methods=['GET'])
@require_role('student')
def download_lab_record(subject_id):
    """Generate and return PDF lab record URL"""
    from app.services.pdf_service import generate_lab_record_pdf
    pdf_url = generate_lab_record_pdf(g.user_id, subject_id, g.institution_id)
    return jsonify({'pdf_url': pdf_url}), 200


# â”€â”€ Dashboard Aggregate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/dashboard', methods=['GET'])
@require_role('student')
def dashboard():
    """
    Single-call dashboard aggregate â€” subjects, progress, upcoming sessions,
    top concepts, rank, unread notification count.
    """
    # Enrolled sections â†’ subjects
    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]
    section_subjects = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if section_ids else []
    ss_ids = [ss.id for ss in section_subjects]

    # Upcoming sessions (next 7 days, status scheduled or active)
    now = datetime.utcnow()
    upcoming = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids),
        LabSession.status.in_(['scheduled', 'active']),
        or_(
            LabSession.status == 'active',
            LabSession.scheduled_at >= now - timedelta(hours=3)
        ),
        LabSession.scheduled_at <= now + timedelta(days=7)
    ).order_by(LabSession.scheduled_at).limit(5).all() if ss_ids else []

    # Top 5 concept mastery
    top_concepts = ConceptMastery.query.filter(
        ConceptMastery.student_id == g.user_id,
        ConceptMastery.institution_id == g.institution_id,
        ConceptMastery.experiment_count > 0,
    ).order_by(ConceptMastery.mastery_score.desc()).limit(5).all()

    # Weak concepts (below 40)
    weak_concepts = ConceptMastery.query.filter(
        ConceptMastery.student_id == g.user_id,
        ConceptMastery.institution_id == g.institution_id,
        ConceptMastery.experiment_count > 0,
        ConceptMastery.mastery_score < 40
    ).order_by(ConceptMastery.mastery_score).limit(3).all()

    # Overall rank (best rank across all section-subjects)
    best_rank = StudentRanking.query.filter(
        StudentRanking.student_id == g.user_id,
        StudentRanking.institution_id == g.institution_id,
        StudentRanking.section_subject_id.in_(ss_ids) if ss_ids else db.literal(False),
    ).order_by(StudentRanking.rank_score.desc()).first()

    # Grades summary: enrolled + published experiments only; normalize each
    # graded score to 0–100 and weight only experiments with an actual grade.
    grades = []
    enrolled_experiment_map = {}
    if section_subjects:
        subject_ids = list({ss.subject_id for ss in section_subjects})
        enrolled_experiments = Experiment.query.filter(
            Experiment.subject_id.in_(subject_ids),
            Experiment.institution_id == g.institution_id,
            Experiment.is_published.is_(True),
        ).all() if subject_ids else []
        enrolled_experiment_map = {exp.id: exp for exp in enrolled_experiments}
        enrolled_experiment_ids = list(enrolled_experiment_map)
        if enrolled_experiment_ids:
            # A current final grade record per experiment. Missing/ungraded rows,
            # zero-weight items, and invalid scales are excluded from the average.
            grade_rows = Grade.query.filter(
                Grade.student_id == g.user_id,
                Grade.final_grade.isnot(None),
                Grade.experiment_id.in_(enrolled_experiment_ids),
            ).order_by(Grade.created_at.desc(), Grade.graded_at.desc()).all()
            seen_grade_experiments = set()
            for grade in grade_rows:
                if grade.experiment_id not in seen_grade_experiments:
                    grades.append(grade)
                    seen_grade_experiments.add(grade.experiment_id)
    weighted_grade_sum = 0.0
    graded_weight_sum = 0.0
    for grade in grades:
        exp = enrolled_experiment_map.get(grade.experiment_id)
        if not exp:
            continue
        scale = float(exp.grade_scale or 0)
        weight = float(exp.weightage or 0)
        if scale <= 0 or weight <= 0:
            continue
        normalized_grade = max(0.0, min(100.0, float(grade.final_grade) / scale * 100.0))
        weighted_grade_sum += normalized_grade * weight
        graded_weight_sum += weight
    avg_grade = round(weighted_grade_sum / graded_weight_sum, 1) if graded_weight_sum > 0 else None

    # Unread notifications
    unread_count = Notification.query.filter_by(
        user_id=g.user_id, is_read=False
    ).count()

    # Hint usage today — HintLog stores timestamp in `created_at`
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    hints_today = HintLog.query.filter(
        HintLog.student_id == g.user_id,
        HintLog.created_at >= today_start
    ).count()

    # Total submissions
    enrolled_exp_ids = list(enrolled_experiment_map)
    total_submissions = CodeAttempt.query.filter(
        CodeAttempt.student_id == g.user_id,
        CodeAttempt.is_final_submission.is_(True),
        CodeAttempt.experiment_id.in_(enrolled_exp_ids) if enrolled_exp_ids else db.literal(False),
    ).count()

    # Calculate real overall progress percentage
    exp_ids = list(enrolled_experiment_map)
    total_exps = len(exp_ids)
    submitted_exp_ids = {
        r[0] for r in db.session.query(CodeAttempt.experiment_id).filter(
            CodeAttempt.student_id == g.user_id,
            CodeAttempt.experiment_id.in_(exp_ids) if exp_ids else db.literal(False),
            CodeAttempt.is_final_submission.is_(True),
        ).distinct().all()
    }
    completed_exps = len(submitted_exp_ids)
    overall_progress = round((completed_exps / total_exps) * 100) if total_exps > 0 else None

    # Streak is available only when the platform has a persisted XP record; do
    # not substitute a lifetime submission count for a daily streak.
    from app.models.practice import StudentXP
    xp = StudentXP.query.filter_by(student_id=g.user_id).first()
    daily_streak = xp.streak_days if xp else None

    top_concepts_data = [c.to_dict() for c in top_concepts]
    weak_concepts_data = [c.to_dict() for c in weak_concepts]

    return jsonify({
        'subjects_enrolled': len({ss.subject_id for ss in section_subjects}),
        'upcoming_sessions': [s.to_dict() for s in upcoming],
        'top_concepts': top_concepts_data,
        'weak_concepts': weak_concepts_data,
        'best_rank': best_rank.to_dict() if best_rank else None,
        'avg_grade': avg_grade,
        'total_submissions': total_submissions,
        'unread_notifications': unread_count,
        'hints_used_today': hints_today,
        'overall_progress': overall_progress,
        'daily_streak': daily_streak,
    }), 200


# â”€â”€ My Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/sessions', methods=['GET'])
@require_role('student')
def my_sessions():
    """List all sessions the student's sections are enrolled in"""
    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]
    ss = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if section_ids else []
    ss_ids = [s.id for s in ss]

    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids)
    ).order_by(LabSession.scheduled_at.desc()).all() if ss_ids else []
    session_ids = [session.id for session in sessions]
    feedback_done = {row.session_id for row in SessionFeedbackReceipt.query.filter(
        SessionFeedbackReceipt.student_id == g.user_id,
        SessionFeedbackReceipt.session_id.in_(session_ids),
    ).all()} if session_ids else set()

    result = []
    for session in sessions:
        att = SessionAttendance.query.filter_by(
            session_id=session.id, student_id=g.user_id
        ).first()
        d = session.to_dict()
        d['my_attendance'] = att.to_dict() if att else {'status': 'not_recorded'}
        d['my_attendance']['feedback_submitted'] = (
            session.id in feedback_done or bool(att and att.feedback_submitted)
        )
        result.append(d)
    return jsonify({'sessions': result}), 200


# â”€â”€ Catch-up Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/sessions/<session_id>/catchup', methods=['POST'])
@require_role('student')
def start_catchup(session_id):
    """
    Start catch-up attempt for a missed session.
    Allowed only if: catchup_enabled=True, session ended, within catchup_deadline,
    student was absent.
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if not session.catchup_enabled:
        return jsonify({'error': 'Catch-up is not enabled for this session'}), 400
    if session.status != 'ended':
        return jsonify({'error': 'Session has not ended yet'}), 400
    if session.catchup_deadline and datetime.utcnow() > session.catchup_deadline:
        # F4 â€” instructor-granted extension overrides the session deadline
        from app.models.intervention import Extension
        if session.experiment_id:
            ext = Extension.query.filter_by(
                student_id=g.user_id, experiment_id=session.experiment_id,
                excused=False,
            ).filter(Extension.extension_until >= datetime.utcnow()).first()
            if not ext:
                return jsonify({'error': 'Catch-up deadline has passed'}), 400

    # Check student was absent (not already present)
    att = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=g.user_id
    ).first()
    if att and att.status in ('present', 'late', 'partial'):
        return jsonify({'error': 'You already attended this session'}), 400

    # Create or update attendance as catch-up
    if not att:
        att = SessionAttendance(
            session_id=session_id,
            student_id=g.user_id,
            is_catchup=True
        )
        db.session.add(att)

    att.status = 'partial'   # will be finalized when they submit code
    att.is_catchup = True
    att.joined_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message': 'Catch-up session started. Submit your code before the deadline.',
        'experiment_id': session.experiment_id,
        'catchup_deadline': session.catchup_deadline.isoformat() if session.catchup_deadline else None,
        'session_id': session_id,
    }), 200


# â”€â”€ Experiment History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/history', methods=['GET'])
@require_role('student')
def my_experiment_history():
    """All experiments the student has attempted, with latest attempt stats,
    including CodeAttempt, Grade, ExamAttempt, and completed ContentProgress."""
    from app.models.exam import ExamAttempt

    attempts = db.session.query(
        CodeAttempt.experiment_id,
        db.func.max(CodeAttempt.submitted_at).label('last_attempt'),
        db.func.count(CodeAttempt.id).label('total_attempts'),
        db.func.max(CodeAttempt.test_cases_passed).label('best_tests_passed'),
        db.func.max(CodeAttempt.test_cases_total).label('tests_total'),
    ).filter_by(
        student_id=g.user_id
    ).group_by(CodeAttempt.experiment_id).all()

    att_map = {row.experiment_id: row for row in attempts}

    grades = Grade.query.filter_by(student_id=g.user_id).all()
    grade_map = {g_row.experiment_id: g_row for g_row in grades}

    exam_attempts = ExamAttempt.query.filter_by(student_id=g.user_id).all()
    exam_map = {}
    for ea in exam_attempts:
        eid = ea.experiment_id or ea.exam_id
        if eid and (eid not in exam_map or (ea.score or 0) > (exam_map[eid].score or 0)):
            exam_map[eid] = ea

    completed_progs = ContentProgress.query.filter_by(
        student_id=g.user_id, completed=True
    ).all()
    comp_mod_ids = [cp.module_id for cp in completed_progs]
    completed_exp_ids = set()
    if comp_mod_ids:
        modules = ContentModule.query.filter(ContentModule.id.in_(comp_mod_ids)).all()
        for m in modules:
            completed_exp_ids.add(m.experiment_id)

    all_exp_ids = set(att_map.keys()) | set(grade_map.keys()) | set(exam_map.keys()) | completed_exp_ids

    result = []
    for exp_id in all_exp_ids:
        if not exp_id:
            continue
        exp = Experiment.query.get(exp_id)
        if not exp:
            continue
        att_row = att_map.get(exp_id)
        grade_row = grade_map.get(exp_id)
        exam_row = exam_map.get(exp_id)

        last_attempt = None
        if att_row and att_row.last_attempt:
            last_attempt = att_row.last_attempt.isoformat()
        elif exam_row and (exam_row.submitted_at or exam_row.started_at):
            last_attempt = (exam_row.submitted_at or exam_row.started_at).isoformat()
        elif grade_row and (grade_row.graded_at or grade_row.created_at):
            last_attempt = (grade_row.graded_at or grade_row.created_at).isoformat()

        final_grade = None
        if grade_row and grade_row.final_grade is not None:
            final_grade = grade_row.final_grade
        elif exam_row and exam_row.score is not None:
            final_grade = exam_row.score

        result.append({
            'experiment_id': exp_id,
            'experiment_title': exp.title if exp else 'Unknown',
            'concept_tags': exp.concept_tags if exp else [],
            'last_attempt': last_attempt,
            'total_attempts': att_row.total_attempts if att_row else (1 if (exam_row or grade_row) else 0),
            'best_tests_passed': att_row.best_tests_passed if att_row else None,
            'tests_total': att_row.tests_total if att_row else None,
            'grade': final_grade,
        })
    return jsonify({'history': result}), 200


# â”€â”€ Content Progress Mark â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/prelab/<module_id>/complete', methods=['POST'])
@require_role('student')
def mark_module_complete(module_id):
    """
    Mark a text, video, or PDF module as completed.
    (Quiz completion is auto-set by submit_quiz.)
    """
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type == 'quiz':
        return jsonify({'error': 'Quiz completion is set automatically on submit'}), 400

    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id)
        db.session.add(progress)

    progress.completed = True
    progress.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Module marked as complete', 'module_id': module_id}), 200


# â”€â”€ Graded code assignment ('assign' block) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _norm_output(s):
    """Trailing-space + trailing-newline tolerant line-by-line comparison key."""
    text = (s or '').replace('\r\n', '\n').rstrip('\n')
    return '\n'.join(line.rstrip() for line in text.split('\n'))


@student_bp.route('/prelab/<module_id>/assignment/submit', methods=['POST'])
@require_role('student')
@limiter.limit("10 per minute")   # each submit spawns one container per test case
def submit_assignment(module_id):
    """
    Run a student's code for a graded 'assign' block against the block's own
    test cases (kept in content_data â€” migration-free), auto-score, and record
    the attempt.

    Body: { "code": "...", "language": "python" (optional; else content_data.language) }

    Scoring: weighted % of test cases whose stdout matches `expected`
    (status_id 3 + normalized-output match). Best score across attempts is kept;
    `completed` once best >= content_data.pass_threshold (default 60).
    Hidden test cases are graded but never reveal their input/expected/actual.

    NOTE: submission is intentionally UNGATED here; Phase 3 binds it to the
    active LabSession (hybrid delivery model).
    """
    from app.execution.routes import _run_docker
    from app.execution.languages import resolve as resolve_language
    from app.models.experiment import TestCase
    from app.models.conductor import TestCaseResult

    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'assign':
        return jsonify({'error': 'This module is not a graded assignment.'}), 400

    from app.services.content_publish import resolve_published_snapshot, get_published_module
    exp = Experiment.query.get(module.experiment_id)
    # Grade against the PUBLISHED snapshot when available (stable, frozen test
    # cases + config), else fall back to live rows for unpublished/legacy modules.
    _snap_mod = get_published_module(resolve_published_snapshot(exp), module_id)
    cfg = (_snap_mod.get('content_data') if _snap_mod else module.content_data) or {}
    _snap_cases = (_snap_mod.get('test_cases') if _snap_mod else None)

    # Feature 3 — optional hard deadline. Server time is authoritative; reject
    # submissions after due_at (small grace for clock/network latency). An absent
    # due_at means "no deadline", so existing assignments are unaffected.
    _due = _parse_iso_z(cfg.get('due_at'))
    if _due is not None and datetime.utcnow() > _due + timedelta(seconds=15):
        return jsonify({'error': 'The submission deadline for this assignment has passed.',
                        'late': True, 'due_at': cfg.get('due_at')}), 403
    # Prefer the experiment's official TestCase table rows (the SPARK/checkpoint
    # source of truth â€” D4). Fall back to embedded content_data test cases when
    # the experiment has none (pre-existing modules).
    official_cases = TestCase.query.filter_by(experiment_id=exp.id).all() if exp else []

    if _snap_cases:
        # Snapshot-frozen test cases (captured at publish time) — stable grading.
        test_cases = [dict(tc) for tc in _snap_cases]
    elif official_cases:
        # Build the test list from the test_cases table (has id, visible/hidden)
        test_cases = []
        for tc in official_cases:
            if tc.is_hidden:
                test_cases.append({'input': tc.input_data or '', 'expected': tc.expected_output or '',
                                   'hidden': True, 'weight': tc.points_weight or 1, 'tc_id': tc.id})
            else:
                test_cases.append({'input': tc.input_data or '', 'expected': tc.expected_output or '',
                                   'hidden': False, 'weight': tc.points_weight or 1, 'tc_id': tc.id, 'description': tc.description})
    else:
        # Fall back to embedded content_data test cases (no table rows)
        test_cases = cfg.get('test_cases') or []
        for tc in test_cases:
            tc['tc_id'] = None

    if not test_cases:
        return jsonify({'error': 'This assignment has no test cases yet.'}), 400

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'No code submitted.'}), 400

    language = data.get('language') or cfg.get('language') or 'python'
    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unknown language: {language}'}), 400
    if spec['engine'] == 'browser':
        return jsonify({'error': 'Browser languages run client-side only.'}), 400
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    # â”€â”€ Run the submission against each test case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    results = []
    earned = 0.0
    total_weight = 0.0
    passed_count = 0

    packages = data.get('packages') or cfg.get('packages')

    for i, tc in enumerate(test_cases):
        weight = tc.get('weight', 1) or 1
        total_weight += weight
        stdin = str(tc.get('input', '') or '')
        result, error = _run_docker(code, spec['id'], stdin, g.user_id, packages=packages)
        if error:
            # queue full (429) / engine down (503) â€” surface it, grade nothing
            return error
        ok = (result.get('status_id') == 3
              and _norm_output(result.get('stdout')) == _norm_output(str(tc.get('expected', ''))))
        if ok:
            earned += weight
            passed_count += 1
        hidden = bool(tc.get('hidden'))
        row = {'index': i, 'passed': ok, 'hidden': hidden, 'test_case_id': tc.get('tc_id'),
               '_ms': int(result.get('time_ms') or 0)}
        if not hidden:
            row.update({
                'input': stdin,
                'expected': str(tc.get('expected', '')),
                'actual': result.get('stdout', ''),
                'status': result.get('status'),
                'stderr': result.get('stderr') or result.get('compile_output') or '',
            })
        results.append(row)

    score = (earned / total_weight * 100) if total_weight > 0 else 0.0

    # â”€â”€ Upsert progress, keeping the best score across attempts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id, attempts=0, score=0.0)
        db.session.add(progress)
    progress.attempts = (progress.attempts or 0) + 1
    progress.last_attempt_at = datetime.utcnow()
    best = max(progress.score or 0, score)
    progress.score = best
    threshold = cfg.get('pass_threshold', 60)
    if best >= threshold:
        progress.completed = True
        progress.completed_at = datetime.utcnow()

    # â”€â”€ Record the attempt (analytics parity with /execution/run) â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Bind to the student's ACTIVE live session for this experiment (Fix 3) so
    # the SPARK grid attempt count and session-end grade finalization can find
    # it. Fall back to None when no live session is running (prelab solo work).
    active_session = None
    my_sections = [e.section_id for e in SectionStudent.query.filter_by(student_id=g.user_id).all()]
    if my_sections:
        active_session = LabSession.query.join(
            SectionSubject, SectionSubject.id == LabSession.section_subject_id
        ).filter(
            SectionSubject.section_id.in_(my_sections),
            LabSession.experiment_id == module.experiment_id,
            LabSession.status == 'active',
        ).order_by(LabSession.started_at.desc()).first()

    from app.ml.code_quality import analyze_code_quality
    quality_metrics = analyze_code_quality(code, language)

    attempt_count = CodeAttempt.query.filter_by(
        student_id=g.user_id, experiment_id=module.experiment_id
    ).count()
    attempt = CodeAttempt(
        student_id=g.user_id,
        experiment_id=module.experiment_id,
        session_id=active_session.id if active_session else None,
        attempt_number=attempt_count + 1,
        language=language,
        files={'main': code},
        stdin='',
        compile_status='graded',
        test_cases_passed=passed_count,
        test_cases_total=len(test_cases),
        loc=quality_metrics.get('loc'),
        cyclomatic_complexity=quality_metrics.get('cyclomatic_complexity'),
        quality_grade=quality_metrics.get('quality_grade'),
        is_final_submission=True,
    )
    db.session.add(attempt)
    db.session.flush()

    # â”€â”€ Per-test-case results (B12) â€” feeds the analytics failure heatmap â”€â”€
    for row in results:
        if row.get('test_case_id'):
            db.session.add(TestCaseResult(
                attempt_id=attempt.id,
                test_case_id=row['test_case_id'],
                passed=row['passed'],
                execution_time_ms=int((row.get('_ms') or 0)),
            ))

    # â”€â”€ Auto-verify checkpoints (C16 / Fix 3) â€” when a live session is bound â”€â”€
    if active_session:
        from app.models.conductor import CheckpointProgress, Checkpoint
        passed_ids = {r['test_case_id'] for r in results if r.get('passed') and r.get('test_case_id')}
        if passed_ids:
            cps = Checkpoint.query.filter_by(experiment_id=module.experiment_id).all()
            for cp in cps:
                mapped = set(cp.test_case_ids or [])
                if mapped and mapped.issubset(passed_ids):
                    prog = CheckpointProgress.query.filter_by(
                        session_id=active_session.id, student_id=g.user_id, checkpoint_id=cp.id).first()
                    if not prog:
                        prog = CheckpointProgress(
                            session_id=active_session.id, student_id=g.user_id, checkpoint_id=cp.id)
                        db.session.add(prog)
                    if prog.status in ('pending', 'claimed', 'failed'):
                        prog.status = 'verified'
                        prog.passed_at = datetime.utcnow()
                        prog.last_signal_at = datetime.utcnow()

    db.session.commit()

    # ── Real Data Collection: Persist Grade ──
    try:
        from app.services.grading_service import sync_student_experiment_grade
        sync_student_experiment_grade(
            g.user_id, module.experiment_id, session_id=active_session.id if active_session else None
        )
    except Exception:
        pass

    # P0: Update concept mastery after coding assignment submission (with fallback tags)
    try:
        _exp = module.experiment
        if _exp:
            tags = list(_exp.concept_tags or [])
            if not tags:
                if _exp.title:
                    tags.append(_exp.title)
                if _exp.subject and _exp.subject.name:
                    tags.append(_exp.subject.name)
            if not tags:
                tags = ['Programming Fundamentals']

            _hints = HintLog.query.filter_by(
                student_id=g.user_id, experiment_id=_exp.id).count()
            update_concept_mastery(
                student_id=g.user_id,
                institution_id=g.institution_id,
                concept_tags=tags,
                result={
                    'passed': best >= threshold,
                    'score_pct': best / 100.0,
                    'attempt_count': progress.attempts,
                    'hints_used': _hints,
                    'difficulty': _exp.difficulty_level or 1,
                },
            )
    except Exception:
        pass  # mastery update is non-critical — never block the submission response

    return jsonify({
        'score': round(score, 1),
        'best_score': round(best, 1),
        'passed': best >= threshold,
        'threshold': threshold,
        'passed_tests': passed_count,
        'total_tests': len(test_cases),
        'attempts_used': progress.attempts,
        'results': results,
    }), 200


# â”€â”€ AI Viva ('viva' block) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@student_bp.route('/prelab/<module_id>/viva/submit', methods=['POST'])
@require_role('student')
@limiter.limit("6 per minute")   # each submit calls the LLM once per question
def submit_viva(module_id):
    """
    Grade a student's answers to an author-time AI Viva block.

    The block's content_data holds the generated questions with their
    `expected_answer` (never sent to the student â€” see get_prelab_content).
    Each submitted answer is scored 0â€“10 by the LLM against the expected
    answer; the block score is the mean, scaled to 0â€“100. `completed` once
    score >= content_data.pass_threshold (default 70).

    Body: { "answers": { "<index>": "student answer text", ... } }
    Returns: { score, passed, threshold, per_question: [...], attempts_used }
    """
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'viva':
        return jsonify({'error': 'This module is not a viva block.'}), 400

    cfg = module.content_data or {}
    questions = cfg.get('questions') or []
    if not questions:
        return jsonify({'error': 'This viva has no questions yet.'}), 400

    data = request.get_json() or {}
    answers = data.get('answers') or {}
    if not isinstance(answers, dict):
        return jsonify({'error': 'answers must be an object keyed by question index.'}), 400

    from app.ai.groq_client import groq_chat
    import json as _json
    import re as _re

    per_question = []
    total_score = 0.0
    for i, q in enumerate(questions):
        q = q or {}
        question_text  = q.get('question', '')
        expected       = q.get('expected_answer', '')
        student_answer = str(answers.get(str(i), answers.get(i, '')) or '').strip()

        if not student_answer:
            per_question.append({'index': i, 'score': 0, 'feedback': 'No answer provided.'})
            continue

        system_prompt = (
            "You are grading a student's oral-exam (viva) answer against a model answer. "
            'Return ONLY valid JSON: {"score": <0-10 integer>, "feedback": "<one short sentence>"}. '
            'Score guide: 9-10=excellent, 7-8=good, 5-6=partial, 3-4=weak, 0-2=incorrect or off-topic.'
        )
        user_msg = (
            f"Question: {question_text}\n"
            f"Model answer: {expected}\n"
            f"Student answer: {student_answer}"
        )
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_msg},
        ]
        try:
            from app.ai.gate import guarded_ai_call
            response, _, _, _ = guarded_ai_call(
                feature='viva',
                institution_id=g.institution_id,
                user_id=g.user_id,
                role='student',
                messages=messages,
                pool='fast',
                max_tokens=80,
                temperature=0.1,
            )
            match = _re.search(r'\{.*\}', response or '', _re.DOTALL)
            parsed = _json.loads(match.group()) if match else {}
            q_score = int(parsed.get('score', 5))
            feedback = str(parsed.get('feedback', ''))[:300]
        except Exception:
            try:
                response, _, _, _ = groq_chat(messages, pool='fast', max_tokens=80, temperature=0.1)
                match = _re.search(r'\{.*\}', response or '', _re.DOTALL)
                parsed = _json.loads(match.group()) if match else {}
                q_score = int(parsed.get('score', 5))
                feedback = str(parsed.get('feedback', ''))[:300]
            except Exception:
                q_score = 5
                feedback = 'Could not evaluate automatically.'
        q_score = max(0, min(10, q_score))
        total_score += q_score
        per_question.append({'index': i, 'score': q_score, 'feedback': feedback})

    # Mean of 0–10 scores → 0–100
    score = (total_score / len(questions) * 10) if questions else 0.0

    # Upsert progress, keeping the best score across attempts
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id, attempts=0, score=0.0)
        db.session.add(progress)
    progress.attempts = (progress.attempts or 0) + 1
    progress.last_attempt_at = datetime.utcnow()
    best = max(progress.score or 0, score)
    progress.score = best
    threshold = cfg.get('pass_threshold', 70)
    if best >= threshold:
        progress.completed = True
        progress.completed_at = datetime.utcnow()
    db.session.commit()

    # ── Real Data Collection: Persist Grade ──
    try:
        from app.services.grading_service import sync_student_experiment_grade
        sync_student_experiment_grade(g.user_id, module.experiment_id)
    except Exception:
        pass

    # P0: Update concept mastery after viva submission (with fallback tags)
    try:
        _exp = module.experiment
        if _exp:
            tags = list(_exp.concept_tags or [])
            if not tags:
                if _exp.title:
                    tags.append(_exp.title)
                if _exp.subject and _exp.subject.name:
                    tags.append(_exp.subject.name)
            if not tags:
                tags = ['Oral Examination & Viva']
            update_concept_mastery(
                student_id=g.user_id,
                institution_id=g.institution_id,
                concept_tags=tags,
                result={
                    'passed': best >= threshold,
                    'score_pct': best / 100.0,
                    'attempt_count': progress.attempts,
                    'hints_used': 0,
                    'difficulty': _exp.difficulty_level or 1,
                },
            )
    except Exception:
        pass  # mastery update is non-critical — never block the submission response

    return jsonify({
        'score': round(score, 1),
        'best_score': round(best, 1),
        'passed': best >= threshold,
        'threshold': threshold,
        'per_question': per_question,
        'attempts_used': progress.attempts,
    }), 200


# â”€â”€ Student search (shell search bar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/search', methods=['GET'])
@require_role('student', 'free_user')
def student_search():
    """
    Cross-entity search for the student shell.
    ?q=<text> â€” matches my lab sessions (title), my experiments (title),
    and practice-library problems (title). â‰¤8 results per type.
    """
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({'results': []}), 200
    like = f'%{q}%'
    results = []

    # My lab sessions (through my sections' section-subjects)
    my_ss_ids = [ss.id for ss in SectionSubject.query.filter(
        SectionSubject.institution_id == g.institution_id,
        SectionSubject.section_id.in_(
            [e.section_id for e in SectionStudent.query.filter_by(
                student_id=g.user_id).all()]
        )).all()]
    if my_ss_ids:
        for s in (LabSession.query.filter(
                LabSession.section_subject_id.in_(my_ss_ids),
                LabSession.title.ilike(like),
        ).order_by(LabSession.scheduled_at.desc()).limit(8).all()):
            results.append({
                'type': 'session', 'id': s.id,
                'label': s.title or 'Lab session',
                'sub_label': f'{s.status} Â· {s.scheduled_at.strftime("%d %b") if s.scheduled_at else ""}',
                'link': '/student/live-lab',
            })

    # My subjects' experiments (course content)
    if g.institution_id and my_ss_ids:
        seen_subjects = {ss.subject_id for ss in SectionSubject.query.filter(
            SectionSubject.id.in_(my_ss_ids)).all()}
        for e in (Experiment.query.filter(
                Experiment.institution_id == g.institution_id,
                Experiment.subject_id.in_(seen_subjects),
                Experiment.title.ilike(like),
        ).limit(6).all()):
            from app.models.subject import Subject as _Subject
            subj = _Subject.query.get(e.subject_id)
            results.append({
                'type': 'experiment', 'id': e.id,
                'label': e.title,
                'sub_label': f'{subj.name if subj else "Subject"} Â· Exp #{e.exp_number}',
                'link': '/student/subjects',
            })

    # Practice library problems
    from app.models.practice import Problem as _P
    for p in (_P.query.filter(
            _P.is_active == True,  # noqa: E712
            _P.title.ilike(like),
    ).order_by(_P.lc_id.asc()).limit(8).all()):
        results.append({
            'type': 'problem', 'id': p.id,
            'label': p.title,
            'sub_label': f'{p.difficulty} Â· {p.nexlab_topic}',
            'link': '/student/practice',
        })

    return jsonify({'results': results}), 200


# ── Student Announcements & Engagement ──────────────────────────────────────

@student_bp.route('/announcements', methods=['GET'])
@require_role('student')
def student_announcements():
    """
    List all announcements targeted to the current student.
    Includes read status, like status, priority badges, and attachments.
    """
    from app.models.announcement import Announcement, AnnouncementInteraction
    from app.models.academic import SectionStudent, Section, Batch
    from app.models.user import User

    user = User.query.get(g.user_id)
    iid = g.institution_id

    # Find student's sections and batches
    enrolled_sections = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrolled_sections]
    enrolled_section_subject_ids = [row.id for row in SectionSubject.query.filter(
        SectionSubject.institution_id == iid,
        SectionSubject.section_id.in_(section_ids),
    ).all()] if section_ids else []

    batch_ids = []
    acad_years = []
    if section_ids:
        secs = Section.query.filter(Section.id.in_(section_ids)).all()
        for s in secs:
            if s.batch_id:
                batch_ids.append(s.batch_id)
        if batch_ids:
            batches = Batch.query.filter(Batch.id.in_(batch_ids)).all()
            for b in batches:
                if b.academic_year:
                    try:
                        acad_years.append(int(str(b.academic_year)[:4]))
                    except ValueError:
                        pass

    # Build audience match condition:
    # 1. Matches institution
    # 2. Status is sent
    # 3. Target is 'all' or 'students' or 'custom'
    # 4. If department_id specified, matches user's department
    # 5. If section_id specified, matches student's sections
    # 6. If batch_id specified, matches student's batches
    # 7. If academic_year specified, matches student's years
    announcements = (
        Announcement.query.filter_by(institution_id=iid, status='sent')
        .order_by(Announcement.sent_at.desc(), Announcement.created_at.desc())
        .all()
    )

    eligible = []
    for a in announcements:
        if a.target == 'instructors':
            continue

        # Department filter check
        if a.department_id and a.department_id != user.department_id:
            continue

        # Section / section-subject restrictions are both enforced; a custom
        # class notice must not leak to other students in the institution.
        if a.section_id and a.section_id not in section_ids:
            continue
        if a.section_subject_id and a.section_subject_id not in enrolled_section_subject_ids:
            continue

        if a.batch_id and a.batch_id not in batch_ids:
            continue
        if a.academic_year and a.academic_year not in acad_years:
            continue

        eligible.append(a)

    # Attach interaction metadata
    results = []
    unread_count = 0
    for a in eligible:
        item = a.to_dict(current_user_id=g.user_id)
        if not item.get('is_read'):
            unread_count += 1
        results.append(item)

    return jsonify({
        'announcements': results,
        'unread_count': unread_count,
        'total': len(results),
    }), 200


def _student_can_access_announcement(announcement):
    """Re-check audience scope for reads/likes, not just the initial feed query."""
    from app.models.academic import Section, SectionStudent, Batch
    user = User.query.get(g.user_id)
    if not user or announcement.target == 'instructors':
        return False
    if announcement.department_id and announcement.department_id != user.department_id:
        return False

    section_ids = [row.section_id for row in SectionStudent.query.filter_by(student_id=g.user_id).all()]
    if announcement.section_id and announcement.section_id not in section_ids:
        return False
    if announcement.section_subject_id:
        match = SectionSubject.query.filter_by(
            id=announcement.section_subject_id,
            institution_id=g.institution_id,
        ).filter(SectionSubject.section_id.in_(section_ids or ['__none__'])).first()
        if not match:
            return False

    batch_ids = []
    acad_years = []
    if section_ids:
        for section in Section.query.filter(Section.id.in_(section_ids)).all():
            if section.batch_id:
                batch_ids.append(section.batch_id)
        if batch_ids:
            for batch in Batch.query.filter(Batch.id.in_(batch_ids)).all():
                if batch.academic_year:
                    try:
                        acad_years.append(int(str(batch.academic_year)[:4]))
                    except (TypeError, ValueError):
                        pass
    if announcement.batch_id and announcement.batch_id not in batch_ids:
        return False
    if announcement.academic_year and announcement.academic_year not in acad_years:
        return False
    return True


@student_bp.route('/announcements/<announcement_id>/read', methods=['POST'])
@require_role('student')
def mark_announcement_read(announcement_id):
    """
    Mark an announcement as read by this student and increment views.
    """
    from app.models.announcement import Announcement, AnnouncementInteraction
    from app.models.feedback import Notification

    ann = Announcement.query.filter_by(id=announcement_id, institution_id=g.institution_id, status='sent').first_or_404()
    if not _student_can_access_announcement(ann):
        return jsonify({'error': 'Announcement not found.'}), 404

    interaction = AnnouncementInteraction.query.filter_by(
        announcement_id=ann.id, user_id=g.user_id
    ).first()

    first_time_read = False
    if not interaction:
        interaction = AnnouncementInteraction(
            announcement_id=ann.id,
            user_id=g.user_id,
            read_at=datetime.utcnow(),
            liked=False,
        )
        db.session.add(interaction)
        first_time_read = True
    elif not interaction.read_at:
        interaction.read_at = datetime.utcnow()
        first_time_read = True

    if first_time_read:
        ann.views_count = (ann.views_count or 0) + 1

    # Also mark any matching Notification row read
    Notification.query.filter_by(user_id=g.user_id, title=ann.title).update({'is_read': True})

    db.session.commit()

    return jsonify({
        'message': 'Marked read',
        'is_read': True,
        'views_count': ann.views_count,
        'read_at': interaction.read_at.isoformat() + 'Z',
    }), 200


@student_bp.route('/announcements/<announcement_id>/like', methods=['POST'])
@require_role('student')
def toggle_announcement_like(announcement_id):
    """
    Toggle like for an announcement.
    """
    from app.models.announcement import Announcement, AnnouncementInteraction

    ann = Announcement.query.filter_by(id=announcement_id, institution_id=g.institution_id, status='sent').first_or_404()
    if not _student_can_access_announcement(ann):
        return jsonify({'error': 'Announcement not found.'}), 404

    interaction = AnnouncementInteraction.query.filter_by(
        announcement_id=ann.id, user_id=g.user_id
    ).first()

    if not interaction:
        interaction = AnnouncementInteraction(
            announcement_id=ann.id,
            user_id=g.user_id,
            read_at=datetime.utcnow(),
            liked=True,
        )
        db.session.add(interaction)
        ann.views_count = (ann.views_count or 0) + 1
        ann.likes_count = (ann.likes_count or 0) + 1
    else:
        interaction.liked = not interaction.liked
        if interaction.liked:
            ann.likes_count = (ann.likes_count or 0) + 1
        else:
            ann.likes_count = max(0, (ann.likes_count or 1) - 1)

    db.session.commit()

    return jsonify({
        'liked': interaction.liked,
        'likes_count': ann.likes_count,
    }), 200


@student_bp.route('/sessions/<session_id>/proctor-event', methods=['POST'])
@student_bp.route('/proctor-event', methods=['POST'])
@require_role('student', 'free_user')
def record_proctor_event(session_id=None):
    """
    REST telemetry ingest for proctoring events (beacon / fallback when websocket disconnected).
    Body: { "session_id"?: string, "event_type": string, "payload"?: dict, "severity"?: string }
    """
    data = request.get_json(silent=True) or {}
    sid = session_id or data.get('session_id')
    event_type = data.get('event_type') or data.get('type') or 'violation'
    payload = data.get('payload') or {}
    severity = data.get('severity') or 'medium'

    # Auto-resolve session_id if omitted
    if not sid:
        from app.models.session import SessionAttendance
        att = SessionAttendance.query.filter_by(student_id=g.user_id, left_at=None).order_by(SessionAttendance.joined_at.desc()).first()
        if not att:
            att = SessionAttendance.query.filter_by(student_id=g.user_id).order_by(SessionAttendance.joined_at.desc()).first()
        if att:
            sid = att.session_id

    if not sid:
        # Fallback to active section session
        from app.models.academic import SectionStudent, SectionSubject
        my_secs = [s.section_id for s in SectionStudent.query.filter_by(student_id=g.user_id).all()]
        if my_secs:
            active_s = LabSession.query.join(
                SectionSubject, SectionSubject.id == LabSession.section_subject_id
            ).filter(
                SectionSubject.section_id.in_(my_secs),
                LabSession.status == 'active'
            ).order_by(LabSession.started_at.desc()).first()
            if active_s:
                sid = active_s.id

    if not sid:
        return jsonify({'error': 'No active or recent session found for telemetry'}), 400

    from app.models.proctor_event import ProctorEvent
    from app.extensions import socketio

    try:
        pe = ProctorEvent(
            institution_id=g.institution_id,
            session_id=sid,
            student_id=g.user_id,
            event_type=event_type,
            payload=payload,
            severity=severity,
        )
        db.session.add(pe)
        db.session.commit()

        # Relay to instructor socket room if active
        try:
            socketio.emit('proctor_alert', {
                'type': event_type,
                'student_id': g.user_id,
                'full_name': getattr(g, 'user_name', ''),
                'detail': payload.get('detail') or f"Telemetry: {event_type}",
                'severity': severity,
                'timestamp': datetime.utcnow().isoformat(),
            }, room=f"session_{sid}_instructor")
        except Exception:
            pass

        return jsonify({'message': 'Proctor event recorded', 'id': pe.id}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': 'Failed to persist proctor event'}), 500


