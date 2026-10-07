"""
Student & Instructor Analytics Endpoints
Flask Blueprint exposing canonical Student 360, multi-scope rankings, scoped mastery,
integrity confidence, struggle quadrant, error clustering, and intervention tracking.
"""
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_auth, require_role
from app.analytics.scope import resolve_scope_entities
from app.analytics.mastery import compute_scoped_mastery, get_concept_prerequisite_graph
from app.analytics.completion import (
    compute_student_completion_rollup,
    compute_student_attendance_rollup,
    get_student_360_overview,
)
from app.analytics.ranking import compute_rank_for_scope, get_student_all_ranks
from app.analytics.integrity import compute_integrity_confidence, get_integrity_review_queue
from app.analytics.advanced import (
    compute_struggle_quadrant,
    cluster_error_patterns,
    get_attempt_replay,
    forecast_student_trajectory,
)
from app.analytics.interventions import (
    record_intervention,
    update_intervention_outcome,
    list_interventions,
)
from app.analytics.config import get_analytics_config, save_analytics_config

student_analytics_bp = Blueprint('student_analytics', __name__)


def _enforce_self_scope(target_student_id: str):
    """Ensure student roles can only access their own analytics."""
    if g.role == 'student' and g.user_id != target_student_id:
        return jsonify({'error': 'Access denied: students may only access their own analytics'}), 403
    return None


# ─── Student 360 & Scoped Analytics ──────────────────────────────────────────

@student_analytics_bp.route('/student/<student_id>/overview', methods=['GET'])
@require_auth
def student_360_overview(student_id):
    """
    Returns complete Student 360 academic profile:
    attendance, completion, grades, scoped mastery, unified risk, and multi-scope ranks.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    scope_level = request.args.get('scope') or request.args.get('scope_level') or 'subject'
    scope_id = request.args.get('id') or request.args.get('scope_id')

    data = get_student_360_overview(
        student_id=student_id,
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )
    if 'error' in data:
        return jsonify(data), 404
    return jsonify(data), 200


@student_analytics_bp.route('/student/<student_id>/mastery', methods=['GET'])
@require_auth
def student_scoped_mastery(student_id):
    """
    Returns scoped concept mastery breakdowns and identifies weak concepts in scope.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    scope_level = request.args.get('scope') or request.args.get('scope_level') or 'subject'
    scope_id = request.args.get('id') or request.args.get('scope_id')

    data = compute_scoped_mastery(
        student_id=student_id,
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )
    return jsonify(data), 200


@student_analytics_bp.route('/student/<student_id>/prerequisites', methods=['GET'])
@require_auth
def student_concept_prerequisites(student_id):
    """
    Returns concept prerequisite dependency graph and blocked concepts.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    subject_id = request.args.get('subject_id') or request.args.get('scope_id')
    threshold = float(request.args.get('threshold', 50.0))
    data = get_concept_prerequisite_graph(
        student_id=student_id,
        subject_id=subject_id,
        mastery_threshold=threshold
    )
    return jsonify(data), 200


@student_analytics_bp.route('/student/<student_id>/ranks', methods=['GET'])
@require_auth
def student_all_ranks(student_id):
    """
    Returns holistic 5-component rankings across all 7 scopes:
    experiment, subject, section, year, department, institution, and platform.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    data = get_student_all_ranks(
        student_id=student_id,
        institution_id=g.institution_id,
    )
    return jsonify({'student_id': student_id, 'ranks': data}), 200


@student_analytics_bp.route('/student/<student_id>/forecast', methods=['GET'])
@require_auth
def student_forecast(student_id):
    """
    Projects end-of-term academic grade and mastery trajectory with confidence bands.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    scope_level = request.args.get('scope_level', 'subject')
    scope_id = request.args.get('scope_id')

    data = forecast_student_trajectory(
        student_id=student_id,
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )
    return jsonify(data), 200


@student_analytics_bp.route('/student/<student_id>/integrity', methods=['GET'])
@require_auth
def student_integrity(student_id):
    """
    Returns proctoring timeline, plagiarism flags, and integrity confidence score.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    session_id = request.args.get('session_id')
    data = compute_integrity_confidence(
        student_id=student_id,
        session_id=session_id,
        institution_id=g.institution_id,
    )
    return jsonify(data), 200


# ─── Multi-Scope Leaderboard & Ranking ───────────────────────────────────────

@student_analytics_bp.route('/leaderboard', methods=['GET'])
@student_analytics_bp.route('/rankings/scope', methods=['GET'])
@require_auth
def cohort_leaderboard():
    """
    Returns the ranked leaderboard cohort for any scope level:
    'section', 'department', 'year', 'institution', or 'platform'.
    """
    scope_level = request.args.get('scope_level', 'institution')
    scope_id = request.args.get('scope_id')
    limit = int(request.args.get('limit', 50))
    limit = max(1, min(200, limit))

    results = compute_rank_for_scope(
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )
    return jsonify({
        'scope_level': scope_level,
        'scope_id': scope_id,
        'cohort_size': len(results),
        'leaderboard': results[:limit],
    }), 200


@student_analytics_bp.route('/experiment/<experiment_id>/ranks', methods=['GET'])
@require_auth
def experiment_ranks(experiment_id):
    """
    Returns experiment-level ranking ordered by assessment final grade.
    """
    results = compute_rank_for_scope(
        scope_level='experiment',
        scope_id=experiment_id,
        institution_id=g.institution_id,
    )
    return jsonify({
        'experiment_id': experiment_id,
        'cohort_size': len(results),
        'ranks': results,
    }), 200


# ─── Advanced Instructor Analytics ───────────────────────────────────────────

@student_analytics_bp.route('/struggle', methods=['GET'])
@student_analytics_bp.route('/struggle-quadrant', methods=['GET'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def struggle_quadrant():
    """
    Returns 2D Struggle Quadrant scatter plot (Effort vs Outcome) partitioned
    into Thriving, Struggling, Coasting, and Disengaged groups via median splits.
    """
    scope_level = request.args.get('scope_level', 'institution')
    scope_id = request.args.get('scope_id')

    data = compute_struggle_quadrant(
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )
    return jsonify(data), 200


@student_analytics_bp.route('/experiment/<experiment_id>/errors', methods=['GET'])
@student_analytics_bp.route('/error-clusters/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def experiment_error_clusters(experiment_id):
    """
    Clusters compiler stderrs and runtime failures into recurring error signatures.
    """
    data = cluster_error_patterns(
        experiment_id=experiment_id,
        institution_id=g.institution_id,
    )
    return jsonify(data), 200


@student_analytics_bp.route('/attempt-replay/<student_id>/<experiment_id>', methods=['GET'])
@require_auth
def attempt_replay(student_id, experiment_id):
    """
    Reconstructs step-by-step code versions, diffs, and test-case convergence curves.
    """
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    data = get_attempt_replay(student_id=student_id, experiment_id=experiment_id)
    return jsonify(data), 200


@student_analytics_bp.route('/integrity/review-queue', methods=['GET'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def integrity_review_queue():
    """
    Returns prioritized review queue of students with proctoring violations
    or low integrity confidence.
    """
    scope_level = request.args.get('scope_level', 'institution')
    scope_id = request.args.get('scope_id')
    limit = int(request.args.get('limit', 50))

    queue = get_integrity_review_queue(
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
        limit=limit,
    )
    return jsonify({'total': len(queue), 'queue': queue}), 200


@student_analytics_bp.route('/concept-dependencies', methods=['GET'])
@require_auth
def concept_dependencies():
    """
    Returns directed prerequisite knowledge graph and highlights blocked concepts.
    """
    subject_id = request.args.get('subject_id')
    student_id = request.args.get('student_id') or g.user_id

    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    data = get_concept_prerequisite_graph(student_id=student_id, subject_id=subject_id)
    return jsonify(data), 200


# ─── Intervention Tracking ───────────────────────────────────────────────────

@student_analytics_bp.route('/interventions', methods=['GET', 'POST'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def manage_interventions():
    """
    GET: Lists interventions and calculated risk-delta efficacy.
    POST: Records a new intervention for a struggling student.
    """
    if request.method == 'GET':
        student_id = request.args.get('student_id')
        status = request.args.get('status')
        limit = int(request.args.get('limit', 50))

        data = list_interventions(
            institution_id=g.institution_id,
            student_id=student_id,
            instructor_id=g.user_id if g.role == 'instructor' else None,
            status=status,
            limit=limit,
        )
        return jsonify(data), 200

    # POST
    payload = request.get_json() or {}
    student_id = payload.get('student_id')
    action_type = payload.get('action_type')
    note = payload.get('note')
    follow_up_str = payload.get('follow_up_at')

    if not student_id or not action_type:
        return jsonify({'error': 'student_id and action_type are required'}), 400

    follow_up_at = None
    if follow_up_str:
        try:
            follow_up_at = datetime.fromisoformat(follow_up_str.replace('Z', ''))
        except Exception:
            pass

    created = record_intervention(
        student_id=student_id,
        instructor_id=g.user_id,
        institution_id=g.institution_id,
        action_type=action_type,
        note=note,
        follow_up_at=follow_up_at,
    )
    return jsonify(created), 201


@student_analytics_bp.route('/interventions/<intervention_id>/outcome', methods=['POST'])
@require_role('instructor', 'institution_admin', 'platform_admin')
def update_intervention_status(intervention_id):
    """
    Updates the outcome of an intervention and records the post-intervention risk score.
    """
    payload = request.get_json() or {}
    outcome = payload.get('outcome')
    outcome_note = payload.get('outcome_note')

    if not outcome:
        return jsonify({'error': 'outcome is required'}), 400

    updated = update_intervention_outcome(
        intervention_id=intervention_id,
        outcome=outcome,
        outcome_note=outcome_note,
        institution_id=g.institution_id,
    )
    if 'error' in updated:
        return jsonify(updated), 404
    return jsonify(updated), 200


# ─── Tenant Analytics Configuration ──────────────────────────────────────────

@student_analytics_bp.route('/config', methods=['GET', 'PUT'])
@require_auth
def tenant_analytics_configuration():
    """
    GET: Retrieves institution analytics tuning (weights, bands, sample sizes).
    PUT: Updates tenant analytics configuration (institution_admin only).
    """
    iid = g.institution_id
    if not iid:
        return jsonify({'error': 'Institution context required'}), 400

    if request.method == 'GET':
        cfg = get_analytics_config(iid)
        return jsonify(cfg), 200

    if g.role not in ('institution_admin', 'platform_admin'):
        return jsonify({'error': 'Forbidden: only institution_admin may alter configuration'}), 403

    payload = request.get_json() or {}
    updated = save_analytics_config(iid, payload)
    return jsonify(updated), 200
