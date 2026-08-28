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
from app.models.feedback import PlagiarismFlag, SessionFeedback
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
        exp_count = Experiment.query.filter_by(
            institution_id=g.institution_id, subject_id=ss.subject_id
        ).count()
        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name if subject else '',
            'subject_code': subject.code if subject else '',
            'section_id': ss.section_id,
            'section_name': section.name if section else '',
            'student_count': SectionStudent.query.filter_by(section_id=ss.section_id).count(),
            'experiment_count': exp_count,
        })
    return jsonify({'section_subjects': result}), 200


@instructor_bp.route('/dashboard', methods=['GET'])
@require_role('instructor', 'institution_admin')
def instructor_dashboard():
    """Aggregate stats for the instructor dashboard."""
    now = datetime.utcnow()

    # Only sessions whose section-subject this instructor teaches
    my_ss_ids = [
        ss.id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]

    active_sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'active',
    ).all() if my_ss_ids else []
    upcoming_sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'scheduled',
        LabSession.scheduled_at >= now,
    ).order_by(LabSession.scheduled_at.asc()).limit(5).all() if my_ss_ids else []

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
        weightage=data.get('weightage', 1),
        grade_scale=data.get('grade_scale', 100),
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
                      'allow_ai_hints', 'time_limit_sec', 'is_published',
                      'weightage', 'grade_scale']
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
    from app.ai.groq_client import groq_single
    import json, re

    count  = request.get_json().get('count', 6)

    prompt = f"""Generate {count} test cases for this programming problem.
Return ONLY a JSON array (no explanation):
[{{"input": "...", "expected_output": "...", "description": "...", "is_hidden": false}}]
Make 2/3 visible and 1/3 hidden. Cover edge cases.

Problem: {exp.problem_statement}
Input format: {exp.input_format}
Output format: {exp.output_format}"""

    content, model_used, is_fallback, _ = groq_single(
        prompt, pool='quality', max_tokens=800, temperature=0.3
    )
    if is_fallback or content is None:
        return jsonify({'error': 'AI generator temporarily unavailable (all Groq models rate-limited). Try again in a minute.'}), 503

    try:
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
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


@instructor_bp.route('/experiments/generate-test-cases-preview', methods=['POST'])
@require_role('instructor', 'institution_admin')
def generate_test_cases_preview():
    """Generate test cases from a problem statement WITHOUT persisting.

    Used by the create-experiment page, where no experiment id exists yet.
    The instructor stages the returned cases client-side and they are saved
    (via the normal batch add-test-cases route) once the experiment is created.
    """
    from app.ai.groq_client import groq_single
    import json, re

    data = request.get_json() or {}
    problem = (data.get('problem_statement') or '').strip()
    if not problem:
        return jsonify({'error': 'A problem statement is required to generate test cases.'}), 400
    count = data.get('count', 6)

    prompt = f"""Generate {count} test cases for this programming problem.
Return ONLY a JSON array (no explanation):
[{{"input": "...", "expected_output": "...", "description": "...", "is_hidden": false}}]
Make 2/3 visible and 1/3 hidden. Cover edge cases.

Problem: {problem}
Input format: {data.get('input_format') or ''}
Output format: {data.get('output_format') or ''}"""

    content, model_used, is_fallback, _ = groq_single(
        prompt, pool='quality', max_tokens=800, temperature=0.3
    )
    if is_fallback or content is None:
        return jsonify({'error': 'AI generator temporarily unavailable (all Groq models rate-limited). Try again in a minute.'}), 503

    try:
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        test_cases = json.loads(json_match.group()) if json_match else []
    except Exception:
        return jsonify({'error': 'Could not parse generated test cases'}), 500

    return jsonify({'test_cases': test_cases, 'count': len(test_cases)}), 200


# ── Session Management ─────────────────────────────────────────────────────────

@instructor_bp.route('/sessions', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_sessions():
    # institution_admin sees all; instructor sees only their own section-subjects
    if g.role == 'institution_admin':
        sessions = LabSession.query.filter_by(
            institution_id=g.institution_id
        ).order_by(LabSession.scheduled_at.desc()).limit(50).all()
    else:
        my_ss_ids = [
            ss.id for ss in SectionSubject.query.filter_by(
                institution_id=g.institution_id, instructor_id=g.user_id
            ).all()
        ]
        sessions = LabSession.query.filter(
            LabSession.section_subject_id.in_(my_ss_ids)
        ).order_by(LabSession.scheduled_at.desc()).limit(50).all() if my_ss_ids else []
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
    import subprocess

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status != 'scheduled':
        return jsonify({'error': f'Session is already {session.status}'}), 400

    # Gate on the code execution engine — a live coding session is useless
    # without it, so refuse to start if Docker is disabled or the daemon is down.
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled. Cannot start session.'}), 503
    try:
        probe = subprocess.run(
            [current_app.config.get('DOCKER_BIN', 'docker'),
             'version', '--format', '{{.Server.Version}}'],
            capture_output=True, timeout=5,
        )
        if probe.returncode != 0:
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
    # Session mode machine (D1) — starts in briefing
    session.current_mode = session.current_mode or 'briefing'
    # Ensure LivePageState exists for pacing
    from app.models.conductor import LivePageState
    if not LivePageState.query.filter_by(session_id=session_id).first():
        lps = LivePageState(session_id=session_id, updated_by=g.user_id)
        db.session.add(lps)
        db.session.flush()
        session.live_page_state_id = lps.id
    db.session.commit()

    # Create LiveKit room and generate instructor JWT token
    livekit_token = None
    if current_app.config.get('LIVEKIT_URL'):
        from app.livekit_helper import create_room, make_token
        create_room(session.jitsi_room_name)   # jitsi_room_name doubles as LiveKit room name
        livekit_token = make_token(
            room_name=session.jitsi_room_name,
            identity=f"instructor-{g.user_id[:8]}",
            name=getattr(g, 'full_name', None) or 'Instructor',
            can_publish=True,
            can_subscribe=True,
        )

    # Broadcast via Socket.io — include livekit_token so instructor page
    # can connect immediately without a separate REST round-trip
    from app.extensions import socketio
    socketio.emit('session_started', {
        'session_id':    session_id,
        'jitsi_room':    session.jitsi_room_name,   # kept for backward compat
        'livekit_token': livekit_token,
    }, room=f"session_{session_id}_students")

    return jsonify({'session': session.to_dict(), 'livekit_token': livekit_token}), 200


@instructor_bp.route('/sessions/<session_id>/end', methods=['POST'])
@require_role('instructor', 'institution_admin')
def end_session(session_id):
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()
    session.status   = 'ended'
    session.ended_at = datetime.utcnow()
    session.current_mode = 'ended'   # D1 terminal mode

    # Finalize attendance statuses
    _finalize_attendance(session_id)

    # Finalize grades (D3) — best-attempt quiz grade + final blend
    try:
        _finalize_session_grades(session_id, session.experiment_id)
    except Exception:
        db.session.rollback()

    db.session.commit()

    # Broadcast session end to all students
    from app.extensions import socketio
    socketio.emit('session_ended', {
        'session_id': session_id,
        'message': 'Session has ended. Please submit if you have not already.'
    }, room=f"session_{session_id}_students")
    socketio.emit('session_mode_changed', {
        'mode': 'ended',
        'rules': {'code': 'read_only', 'quiz': 'locked', 'submit': False, 'proctor': 'off', 'label': 'Ended'},
    }, room=f"session_{session_id}_students")

    return jsonify({'status': 'ended'}), 200


def _finalize_session_grades(session_id, experiment_id):
    """Recompute grades for all students in a session (D3). Reuses the
    conductor finalize logic without requiring a route request context."""
    if not experiment_id:
        return
    from app.models.grading import Grade
    from app.models.experiment import ContentModule, ContentProgress
    from app.models.conductor import LivePageState

    exp = Experiment.query.get(experiment_id)
    if not exp:
        return

    rubric = {
        'test_cases':   exp.rubric_test_cases or 0,
        'lab_report':   exp.rubric_lab_report or 0,
        'code_quality': exp.rubric_code_quality or 0,
        'viva':         exp.rubric_viva or 0,
        'quiz':         exp.rubric_quiz or 0,
    }

    attempts = CodeAttempt.query.filter(
        CodeAttempt.session_id == session_id,
        CodeAttempt.experiment_id == experiment_id,
    ).all()
    student_ids = {a.student_id for a in attempts}
    att_rows = SessionAttendance.query.filter_by(session_id=session_id).all()
    student_ids |= {a.student_id for a in att_rows if a.status != 'absent'}

    quiz_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id, module_type='quiz').all()

    for sid in student_ids:
        finals = [a for a in attempts if a.student_id == sid and a.is_final_submission]
        best_auto = None
        if finals:
            best_auto = max(
                (a.test_cases_passed / a.test_cases_total * 100 if a.test_cases_total else 0)
                for a in finals
            )
        quality_scores = [a.quality_grade for a in finals if a.quality_grade]
        quality_score = None
        if quality_scores:
            grade_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}
            quality_score = max(grade_map.get(q, 0) for q in quality_scores)

        quiz_scores = []
        for qm in quiz_modules:
            cp = ContentProgress.query.filter_by(student_id=sid, module_id=qm.id).first()
            if cp and cp.score is not None:
                quiz_scores.append(cp.score)
        quiz_grade = round(sum(quiz_scores) / len(quiz_scores), 2) if quiz_scores else None

        grade = Grade.query.filter_by(
            student_id=sid, experiment_id=experiment_id, session_id=session_id).first()
        if not grade:
            grade = Grade(student_id=sid, experiment_id=experiment_id, session_id=session_id)
            db.session.add(grade)
        if best_auto is not None:
            grade.auto_grade = round(best_auto, 2)
        if quality_score is not None:
            grade.code_quality_grade = quality_score
        grade.quiz_grade = quiz_grade
        if not grade.graded_at:
            grade.graded_at = datetime.utcnow()
        grade.calculate_final(rubric)


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


# ── Phase-2: Subject grade-summary rollup ─────────────────────────────────────

@instructor_bp.route('/subjects/<subject_id>/grade-summary', methods=['GET'])
@require_role('instructor', 'institution_admin')
def subject_grade_summary(subject_id):
    """Return per-experiment weightage/scale and per-student rollup scores.

    Formula:  subject_score = Σ (experiment_score / grade_scale) × weightage
    experiment_score = the student's best final-submission score for any graded
    task in that experiment (from Grade.final_grade when present, else 0).

    Response:
      {
        "subject": {id, name, code, total_marks},
        "experiments": [{id, title, weightage, grade_scale, exp_number}, ...],
        "students": [
          {
            "student_id": ..., "full_name": ..., "roll_number": ...,
            "experiment_scores": {exp_id: score},   // raw score on that experiment
            "subject_score": float                   // rollup (may exceed total_marks for bonus)
          },
          ...
        ]
      }
    """
    from app.models.grading import Grade

    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id).first_or_404()

    exps = Experiment.query.filter_by(
        subject_id=subject_id, institution_id=g.institution_id
    ).order_by(Experiment.exp_number).all()

    exp_ids = [e.id for e in exps]

    # Fetch the best final grade per (student, experiment)
    from sqlalchemy import func as sqfunc
    grade_rows = (
        db.session.query(
            Grade.student_id,
            Grade.experiment_id,
            sqfunc.max(Grade.final_grade).label('best_grade')
        )
        .filter(Grade.experiment_id.in_(exp_ids))
        .group_by(Grade.student_id, Grade.experiment_id)
        .all()
    ) if exp_ids else []

    # student_id → {exp_id: best_grade}
    grade_map: dict = {}
    student_ids: set = set()
    for row in grade_rows:
        grade_map.setdefault(row.student_id, {})[row.experiment_id] = float(row.best_grade or 0)
        student_ids.add(row.student_id)

    users = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    students_out = []
    for sid, exp_scores in grade_map.items():
        rollup = sum(
            (exp_scores.get(e.id, 0) / (e.grade_scale or 100)) * (e.weightage or 0)
            for e in exps
        )
        u = users.get(sid)
        students_out.append({
            'student_id': sid,
            'full_name': u.full_name if u else sid,
            'roll_number': getattr(u, 'roll_number', None) if u else None,
            'experiment_scores': exp_scores,
            'subject_score': round(rollup, 2),
        })

    students_out.sort(key=lambda x: x['full_name'])

    return jsonify({
        'subject': {
            'id': subject.id,
            'name': subject.name,
            'code': subject.code,
            'total_marks': subject.total_marks,
        },
        'experiments': [
            {
                'id': e.id,
                'exp_number': e.exp_number,
                'title': e.title,
                'weightage': e.weightage,
                'grade_scale': e.grade_scale,
            }
            for e in exps
        ],
        'students': students_out,
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

    # ── Auto-populate auto_grade from the best code submission ────────────────
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


# ── Session Feedback (anonymous) ────────────────────────────────────────────────

@instructor_bp.route('/sessions/<session_id>/feedback', methods=['GET'])
@require_role('instructor', 'institution_admin')
def session_feedback(session_id):
    """Anonymous student feedback for a session + aggregate averages."""
    LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    rows = SessionFeedback.query.filter_by(
        session_id=session_id, institution_id=g.institution_id
    ).order_by(SessionFeedback.submitted_at.desc()).all()

    def avg(field):
        vals = [getattr(f, field) for f in rows if getattr(f, field) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    return jsonify({
        'session_id': session_id,
        'total': len(rows),
        'averages': {
            'experiment_clarity':  avg('experiment_clarity'),
            'session_pacing':      avg('session_pacing'),
            'ai_hint_helpfulness': avg('ai_hint_helpfulness'),
            'overall_rating':      avg('overall_rating'),
        },
        'feedback': [{
            'id':                  f.id,
            'experiment_clarity':  f.experiment_clarity,
            'session_pacing':      f.session_pacing,
            'ai_hint_helpfulness': f.ai_hint_helpfulness,
            'overall_rating':      f.overall_rating,
            'comment':             f.comment,
            'submitted_at':        f.submitted_at.isoformat() if f.submitted_at else None,
        } for f in rows],
    }), 200


# ── Viva Review ────────────────────────────────────────────────────────────────

@instructor_bp.route('/vivas', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_vivas():
    """All viva sessions for this instructor's experiments, with student names."""
    status = request.args.get('status')

    my_exp_ids = [e.id for e in Experiment.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()]
    if not my_exp_ids:
        return jsonify({'vivas': []}), 200

    query = VivaSession.query.filter(VivaSession.experiment_id.in_(my_exp_ids))
    if status:
        query = query.filter_by(status=status)
    vivas = query.order_by(VivaSession.created_at.desc()).limit(200).all()

    student_ids = {v.student_id for v in vivas}
    students = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(my_exp_ids)).all()}

    result = []
    for v in vivas:
        u = students.get(v.student_id)
        exp = exps.get(v.experiment_id)
        result.append({
            'id':            v.id,
            'student_id':    v.student_id,
            'full_name':     u.full_name if u else 'Unknown',
            'roll_number':   u.roll_number if u else '',
            'experiment_id': v.experiment_id,
            'experiment':    exp.title if exp else 'Unknown',
            'total_score':   v.total_score,
            'status':        v.status,
            'question_count': len(v.questions) if v.questions else 0,
            'started_at':    v.started_at.isoformat() if v.started_at else None,
            'completed_at':  v.completed_at.isoformat() if v.completed_at else None,
        })
    return jsonify({'vivas': result}), 200


@instructor_bp.route('/vivas/<viva_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def viva_detail(viva_id):
    """Viva session with questions + each student answer and AI feedback."""
    viva = VivaSession.query.get_or_404(viva_id)
    exp = Experiment.query.get(viva.experiment_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Not your experiment'}), 403

    student = User.query.get(viva.student_id)
    answers = sorted(viva.answers.all(), key=lambda a: a.question_index)

    return jsonify({
        'viva': {
            'id':           viva.id,
            'student_id':   viva.student_id,
            'full_name':    student.full_name if student else 'Unknown',
            'experiment':   exp.title,
            'questions':    viva.questions,
            'total_score':  viva.total_score,
            'status':       viva.status,
            'completed_at': viva.completed_at.isoformat() if viva.completed_at else None,
        },
        'answers': [{
            'question_index': a.question_index,
            'question_text':  a.question_text,
            'answer_text':    a.answer_text,
            'score':          a.score,
            'ai_feedback':    a.ai_feedback,
            'submitted_at':   a.submitted_at.isoformat() if a.submitted_at else None,
        } for a in answers],
    }), 200


# ── Catch-Up Overview ──────────────────────────────────────────────────────────

@instructor_bp.route('/catchups', methods=['GET'])
@require_role('instructor', 'institution_admin')
def catchup_overview():
    """Catch-up attempts + catch-up-enabled sessions for this instructor."""
    # Sessions taught by this instructor (via their section-subjects)
    ss_ids = [ss.id for ss in SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()]
    if not ss_ids:
        return jsonify({'enabled_sessions': [], 'attempts': []}), 200

    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids)
    ).all()

    exp_ids = {s.experiment_id for s in sessions}
    exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(exp_ids)).all()} if exp_ids else {}

    enabled_sessions = []
    for s in sessions:
        if not s.catchup_enabled:
            continue
        exp = exps.get(s.experiment_id)
        attempts = SessionAttendance.query.filter_by(session_id=s.id, is_catchup=True).count()
        expired = bool(s.catchup_deadline and datetime.utcnow() > s.catchup_deadline)
        enabled_sessions.append({
            'session_id':       s.id,
            'experiment':       exp.title if exp else 'Unknown',
            'scheduled_at':     s.scheduled_at.isoformat() if s.scheduled_at else None,
            'catchup_deadline': s.catchup_deadline.isoformat() if s.catchup_deadline else None,
            'expired':          expired,
            'attempts':         attempts,
        })

    # Individual attempts
    session_ids = [s.id for s in sessions]
    attempts_q = SessionAttendance.query.filter(
        SessionAttendance.session_id.in_(session_ids),
        SessionAttendance.is_catchup == True  # noqa: E712
    ).all()
    student_ids = {a.student_id for a in attempts_q}
    students = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    sess_by_id = {s.id: s for s in sessions}

    attempts = []
    for a in attempts_q:
        u = students.get(a.student_id)
        sess = sess_by_id.get(a.session_id)
        exp = exps.get(sess.experiment_id) if sess else None
        attempts.append({
            'student_id':    a.student_id,
            'full_name':     u.full_name if u else 'Unknown',
            'roll_number':   u.roll_number if u else '',
            'session_id':    a.session_id,
            'experiment':    exp.title if exp else 'Unknown',
            'status':        a.status,
            'started_at':    a.joined_at.isoformat() if a.joined_at else None,
        })

    return jsonify({'enabled_sessions': enabled_sessions, 'attempts': attempts}), 200
