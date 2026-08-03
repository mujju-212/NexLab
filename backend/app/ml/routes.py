"""
ML Blueprint — routes for all ML inference endpoints.

Endpoints:
  POST /api/ml/focus-score          — behavioral signals → score + alerts
  POST /api/ml/update-mastery       — update concept mastery after submission
  GET  /api/ml/mastery-map/<id>     — get mastery map for a student
  GET  /api/ml/weak-concepts        — get student's weak concepts
  POST /api/ml/compute-rank         — recompute holistic rank
  POST /api/ml/plagiarism-check     — pairwise plagiarism check for a session
  POST /api/ml/code-quality         — analyze code quality metrics
  POST /api/ml/compare-code         — compare exactly 2 code snippets
  GET  /api/ml/session-focus/<id>   — get all focus scores for a session
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_auth, require_role
from app.extensions import db
from app.models.knowledge import FocusScore
from app.ml.focus_model import predict_focus_score, get_alerts
from app.ml.knowledge_tracing import update_concept_mastery, get_mastery_map, get_weak_concepts
from app.ml.ranking import compute_holistic_rank
from app.ml.plagiarism import check_session_plagiarism, check_two_codes
from app.ml.code_quality import analyze_code_quality, quality_to_score
from datetime import datetime
import statistics

ml_bp = Blueprint('ml', __name__)


# ── 1. Focus Scoring ──────────────────────────────────────────────────────────

@ml_bp.route('/focus-score', methods=['POST'])
@require_auth
def focus_score():
    """
    Receive 6 behavioral signals from student browser every 30s.
    Returns focus score (0-100) and alert codes.
    Also relays to instructor room via SocketIO.

    Body: {
        session_id,
        signals: {
            tab_switches_per_min, idle_seconds, typing_speed_wpm,
            backspace_ratio, copy_paste_count, window_focus_ratio
        }
    }
    """
    data       = request.get_json()
    signals    = data.get('signals', {})
    session_id = data.get('session_id')

    if not signals or not session_id:
        return jsonify({'error': 'signals and session_id required'}), 400

    score  = predict_focus_score(signals)
    alerts = get_alerts(signals, score)

    # Persist to DB
    record = FocusScore(
        student_id=g.user_id,
        session_id=session_id,
        focus_score=score,
        signals=signals,
        recorded_at=datetime.utcnow()
    )
    db.session.add(record)
    db.session.commit()

    # Relay to instructor via Socket.io
    from app.extensions import socketio
    socketio.emit('student_focus_update', {
        'student_id':  g.user_id,
        'focus_score': score,
        'alerts':      alerts,
        'signals':     signals,
        'timestamp':   datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")

    return jsonify({'focus_score': score, 'alerts': alerts}), 200


@ml_bp.route('/session-focus/<session_id>', methods=['GET'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def session_focus(session_id):
    """
    Get all focus score records for a session.
    Instructor uses this to build timeline charts.
    """
    student_id = request.args.get('student_id')
    query = FocusScore.query.filter_by(session_id=session_id)
    if student_id:
        query = query.filter_by(student_id=student_id)
    records = query.order_by(FocusScore.recorded_at).all()

    return jsonify({'focus_records': [
        {
            'student_id':  r.student_id,
            'focus_score': r.focus_score,
            'signals':     r.signals,
            'recorded_at': r.recorded_at.isoformat() if r.recorded_at else None,
        } for r in records
    ]}), 200


# ── 2. Knowledge Tracing ──────────────────────────────────────────────────────

@ml_bp.route('/update-mastery', methods=['POST'])
@require_auth
def update_mastery():
    """
    Update concept mastery after a student submits an experiment.
    Called internally by submission endpoint after grading.

    Body: {
        concept_tags: ['loops', 'recursion', ...],
        result: {
            passed: bool,
            score_pct: 0.0-1.0,
            attempt_count: int,
            hints_used: int,
            difficulty: 1-4
        }
    }
    """
    data = request.get_json()
    result = update_concept_mastery(
        student_id=g.user_id,
        institution_id=g.institution_id,
        concept_tags=data.get('concept_tags', []),
        result=data.get('result', {})
    )
    return jsonify({'updated_concepts': result}), 200


@ml_bp.route('/mastery-map/<student_id>', methods=['GET'])
@require_auth
def mastery_map(student_id):
    """
    Get concept mastery map for a student.
    Students can only view their own. Instructors can view any.
    """
    if g.role == 'student' and g.user_id != student_id:
        return jsonify({'error': 'Forbidden'}), 403
    mastery = get_mastery_map(student_id)
    weak    = get_weak_concepts(student_id)
    return jsonify({'mastery_map': mastery, 'weak_concepts': weak}), 200


@ml_bp.route('/weak-concepts', methods=['GET'])
@require_auth
def my_weak_concepts():
    """Get current student's weak concepts (< 50% mastery)"""
    threshold = float(request.args.get('threshold', 50.0))
    weak = get_weak_concepts(g.user_id, threshold)
    return jsonify({'weak_concepts': weak}), 200


# ── 3. Holistic Ranking ───────────────────────────────────────────────────────

@ml_bp.route('/compute-rank', methods=['POST'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def compute_rank():
    """
    Compute (or recompute) holistic rank for a student in a section-subject.
    Called by background job after each session ends.
    Can also be triggered manually by instructor.
    """
    data = request.get_json()
    score = compute_holistic_rank(
        student_id=data.get('student_id'),
        section_subject_id=data.get('section_subject_id'),
        institution_id=g.institution_id
    )
    return jsonify({'rank_score': score}), 200


@ml_bp.route('/compute-rank/batch', methods=['POST'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def compute_rank_batch():
    """
    Recompute holistic rank for ALL students in a section-subject.
    Called by background job after session ends.
    """
    from app.models.academic import SectionStudent, SectionSubject
    data              = request.get_json()
    section_subject_id = data.get('section_subject_id')

    ss = SectionSubject.query.get_or_404(section_subject_id)
    enrollments = SectionStudent.query.filter_by(section_id=ss.section_id).all()

    results = {}
    for enrollment in enrollments:
        try:
            score = compute_holistic_rank(
                student_id=enrollment.student_id,
                section_subject_id=section_subject_id,
                institution_id=g.institution_id
            )
            results[enrollment.student_id] = score
        except Exception as e:
            results[enrollment.student_id] = f'error: {e}'

    return jsonify({'results': results, 'count': len(results)}), 200


# ── 4. Plagiarism Detection ───────────────────────────────────────────────────

@ml_bp.route('/plagiarism-check', methods=['POST'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def plagiarism_check():
    """
    Run two-stage plagiarism check (difflib + TF-IDF cosine)
    on all final submissions for a session+experiment.
    Flags pairs above 80% similarity.
    """
    data = request.get_json()
    flags = check_session_plagiarism(
        session_id=data.get('session_id'),
        experiment_id=data.get('experiment_id'),
        institution_id=g.institution_id
    )
    return jsonify({'flagged_pairs': flags, 'count': len(flags)}), 200


@ml_bp.route('/compare-code', methods=['POST'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def compare_code():
    """
    Compare exactly two code strings on demand.
    Returns difflib + TF-IDF similarity and a verdict.
    """
    data   = request.get_json()
    code_a = data.get('code_a', '')
    code_b = data.get('code_b', '')
    if not code_a or not code_b:
        return jsonify({'error': 'code_a and code_b required'}), 400
    result = check_two_codes(code_a, code_b)
    return jsonify(result), 200


# ── 5. Code Quality Analysis ──────────────────────────────────────────────────

@ml_bp.route('/code-quality', methods=['POST'])
@require_auth
def code_quality():
    """
    Analyze code quality metrics for a submission.
    Python: full radon analysis (LOC, cyclomatic complexity, MI).
    Other languages: basic LOC metrics.
    """
    data     = request.get_json()
    code     = data.get('code', '')
    language = data.get('language', 'python')

    if not code:
        return jsonify({'error': 'code required'}), 400

    metrics = analyze_code_quality(code, language)
    score   = quality_to_score(metrics)
    return jsonify({'metrics': metrics, 'quality_score': score}), 200


# ── ML Health Check ───────────────────────────────────────────────────────────

@ml_bp.route('/health', methods=['GET'])
def ml_health():
    """Check all ML models are loaded and working."""
    from app.ml.focus_model import load_model as load_focus
    focus_data = load_focus()
    return jsonify({
        'focus_model': {
            'loaded': focus_data is not None,
            'auc':    round(focus_data['auc'], 4) if focus_data else None,
        },
        'knowledge_tracing': {'loaded': True, 'type': 'formula-based'},
        'plagiarism':        {'loaded': True, 'type': 'tfidf-cosine'},
        'ranking':           {'loaded': True, 'type': 'weighted-formula'},
        'code_quality':      {'loaded': True, 'type': 'radon-metrics'},
        'status': 'ok'
    }), 200
