"""
Instructor Experience — additional feature endpoints (P1/P2).

Provides:
  - PATCH /sessions/<id>              — attach/swap experiment on admin-created session
  - GET/POST/PATCH/DELETE /experiments/<id>/checkpoints — SPARK checkpoint CRUD
  - PATCH /experiments/<id>/rubric    — rubric (incl. quiz) + type + proctor defaults
  - POST /grades/bulk                 — bulk grading (auto-grade-all + batch save)
  - GET/PATCH /settings               — instructor defaults (pre-fill new exp/sessions)
  - GET /dashboard/attention          — attention-needed aggregation (DB1-DB4)
  - GET/POST /reports                 — async report generation (R1-R6)

These are registered on the instructor blueprint prefix (/api/instructor).
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db, socketio
from app.models.experiment import Experiment, TestCase
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt
from app.models.grading import Grade
from app.models.knowledge import ConceptMastery, FocusScore
from app.models.academic import SectionSubject, SectionStudent, Section
from app.models.feedback import PlagiarismFlag
from app.models.proctor_event import ProctorEvent
from app.models.conductor import (
    Checkpoint, CheckpointProgress, InstructorSettings, Report,
)
from app.models.user import User
from app.models.subject import Subject
from datetime import datetime, timedelta
import uuid, os, csv, io

features_bp = Blueprint('instructor_features', __name__)


def _my_ss_ids():
    return [
        ss.id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]


def _my_exp_ids():
    return [
        e.id for e in Experiment.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]


def _require_my_session(session_id):
    sess = LabSession.query.get(session_id)
    if not sess:
        return None
    ss = SectionSubject.query.filter_by(
        id=sess.section_subject_id, instructor_id=g.user_id).first()
    if not ss:
        return None
    return sess




# ══════════════════════════════════════════════════════════════════════════════
# Checkpoint CRUD (SPARK)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/experiments/<exp_id>/checkpoints', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_checkpoints(exp_id):
    exp = Experiment.query.get(exp_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Experiment not found.'}), 404
    cps = Checkpoint.query.filter_by(experiment_id=exp_id).order_by(Checkpoint.order).all()
    return jsonify({'checkpoints': [cp.to_dict() for cp in cps]}), 200


@features_bp.route('/experiments/<exp_id>/checkpoints', methods=['POST'])
@require_role('instructor', 'institution_admin')
def create_checkpoint(exp_id):
    exp = Experiment.query.get(exp_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Experiment not found.'}), 404

    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Checkpoint title is required.'}), 400

    # Validate test_case_ids belong to this experiment
    tc_ids = data.get('test_case_ids') or []
    if tc_ids:
        tc_ids = list({str(t) for t in tc_ids})
        valid_ids = {tc.id for tc in TestCase.query.filter(
            TestCase.experiment_id == exp_id).all()}
        bad = [tid for tid in tc_ids if tid not in valid_ids]
        if bad:
            return jsonify({'error': f'Test case(s) not in this experiment: {bad}'}), 400

    max_order = db.session.query(db.func.max(Checkpoint.order)).filter_by(
        experiment_id=exp_id).scalar() or 0

    cp = Checkpoint(
        experiment_id=exp_id,
        order=data.get('order', max_order + 1),
        title=title,
        description=data.get('description'),
        test_case_ids=tc_ids,
        weight=data.get('weight', 10),
        is_gated=bool(data.get('is_gated', False)),
        page_id=data.get('page_id'),
    )
    db.session.add(cp)
    db.session.commit()
    return jsonify({'checkpoint': cp.to_dict()}), 201


@features_bp.route('/experiments/<exp_id>/checkpoints/<cp_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def patch_checkpoint(exp_id, cp_id):
    cp = Checkpoint.query.get(cp_id)
    if not cp or cp.experiment_id != exp_id:
        return jsonify({'error': 'Checkpoint not found.'}), 404
    if cp.experiment.instructor_id != g.user_id:
        return jsonify({'error': 'Not your experiment.'}), 403

    data = request.get_json() or {}
    if 'title' in data and data['title']:
        cp.title = data['title'].strip()
    if 'description' in data:
        cp.description = data['description']
    if 'order' in data:
        cp.order = int(data['order'])
    if 'weight' in data:
        cp.weight = int(data['weight'])
    if 'is_gated' in data:
        cp.is_gated = bool(data['is_gated'])
    if 'page_id' in data:
        cp.page_id = data['page_id']
    if 'test_case_ids' in data:
        tc_ids = [str(t) for t in data['test_case_ids']]
        valid_ids = {tc.id for tc in TestCase.query.filter(
            TestCase.experiment_id == exp_id).all()}
        bad = [tid for tid in tc_ids if tid not in valid_ids]
        if bad:
            return jsonify({'error': f'Test case(s) not in this experiment: {bad}'}), 400
        cp.test_case_ids = tc_ids
    db.session.commit()
    return jsonify({'checkpoint': cp.to_dict()}), 200


@features_bp.route('/experiments/<exp_id>/checkpoints/<cp_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_checkpoint(exp_id, cp_id):
    cp = Checkpoint.query.get(cp_id)
    if not cp or cp.experiment_id != exp_id:
        return jsonify({'error': 'Checkpoint not found.'}), 404
    if cp.experiment.instructor_id != g.user_id:
        return jsonify({'error': 'Not your experiment.'}), 403
    CheckpointProgress.query.filter_by(checkpoint_id=cp_id).delete()
    db.session.delete(cp)
    db.session.commit()
    return jsonify({'ok': True}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Checkpoint AI-suggest (D25 / D9) — draft rows only, nothing persists
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/experiments/<exp_id>/checkpoints/suggest', methods=['POST'])
@require_role('instructor', 'institution_admin')
def suggest_checkpoints(exp_id):
    """AI-drafts checkpoint rows for an experiment. Nothing persists — the
    instructor accepts per-row or all (D9). Returns draft checkpoint objects
    with title/description/suggested test_case_ids.
    """
    exp = Experiment.query.get(exp_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Experiment not found.'}), 404

    from app.ai.groq_client import groq_single
    import json, re

    # Gather context: problem statement + test cases (ids + descriptions)
    tcs = TestCase.query.filter_by(experiment_id=exp_id).all()
    tc_lines = '\n'.join(
        f"- id={tc.id} desc={tc.description or ('hidden' if tc.is_hidden else tc.input_data[:60])}"
        for tc in tcs
    ) or '(no test cases yet)'

    count = int((request.get_json() or {}).get('count', 3))

    prompt = f"""You are designing SPARK checkpoints for a programming lab.
Suggest {count} sequential checkpoints a student should pass, in order of difficulty.
Return ONLY a JSON array (no explanation):
[{{"title": "...", "description": "...", "test_case_ids": ["<a test case id>", ...]}}]

Rules:
- Each checkpoint must be verifiable by 1-2 test cases from the list below.
- Later checkpoints may be gated (is_gated true) — include is_gated when progression matters.
- title <= 6 words, description <= 20 words.

Problem: {exp.problem_statement}
Test cases available:
{tc_lines}"""

    content, model_used, is_fallback, _ = groq_single(
        prompt, pool='quality', max_tokens=900, temperature=0.4
    )
    if is_fallback or content is None:
        return jsonify({'error': 'AI generator temporarily unavailable (all Groq models rate-limited). Try again in a minute.'}), 503

    try:
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        drafts = json.loads(json_match.group()) if json_match else []
    except Exception:
        return jsonify({'error': 'Could not parse generated checkpoints.'}), 500

    # Validate test_case_ids belong to this experiment
    valid_ids = {tc.id for tc in tcs}
    cleaned = []
    for i, d in enumerate(drafts):
        ids = [x for x in (d.get('test_case_ids') or []) if x in valid_ids]
        cleaned.append({
            'order': i + 1,
            'title': d.get('title', f'Checkpoint {i+1}'),
            'description': d.get('description', ''),
            'test_case_ids': ids,
            'is_gated': bool(d.get('is_gated', False)),
        })
    return jsonify({'checkpoints': cleaned, 'count': len(cleaned), 'model': model_used}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Experiment rubric / type / proctor defaults (PATCH)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/experiments/<exp_id>/rubric', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def patch_experiment_extras(exp_id):
    exp = Experiment.query.get(exp_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Experiment not found.'}), 404

    data = request.get_json() or {}

    if 'rubric' in data:
        r = data['rubric']
        exp.rubric_test_cases   = int(r.get('test_cases', exp.rubric_test_cases))
        exp.rubric_lab_report   = int(r.get('lab_report', exp.rubric_lab_report))
        exp.rubric_code_quality = int(r.get('code_quality', exp.rubric_code_quality))
        exp.rubric_viva         = int(r.get('viva', exp.rubric_viva))
        exp.rubric_quiz         = int(r.get('quiz', exp.rubric_quiz or 0))

    if 'experiment_type' in data:
        t = data['experiment_type']
        if t not in ('coding', 'quiz_only', 'mixed', 'reading'):
            return jsonify({'error': 'Invalid experiment type.'}), 400
        exp.experiment_type = t

    if 'proctor_defaults' in data:
        allowed = {'lockdown_fullscreen', 'block_copy_paste', 'block_tab_switch',
                   'plagiarism_scan', 'focus_ml', 'webcam_required'}
        exp.proctor_defaults = {
            k: bool(v) for k, v in data['proctor_defaults'].items() if k in allowed
        }

    if 'ranking_visible' in data:
        exp.ranking_visible = bool(data['ranking_visible'])

    if 'weightage' in data:
        exp.weightage = int(data['weightage'])
    if 'grade_scale' in data:
        exp.grade_scale = int(data['grade_scale'])

    errors = exp.validate()
    if errors:
        db.session.rollback()
        return jsonify({'error': errors[0]}), 400

    # Weightage validation vs Subject.total_marks (warn)
    warnings = []
    if exp.subject_id:
        subj = Subject.query.get(exp.subject_id)
        if subj and subj.total_marks:
            total_w = db.session.query(db.func.coalesce(
                db.func.sum(Experiment.weightage), 0)).filter(
                Experiment.subject_id == exp.subject_id).scalar()
            if total_w != subj.total_marks:
                warnings.append(
                    f'Marks allocated for this subject: {total_w}/{subj.total_marks}. '
                    'Mismatch — adjust weightage or subject total.'
                )

    db.session.commit()
    return jsonify({'experiment': exp.to_dict(), 'warnings': warnings}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Bulk grading (D10)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/grades/bulk', methods=['POST'])
@require_role('instructor', 'institution_admin')
def bulk_grading():
    """Two modes:
      {mode:'auto', experiment_id, session_id?}          — auto-grade-all from CodeAttempt
      {mode:'batch', experiment_id, session_id?, grades:[{student_id, manual_grade?,
        viva_grade?, quality_grade?, hint_deduction?, feedback?}]} — save all in one txn
    """
    data = request.get_json() or {}
    mode = data.get('mode', 'batch')
    experiment_id = data.get('experiment_id')
    session_id = data.get('session_id')

    exp = Experiment.query.get(experiment_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Experiment not found.'}), 404

    rubric = {
        'test_cases':   exp.rubric_test_cases or 0,
        'lab_report':   exp.rubric_lab_report or 0,
        'code_quality': exp.rubric_code_quality or 0,
        'viva':         exp.rubric_viva or 0,
        'quiz':         exp.rubric_quiz or 0,
    }

    grade_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}

    def _get_grade(sid):
        gr = Grade.query.filter_by(
            student_id=sid, experiment_id=experiment_id, session_id=session_id).first()
        if not gr:
            gr = Grade(student_id=sid, experiment_id=experiment_id, session_id=session_id)
            db.session.add(gr)
        return gr

    if mode == 'auto':
        # Find all final submissions for the experiment/session
        q = CodeAttempt.query.filter(
            CodeAttempt.experiment_id == experiment_id,
            CodeAttempt.is_final_submission == True,
        )
        if session_id:
            q = q.filter(CodeAttempt.session_id == session_id)
        attempts = q.all()

        by_student = {}
        for a in attempts:
            by_student.setdefault(a.student_id, []).append(a)

        updated = []
        from app.services.grading_service import sync_student_experiment_grade
        for sid in by_student.keys():
            gr = _get_grade(sid)
            if gr.is_locked:
                continue
            synced_gr = sync_student_experiment_grade(sid, experiment_id, session_id=session_id)
            if synced_gr:
                updated.append({'student_id': sid, 'final_grade': synced_gr.final_grade})
        return jsonify({'updated': updated, 'count': len(updated)}), 200

    # batch manual
    grades_in = data.get('grades') or []
    updated = []
    for entry in grades_in:
        sid = entry.get('student_id')
        if not sid:
            continue
        gr = _get_grade(sid)
        if gr.is_locked:
            continue
        if 'auto_grade' in entry:
            gr.auto_grade = float(entry['auto_grade'])
        if 'manual_grade' in entry:
            gr.manual_grade = float(entry['manual_grade'])
        if 'viva_grade' in entry:
            gr.viva_grade = float(entry['viva_grade'])
        if 'quality_grade' in entry:
            gr.code_quality_grade = float(entry['quality_grade'])
        if 'hint_deduction' in entry:
            gr.hint_deduction = float(entry['hint_deduction'])
        if 'feedback' in entry:
            gr.manual_feedback = entry['feedback']
        if 'quiz_grade' in entry:
            gr.quiz_grade = float(entry['quiz_grade'])
        if not gr.graded_at:
            gr.graded_at = datetime.utcnow()
        gr.calculate_final(rubric)
        updated.append({'student_id': sid, 'final_grade': gr.final_grade})
    db.session.commit()
    return jsonify({'updated': updated, 'count': len(updated)}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Dedicated grade recompute (D23)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/grades/recompute', methods=['POST'])
@require_role('instructor', 'institution_admin')
def grades_recompute():
    """Standalone recompute endpoint (D23). Recomputes final grades for a
    session and/or a single student using the canonical blend.

    Body: {session_id?, student_id?, experiment_id?}
    - session_id: recompute all graded students in that session
    - student_id: narrow to one student
    - experiment_id: narrow to one experiment (default = session's experiment)
    Idempotent — best-attempt quiz grade + rubric blend, quiz_grade preserved.
    """
    data = request.get_json() or {}
    session_id   = data.get('session_id')
    student_id   = data.get('student_id')
    experiment_id = data.get('experiment_id')

    # Resolve experiment(s): explicit, else the session's
    sessions = []
    if session_id:
        sess = _require_my_session(session_id)
        if not sess:
            return jsonify({'error': 'Session not found or not assigned to you.'}), 404
        sessions = [sess]
        experiment_id = experiment_id or sess.experiment_id
    else:
        # No session — use every experiment of the instructor
        experiment_id = experiment_id or None

    if not experiment_id:
        return jsonify({'error': 'Provide a session_id or experiment_id.'}), 400

    exp = Experiment.query.get(experiment_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Experiment not found.'}), 404

    rubric = {
        'test_cases':   exp.rubric_test_cases or 0,
        'lab_report':   exp.rubric_lab_report or 0,
        'code_quality': exp.rubric_code_quality or 0,
        'viva':         exp.rubric_viva or 0,
        'quiz':         exp.rubric_quiz or 0,
    }

    from app.models.experiment import ContentModule, ContentProgress

    # Determine which (student, session) pairs to recompute
    grade_rows = Grade.query.filter(
        Grade.experiment_id == experiment_id)
    if session_id:
        grade_rows = grade_rows.filter(Grade.session_id == session_id)
    if student_id:
        grade_rows = grade_rows.filter(Grade.student_id == student_id)
    grade_rows = grade_rows.all()

    if not grade_rows:
        return jsonify({'error': 'No grades found for the given scope.'}), 404

    # Pull attempts + quiz progress for these students
    student_ids = [gr.student_id for gr in grade_rows]
    attempts = CodeAttempt.query.filter(
        CodeAttempt.experiment_id == experiment_id,
        CodeAttempt.is_final_submission == True,
    ).all() if not student_id else CodeAttempt.query.filter(
        CodeAttempt.experiment_id == experiment_id,
        CodeAttempt.student_id.in_(student_ids),
        CodeAttempt.is_final_submission == True,
    ).all()

    attempts_by_student = {}
    for a in attempts:
        attempts_by_student.setdefault(a.student_id, []).append(a)

    quiz_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id, module_type='quiz').all()
    quiz_module_ids = [qm.id for qm in quiz_modules]

    # Batch ContentProgress for all (student, quiz_module) pairs — ONE query
    # (was per-student × per-module N+1)
    progress_by_pair = {}
    if quiz_module_ids and student_ids:
        cp_rows = ContentProgress.query.filter(
            ContentProgress.module_id.in_(quiz_module_ids),
        ).with_entities(
            ContentProgress.student_id, ContentProgress.module_id, ContentProgress.score,
        ).all()
        progress_by_pair = {
            (p_sid, p_mid): p_score
            for p_sid, p_mid, p_score in cp_rows if p_score is not None
        }

    from app.services.grading_service import sync_student_experiment_grade
    updated = []
    for gr in grade_rows:
        if gr.is_locked:
            continue
        synced_gr = sync_student_experiment_grade(gr.student_id, experiment_id, session_id=gr.session_id)
        if synced_gr:
            updated.append({'student_id': gr.student_id, 'final_grade': synced_gr.final_grade})

    return jsonify({'updated': updated, 'count': len(updated)}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Instructor settings (Part I §3.10 / DB2)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/settings', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_settings():
    s = InstructorSettings.query.get(g.user_id)
    if not s:
        # return defaults
        return jsonify({'settings': {
            'default_proctor_policy': {
                'lockdown_fullscreen': True, 'block_copy_paste': True,
                'block_tab_switch': True, 'plagiarism_scan': True,
                'focus_ml': True, 'webcam_required': False,
                'screen_recording': True, 'browser_security': True,
            },
            'default_rubric': {'test_cases': 60, 'lab_report': 20,
                               'code_quality': 10, 'viva': 10, 'quiz': 0},
            'default_session_duration_min': 90,
            'default_late_join_window_min': 10,
            'default_gate_threshold': 70,
            'allow_ai_hints': True,
            'hint_strictness': 'Balanced',
            'passing_threshold': 40,
            'late_submission_penalty': 0,
            'max_retry_attempts': 3,
            'grace_marks': 0,
            'at_risk_avg_threshold': 40,
            'at_risk_min_threshold': 20,
            'min_attempts_analysis': 3,
            'consider_last_sessions': 5,
            'notification_delivery': {
                'notify_at_risk_new': True,
                'notify_at_risk_recovered': True,
                'notify_integrity_violations': True,
                'show_at_risk_in_roster': True,
                'include_suggested_actions': True,
                'persist_notifications': True,
            },
            'notification_prefs': [],
        }}), 200
    return jsonify({'settings': s.to_dict()}), 200


@features_bp.route('/settings', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def patch_settings():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'A JSON settings object is required.'}), 400

    s = InstructorSettings.query.get(g.user_id)
    if not s:
        s = InstructorSettings(instructor_id=g.user_id, institution_id=g.institution_id)
        db.session.add(s)

    if 'default_proctor_policy' in data:
        policy = data['default_proctor_policy']
        if not isinstance(policy, dict):
            return jsonify({'error': 'default_proctor_policy must be an object.'}), 400
        allowed = {'lockdown_fullscreen', 'block_copy_paste', 'block_tab_switch',
                   'plagiarism_scan', 'focus_ml', 'webcam_required', 'screen_recording', 'browser_security'}
        if any(k in allowed and type(v) is not bool for k, v in policy.items()):
            return jsonify({'error': 'Proctor policy values must be true or false.'}), 400
        current = dict(s.default_proctor_policy or {})
        current.update({k: v for k, v in policy.items() if k in allowed})
        s.default_proctor_policy = current

    if 'default_rubric' in data:
        rubric = data['default_rubric']
        if not isinstance(rubric, dict):
            return jsonify({'error': 'default_rubric must be an object.'}), 400
        allowed = {'test_cases', 'lab_report', 'code_quality', 'viva', 'quiz'}
        current = {'test_cases': 60, 'lab_report': 20, 'code_quality': 10, 'viva': 10, 'quiz': 0}
        current.update(s.default_rubric or {})
        for key, value in rubric.items():
            if key in allowed:
                if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100:
                    return jsonify({'error': f'default_rubric.{key} must be an integer from 0 to 100.'}), 400
                current[key] = value
        if sum(current.get(key, 0) for key in allowed) != 100:
            return jsonify({'error': 'Rubric weights must sum to exactly 100.'}), 400
        s.default_rubric = current

    ranges = {
        'default_session_duration_min': (5, 480),
        'default_late_join_window_min': (0, 120),
        'default_gate_threshold': (0, 100),
        'passing_threshold': (0, 100),
        'late_submission_penalty': (0, 100),
        'max_retry_attempts': (1, 50),
        'grace_marks': (0, 100),
        'at_risk_avg_threshold': (0, 100),
        'at_risk_min_threshold': (0, 100),
        'min_attempts_analysis': (1, 50),
        'consider_last_sessions': (1, 50),
    }
    for field, (minimum, maximum) in ranges.items():
        if field in data:
            value = data[field]
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                return jsonify({'error': f'{field} must be an integer from {minimum} to {maximum}.'}), 400
            setattr(s, field, value)

    if 'allow_ai_hints' in data:
        if type(data['allow_ai_hints']) is not bool:
            return jsonify({'error': 'allow_ai_hints must be true or false.'}), 400
        s.allow_ai_hints = data['allow_ai_hints']

    if 'hint_strictness' in data:
        strictness = data['hint_strictness']
        if strictness in ('Guided', 'Balanced', 'Strict'):
            s.hint_strictness = strictness

    if 'notification_delivery' in data:
        delivery = data['notification_delivery']
        if isinstance(delivery, dict):
            curr_deliv = dict(s.notification_delivery or {})
            curr_deliv.update({k: bool(v) for k, v in delivery.items()})
            s.notification_delivery = curr_deliv

    if 'notification_prefs' in data:
        prefs = data['notification_prefs']
        allowed_prefs = {'submission_ready', 'integrity_spike', 'student_at_risk', 'feedback_received'}
        if not isinstance(prefs, list) or any(not isinstance(item, str) or item not in allowed_prefs for item in prefs):
            return jsonify({'error': 'notification_prefs contains an unsupported preference.'}), 400
        s.notification_prefs = prefs

    db.session.commit()
    return jsonify({'settings': s.to_dict()}), 200

# ══════════════════════════════════════════════════════════════════════════════
# Quiz per-question analytics (needs ContentProgress.answers from quiz submits)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/quizzes/<module_id>/analytics', methods=['GET'])
@require_role('instructor', 'institution_admin')
def quiz_question_analytics(module_id):
    """
    Per-question performance for one quiz module: attempts, correct rate per
    question, most-missed ranking, and score distribution. Impossible before —
    ContentProgress.score was the only quiz signal; per-question answers are
    now stored on every submit.
    """
    from app.models.experiment import ContentProgress

    module = ContentModule.query.get(module_id)
    if not module:
        return jsonify({'error': 'Quiz module not found.'}), 404
    exp = Experiment.query.get(module.experiment_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'That quiz is not in one of your experiments.'}), 403

    questions = QuizQuestion.query.filter_by(module_id=module_id).order_by(
        QuizQuestion.id).all()
    progresses = ContentProgress.query.filter_by(module_id=module_id).all()

    attempts = len(progresses)
    scores = [p.score for p in progresses if p.score is not None]
    passed = [sc for sc in scores if sc >= (module.content_data or {}).get('pass_threshold', 70)]

    per_question = []
    for q in questions:
        attempts_q, correct_q = 0, 0
        for p in progresses:
            ans = (p.answers or {}).get(q.id)
            if not ans:
                continue
            attempts_q += 1
            if ans.get('correct'):
                correct_q += 1
        per_question.append({
            'question_id':    q.id,
            'question_text':  q.question_text,
            'options':        q.options or [],
            'correct_answer': q.correct_answer,
            'attempts':       attempts_q,
            'correct_count':  correct_q,
            'correct_pct':    round(correct_q / attempts_q * 100, 1) if attempts_q else None,
        })

    # Most-missed first (lowest correct rate among attempted questions)
    per_question.sort(key=lambda x: (x['correct_pct'] is None, x['correct_pct'] or 0))

    return jsonify({
        'module_id':     module_id,
        'title':         module.title,
        'attempts':      attempts,
        'avg_score':     round(sum(scores) / len(scores), 1) if scores else None,
        'pass_count':    len(passed),
        'pass_pct':      round(len(passed) / len(scores) * 100, 1) if scores else None,
        'questions':     per_question,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Dashboard — Attention Needed (DB1-DB4)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/dashboard/attention', methods=['GET'])
@require_role('instructor', 'institution_admin')
def dashboard_attention():
    """Aggregate 'Attention Needed' items per signal, severity 1-3, sorted desc.
    at_risk, low_focus, plagiarism, ungraded, starting_soon + quick actions."""
    my_ss_ids = _my_ss_ids()
    my_exp_ids = _my_exp_ids()
    now = datetime.utcnow()

    s = InstructorSettings.query.get(g.user_id)
    avg_threshold = s.at_risk_avg_threshold if s else 40
    min_threshold = s.at_risk_min_threshold if s else 20

    attention = []

    # ── at_risk: students with low ConceptMastery ──────────────────────────
    if my_ss_ids:
        section_ids = {ss.section_id for ss in SectionSubject.query.filter(
            SectionSubject.id.in_(my_ss_ids)).all()}
        student_ids = [
            r[0] for r in db.session.query(SectionStudent.student_id).filter(
                SectionStudent.section_id.in_(section_ids)).distinct().all()
        ] if section_ids else []

        at_risk_count = 0
        if student_ids:
            masteries = ConceptMastery.query.filter(
                ConceptMastery.student_id.in_(student_ids)).all()
            from collections import defaultdict
            by_student = defaultdict(list)
            for m in masteries:
                by_student[m.student_id].append(m.mastery_score)
            for sid, scores in by_student.items():
                avg = sum(scores) / len(scores)
                mn = min(scores)
                if avg < avg_threshold or mn < min_threshold:
                    at_risk_count += 1

        total = len(student_ids) or 1
        pct = at_risk_count / total * 100
        sev = 1 if pct < 10 else (2 if pct < 30 else 3)
        if at_risk_count:
            attention.append({
                'signal': 'at_risk',
                'title': f'{at_risk_count} student(s) at risk',
                'detail': f'{pct:.0f}% of enrolled — avg mastery < {avg_threshold} or critical concept < {min_threshold}',
                'severity': sev,
                'link': '/instructor/analytics',
            })

    # ── low_focus: only during an active session ───────────────────────────
    active = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'active',
    ).all() if my_ss_ids else []
    has_active_session = bool(active)
    low_focus_count = 0
    if active:
        # Batch all focus scores for active sessions in ONE query (was per-session loop)
        low_focus_count = db.session.query(
            db.func.count(FocusScore.id)
        ).filter(
            FocusScore.session_id.in_([sess.id for sess in active]),
            FocusScore.focus_score.isnot(None),
            FocusScore.focus_score < 40,
        ).scalar() or 0
    if low_focus_count:
        sev = 1 if low_focus_count < 3 else (2 if low_focus_count < 8 else 3)
        attention.append({
            'signal': 'low_focus',
            'title': f'{low_focus_count} low-focus signal(s) live',
            'detail': 'Focus below 40 in an active session — open Conductor.',
            'severity': sev,
            'link': f'/instructor/sessions/{active[0].id}/live' if active else '/instructor/sessions',
        })

    # ── plagiarism: open flags ─────────────────────────────────────────────
    # column-only + capped (perf pass: was full ORM rows, unbounded)
    open_flags = [
        row.similarity_pct for row in db.session.query(
            PlagiarismFlag.similarity_pct).filter(
            PlagiarismFlag.status == 'pending',
            PlagiarismFlag.experiment_id.in_(my_exp_ids),
        ).limit(200).all()
    ] if my_exp_ids else []
    if open_flags:
        max_sim = max(f or 0 for f in open_flags)
        sev = 1 if max_sim < 70 else (2 if max_sim < 90 else 3)
        attention.append({
            'signal': 'plagiarism',
            'title': f'{len(open_flags)} plagiarism flag(s) pending',
            'detail': f'Highest similarity {max_sim:.0f}%',
            'severity': sev,
            'link': '/instructor/grading',
        })

    # ── ungraded: final submissions with no Grade, age > 48h escalates ─────
    # Column-only loads + caps (perf pass: the old code materialized every
    # Grade and every final CodeAttempt — full ORM rows incl. code/text —
    # to compute two counts). The 48h age signal needs only submitted_at.
    graded_pairs = {
        (gr[0], gr[1]) for gr in db.session.query(
            Grade.student_id, Grade.experiment_id).filter(
            Grade.experiment_id.in_(my_exp_ids)).all()
    } if my_exp_ids else set()
    finals = db.session.query(
        CodeAttempt.student_id, CodeAttempt.experiment_id,
        CodeAttempt.submitted_at
    ).filter(
        CodeAttempt.experiment_id.in_(my_exp_ids),
        CodeAttempt.is_final_submission == True,
    ).order_by(CodeAttempt.submitted_at.desc()).limit(1000).all() \
        if my_exp_ids else []
    ungraded = [
        a for a in finals if (a.student_id, a.experiment_id) not in graded_pairs
    ]
    old_ungraded = [a for a in ungraded if a.submitted_at and (now - a.submitted_at) > timedelta(hours=48)]
    if ungraded:
        sev = 1 if len(ungraded) < 10 else (2 if len(ungraded) < 30 else 3)
        if old_ungraded:
            sev = min(3, sev + 1)
        attention.append({
            'signal': 'ungraded',
            'title': f'{len(ungraded)} submission(s) ungraded',
            'detail': f'{len(old_ungraded)} older than 48h',
            'severity': sev,
            'link': '/instructor/grading',
        })

    # ── starting_soon: sessions within 30 min ──────────────────────────────
    # The 30-minute window pushed into SQL (perf pass: was "every future
    # scheduled session, sorted in Python"). Column-only.
    soon = db.session.query(
        LabSession.id, LabSession.title, LabSession.scheduled_at
    ).filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'scheduled',
        LabSession.scheduled_at >= now,
        LabSession.scheduled_at <= now + timedelta(minutes=30),
    ).order_by(LabSession.scheduled_at.asc()).all() if my_ss_ids else []
    if soon:
        mins = int((soon[0].scheduled_at - now).total_seconds() / 60)
        sev = 1 if mins > 10 else (2 if mins > 3 else 3)
        attention.append({
            'signal': 'starting_soon',
            'title': f'"{soon[0].title or "Session"}" starts in {mins} min',
            'detail': 'Scheduled session beginning soon.',
            'severity': sev,
            'link': f'/instructor/sessions/{soon[0].id}/live',
        })

    attention.sort(key=lambda a: a['severity'], reverse=True)

    # ── Quick actions (DB4) ────────────────────────────────────────────────
    quick_actions = []
    if ungraded:
        quick_actions.append({'action': 'Grade next', 'link': '/instructor/grading'})
    if soon:
        quick_actions.append({'action': 'Start session', 'link': f'/instructor/sessions/{soon[0].id}/live'})
    if open_flags:
        quick_actions.append({'action': 'Review plagiarism', 'link': '/instructor/grading'})
    if any(a['signal'] == 'at_risk' for a in attention):
        quick_actions.append({'action': 'View at-risk', 'link': '/instructor/analytics'})
    quick_actions.insert(0, {'action': 'New experiment', 'link': '/instructor/experiments/new'})

    return jsonify({
        'attention': attention,
        'has_active_session': has_active_session,
        'quick_actions': quick_actions,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Reports (R1-R6) — async generation + download
# ══════════════════════════════════════════════════════════════════════════════

REPORT_TYPES = {
    'gradebook', 'session_summary', 'student_progress', 'experiment_performance',
    'at_risk', 'cross_section', 'viva_consolidated', 'catch_up',
}


@features_bp.route('/reports', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_reports():
    rows = Report.query.filter_by(
        created_by=g.user_id, institution_id=g.institution_id
    ).order_by(Report.created_at.desc()).limit(30).all()
    return jsonify({'reports': [r.to_dict() for r in rows]}), 200


def _report_section_subjects(params):
    """Resolve report scope only to section-subjects owned by this instructor."""
    allowed_ids = set(_my_ss_ids())
    requested = params.get('section_subject_ids')
    if not requested and params.get('section_subject_id'):
        requested = [params['section_subject_id']]
    if requested:
        ids = {str(x) for x in requested if str(x) in allowed_ids}
        if len(ids) != len({str(x) for x in requested}):
            raise ValueError('One or more selected classes are not assigned to you.')
    else:
        ids = allowed_ids
    if not ids:
        return []
    q = SectionSubject.query.filter(
        SectionSubject.id.in_(ids),
        SectionSubject.institution_id == g.institution_id,
        SectionSubject.instructor_id == g.user_id,
    )
    if params.get('section_id'):
        q = q.filter(SectionSubject.section_id == params['section_id'])
    if params.get('subject_id'):
        q = q.filter(SectionSubject.subject_id == params['subject_id'])
    rows = q.all()
    if (params.get('section_subject_ids') or params.get('section_subject_id') or params.get('section_id') or params.get('subject_id')) and not rows:
        raise ValueError('No assigned classes match the selected report filters.')
    return rows


def _report_student_ids(section_subjects):
    section_ids = {x.section_id for x in section_subjects if x.section_id}
    if not section_ids:
        return []
    return sorted({row[0] for row in db.session.query(SectionStudent.student_id)
                   .filter(SectionStudent.section_id.in_(section_ids)).all()})


def _report_experiments(params, section_subjects=None):
    section_subjects = section_subjects if section_subjects is not None else _report_section_subjects(params)
    subject_ids = {x.subject_id for x in section_subjects if x.subject_id}
    if not subject_ids:
        return []
    q = Experiment.query.filter(
        Experiment.institution_id == g.institution_id,
        Experiment.instructor_id == g.user_id,
        Experiment.subject_id.in_(subject_ids),
    )
    if params.get('experiment_id'):
        q = q.filter(Experiment.id == params['experiment_id'])
    return q.order_by(Experiment.exp_number).all()


@features_bp.route('/reports', methods=['POST'])
@require_role('instructor', 'institution_admin')
def request_report():
    data = request.get_json() or {}
    kind = data.get('kind')
    if kind not in REPORT_TYPES:
        return jsonify({'error': f'Unknown report kind "{kind}". Valid: {sorted(REPORT_TYPES)}'}), 400

    params = dict(data.get('params') or {})
    try:
        if kind in {'session_summary', 'viva_consolidated'}:
            session_id = params.get('session_id')
            session = _require_my_session(session_id) if session_id else None
            if not session:
                return jsonify({'error': 'Choose a session assigned to you.'}), 400
            if params.get('section_subject_ids') or params.get('section_subject_id') or params.get('section_id') or params.get('subject_id'):
                scoped = _report_section_subjects(params)
                if session.section_subject_id not in {ss.id for ss in scoped}:
                    return jsonify({'error': 'The selected session is outside the current report filters.'}), 400
                params['section_subject_ids'] = [ss.id for ss in scoped]
                params['section_subject_id'] = scoped[0].id if len(scoped) == 1 else None
        else:
            scoped = _report_section_subjects(params)
            if kind == 'cross_section' and not params.get('subject_id'):
                return jsonify({'error': 'Choose a subject for cross-section comparison.'}), 400
            if kind == 'student_progress' and params.get('student_id'):
                if params['student_id'] not in _report_student_ids(scoped):
                    return jsonify({'error': 'Selected student is not enrolled in the chosen report scope.'}), 400
            params['section_subject_ids'] = [ss.id for ss in scoped]
            params['section_subject_id'] = scoped[0].id if len(scoped) == 1 else None
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    report = Report(
        institution_id=g.institution_id,
        created_by=g.user_id,
        kind=kind,
        params=params,
        status='pending',
    )
    db.session.add(report)
    db.session.commit()

    report_id = report.id
    import threading

    def _worker():
        from app import create_app
        worker_app = create_app()
        with worker_app.app_context():
            from app.models.conductor import Report as _Report
            r = db.session.get(_Report, report_id)
            if not r:
                return
            try:
                r.status = 'generating'
                db.session.commit()
                from flask import g as _g
                _g.user_id = r.created_by
                _g.institution_id = r.institution_id
                csv_path, pdf_path = _generate_report(r)
                if not os.path.isfile(csv_path) or os.path.getsize(csv_path) == 0:
                    raise RuntimeError('Report CSV was not created.')
                if not pdf_path or not os.path.isfile(pdf_path) or os.path.getsize(pdf_path) == 0:
                    raise RuntimeError('Report PDF was not created; no downloadable report was marked ready.')
                r.status = 'ready'
                r.file_path = csv_path
                r.params = dict(r.params or {})
                r.params['pdf_path'] = pdf_path
                r.completed_at = datetime.utcnow()
                r.error = None
            except Exception as exc:
                r.status = 'failed'
                r.error = str(exc)[:500]
            finally:
                db.session.commit()

    threading.Thread(target=_worker, daemon=True).start()
    return jsonify({'report': report.to_dict()}), 202

@features_bp.route('/reports/<report_id>/download', methods=['GET'])
@require_role('instructor', 'institution_admin')
def download_report(report_id):
    report = Report.query.get(report_id)
    if not report or report.created_by != g.user_id:
        return jsonify({'error': 'Report not found.'}), 404
    if report.status != 'ready' or not report.file_path:
        return jsonify({'error': 'Report not ready.'}), 400

    fmt = request.args.get('format', 'csv').lower()
    target = report.file_path
    if fmt == 'pdf':
        pdf_path = (report.params or {}).get('pdf_path')
        if not pdf_path or not os.path.isfile(pdf_path):
            return jsonify({'error': 'PDF file is not available for this report.'}), 404
        target = pdf_path
    elif fmt == 'xlsx':
        # T3-13 — Excel export: convert the CSV via openpyxl when installed;
        # graceful 400 with instruction otherwise.
        try:
            import openpyxl
            import csv as _csv
            xlsx_path = target.rsplit('.', 1)[0] + '.xlsx'
            if not os.path.exists(xlsx_path):
                wb = openpyxl.Workbook()
                ws = wb.active
                ws.title = (report.kind or 'Report')[:31]
                with open(target, newline='', encoding='utf-8') as f:
                    for row in _csv.reader(f):
                        ws.append(row)
                wb.save(xlsx_path)
            from flask import send_file
            return send_file(xlsx_path, as_attachment=True,
                             download_name=f'{report.kind}_{report.id[:8]}.xlsx')
        except ImportError:
            return jsonify({'error': 'xlsx export requires openpyxl on the server; download CSV instead.'}), 400
    from flask import send_file
    return send_file(target, as_attachment=True, download_name=os.path.basename(target))


def _generate_report(report: Report):
    """Build the requested report CSV + PDF. Returns (csv_path, pdf_path)."""
    params = report.params or {}
    kind = report.kind
    out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'reports_out')
    os.makedirs(out_dir, exist_ok=True)
    csv_path = os.path.join(out_dir, f"{kind}_{report.id[:8]}.csv")
    pdf_path = os.path.join(out_dir, f"{kind}_{report.id[:8]}.pdf")

    session_id = params.get('session_id')

    if kind == 'gradebook':
        _csv_gradebook(csv_path, params)
    elif kind == 'session_summary':
        _csv_session_summary(csv_path, session_id)
    elif kind == 'student_progress':
        _csv_student_progress(csv_path, params, audience=params.get('audience', 'internal'))
    elif kind == 'experiment_performance':
        _csv_experiment_performance(csv_path, params)
    elif kind == 'at_risk':
        _csv_at_risk(csv_path, params)
    elif kind == 'cross_section':
        _csv_cross_section(csv_path, params)
    elif kind == 'viva_consolidated':
        _csv_viva_consolidated(csv_path, params)
    elif kind == 'catch_up':
        _csv_catch_up(csv_path, params)
    else:
        raise ValueError(f'Unhandled report kind {kind}')

    # ── PDF path (R1): HTML-table PDF via pdf_service._render_pdf ───────────
    _render_csv_as_pdf(csv_path, pdf_path, kind, report)

    return csv_path, pdf_path


def _render_csv_as_pdf(csv_path, pdf_path, kind, report):
    # Build a dependable, multi-page PDF directly from the generated CSV.
    import html as _html
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        rows = list(csv.reader(f))
    if not rows:
        raise RuntimeError('Report CSV is empty; cannot render PDF.')

    font_name, bold_font = 'Helvetica', 'Helvetica-Bold'
    regular_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    bold_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    if os.path.isfile(regular_path) and os.path.isfile(bold_path):
        if 'NexLabDejaVu' not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont('NexLabDejaVu', regular_path))
            pdfmetrics.registerFont(TTFont('NexLabDejaVu-Bold', bold_path))
        font_name, bold_font = 'NexLabDejaVu', 'NexLabDejaVu-Bold'

    cols = max(len(row) for row in rows)
    available_width = landscape(A4)[0] - 24 * mm
    col_width = available_width / max(1, cols)
    body_style = ParagraphStyle('ReportCell', fontName=font_name, fontSize=7,
                                 leading=8.5, alignment=TA_LEFT, wordWrap='CJK')
    header_style = ParagraphStyle('ReportHeader', parent=body_style, fontName=bold_font,
                                  textColor=colors.white, fontSize=7.2)
    table_data = []
    for row_index, row in enumerate(rows):
        padded = list(row) + [''] * (cols - len(row))
        style = header_style if row_index == 0 else body_style
        table_data.append([Paragraph(_html.escape(str(cell)).replace('\\n', '<br/>'), style)
                           for cell in padded])

    os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
    doc = SimpleDocTemplate(pdf_path, pagesize=landscape(A4),
                            rightMargin=12 * mm, leftMargin=12 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f'NexLab {kind} report')
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('ReportTitle', parent=styles['Title'],
                                 fontName=bold_font, fontSize=15, leading=18,
                                 textColor=colors.HexColor('#5b21b6'), alignment=TA_LEFT)
    title = Paragraph(f'NexLab Report — {_html.escape(kind.replace("_", " ").title())}', title_style)
    subtitle = Paragraph(
        f'Generated {datetime.utcnow().strftime("%d %B %Y, %H:%M UTC")} · '
        f'Report ID {_html.escape(report.id)}', body_style)
    table = LongTable(table_data, colWidths=[col_width] * cols,
                      repeatRows=1, splitByRow=1, hAlign='LEFT')
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#6d28d9')),
        ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    doc.build([title, Spacer(1, 3 * mm), subtitle, Spacer(1, 5 * mm), table])
    with open(pdf_path, 'rb') as f:
        if not f.read(5).startswith(b'%PDF'):
            raise RuntimeError('PDF renderer did not produce a valid PDF file.')


def _write_csv(file_path, header, rows):
    with open(file_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(header)
        for row in rows:
            w.writerow(row)
    return file_path


def _csv_gradebook(file_path, params):
    section_subjects = _report_section_subjects(params)
    experiments = _report_experiments(params, section_subjects)
    exp_ids = [e.id for e in experiments]
    student_ids = _report_student_ids(section_subjects)
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    grades = Grade.query.filter(
        Grade.experiment_id.in_(exp_ids), Grade.student_id.in_(student_ids),
        Grade.final_grade.isnot(None),
    ).all() if exp_ids and student_ids else []

    by_student_exp = {}
    for gr in grades:
        key = (gr.student_id, gr.experiment_id)
        score = float(gr.final_grade)
        if score > by_student_exp.get(key, float('-inf')):
            by_student_exp[key] = score

    section_names = {ss.section_id: (Section.query.get(ss.section_id).name if Section.query.get(ss.section_id) else '') for ss in section_subjects}
    student_section = {}
    for ss in section_subjects:
        for row in SectionStudent.query.filter_by(section_id=ss.section_id).all():
            student_section.setdefault(row.student_id, section_names.get(ss.section_id, ''))

    submitted = db.session.query(CodeAttempt.student_id, CodeAttempt.experiment_id).filter(
        CodeAttempt.student_id.in_(student_ids), CodeAttempt.experiment_id.in_(exp_ids),
        CodeAttempt.is_final_submission.is_(True),
    ).distinct().all() if student_ids and exp_ids else []
    submitted_keys = {(sid, eid) for sid, eid in submitted}
    allocated = sum(float(e.weightage or 0) for e in experiments if getattr(e, 'is_published', False))
    header = (['Section', 'Roll', 'Name']
              + [f'Exp {e.exp_number}: {e.title} ({e.weightage} pts)' for e in experiments]
              + ['Assessments Graded', 'Final Submissions', 'Average Grade (%)',
                 'Weighted Points Earned', 'Points with Grades', 'Course Marks Allocated',
                 'Percent of Graded Marks (%)'])
    rows = []
    for sid in student_ids:
        u = users_map.get(sid)
        vals = [by_student_exp.get((sid, e.id)) for e in experiments]
        measured = [v for v in vals if v is not None]
        avg = round(sum(measured) / len(measured), 1) if measured else ''
        points = sum((by_student_exp[(sid, e.id)] / (e.grade_scale or 100)) * (e.weightage or 0)
                     for e in experiments if getattr(e, 'is_published', False) and (sid, e.id) in by_student_exp)
        assessed_allocated = sum(float(e.weightage or 0) for e in experiments
                                 if getattr(e, 'is_published', False) and (sid, e.id) in by_student_exp)
        percentage = round(points / assessed_allocated * 100, 1) if assessed_allocated else ''
        rows.append([student_section.get(sid, ''), u.roll_number if u else '', u.full_name if u else '']
                    + [v if v is not None else '' for v in vals]
                    + [len(measured), sum(1 for e in experiments if (sid, e.id) in submitted_keys), avg,
                       round(points, 2) if measured else '', round(assessed_allocated, 2),
                       round(allocated, 2), percentage])
    _write_csv(file_path, header, rows)

def _csv_session_summary(file_path, session_id):
    sess = _require_my_session(session_id) if session_id else None
    if not sess:
        raise ValueError('Choose a session assigned to you.')
    att = SessionAttendance.query.filter_by(session_id=session_id).all()
    att_by = {a.student_id: a for a in att}
    ss = SectionSubject.query.get(sess.section_subject_id) if sess.section_subject_id else None
    sec = Section.query.get(ss.section_id) if ss else None
    subj = Subject.query.get(ss.subject_id) if ss else None
    exp = Experiment.query.get(sess.experiment_id) if sess.experiment_id else None
    enrolled = _report_student_ids([ss]) if ss else []
    student_ids = sorted(set(enrolled) | set(att_by))
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    rows = [
        ['SESSION SUMMARY'], ['Session', sess.title or '—'], ['Subject', subj.name if subj else '—'],
        ['Section', sec.name if sec else '—'], ['Experiment', exp.title if exp else '—'],
        ['Status', sess.status], ['Scheduled', sess.scheduled_at.isoformat() if sess.scheduled_at else '—'],
        ['Started', sess.started_at.isoformat() if sess.started_at else '—'], ['Ended', sess.ended_at.isoformat() if sess.ended_at else '—'],
        [], ['ATTENDANCE'], ['Student', 'Roll', 'Status', 'Joined At', 'Total Time (s)', 'Active'],
    ]
    for sid in student_ids:
        user, record = users_map.get(sid), att_by.get(sid)
        rows.append([user.full_name if user else '', user.roll_number if user else '',
                     record.status if record else 'not_recorded',
                     record.joined_at.isoformat() if record and record.joined_at else '',
                     record.total_time_seconds if record else '',
                     bool(record.is_active_participant) if record else ''])

    attempts = CodeAttempt.query.filter_by(session_id=session_id).all()
    attempts_by = {}
    for attempt in attempts:
        state = attempts_by.setdefault(attempt.student_id, {'attempts': 0, 'best': None})
        state['attempts'] += 1
        if attempt.is_final_submission and attempt.test_cases_total:
            pct = attempt.test_cases_passed / attempt.test_cases_total * 100
            state['best'] = max(state['best'] or 0, pct)
    rows += [[], ['PERFORMANCE'], ['Student', 'Roll', 'Attempts', 'Final Score (%)', 'Best Test Pass (%)']]
    for sid in student_ids:
        user, d = users_map.get(sid), attempts_by.get(sid, {})
        rows.append([user.full_name if user else '', user.roll_number if user else '', d.get('attempts', 0),
                     '', round(d['best'], 1) if d.get('best') is not None else ''])

    focus_rows = FocusScore.query.filter_by(session_id=session_id).all()
    focus_by = {}
    for f in focus_rows:
        if f.focus_score is not None:
            focus_by.setdefault(f.student_id, []).append(float(f.focus_score))
    all_focus = [v for vals in focus_by.values() for v in vals]
    rows += [[], ['FOCUS'], ['Student', 'Roll', 'Avg Focus', 'Low-focus Readings (<40)']]
    for sid in student_ids:
        user, vals = users_map.get(sid), focus_by.get(sid, [])
        rows.append([user.full_name if user else '', user.roll_number if user else '',
                     round(sum(vals) / len(vals), 1) if vals else '',
                     sum(1 for v in vals if v < 40) if vals else ''])
    rows.append(['CLASS AVERAGE', '', round(sum(all_focus) / len(all_focus), 1) if all_focus else ''])

    from app.analytics.integrity import compute_integrity_confidence
    rows += [[], ['INTEGRITY'], ['Student', 'Roll', 'Proctor Events', 'Plagiarism Flags', 'Integrity Confidence (%)']]
    for sid in student_ids:
        user = users_map.get(sid)
        integrity = compute_integrity_confidence(sid, session_id=session_id, institution_id=g.institution_id)
        event_count = sum(integrity.get('violation_counts', {}).values())
        flags = len(integrity.get('plagiarism_flags', []))
        confidence = integrity.get('integrity_confidence')
        rows.append([user.full_name if user else '', user.roll_number if user else '',
                     event_count if integrity.get('confidence_band') != 'no_data' else '',
                     flags if integrity.get('confidence_band') != 'no_data' else '',
                     confidence if confidence is not None else ''])
    with open(file_path, 'w', newline='', encoding='utf-8') as f:
        csv.writer(f).writerows(rows)
    return file_path

def _csv_student_progress(file_path, params, audience='internal'):
    section_subjects = _report_section_subjects(params)
    student_ids = _report_student_ids(section_subjects)
    if params.get('student_id'):
        if params['student_id'] not in student_ids:
            raise ValueError('Selected student is not enrolled in the chosen report scope.')
        student_ids = [params['student_id']]
    experiments = _report_experiments(params, section_subjects)
    exp_ids = [e.id for e in experiments]
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    grades = Grade.query.filter(
        Grade.student_id.in_(student_ids), Grade.experiment_id.in_(exp_ids), Grade.final_grade.isnot(None)
    ).all() if student_ids and exp_ids else []
    grades_by_student = {}
    grade_by_student_experiment = {}
    for grade in grades:
        grades_by_student.setdefault(grade.student_id, []).append(float(grade.final_grade))
        key = (grade.student_id, grade.experiment_id)
        if key not in grade_by_student_experiment or float(grade.final_grade) > float(grade_by_student_experiment[key].final_grade):
            grade_by_student_experiment[key] = grade
    submissions = db.session.query(CodeAttempt.student_id, db.func.count(db.func.distinct(CodeAttempt.experiment_id))).filter(
        CodeAttempt.student_id.in_(student_ids), CodeAttempt.experiment_id.in_(exp_ids),
        CodeAttempt.is_final_submission.is_(True),
    ).group_by(CodeAttempt.student_id).all() if student_ids and exp_ids else []
    submissions_by_student = dict(submissions)
    final_attempts = CodeAttempt.query.filter(
        CodeAttempt.student_id.in_(student_ids), CodeAttempt.experiment_id.in_(exp_ids),
        CodeAttempt.is_final_submission.is_(True),
    ).order_by(CodeAttempt.submitted_at.desc()).all() if student_ids and exp_ids else []
    submitted_at_by_student_experiment = {}
    for attempt in final_attempts:
        submitted_at_by_student_experiment.setdefault((attempt.student_id, attempt.experiment_id), attempt.submitted_at)

    internal = audience != 'student'
    header = ['Roll', 'Name', 'Final Submissions', 'Assigned Experiments', 'Avg Grade (%)', 'Mastery Avg (%)', 'Next Concept']
    for exp in experiments:
        header.extend([f'Exp {exp.exp_number} {exp.title} Grade',
                       f'Exp {exp.exp_number} Student Submitted At',
                       f'Exp {exp.exp_number} Instructor Graded At'])
    if internal:
        header += ['Integrity Confidence (%)', 'Open Plagiarism Flags', 'Recommendation']
    rows = []
    from app.analytics.integrity import compute_integrity_confidence
    for sid in student_ids:
        user = users_map.get(sid)
        student_grades = grades_by_student.get(sid, [])
        mastery_rows = ConceptMastery.query.filter_by(student_id=sid, institution_id=g.institution_id).all()
        mastery_vals = [float(m.mastery_score) for m in mastery_rows if m.mastery_score is not None]
        mastery_avg = round(sum(mastery_vals) / len(mastery_vals), 1) if mastery_vals else ''
        weakest = min(mastery_rows, key=lambda m: m.mastery_score) if mastery_rows else None
        next_concept = f'Review {weakest.concept}' if weakest else ''
        row = [
            user.roll_number if user else '', user.full_name if user else '',
            int(submissions_by_student.get(sid, 0)), len(exp_ids),
            round(sum(student_grades) / len(student_grades), 1) if student_grades else '',
            mastery_avg, next_concept,
        ]
        for exp in experiments:
            grade = grade_by_student_experiment.get((sid, exp.id))
            row.extend([
                grade.final_grade if grade else '',
                submitted_at_by_student_experiment.get((sid, exp.id)).isoformat()
                if submitted_at_by_student_experiment.get((sid, exp.id)) else '',
                grade.graded_at.isoformat() if grade and grade.graded_at else '',
            ])
        if internal:
            integrity = compute_integrity_confidence(sid, institution_id=g.institution_id)
            confidence = integrity.get('integrity_confidence')
            open_flags = sum(1 for flag in integrity.get('plagiarism_flags', []) if flag.get('status') == 'pending')
            if student_grades and mastery_avg != '' and mastery_avg < 40:
                rec = 'Schedule a 1:1 — measured mastery is below the pass line'
            elif open_flags:
                rec = 'Review pending plagiarism flag before finalizing grades'
            elif not submissions_by_student.get(sid):
                rec = 'No final submission is recorded yet — verify participation'
            else:
                rec = 'On track — continue monitoring measured progress'
            row += [confidence if confidence is not None else '', open_flags if integrity.get('confidence_band') != 'no_data' else '', rec]
        rows.append(row)
    _write_csv(file_path, header, rows)

def _csv_experiment_performance(file_path, params):
    section_subjects = _report_section_subjects(params)
    experiments = _report_experiments(params, section_subjects)
    student_ids = _report_student_ids(section_subjects)
    header = ['Experiment', 'Title', 'Avg Final Grade (%)', 'Final Graded Students', 'Attempts', 'Final Submissions', 'Enrolled Students', 'Completion (%)']
    rows = []
    for exp in experiments:
        grades = Grade.query.filter_by(experiment_id=exp.id).filter(
            Grade.student_id.in_(student_ids), Grade.final_grade.isnot(None)
        ).all() if student_ids else []
        attempts = CodeAttempt.query.filter(
            CodeAttempt.experiment_id == exp.id, CodeAttempt.student_id.in_(student_ids)
        ).count() if student_ids else 0
        finals = {x[0] for x in db.session.query(CodeAttempt.student_id).filter(
            CodeAttempt.experiment_id == exp.id,
            CodeAttempt.student_id.in_(student_ids),
            CodeAttempt.is_final_submission.is_(True),
        ).distinct().all()} if student_ids else set()
        avg = round(sum(float(g.final_grade) for g in grades) / len(grades), 1) if grades else ''
        completion = round(len(finals) / len(student_ids) * 100, 1) if student_ids else ''
        rows.append([exp.exp_number, exp.title, avg, len(grades), attempts, len(finals), len(student_ids), completion])
    _write_csv(file_path, header, rows)

def _csv_at_risk(file_path, params):
    section_subjects = _report_section_subjects(params)
    student_ids = _report_student_ids(section_subjects)
    experiments = _report_experiments(params, section_subjects)
    exp_ids = [e.id for e in experiments]
    settings = InstructorSettings.query.get(g.user_id)
    threshold = settings.at_risk_avg_threshold if settings and settings.at_risk_avg_threshold is not None else 40
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    grades = Grade.query.filter(
        Grade.student_id.in_(student_ids), Grade.experiment_id.in_(exp_ids), Grade.final_grade.isnot(None)
    ).all() if student_ids and exp_ids else []
    by_student = {}
    for grade in grades:
        by_student.setdefault(grade.student_id, []).append(float(grade.final_grade))
    rows = []
    for sid, vals in by_student.items():
        avg = sum(vals) / len(vals)
        if avg < threshold:
            user = users_map.get(sid)
            rows.append([user.roll_number if user else '', user.full_name if user else '', round(avg, 1), len(vals), threshold, 'Average grade below configured threshold'])
    _write_csv(file_path, ['Roll', 'Name', 'Avg Grade (%)', 'Graded Assessments', 'At-Risk Threshold (%)', 'Reason'], rows)

def _csv_cross_section(file_path, params):
    from app.models.academic import Section
    if not params.get('subject_id'):
        raise ValueError('subject_id required for cross-section comparison')
    ss_list = _report_section_subjects(params)
    exp_ids = [e.id for e in _report_experiments(params, ss_list)]
    rows = []
    for ss in ss_list:
        section_students = _report_student_ids([ss])
        grades = Grade.query.filter(
            Grade.experiment_id.in_(exp_ids), Grade.student_id.in_(section_students),
            Grade.final_grade.isnot(None),
        ).all() if exp_ids and section_students else []
        finals = [float(g.final_grade) for g in grades]
        rows.append([
            (Section.query.get(ss.section_id).name if Section.query.get(ss.section_id) else ''),
            len(section_students), len({g.student_id for g in grades}),
            round(sum(finals) / len(finals), 1) if finals else '',
        ])
    _write_csv(file_path, ['Section', 'Enrolled Students', 'Students with Grades', 'Avg Final Grade (%)'], rows)

def _csv_viva_consolidated(file_path, params):
    from app.models.grading import VivaSession
    section_subjects = _report_section_subjects(params)
    student_ids = _report_student_ids(section_subjects)
    exp_ids = [e.id for e in _report_experiments(params, section_subjects)]
    q = VivaSession.query.filter(
        VivaSession.student_id.in_(student_ids), VivaSession.experiment_id.in_(exp_ids)
    ) if student_ids and exp_ids else VivaSession.query.filter(db.false())
    if params.get('session_id'):
        sess = _require_my_session(params['session_id'])
        if not sess:
            raise ValueError('Session is not assigned to you.')
        if sess.experiment_id:
            q = q.filter(VivaSession.experiment_id == sess.experiment_id)
    vivas = q.order_by(VivaSession.created_at.desc()).all()
    users_map = {u.id: u for u in User.query.filter(User.id.in_({v.student_id for v in vivas})).all()} if vivas else {}
    rows = [[users_map.get(v.student_id).full_name if users_map.get(v.student_id) else '', v.experiment_id,
             v.total_score if v.total_score is not None else '', v.status,
             v.started_at.isoformat() if v.started_at else '', v.completed_at.isoformat() if v.completed_at else '']
            for v in vivas]
    _write_csv(file_path, ['Student', 'Experiment ID', 'Viva Score', 'Status', 'Started At', 'Completed At'], rows)

def _csv_catch_up(file_path, params):
    section_subjects = _report_section_subjects(params)
    ss_ids = [ss.id for ss in section_subjects]
    sessions = LabSession.query.filter(LabSession.section_subject_id.in_(ss_ids)).all() if ss_ids else []
    session_ids = [s.id for s in sessions]
    att = SessionAttendance.query.filter(
        SessionAttendance.session_id.in_(session_ids), SessionAttendance.is_catchup.is_(True)
    ).all() if session_ids else []
    users_map = {u.id: u for u in User.query.filter(User.id.in_({a.student_id for a in att})).all()} if att else {}
    sess_map = {s.id: s for s in sessions}
    rows = [[users_map.get(a.student_id).full_name if users_map.get(a.student_id) else '',
             sess_map.get(a.session_id).title if sess_map.get(a.session_id) else '',
             a.status, a.joined_at.isoformat() if a.joined_at else ''] for a in att]
    _write_csv(file_path, ['Student', 'Session', 'Attendance Status', 'Joined At'], rows)

def instructor_search():
    """
    Cross-entity search for the instructor shell.
    ?q=<text> — matches students in my sections (name/email/roll), my
    experiments (title), and my sessions (title). ?types= narrows
    (students,experiments,sessions). Returns ≤8 results per type.
    """
    q = (request.args.get('q') or '').strip()
    types = (request.args.get('types') or 'students,experiments,sessions').split(',')
    if len(q) < 2:
        return jsonify({'results': []}), 200

    like = f'%{q}%'
    results = []

    my_ss = SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id).all()
    ss_ids = [s.id for s in my_ss]

    if 'students' in types and ss_ids:
        enrollments = SectionStudent.query.filter(
            SectionStudent.section_id.in_(ss_ids)).all()
        student_ids = list({e.student_id for e in enrollments})
        if student_ids:
            from sqlalchemy import or_ as _or
            for u in (User.query.filter(
                    User.id.in_(student_ids),
                    _or(User.full_name.ilike(like),
                        User.email.ilike(like),
                        User.roll_number.ilike(like)),
            ).limit(8).all()):
                results.append({
                    'type': 'student', 'id': u.id,
                    'label': u.full_name,
                    'sub_label': u.roll_number or u.email,
                    'link': '/instructor/students',
                })

    if 'experiments' in types:
        for e in (Experiment.query.filter(
                Experiment.institution_id == g.institution_id,
                Experiment.instructor_id == g.user_id,
                Experiment.title.ilike(like),
        ).limit(8).all()):
            results.append({
                'type': 'experiment', 'id': e.id,
                'label': e.title,
                'sub_label': f'Experiment #{e.exp_number} · {e.difficulty_level or ""}',
                'link': f'/instructor/experiments/{e.id}/edit',
            })

    if 'sessions' in types and ss_ids:
        for s in (LabSession.query.filter(
                LabSession.section_subject_id.in_(ss_ids),
                LabSession.title.ilike(like),
        ).order_by(LabSession.scheduled_at.desc()).limit(8).all()):
            results.append({
                'type': 'session', 'id': s.id,
                'label': s.title or 'Lab session',
                'sub_label': f'{s.status} · {s.scheduled_at.strftime("%d %b") if s.scheduled_at else ""}',
                'link': '/instructor/sessions',
            })

    return jsonify({'results': results}), 200
