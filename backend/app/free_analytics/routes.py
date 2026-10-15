"""
Free User Analytics Routes & Platform Track Surface
Prefix: /api/free/analytics
Accessible by free users (and all platform participants).

Endpoints:
  GET   /overview           -> The One Profile Call (Standing + Difficulty Mix + Topics + Unlocks + Heatmap + Courses + Highlights)
  GET   /standing           -> Competitive Platform Standing (Rating, Level, Rank, Percentile, Streak, Badges)
  GET   /activity           -> 365-day Activity Heatmap + Solve/XP Trends
  GET   /accuracy           -> Accuracy Breakdown, First-Try Rate, and Personal Bests
  GET   /courses            -> Course Progress Rollups, Exercise Solves, and Certificate Eligibility
  GET   /topic-strength     -> Topic Mastery Strength Matrix (0-100)
  GET   /unlocks            -> Tiered Content Progression (Easy, Medium, Hard, Contests)
  GET   /leaderboard        -> Platform Leaderboards (Global, Topic, Period)
  GET   /recommendations    -> Targeted Problem Recommendations
  GET   /showcase/<slug>    -> Public Platform-Safe Achievement Showcase (No Auth Required)
  GET   /showcase/me        -> User's Showcase Settings & Public URL
  PATCH /showcase           -> Toggle Showcase Public Visibility & Generate Slug
"""
import re
from datetime import datetime
from flask import Blueprint, request, jsonify, g

from app.auth.utils import require_auth
from app.extensions import db
from app.models.user import User
from app.models.practice import StudentXP, StudentBadge, BADGE_CATALOG, Problem, PracticeSubmission
from app.platform_rank.rating import (
    compute_student_platform_rating,
    get_student_platform_standing,
)
from app.platform_rank.leaderboard import get_platform_leaderboard
from app.platform_rank.practice_mastery import get_practice_topic_mastery
from app.platform_rank.unlock import check_content_unlocks
from app.free_analytics.course_stats import get_user_course_analytics
from app.free_analytics.activity import (
    get_free_user_activity,
    get_free_user_accuracy_and_bests,
    get_free_user_recommendations,
)

free_analytics_bp = Blueprint('free_analytics', __name__)


def _ensure_user_xp(user_id: str) -> StudentXP:
    """Ensures a StudentXP record exists for tracking platform level and showcase slug."""
    xp = StudentXP.query.filter_by(student_id=user_id).first()
    if not xp:
        xp = StudentXP(student_id=user_id)
        db.session.add(xp)
        db.session.commit()
    return xp


def _slugify_name(name: str, fallback: str) -> str:
    """Creates a URL-safe unique showcase slug."""
    base = re.sub(r'[^a-z0-9]+', '-', (name or fallback).lower()).strip('-')[:24]
    if not base:
        base = 'coder'
    slug = base
    attempt = 0
    while StudentXP.query.filter(StudentXP.profile_slug == slug, StudentXP.student_id != g.user_id).first():
        attempt += 1
        slug = f"{base}-{attempt}"
    return slug


# ══════════════════════════════════════════════════════════════════════════════
# 1. THE ONE PROFILE CALL (Overview)
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/overview', methods=['GET'])
@require_auth
def free_analytics_overview():
    """
    Unified Profile payload for the Free User Analytics Hub:
    Standing + Difficulty Mix + Topic Strength + Unlocks + Heatmap + Courses + Highlights.
    """
    user_id = g.user_id

    # 1. Platform Standing
    standing = get_student_platform_standing(user_id)

    # 2. Accuracy & Difficulty Mix
    accuracy_data = get_free_user_accuracy_and_bests(user_id)
    difficulty_mix = accuracy_data['difficulty_mix']

    # 3. Topic Strength
    topic_strength = get_practice_topic_mastery(user_id)

    # 4. Content Unlocks
    unlocks = check_content_unlocks(user_id)

    # 5. Activity Heatmap & Trends (last 365 days)
    activity = get_free_user_activity(user_id, days=365)

    # 6. Course Progress Rollups
    course_analytics = get_user_course_analytics(user_id)

    # 7. Curated Motivational Highlights
    highlights: list[str] = []
    if standing.get('global_percentile') and standing['global_percentile'] >= 80:
        top_pct = max(1, 100 - int(standing['global_percentile']))
        highlights.append(f"Top {top_pct}% Platform Rank Worldwide")
    if standing.get('streak_days', 0) >= 3:
        highlights.append(f"🔥 Active {standing['streak_days']}-Day Practice Streak")
    if unlocks.get('hard_unlocked'):
        highlights.append("Unlocked Hard-tier algorithmic challenges")
    elif unlocks.get('medium_unlocked'):
        highlights.append("Unlocked Medium-tier challenges")
    if course_analytics.get('completed_courses', 0) > 0:
        highlights.append(f"Graduated from {course_analytics['completed_courses']} complete course(s)")
    if accuracy_data['personal_bests'].get('fastest_solve_ms'):
        highlights.append(f"Fastest solve recorded in {accuracy_data['personal_bests']['fastest_solve_ms']}ms")
    if not highlights:
        highlights.append("Welcome! Solve practice problems and complete courses to build your score.")

    return jsonify({
        'standing': standing,
        'difficulty_mix': difficulty_mix,
        'topic_strength': topic_strength,
        'unlocks': unlocks,
        'activity': {
            'heatmap': activity['heatmap'],
            'summary': activity['summary'],
            'xp_trend': activity['xp_trend'],
            'solve_trend': activity['solve_trend'],
        },
        'courses': course_analytics['courses'],
        'course_summary': {
            'enrolled_courses': course_analytics['enrolled_courses'],
            'completed_courses': course_analytics['completed_courses'],
            'total_exercises_solved': course_analytics['total_exercises_solved'],
            'certificates': course_analytics['certificates'],
        },
        'highlights': highlights,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 2. STANDING & RATING
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/standing', methods=['GET'])
@require_auth
def get_standing():
    """
    Returns complete difficulty-weighted platform standing:
    Rating, Level, Global Rank, Global Percentile, Solves by Difficulty, Streak, Badges.
    """
    standing = get_student_platform_standing(g.user_id)
    return jsonify(standing), 200


# ══════════════════════════════════════════════════════════════════════════════
# 3. ACTIVITY HEATMAP & TRENDS
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/activity', methods=['GET'])
@require_auth
def get_activity():
    """
    GitHub-style 365-day calendar activity heatmap with solve & XP trends.
    Query param: days (default 365).
    """
    days = request.args.get('days', 365)
    try:
        days = int(days)
    except (ValueError, TypeError):
        days = 365

    data = get_free_user_activity(g.user_id, days=days)
    return jsonify(data), 200


# ══════════════════════════════════════════════════════════════════════════════
# 4. ACCURACY & PERSONAL BESTS
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/accuracy', methods=['GET'])
@require_auth
def get_accuracy():
    """
    Comprehensive accuracy stats:
    Acceptance rate, first-attempt solve rate, average attempts to solve, and personal records.
    """
    data = get_free_user_accuracy_and_bests(g.user_id)
    return jsonify(data), 200


# ══════════════════════════════════════════════════════════════════════════════
# 5. COURSE ROLLUPS & CERTIFICATES
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/courses', methods=['GET'])
@require_auth
def get_courses():
    """
    Detailed course catalog completion rollups and certificate eligibility.
    """
    data = get_user_course_analytics(g.user_id)
    return jsonify(data), 200


# ══════════════════════════════════════════════════════════════════════════════
# 6. TOPIC MASTERY STRENGTH
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/topic-strength', methods=['GET'])
@require_auth
def get_topic_strength():
    """
    Algorithmic topic proficiency score (0-100) across all practice topics
    fusing library problems and course exercises.
    """
    topics = get_practice_topic_mastery(g.user_id)
    return jsonify({'topic_strength': topics}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 7. CONTENT UNLOCKS & PROGRESSION
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/unlocks', methods=['GET'])
@require_auth
def get_unlocks():
    """
    Progression gates for Medium, Hard, and Contests tiers.
    """
    data = check_content_unlocks(g.user_id)
    return jsonify(data), 200


# ══════════════════════════════════════════════════════════════════════════════
# 8. PLATFORM LEADERBOARDS
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/leaderboard', methods=['GET'])
@require_auth
def get_leaderboard():
    """
    Platform competitive leaderboards:
    Scopes: global | topic
    Periods: all_time | monthly | weekly
    """
    scope = request.args.get('scope', 'global')
    scope_id = request.args.get('scope_id')
    period = request.args.get('period', 'all_time')
    limit = request.args.get('limit', 50)
    try:
        limit = int(limit)
    except (ValueError, TypeError):
        limit = 50

    # Ensure current user has an up-to-date rating computed
    compute_student_platform_rating(g.user_id, commit=True)

    board = get_platform_leaderboard(
        scope=scope,
        scope_id=scope_id,
        period=period,
        current_student_id=g.user_id,
        limit=limit,
    )
    return jsonify(board), 200


# ══════════════════════════════════════════════════════════════════════════════
# 9. TARGETED RECOMMENDATIONS
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/recommendations', methods=['GET'])
@require_auth
def get_recommendations():
    """
    Targeted next-problem recommendations focused on weakest topic areas
    and tailored to the user's current difficulty capabilities.
    """
    limit = request.args.get('limit', 5)
    try:
        limit = int(limit)
    except (ValueError, TypeError):
        limit = 5

    picks = get_free_user_recommendations(g.user_id, limit=limit)
    return jsonify({'recommendations': picks}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 10. PUBLIC SHOWCASE PROFILE (Fixed & Upgraded)
# ══════════════════════════════════════════════════════════════════════════════

@free_analytics_bp.route('/showcase/<slug>', methods=['GET'])
def get_public_showcase(slug):
    """
    Public achievement showcase portfolio — NO AUTH REQUIRED.
    Security & Privacy Rules:
      - Validates profile_public == True
      - NEVER returns user email, institution, or private database IDs
      - Exposes safe display name (e.g. 'Alex K.'), rating, level, badges, top topics, and recent solves
    """
    xp = StudentXP.query.filter_by(profile_slug=slug).first()
    if not xp or not xp.profile_public:
        return jsonify({'error': 'Profile not found or is set to private.'}), 404

    user = User.query.get(xp.student_id)
    if not user:
        return jsonify({'error': 'Profile owner not found.'}), 404

    # Safe display name: First name + initial
    names = (user.full_name or 'Coder').split()
    display_name = names[0]
    if len(names) > 1:
        display_name += f" {names[-1][0]}."

    # Standing
    standing = get_student_platform_standing(xp.student_id)

    # Badges
    badges = StudentBadge.query.filter_by(student_id=xp.student_id).all()
    badge_details = [
        {'badge_id': b.badge_id, **(BADGE_CATALOG.get(b.badge_id, {}))}
        for b in badges
    ]

    # Topic Strengths (top 5)
    topics = get_practice_topic_mastery(xp.student_id)
    top_topics = sorted(topics, key=lambda t: t['strength'], reverse=True)[:5]

    # Recent solves (safe public fields: title, difficulty, date)
    recent_subs = (
        PracticeSubmission.query
        .filter(
            PracticeSubmission.student_id == xp.student_id,
            PracticeSubmission.status == 'Accepted',
            PracticeSubmission.is_run == False,
        )
        .order_by(PracticeSubmission.submitted_at.desc())
        .limit(6)
        .all()
    )
    problems = {p.id: p for p in Problem.query.filter(Problem.id.in_([s.problem_id for s in recent_subs])).all()} if recent_subs else {}

    recent_solves = [
        {
            'title': problems[s.problem_id].title if s.problem_id in problems else 'Problem',
            'difficulty': problems[s.problem_id].difficulty if s.problem_id in problems else 'Easy',
            'solved_at': s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
        }
        for s in recent_subs
    ]

    return jsonify({
        'slug': slug,
        'display_name': display_name,
        'standing': {
            'rating': standing['rating'],
            'level': standing['level'],
            'level_name': standing['level_name'],
            'total_xp': standing['total_xp'],
            'global_percentile': standing['global_percentile'],
            'streak_days': standing['streak_days'],
            'problems_solved': standing['problems_solved'],
            'easy_solved': standing['easy_solved'],
            'medium_solved': standing['medium_solved'],
            'hard_solved': standing['hard_solved'],
        },
        'badges': badge_details,
        'top_topics': top_topics,
        'recent_solves': recent_solves,
        'share_url': f"/u/{slug}",
    }), 200


@free_analytics_bp.route('/showcase/me', methods=['GET'])
@require_auth
def get_my_showcase():
    """Returns current user's showcase configuration and public URL."""
    xp = _ensure_user_xp(g.user_id)
    return jsonify({
        'profile_public': bool(xp.profile_public),
        'profile_slug': xp.profile_slug,
        'share_url': f"/u/{xp.profile_slug}" if (xp.profile_public and xp.profile_slug) else None,
    }), 200


@free_analytics_bp.route('/showcase', methods=['PATCH'])
@require_auth
def toggle_showcase():
    """
    Opt in or out of public profile showcase.
    Body: {"profile_public": bool}
    """
    data = request.get_json() or {}
    make_public = bool(data.get('profile_public', False))

    xp = _ensure_user_xp(g.user_id)
    xp.profile_public = make_public

    if make_public and not xp.profile_slug:
        user = User.query.get(g.user_id)
        name = user.full_name if user else ''
        xp.profile_slug = _slugify_name(name, g.user_id[:8])

    db.session.commit()

    return jsonify({
        'profile_public': xp.profile_public,
        'profile_slug': xp.profile_slug if xp.profile_public else None,
        'share_url': f"/u/{xp.profile_slug}" if (xp.profile_public and xp.profile_slug) else None,
    }), 200


@free_analytics_bp.route('/submissions', methods=['GET'])
@require_auth
def get_user_submissions():
    """
    Returns recent practice submissions for the logged-in user with problem metadata.
    """
    limit = min(int(request.args.get('limit', 20)), 100)
    subs = (
        PracticeSubmission.query
        .filter_by(student_id=g.user_id, is_run=False)
        .order_by(PracticeSubmission.submitted_at.desc())
        .limit(limit)
        .all()
    )

    problem_ids = list(set([s.problem_id for s in subs]))
    problems = {p.id: p for p in Problem.query.filter(Problem.id.in_(problem_ids)).all()} if problem_ids else {}

    result = []
    for s in subs:
        p = problems.get(s.problem_id)
        result.append({
            'id': s.id,
            'problem_id': s.problem_id,
            'title': p.title if p else 'Problem',
            'slug': p.slug if p else '',
            'difficulty': p.difficulty if p else 'Easy',
            'nexlab_topic': p.nexlab_topic if p else 'Algorithms',
            'status': s.status,
            'is_solved': s.status == 'Accepted',
            'language': s.language,
            'passed': s.passed,
            'total': s.total,
            'time_ms': s.time_ms,
            'memory_kb': s.memory_kb,
            'xp_earned': s.xp_earned,
            'submitted_at': s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
        })

    return jsonify({'submissions': result, 'total': len(result)}), 200

