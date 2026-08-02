"""
Student Blueprint
Handles: pre-lab content, quiz gate, join session, view grades, analytics
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import Experiment, ContentModule, ContentProgress, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt
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
