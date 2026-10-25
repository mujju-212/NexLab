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
from app.models.exam import (
    Exam, ExamQuestion, ExamAttempt,
    normalize_mcq_options, normalize_mcq_correct_answer,
)
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

def _grade_weight(value):
    """Exam weightage as a FRACTION of the subject total (0..1).

    This used to be silently clamped, which turned an honest mistake -- sending
    25 to mean '25 marks' -- into 1.0, i.e. an exam worth 100% of the subject,
    with no error and a bogus over-allocation banner. Reject it instead.
    """
    if value is None or value == '':
        return 0.0
    try:
        w = float(value)
    except (TypeError, ValueError):
        raise ValueError('grade_weight must be a number between 0 and 1 (a fraction of the subject total).')
    if w < 0 or w > 1:
        raise ValueError(
            'grade_weight must be between 0 and 1 - it is a fraction of the subject '
            'total (0.25 means 25%%); got %s.' % w)
    return w

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

    try:
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
            grade_weight=_grade_weight(data.get('grade_weight')),
            proctor_focus_enabled=bool(data.get('proctor_focus_enabled', False)),
            proctor_lockdown_enabled=bool(data.get('proctor_lockdown_enabled', False)),
            max_violations=max(0, int(data.get('max_violations') or 0)),
        )
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

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
    bool_fields = ('shuffle_questions', 'is_published',
                   'proctor_focus_enabled', 'proctor_lockdown_enabled')

    # Snapshot before applying, so the publish guard sees the transition.
    was_published = bool(exam.is_published)

    for f in text_fields:
        if f in data:
            setattr(exam, f, data[f])
    if 'exam_type' in data and exam.exam_type not in ('mcq', 'coding', 'mixed'):
        return jsonify({'error': 'exam_type must be mcq, coding, or mixed.'}), 400
    for f in int_fields:
        if f in data and data[f] is not None:
            setattr(exam, f, int(data[f]))
    if 'max_violations' in data and data['max_violations'] is not None:
        exam.max_violations = max(0, int(data['max_violations']))
    for f in bool_fields:
        if f in data:
            setattr(exam, f, bool(data[f]))
    if 'grade_weight' in data and data['grade_weight'] is not None:
        try:
            exam.grade_weight = _grade_weight(data['grade_weight'])
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 400

    # Publishing an empty exam would hand students a blank paper and a 0 score.
    if 'is_published' in data and bool(data['is_published']) and not was_published:
        q_count = ExamQuestion.query.filter_by(exam_id=exam.id).count()
        if q_count == 0:
            db.session.rollback()
            return jsonify({
                'error': 'Add at least one question before publishing this exam.',
                'question_count': 0,
            }), 400
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
    """Delete an exam (cascades to questions + attempts, clears grade/proctor rows)."""
    exam = _exam_or_404(exam_id)

    # questions/attempts cascade via the ORM relationship, but grades and
    # proctor_events hold plain FKs to exams.id with no ON DELETE rule —
    # remove those rows first or the commit fails with ForeignKeyViolation.
    from app.models.grading import Grade
    from app.models.proctor_event import ProctorEvent
    Grade.query.filter_by(exam_id=exam.id).delete(synchronize_session=False)
    ProctorEvent.query.filter_by(exam_id=exam.id).delete(synchronize_session=False)

    db.session.delete(exam)   # cascade='all, delete-orphan' handles children
    db.session.commit()
    return jsonify({'message': 'Exam deleted.', 'id': exam_id}), 200


# ══════════════════════════════════════════════════════════════════
# QUESTIONS — CRUD + reorder
# ══════════════════════════════════════════════════════════════════

def _apply_question_fields(q, data):
    """Copy whitelisted fields while canonicalizing MCQ labels and answer keys."""
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
    # MCQ. Normalize imported object options to strings so answer flags can
    # never be persisted as student-visible choices.
    if 'options' in data:
        q.options = (normalize_mcq_options(data['options'])
                     if q.question_type == 'mcq' else data['options'])
    if q.question_type == 'mcq' and ('options' in data or 'correct_answer' in data):
        raw_options = data.get('options', q.options)
        raw_answer = data.get('correct_answer', q.correct_answer)
        q.correct_answer = normalize_mcq_correct_answer(raw_options, raw_answer)
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

    # Question text/options so the instructor can read what the student answered.
    questions = {q.id: q for q in ExamQuestion.query.filter_by(exam_id=exam.id).all()}

    # Proctoring violations recorded during these attempts.
    from app.models.proctor_event import ProctorEvent
    violation_by_attempt = {}
    if attempts:
        vrows = ProctorEvent.query.filter(
            ProctorEvent.attempt_id.in_([a.id for a in attempts])
        ).order_by(ProctorEvent.recorded_at).all()
        for v in vrows:
            violation_by_attempt.setdefault(v.attempt_id, []).append({
                'event_type': v.event_type,
                'severity': v.severity,
                'payload': v.payload or {},
                'recorded_at': v.recorded_at.isoformat() + 'Z' if v.recorded_at else None,
            })

    result = []
    for a in attempts:
        u = students.get(a.student_id)

        # attempt.answers is {question_id: {answer, correct, earned, points, ...}}
        # after grading. Hydrate it into readable per-question rows.
        answers = []
        stored = a.answers if isinstance(a.answers, dict) else {}
        for qid, detail in stored.items():
            q = questions.get(qid)
            if not isinstance(detail, dict):
                detail = {'answer': detail}
            options = q.options if q is not None and isinstance(q.options, list) else []
            given = detail.get('answer')

            def _as_index(value):
                """correct_answer is stored as a letter ("A") or index ("0")."""
                if value is None:
                    return None
                if isinstance(value, int):
                    return value
                text = str(value).strip().upper()
                if text.isdigit():
                    return int(text)
                if len(text) == 1 and 'A' <= text <= 'Z':
                    return ord(text) - ord('A')
                return None

            def _as_text(value):
                idx = _as_index(value)
                if idx is not None and 0 <= idx < len(options):
                    return options[idx]
                return value

            correct_answer = getattr(q, 'correct_answer', None) if q is not None else None
            answers.append({
                'question_id': qid,
                'prompt': q.prompt if q is not None else '(question deleted)',
                'question_type': q.question_type if q is not None else None,
                'options': options,
                'student_answer': given,
                'student_answer_text': _as_text(given),
                'correct_answer': correct_answer,
                'correct_answer_text': _as_text(correct_answer),
                'is_correct': detail.get('correct'),
                'earned': detail.get('earned'),
                'points': detail.get('points'),
                'test_results': detail.get('results'),
            })
        answers.sort(key=lambda r: (r['prompt'] or ''))

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
            'answers': answers,
            'answered_count': len(answers),
            'violations': violation_by_attempt.get(a.id, []),
            'violation_count': len(violation_by_attempt.get(a.id, [])),
            'started_at': a.started_at.isoformat() + 'Z' if a.started_at else None,
            'submitted_at': a.submitted_at.isoformat() + 'Z' if a.submitted_at else None,
        })

    # ── One row per student: the instructor thinks in students, not attempts ──
    grouped = {}
    for row in result:
        sid = row['student_id']
        g = grouped.setdefault(sid, {
            'student_id': sid,
            'student_name': row['student_name'],
            'student_email': row['student_email'],
            'attempts': [],
        })
        g['attempts'].append(row)

    students = []
    for g in grouped.values():
        ats = g['attempts']
        scored = [x for x in ats if x['score'] is not None]
        best = max(scored, key=lambda x: x['score']) if scored else None
        latest = max(
            ats,
            key=lambda x: (x['submitted_at'] or x['started_at'] or ''),
        )
        students.append({
            'student_id': g['student_id'],
            'student_name': g['student_name'],
            'student_email': g['student_email'],
            'attempts_count': len(ats),
            'attempts_used': len([x for x in ats if x['status'] in ('submitted', 'expired')]),
            'best_score': best['score'] if best else None,
            'best_attempt_id': best['attempt_id'] if best else None,
            'best_passed': bool(best['passed']) if best else False,
            'latest_status': latest['status'],
            'latest_submitted_at': max(
                (x['submitted_at'] for x in ats if x['submitted_at']),
                default=None,
            ),
            'violation_count': sum(x['violation_count'] for x in ats),
            'best_violations': best['violation_count'] if best else 0,
            'attempts': sorted(
                ats,
                key=lambda x: (x['submitted_at'] or x['started_at'] or ''),
                reverse=True,
            ),
        })

    students.sort(key=lambda x: (x['best_score'] is None, -(x['best_score'] or 0)))
    return jsonify({
        'attempts': result,
        'students': students,
        'count': len(result),
        'student_count': len(students),
        'exam': exam.to_dict(),
    }), 200
