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
from app.models.exam import (
    Exam, ExamQuestion, ExamAttempt,
    normalize_mcq_options, normalize_mcq_correct_answer,
)
from app.models.experiment import Experiment
from app.models.academic import SectionSubject, SectionStudent
from app.models.session import _iso_z
from sqlalchemy import or_

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
            correct_key = normalize_mcq_correct_answer(q.options, q.correct_answer)
            correct = _norm_mcq(raw) is not None and _norm_mcq(raw) == _norm_mcq(correct_key)
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

    # Sync the exam result into the canonical Grade model so it rolls up to the
    # Subject total. A Grade row belongs to EITHER a lab Experiment (attempts on
    # an Experiment delivered as an exam) OR a standalone Exam row.
    from app.models.grading import Grade

    grade = None
    if attempt.experiment_id:
        grade = Grade.query.filter_by(
            student_id=attempt.student_id,
            experiment_id=attempt.experiment_id,
        ).first()
        if not grade:
            grade = Grade(student_id=attempt.student_id,
                          experiment_id=attempt.experiment_id)
            db.session.add(grade)
    elif attempt.exam_id:
        grade = Grade.query.filter_by(
            student_id=attempt.student_id,
            exam_id=attempt.exam_id,
        ).first()
        if not grade:
            grade = Grade(student_id=attempt.student_id, exam_id=attempt.exam_id)
            db.session.add(grade)

    if grade is not None:
        # Keep the best result across attempts; never let a worse retake
        # overwrite a better score, and never overwrite a real 0 with null.
        current_final = grade.final_grade
        if current_final is None or attempt.score >= current_final:
            grade.final_grade = attempt.score
            grade.auto_grade = attempt.score
            grade.quiz_grade = attempt.score
        grade.graded_at = now

    db.session.commit()
    return attempt, None


def _proctor_config(exam):
    """Proctoring settings the student client must honour for this exam."""
    return {
        'focus_enabled':    bool(getattr(exam, 'proctor_focus_enabled', False)),
        'lockdown_enabled': bool(getattr(exam, 'proctor_lockdown_enabled', False)),
        'max_violations':   int(getattr(exam, 'max_violations', 0) or 0),
    }


def _violation_summary(exam_id, attempt_id):
    """How many proctoring violations this attempt has accumulated."""
    from app.models.proctor_event import ProctorEvent
    rows = ProctorEvent.query.filter_by(exam_id=exam_id, attempt_id=attempt_id).all()
    counts = {}
    for r in rows:
        counts[r.event_type] = counts.get(r.event_type, 0) + 1
    return {'total': len(rows), 'by_type': counts}


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
        completed_attempts = [a for a in atts if a.status in ('submitted', 'expired')]
        best_score = max([a.score for a in completed_attempts if a.score is not None], default=None)

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
            passed_any = any(bool(a.passed) for a in completed_attempts)
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

    if isinstance(exam, Experiment):
        from app.models.experiment import TestCase
        has_coding = (
            TestCase.query.filter_by(experiment_id=exam.id).first() is not None
            or getattr(exam, 'starter_code', None) is not None
        )
    else:
        has_coding = (
            getattr(exam, 'exam_type', None) in ('coding', 'mixed')
            or ExamQuestion.query.filter_by(exam_id=exam.id, question_type='coding').first() is not None
        )
    code_execution_available = not has_coding or bool(current_app.config.get('DOCKER_RUNNER_ENABLED', False))
    can_start = (
        exam.window_state(now) == 'open'
        and (in_progress is not None or attempts_remaining > 0)
        and code_execution_available
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
        'code_execution_available': code_execution_available,
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
    if isinstance(exam, Experiment):
        from app.models.experiment import TestCase
        has_coding = TestCase.query.filter_by(experiment_id=exam.id).count() > 0 or getattr(exam, 'starter_code', None) is not None
    else:
        has_coding = ExamQuestion.query.filter_by(exam_id=exam.id, question_type='coding').first() is not None
    if has_coding and not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    atts = _attempts_for(exam_id)
    in_progress = next((a for a in atts if a.status == 'in_progress'), None)

    # Window state is evaluated before resume too: if the instructor has closed
    # the exam, a live attempt is finalised rather than handed back.
    state = exam.window_state(now)

    # Resume a live attempt, or auto-finalize a stale (expired) one.
    if in_progress:
        if state == 'closed':
            _, ferr = _finalize_attempt(exam, in_progress, in_progress.answers or {}, force_expired=True)
            if ferr:
                return ferr
            in_progress = None
        elif in_progress.expires_at and now > in_progress.expires_at + timedelta(seconds=_GRACE_SECONDS):
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
                'proctor': _proctor_config(exam),
                'violations': _violation_summary(
                    getattr(exam, 'id', exam_id), in_progress.id),
            }), 200

    # Window guards
    if state == 'upcoming':
        return jsonify({'error': 'This exam has not started yet.',
                        'available_from': _iso_z(exam.available_from)}), 403
    if state == 'closed':
        return jsonify({'error': 'The submission deadline for this exam has passed.',
                        'due_at': _iso_z(exam.due_at)}), 403

    attempts_used = len(atts)
    if attempts_used >= (exam.max_attempts or 1):
        return jsonify({'error': 'You have used all your attempts for this exam.'}), 403

    is_unified = isinstance(exam, Experiment) or not hasattr(exam, 'duration_minutes')
    dur_mins = max(1, (getattr(exam, 'time_limit_sec', 3600) or 3600) // 60) if is_unified else (exam.duration_minutes or 30)
    natural_expiry = now + timedelta(minutes=dur_mins)
    expires_at = min(natural_expiry, exam.due_at) if exam.due_at else natural_expiry

    attempt = ExamAttempt(
        exam_id=None if is_unified else exam.id,
        experiment_id=exam.id if is_unified else None,
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
        'proctor': _proctor_config(exam),
        'violations': {'total': 0, 'by_type': {}},
    }), 201


_VIOLATION_TYPES = {
    'tab_switch': 'high',
    'focus_lost': 'medium',
    'fullscreen_exit': 'high',
    'copy': 'medium',
    'paste': 'high',
    'context_menu': 'low',
    'devtools': 'high',
    'screen_share_stop': 'high',
}


@student_exam_bp.route('/exams/<exam_id>/attempt/<attempt_id>/violation', methods=['POST'])
@require_role('student')
def record_violation(exam_id, attempt_id):
    """Record one proctoring violation against a timed-exam attempt.

    Only accepted when the instructor enabled proctoring for this exam, and only
    while the attempt is live. When `max_violations` is reached the attempt is
    finalised automatically so the result cannot be gamed by ignoring warnings.
    """
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err

    attempt = ExamAttempt.query.filter(
        ExamAttempt.id == attempt_id,
        ExamAttempt.student_id == g.user_id,
    ).first_or_404()

    cfg = _proctor_config(exam)
    if not (cfg['focus_enabled'] or cfg['lockdown_enabled']):
        return jsonify({'error': 'Proctoring is not enabled for this exam.'}), 400
    if attempt.status != 'in_progress':
        return jsonify({'error': 'This attempt is no longer active.',
                        'finalized': True}), 409

    data = request.get_json() or {}
    event_type = str(data.get('event_type') or '').strip()
    if event_type not in _VIOLATION_TYPES:
        return jsonify({
            'error': f'event_type must be one of: {", ".join(sorted(_VIOLATION_TYPES))}',
        }), 400

    from app.models.proctor_event import ProctorEvent
    row = ProctorEvent(
        institution_id=g.institution_id,
        session_id=None,
        exam_id=getattr(exam, 'id', exam_id),
        attempt_id=attempt.id,
        student_id=g.user_id,
        event_type=event_type,
        severity=_VIOLATION_TYPES[event_type],
        payload={
            'detail': (str(data.get('detail'))[:300] if data.get('detail') else None),
            'client_ts': data.get('client_ts'),
            'question_id': data.get('question_id'),
        },
    )
    db.session.add(row)
    db.session.commit()

    summary = _violation_summary(row.exam_id, attempt.id)
    limit = cfg['max_violations']
    auto_submitted = False
    if limit and summary['total'] >= limit:
        _finalize_attempt(exam, attempt, attempt.answers or {}, force_expired=False)
        attempt.status = 'submitted'
        db.session.commit()
        auto_submitted = True

    return jsonify({
        'recorded': True,
        'event_type': event_type,
        'severity': _VIOLATION_TYPES[event_type],
        'violations': summary,
        'max_violations': limit,
        'remaining_before_auto_submit': max(0, limit - summary['total']) if limit else None,
        'auto_submitted': auto_submitted,
        'server_now': _iso_z(datetime.utcnow()),
    }), 201


@student_exam_bp.route('/exams/<exam_id>/attempt/<attempt_id>/save', methods=['POST'])
@require_role('student')
def save_attempt(exam_id, attempt_id):
    """Auto-save partial answers during an in-progress attempt."""
    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err
    attempt = ExamAttempt.query.filter(
        ExamAttempt.id == attempt_id,
        ExamAttempt.student_id == g.user_id,
        or_(ExamAttempt.exam_id == exam_id, ExamAttempt.experiment_id == exam_id),
    ).first_or_404()
    if attempt.status != 'in_progress':
        return jsonify({'error': 'This attempt is no longer active.'}), 409

    # The clock is the clock: once expires_at has passed (plus a small grace for
    # network latency), answers can no longer be changed. The attempt stays
    # in_progress until submit/next-start finalises it as 'expired'.
    now = datetime.utcnow()
    if attempt.expires_at and now > attempt.expires_at + timedelta(seconds=_GRACE_SECONDS):
        return jsonify({
            'error': 'Time is up for this attempt. Your saved answers have been submitted.',
            'expired': True,
            'expires_at': _iso_z(attempt.expires_at),
            'server_now': _iso_z(now),
        }), 403

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
    attempt = ExamAttempt.query.filter(
        ExamAttempt.id == attempt_id,
        ExamAttempt.student_id == g.user_id,
        or_(ExamAttempt.exam_id == exam_id, ExamAttempt.experiment_id == exam_id),
    ).first_or_404()

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
    for q in _get_exam_questions_list(exam):
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
            item['options'] = normalize_mcq_options(q.options)
            item['correct_answer'] = normalize_mcq_correct_answer(q.options, q.correct_answer)
        else:
            item['results'] = d.get('results', [])      # hidden cases already masked at grade time
        review.append(item)

    return jsonify({
        'attempt': attempt.to_dict(),
        'exam': {'id': exam.id, 'title': exam.title, 'pass_threshold': getattr(exam, 'pass_threshold', 40.0),
                 'exam_type': getattr(exam, 'exam_type', None) or getattr(exam, 'experiment_type', 'mcq')},
        'score': attempt.score,
        'passed': bool(attempt.passed),
        'total_points': attempt.total_points,
        'max_points': attempt.max_points,
        'review': review,
    }), 200


@student_exam_bp.route('/exams/<exam_id>/run-code', methods=['POST'])
@require_role('student')
@limiter.limit("30 per minute")
def run_exam_code(exam_id):
    """
    Execute student code against visible/sample test cases during a timed exam
    without consuming attempts or recording grades.
    """
    from app.execution.routes import _run_docker
    from app.execution.languages import resolve as resolve_language
    from app.student.routes import _norm_output

    exam, err = _visible_exam_or_404(exam_id)
    if err:
        return err

    data = request.get_json() or {}
    question_id = data.get('question_id')
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'No code provided.'}), 400

    questions = _get_exam_questions_list(exam)
    q = next((item for item in questions if item.id == question_id), None)

    language = data.get('language') or (getattr(q, 'language', None) if q else None) or 'python'
    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400

    # Extract non-hidden test cases only
    sample_cases = []
    if q and getattr(q, 'test_cases', None):
        sample_cases = [tc for tc in q.test_cases if not tc.get('hidden')]
    elif isinstance(exam, Experiment):
        from app.models.experiment import TestCase
        tcs = TestCase.query.filter_by(experiment_id=exam.id, is_hidden=False).all()
        sample_cases = [{'input': tc.input_data or '', 'expected': tc.expected_output or ''} for tc in tcs]

    if not sample_cases:
        custom_in = data.get('stdin', '')
        sample_cases = [{'input': custom_in, 'expected': None}]

    results = []
    for i, tc in enumerate(sample_cases):
        tc_in = str(tc.get('input', '') or '')
        res, rerr = _run_docker(code, spec['id'], tc_in, g.user_id)
        if rerr:
            return jsonify({'error': 'Code execution engine unavailable. Try again shortly.'}), 503

        stdout = res.get('stdout') or ''
        stderr = res.get('stderr') or ''
        compile_out = res.get('compile_output') or ''
        status_desc = res.get('status_description') or 'Executed'

        expected = tc.get('expected')
        passed = False
        if expected is not None:
            passed = (res.get('status_id') == 3 and _norm_output(stdout) == _norm_output(str(expected)))
        else:
            passed = res.get('status_id') == 3

        results.append({
            'index': i + 1,
            'input': tc_in,
            'expected': expected,
            'actual': stdout,
            'stderr': stderr,
            'compile_output': compile_out,
            'passed': passed,
            'status': status_desc,
            'time_ms': res.get('time_ms'),
            'memory_kb': res.get('memory_kb'),
        })

    return jsonify({'results': results, 'language': language}), 200

