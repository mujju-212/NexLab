"""
Instructor — Standalone Timed Exams.

Authoring + management of Exam entities: settings, availability window,
MCQ/coding questions, publish/unpublish, and per-student attempt results.

All routes are scoped to the instructor's institution and require the
'instructor' or 'institution_admin' role.
"""
from datetime import datetime

from flask import Blueprint, request, jsonify, g
from sqlalchemy import func

from app.auth.utils import require_role
from app.extensions import db
from app.models.exam import Exam, ExamQuestion, ExamAttempt
from app.models.user import User
from app.models.subject import Subject

exam_bp = Blueprint('instructor_exams', __name__)


def _parse_dt(raw):
    """Parse an ISO-8601 datetime (with/without 'Z' or '+00:00') → naive UTC.

    Returns None when raw is None/empty. Raises ValueError on a bad format.
    """
    if raw is None or raw == '':
        return None
    s = str(raw).replace('Z', '+00:00')
    return datetime.fromisoformat(s).replace(tzinfo=None)


def _exam_or_404(exam_id):
    return Exam.query.filter_by(
        id=exam_id, institution_id=g.institution_id
    ).first_or_404()


# ══════════════════════════════════════════════════════════════════
# EXAMS — CRUD
# ══════════════════════════════════════════════════════════════════

@exam_bp.route('/exams', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_exams():
    """List all exams for the institution (optionally filtered by subject_id)."""
    q = Exam.query.filter_by(institution_id=g.institution_id)
    subject_id = request.args.get('subject_id')
    if subject_id:
        q = q.filter_by(subject_id=subject_id)
    exams = q.order_by(Exam.created_at.desc()).all()

    # Attempt counts per exam (single grouped query)
    counts = dict(
        db.session.query(ExamAttempt.exam_id, func.count(ExamAttempt.id))
        .filter(ExamAttempt.exam_id.in_([e.id for e in exams]))
        .group_by(ExamAttempt.exam_id).all()
    ) if exams else {}

    subjects = {s.id: s for s in Subject.query.filter(
        Subject.id.in_({e.subject_id for e in exams})).all()} if exams else {}

    result = []
    for e in exams:
        d = e.to_dict()
        d['attempt_count'] = counts.get(e.id, 0)
        subj = subjects.get(e.subject_id)
        d['subject_name'] = subj.name if subj else ''
        d['subject_code'] = subj.code if subj else ''
        result.append(d)
    return jsonify({'exams': result, 'count': len(result)}), 200


@exam_bp.route('/exams', methods=['POST'])
@require_role('instructor', 'institution_admin')
def create_exam():
    """Create an exam (settings only — questions are added afterwards)."""
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    subject_id = data.get('subject_id')
    if not title:
        return jsonify({'error': 'title is required.'}), 400
    if not subject_id:
        return jsonify({'error': 'subject_id is required.'}), 400
    # Subject must belong to this institution
    subj = Subject.query.filter_by(id=subject_id, institution_id=g.institution_id).first()
    if not subj:
        return jsonify({'error': 'Subject not found for this institution.'}), 404

    exam_type = data.get('exam_type') or 'mcq'
    if exam_type not in ('mcq', 'coding', 'mixed'):
        return jsonify({'error': 'exam_type must be mcq, coding, or mixed.'}), 400

    exam = Exam(
        institution_id=g.institution_id,
        subject_id=subject_id,
        created_by=g.user_id,
        title=title,
        description=data.get('description'),
        exam_type=exam_type,
        duration_minutes=int(data.get('duration_minutes') or 30),
        max_attempts=int(data.get('max_attempts') or 1),
        pass_threshold=int(data.get('pass_threshold') if data.get('pass_threshold') is not None else 40),
        shuffle_questions=bool(data.get('shuffle_questions', True)),
        is_published=False,
    )
    try:
        exam.available_from = _parse_dt(data.get('available_from'))
        exam.due_at = _parse_dt(data.get('due_at'))
    except ValueError:
        return jsonify({'error': 'Invalid available_from/due_at format (expected ISO-8601).'}), 400

    db.session.add(exam)
    db.session.commit()
    return jsonify({'exam': exam.to_dict()}), 201


@exam_bp.route('/exams/<exam_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_exam(exam_id):
    """Full exam detail including questions (instructor view — with answers)."""
    exam = _exam_or_404(exam_id)
    subj = Subject.query.get(exam.subject_id)
    d = exam.to_dict(include_questions=True)
    d['subject_name'] = subj.name if subj else ''
    d['subject_code'] = subj.code if subj else ''
    d['attempt_count'] = exam.attempts.count()
    return jsonify({'exam': d}), 200


@exam_bp.route('/exams/<exam_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_exam(exam_id):
    """Update exam settings (whitelisted fields only)."""
    exam = _exam_or_404(exam_id)
    data = request.get_json() or {}

    text_fields = ('title', 'description', 'exam_type')
    int_fields = ('duration_minutes', 'max_attempts', 'pass_threshold')
    bool_fields = ('shuffle_questions', 'is_published')

    for f in text_fields:
        if f in data:
            setattr(exam, f, data[f])
    if 'exam_type' in data and exam.exam_type not in ('mcq', 'coding', 'mixed'):
        return jsonify({'error': 'exam_type must be mcq, coding, or mixed.'}), 400
    for f in int_fields:
        if f in data and data[f] is not None:
            setattr(exam, f, int(data[f]))
    for f in bool_fields:
        if f in data:
            setattr(exam, f, bool(data[f]))
    for f in ('available_from', 'due_at'):
        if f in data:
            try:
                setattr(exam, f, _parse_dt(data[f]))
            except ValueError:
                return jsonify({'error': f'Invalid {f} format (expected ISO-8601).'}), 400

    db.session.commit()
    return jsonify({'exam': exam.to_dict()}), 200


@exam_bp.route('/exams/<exam_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_exam(exam_id):
    """Delete an exam (cascades to questions + attempts)."""
    exam = _exam_or_404(exam_id)
    db.session.delete(exam)   # cascade='all, delete-orphan' handles children
    db.session.commit()
    return jsonify({'message': 'Exam deleted.', 'id': exam_id}), 200


# ══════════════════════════════════════════════════════════════════
# QUESTIONS — CRUD + reorder
# ══════════════════════════════════════════════════════════════════

def _apply_question_fields(q, data):
    """Copy whitelisted fields from `data` onto an ExamQuestion."""
    if 'question_type' in data:
        q.question_type = data['question_type']
    if 'prompt' in data:
        q.prompt = data['prompt']
    if 'points' in data and data['points'] is not None:
        q.points = float(data['points'])
    if 'display_order' in data and data['display_order'] is not None:
        q.display_order = int(data['display_order'])
    if 'explanation' in data:
        q.explanation = data['explanation']
    # MCQ
    if 'options' in data:
        q.options = data['options']
    if 'correct_answer' in data:
        q.correct_answer = data['correct_answer']
    # Coding
    if 'language' in data:
        q.language = data['language']
    if 'starter_code' in data:
        q.starter_code = data['starter_code']
    if 'test_cases' in data:
        q.test_cases = data['test_cases']


@exam_bp.route('/exams/<exam_id>/questions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_question(exam_id):
    """Add a question to an exam. Appends at the end by default."""
    exam = _exam_or_404(exam_id)
    data = request.get_json() or {}
    qtype = data.get('question_type') or 'mcq'
    if qtype not in ('mcq', 'coding'):
        return jsonify({'error': 'question_type must be mcq or coding.'}), 400
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'error': 'prompt is required.'}), 400

    max_order = db.session.query(func.max(ExamQuestion.display_order))\
        .filter_by(exam_id=exam.id).scalar() or 0

    q = ExamQuestion(
        exam_id=exam.id,
        question_type=qtype,
        display_order=int(data.get('display_order') if data.get('display_order') is not None else max_order + 1),
        points=float(data.get('points') if data.get('points') is not None else 1.0),
    )
    _apply_question_fields(q, data)
    db.session.add(q)
    db.session.commit()
    return jsonify({'question': q.to_dict(instructor=True)}), 201


@exam_bp.route('/exams/questions/<qid>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_question(qid):
    """Update a question (verify it belongs to this institution)."""
    q = ExamQuestion.query.get_or_404(qid)
    _exam_or_404(q.exam_id)   # institution scoping
    data = request.get_json() or {}
    if 'question_type' in data and data['question_type'] not in ('mcq', 'coding'):
        return jsonify({'error': 'question_type must be mcq or coding.'}), 400
    _apply_question_fields(q, data)
    db.session.commit()
    return jsonify({'question': q.to_dict(instructor=True)}), 200


@exam_bp.route('/exams/questions/<qid>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_question(qid):
    """Delete a question."""
    q = ExamQuestion.query.get_or_404(qid)
    _exam_or_404(q.exam_id)   # institution scoping
    db.session.delete(q)
    db.session.commit()
    return jsonify({'message': 'Question deleted.', 'id': qid}), 200


@exam_bp.route('/exams/<exam_id>/questions/reorder', methods=['POST'])
@require_role('instructor', 'institution_admin')
def reorder_questions(exam_id):
    """Reorder questions. Body: { "order": [qid, qid, ...] }."""
    exam = _exam_or_404(exam_id)
    data = request.get_json() or {}
    order = data.get('order') or []
    if not isinstance(order, list):
        return jsonify({'error': 'order must be a list of question ids.'}), 400
    for idx, qid in enumerate(order):
        q = ExamQuestion.query.filter_by(id=qid, exam_id=exam.id).first()
        if q:
            q.display_order = idx + 1
    db.session.commit()
    questions = [q.to_dict(instructor=True) for q in exam.questions.all()]
    return jsonify({'questions': questions}), 200


# ══════════════════════════════════════════════════════════════════
# RESULTS — attempt review
# ══════════════════════════════════════════════════════════════════

@exam_bp.route('/exams/<exam_id>/attempts', methods=['GET'])
@require_role('instructor', 'institution_admin')
def exam_attempts(exam_id):
    """Per-student attempt results for grading review."""
    exam = _exam_or_404(exam_id)
    attempts = ExamAttempt.query.filter_by(exam_id=exam.id)\
        .order_by(ExamAttempt.submitted_at.desc().nullslast(),
                  ExamAttempt.started_at.desc()).all()

    students = {u.id: u for u in User.query.filter(
        User.id.in_({a.student_id for a in attempts})).all()} if attempts else {}

    result = []
    for a in attempts:
        u = students.get(a.student_id)
        result.append({
            'attempt_id': a.id,
            'student_id': a.student_id,
            'student_name': (u.full_name if u else 'Unknown'),
            'student_email': (u.email if u else ''),
            'status': a.status,
            'score': a.score,
            'total_points': a.total_points,
            'max_points': a.max_points,
            'passed': bool(a.passed),
            'started_at': a.started_at.isoformat() + 'Z' if a.started_at else None,
            'submitted_at': a.submitted_at.isoformat() + 'Z' if a.submitted_at else None,
        })
    return jsonify({'attempts': result, 'count': len(result), 'exam': exam.to_dict()}), 200
