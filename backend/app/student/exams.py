"""
Student — Standalone Timed Exams.

Discovery, attempt lifecycle, and results for Exam entities. Server time is
authoritative for every deadline (window + per-attempt countdown); the client
only renders countdowns derived from the server-provided timestamps.

Timing model:
  - Window      : available_from → due_at        (when a student may start/submit)
  - Per-attempt : started_at + duration_minutes → expires_at (capped at due_at)
  - Grace       : a small (~15s) allowance past expires_at before an attempt is
                  force-marked 'expired' (still graded from saved answers).
"""
import random
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, g, current_app

from app.auth.utils import require_role
from app.extensions import db, limiter
from app.models.exam import Exam, ExamQuestion, ExamAttempt
from app.models.academic import SectionSubject, SectionStudent
from app.models.session import _iso_z

student_exam_bp = Blueprint('student_exams', __name__)

_GRACE_SECONDS = 15


# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════

def _enrolled_subject_ids():
    """Subject ids the current student is enrolled in (via section → section-subject)."""
    section_ids = [e.section_id for e in
                   SectionStudent.query.filter_by(student_id=g.user_id).all()]
    if not section_ids:
        return set()
    rows = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id,
    ).all()
    return {r.subject_id for r in rows if r.subject_id}


def _norm_mcq(val):
    """Normalize an MCQ answer to a canonical string index.

    Accepts a 0-based index (int/str) or a letter A-D. Both the stored
    correct_answer and the student's submission pass through here so they
    compare consistently regardless of how the authoring UI saved them.
    """
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    if len(s) == 1 and s.isalpha():
        return str(ord(s.upper()) - ord('A'))
    try:
        return str(int(s))
    except ValueError:
        return s.lower()


def _visible_exam_or_404(exam_id):
    """Return (exam, None) if published + the student is enrolled; else (None, err)."""
    exam = Exam.query.filter_by(id=exam_id, institution_id=g.institution_id).first()
    if not exam:
        from app.models.experiment import Experiment
        exp = Experiment.query.filter_by(
            id=exam_id, institution_id=g.institution_id, delivery_mode='exam'
        ).first()
        if exp:
            exam = exp
    if not exam or not exam.is_published:
        return None, (jsonify({'error': 'Exam not found.'}), 404)
    if exam.subject_id not in _enrolled_subject_ids():
        return None, (jsonify({'error': 'You are not enrolled in this exam.'}), 403)
    return exam, None


def _attempts_for(exam_id):
    from sqlalchemy import or_
    return ExamAttempt.query.filter(
        ExamAttempt.student_id == g.user_id,
        or_(ExamAttempt.exam_id == exam_id, ExamAttempt.experiment_id == exam_id)
    ).all()


def _get_exam_questions_list(exam):
    """Return list of questions for Exam or Experiment."""
    if hasattr(exam, 'questions') and exam.questions.count() > 0:
        return list(exam.questions.all())
    if hasattr(exam, 'exam_questions') and exam.exam_questions.count() > 0:
        return list(exam.exam_questions.all())
    # If it's an Experiment with test_cases, adapt as a coding question
    adapted = []
    if hasattr(exam, 'test_cases') and exam.test_cases.count() > 0:
        class AdaptedCodingQuestion:
            def __init__(self, exp):
                self.id = f"exp_code_{exp.id}"
                self.question_type = 'coding'
                self.prompt = exp.problem_statement or exp.aim or exp.title
                self.points = 100.0
                self.language = (exp.allowed_languages or ['python'])[0] if exp.allowed_languages else 'python'
                self.starter_code = ''
                self.test_cases = [
                    {'input': tc.input_data, 'expected': tc.expected_output, 'hidden': tc.is_hidden, 'weight': tc.points_weight}
                    for tc in exp.test_cases.all()
                ]
                self.explanation = None
            def to_dict(self, instructor=False):
                return {
                    'id': self.id,
                    'question_type': 'coding',
                    'prompt': self.prompt,
                    'points': self.points,
                    'language': self.language,
                    'starter_code': self.starter_code,
                    'test_cases': self.test_cases if instructor else [
                        {'input': c['input'], 'expected': c['expected'], 'hidden': False}
                        for c in self.test_cases if not c.get('hidden')
                    ],
                    'explanation': None
                }
        adapted.append(AdaptedCodingQuestion(exam))
    return adapted


def _grade_attempt(exam, raw_answers):
    """Grade a submission. Returns (result_dict, None) or (None, error_response).

    result_dict = {detail, score, earned, max_points, passed}
    MCQ  : exact match on normalized answer → full points.
    Coding: weighted % of test cases passing (docker), scaled by question points.
    """
    from app.execution.routes import _run_docker
    from app.execution.languages import resolve as resolve_language
    from app.student.routes import _norm_output

    questions = _get_exam_questions_list(exam)
    max_points = 0.0
    earned_total = 0.0
    detail = {}

    for q in questions:
        pts = float(q.points or 0)
        max_points += pts
        raw = (raw_answers or {}).get(q.id)
        qtype = q.question_type or 'mcq'

        if qtype == 'mcq':
            correct = _norm_mcq(raw) is not None and _norm_mcq(raw) == _norm_mcq(q.correct_answer)
            earned = pts if correct else 0.0
            earned_total += earned
            detail[q.id] = {'answer': raw, 'correct': correct, 'earned': earned, 'points': pts}
            continue

        # ── Coding question ────────────────────────────────────────────────
        code = raw.strip() if isinstance(raw, str) else ''
        cases = q.test_cases or []
        language = q.language or 'python'
        spec = resolve_language(language)
        if not code or not spec or not cases:
            detail[q.id] = {'answer': raw, 'correct': False, 'earned': 0.0,
                            'points': pts, 'results': []}
            continue
        if spec['engine'] == 'browser':
            detail[q.id] = {'answer': raw, 'correct': False, 'earned': 0.0,
                            'points': pts, 'results': [], 'error': 'browser-language'}
            continue

        q_earned_w = 0.0
        q_total_w = 0.0
        results = []
        docker_error = None
        for i, tc in enumerate(cases):
            weight = tc.get('weight', 1) or 1
            q_total_w += weight
            stdin = str(tc.get('input', '') or '')
            result, error = _run_docker(code, spec['id'], stdin, g.user_id)
            if error:
                docker_error = error      # queue full (429) / engine down (503)
                break
            ok = (result.get('status_id') == 3
                  and _norm_output(result.get('stdout')) == _norm_output(str(tc.get('expected', ''))))
            if ok:
                q_earned_w += weight
            hidden = bool(tc.get('hidden'))
            row = {'index': i, 'passed': ok, 'hidden': hidden}
            if not hidden:
                row.update({
                    'input': stdin,
                    'expected': str(tc.get('expected', '')),
                    'actual': result.get('stdout', ''),
                })
            results.append(row)
        if docker_error:
            return None, docker_error

        frac = (q_earned_w / q_total_w) if q_total_w > 0 else 0.0
        earned = pts * frac
        earned_total += earned
        detail[q.id] = {'answer': raw, 'correct': frac >= 1.0, 'earned': round(earned, 4),
                        'points': pts, 'results': results,
                        'passed_weight': q_earned_w, 'total_weight': q_total_w}

    score = (earned_total / max_points * 100) if max_points > 0 else 0.0
    passed = score >= (exam.pass_threshold or 0)
    return {
        'detail': detail,
        'score': round(score, 2),
        'earned': round(earned_total, 4),
        'max_points': round(max_points, 4),
        'passed': bool(passed),
    }, None


def _finalize_attempt(exam, attempt, raw_answers, force_expired=False):
    """Grade + persist an attempt. Returns (attempt, None) or (None, error)."""
    graded, err = _grade_attempt(exam, raw_answers)
    if err:
        return None, err
    now = datetime.utcnow()
    attempt.answers = graded['detail']
    attempt.score = graded['score']
    attempt.total_points = graded['earned']
    attempt.max_points = graded['max_points']
    attempt.passed = graded['passed']
    attempt.submitted_at = now
    expired = force_expired or (attempt.expires_at and now > attempt.expires_at + timedelta(seconds=_GRACE_SECONDS))
    attempt.status = 'expired' if expired else 'submitted'

    # Sync exam result into the canonical Grade model so it rolls up to Subject total!
    target_exp_id = attempt.experiment_id or (exam.id if hasattr(exam, 'id') else None)
    if target_exp_id:
        try:
            from app.models.grading import Grade
            from app.models.experiment import Experiment
            exp_row = Experiment.query.get(target_exp_id)
            if exp_row:
                attempt.experiment_id = target_exp_id
                grade = Grade.query.filter_by(
                    student_id=attempt.student_id,
                    experiment_id=target_exp_id
                ).first()
                if not grade:
                    grade = Grade(
                        student_id=attempt.student_id,
                        experiment_id=target_exp_id,
                        institution_id=g.institution_id,
                    )
                    db.session.add(grade)
                current_final = grade.final_grade or 0.0
                if attempt.score >= current_final or grade.final_grade is None:
                    grade.final_grade = attempt.score
                    grade.auto_grade = attempt.score
                    grade.quiz_grade = attempt.score
                    grade.graded_at = now
        except Exception:
            pass

    db.session.commit()
    return attempt, None


def _questions_for_attempt(exam, attempt):
    """Student-safe question list, deterministically shuffled per attempt."""
    questions = _get_exam_questions_list(exam)
    if exam.shuffle_questions:
        random.Random(attempt.id).shuffle(questions)
    return [q.to_dict(instructor=False) for q in questions]


# ══════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════

@student_exam_bp.route('/exams', methods=['GET'])
@require_role('student')
def list_exams():
    """Published exams for the student's enrolled subjects, with attempt state."""
    subject_ids = _enrolled_subject_ids()
    if not subject_ids:
        return jsonify({'exams': [], 'count': 0, 'server_now': _iso_z(datetime.utcnow())}), 200

    from app.models.experiment import Experiment

    exams = Exam.query.filter(
        Exam.institution_id == g.institution_id,
        Exam.subject_id.in_(subject_ids),
        Exam.is_published.is_(True),
    ).order_by(Exam.due_at.asc().nullsfirst(), Exam.created_at.desc()).all()

    # Also include experiments authored with delivery_mode == 'exam'
    exps = Experiment.query.filter(
        Experiment.institution_id == g.institution_id,
        Experiment.subject_id.in_(subject_ids),
        Experiment.delivery_mode == 'exam',
        Experiment.is_published.is_(True),
    ).all()

    exam_ids = {e.id for e in exams}
    all_assessment_items = list(exams) + [e for e in exps if e.id not in exam_ids]
    all_ids = [e.id for e in all_assessment_items]

    from sqlalchemy import or_
    my_attempts = ExamAttempt.query.filter(
        ExamAttempt.student_id == g.user_id,
        or_(ExamAttempt.exam_id.in_(all_ids), ExamAttempt.experiment_id.in_(all_ids)),
    ).all() if all_ids else []

    by_exam = {}
    for a in my_attempts:
        key = a.exam_id or a.experiment_id
        if key:
            by_exam.setdefault(key, []).append(a)

    from app.models.subject import Subject

    subject_map = {
        s.id: s for s in Subject.query.filter(Subject.id.in_(subject_ids)).all()
    }

    result = []
    for e in all_assessment_items:
        atts = by_exam.get(e.id, [])
        latest = max(atts, key=lambda a: a.started_at or a.created_at) if atts else None
        best_score = max([a.score for a in atts if a.score is not None], default=None)

        q_count = 0
        if hasattr(e, 'questions') and e.questions:
            q_count = e.questions.count()
        elif hasattr(e, 'exam_questions') and e.exam_questions:
            q_count = e.exam_questions.count()
        if q_count == 0 and hasattr(e, 'test_cases') and e.test_cases:
            q_count = e.test_cases.count()

        dur = getattr(e, 'duration_minutes', None)
        if dur is None:
            time_sec = getattr(e, 'time_limit_sec', None)
            dur = (time_sec // 60) if time_sec else 30

        sub = subject_map.get(e.subject_id)
        sub_name = sub.name if sub else 'General'
        sub_code = sub.code if sub else ''
        sub_color = sub.color if sub else '#7c3aed'

        submitted_at = None
        passed_any = False
        if atts:
            passed_any = any(bool(a.passed) for a in atts)
            completed_atts = [a for a in atts if a.submitted_at]
            if completed_atts:
                latest_sub = max(completed_atts, key=lambda a: a.submitted_at)
                submitted_at = _iso_z(latest_sub.submitted_at)
            elif latest and latest.created_at:
                submitted_at = _iso_z(latest.created_at)

        result.append({
            'id': e.id,
            'title': e.title,
            'description': getattr(e, 'description', None) or getattr(e, 'aim', None),
            'exam_type': getattr(e, 'exam_type', None) or getattr(e, 'experiment_type', 'mcq'),
            'subject_id': e.subject_id,
            'subject_name': sub_name,
            'subject_code': sub_code,
            'subject_color': sub_color,
            'available_from': _iso_z(e.available_from),
            'due_at': _iso_z(e.due_at),
            'duration_minutes': dur,
            'max_attempts': e.max_attempts or 1,
            'pass_threshold': e.pass_threshold or 40,
            'question_count': q_count,
            'window_state': e.window_state(),
            'attempts_used': len(atts),
            'attempts_remaining': max(0, (e.max_attempts or 1) - len(atts)),
            'latest_status': latest.status if latest else None,
            'best_score': best_score,
            'passed': passed_any or (best_score is not None and best_score >= (e.pass_threshold or 40)),
            'submitted_at': submitted_at,
            'has_in_progress': any(a.status == 'in_progress' for a in atts),
        })
    return jsonify({'exams': result, 'count': len(result),
                    'server_now': _iso_z(datetime.utcnow())}), 200


@student_exam_bp.route('/exams/<exam_id>', methods=['GET'])
@require_role('student')
def exam_detail(exam_id):
    """Instructions + window + attempts remaining. No questions/answers."""
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err
    now = datetime.utcnow()
    atts = _attempts_for(exam_id)
    in_progress = next((a for a in atts if a.status == 'in_progress'), None)
    latest = max(atts, key=lambda a: a.started_at or a.created_at) if atts else None
    attempts_used = len(atts)
    attempts_remaining = max(0, (exam.max_attempts or 1) - attempts_used)

    can_start = (
        exam.window_state(now) == 'open'
        and (in_progress is not None or attempts_remaining > 0)
    )
    exam_dict = exam.to_dict()
    from app.models.subject import Subject
    sub = Subject.query.get(exam.subject_id)
    if sub:
        exam_dict['subject_name'] = sub.name
        exam_dict['subject_code'] = sub.code or ''
        exam_dict['subject_color'] = sub.color or '#7c3aed'

    return jsonify({
        'exam': exam_dict,
        'server_now': _iso_z(now),
        'attempts_used': attempts_used,
        'attempts_remaining': attempts_remaining,
        'can_start': can_start,
        'in_progress_attempt': in_progress.to_dict() if in_progress else None,
        'latest_attempt': latest.to_dict() if latest else None,
    }), 200


@student_exam_bp.route('/exams/<exam_id>/start', methods=['POST'])
@require_role('student')
@limiter.limit("10 per minute")
def start_exam(exam_id):
    """Start (or resume) an attempt. Enforces window + attempt limit server-side."""
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err
    now = datetime.utcnow()

    # Reject if a coding exam can't be graded (engine off) — fail fast before starting.
    has_coding = ExamQuestion.query.filter_by(exam_id=exam.id, question_type='coding').first() is not None
    if has_coding and not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    atts = _attempts_for(exam_id)
    in_progress = next((a for a in atts if a.status == 'in_progress'), None)

    # Resume a live attempt, or auto-finalize a stale (expired) one.
    if in_progress:
        if in_progress.expires_at and now > in_progress.expires_at + timedelta(seconds=_GRACE_SECONDS):
            _, ferr = _finalize_attempt(exam, in_progress, in_progress.answers or {}, force_expired=True)
            if ferr:
                return ferr
            in_progress = None
        else:
            return jsonify({
                'attempt': in_progress.to_dict(),
                'exam': exam.to_dict(),
                'questions': _questions_for_attempt(exam, in_progress),
                'answers': in_progress.answers or {},
                'expires_at': _iso_z(in_progress.expires_at),
                'server_now': _iso_z(now),
                'resumed': True,
            }), 200

    # Window guards
    state = exam.window_state(now)
    if state == 'upcoming':
        return jsonify({'error': 'This exam has not started yet.',
                        'available_from': _iso_z(exam.available_from)}), 403
    if state == 'closed':
        return jsonify({'error': 'The submission deadline for this exam has passed.',
                        'due_at': _iso_z(exam.due_at)}), 403

    attempts_used = len(atts)
    if attempts_used >= (exam.max_attempts or 1):
        return jsonify({'error': 'You have used all your attempts for this exam.'}), 403

    # expires_at = min(now + duration, due_at or now + duration)
    natural_expiry = now + timedelta(minutes=exam.duration_minutes or 30)
    expires_at = min(natural_expiry, exam.due_at) if exam.due_at else natural_expiry

    attempt = ExamAttempt(
        exam_id=exam.id,
        student_id=g.user_id,
        started_at=now,
        expires_at=expires_at,
        status='in_progress',
        answers={},
    )
    db.session.add(attempt)
    db.session.commit()

    return jsonify({
        'attempt': attempt.to_dict(),
        'exam': exam.to_dict(),
        'questions': _questions_for_attempt(exam, attempt),
        'answers': {},
        'expires_at': _iso_z(expires_at),
        'server_now': _iso_z(now),
        'resumed': False,
    }), 201


@student_exam_bp.route('/exams/<exam_id>/attempt/<attempt_id>/save', methods=['POST'])
@require_role('student')
def save_attempt(exam_id, attempt_id):
    """Auto-save partial answers during an in-progress attempt."""
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err
    attempt = ExamAttempt.query.filter_by(
        id=attempt_id, exam_id=exam_id, student_id=g.user_id).first_or_404()
    if attempt.status != 'in_progress':
        return jsonify({'error': 'This attempt is no longer active.'}), 409

    data = request.get_json() or {}
    raw = data.get('answers') or {}
    if not isinstance(raw, dict):
        return jsonify({'error': 'answers must be an object keyed by question id.'}), 400
    merged = dict(attempt.answers or {})
    merged.update(raw)
    attempt.answers = merged
    db.session.commit()
    return jsonify({'saved': True, 'server_now': _iso_z(datetime.utcnow())}), 200


@student_exam_bp.route('/exams/<exam_id>/attempt/<attempt_id>/submit', methods=['POST'])
@require_role('student')
@limiter.limit("10 per minute")
def submit_attempt(exam_id, attempt_id):
    """Submit + grade an attempt. Enforces expires_at (with a small grace)."""
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err
    attempt = ExamAttempt.query.filter_by(
        id=attempt_id, exam_id=exam_id, student_id=g.user_id).first_or_404()

    if attempt.status != 'in_progress':
        # Idempotent: already graded — return the stored result.
        return jsonify({'attempt': attempt.to_dict(include_answers=True),
                        'already_submitted': True}), 200

    data = request.get_json() or {}
    body_answers = data.get('answers') or {}
    if not isinstance(body_answers, dict):
        return jsonify({'error': 'answers must be an object keyed by question id.'}), 400
    # Merge saved answers with the final submission (submission wins).
    raw = dict(attempt.answers or {})
    raw.update(body_answers)

    attempt, ferr = _finalize_attempt(exam, attempt, raw)
    if ferr:
        return ferr
    return jsonify({'attempt': attempt.to_dict(include_answers=True),
                    'score': attempt.score, 'passed': attempt.passed,
                    'status': attempt.status}), 200


@student_exam_bp.route('/exams/<exam_id>/result', methods=['GET'])
@require_role('student')
def exam_result(exam_id):
    """Per-question review of the student's latest graded attempt."""
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err
    atts = _attempts_for(exam_id)
    graded = [a for a in atts if a.status in ('submitted', 'expired')]
    if not graded:
        return jsonify({'error': 'No submitted attempt found for this exam.'}), 404
    attempt = max(graded, key=lambda a: a.submitted_at or a.started_at or a.created_at)

    answers = attempt.answers or {}
    review = []
    for q in exam.questions.all():
        d = answers.get(q.id, {})
        item = {
            'id': q.id,
            'question_type': q.question_type,
            'prompt': q.prompt,
            'points': q.points,
            'your_answer': d.get('answer'),
            'correct': d.get('correct', False),
            'earned': d.get('earned', 0.0),
            'explanation': q.explanation,
        }
        if (q.question_type or 'mcq') == 'mcq':
            item['options'] = q.options or []
            item['correct_answer'] = q.correct_answer   # revealed post-submission
        else:
            item['results'] = d.get('results', [])      # hidden cases already masked at grade time
        review.append(item)

    return jsonify({
        'attempt': attempt.to_dict(),
        'exam': {'id': exam.id, 'title': exam.title, 'pass_threshold': exam.pass_threshold,
                 'exam_type': exam.exam_type},
        'score': attempt.score,
        'passed': bool(attempt.passed),
        'total_points': attempt.total_points,
        'max_points': attempt.max_points,
        'review': review,
    }), 200
