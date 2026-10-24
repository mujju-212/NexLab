"""
Platform Dashboard Analytics Builder
Fuses real database records (Problem, PracticeSubmission, StudentXP, PlatformRating, StudentBadge)
into the exact student platform practice analytics dashboard with zero mock or fake overwrites.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from sqlalchemy import func
from app.extensions import db
from app.models.user import User
from app.models.academic import Section, SectionStudent, Department
from app.models.practice import Problem, PracticeSubmission, StudentXP, StudentBadge, PlatformRating, PlatformRatingPeriod
from app.models.grading import HintLog
from app.platform_rank.rating import compute_student_platform_rating, get_student_platform_standing
from app.platform_rank.leaderboard import get_platform_leaderboard
from app.platform_rank.practice_mastery import get_practice_topic_mastery
from app.platform_rank.unlock import check_content_unlocks


def build_platform_dashboard_payload(
    student_id: str,
    problem_type: str = 'all',
    difficulty: str = 'all',
    topic: str = 'all',
    period: str = '30d',
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes and aggregates all real calculated fields from the database
    to power the Platform tab UI with 100% fidelity to real user progress.
    """
    student = db.session.get(User, student_id)
    iid = institution_id or (student.institution_id if student else None)

    # 1. Fetch Platform Standing (Rating, Level, Streak, Solves)
    standing = get_student_platform_standing(student_id)
    rating_val = round(float(standing['rating']), 1) if standing.get('rating') is not None else None
    rating_delta = standing.get('rank_movement')
    global_rank = standing.get('global_rank')
    pct = float(standing['global_percentile']) if standing.get('global_percentile') is not None else None
    top_pct = max(1, 100 - round(pct)) if pct is not None else None

    # Query all real practice submissions for this student
    subs_query = (
        PracticeSubmission.query
        .filter(PracticeSubmission.student_id == student_id, PracticeSubmission.is_run.is_(False))
        .order_by(PracticeSubmission.submitted_at.desc())
    )

    # Period filter
    now = datetime.utcnow()
    period_days = {'7d': 7, 'weekly': 7, '30d': 30, '30': 30, '60d': 60, '60': 60, '12w': 84, '90d': 90, '90': 90}
    window_start = now - timedelta(days=period_days[period]) if period in period_days else None
    if window_start is not None:
        subs_query = subs_query.filter(PracticeSubmission.submitted_at >= window_start)

    db_subs = subs_query.all()

    # Pre-cache problems for submission metadata
    prob_ids = list({s.problem_id for s in db_subs if s.problem_id})
    prob_map = {p.id: p for p in Problem.query.filter(Problem.id.in_(prob_ids)).all()} if prob_ids else {}

    total_solves = int(standing.get('problems_solved') or 0)
    easy_solves = int(standing.get('easy_solved') or 0)
    med_solves = int(standing.get('medium_solved') or 0)
    hard_solves = int(standing.get('hard_solved') or 0)
    lifetime_easy_solves = easy_solves
    lifetime_medium_solves = med_solves

    # Only stored historical rating snapshots can draw a rating trend.
    periods = (
        PlatformRatingPeriod.query
        .filter_by(student_id=student_id)
        .order_by(PlatformRatingPeriod.created_at.asc())
        .limit(7)
        .all()
    )
    sparkline_rating = [round(float(p.rating)) for p in periods if p.rating is not None]

    # XP & Level
    current_xp = standing.get('total_xp')
    level = standing.get('level')
    level_name = standing.get('level_name')
    next_level_xp = standing.get('next_level_xp')
    streak_days = standing.get('streak_days')

    # Week streak dots (Sunday through Saturday of current week)
    today = now.date()
    # Sunday offset: weekday() is Monday=0, Sunday=6 -> (today.weekday() + 1) % 7
    sun_offset = (today.weekday() + 1) % 7
    sun_date = today - timedelta(days=sun_offset)
    day_labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    active_sub_dates = {s.submitted_at.date() for s in db_subs if s.submitted_at}
    week_dots = []
    for d_idx, d_lbl in enumerate(day_labels):
        target_d = sun_date + timedelta(days=d_idx)
        week_dots.append({
            'day': d_lbl,
            'active': target_d in active_sub_dates,
        })

    # 2. Profile Details
    full_name = getattr(student, 'full_name', None) or getattr(student, 'name', None)
    sec_name = None
    sec_link = SectionStudent.query.filter_by(student_id=student_id).first()
    if sec_link:
        sec = db.session.get(Section, sec_link.section_id)
        if sec and sec.name:
            sec_name = sec.name
    dept_code = None
    if student and student.department_id:
        dept = db.session.get(Department, student.department_id)
        if dept and dept.code:
            dept_code = dept.code
    dept_year = ' • '.join(part for part in (dept_code, sec_name) if part) or None

    student_profile = {
        'id': student_id,
        'name': full_name,
        'department_year': dept_year,
        'avatar_url': getattr(student, 'avatar_url', None),
    }

    # 3. Badges Showcase from DB
    user_badges = StudentBadge.query.filter_by(student_id=student_id).all()
    badges_list = []
    BADGE_CONFIG = {
        'first_solve': {'title': 'First Solve', 'subtext': '1st Problem Solved', 'type': 'first', 'color': '#16a34a', 'bg': '#f0fdf4', 'icon': 'award'},
        'centurion': {'title': '100 Solves', 'subtext': '100 Solves', 'type': 'solves_100', 'color': '#ea580c', 'bg': '#fff7ed', 'badge_text': '100'},
        'streak_7': {'title': '7-Day Streak', 'subtext': '7-Day Streak', 'type': 'streak_7', 'color': '#0284c7', 'bg': '#f0f9ff', 'icon': 'zap'},
        'streak_30': {'title': '30-Day Streak', 'subtext': '30-Day Streak', 'type': 'streak_30', 'color': '#7c3aed', 'bg': '#f5f3ff', 'icon': 'flame'},
        'speed_demon': {'title': 'Speed Demon', 'subtext': 'Fast Solver (<5m)', 'type': 'speed', 'color': '#eab308', 'bg': '#fefce8', 'icon': 'zap'},
        'top_10': {'title': 'Top 10', 'subtext': 'Campus Top 10', 'type': 'rank', 'color': '#ec4899', 'bg': '#fdf2f8', 'icon': 'trophy'},
    }
    for b in user_badges:
        cfg = BADGE_CONFIG.get(b.badge_id, {
            'title': b.badge_id.replace('_', ' ').title(),
            'subtext': b.badge_id.replace('_', ' ').title(),
            'type': b.badge_id,
            'color': '#0284c7',
            'bg': '#f0f9ff',
            'icon': 'award',
        })
        badges_list.append({
            'id': b.id,
            'title': cfg['title'],
            'subtext': cfg['subtext'],
            'type': cfg['type'],
            'color': cfg['color'],
            'bg': cfg['bg'],
            'icon': cfg.get('icon', 'award'),
            'badge_text': cfg.get('badge_text'),
            'earned_at': b.earned_at.isoformat() if b.earned_at else None,
        })

    # 4. KPI Summary Cards (Real Calculations)
    is_diff_filtered = bool(difficulty and difficulty.lower() != 'all')
    target_diff = difficulty.capitalize() if is_diff_filtered else 'all'

    is_topic_filtered = bool(topic and topic.lower() != 'all')
    target_topic = topic.lower() if is_topic_filtered else 'all'
    is_problem_type_filtered = bool(problem_type and problem_type.lower() != 'all')
    target_problem_type = problem_type.strip().lower() if is_problem_type_filtered else 'all'

    # Filter submissions according to requested filters
    matching_subs = db_subs
    if is_diff_filtered:
        matching_subs = [s for s in matching_subs if prob_map.get(s.problem_id) and (prob_map[s.problem_id].difficulty or '').lower() == target_diff.lower()]
    if is_problem_type_filtered:
        if target_problem_type == 'daily':
            matching_subs = [s for s in matching_subs if prob_map.get(s.problem_id) and bool(prob_map[s.problem_id].is_daily)]
        else:
            matching_subs = [s for s in matching_subs if prob_map.get(s.problem_id) and (prob_map[s.problem_id].source or '').strip().lower() == target_problem_type]
    if is_topic_filtered:
        matching_subs = [s for s in matching_subs if prob_map.get(s.problem_id) and target_topic in (prob_map[s.problem_id].nexlab_topic or '').lower()]

    accepted_problem_ids = {s.problem_id for s in matching_subs if s.status == 'Accepted'}
    accepted_problems = [prob_map[pid] for pid in accepted_problem_ids if pid in prob_map]
    display_solves = len(accepted_problem_ids)
    easy_solves = sum(1 for p in accepted_problems if (p.difficulty or '').lower() == 'easy')
    med_solves = sum(1 for p in accepted_problems if (p.difficulty or '').lower() == 'medium')
    hard_solves = sum(1 for p in accepted_problems if (p.difficulty or '').lower() == 'hard')

    total_matching_attempts = len(matching_subs)
    accepted_matching = sum(1 for s in matching_subs if s.status == 'Accepted')
    disp_acc = round(100.0 * accepted_matching / total_matching_attempts, 1) if total_matching_attempts > 0 else None

    times = [s.time_ms for s in matching_subs if s.time_ms and s.time_ms > 0]
    avg_ms = round(sum(times) / len(times)) if times else None
    disp_time = f"{round(avg_ms / 60000, 1)} min" if avg_ms is not None and avg_ms >= 60000 else f"{avg_ms} ms" if avg_ms is not None and avg_ms > 0 else None

    hints_query = HintLog.query.filter_by(student_id=student_id)
    if window_start is not None:
        hints_query = hints_query.filter(HintLog.created_at >= window_start)
    hints_count = hints_query.count()

    # Dynamic mini sparklines / bars from real weekly activity
    weekly_solves_map: Dict[int, int] = defaultdict(int)
    for s in matching_subs:
        if s.status == 'Accepted' and s.submitted_at:
            w_idx = max(0, min(6, (now - s.submitted_at).days // 7))
            weekly_solves_map[6 - w_idx] += 1
    disp_bars = [weekly_solves_map[i] for i in range(7)]

    kpis = {
        'problems_solved': {
            'value': display_solves,
            'delta': None,
            'breakdown': {
                'easy': easy_solves,
                'medium': med_solves,
                'hard': hard_solves,
            },
            'bars': disp_bars,
        },
        'acceptance_rate': {
            'value': disp_acc,
            'delta': None,
            'sparkline': [],
        },
        'avg_time': {
            'value': disp_time,
            'delta': None,
            'sparkline': [],
        },
        'hints_used': {
            'value': hints_count,
            'delta': None,
            'bars': [],
        },
    }

    # 5. Practice Activity Trend (12 Weeks Combo)
    weeks = [f"W{i+1}" for i in range(12)]
    twelve_weeks_ago = now - timedelta(weeks=12)
    weekly_problems = [0] * 12
    weekly_xp = [0] * 12

    for s in db_subs:
        if s.submitted_at and s.submitted_at >= twelve_weeks_ago:
            w_diff = (now - s.submitted_at).days // 7
            idx_12 = 11 - min(11, max(0, w_diff))
            if s.status == 'Accepted':
                weekly_problems[idx_12] += 1
                weekly_xp[idx_12] += int(s.xp_earned or 0)

    max_prob = max(10, max(weekly_problems) + 5)
    max_x = max(100, max(weekly_xp) + 50)

    activity_trend = {
        'weeks': weeks,
        'problems_series': weekly_problems,
        'xp_series': weekly_xp,
        'max_problems': max_prob,
        'max_xp': max_x,
    }

    # 6. Difficulty Distribution
    diff_total = display_solves
    easy_pct = round(100 * easy_solves / diff_total) if diff_total else 0
    med_pct = round(100 * med_solves / diff_total) if diff_total else 0
    hard_pct = round(100 * hard_solves / diff_total) if diff_total else 0

    difficulty_dist = {
        'total': total_solves,
        'easy': {'count': easy_solves, 'pct': easy_pct, 'color': '#10b981'},
        'medium': {'count': med_solves, 'pct': med_pct, 'color': '#f59e0b'},
        'hard': {'count': hard_solves, 'pct': hard_pct, 'color': '#ef4444'},
    }

    # 7. Real Topic Performance from Practice Topic Mastery
    real_topics = get_practice_topic_mastery(student_id, window_start=window_start)
    if is_topic_filtered:
        real_topics = [row for row in real_topics if row['topic'].strip().lower() == target_topic]
    sorted_topics = sorted(real_topics, key=lambda x: x.get('strength', 0.0), reverse=True)

    topic_strongest = []
    for t in sorted_topics[:5]:
        topic_strongest.append({
            'topic': t['topic'],
            'pct': int(round(t.get('strength', 0.0))),
            'color': '#06b6d4' if t.get('strength', 0) >= 80 else '#10b981' if t.get('strength', 0) >= 60 else '#f59e0b',
        })

    topic_needs_focus = []
    for t in reversed(sorted_topics[-5:]):
        topic_needs_focus.append({
            'topic': t['topic'],
            'pct': int(round(t.get('strength', 0.0))),
            'color': '#ef4444' if t.get('strength', 0) < 40 else '#f97316' if t.get('strength', 0) < 60 else '#f59e0b',
        })

    # 8. Real Recent Submissions Table from DB
    recent_submissions_list = []
    for s in db_subs[:10]:
        prob = prob_map.get(s.problem_id)
        p_title = prob.title if prob else None
        p_diff = prob.difficulty if prob else None
        is_acc = s.status == 'Accepted'
        t_ms = f"{s.time_ms} ms" if (s.time_ms and s.time_ms > 0) else '—'
        xp_g = f"+{s.xp_earned}" if s.xp_earned is not None else None
        dt_str = s.submitted_at.strftime('%b %d, %Y') if s.submitted_at else None

        recent_submissions_list.append({
            'id': s.id,
            'problem': p_title,
            'difficulty': p_diff,
            'result': s.status,
            'is_accepted': is_acc,
            'time': t_ms,
            'xp': xp_g,
            'date': dt_str,
        })

    # 9. Next Unlocks Progress
    unlock_data = check_content_unlocks(student_id)
    next_unlock_info = unlock_data.get('next_unlock', {})
    next_unlocks = [
        {
            'id': 'u1',
            'title': 'Solve 15 Easy problems for Medium Tier',
            'current': lifetime_easy_solves,
            'target': 15,
            'pct': min(100, round((lifetime_easy_solves / 15.0) * 100)),
            'reward': 'Unlock Medium difficulty',
            'color': '#10b981',
            'icon_bg': '#ecfdf5',
        },
        {
            'id': 'u2',
            'title': 'Solve 20 Medium problems for Hard Tier',
            'current': lifetime_medium_solves,
            'target': 20,
            'pct': min(100, round((lifetime_medium_solves / 20.0) * 100)),
            'reward': 'Unlock Hard difficulty',
            'color': '#f59e0b',
            'icon_bg': '#fef3c7',
        },
        {
            'id': 'u3',
            'title': 'Maintain a 30-day streak',
            'current': streak_days,
            'target': 30,
            'pct': min(100, round((streak_days / 30.0) * 100)) if streak_days is not None else None,
            'reward': 'Unlock Centurion Flame Badge',
            'color': '#0284c7',
            'icon_bg': '#e0f2fe',
        },
    ]

    # 10. Platform Leaderboard (Real DB Data)
    board = get_platform_leaderboard(scope='global', limit=5, current_student_id=student_id)
    leaderboard_data = {
        'current_scope': 'global',
        'entries': [
            {
                'rank': entry.get('position'),
                'name': entry.get('full_name') or entry.get('name'),
                'initials': ''.join([part[0] for part in (entry.get('full_name') or entry.get('name') or '').split()[:2]]).upper(),
                'rating': round(float(entry['rating'])) if entry.get('rating') is not None else None,
                'avatar_color': '#7c3aed' if entry.get('is_current_user') else '#3b82f6',
                'is_current_user': entry.get('student_id') == student_id,
            }
            for idx, entry in enumerate(board.get('leaderboard', []))
        ],
    }

    # 11. Dropdown filter options are derived from catalog rows in this database.
    sources = [row[0] for row in db.session.query(Problem.source).distinct().all() if row[0]]
    difficulties = [row[0] for row in db.session.query(Problem.difficulty).distinct().all() if row[0]]
    topic_options = sorted({row['topic'] for row in real_topics if row.get('topic')})
    filter_options = {
        'problem_types': ([{'id': 'all', 'label': 'All Problems'}, {'id': 'daily', 'label': 'Daily Challenge'}] +
                          [{'id': str(src).lower(), 'label': str(src)} for src in sorted(sources)]),
        'difficulties': [{'id': 'all', 'label': 'All Difficulties'}] +
                        [{'id': str(diff).lower(), 'label': str(diff)} for diff in sorted(difficulties)],
        'topics': [{'id': 'all', 'label': 'All Topics'}] +
                  [{'id': name, 'label': name} for name in topic_options],
        'date_ranges': [
            {'id': '7d', 'label': 'Last 7 Days'},
            {'id': '30d', 'label': 'Last 30 Days'},
            {'id': '60d', 'label': 'Last 60 Days'},
            {'id': '90d', 'label': 'Last 90 Days'},
            {'id': 'all', 'label': 'All Time'},
        ],
    }

    return {
        'student_profile': student_profile,
        'standing': {
            'rating': rating_val,
            'rating_delta': rating_delta,
            'sparkline_rating': sparkline_rating,
            'global_rank': global_rank,
            'global_percentile': pct,
            'top_percent': top_pct,
            'level': level,
            'level_name': level_name,
            'current_xp': current_xp,
            'next_level_xp': next_level_xp,
            'streak_days': streak_days,
            'week_dots': week_dots,
        },
        'badges': badges_list,
        'kpi_metrics': kpis,
        'activity_trend': activity_trend,
        'difficulty_distribution': difficulty_dist,
        'topic_performance': {
            'strongest': topic_strongest,
            'needs_focus': topic_needs_focus,
        },
        'recent_submissions': recent_submissions_list,
        'next_unlocks': next_unlocks,
        'leaderboard': leaderboard_data,
        'filter_options': filter_options,
    }
