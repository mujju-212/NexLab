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
from sqlalchemy import or_
from app.models.user import User

student_analytics_bp = Blueprint('student_analytics', __name__)


def _enforce_self_scope(target_student_id: str):
    """Tenant + role scoping for every student-scoped analytics endpoint.

    Students may only read themselves. Instructors may only read students who are
    enrolled in a section they actually teach — before this, any instructor could
    pull the full 360 profile of any student in the institution just by holding
    the id, and the lookup itself (`User.query.get`) had no tenant filter, so a
    student from another institution resolved too.
    """
    if g.role == 'student':
        if g.user_id != target_student_id:
            return jsonify({'error': 'Access denied: students may only access their own analytics'}), 403
        return None

    student = User.query.get(target_student_id)
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    if student.institution_id and g.institution_id and student.institution_id != g.institution_id:
        return jsonify({'error': 'Student is not part of this institution'}), 404

    if g.role == 'instructor':
        from app.models.academic import SectionSubject, SectionStudent
        mine = SectionSubject.query.filter(
            SectionSubject.institution_id == g.institution_id,
            or_(SectionSubject.instructor_id == g.user_id,
                SectionSubject.co_instructor_id == g.user_id),
        ).all()
        section_ids = {ss.section_id for ss in mine}
        enrolled = bool(section_ids) and SectionStudent.query.filter(
            SectionStudent.student_id == target_student_id,
            SectionStudent.section_id.in_(section_ids),
        ).first() is not None
        if not enrolled:
            return jsonify({'error': 'This student is not enrolled in any of your classes'}), 403
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
    scope_level = (request.args.get('scope_level', 'institution') or 'institution').lower()
    scope_id = request.args.get('scope_id')
    limit = int(request.args.get('limit', 50))
    limit = max(1, min(200, limit))

    # Student leaderboards are limited to the student's own institution and
    # academic cohorts. A caller-supplied UUID must never widen that scope.
    if g.role == 'student':
        from app.models.academic import SectionStudent, SectionSubject, Section, Batch
        student = User.query.get(g.user_id)
        if not student or not g.institution_id:
            return jsonify({'error': 'Academic rankings are unavailable for this account'}), 403
        section_ids = [row.section_id for row in SectionStudent.query.filter_by(student_id=g.user_id).all()]
        if scope_level in ('section', 'section_subject'):
            if scope_id and scope_id not in section_ids:
                own_subject_ids = [row.id for row in SectionSubject.query.filter(SectionSubject.section_id.in_(section_ids)).all()] if section_ids else []
                if scope_id not in own_subject_ids:
                    return jsonify({'error': 'Access denied: rankings are limited to your own section'}), 403
            scope_id = scope_id or (section_ids[0] if section_ids else None)
        elif scope_level == 'subject':
            own_subject_ids = [row.subject_id for row in SectionSubject.query.filter(SectionSubject.section_id.in_(section_ids)).all()] if section_ids else []
            if scope_id and scope_id not in own_subject_ids:
                return jsonify({'error': 'Access denied: rankings are limited to your enrolled subjects'}), 403
            scope_id = scope_id or (own_subject_ids[0] if own_subject_ids else None)
        elif scope_level == 'department':
            if scope_id and scope_id != student.department_id:
                return jsonify({'error': 'Access denied: rankings are limited to your department'}), 403
            scope_id = student.department_id
        elif scope_level == 'year':
            sections = Section.query.filter(Section.id.in_(section_ids), Section.institution_id == g.institution_id).all() if section_ids else []
            allowed_year_ids = set()
            for section in sections:
                if section.batch_id:
                    batch = Batch.query.get(section.batch_id)
                    if batch:
                        allowed_year_ids.update([batch.id, batch.year_id])
            if scope_id and scope_id not in allowed_year_ids:
                return jsonify({'error': 'Access denied: rankings are limited to your cohort'}), 403
            scope_id = scope_id or next(iter(allowed_year_ids), None)
        elif scope_level == 'institution':
            if scope_id and scope_id != g.institution_id:
                return jsonify({'error': 'Access denied: rankings are limited to your institution'}), 403
            scope_id = g.institution_id
        else:
            return jsonify({'error': 'Students may only view academic rankings within their institution'}), 403
    elif scope_level == 'institution' and not scope_id:
        scope_id = g.institution_id

    results = compute_rank_for_scope(
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )

    student_ids = [r['student_id'] for r in results if r.get('student_id')]
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    current_user_entry = None
    for r in results:
        sid = r.get('student_id')
        u = users_map.get(sid)
        display_name = u.full_name if (u and u.full_name) else (u.name if (u and u.name) else 'Student')
        r['name'] = display_name
        r['student_name'] = display_name
        r['full_name'] = display_name
        r['roll_number'] = u.roll_number if u else None
        r['avatar_url'] = getattr(u, 'profile_pic_url', None) if u else None
        r['mastery'] = r.get('mastery_score', 0)
        r['engagement'] = r.get('engagement_score', 0)
        r['effort'] = r.get('effort_score', 0)
        r['efficiency'] = r.get('efficiency_score', 0)
        r['consistency'] = r.get('consistency_score', 0)
        r['position'] = r.get('rank_position', 1)

        is_me = (sid == g.user_id)
        r['is_current_user'] = is_me
        if is_me:
            current_user_entry = r

    return jsonify({
        'scope_level': scope_level,
        'scope_id': scope_id,
        'cohort_size': len(results),
        'leaderboard': results[:limit],
        'current_user': current_user_entry,
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

    from app.instructor.management import VALID_ACTIONS
    if action_type not in VALID_ACTIONS:
        return jsonify({'error': f'action_type must be one of: {", ".join(VALID_ACTIONS)}'}), 400

    # The Student 360 drawer sends `target_date`; the class interventions tab
    # sends `follow_up_at`. Only the latter was read, so a follow-up date picked
    # in the drawer was silently dropped and the "due" reminder never fired.
    follow_up_str = follow_up_str or payload.get('target_date')

    follow_up_at = None
    if follow_up_str:
        try:
            follow_up_at = datetime.fromisoformat(str(follow_up_str).replace('Z', ''))
        except Exception:
            pass

    # Same enrolment rule as the read paths: no logging actions on strangers.
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

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
