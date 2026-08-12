"""
Student Blueprint
Handles: dashboard, pre-lab content, quiz gate, join session, catch-up,
         grades, analytics, notifications, feedback, lab record
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import Experiment, ContentModule, ContentProgress, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, HintLog
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.models.feedback import SessionFeedback, Notification
from app.models.academic import SectionSubject, SectionStudent
from datetime import datetime, timedelta

student_bp = Blueprint('student', __name__)


# ── My Subjects & Experiments ─────────────────────────────────────────────────

@student_bp.route('/subjects', methods=['GET'])
@require_role('student')
def my_subjects():
    """All section-subjects the student is enrolled in"""
    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]

    section_subjects = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all()

    result = []
    for ss in section_subjects:
        from app.models.subject import Subject
        subject = Subject.query.get(ss.subject_id)
        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name if subject else '',
            'subject_code': subject.code if subject else '',
            'instructor_id': ss.instructor_id,
        })
    return jsonify({'subjects': result}), 200


@student_bp.route('/experiments/<subject_id>', methods=['GET'])
@require_role('student')
def list_experiments(subject_id):
    """Published experiments for a subject"""
    exps = Experiment.query.filter_by(
        subject_id=subject_id,
        institution_id=g.institution_id,
        is_published=True
    ).order_by(Experiment.exp_number).all()
    return jsonify({'experiments': [e.to_dict() for e in exps]}), 200


# ── Pre-Lab Content & Gate ─────────────────────────────────────────────────────

@student_bp.route('/prelab/<experiment_id>', methods=['GET'])
@require_role('student')
def get_prelab_content(experiment_id):
    """Get all content modules for an experiment (in display order)"""
    modules = ContentModule.query.filter_by(
        experiment_id=experiment_id
    ).order_by(ContentModule.display_order).all()

    result = []
    for module in modules:
        # Get student's progress on this module
        progress = ContentProgress.query.filter_by(
            student_id=g.user_id, module_id=module.id
        ).first()

        module_data = {
            'id': module.id,
            'type': module.module_type,
            'title': module.title,
            'display_order': module.display_order,
            'completed': progress.completed if progress else False,
            'score': progress.score if progress else None,
        }

        # Only include content_data for text/pdf/video (not quiz answers)
        if module.module_type != 'quiz':
            module_data['content_data'] = module.content_data
        else:
            config = module.content_data or {}
            module_data['quiz_config'] = {
                'pass_threshold': config.get('pass_threshold', 70),
                'max_attempts': config.get('max_attempts', 3),
                'cooldown_minutes': config.get('cooldown_minutes', 30),
                'shuffle': config.get('shuffle', True),
                'attempts_used': progress.attempts if progress else 0,
                'last_attempt_at': progress.last_attempt_at.isoformat() if (progress and progress.last_attempt_at) else None,
            }

        result.append(module_data)

    return jsonify({'modules': result}), 200


@student_bp.route('/prelab/<module_id>/quiz/start', methods=['GET'])
@require_role('student')
def get_quiz_questions(module_id):
    """Get shuffled quiz questions (without correct answers)"""
    module = ContentModule.query.get_or_404(module_id)
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()

    config = module.content_data or {}
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

    questions = QuizQuestion.query.filter_by(module_id=module_id).all()
    import random
    if config.get('shuffle', True):
        random.shuffle(questions)

    # Never return correct_answer to student
    return jsonify({'questions': [{
        'id': q.id,
        'question_text': q.question_text,
        'options': q.options,
        'points': q.points,
    } for q in questions]}), 200


@student_bp.route('/prelab/<module_id>/quiz/submit', methods=['POST'])
@require_role('student')
def submit_quiz(module_id):
    """Submit quiz answers, get score, update gate status"""
    module = ContentModule.query.get_or_404(module_id)
    data   = request.get_json()
    answers = data.get('answers', {})   # {question_id: "A"|"B"|"C"|"D"}

    questions = QuizQuestion.query.filter_by(module_id=module_id).all()
    total_points = sum(q.points for q in questions)
    earned_points = sum(
        q.points for q in questions
        if answers.get(q.id) == q.correct_answer
    )
    score = (earned_points / total_points * 100) if total_points > 0 else 0

    # Update/create progress
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id)
        db.session.add(progress)

    progress.attempts += 1
    progress.last_attempt_at = datetime.utcnow()
    progress.score = score

    config = module.content_data or {}
    threshold = config.get('pass_threshold', 70)
    if score >= threshold:
        progress.completed  = True
        progress.completed_at = datetime.utcnow()

    db.session.commit()

    return jsonify({
        'score': round(score, 1),
        'passed': score >= threshold,
        'threshold': threshold,
        'attempts_used': progress.attempts,
        'correct_count': int(earned_points),
        'total_points': total_points,
    }), 200


# ── Session Join ───────────────────────────────────────────────────────────────

@student_bp.route('/sessions/<session_id>/check-gate', methods=['GET'])
@require_role('student')
def check_gate(session_id):
    """Check if student passes pre-lab gate for a session"""
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

    return jsonify({
        'gate_passed': all_passed or not quiz_modules,  # Pass if no quiz modules
        'session': session.to_dict(),
        'jitsi_room': session.jitsi_room_name if (all_passed or not quiz_modules) else None,
        'focus_ml_enabled': session.focus_ml_enabled,
        'lockdown_enabled': session.lockdown_enabled,
    }), 200


# ── My Grades & Performance ────────────────────────────────────────────────────

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
    rankings = StudentRanking.query.filter_by(student_id=g.user_id).all()
    return jsonify({'rankings': [r.to_dict() for r in rankings]}), 200


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


# ── Anonymous Feedback ─────────────────────────────────────────────────────────

@student_bp.route('/feedback', methods=['POST'])
@require_role('student')
def submit_feedback():
    """Submit anonymous session feedback — student_id is NOT stored"""
    data = request.get_json()
    session_id = data.get('session_id')

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    # Check feedback window (24 hours after session ended)
    if session.ended_at and datetime.utcnow() > session.ended_at + timedelta(hours=24):
        return jsonify({'error': 'Feedback window has closed (24 hours after session end)'}), 400

    feedback = SessionFeedback(
        session_id=session_id,
        institution_id=g.institution_id,
        # Intentionally NO student_id
        experiment_clarity=data.get('experiment_clarity'),
        session_pacing=data.get('session_pacing'),
        ai_hint_helpfulness=data.get('ai_hint_helpfulness'),
        overall_rating=data.get('overall_rating'),
        comment=data.get('comment'),
    )
    db.session.add(feedback)
    db.session.commit()
    return jsonify({'message': 'Feedback submitted anonymously. Thank you!'}), 201


# ── PDF Lab Record ─────────────────────────────────────────────────────────────

@student_bp.route('/lab-record/<subject_id>/download', methods=['GET'])
@require_role('student')
def download_lab_record(subject_id):
    """Generate and return PDF lab record URL"""
    from app.services.pdf_service import generate_lab_record_pdf
    pdf_url = generate_lab_record_pdf(g.user_id, subject_id, g.institution_id)
    return jsonify({'pdf_url': pdf_url}), 200


# ── Dashboard Aggregate ────────────────────────────────────────────────────────

@student_bp.route('/dashboard', methods=['GET'])
@require_role('student')
def dashboard():
    """
    Single-call dashboard aggregate — subjects, progress, upcoming sessions,
    top concepts, rank, unread notification count.
    """
    # Enrolled sections → subjects
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
        LabSession.scheduled_at >= now,
        LabSession.scheduled_at <= now + timedelta(days=7)
    ).order_by(LabSession.scheduled_at).limit(5).all() if ss_ids else []

    # Top 5 concept mastery
    top_concepts = ConceptMastery.query.filter_by(
        student_id=g.user_id, institution_id=g.institution_id
    ).order_by(ConceptMastery.mastery_score.desc()).limit(5).all()

    # Weak concepts (below 40)
    weak_concepts = ConceptMastery.query.filter(
        ConceptMastery.student_id == g.user_id,
        ConceptMastery.institution_id == g.institution_id,
        ConceptMastery.mastery_score < 40
    ).order_by(ConceptMastery.mastery_score).limit(3).all()

    # Overall rank (best rank across all section-subjects)
    best_rank = StudentRanking.query.filter_by(
        student_id=g.user_id, institution_id=g.institution_id
    ).order_by(StudentRanking.rank_score.desc()).first()

    # Grades summary
    grades = Grade.query.filter_by(student_id=g.user_id).all()
    avg_grade = (sum(g2.final_grade for g2 in grades if g2.final_grade is not None) /
                 len([g2 for g2 in grades if g2.final_grade is not None])) if any(
        g2.final_grade is not None for g2 in grades) else None

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
    total_submissions = CodeAttempt.query.filter_by(
        student_id=g.user_id, is_final_submission=True
    ).count()

    return jsonify({
        'subjects_enrolled': len(section_subjects),
        'upcoming_sessions': [s.to_dict() for s in upcoming],
        'top_concepts': [c.to_dict() for c in top_concepts],
        'weak_concepts': [c.to_dict() for c in weak_concepts],
        'best_rank': best_rank.to_dict() if best_rank else None,
        'avg_grade': round(avg_grade, 1) if avg_grade else None,
        'total_submissions': total_submissions,
        'unread_notifications': unread_count,
        'hints_used_today': hints_today,
    }), 200


# ── My Sessions ────────────────────────────────────────────────────────────────

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

    result = []
    for session in sessions:
        att = SessionAttendance.query.filter_by(
            session_id=session.id, student_id=g.user_id
        ).first()
        d = session.to_dict()
        d['my_attendance'] = att.to_dict() if att else {'status': 'absent'}
        result.append(d)
    return jsonify({'sessions': result}), 200


# ── Catch-up Mode ──────────────────────────────────────────────────────────────

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


# ── Experiment History ─────────────────────────────────────────────────────────

@student_bp.route('/history', methods=['GET'])
@require_role('student')
def my_experiment_history():
    """All experiments the student has attempted, with latest attempt stats"""
    attempts = db.session.query(
        CodeAttempt.experiment_id,
        db.func.max(CodeAttempt.submitted_at).label('last_attempt'),
        db.func.count(CodeAttempt.id).label('total_attempts'),
        db.func.max(CodeAttempt.test_cases_passed).label('best_tests_passed'),
        db.func.max(CodeAttempt.test_cases_total).label('tests_total'),
    ).filter_by(
        student_id=g.user_id
    ).group_by(CodeAttempt.experiment_id).all()

    result = []
    for row in attempts:
        exp = Experiment.query.get(row.experiment_id)
        grade = Grade.query.filter_by(
            student_id=g.user_id, experiment_id=row.experiment_id
        ).first()
        result.append({
            'experiment_id': row.experiment_id,
            'experiment_title': exp.title if exp else 'Unknown',
            'concept_tags': exp.concept_tags if exp else [],
            'last_attempt': row.last_attempt.isoformat() if row.last_attempt else None,
            'total_attempts': row.total_attempts,
            'best_tests_passed': row.best_tests_passed,
            'tests_total': row.tests_total,
            'grade': grade.final_grade if grade else None,
        })
    return jsonify({'history': result}), 200


# ── Content Progress Mark ──────────────────────────────────────────────────────

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
