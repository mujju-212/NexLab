"""
Instructor Tier-2/3 enhancement endpoints:

/early-warning/<ss_id>            T2-6  — trend-based risk score
/ai-feedback-draft                T2-7  — governed AI narrative feedback draft
/error-analysis/<experiment_id>   T2-8  — compile-error frequency per experiment
/grades/curve                     T2-9  — curve with preview + apply
/grades/moderation                T2-9  — lock/unlock against recompute
/sessions/<sid>/random-student    T2-10 — cold-calling picker (joined students)
/sessions/<sid>/poll              T2-10 — open/close polls (results durable)
/experiments/<exp_id>/clone       T3-11 — deep-copy experiment + children
/question-bank                    T3-12 — shared MCQ pool (list/add/delete)
/analytics/hint-effectiveness     T3-16 — hints vs eventual pass/fail
/notes                            T3-14 — private per-student notes (CRUD)
"""
import re
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.user import User
from app.models.experiment import Experiment, TestCase, ContentModule, QuizQuestion, ContentProgress
from app.models.submission import CodeAttempt
from app.models.grading import Grade, HintLog
from app.models.knowledge import ConceptMastery, FocusScore
from app.models.academic import SectionSubject, SectionStudent
from app.models.enhancements import BankQuestion, TeacherNote, SessionPoll
from app.models.session import LabSession, SessionAttendance
from datetime import datetime, timedelta

tier2_bp = Blueprint('instructor_tier2', __name__)


def _my_ss_ids():
    return [ss.id for ss in SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id).all()]


def _my_students():
    my_ss = SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id).all()
    if not my_ss:
        return {}, []
    enrollments = SectionStudent.query.filter(
        SectionStudent.section_id.in_([s.section_id for s in my_ss])).all()
    ids = list({e.student_id for e in enrollments})
    users = {u.id: u for u in User.query.filter(User.id.in_(ids)).all()} if ids else {}
    return users, ids


# ══════════════════════════════════════════════════════════════════════════════
# T2-6 — Predictive early-warning (trend-based, before thresholds trigger)
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/early-warning/<ss_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def early_warning(ss_id):
    """
    Weighted risk score per student for one section-subject:
      mastery_drop   (×3): avg mastery < 40
      no_submission  (×3): no code attempt in the last 10 days
      focus_decline  (×1): avg focus < 50
      missing_grades (×1): ended sessions of mine with no grade row yet
    Score ≥ 6 → high, 3–5 → medium, else low.
    """
    ss = SectionSubject.query.filter_by(
        id=ss_id, institution_id=g.institution_id).first()
    if not ss:
        return jsonify({'error': 'Section not found.'}), 404
    if g.role == 'instructor' and ss.instructor_id != g.user_id:
        return jsonify({'error': 'Not your section-subject.'}), 403

    enrolled = [e.student_id for e in
                SectionStudent.query.filter_by(section_id=ss.section_id).all()]
    if not enrolled:
        return jsonify({'students': []}), 200

    users = {u.id: u for u in User.query.filter(User.id.in_(enrolled)).all()}
    now = datetime.utcnow()
    ten_days = now - timedelta(days=10)

    # Latest mastery per student
    mastery_rows = ConceptMastery.query.filter(
        ConceptMastery.institution_id == g.institution_id,
        ConceptMastery.student_id.in_(enrolled),
    ).all()
    mastery_avg = {}
    for r in mastery_rows:
        mastery_avg.setdefault(r.student_id, []).append(r.mastery_score or 0)
    mastery_avg = {k: sum(v) / len(v) for k, v in mastery_avg.items()}

    # Last submission per student (my experiments)
    my_exp_ids = [e.id for e in Experiment.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id,
        subject_id=ss.subject_id).all()]
    last_submission = {}
    if my_exp_ids:
        for a in CodeAttempt.query.filter(
                CodeAttempt.experiment_id.in_(my_exp_ids),
                CodeAttempt.student_id.in_(enrolled),
        ).order_by(CodeAttempt.submitted_at.desc()).all():
            if a.student_id not in last_submission and a.submitted_at:
                last_submission[a.student_id] = a.submitted_at

    # Avg focus per student
    ss_sessions = [s.id for s in LabSession.query.filter(
        LabSession.section_subject_id == ss.id).all()]
    focus_avg = {}
    if ss_sessions:
        f_rows = FocusScore.query.filter(FocusScore.session_id.in_(ss_sessions)).all()
        by = {}
        for f in f_rows:
            if f.focus_score is not None:
                by.setdefault(f.student_id, []).append(f.focus_score)
        focus_avg = {k: sum(v) / len(v) for k, v in by.items()}

    # Ended sessions without a grade row → missing engagement
    my_sessions = LabSession.query.filter(
        LabSession.section_subject_id == ss.id,
        LabSession.status == 'ended',
        LabSession.experiment_id.isnot(None),
    ).all()
    graded_pairs = set()
    if my_sessions:
        for gr in Grade.query.filter(Grade.experiment_id.in_(
                [s.experiment_id for s in my_sessions])).all():
            graded_pairs.add((gr.student_id, gr.experiment_id))
    missing_grades = {}
    for s in my_sessions:
        for sid in enrolled:
            if (sid, s.experiment_id) not in graded_pairs:
                missing_grades[sid] = missing_grades.get(sid, 0) + 1

    out = []
    for sid in enrolled:
        u = users.get(sid)
        if not u:
            continue
        m = mastery_avg.get(sid)
        last_sub = last_submission.get(sid)
        f = focus_avg.get(sid)
        missing = missing_grades.get(sid, 0)

        score = 0
        reasons = []
        if m is not None and m < 40:
            score += 3
            reasons.append(f'mastery avg {round(m)} < 40')
        if last_sub is None:
            score += 3
            reasons.append('no submissions recorded')
        elif last_sub < ten_days:
            score += 3
            reasons.append(f'no submissions in {(now - last_sub).days} days')
        if f is not None and f < 50:
            score += 1
            reasons.append(f'avg focus {round(f)} < 50')
        if missing >= 1:
            score += 1
            reasons.append(f'{missing} ended session(s) ungraded/unattempted')

        level = 'high' if score >= 6 else 'medium' if score >= 3 else 'low'
        if level != 'low':
            out.append({
                'student_id': sid,
                'full_name': u.full_name,
                'roll_number': u.roll_number,
                'risk_score': score,
                'level': level,
                'reasons': reasons,
                'mastery_avg': round(m, 1) if m is not None else None,
                'days_since_submission': (now - last_sub).days if last_sub else None,
                'avg_focus': round(f, 1) if f is not None else None,
            })

    out.sort(key=lambda x: x['risk_score'], reverse=True)
    return jsonify({'students': out, 'ss_id': ss_id}), 200


# ══════════════════════════════════════════════════════════════════════════════
# T2-7 — AI narrative feedback draft (governed)
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/ai-feedback-draft', methods=['POST'])
@require_role('instructor', 'institution_admin')
def ai_feedback_draft():
    """
    Draft feedback for one (student, experiment) via the governed AI gate.
    Instructor edits before saving — human-in-the-loop by design.
    Body: {student_id, experiment_id}
    """
    from app.ai.gate import guarded_ai_call, AIDisabled, AIQuotaExceeded

    data = request.get_json() or {}
    student_id = data.get('student_id')
    experiment_id = data.get('experiment_id')

    exp = Experiment.query.filter_by(
        id=experiment_id, institution_id=g.institution_id).first()
    if not exp:
        return jsonify({'error': 'Experiment not found.'}), 404
    if g.role == 'instructor' and exp.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403
    student = User.query.get(student_id)
    if not student:
        return jsonify({'error': 'Student not found.'}), 404

    attempts = CodeAttempt.query.filter_by(
        student_id=student_id, experiment_id=experiment_id).order_by(
        CodeAttempt.submitted_at.desc()).limit(10).all()
    finals = [a for a in attempts if a.is_final_submission]
    best = None
    if finals and finals[0].test_cases_total:
        best = round(finals[0].test_cases_passed / finals[0].test_cases_total * 100)
    masteries = ConceptMastery.query.filter_by(student_id=student_id).all()
    mastery_str = ', '.join(
        f'{m.concept}: {round(m.mastery_score or 0)}'
        for m in sorted(masteries, key=lambda x: x.mastery_score or 0)[:5])

    prompt = (
        'You are a supportive programming lab instructor writing short feedback '
        'for a student. 2-3 sentences, encouraging but honest, no greetings, '
        'no markdown, plain text only.\n'
        f'Student: {student.full_name}\n'
        f'Experiment: {exp.title}\n'
        f'Total attempts: {len(attempts)}\n'
        f'Best final test-pass: {best if best is not None else "no final submission"}%\n'
        f'Lowest concepts: {mastery_str or "n/a"}\n'
        'Write the feedback.'
    )

    try:
        response, model, is_fallback, usage = guarded_ai_call(
            'feedback',
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=250,
            temperature=0.6,
        )
    except AIDisabled as e:
        return jsonify({'error': str(e.reason)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': e.reason, 'quota': e.quota, 'used': e.used}), 429

    return jsonify({'draft': (response or '').strip(), 'model': model}), 200


# ══════════════════════════════════════════════════════════════════════════════
# T2-8 — Compile-error analysis
# ══════════════════════════════════════════════════════════════════════════════

_ERROR_SIGNATURES = [
    ('syntax error', 'Syntax error'),
    ('indentationerror', 'Indentation error'),
    ('nameerror', 'NameError (undefined name)'),
    ('typeerror', 'TypeError'),
    ('indexerror', 'IndexError'),
    ('keyerror', 'KeyError'),
    ('valueerror', 'ValueError'),
    ('attributeerror', 'AttributeError'),
    ('zerodivisionerror', 'Division by zero'),
    ('segmentation fault', 'Segfault'),
    ('undeclared identifier', 'Undeclared identifier'),
    ('expected \';\'', 'Missing semicolon'),
    ('was not declared', 'Undeclared identifier'),
    ('no matching function', 'No matching function'),
    ('redefinition', 'Redefinition'),
    ('expected declaration', 'Expected declaration'),
    ('infinite loop', None),  # placeholder guard, unused
]


@tier2_bp.route('/error-analysis/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def error_analysis(experiment_id):
    """
    Aggregate compile/runtime error frequencies from stored compile_output
    across all attempts of an experiment — "what the class keeps hitting".
    """
    exp = Experiment.query.filter_by(
        id=experiment_id, institution_id=g.institution_id).first()
    if not exp:
        return jsonify({'error': 'Experiment not found.'}), 404
    if g.role == 'instructor' and exp.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403

    attempts = CodeAttempt.query.filter_by(experiment_id=experiment_id).all()
    total = len(attempts)
    failed = [a for a in attempts if (a.compile_output or '').strip()]
    counts = {}
    samples = {}
    for a in failed:
        text = (a.compile_output or '').lower()
        matched = False
        for sig, label in _ERROR_SIGNATURES:
            if sig == 'infinite loop':
                continue
            if sig in text:
                counts[label] = counts.get(label, 0) + 1
                samples.setdefault(label, (a.compile_output or '')[:280])
                matched = True
                break
        if not matched:
            counts['Other compile/runtime error'] = counts.get('Other compile/runtime error', 0) + 1
            samples.setdefault('Other compile/runtime error', (a.compile_output or '')[:280])

    ranked = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return jsonify({
        'experiment_id': experiment_id,
        'title': exp.title,
        'total_attempts': total,
        'error_attempts': len(failed),
        'error_rate_pct': round(len(failed) / total * 100, 1) if total else 0,
        'errors': [{'label': label, 'count': count, 'sample': samples.get(label, '')}
                   for label, count in ranked],
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# T2-9 — Grade curve + moderation lock
# ══════════════════════════════════════════════════════════════════════════════

def _load_grades(exp_id):
    return Grade.query.filter_by(experiment_id=exp_id).all()


@tier2_bp.route('/grades/curve', methods=['POST'])
@require_role('instructor', 'institution_admin')
def curve_grades():
    """
    Curve final grades of one experiment. Two passes:
      mode=preview  → returns before/after rows, changes nothing
      mode=apply    → commits (locked rows are skipped)
    Body: {experiment_id, mode: 'add'|'factor', value: number}
    Finals are clamped to [0, grade_scale].
    """
    data = request.get_json() or {}
    exp = Experiment.query.filter_by(
        id=data.get('experiment_id'), institution_id=g.institution_id).first()
    if not exp:
        return jsonify({'error': 'Experiment not found.'}), 404
    if g.role == 'instructor' and exp.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403

    mode = data.get('mode')
    value = data.get('value')
    if mode not in ('add', 'factor'):
        return jsonify({'error': "mode must be 'add' or 'factor'"}), 400
    try:
        value = float(value)
    except (TypeError, ValueError):
        return jsonify({'error': 'value must be a number'}), 400
    if mode == 'add' and abs(value) > 50:
        return jsonify({'error': 'add curve capped at ±50'}), 400
    if mode == 'factor' and not (0.5 <= value <= 2.0):
        return jsonify({'error': 'factor curve must be between 0.5 and 2.0'}), 400

    scale = exp.grade_scale or 100
    grades = _load_grades(exp.id)

    def _apply(v):
        return max(0, min(scale, v + value if mode == 'add' else v * value))

    before = [g.final_grade for g in grades if g.final_grade is not None]
    after = [_apply(v) for v in before]

    if data.get('mode') and mode == 'apply' or data.get('apply') is True:
        changed = 0
        for g_ in grades:
            if g_.final_grade is None:
                continue
            if g_.is_locked:
                continue   # moderation-locked rows survive curves
            g_.final_grade = round(_apply(g_.final_grade), 2)
            changed += 1
        db.session.commit()
        return jsonify({
            'applied': True, 'changed': changed,
            'class_avg_before': round(sum(before) / len(before), 2) if before else None,
            'class_avg_after': round(sum(after) / len(after), 2) if after else None,
        }), 200

    return jsonify({
        'applied': False,
        'affected': len(before),
        'locked_skipped': len(grades) - len(before),
        'class_avg_before': round(sum(before) / len(before), 2) if before else None,
        'class_avg_after': round(sum(after) / len(after), 2) if after else None,
        'rows': [{
            'student_id': g_.student_id,
            'before': g_.final_grade,
            'after': round(_apply(g_.final_grade), 2) if g_.final_grade is not None else None,
            'locked': bool(g_.is_locked),
        } for g_ in grades],
    }), 200


@tier2_bp.route('/grades/moderation', methods=['POST'])
@require_role('instructor', 'institution_admin')
def moderation_lock():
    """
    Lock/unlock one grade row against recompute/curve.
    Body: {grade_id, is_locked: bool}
    """
    data = request.get_json() or {}
    row = Grade.query.get(data.get('grade_id'))
    if not row:
        return jsonify({'error': 'Grade not found.'}), 404
    exp = Experiment.query.get(row.experiment_id)
    if not exp or (g.role == 'instructor' and exp.instructor_id != g.user_id):
        return jsonify({'error': 'Not your grade row.'}), 403
    row.is_locked = bool(data.get('is_locked'))
    db.session.commit()
    return jsonify({'grade_id': row.id, 'is_locked': row.is_locked}), 200


# ══════════════════════════════════════════════════════════════════════════════
# T2-10 — Live-class tools: random picker + polls
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/sessions/<session_id>/random-student', methods=['GET'])
@require_role('instructor', 'institution_admin')
def random_student(session_id):
    """Pick a random student who has actually joined the live session."""
    import random
    sess = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id).first()
    if not sess:
        return jsonify({'error': 'Session not found.'}), 404
    joined = SessionAttendance.query.filter(
        SessionAttendance.session_id == session_id,
        SessionAttendance.joined_at.isnot(None),
    ).all()
    if not joined:
        return jsonify({'error': 'No students have joined yet.'}), 400
    pick = random.choice(joined)
    u = User.query.get(pick.student_id)
    return jsonify({
        'student_id': pick.student_id,
        'full_name': u.full_name if u else 'Student',
        'roll_number': u.roll_number if u else None,
    }), 200


@tier2_bp.route('/sessions/<session_id>/poll', methods=['POST'])
@require_role('instructor', 'institution_admin')
def create_poll(session_id):
    """
    Launch a quick poll. Body: {question, options: [str, …]}
    Persists the poll and emits it to students; votes come in over the
    socket (`poll_vote`) and are tallied server-side; instructor listens to
    `poll_update`. Close with POST …/poll/<poll_id>/close.
    """
    from app.extensions import socketio
    data = request.get_json() or {}
    question = (data.get('question') or '').strip()
    options = data.get('options') or []
    options = [str(o).strip() for o in options if str(o).strip()]
    if not question or len(options) < 2:
        return jsonify({'error': 'question and at least 2 options are required'}), 400
    if len(options) > 6:
        return jsonify({'error': 'max 6 options'}), 400

    sess = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id).first()
    if not sess:
        return jsonify({'error': 'Session not found.'}), 404

    poll = SessionPoll(
        session_id=session_id,
        created_by=g.user_id,
        question=question,
        options=options,
        responses={},
        is_open=True,
    )
    db.session.add(poll)
    db.session.commit()

    payload = poll.to_dict()
    socketio.emit('poll_started', payload, room=f"session_{session_id}_students")
    socketio.emit('poll_started', payload, room=f"session_{session_id}_instructor")
    return jsonify({'poll': poll.to_dict(include_results=True)}), 201


@tier2_bp.route('/sessions/<session_id>/poll/<poll_id>/close', methods=['POST'])
@require_role('instructor', 'institution_admin')
def close_poll(session_id, poll_id):
    from app.extensions import socketio
    poll = SessionPoll.query.filter_by(id=poll_id, session_id=session_id).first()
    if not poll:
        return jsonify({'error': 'Poll not found.'}), 404
    poll.is_open = False
    db.session.commit()
    payload = poll.to_dict(include_results=True)
    socketio.emit('poll_closed', payload, room=f"session_{session_id}_students")
    socketio.emit('poll_closed', payload, room=f"session_{session_id}_instructor")
    return jsonify({'poll': payload}), 200


@tier2_bp.route('/sessions/<session_id>/poll/<poll_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def poll_results(session_id, poll_id):
    poll = SessionPoll.query.filter_by(id=poll_id, session_id=session_id).first()
    if not poll:
        return jsonify({'error': 'Poll not found.'}), 404
    return jsonify({'poll': poll.to_dict(include_results=True)}), 200


# ══════════════════════════════════════════════════════════════════════════════
# T3-11 — Clone experiment (deep copy incl. children)
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/experiments/<exp_id>/clone', methods=['POST'])
@require_role('instructor', 'institution_admin')
def clone_experiment(exp_id):
    from app.models.conductor import Checkpoint
    src = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id).first()
    if not src:
        return jsonify({'error': 'Experiment not found.'}), 404
    if g.role == 'instructor' and src.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403

    copy = Experiment(
        institution_id=src.institution_id,
        subject_id=src.subject_id,
        instructor_id=src.instructor_id,
        exp_number=src.exp_number,
        title=f'{src.title} (copy)',
        aim=src.aim,
        theory=src.theory,
        problem_statement=src.problem_statement,
        input_format=src.input_format,
        output_format=src.output_format,
        difficulty_level=src.difficulty_level,
        concept_tags=list(src.concept_tags or []),
        allowed_languages=list(src.allowed_languages or []),
        is_multi_file=src.is_multi_file,
        file_structure=src.file_structure,
        enable_viva=src.enable_viva,
        enable_lockdown=src.enable_lockdown,
        allow_ai_hints=src.allow_ai_hints,
        time_limit_sec=src.time_limit_sec,
        is_published=False,                 # clones start as drafts
        ranking_visible=src.ranking_visible,
        experiment_type=src.experiment_type,
        proctor_defaults=dict(src.proctor_defaults or {}),
        rubric_test_cases=src.rubric_test_cases,
        rubric_lab_report=src.rubric_lab_report,
        rubric_code_quality=src.rubric_code_quality,
        rubric_viva=src.rubric_viva,
        rubric_quiz=src.rubric_quiz,
        weightage=src.weightage,
        grade_scale=src.grade_scale,
    )
    db.session.add(copy)
    db.session.flush()

    copied = {'test_cases': 0, 'modules': 0, 'questions': 0, 'checkpoints': 0}
    for tc in TestCase.query.filter_by(experiment_id=src.id).all():
        db.session.add(TestCase(
            experiment_id=copy.id,
            name=tc.name, description=tc.description,
            input_data=tc.input_data, expected_output=tc.expected_output,
            is_hidden=tc.is_hidden, weight=tc.weight,
        ))
        copied['test_cases'] += 1
    for m in ContentModule.query.filter_by(experiment_id=src.id).all():
        nm = ContentModule(
            experiment_id=copy.id,
            title=m.title, module_type=m.module_type,
            content_data=m.content_data, display_order=m.display_order,
            min_watch_pct=m.min_watch_pct,
        )
        db.session.add(nm)
        db.session.flush()
        copied['modules'] += 1
        for q in QuizQuestion.query.filter_by(module_id=m.id).all():
            db.session.add(QuizQuestion(
                module_id=nm.id, question_text=q.question_text,
                options=q.options, correct_answer=q.correct_answer,
                points=q.points, explanation=q.explanation,
            ))
            copied['questions'] += 1
    for cp in Checkpoint.query.filter_by(experiment_id=src.id).all():
        db.session.add(Checkpoint(
            experiment_id=copy.id, order=cp.order, title=cp.title,
            description=cp.description,
            test_case_ids=list(cp.test_case_ids or []),
            weight=cp.weight, is_gated=cp.is_gated, page_id=cp.page_id,
        ))
        copied['checkpoints'] += 1

    db.session.commit()
    return jsonify({
        'experiment': copy.to_dict(),
        'copied': copied,
        'message': f'Cloned as draft "{copy.title}".',
    }), 201


# ══════════════════════════════════════════════════════════════════════════════
# T3-12 — Shared question bank
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/question-bank', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_bank():
    """My bank questions. ?q= search, ?tag= filter."""
    q = BankQuestion.query.filter_by(institution_id=g.institution_id)
    if g.role == 'instructor':
        q = q.filter(BankQuestion.created_by == g.user_id)
    search = (request.args.get('q') or '').lower()
    if search:
        q = q.filter(BankQuestion.question_text.ilike(f'%{search}%'))
    tag = request.args.get('tag')
    if tag:
        q = q.filter(BankQuestion.tags.contains([tag]))
    rows = q.order_by(BankQuestion.created_at.desc()).limit(200).all()
    return jsonify({'questions': [r.to_dict() for r in rows]}), 200


@tier2_bp.route('/question-bank', methods=['POST'])
@require_role('instructor')
def add_to_bank():
    """
    Save a question into my bank (from the quiz editor).
    Body: {question_text, options, correct_answer, explanation?, tags?}
    """
    data = request.get_json() or {}
    text = (data.get('question_text') or '').strip()
    options = data.get('options') or []
    correct = (data.get('correct_answer') or '').strip().upper()
    if not text or not options or correct not in ('A', 'B', 'C', 'D'):
        return jsonify({'error': 'question_text, options and correct_answer (A–D) are required'}), 400

    row = BankQuestion(
        institution_id=g.institution_id,
        created_by=g.user_id,
        question_text=text,
        options=[str(o) for o in options][:6],
        correct_answer=correct,
        explanation=(data.get('explanation') or '').strip() or None,
        tags=[str(t) for t in (data.get('tags') or [])][:10],
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'question': row.to_dict()}), 201


@tier2_bp.route('/question-bank/<row_id>', methods=['DELETE'])
@require_role('instructor')
def delete_bank_question(row_id):
    row = BankQuestion.query.filter_by(
        id=row_id, institution_id=g.institution_id, created_by=g.user_id).first()
    if not row:
        return jsonify({'error': 'Bank question not found.'}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Removed from bank.'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# T3-14 — Private per-student notes
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/notes/<student_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_notes(student_id):
    """My private notes on one student (author-scoped: notes are private)."""
    rows = TeacherNote.query.filter_by(
        institution_id=g.institution_id,
        student_id=student_id,
        created_by=g.user_id,
    ).order_by(TeacherNote.created_at.desc()).limit(100).all()
    return jsonify({'notes': [r.to_dict() for r in rows]}), 200


@tier2_bp.route('/notes', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_note():
    data = request.get_json() or {}
    text = (data.get('note') or '').strip()
    if not data.get('student_id') or not text:
        return jsonify({'error': 'student_id and note are required'}), 400
    _, ids = _my_students()
    if g.role == 'instructor' and data['student_id'] not in ids:
        return jsonify({'error': 'That student is not in your sections.'}), 403
    row = TeacherNote(
        institution_id=g.institution_id,
        student_id=data['student_id'],
        created_by=g.user_id,
        note=text,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'note': row.to_dict()}), 201


@tier2_bp.route('/notes/<note_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_note(note_id):
    row = TeacherNote.query.filter_by(
        id=note_id, institution_id=g.institution_id, created_by=g.user_id).first()
    if not row:
        return jsonify({'error': 'Note not found.'}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Note deleted.'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# T3-16 — Hint-effectiveness analytics
# ══════════════════════════════════════════════════════════════════════════════

@tier2_bp.route('/analytics/hint-effectiveness/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def hint_effectiveness(experiment_id):
    """
    Do hints help or enable? Correlates HintLog usage with eventual outcome:
    per experiment — hint users vs non-users pass rate, hints per outcome,
    level distribution.
    """
    exp = Experiment.query.filter_by(
        id=experiment_id, institution_id=g.institution_id).first()
    if not exp:
        return jsonify({'error': 'Experiment not found.'}), 404
    if g.role == 'instructor' and exp.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403

    attempts = CodeAttempt.query.filter_by(
        experiment_id=experiment_id, is_final_submission=True).all()
    outcome = {}   # student_id → best pass pct
    for a in attempts:
        if a.test_cases_total:
            pct = a.test_cases_passed / a.test_cases_total * 100
            outcome[a.student_id] = max(outcome.get(a.student_id, 0), pct)

    hints = HintLog.query.filter_by(experiment_id=experiment_id).all()
    hints_by = {}
    level_by = {}
    for h in hints:
        hints_by.setdefault(h.student_id, []).append(h)
        level_by[h.hint_level] = level_by.get(h.hint_level, 0) + 1

    users = {u.id: u for u in HintUserQuery(hints)}
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_(list(hints_by.keys()))).all()} if hints_by else {}

    users_rows, non_users_pass = [], []
    all_student_ids = set(outcome.keys()) | set(hints_by.keys())
    for sid in all_student_ids:
        passed = outcome.get(sid, 0) >= 50
        n_hints = len(hints_by.get(sid, []))
        if n_hints > 0:
            users_rows.append({'student_id': sid, 'hints': n_hints, 'passed': passed,
                               'best_pass_pct': round(outcome.get(sid, 0), 1)})
        else:
            non_users_pass.append(passed)

    users_pass_rate = (sum(1 for r in users_rows if r['passed']) / len(users_rows) * 100
                       if users_rows else None)
    non_users_rate = (sum(1 for p in non_users_pass if p) / len(non_users_pass) * 100
                      if non_users_pass else None)

    by_level = {}
    for r in users_rows:
        pass_int = 1 if r['passed'] else 0
        by_level.setdefault('pass', []).append(min(r['hints'], 20))
        by_level.setdefault('fail', []).append(0 if pass_int else min(r['hints'], 20))

    return jsonify({
        'experiment_id': experiment_id,
        'title': exp.title,
        'students_with_attempts': len(all_student_ids),
        'hint_users': len(users_rows),
        'non_hint_users': len(non_users_pass),
        'pass_rate_hint_users': round(users_pass_rate, 1) if users_pass_rate is not None else None,
        'pass_rate_non_users': round(non_users_rate, 1) if non_users_rate is not None else None,
        'avg_hints_passed': round(sum(by_level.get('pass', [0])) / max(len(by_level.get('pass', [1])), 1), 1),
        'avg_hints_failed': round(sum(by_level.get('fail', [0])) / max(len(by_level.get('fail', [1])), 1), 1),
        'level_distribution': {str(k): v for k, v in sorted(level_by.items())},
        'top_users': sorted(
            [{'name': users_map[r['student_id']].full_name if r['student_id'] in users_map else '—',
              **r} for r in users_rows],
            key=lambda x: x['hints'], reverse=True)[:10],
    }), 200


def HintUserQuery(hints):
    """Distinct student users from hint rows."""
    ids = {h.student_id for h in hints}
    return User.query.filter(User.id.in_(ids)).all() if ids else []


# ══════════════════════════════════════════════════════════════════════════════
# T3-15 — Ranking visibility (handled in student routes; toggled via rubric PATCH)
# ══════════════════════════════════════════════════════════════════════════════
