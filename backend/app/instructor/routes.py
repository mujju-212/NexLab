"""
Instructor Blueprint
Handles: experiments, sessions, live monitoring, grading, viva, analytics
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import Experiment, TestCase, ContentModule, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, InlineComment, VivaSession
from app.models.knowledge import StudentRanking, ConceptMastery, FocusScore
from app.models.feedback import PlagiarismFlag
from app.models.academic import SectionSubject, Section, SectionStudent
from app.models.subject import Subject
from app.models.user import User
from datetime import datetime, timedelta
import uuid

instructor_bp = Blueprint('instructor', __name__)


# ── Instructor Dashboard + Teaching Assignments ────────────────────────────────

@instructor_bp.route('/section-subjects', methods=['GET'])
@require_role('instructor', 'institution_admin')
def my_section_subjects():
    """All section-subjects assigned to this instructor (with names + headcount)."""
    assignments = SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()

    result = []
    for ss in assignments:
        subject = Subject.query.get(ss.subject_id)
        section = Section.query.get(ss.section_id)
        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name if subject else '',
            'subject_code': subject.code if subject else '',
            'section_id': ss.section_id,
            'section_name': section.name if section else '',
            'student_count': SectionStudent.query.filter_by(section_id=ss.section_id).count(),
        })
    return jsonify({'section_subjects': result}), 200


@instructor_bp.route('/dashboard', methods=['GET'])
@require_role('instructor', 'institution_admin')
def instructor_dashboard():
    """Aggregate stats for the instructor dashboard."""
    now = datetime.utcnow()

    active_sessions = LabSession.query.filter_by(
        institution_id=g.institution_id, status='active'
    ).all()
    upcoming_sessions = LabSession.query.filter(
        LabSession.institution_id == g.institution_id,
        LabSession.status == 'scheduled',
        LabSession.scheduled_at >= now,
    ).order_by(LabSession.scheduled_at.asc()).limit(5).all()

    my_exp_ids = [
        e.id for e in Experiment.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]

    # Students across the instructor's assigned sections
    my_section_ids = [
        ss.section_id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]
    student_count = SectionStudent.query.filter(
        SectionStudent.section_id.in_(my_section_ids)
    ).count() if my_section_ids else 0

    # Pending grading: final submissions with no Grade row yet
    pending = []
    if my_exp_ids:
        graded_pairs = {
            (gr.student_id, gr.experiment_id)
            for gr in Grade.query.filter(Grade.experiment_id.in_(my_exp_ids)).all()
        }
        finals = CodeAttempt.query.filter(
            CodeAttempt.experiment_id.in_(my_exp_ids),
            CodeAttempt.is_final_submission == True,  # noqa: E712
        ).order_by(CodeAttempt.submitted_at.desc()).all()
        seen = set()
        for att in finals:
            pair = (att.student_id, att.experiment_id)
            if pair in graded_pairs or pair in seen:
                continue
            seen.add(pair)
            u = User.query.get(att.student_id)
            exp = Experiment.query.get(att.experiment_id)
            pending.append({
                'student_id': att.student_id,
                'experiment_id': att.experiment_id,
                'session_id': att.session_id,
                'student_name': u.full_name if u else 'Unknown',
                'roll_number': u.roll_number if u else '',
                'experiment_title': exp.title if exp else 'Unknown',
                'submitted_at': att.submitted_at.isoformat() if att.submitted_at else None,
                'test_cases_passed': att.test_cases_passed,
                'test_cases_total': att.test_cases_total,
            })

    return jsonify({
        'active_sessions': [_enriched_session(s) for s in active_sessions],
        'upcoming_sessions': [_enriched_session(s) for s in upcoming_sessions],
        'pending_submissions': pending[:10],
        'stats': {
            'experiment_count': len(my_exp_ids),
            'student_count': student_count,
            'active_session_count': len(active_sessions),
            'pending_grading_count': len(pending),
        },
    }), 200


def _enriched_session(s):
    """Session dict with human-readable labels for the frontend."""
    d = s.to_dict()
    d['started_at'] = s.started_at.isoformat() if s.started_at else None
    d['ended_at'] = s.ended_at.isoformat() if s.ended_at else None
    d['section_subject_id'] = s.section_subject_id
    d['late_join_window_min'] = s.late_join_window_min

    exp = Experiment.query.get(s.experiment_id)
    d['experiment_title'] = exp.title if exp else 'Unknown experiment'

    ss = SectionSubject.query.get(s.section_subject_id)
    section_name = subject_name = None
    student_count = 0
    if ss:
        sec = Section.query.get(ss.section_id)
        subj = Subject.query.get(ss.subject_id)
        section_name = sec.name if sec else None
        subject_name = subj.name if subj else None
        student_count = SectionStudent.query.filter_by(section_id=ss.section_id).count()
    d['section_name'] = section_name
    d['subject_name'] = subject_name
    d['student_count'] = student_count
    return d


# ── Experiment Management ──────────────────────────────────────────────────────

@instructor_bp.route('/experiments', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_experiments():
    subject_id = request.args.get('subject_id')
    query = Experiment.query.filter_by(institution_id=g.institution_id, instructor_id=g.user_id)
    if subject_id:
        query = query.filter_by(subject_id=subject_id)
    exps = query.order_by(Experiment.exp_number).all()
    return jsonify({'experiments': [e.to_dict() for e in exps]}), 200


@instructor_bp.route('/experiments', methods=['POST'])
@require_role('instructor', 'institution_admin')
def create_experiment():
    data = request.get_json() or {}

    # ── Validation 1: concept_tags required and non-empty ─────────────────────
    concept_tags = data.get('concept_tags', [])
    if not isinstance(concept_tags, list) or len(concept_tags) == 0:
        return jsonify({
            'error': 'concept_tags is required and must be a non-empty list.',
            'example': '["arrays", "sorting", "recursion"]'
        }), 400

    # ── Validation 2: difficulty_level must be 1–4 ───────────────────────────
    difficulty_level = data.get('difficulty_level', 1)
    if difficulty_level not in (1, 2, 3, 4):
        return jsonify({
            'error': 'difficulty_level must be 1, 2, 3, or 4.',
            'received': difficulty_level
        }), 400

    # ── Validation 3: rubric weights must sum to 100 ─────────────────────────
    r_tc  = data.get('rubric_test_cases',   60)
    r_lr  = data.get('rubric_lab_report',   20)
    r_cq  = data.get('rubric_code_quality', 10)
    r_viva= data.get('rubric_viva',         10)
    if (r_tc + r_lr + r_cq + r_viva) != 100:
        return jsonify({
            'error': 'Rubric weights must sum to exactly 100.',
            'received_sum': r_tc + r_lr + r_cq + r_viva,
            'breakdown': {
                'rubric_test_cases':   r_tc,
                'rubric_lab_report':   r_lr,
                'rubric_code_quality': r_cq,
                'rubric_viva':         r_viva,
            }
        }), 400

    exp = Experiment(
        institution_id=g.institution_id,
        subject_id=data['subject_id'],
        instructor_id=g.user_id,
        exp_number=data['exp_number'],
        title=data['title'],
        aim=data.get('aim'),
        theory=data.get('theory'),
        problem_statement=data.get('problem_statement'),
        input_format=data.get('input_format'),
        output_format=data.get('output_format'),
        difficulty_level=difficulty_level,
        concept_tags=concept_tags,
        allowed_languages=data.get('allowed_languages', ['python', 'cpp', 'c', 'java']),
        is_multi_file=data.get('is_multi_file', False),
        file_structure=data.get('file_structure'),
        rubric_test_cases=r_tc,
        rubric_lab_report=r_lr,
        rubric_code_quality=r_cq,
        rubric_viva=r_viva,
        enable_viva=data.get('enable_viva', False),
        enable_lockdown=data.get('enable_lockdown', False),
        allow_ai_hints=data.get('allow_ai_hints', True),
        time_limit_sec=data.get('time_limit_sec', 10),
    )
    db.session.add(exp)
    db.session.commit()
    return jsonify({'experiment': exp.to_dict()}), 201


@instructor_bp.route('/experiments/<exp_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_experiment(exp_id):
    exp = Experiment.query.filter_by(id=exp_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}

    # ── Validation 1: concept_tags if provided must be non-empty list ─────────
    if 'concept_tags' in data:
        if not isinstance(data['concept_tags'], list) or len(data['concept_tags']) == 0:
            return jsonify({
                'error': 'concept_tags must be a non-empty list.',
                'example': '["arrays", "sorting"]'
            }), 400

    # ── Validation 2: difficulty_level if provided must be 1–4 ───────────────
    if 'difficulty_level' in data:
        if data['difficulty_level'] not in (1, 2, 3, 4):
            return jsonify({
                'error': 'difficulty_level must be 1, 2, 3, or 4.',
                'received': data['difficulty_level']
            }), 400

    # ── Validation 3: if any rubric field sent, validate all four sum to 100 ──
    rubric_fields = ['rubric_test_cases', 'rubric_lab_report', 'rubric_code_quality', 'rubric_viva']
    if any(f in data for f in rubric_fields):
        r_tc   = data.get('rubric_test_cases',   exp.rubric_test_cases)
        r_lr   = data.get('rubric_lab_report',   exp.rubric_lab_report)
        r_cq   = data.get('rubric_code_quality', exp.rubric_code_quality)
        r_viva = data.get('rubric_viva',         exp.rubric_viva)
        if (r_tc + r_lr + r_cq + r_viva) != 100:
            return jsonify({
                'error': 'Rubric weights must sum to exactly 100.',
                'received_sum': r_tc + r_lr + r_cq + r_viva,
                'breakdown': {
                    'rubric_test_cases':   r_tc,
                    'rubric_lab_report':   r_lr,
                    'rubric_code_quality': r_cq,
                    'rubric_viva':         r_viva,
                }
            }), 400

    allowed_fields = ['title', 'aim', 'theory', 'problem_statement', 'input_format',
                      'output_format', 'difficulty_level', 'concept_tags', 'allowed_languages',
                      'is_multi_file', 'file_structure', 'rubric_test_cases', 'rubric_lab_report',
                      'rubric_code_quality', 'rubric_viva', 'enable_viva', 'enable_lockdown',
                      'allow_ai_hints', 'time_limit_sec', 'is_published']
    for field in allowed_fields:
        if field in data:
            setattr(exp, field, data[field])
    db.session.commit()
    return jsonify({'experiment': exp.to_dict()}), 200


@instructor_bp.route('/experiments/<exp_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_experiment(exp_id):
    exp = Experiment.query.filter_by(id=exp_id, institution_id=g.institution_id).first_or_404()

    # Remove owned children: test cases + content modules (+ quiz questions)
    TestCase.query.filter_by(experiment_id=exp_id).delete()
    for module in ContentModule.query.filter_by(experiment_id=exp_id).all():
        QuizQuestion.query.filter_by(module_id=module.id).delete()
        db.session.delete(module)

    db.session.delete(exp)
    db.session.commit()
    return jsonify({'message': 'Experiment deleted'}), 200


# ── Test Cases ─────────────────────────────────────────────────────────────────

@instructor_bp.route('/experiments/<exp_id>/test-cases', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_test_cases(exp_id):
    cases = TestCase.query.filter_by(experiment_id=exp_id).all()
    return jsonify({'test_cases': [c.to_dict(include_hidden=True) for c in cases]}), 200


@instructor_bp.route('/experiments/<exp_id>/test-cases', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_test_case(exp_id):
    data = request.get_json()
    # Support single or batch upload
    cases_data = data if isinstance(data, list) else [data]
    created = []
    for case_data in cases_data:
        tc = TestCase(
            experiment_id=exp_id,
            input_data=case_data.get('input_data', ''),
            expected_output=case_data.get('expected_output', ''),
            is_hidden=case_data.get('is_hidden', False),
            points_weight=case_data.get('points_weight', 1.0),
            description=case_data.get('description'),
        )
        db.session.add(tc)
        created.append(tc)
    db.session.commit()
    return jsonify({'created': len(created)}), 201


# ── AI Test Case Generator ─────────────────────────────────────────────────────

@instructor_bp.route('/experiments/<exp_id>/generate-test-cases', methods=['POST'])
@require_role('instructor', 'institution_admin')
def generate_test_cases(exp_id):
    """Use Groq to auto-generate test cases from problem statement"""
    exp = Experiment.query.filter_by(id=exp_id, institution_id=g.institution_id).first_or_404()
    from groq import Groq
    from flask import current_app
    import json, re

    client = Groq(api_key=current_app.config['GROQ_API_KEY'])
    count  = request.get_json().get('count', 6)

    prompt = f"""Generate {count} test cases for this programming problem.
Return ONLY a JSON array (no explanation):
[{{"input": "...", "expected_output": "...", "description": "...", "is_hidden": false}}]
Make 2/3 visible and 1/3 hidden. Cover edge cases.

Problem: {exp.problem_statement}
Input format: {exp.input_format}
Output format: {exp.output_format}"""

    resp = client.chat.completions.create(
        model='llama-3.3-70b-versatile',
        messages=[{'role': 'user', 'content': prompt}],
        max_tokens=800, temperature=0.3
    )

    try:
        json_match = re.search(r'\[.*\]', resp.choices[0].message.content, re.DOTALL)
        test_cases = json.loads(json_match.group()) if json_match else []
    except Exception:
        return jsonify({'error': 'Could not parse generated test cases'}), 500

    # Save them
    saved = []
    for tc_data in test_cases:
        tc = TestCase(
            experiment_id=exp_id,
            input_data=tc_data.get('input', ''),
            expected_output=tc_data.get('expected_output', ''),
            is_hidden=tc_data.get('is_hidden', False),
            description=tc_data.get('description'),
        )
        db.session.add(tc)
        saved.append(tc_data)
    db.session.commit()

    return jsonify({'generated': len(saved), 'test_cases': saved}), 201


# ── Session Management ─────────────────────────────────────────────────────────

@instructor_bp.route('/sessions', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_sessions():
    sessions = LabSession.query.filter_by(institution_id=g.institution_id).order_by(
        LabSession.scheduled_at.desc()
    ).limit(50).all()
    return jsonify({'sessions': [_enriched_session(s) for s in sessions]}), 200


@instructor_bp.route('/sessions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def schedule_session():
    data = request.get_json()
    room_name = f"vlab-{g.institution_id[:8]}-{uuid.uuid4().hex[:8]}"
    session = LabSession(
        institution_id=g.institution_id,
        section_subject_id=data['section_subject_id'],
        experiment_id=data['experiment_id'],
        scheduled_at=datetime.fromisoformat(data['scheduled_at']),
        duration_minutes=data.get('duration_minutes', 180),
        gate_score_threshold=data.get('gate_score_threshold', 70),
        late_join_window_min=data.get('late_join_window_min', 10),
        catchup_enabled=data.get('catchup_enabled', False),
        catchup_deadline=datetime.fromisoformat(data['catchup_deadline']) if data.get('catchup_deadline') else None,
        focus_ml_enabled=data.get('focus_ml_enabled', False),
        lockdown_enabled=data.get('lockdown_enabled', False),
        jitsi_room_name=room_name,
    )
    db.session.add(session)
    db.session.commit()
    return jsonify({'session': session.to_dict()}), 201


@instructor_bp.route('/sessions/<session_id>/start', methods=['POST'])
@require_role('instructor', 'institution_admin')
def start_session(session_id):
    """Start session with environment health check"""
    from flask import current_app
    import requests as req

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status != 'scheduled':
        return jsonify({'error': f'Session is already {session.status}'}), 400

    # Health check Judge0
    try:
        r = req.get(f"{current_app.config['JUDGE0_URL']}/system_info", timeout=3)
        if r.status_code != 200:
            return jsonify({'error': 'Code execution service is unavailable. Cannot start session.'}), 503
    except Exception:
        return jsonify({'error': 'Code execution service is offline. Cannot start session.'}), 503

    # Initialize attendance records for all enrolled students
    ss = SectionSubject.query.get(session.section_subject_id)
    if ss:
        students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
        for enrollment in students:
            if not SessionAttendance.query.filter_by(
                session_id=session_id, student_id=enrollment.student_id
            ).first():
                db.session.add(SessionAttendance(
                    session_id=session_id,
                    student_id=enrollment.student_id,
                    status='absent'
                ))

    session.status     = 'active'
    session.started_at = datetime.utcnow()
    db.session.commit()

    # Broadcast via Socket.io
    from app.extensions import socketio
    socketio.emit('session_started', {
        'session_id': session_id,
        'jitsi_room': session.jitsi_room_name,
    }, room=f"session_{session_id}_students")

    return jsonify({'session': session.to_dict()}), 200


@instructor_bp.route('/sessions/<session_id>/end', methods=['POST'])
@require_role('instructor', 'institution_admin')
def end_session(session_id):
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()
    session.status   = 'ended'
    session.ended_at = datetime.utcnow()

    # Finalize attendance statuses
    _finalize_attendance(session_id)

    db.session.commit()

    # Broadcast session end to all students
    from app.extensions import socketio
    socketio.emit('session_ended', {
        'session_id': session_id,
        'message': 'Session has ended. Please submit if you have not already.'
    }, room=f"session_{session_id}_students")

    return jsonify({'status': 'ended'}), 200


def _finalize_attendance(session_id):
    """Apply attendance rules after session ends"""
    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    session = LabSession.query.get(session_id)

    for att in attendances:
        if att.override_reason:  # manually overridden — don't touch
            continue
        if not att.joined_at:
            att.status = 'absent'
        elif att.total_time_seconds >= 1800:   # 30 minutes
            att.status = 'present' if not att.is_catchup else 'present'
            # Check if joined late
            if att.joined_at > session.started_at:
                from datetime import timedelta
                late_threshold = session.started_at + timedelta(minutes=session.late_join_window_min)
                if att.joined_at > late_threshold:
                    att.status = 'late'
            if att.status == 'present' and not att.is_active_participant:
                att.status = 'inactive_present'
        else:
            att.status = 'partial'


# ── Live Session Dashboard ─────────────────────────────────────────────────────

@instructor_bp.route('/sessions/<session_id>/dashboard', methods=['GET'])
@require_role('instructor', 'institution_admin')
def live_dashboard(session_id):
    """Current state of all students in session"""
    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    students_status = []

    for att in attendances:
        # Get latest focus score
        latest_focus = FocusScore.query.filter_by(
            student_id=att.student_id, session_id=session_id
        ).order_by(FocusScore.recorded_at.desc()).first()

        # Get latest code attempt count
        attempt_count = CodeAttempt.query.filter_by(
            student_id=att.student_id
        ).count()

        student_user = User.query.get(att.student_id)
        students_status.append({
            'student_id': att.student_id,
            'full_name': student_user.full_name if student_user else 'Unknown',
            'roll_number': student_user.roll_number if student_user else '',
            'status': att.status,
            'joined_at': att.joined_at.isoformat() if att.joined_at else None,
            'total_time_sec': att.total_time_seconds,
            'focus_score': latest_focus.focus_score if latest_focus else None,
            'attempt_count': attempt_count,
            'is_active': att.is_active_participant,
        })

    session = LabSession.query.get(session_id)
    return jsonify({
        'session_id': session_id,
        'session_status': session.status if session else None,
        'students': students_status,
    }), 200


# ── Grading ────────────────────────────────────────────────────────────────────

@instructor_bp.route('/submissions/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_submissions(experiment_id):
    submissions = CodeAttempt.query.filter_by(
        experiment_id=experiment_id, is_final_submission=True
    ).order_by(CodeAttempt.submitted_at.desc()).all()

    student_ids = [s.student_id for s in submissions]
    students = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    result = []
    for s in submissions:
        d = s.to_dict()
        u = students.get(s.student_id)
        d['student_id'] = s.student_id
        d['session_id'] = s.session_id
        d['full_name'] = u.full_name if u else 'Unknown'
        d['roll_number'] = u.roll_number if u else ''
        result.append(d)
    return jsonify({'submissions': result}), 200


@instructor_bp.route('/grades', methods=['POST'])
@require_role('instructor', 'institution_admin')
def save_grade():
    data = request.get_json()
    student_id    = data['student_id']
    experiment_id = data['experiment_id']

    grade = Grade.query.filter_by(
        student_id=student_id, experiment_id=experiment_id
    ).first()

    if not grade:
        grade = Grade(student_id=student_id, experiment_id=experiment_id,
                      session_id=data.get('session_id'))
        db.session.add(grade)

    if grade.is_locked:
        return jsonify({'error': 'Grade is locked (student has viewed it)'}), 409

    grade.manual_grade    = data.get('manual_grade')
    grade.manual_feedback = data.get('manual_feedback')
    grade.graded_by       = g.user_id
    grade.graded_at       = datetime.utcnow()

    # ── Auto-populate auto_grade from best Judge0 submission ──────────────────
    # Pick the final submission with the most test cases passed
    best_submission = CodeAttempt.query.filter_by(
        student_id=student_id,
        experiment_id=experiment_id,
        is_final_submission=True,
    ).order_by(
        CodeAttempt.test_cases_passed.desc()
    ).first()

    if best_submission and best_submission.test_cases_total and best_submission.test_cases_total > 0:
        # auto_grade = % of test cases passed (0–100)
        grade.auto_grade = round(
            (best_submission.test_cases_passed / best_submission.test_cases_total) * 100, 1
        )
        # code_quality_grade: radon quality_grade mapped to 0–10 scale
        quality_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}
        if best_submission.quality_grade:
            grade.code_quality_grade = quality_map.get(best_submission.quality_grade, 5)
    elif best_submission:
        # submitted but no test cases configured — treat as full marks
        grade.auto_grade = 100.0

    # ── Recalculate final from all 4 components ───────────────────────────────
    exp = Experiment.query.get(experiment_id)
    rubric = {
        'test_cases':   exp.rubric_test_cases,
        'lab_report':   exp.rubric_lab_report,
        'code_quality': exp.rubric_code_quality,
        'viva':         exp.rubric_viva,
    }
    grade.calculate_final(rubric)
    db.session.commit()

    return jsonify({'grade': grade.to_dict()}), 200


@instructor_bp.route('/grades/<grade_id>/inline-comment', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_inline_comment(grade_id):
    data = request.get_json()
    comment = InlineComment(
        grade_id=grade_id,
        file_name=data.get('file_name', 'main'),
        line_number=data['line_number'],
        comment=data['comment'],
    )
    db.session.add(comment)
    db.session.commit()
    return jsonify({'id': comment.id}), 201


# ── Code Replay ────────────────────────────────────────────────────────────────

@instructor_bp.route('/replay/<student_id>/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def code_replay(student_id, experiment_id):
    """Get all code versions for replay"""
    versions = CodeVersion.query.filter_by(
        student_id=student_id, experiment_id=experiment_id
    ).order_by(CodeVersion.version_number).all()

    return jsonify({'versions': [{
        'version_number': v.version_number,
        'files': v.files,
        'save_type': v.save_type,
        'saved_at': v.saved_at.isoformat() if v.saved_at else None,
    } for v in versions]}), 200


# ── Plagiarism Flags ───────────────────────────────────────────────────────────

@instructor_bp.route('/plagiarism-flags', methods=['GET'])
@require_role('instructor', 'institution_admin')
def plagiarism_flags():
    exp_id = request.args.get('experiment_id')
    query = PlagiarismFlag.query.filter_by(institution_id=g.institution_id)
    if exp_id:
        query = query.filter_by(experiment_id=exp_id)
    flags = query.filter_by(status='pending').all()
    return jsonify({'flags': [f.to_dict() for f in flags]}), 200


@instructor_bp.route('/plagiarism-flags/<flag_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def review_flag(flag_id):
    flag = PlagiarismFlag.query.filter_by(
        id=flag_id, institution_id=g.institution_id
    ).first_or_404()
    data = request.get_json()
    flag.status       = data['status']    # cleared | actioned
    flag.review_notes = data.get('review_notes')
    flag.reviewed_by  = g.user_id
    flag.reviewed_at  = datetime.utcnow()
    db.session.commit()
    return jsonify({'flag': flag.to_dict()}), 200


@instructor_bp.route('/sessions/<session_id>/plagiarism', methods=['GET'])
@require_role('instructor', 'institution_admin')
def session_plagiarism(session_id):
    """
    View plagiarism flags for a specific session.
    Returns all flags (pending, cleared, actioned) with student names + similarity %.
    """
    from app.models.user import User
    from app.models.experiment import Experiment as Exp

    flags = PlagiarismFlag.query.filter_by(
        session_id=session_id, institution_id=g.institution_id
    ).order_by(PlagiarismFlag.similarity_pct.desc()).all()

    result = []
    for f in flags:
        student_a = User.query.get(f.student_a_id)
        student_b = User.query.get(f.student_b_id)
        exp       = Exp.query.get(f.experiment_id)
        result.append({
            'id':             f.id,
            'student_a':      {'id': f.student_a_id, 'name': student_a.full_name if student_a else 'Unknown'},
            'student_b':      {'id': f.student_b_id, 'name': student_b.full_name if student_b else 'Unknown'},
            'experiment':     {'id': f.experiment_id, 'title': exp.title if exp else 'Unknown'},
            'similarity_pct': f.similarity_pct,
            'status':         f.status,
            'detected_at':    f.detected_at.isoformat() if f.detected_at else None,
            'reviewed_by':    f.reviewed_by,
            'reviewed_at':    f.reviewed_at.isoformat() if f.reviewed_at else None,
            'review_notes':   f.review_notes,
        })

    return jsonify({
        'session_id': session_id,
        'total_flags': len(result),
        'pending': sum(1 for r in result if r['status'] == 'pending'),
        'flags': result,
    }), 200


# ── Analytics ─────────────────────────────────────────────────────────────────

@instructor_bp.route('/analytics/section/<section_subject_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def section_analytics(section_subject_id):
    """Holistic ranking for all students in a section-subject"""
    rankings = StudentRanking.query.filter_by(
        section_subject_id=section_subject_id
    ).order_by(StudentRanking.rank_position).all()

    result = []
    for r in rankings:
        d = r.to_dict()
        d['student_id'] = r.student_id
        u = User.query.get(r.student_id)
        d['full_name'] = u.full_name if u else 'Unknown'
        d['roll_number'] = u.roll_number if u else ''
        result.append(d)
    return jsonify({'rankings': result}), 200


@instructor_bp.route('/analytics/student/<student_id>/mastery', methods=['GET'])
@require_role('instructor', 'institution_admin')
def student_mastery(student_id):
    masteries = ConceptMastery.query.filter_by(student_id=student_id).all()
    return jsonify({'mastery': [m.to_dict() for m in masteries]}), 200
