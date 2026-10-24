"""
Quest & XP Service
Computes real quest progress, streak milestones, weekly calendar activity,
and handles quest reward claims. Zero mock data.
"""
from datetime import datetime, date, timedelta, time
from sqlalchemy import func, or_
from app.extensions import db
from app.models.user import User
from app.models.practice import (
    Problem,
    PracticeSubmission,
    StudentXP,
    StudentBadge,
    StudentQuestClaim,
    BADGE_CATALOG,
    XP_TABLE,
)


def _get_or_create_xp(student_id):
    xp = StudentXP.query.filter_by(student_id=student_id).first()
    if not xp:
        xp = StudentXP(student_id=student_id)
        db.session.add(xp)
        db.session.flush()
    return xp


def get_quest_dashboard_data(user_id: str, role: str = 'student', institution_id: str = None) -> dict:
    xp = StudentXP.query.filter_by(student_id=user_id).first()
    if xp is None:
        # Read-only dashboard access must not create a persistent zero-activity
        # record; only an explicit check-in or solved submission writes XP state.
        xp = StudentXP(
            student_id=user_id, total_xp=0, level=1, level_name='Newcomer',
            streak_days=0, problems_solved=0, easy_solved=0,
            medium_solved=0, hard_solved=0,
        )

    badges = StudentBadge.query.filter_by(student_id=user_id).all()
    badge_ids = set([b.badge_id for b in badges])

    # 1. Global / Institution Rank
    rank_q = db.session.query(func.count(StudentXP.id)).join(
        User, User.id == StudentXP.student_id
    ).filter(
        or_(StudentXP.total_xp > 0, StudentXP.problems_solved > 0),
        StudentXP.total_xp > (xp.total_xp or 0),
    )
    has_rank_activity = (xp.total_xp or 0) > 0 or (xp.problems_solved or 0) > 0
    global_rank = (rank_q.scalar() or 0) + 1 if has_rank_activity else None

    # 2. Timing & Reset calculations
    now = datetime.utcnow()
    today = date.today()
    start_of_today = datetime.combine(today, time.min)
    end_of_today = datetime.combine(today + timedelta(days=1), time.min)
    seconds_left_today = max(0, int((end_of_today - now).total_seconds()))
    hours_left_today = seconds_left_today // 3600
    mins_left_today = (seconds_left_today % 3600) // 60
    daily_resets_in = f"{hours_left_today}h {mins_left_today}m"

    # Current week Monday to Sunday
    start_of_week = today - timedelta(days=today.weekday())
    end_of_week = start_of_week + timedelta(days=6)
    days_left_week = max(0, (end_of_week - today).days)
    weekly_resets_in = f"{days_left_week} days" if days_left_week > 1 else ("1 day" if days_left_week == 1 else "Ends today")

    range_label = f"{start_of_week.strftime('%b %d')} – {end_of_week.strftime('%b %d, %Y')}"

    # 3. Submissions analysis for this user
    all_subs = PracticeSubmission.query.filter_by(student_id=user_id, is_run=False).all()
    accepted_subs = [s for s in all_subs if s.status == 'Accepted']

    # Active dates set (dates with accepted solves or explicit streak date)
    active_dates = set([s.submitted_at.date() for s in accepted_subs])
    if xp.streak_last_date:
        active_dates.add(xp.streak_last_date)

    # Today accepted
    today_accepted = [s for s in accepted_subs if s.submitted_at.date() == today]
    today_solved_problem_ids = list(set([s.problem_id for s in today_accepted]))
    today_probs = Problem.query.filter(Problem.id.in_(today_solved_problem_ids)).all() if today_solved_problem_ids else []

    # Array problems solved today
    array_solved_today = sum(
        1 for p in today_probs
        if 'array' in (p.nexlab_topic or '').lower()
        or any('array' in str(t).lower() for t in (p.topics or []))
        or 'array' in p.title.lower()
    )
    medium_solved_today = sum(1 for p in today_probs if p.difficulty == 'Medium')

    # First attempt correct today
    first_attempt_today = False
    for s in today_accepted:
        prev_fails = [
            x for x in all_subs
            if x.problem_id == s.problem_id
            and x.submitted_at < s.submitted_at
            and x.status != 'Accepted'
        ]
        if len(prev_fails) == 0:
            first_attempt_today = True
            break

    streak_active_today = (xp.streak_last_date == today) or (len(today_accepted) > 0)

    # Week accepted
    week_accepted = [s for s in accepted_subs if s.submitted_at.date() >= start_of_week]
    week_solved_problem_ids = list(set([s.problem_id for s in week_accepted]))
    week_probs = Problem.query.filter(Problem.id.in_(week_solved_problem_ids)).all() if week_solved_problem_ids else []

    medium_solved_week = sum(1 for p in week_probs if p.difficulty == 'Medium')
    topics_solved_week = len(set([p.nexlab_topic for p in week_probs if p.nexlab_topic]))
    problems_solved_week = len(week_solved_problem_ids)

    # 4. Check user claimed quests
    claims = StudentQuestClaim.query.filter_by(student_id=user_id).all()
    claimed_keys = set([c.quest_key for c in claims])

    today_str = today.isoformat()
    week_str = start_of_week.isoformat()

    # 5. Weekly calendar columns (Mon - Sun)
    calendar_days = []
    active_days_in_week = 0
    for i in range(7):
        d = start_of_week + timedelta(days=i)
        is_act = (d in active_dates)
        if is_act:
            active_days_in_week += 1
        calendar_days.append({
            'name': d.strftime('%a'),
            'date': d.day,
            'iso_date': d.isoformat(),
            'is_active': is_act,
            'is_today': (d == today),
            'is_future': (d > today),
        })

    # 6. Hero Banner Today's Quest
    hero_progress = min(3, array_solved_today)
    hero_is_completed = hero_progress >= 3
    hero_quest = {
        'id': f"daily_array_3_{today_str}",
        'title': "Solve 3 Array Problems",
        'description': "Build your problem-solving habit and earn bonus XP!",
        'xp_reward': 30,
        'difficulty': "Easy – Medium",
        'topic': "Arrays",
        'ends_in': daily_resets_in,
        'progress': hero_progress,
        'total': 3,
        'is_completed': hero_is_completed,
        'action_label': "Completed" if hero_is_completed else ("Continue Quest" if hero_progress > 0 else "Start Quest"),
        'action_url': "/practice/library?topic=Array",
    }

    # 7. Daily Quests (5 items)
    q1_prog = min(1, len(today_solved_problem_ids))
    q2_prog = min(3, array_solved_today)
    q3_prog = 1 if streak_active_today else 0
    q4_prog = 1 if first_attempt_today else 0
    q5_prog = min(1, medium_solved_today)

    daily_items = [
        {
            'id': f"daily_solve_1_{today_str}",
            'title': "Solve 1 Problem",
            'subtitle': "Any difficulty level",
            'icon': "check",
            'xp_reward': 10,
            'progress': q1_prog,
            'total': 1,
            'is_completed': q1_prog >= 1,
            'is_claimed': f"daily_solve_1_{today_str}" in claimed_keys,
            'action_label': "Completed" if q1_prog >= 1 else "Solve Now",
            'action_url': "/practice/library",
        },
        {
            'id': f"daily_array_3_{today_str}",
            'title': "Solve 3 Array Problems",
            'subtitle': "Easy – Medium",
            'icon': "target",
            'xp_reward': 30,
            'progress': q2_prog,
            'total': 3,
            'is_completed': q2_prog >= 3,
            'is_claimed': f"daily_array_3_{today_str}" in claimed_keys,
            'action_label': "Completed" if q2_prog >= 3 else ("Continue" if q2_prog > 0 else "Solve Now"),
            'action_url': "/practice/library?topic=Array",
        },
        {
            'id': f"daily_streak_1_{today_str}",
            'title': "Maintain 1 Day Streak",
            'subtitle': "Check in or solve at least one problem today",
            'icon': "flame",
            'xp_reward': 20,
            'progress': q3_prog,
            'total': 1,
            'is_completed': q3_prog >= 1,
            'is_claimed': f"daily_streak_1_{today_str}" in claimed_keys,
            'action_label': "Completed" if q3_prog >= 1 else "Solve Now",
            'action_url': "/practice/library",
        },
        {
            'id': f"daily_first_attempt_{today_str}",
            'title': "Get 100% on a Problem",
            'subtitle': "First attempt correct",
            'icon': "zap",
            'xp_reward': 25,
            'progress': q4_prog,
            'total': 1,
            'is_completed': q4_prog >= 1,
            'is_claimed': f"daily_first_attempt_{today_str}" in claimed_keys,
            'action_label': "Completed" if q4_prog >= 1 else "Try a Problem",
            'action_url': "/practice/library/daily",
        },
        {
            'id': f"daily_medium_1_{today_str}",
            'title': "Solve a Medium Problem",
            'subtitle': "Any topic",
            'icon': "target",
            'xp_reward': 30,
            'progress': q5_prog,
            'total': 1,
            'is_completed': q5_prog >= 1,
            'is_claimed': f"daily_medium_1_{today_str}" in claimed_keys,
            'action_label': "Completed" if q5_prog >= 1 else "Explore Problems",
            'action_url': "/practice/library?difficulty=Medium",
        },
    ]
    daily_completed_count = sum(1 for item in daily_items if item['is_completed'])

    # 8. Weekly Quests (5 items)
    w1_prog = min(20, problems_solved_week)
    w2_prog = min(10, medium_solved_week)
    w3_prog = min(5, topics_solved_week)
    w4_prog = min(3, xp.streak_days)
    w5_prog = 0  # Contest participation count

    weekly_items = [
        {
            'id': f"weekly_solve_20_{week_str}",
            'title': "Solve 20 Problems",
            'icon': "code",
            'xp_reward': 200,
            'progress': w1_prog,
            'total': 20,
            'is_completed': w1_prog >= 20,
            'is_claimed': f"weekly_solve_20_{week_str}" in claimed_keys,
            'action_url': "/practice/library",
        },
        {
            'id': f"weekly_medium_10_{week_str}",
            'title': "Solve 10 Medium Problems",
            'icon': "chart",
            'xp_reward': 250,
            'progress': w2_prog,
            'total': 10,
            'is_completed': w2_prog >= 10,
            'is_claimed': f"weekly_medium_10_{week_str}" in claimed_keys,
            'action_url': "/practice/library?difficulty=Medium",
        },
        {
            'id': f"weekly_topics_5_{week_str}",
            'title': "Solve in 5 Different Topics",
            'icon': "layers",
            'xp_reward': 200,
            'progress': w3_prog,
            'total': 5,
            'is_completed': w3_prog >= 5,
            'is_claimed': f"weekly_topics_5_{week_str}" in claimed_keys,
            'action_url': "/practice/library",
        },
        {
            'id': f"weekly_streak_3_{week_str}",
            'title': "Achieve 3-Day Streak",
            'icon': "flame",
            'xp_reward': 300,
            'progress': w4_prog,
            'total': 3,
            'is_completed': w4_prog >= 3,
            'is_claimed': f"weekly_streak_3_{week_str}" in claimed_keys,
            'action_url': "/practice/library",
        },
        {
            'id': f"weekly_contest_1_{week_str}",
            'title': "Participate in 1 Contest",
            'icon': "trophy",
            'xp_reward': 400,
            'progress': w5_prog,
            'total': 1,
            'is_completed': w5_prog >= 1,
            'is_claimed': f"weekly_contest_1_{week_str}" in claimed_keys,
            'action_url': "/practice/library",
        },
    ]
    weekly_completed_count = sum(1 for item in weekly_items if item['is_completed'])

    # 9. Skill & Achievement Quests
    achievement_items = [
        {
            'id': "first_solve",
            'title': "First Solve",
            'subtitle': "Solve your first problem",
            'icon': "target",
            'xp_reward': 50,
            'progress': min(1, xp.problems_solved),
            'total': 1,
            'is_earned': (xp.problems_solved >= 1) or ('first_solve' in badge_ids),
        },
        {
            'id': "streak_7",
            'title': "7-Day Streak",
            'subtitle': "Maintain a 7-day streak",
            'icon': "flame",
            'xp_reward': 100,
            'progress': min(7, xp.streak_days),
            'total': 7,
            'is_earned': (xp.streak_days >= 7) or ('streak_7' in badge_ids),
        },
        {
            'id': "streak_30",
            'title': "30-Day Streak",
            'subtitle': "Maintain a 30-day streak",
            'icon': "sparkles",
            'xp_reward': 500,
            'progress': min(30, xp.streak_days),
            'total': 30,
            'is_earned': (xp.streak_days >= 30) or ('streak_30' in badge_ids),
        },
        {
            'id': "easy_10",
            'title': "Easy Mode",
            'subtitle': "Solve 10 Easy problems",
            'icon': "check",
            'xp_reward': 100,
            'progress': min(10, xp.easy_solved),
            'total': 10,
            'is_earned': (xp.easy_solved >= 10) or ('easy_10' in badge_ids),
        },
        {
            'id': "medium_10",
            'title': "Rising Star",
            'subtitle': "Solve 10 Medium problems",
            'icon': "zap",
            'xp_reward': 150,
            'progress': min(10, xp.medium_solved),
            'total': 10,
            'is_earned': (xp.medium_solved >= 10) or ('medium_10' in badge_ids),
        },
        {
            'id': "hard_5",
            'title': "Diamond Coder",
            'subtitle': "Solve 5 Hard problems",
            'icon': "diamond",
            'xp_reward': 300,
            'progress': min(5, xp.hard_solved),
            'total': 5,
            'is_earned': (xp.hard_solved >= 5) or ('hard_5' in badge_ids),
        },
        {
            'id': "centurion",
            'title': "Centurion",
            'subtitle': "Solve 100 problems",
            'icon': "award",
            'xp_reward': 500,
            'progress': min(100, xp.problems_solved),
            'total': 100,
            'is_earned': (xp.problems_solved >= 100) or ('centurion' in badge_ids),
        },
    ]

    return {
        'stats': {
            'streak_days': xp.streak_days,
            'total_xp': xp.total_xp,
            'problems_solved': xp.problems_solved,
            'easy_solved': xp.easy_solved,
            'medium_solved': xp.medium_solved,
            'hard_solved': xp.hard_solved,
            'level': xp.level,
            'level_name': xp.level_name,
            'global_rank': global_rank,
        },
        'today_quest': hero_quest,
        'weekly_progress': {
            'range_label': range_label,
            'active_days_count': active_days_in_week,
            'total_days': 7,
            'reward_xp': 100,
            'days': calendar_days,
        },
        'daily_quests': {
            'completed_count': daily_completed_count,
            'total_count': len(daily_items),
            'resets_in': daily_resets_in,
            'items': daily_items,
        },
        'weekly_quests': {
            'completed_count': weekly_completed_count,
            'total_count': len(weekly_items),
            'resets_in': weekly_resets_in,
            'items': weekly_items,
        },
        'achievement_quests': {
            'items': achievement_items,
        },
        # Backwards compatible fields
        'xp': xp.to_dict(),
        'badges': [b.to_dict() for b in badges],
        'rank': global_rank,
        'scope': 'institution' if (role == 'student' and institution_id) else 'global',
    }


def claim_quest_reward(user_id: str, quest_key: str) -> dict:
    existing = StudentQuestClaim.query.filter_by(student_id=user_id, quest_key=quest_key).first()
    if existing:
        return {'error': 'Quest reward already claimed', 'claimed': True}

    # Reward amounts by prefix
    reward_map = {
        'daily_solve_1': 10,
        'daily_array_3': 30,
        'daily_streak_1': 20,
        'daily_first_attempt': 25,
        'daily_medium_1': 30,
        'weekly_solve_20': 200,
        'weekly_medium_10': 250,
        'weekly_topics_5': 200,
        'weekly_streak_3': 300,
        'weekly_contest_1': 400,
        'first_solve': 50,
        'streak_7': 100,
        'streak_30': 500,
        'easy_10': 100,
        'medium_10': 150,
        'hard_5': 300,
        'century': 500,
    }

    reward = 10
    for prefix, amt in reward_map.items():
        if quest_key.startswith(prefix) or quest_key == prefix:
            reward = amt
            break

    q_type = 'daily' if 'daily' in quest_key else ('weekly' if 'weekly' in quest_key else 'achievement')

    claim = StudentQuestClaim(
        student_id=user_id,
        quest_key=quest_key,
        quest_type=q_type,
        xp_awarded=reward,
    )
    db.session.add(claim)

    xp = _get_or_create_xp(user_id)
    xp.add_xp(reward)
    db.session.commit()

    return {
        'success': True,
        'xp_awarded': reward,
        'total_xp': xp.total_xp,
        'level': xp.level,
        'level_name': xp.level_name,
    }
