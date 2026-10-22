"""
Free User Activity Heatmap, Accuracy & Personal Bests Engine
Generates GitHub-style 365-day activity heatmaps, solve trajectories,
XP growth trends, accuracy metrics (first-try rate, acceptance), and personal records.
"""
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from sqlalchemy import func, desc

from app.extensions import db
from app.models.practice import Problem, PracticeSubmission, StudentXP, PlatformRating
from app.models.free import FreeCourse, FreeExercise, FreeProgress
from app.platform_rank.practice_mastery import get_practice_topic_mastery


def get_free_user_activity(user_id: str, days: int = 365) -> Dict[str, Any]:
    """
    Builds a GitHub-style activity calendar heatmap and solve/XP growth trends
    from practice submissions and course exercise activity.
    """
    days = max(30, min(730, int(days)))
    today = date.today()
    start_date = today - timedelta(days=days - 1)
    start_dt = datetime.combine(start_date, datetime.min.time())

    # 1. Fetch practice submissions in the window
    subs = (
        PracticeSubmission.query
        .filter(
            PracticeSubmission.student_id == user_id,
            PracticeSubmission.is_run == False,
            PracticeSubmission.submitted_at >= start_dt,
        )
        .order_by(PracticeSubmission.submitted_at.asc())
        .all()
    )

    # 2. Fetch course progress records in the window
    course_progs = (
        FreeProgress.query
        .filter(
            FreeProgress.user_id == user_id,
            (FreeProgress.solved_at >= start_dt) | (FreeProgress.created_at >= start_dt),
        )
        .all()
    )

    # Map daily activity counts
    daily_counts = defaultdict(int)
    daily_solves = defaultdict(int)
    daily_xp = defaultdict(int)

    for s in subs:
        if s.submitted_at:
            d_str = s.submitted_at.date().isoformat()
            daily_counts[d_str] += 1
            if s.status == 'Accepted':
                daily_solves[d_str] += 1
            if s.xp_earned:
                daily_xp[d_str] += s.xp_earned

    for p in course_progs:
        act_date = (p.solved_at or p.created_at or datetime.utcnow()).date().isoformat()
        daily_counts[act_date] += max(1, p.attempts or 1)
        if p.status == 'solved':
            daily_solves[act_date] += 1
        if p.xp_earned:
            daily_xp[act_date] += p.xp_earned

    # 3. Build dense calendar heatmap array
    heatmap = []
    curr = start_date
    running_streak = 0
    longest_streak = 0
    max_daily_count = 0
    most_active_date = None

    while curr <= today:
        d_str = curr.isoformat()
        c = daily_counts.get(d_str, 0)

        if c > 0:
            running_streak += 1
            if running_streak > longest_streak:
                longest_streak = running_streak
            if c > max_daily_count:
                max_daily_count = c
                most_active_date = d_str
        else:
            running_streak = 0

        # GitHub-style levels (0: 0, 1: 1-2, 2: 3-5, 3: 6-9, 4: 10+)
        if c == 0:
            level = 0
        elif c <= 2:
            level = 1
        elif c <= 5:
            level = 2
        elif c <= 9:
            level = 3
        else:
            level = 4

        heatmap.append({
            'date': d_str,
            'count': c,
            'level': level,
        })
        curr += timedelta(days=1)

    # Current streak calculation: check today and yesterday
    today_str = today.isoformat()
    yesterday_str = (today - timedelta(days=1)).isoformat()
    current_streak = 0
    if daily_counts.get(today_str, 0) > 0 or daily_counts.get(yesterday_str, 0) > 0:
        scan_day = today if daily_counts.get(today_str, 0) > 0 else (today - timedelta(days=1))
        while scan_day >= start_date:
            if daily_counts.get(scan_day.isoformat(), 0) > 0:
                current_streak += 1
                scan_day -= timedelta(days=1)
            else:
                break

    # Also compare with StudentXP.streak_days
    xp_rec = StudentXP.query.filter_by(student_id=user_id).first()
    if xp_rec and xp_rec.streak_days:
        current_streak = max(current_streak, xp_rec.streak_days)
        longest_streak = max(longest_streak, xp_rec.streak_days)

    total_submissions = sum(daily_counts.values())
    total_active_days = sum(1 for h in heatmap if h['count'] > 0)

    # 4. Build solve trend (cumulative solves timeline)
    solve_trend = []
    xp_trend = []
    cum_solves = 0
    cum_xp = 0

    # Collect sampled timeline points (daily when active, or weekly)
    curr = start_date
    while curr <= today:
        d_str = curr.isoformat()
        ns = daily_solves.get(d_str, 0)
        nxp = daily_xp.get(d_str, 0)
        cum_solves += ns
        cum_xp += nxp

        # Keep datapoints: every 7 days, plus any day with activity, plus last day
        if ns > 0 or nxp > 0 or (today - curr).days % 7 == 0 or curr == today:
            solve_trend.append({
                'date': d_str,
                'cumulative_solved': cum_solves,
                'new_solves': ns,
            })
            xp_trend.append({
                'date': d_str,
                'cumulative_xp': cum_xp,
                'delta_xp': nxp,
            })
        curr += timedelta(days=1)

    return {
        'heatmap': heatmap,
        'summary': {
            'total_active_days': total_active_days,
            'total_submissions': total_submissions,
            'current_streak': current_streak,
            'longest_streak': longest_streak,
            'max_daily_count': max_daily_count,
            'most_active_date': most_active_date,
        },
        'solve_trend': solve_trend,
        'xp_trend': xp_trend,
    }


def get_free_user_accuracy_and_bests(user_id: str, precomputed_activity: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Computes accuracy metrics (acceptance rate, first-try rate, average attempts)
    and personal bests across both practice library and course exercises.
    """
    # 1. Practice submissions
    all_subs = (
        PracticeSubmission.query
        .filter_by(student_id=user_id, is_run=False)
        .order_by(PracticeSubmission.submitted_at.asc())
        .all()
    )
    total_practice_attempts = len(all_subs)
    practice_accepted = [s for s in all_subs if s.status == 'Accepted']

    # Group practice submissions by problem_id
    practice_by_prob = defaultdict(list)
    for s in all_subs:
        practice_by_prob[s.problem_id].append(s)

    practice_first_try = 0
    practice_attempts_on_solved = 0
    distinct_practice_solved = 0

    for pid, psubs in practice_by_prob.items():
        # Solved if any accepted
        accepted_idx = next((i for i, s in enumerate(psubs) if s.status == 'Accepted'), None)
        if accepted_idx is not None:
            distinct_practice_solved += 1
            attempts_to_solve = accepted_idx + 1
            practice_attempts_on_solved += attempts_to_solve
            if accepted_idx == 0:
                practice_first_try += 1

    # 2. Course exercises
    course_progs = FreeProgress.query.filter_by(user_id=user_id).all()
    total_course_attempts = sum(p.attempts or 1 for p in course_progs)
    course_solved = [p for p in course_progs if p.status == 'solved']
    distinct_course_solved = len(course_solved)

    course_first_try = sum(1 for p in course_solved if (p.attempts or 1) == 1)
    course_attempts_on_solved = sum(p.attempts or 1 for p in course_solved)

    # 3. Unified rollups
    total_attempts = total_practice_attempts + total_course_attempts
    total_solved = distinct_practice_solved + distinct_course_solved
    total_first_try = practice_first_try + course_first_try
    total_attempts_on_solved = practice_attempts_on_solved + course_attempts_on_solved

    acceptance_rate = round((float(len(practice_accepted) + distinct_course_solved) / max(1, float(total_attempts))) * 100.0, 1) if total_attempts > 0 else 0.0
    first_try_rate = round((float(total_first_try) / max(1, float(total_solved))) * 100.0, 1) if total_solved > 0 else 0.0
    avg_attempts = round(float(total_attempts_on_solved) / max(1, float(total_solved)), 2) if total_solved > 0 else 1.0

    # 4. Difficulty mix & breakdown
    rating_rec = PlatformRating.query.get(user_id)
    easy_solved = rating_rec.easy_solved if rating_rec else 0
    medium_solved = rating_rec.medium_solved if rating_rec else 0
    hard_solved = rating_rec.hard_solved if rating_rec else 0

    # 5. Personal bests
    # Fastest solve runtime
    fastest_ms = None
    for s in practice_accepted:
        if s.time_ms and s.time_ms > 0:
            if fastest_ms is None or s.time_ms < fastest_ms:
                fastest_ms = s.time_ms

    # Hardest problem cracked
    hardest_problem = None
    if practice_accepted:
        solved_pids = {s.problem_id for s in practice_accepted}
        solved_problems = Problem.query.filter(Problem.id.in_(list(solved_pids))).all()
        # Order by: Hard first, then Medium, then Easy; lowest acceptance first
        rank_order = {'Hard': 3, 'Medium': 2, 'Easy': 1}
        solved_problems.sort(key=lambda p: (rank_order.get(p.difficulty, 0), -(p.acceptance or 1.0)), reverse=True)
        if solved_problems:
            best_prob = solved_problems[0]
            hardest_problem = {
                'id': best_prob.id,
                'slug': best_prob.slug,
                'title': best_prob.title,
                'difficulty': best_prob.difficulty,
                'acceptance': round(float(best_prob.acceptance or 0.0), 3),
            }

    # If no library problem solved, check course exercises
    if not hardest_problem and course_solved:
        ex_ids = [p.exercise_id for p in course_solved]
        solved_exs = FreeExercise.query.filter(FreeExercise.id.in_(ex_ids)).all()
        rank_order = {'hard': 3, 'medium': 2, 'easy': 1}
        solved_exs.sort(key=lambda e: rank_order.get((e.difficulty or 'easy').lower(), 0), reverse=True)
        if solved_exs:
            best_ex = solved_exs[0]
            hardest_problem = {
                'id': best_ex.id,
                'slug': best_ex.id,
                'title': best_ex.title,
                'difficulty': (best_ex.difficulty or 'easy').capitalize(),
                'acceptance': 0.5,
            }

    # Streak & rating records
    xp_rec = StudentXP.query.filter_by(student_id=user_id).first()
    longest_streak = xp_rec.streak_days if xp_rec else 0

    # Most active day (reuse precomputed_activity when provided to avoid duplicate scan)
    act_data = precomputed_activity if precomputed_activity is not None else get_free_user_activity(user_id, days=180)
    most_active_day = {
        'date': act_data['summary']['most_active_date'],
        'count': act_data['summary']['max_daily_count'],
    }
    if act_data['summary']['longest_streak'] > longest_streak:
        longest_streak = act_data['summary']['longest_streak']

    return {
        'acceptance_rate': acceptance_rate,
        'first_try_rate': first_try_rate,
        'avg_attempts': avg_attempts,
        'total_attempts': total_attempts,
        'total_solved': total_solved,
        'difficulty_mix': {
            'easy': easy_solved,
            'medium': medium_solved,
            'hard': hard_solved,
            'total_solved': total_solved,
            'total_attempted': len(practice_by_prob) + len(course_progs),
            'acceptance_rate': acceptance_rate,
        },
        'personal_bests': {
            'longest_streak_days': longest_streak,
            'fastest_solve_ms': fastest_ms,
            'hardest_problem_cracked': hardest_problem,
            'most_active_day': most_active_day,
            'peak_rating': round(float(rating_rec.rating or 0.0), 1) if rating_rec else 0.0,
        },
    }


def get_free_user_recommendations(user_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Produces smart recommendations for free users:
    - Prioritizes topics with lowest mastery/accuracy
    - Suggests problems at appropriate difficulty
    - Excludes already solved problems
    """
    limit = max(1, min(10, int(limit)))
    # 1. Fetch practice mastery
    topic_mastery = get_practice_topic_mastery(user_id)
    # Sort topics by lowest strength
    weak_topics = [t['topic'] for t in sorted(topic_mastery, key=lambda x: x['strength'])]

    # 2. User's highest solved difficulty
    rating_rec = PlatformRating.query.get(user_id)
    easy_solved = rating_rec.easy_solved if rating_rec else 0
    medium_solved = rating_rec.medium_solved if rating_rec else 0
    hard_solved = rating_rec.hard_solved if rating_rec else 0

    target_diff = 'Easy'
    if easy_solved >= 10:
        target_diff = 'Medium'
    if medium_solved >= 15:
        target_diff = 'Hard'

    # 3. Solved IDs to exclude
    solved_subs = PracticeSubmission.query.filter_by(student_id=user_id, status='Accepted', is_run=False).all()
    solved_pids = {s.problem_id for s in solved_subs}

    # 4. Search candidates in weak topics
    candidates = []
    if weak_topics:
        candidates = (
            Problem.query
            .filter(
                Problem.is_active == True,
                Problem.nexlab_topic.in_(weak_topics[:3]),
                Problem.id.notin_(list(solved_pids) or ['none']),
            )
            .limit(limit * 2)
            .all()
        )

    # Fallback to any unsolved problems matching target difficulty
    if len(candidates) < limit:
        extra = (
            Problem.query
            .filter(
                Problem.is_active == True,
                Problem.difficulty == target_diff,
                Problem.id.notin_(list(solved_pids) or ['none']),
            )
            .limit(limit)
            .all()
        )
        for p in extra:
            if p not in candidates:
                candidates.append(p)

    # Format recommendations
    recommendations = []
    for p in candidates[:limit]:
        reason = f"Target practice in {p.nexlab_topic}" if p.nexlab_topic in weak_topics[:3] else f"Step up to {p.difficulty} challenges"
        recommendations.append({
            'id': p.id,
            'slug': p.slug,
            'title': p.title,
            'difficulty': p.difficulty,
            'topic': p.nexlab_topic,
            'acceptance': round(float(p.acceptance or 0.0), 3),
            'reason': reason,
        })

    return recommendations
