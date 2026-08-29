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
from app.models.academic import SectionSubject, SectionStudent
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
# Session — attach experiment (PATCH)
# ══════════════════════════════════════════════════════════════════════════════

@features_bp.route('/sessions/<session_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def patch_session(session_id):
    """Attach/swap the experiment on a (possibly admin-created) session,
    or update scheduling fields — before going live."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}

    if sess.status == 'active':
        return jsonify({'error': 'Cannot modify a live session.'}), 400

    if 'experiment_id' in data:
        if data['experiment_id']:
            exp = Experiment.query.get(data['experiment_id'])
            if not exp:
                return jsonify({'error': 'Experiment not found.'}), 404
            if exp.instructor_id != g.user_id:
                return jsonify({'error': 'That experiment is not yours.'}), 403
        sess.experiment_id = data['experiment_id'] or None

    if 'scheduled_at' in data and data['scheduled_at']:
        sess.scheduled_at = datetime.fromisoformat(data['scheduled_at'])
    if 'duration_minutes' in data:
        sess.duration_minutes = int(data['duration_minutes'])
    if 'gate_score_threshold' in data:
        sess.gate_score_threshold = int(data['gate_score_threshold'])
    if 'focus_ml_enabled' in data:
        sess.focus_ml_enabled = bool(data['focus_ml_enabled'])
    if 'lockdown_enabled' in data:
        sess.lockdown_enabled = bool(data['lockdown_enabled'])
    if 'catchup_enabled' in data:
        sess.catchup_enabled = bool(data['catchup_enabled'])
    if 'catchup_deadline' in data:
        sess.catchup_deadline = (
            datetime.fromisoformat(data['catchup_deadline'])
            if data['catchup_deadline'] else None)

    db.session.commit()
    return jsonify({'session': sess.to_dict()}), 200


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
        for sid, rows in by_student.items():
            gr = _get_grade(sid)
            if gr.is_locked:
                continue
            best_auto = max(
                (a.test_cases_passed / a.test_cases_total * 100 if a.test_cases_total else 0)
                for a in rows)
            quality = max((grade_map.get(a.quality_grade, 0) for a in rows), default=None)
            gr.auto_grade = round(best_auto, 2)
            if quality is not None:
                gr.code_quality_grade = quality
            if not gr.graded_at:
                gr.graded_at = datetime.utcnow()
            gr.calculate_final(rubric)
            updated.append({'student_id': sid, 'final_grade': gr.final_grade})
        db.session.commit()
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

    grade_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}

    updated = []
    for gr in grade_rows:
        if gr.is_locked:
            continue
        rows = attempts_by_student.get(gr.student_id, [])
        if rows:
            best_auto = max(
                (a.test_cases_passed / a.test_cases_total * 100 if a.test_cases_total else 0)
                for a in rows)
            gr.auto_grade = round(best_auto, 2)
            quality = max((grade_map.get(a.quality_grade, 0) for a in rows), default=None)
            if quality is not None:
                gr.code_quality_grade = quality
        # quiz grade (best-attempt)
        quiz_scores = []
        for qm in quiz_modules:
            cp = ContentProgress.query.filter_by(
                student_id=gr.student_id, module_id=qm.id).first()
            if cp and cp.score is not None:
                quiz_scores.append(cp.score)
        if quiz_scores:
            gr.quiz_grade = round(sum(quiz_scores) / len(quiz_scores), 2)
        if not gr.graded_at:
            gr.graded_at = datetime.utcnow()
        gr.calculate_final(rubric)
        updated.append({'student_id': gr.student_id, 'final_grade': gr.final_grade})

    db.session.commit()
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
                'focus_ml': False, 'webcam_required': False,
            },
            'default_rubric': {'test_cases': 60, 'lab_report': 20,
                               'code_quality': 10, 'viva': 10, 'quiz': 0},
            'default_session_duration_min': 90,
            'default_late_join_window_min': 10,
            'default_gate_threshold': 70,
            'allow_ai_hints': True,
            'at_risk_avg_threshold': 40,
            'at_risk_min_threshold': 20,
            'notification_prefs': [],
        }}), 200
    return jsonify({'settings': s.to_dict()}), 200


@features_bp.route('/settings', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def patch_settings():
    s = InstructorSettings.query.get(g.user_id)
    if not s:
        s = InstructorSettings(instructor_id=g.user_id, institution_id=g.institution_id)
        db.session.add(s)

    data = request.get_json() or {}
    if 'default_proctor_policy' in data:
        allowed = {'lockdown_fullscreen', 'block_copy_paste', 'block_tab_switch',
                   'plagiarism_scan', 'focus_ml', 'webcam_required'}
        s.default_proctor_policy = {
            k: bool(v) for k, v in data['default_proctor_policy'].items() if k in allowed}
    if 'default_rubric' in data:
        allowed = {'test_cases', 'lab_report', 'code_quality', 'viva', 'quiz'}
        s.default_rubric = {
            k: int(v) for k, v in data['default_rubric'].items() if k in allowed}
    for field in ('default_session_duration_min', 'default_late_join_window_min',
                  'default_gate_threshold', 'at_risk_avg_threshold', 'at_risk_min_threshold'):
        if field in data:
            setattr(s, field, int(data[field]))
    if 'allow_ai_hints' in data:
        s.allow_ai_hints = bool(data['allow_ai_hints'])
    if 'notification_prefs' in data:
        s.notification_prefs = data['notification_prefs']

    db.session.commit()
    return jsonify({'settings': s.to_dict()}), 200


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
        students = SectionStudent.query.filter(
            SectionStudent.section_id.in_(section_ids)).all() if section_ids else []
        student_ids = [st.student_id for st in students]

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
        for sess in active:
            fs = FocusScore.query.filter_by(session_id=sess.id).all()
            low_focus_count += sum(1 for f in fs if f.focus_score is not None and f.focus_score < 40)
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
    open_flags = PlagiarismFlag.query.filter(
        PlagiarismFlag.status == 'pending',
        PlagiarismFlag.experiment_id.in_(my_exp_ids),
    ).all() if my_exp_ids else []
    if open_flags:
        max_sim = max(f.similarity_pct or 0 for f in open_flags)
        sev = 1 if max_sim < 70 else (2 if max_sim < 90 else 3)
        attention.append({
            'signal': 'plagiarism',
            'title': f'{len(open_flags)} plagiarism flag(s) pending',
            'detail': f'Highest similarity {max_sim:.0f}%',
            'severity': sev,
            'link': '/instructor/grading',
        })

    # ── ungraded: final submissions with no Grade, age > 48h escalates ─────
    graded_pairs = {
        (gr.student_id, gr.experiment_id)
        for gr in Grade.query.filter(Grade.experiment_id.in_(my_exp_ids)).all()
    } if my_exp_ids else set()
    finals = CodeAttempt.query.filter(
        CodeAttempt.experiment_id.in_(my_exp_ids),
        CodeAttempt.is_final_submission == True,
    ).all() if my_exp_ids else []
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
    upcoming = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'scheduled',
        LabSession.scheduled_at >= now,
    ).order_by(LabSession.scheduled_at.asc()).all() if my_ss_ids else []
    soon = [sess for sess in upcoming if (sess.scheduled_at - now) <= timedelta(minutes=30)]
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


@features_bp.route('/reports', methods=['POST'])
@require_role('instructor', 'institution_admin')
def request_report():
    data = request.get_json() or {}
    kind = data.get('kind')
    if kind not in REPORT_TYPES:
        return jsonify({'error': f'Unknown report kind "{kind}". Valid: {sorted(REPORT_TYPES)}'}), 400

    report = Report(
        institution_id=g.institution_id,
        created_by=g.user_id,
        kind=kind,
        params=data.get('params') or {},
        status='pending',
    )
    db.session.add(report)
    db.session.commit()

    # Truly async (R2): return 202 immediately, generate on a background thread.
    report_id = report.id
    import threading

    def _worker():
        # Fresh app context for the worker (separate thread, no request context)
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
                # The CSV builders read g.user_id / g.institution_id — provide
                # them from the stored report row in this thread's context.
                from flask import g as _g
                _g.user_id        = r.created_by
                _g.institution_id = r.institution_id
                csv_path, pdf_path = _generate_report(r)
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
        if pdf_path and os.path.exists(pdf_path):
            target = pdf_path
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

    ss_id = params.get('section_subject_id')
    session_id = params.get('session_id')
    experiment_id = params.get('experiment_id')

    if kind == 'gradebook':
        _csv_gradebook(csv_path, ss_id, session_id)
    elif kind == 'session_summary':
        _csv_session_summary(csv_path, session_id)
    elif kind == 'student_progress':
        _csv_student_progress(csv_path, ss_id)
    elif kind == 'experiment_performance':
        _csv_experiment_performance(csv_path, experiment_id or ss_id)
    elif kind == 'at_risk':
        _csv_at_risk(csv_path, ss_id)
    elif kind == 'cross_section':
        _csv_cross_section(csv_path, params.get('subject_id'))
    elif kind == 'viva_consolidated':
        _csv_viva_consolidated(csv_path, session_id)
    elif kind == 'catch_up':
        _csv_catch_up(csv_path, ss_id)
    else:
        raise ValueError(f'Unhandled report kind {kind}')

    # ── PDF path (R1): HTML-table PDF via pdf_service._render_pdf ───────────
    _render_csv_as_pdf(csv_path, pdf_path, kind, report)

    return csv_path, pdf_path


def _render_csv_as_pdf(csv_path, pdf_path, kind, report):
    """Build a styled HTML table from the CSV and render it to PDF via
    pdf_service._render_pdf (pdfkit → WeasyPrint → HTML fallback)."""
    import html as _html
    try:
        from app.services.pdf_service import _render_pdf
        with open(csv_path, 'r', encoding='utf-8', newline='') as f:
            rows = list(csv.reader(f))
        if not rows:
            return
        thead = ''.join(f'<th>{_html.escape(h)}</th>' for h in rows[0])
        tbody = ''
        for row in rows[1:]:
            cells = ''.join(f'<td>{_html.escape(c)}</td>' for c in row)
            tbody += f'<tr>{cells}</tr>'
        title = _html.escape(f"{kind} — {report.created_at.isoformat() if report.created_at else ''}")
        html_doc = (
            '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
            'body{font-family:Arial,sans-serif;margin:24px;color:#111}'
            'h1{font-size:18px;color:#7c3aed;margin-bottom:4px}'
            'p{font-size:11px;color:#666;margin-bottom:16px}'
            'table{border-collapse:collapse;width:100%;font-size:11px}'
            'th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}'
            'th{background:#f3f0ff;color:#5b21b6;font-weight:700}'
            'tr:nth-child(even){background:#faf9ff}'
            '</style></head><body>'
            f'<h1>NexLab Report — {title}</h1>'
            f'<p>Generated {datetime.utcnow().strftime("%d %B %Y, %H:%M UTC")}</p>'
            f'<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>'
            '</body></html>'
        )
        pdf_bytes = _render_pdf(html_doc)
        with open(pdf_path, 'wb') as f:
            f.write(pdf_bytes)
    except Exception:
        # PDF is best-effort — CSV is the canonical output.
        return


def _write_csv(file_path, header, rows):
    with open(file_path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(header)
        for row in rows:
            w.writerow(row)
    return file_path


def _csv_gradebook(file_path, ss_id, session_id):
    exp_ids = _my_exp_ids()
    experiments = Experiment.query.filter(
        Experiment.id.in_(exp_ids)).order_by(Experiment.exp_number).all() if exp_ids else []
    exps = {e.id: e for e in experiments}

    grades = Grade.query.filter(
        Grade.experiment_id.in_(exp_ids),
        Grade.session_id == session_id,
    ).all() if exp_ids and session_id else (Grade.query.filter(
        Grade.experiment_id.in_(exp_ids)).all() if exp_ids else [])

    by_student = {}
    for gr in grades:
        by_student.setdefault(gr.student_id, {})[gr.experiment_id] = gr

    users_map = {u.id: u for u in User.query.filter(
        User.id.in_(list(by_student.keys()))).all()}

    header = ['Roll', 'Name'] + [f'Exp {e.exp_number}' for e in experiments] + ['Avg']
    rows = []
    for sid, grs in by_student.items():
        u = users_map.get(sid)
        vals = [grs.get(e.id).final_grade if grs.get(e.id) else '' for e in experiments]
        avg = round(sum(v for v in vals if isinstance(v, (int, float))) / len([v for v in vals if isinstance(v, (int, float))]), 1) if any(isinstance(v, (int, float)) for v in vals) else ''
        rows.append([u.roll_number if u else '', u.full_name if u else ''] + vals + [avg])
    _write_csv(file_path, header, rows)


def _csv_session_summary(file_path, session_id):
    sess = LabSession.query.get(session_id)
    if not sess:
        _write_csv(file_path, ['error'], [['Session not found']])
        return
    att = SessionAttendance.query.filter_by(session_id=session_id).all()
    header = ['Student', 'Status', 'Joined At', 'Total Time (s)', 'Active']
    rows = []
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_([a.student_id for a in att])).all()}
    for a in att:
        u = users_map.get(a.student_id)
        rows.append([
            u.full_name if u else '',
            a.status,
            a.joined_at.isoformat() if a.joined_at else '',
            a.total_time_seconds,
            a.is_active_participant,
        ])
    _write_csv(file_path, header, rows)


def _csv_student_progress(file_path, ss_id):
    if not ss_id:
        _write_csv(file_path, ['error'], [['section_subject_id required']])
        return
    ss = SectionSubject.query.get(ss_id)
    if not ss:
        _write_csv(file_path, ['error'], [['Section not found']])
        return
    students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_([st.student_id for st in students])).all()}
    header = ['Roll', 'Name', 'Experiments Completed', 'Avg Grade', 'Mastery Avg']
    rows = []
    exp_ids = _my_exp_ids()
    for st in students:
        sid = st.student_id
        grades = Grade.query.filter(
            Grade.student_id == sid,
            Grade.experiment_id.in_(exp_ids),
        ).all() if exp_ids else []
        finals = [g.final_grade for g in grades if g.final_grade is not None]
        masteries = ConceptMastery.query.filter_by(student_id=sid).all()
        m_avg = round(sum(m.mastery_score for m in masteries) / len(masteries), 1) if masteries else ''
        u = users_map.get(sid)
        rows.append([
            u.roll_number if u else '', u.full_name if u else '',
            len([g for g in grades if g.final_grade is not None]),
            round(sum(finals) / len(finals), 1) if finals else '',
            m_avg,
        ])
    _write_csv(file_path, header, rows)


def _csv_experiment_performance(file_path, experiment_id_or_ss):
    exp_ids = _my_exp_ids()
    experiments = Experiment.query.filter(
        Experiment.id.in_(exp_ids)).order_by(Experiment.exp_number).all() if exp_ids else []
    header = ['Exp', 'Title', 'Avg Final', 'Attempts', 'Completion %']
    rows = []
    for e in experiments:
        grades = Grade.query.filter_by(experiment_id=e.id).all()
        finals = [g.final_grade for g in grades if g.final_grade is not None]
        attempts = CodeAttempt.query.filter_by(experiment_id=e.id).count()
        unique = len({a.student_id for a in CodeAttempt.query.filter_by(experiment_id=e.id).all()})
        rows.append([
            e.exp_number, e.title,
            round(sum(finals) / len(finals), 1) if finals else '',
            attempts,
            round(len([g for g in grades if g.final_grade is not None]) / unique * 100, 1) if unique else '',
        ])
    _write_csv(file_path, header, rows)


def _csv_at_risk(file_path, ss_id):
    s = InstructorSettings.query.get(g.user_id)
    avg_th = s.at_risk_avg_threshold if s else 40
    min_th = s.at_risk_min_threshold if s else 20
    my_ss_ids = _my_ss_ids()
    if ss_id and ss_id in my_ss_ids:
        my_ss_ids = [ss_id]
    section_ids = {ss.section_id for ss in SectionSubject.query.filter(
        SectionSubject.id.in_(my_ss_ids)).all()}
    students = SectionStudent.query.filter(
        SectionStudent.section_id.in_(section_ids)).all() if section_ids else []
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_([st.student_id for st in students])).all()}
    header = ['Roll', 'Name', 'Mastery Avg', 'Mastery Min', 'Reason']
    rows = []
    from collections import defaultdict
    by_student = defaultdict(list)
    masteries = ConceptMastery.query.filter(
        ConceptMastery.student_id.in_([st.student_id for st in students])).all()
    for m in masteries:
        by_student[m.student_id].append(m.mastery_score)
    for sid, scores in by_student.items():
        avg = sum(scores) / len(scores)
        mn = min(scores)
        if avg < avg_th or mn < min_th:
            u = users_map.get(sid)
            reason = f'avg {avg:.1f} < {avg_th}' if avg < avg_th else f'min {mn:.1f} < {min_th}'
            rows.append([u.roll_number if u else '', u.full_name if u else '',
                         round(avg, 1), round(mn, 1), reason])
    _write_csv(file_path, header, rows)


def _csv_cross_section(file_path, subject_id):
    if not subject_id:
        _write_csv(file_path, ['error'], [['subject_id required']])
        return
    ss_list = SectionSubject.query.filter_by(
        instructor_id=g.user_id, subject_id=subject_id).all()
    header = ['Section', 'Avg Final', 'Students']
    rows = []
    for ss in ss_list:
        exp_ids = [e.id for e in Experiment.query.filter_by(subject_id=subject_id).all()]
        grades = Grade.query.filter(Grade.experiment_id.in_(exp_ids)).all() if exp_ids else []
        finals = [g.final_grade for g in grades if g.final_grade is not None]
        rows.append([
            ss.section.name if ss.section else '',
            round(sum(finals) / len(finals), 1) if finals else '',
            len({g.student_id for g in grades}),
        ])
    _write_csv(file_path, header, rows)


def _csv_viva_consolidated(file_path, session_id):
    from app.models.grading import VivaSession
    vivas = VivaSession.query.all()
    if session_id:
        sess = LabSession.query.get(session_id)
        if sess and sess.experiment_id:
            vivas = VivaSession.query.filter_by(experiment_id=sess.experiment_id).all()
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_([v.student_id for v in vivas])).all()}
    header = ['Student', 'Viva Score', 'Status']
    rows = [[users_map.get(v.student_id).full_name if users_map.get(v.student_id) else '',
             v.total_score, v.status] for v in vivas]
    _write_csv(file_path, header, rows)


def _csv_catch_up(file_path, ss_id):
    my_ss_ids = _my_ss_ids()
    if ss_id and ss_id in my_ss_ids:
        my_ss_ids = [ss_id]
    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids)).all() if my_ss_ids else []
    session_ids = [s.id for s in sessions]
    att = SessionAttendance.query.filter(
        SessionAttendance.session_id.in_(session_ids),
        SessionAttendance.is_catchup == True,
    ).all() if session_ids else []
    users_map = {u.id: u for u in User.query.filter(
        User.id.in_([a.student_id for a in att])).all()}
    header = ['Student', 'Session', 'Catch-up']
    rows = []
    sess_map = {s.id: s for s in sessions}
    for a in att:
        u = users_map.get(a.student_id)
        sess = sess_map.get(a.session_id)
        rows.append([u.full_name if u else '', sess.title if sess else '', 'Yes'])
    _write_csv(file_path, header, rows)
