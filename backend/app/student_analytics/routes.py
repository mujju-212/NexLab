"""
Student-Facing Analytics Blueprint (Two-Track Unified Engine)
Exposes self-scoped Academic (Track 1), Platform (Track 2), and Blended Knowledge Map endpoints.
"""
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_auth, require_role
from app.extensions import db
from app.models.user import User
from app.models.grading import Grade
from app.models.experiment import Experiment
from app.models.submission import CodeAttempt
from app.models.knowledge import ConceptMastery, FocusScore
from app.models.academic import Section, SectionStudent, SectionSubject
from app.models.subject import Subject
from app.models.session import LabSession, SessionAttendance
from app.models.proctor_event import ProctorEvent
from app.analytics.completion import (
    compute_student_completion_rollup,
    compute_student_attendance_rollup,
    get_student_360_overview,
)
from app.analytics.ranking import get_student_all_ranks
from app.analytics.mastery import compute_scoped_mastery, get_concept_prerequisite_graph
from app.analytics.risk import compute_student_risk
from app.analytics.metrics import compute_student_atomic_metrics
from app.analytics.integrity import compute_integrity_confidence
from app.analytics.advanced import forecast_student_trajectory
from app.platform_rank.rating import (
    compute_student_platform_rating,
    get_student_platform_standing,
)
from app.platform_rank.leaderboard import get_platform_leaderboard
from app.platform_rank.practice_mastery import get_practice_topic_mastery
from app.platform_rank.unlock import check_content_unlocks
from app.platform_rank.blended import compute_blended_knowledge_map

student_facing_analytics_bp = Blueprint('student_facing_analytics', __name__)
platform_public_bp = Blueprint('platform_public', __name__)


def _enforce_self_scope(target_student_id: str):
    """Guards that student role users can strictly access only their own data."""
    if g.role == 'student' and g.user_id != target_student_id:
        return jsonify({'error': 'Access denied: students may only view their own analytics'}), 403
    return None


# ══════════════════════════════════════════════════════════════════════════════
# UNIFIED OVERVIEW (The One Call for the Student Analytics Hub)
# ══════════════════════════════════════════════════════════════════════════════

@student_facing_analytics_bp.route('/overview', methods=['GET'])
@require_auth
def student_analytics_overview():
    """
    Returns the comprehensive unified Student Profile fusing:
      - Academic Track (enrolled subjects, completion, academic mastery, multi-scope ranks, gentle standing)
      - Platform Track (rating, level, streak, badges, global rank, unlocks)
      - Blended 'What I Know' competency map
      - Curated highlights & next steps
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    # 1. Academic 360 overview
    academic_360 = get_student_360_overview(student_id=student_id, institution_id=g.institution_id)

    # 2. Platform Standing (Track 2)
    platform_standing = get_student_platform_standing(student_id)

    # 3. Content Unlocks
    unlocks = check_content_unlocks(student_id)

    # 4. Blended Knowledge Map
    blended_map = compute_blended_knowledge_map(student_id, institution_id=g.institution_id)

    # 5. Highlights & Next Steps
    strong_topics = blended_map.get('strong_topics', [])
    focus_topics = blended_map.get('focus_topics', [])

    standing_band = academic_360.get('risk', {}).get('risk_band', 'ok')
    primary_reason = academic_360.get('risk', {}).get('primary_reason', '')

    suggestions = []
    if focus_topics:
        suggestions.append(f'Strengthen fundamental comprehension in {", ".join(focus_topics[:2])}.')
    if standing_band in ('critical', 'high'):
        suggestions.append('Attend upcoming lab session and review pre-lab materials with your instructor.')
    else:
        suggestions.append('On track! Challenge yourself with Medium & Hard practice problem sets.')

    highlights = {
        'strong_topics': strong_topics,
        'focus_topics': focus_topics,
        'suggestions': suggestions,
        'next_unlock': unlocks.get('next_unlock'),
    }

    return jsonify({
        'student_id': student_id,
        'academic': {
            'completion': academic_360.get('completion', {}),
            'attendance': academic_360.get('attendance', {}),
            'grades': academic_360.get('grades', {}),
            'mastery': academic_360.get('mastery', {}),
            'ranks': academic_360.get('ranks', {}),
            'standing': {
                'band': standing_band,
                'primary_reason': primary_reason,
            },
        },
        'platform': platform_standing,
        'unlocks': unlocks,
        'knowledge_map': blended_map.get('knowledge_map', []),
        'highlights': highlights,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# TRACK 1 — ACADEMIC ANALYTICS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@student_facing_analytics_bp.route('/subjects', methods=['GET'])
@require_auth
def student_subjects_analytics():
    """
    Returns performance metrics grouped per enrolled subject:
    avg grade, completion status, weighted subject score rollup, and experiment progress.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    # Find enrolled sections
    enrollments = SectionStudent.query.filter_by(student_id=student_id).all()
    sec_ids = [e.section_id for e in enrollments]

    sec_subjects = (
        SectionSubject.query
        .filter(SectionSubject.section_id.in_(sec_ids))
        .all()
    ) if sec_ids else []

    subjects_summary = []
    for ss in sec_subjects:
        subject = Subject.query.get(ss.subject_id)
        if not subject:
            continue

        exps = (
            Experiment.query
            .filter_by(subject_id=subject.id, is_published=True)
            .order_by(Experiment.exp_number.asc())
            .all()
        )
        exp_ids = [e.id for e in exps]

        # Fetch student grades for these experiments
        grades_map = {
            g_row.experiment_id: g_row
            for g_row in Grade.query.filter(
                Grade.student_id == student_id,
                Grade.experiment_id.in_(exp_ids),
            ).all()
        } if exp_ids else {}

        completed_count = 0
        total_grade_weighted = 0.0
        total_weightage = 0.0

        exp_items = []
        for e in exps:
            g_item = grades_map.get(e.id)
            final_gr = float(g_item.final_grade) if (g_item and g_item.final_grade is not None) else None
            is_comp = final_gr is not None and final_gr >= 50.0
            if is_comp:
                completed_count += 1

            w = float(e.weightage or 1.0)
            total_weightage += w
            if final_gr is not None:
                scale = float(e.grade_scale or 100.0)
                total_grade_weighted += (final_gr / max(1.0, scale)) * 100.0 * w

            exp_items.append({
                'experiment_id': e.id,
                'exp_number': e.exp_number,
                'title': e.title,
                'final_grade': final_gr,
                'is_completed': is_comp,
                'weightage': w,
            })

        total_exps = len(exps)
        completion_pct = round(100.0 * (completed_count / max(1, total_exps)), 1) if total_exps > 0 else 0.0
        subject_avg = round(total_grade_weighted / max(1.0, total_weightage), 1) if total_weightage > 0 else 0.0

        subjects_summary.append({
            'subject_id': subject.id,
            'subject_name': subject.name,
            'subject_code': subject.code,
            'total_experiments': total_exps,
            'completed_experiments': completed_count,
            'completion_pct': completion_pct,
            'subject_average': subject_avg,
            'experiments': exp_items,
        })

    return jsonify({'subjects': subjects_summary}), 200


@student_facing_analytics_bp.route('/mastery', methods=['GET'])
@require_auth
def student_scoped_mastery():
    """
    Returns scoped concept mastery per enrolled subject with weak concepts and next-step advice.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    subject_id = request.args.get('subject_id')
    scope_level = 'subject' if subject_id else 'institution'
    scope_id = subject_id if subject_id else None

    mastery_data = compute_scoped_mastery(
        student_id=student_id,
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=g.institution_id,
    )

    # Prerequisite intelligence if subject is chosen
    prereq_graph = get_concept_prerequisite_graph(student_id=student_id, subject_id=subject_id)

    return jsonify({
        'student_id': student_id,
        'subject_id': subject_id,
        'scope_average': mastery_data.get('scope_avg', 0.0),
        'concepts': mastery_data.get('concepts', []),
        'weak_concepts': mastery_data.get('weak_concepts', []),
        'prerequisite_blocks': prereq_graph.get('blocked_concepts', []),
    }), 200


@student_facing_analytics_bp.route('/ranks', methods=['GET'])
@require_auth
def student_unified_ranks():
    """
    Returns unified standings across both tracks:
      - Academic: Section, Subject, Year, Department, Institution
      - Platform: Rating, Global Rank, Global Percentile, Rank Movement
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    # Academic multi-scope ranks
    academic_ranks = get_student_all_ranks(student_id=student_id, institution_id=g.institution_id)

    # Platform standing (Track 2)
    platform_standing = get_student_platform_standing(student_id)

    return jsonify({
        'student_id': student_id,
        'academic': academic_ranks,
        'platform': {
            'rating': platform_standing.get('rating'),
            'level': platform_standing.get('level'),
            'level_name': platform_standing.get('level_name'),
            'global_rank': platform_standing.get('global_rank'),
            'global_percentile': platform_standing.get('global_percentile'),
            'rank_movement': platform_standing.get('rank_movement'),
        },
    }), 200


@student_facing_analytics_bp.route('/standing', methods=['GET'])
@require_auth
def student_gentle_standing():
    """
    Student-facing gentle health standing.
    Reframes risk into constructive pedagogical guidance without alarming numbers.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    now = datetime.utcnow()
    start_dt = now.replace(month=1, day=1) if now.month > 6 else now.replace(year=now.year - 1, month=7, day=1)
    atomic = compute_student_atomic_metrics(
        student_id=student_id,
        institution_id=g.institution_id,
        window_start=start_dt,
        window_end=now,
    )
    risk_info = compute_student_risk(student_metrics=atomic)

    band = risk_info.get('risk_band', 'ok')
    primary_reason = risk_info.get('primary_reason', '')

    suggestions = []
    if band == 'critical':
        status_label = 'Requires Immediate Attention'
        suggestions.append('Schedule office hours or viva guidance with your lab instructor.')
        suggestions.append('Complete missing code submissions for ended sessions.')
    elif band == 'high':
        status_label = 'Needs Support'
        suggestions.append('Focus on concept weak points identified in your diagnostic map.')
        suggestions.append('Utilize diagnostic hints and AI guided explanations.')
    elif band == 'watch':
        status_label = 'Steady Progress'
        suggestions.append('Keep attendance consistent and ensure all pre-lab modules are completed.')
    else:
        status_label = 'On Track & Thriving'
        suggestions.append('Excellent work! Explore advanced practice problems and competitive challenges.')

    return jsonify({
        'student_id': student_id,
        'status_label': status_label,
        'standing_band': band,
        'primary_reason': primary_reason or 'Consistent academic engagement recorded.',
        'suggestions': suggestions,
    }), 200


@student_facing_analytics_bp.route('/attendance', methods=['GET'])
@require_auth
def student_attendance_analytics():
    """
    Returns student attendance rate, active participation rate, and session history.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    subject_id = request.args.get('subject_id')
    rollup = compute_student_attendance_rollup(
        student_id=student_id,
        scope_level='subject' if subject_id else 'institution',
        scope_id=subject_id,
        institution_id=g.institution_id,
    )
    return jsonify(rollup), 200


@student_facing_analytics_bp.route('/integrity', methods=['GET'])
@require_auth
def student_integrity_transparency():
    """
    Student's own integrity record (proctoring events and transparency summary).
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    confidence_data = compute_integrity_confidence(student_id=student_id)
    return jsonify(confidence_data), 200


@student_facing_analytics_bp.route('/trends', methods=['GET'])
@require_auth
def student_trends_analytics():
    """
    Returns historical score trajectory and focus performance.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    # Aggregate grades over time
    grades = (
        Grade.query
        .filter(Grade.student_id == student_id, Grade.final_grade.isnot(None))
        .order_by(Grade.created_at.asc())
        .all()
    )

    trend_points = []
    for idx, gr in enumerate(grades):
        exp = Experiment.query.get(gr.experiment_id) if gr.experiment_id else None
        trend_points.append({
            'index': idx + 1,
            'experiment_id': gr.experiment_id,
            'experiment_title': exp.title if exp else f'Exp {idx+1}',
            'final_grade': float(gr.final_grade),
            'auto_grade': float(gr.auto_grade) if gr.auto_grade is not None else None,
            'created_at': gr.created_at.isoformat() if gr.created_at else None,
        })

    return jsonify({
        'student_id': student_id,
        'points_count': len(trend_points),
        'grades_trend': trend_points,
    }), 200


@student_facing_analytics_bp.route('/forecast', methods=['GET'])
@require_auth
def student_performance_forecast():
    """
    Computes 95% confidence interval projected performance trajectory.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    forecast_data = forecast_student_trajectory(student_id=student_id)
    return jsonify(forecast_data), 200


# ══════════════════════════════════════════════════════════════════════════════
# TRACK 2 & BLENDED ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@student_facing_analytics_bp.route('/platform-standing', methods=['GET'])
@require_auth
def student_platform_standing():
    """
    Returns Track-2 competitive standing: rating, level, badges, streak, problems solved.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    standing = get_student_platform_standing(student_id)
    return jsonify(standing), 200


@student_facing_analytics_bp.route('/practice-mastery', methods=['GET'])
@require_auth
def student_practice_mastery():
    """
    Returns practice topic strength across all nexlab topics.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    mastery = get_practice_topic_mastery(student_id)
    return jsonify({'topics': mastery}), 200


@student_facing_analytics_bp.route('/unlocks', methods=['GET'])
@require_auth
def student_content_unlocks():
    """
    Returns tiered content access and progression toward next unlock tier.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    unlocks = check_content_unlocks(student_id)
    return jsonify(unlocks), 200


@student_facing_analytics_bp.route('/knowledge-map', methods=['GET'])
@require_auth
def student_knowledge_map():
    """
    Returns the blended competency map fusing Academic and Practice mastery.
    """
    student_id = request.args.get('student_id') or g.user_id
    blocked = _enforce_self_scope(student_id)
    if blocked:
        return blocked

    kmap = compute_blended_knowledge_map(student_id=student_id, institution_id=g.institution_id)
    return jsonify(kmap), 200


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC / PLATFORM LEADERBOARDS (Track 2)
# ══════════════════════════════════════════════════════════════════════════════

@platform_public_bp.route('/leaderboard', methods=['GET'])
@require_auth
def platform_leaderboard():
    """
    Returns Track-2 platform leaderboard.
    Scopes: global, topic (needs scope_id), institution (needs scope_id).
    Periods: all_time, monthly, weekly.
    Enforces tenant privacy: NO private grades, risk, or proctor violations are returned.
    """
    scope = request.args.get('scope', 'global')
    scope_id = request.args.get('scope_id')
    period = request.args.get('period', 'all_time')
    limit = int(request.args.get('limit', 50))

    if scope == 'institution' and not scope_id:
        scope_id = g.institution_id

    data = get_platform_leaderboard(
        scope=scope,
        scope_id=scope_id,
        period=period,
        current_student_id=g.user_id,
        limit=limit,
    )
    return jsonify(data), 200
