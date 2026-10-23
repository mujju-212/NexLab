"""
Content Access & Unlock Engine (Track 2)
Manages progression-based access gating for Medium/Hard problem tiers,
advanced study plans, and competitive coding events.
"""
from typing import Dict, Any, List
from app.models.practice import StudentXP, PlatformRating, xp_to_level


def check_content_unlocks(student_id: str) -> Dict[str, Any]:
    """
    Evaluates unlock criteria for Medium/Hard problem tiers and advanced courses.
    Rules:
      - Easy: Always unlocked
      - Medium: Unlocked when easy_solved >= 15 OR rating >= 300
      - Hard: Unlocked when medium_solved >= 20 OR rating >= 1500
      - Contests / Premium: Unlocked when level >= 3 OR rating >= 500
    """
    xp = StudentXP.query.filter_by(student_id=student_id).first()
    rating_rec = PlatformRating.query.get(student_id)

    easy_solved = rating_rec.easy_solved if rating_rec else (xp.easy_solved if xp else 0)
    medium_solved = rating_rec.medium_solved if rating_rec else (xp.medium_solved if xp else 0)
    rating = float(rating_rec.rating) if rating_rec and (rating_rec.problems_solved or 0) > 0 else None
    total_xp = xp.total_xp if xp else 0
    level, _ = xp_to_level(total_xp) if xp else (None, None)

    # Rating is available only when an actual solve has produced a rating.
    rating_label = f'Rating: {round(rating)}' if rating is not None else 'Rating unavailable'
    earned_rating = max(0.0, rating) if rating is not None else None

    # 1. Medium check (15 easy solves or 300+ rating earned)
    earned_rating = earned_rating if earned_rating is not None else 0.0
    medium_unlocked = easy_solved >= 15 or earned_rating >= 300.0
    medium_progress = min(100.0, round(max((easy_solved / 15.0), (earned_rating / 300.0)) * 100.0, 1))

    # 2. Hard check (20 medium solves or 1500+ rating)
    hard_unlocked = medium_solved >= 20 or earned_rating >= 1500.0
    hard_progress = min(100.0, round(max((medium_solved / 20.0), (earned_rating / 1500.0)) * 100.0, 1))

    # 3. Contests / Advanced study plans check (Level 3 or 500+ rating earned)
    contests_unlocked = (level is not None and level >= 3) or earned_rating >= 500.0
    contest_progress_candidates = ([level / 3.0] if level is not None else []) + ([earned_rating / 500.0] if rating is not None else [])
    contests_progress = min(100.0, round(max(contest_progress_candidates) * 100.0, 1)) if contest_progress_candidates else None

    unlocked_tiers = ['Easy']
    if medium_unlocked:
        unlocked_tiers.append('Medium')
    if hard_unlocked:
        unlocked_tiers.append('Hard')

    # Next unlock target
    if not medium_unlocked:
        next_unlock = {
            'target': 'Medium Difficulty Problems',
            'requirement': 'Solve 15 Easy problems OR attain 300+ Platform Rating',
            'current': f'{easy_solved}/15 solved ({rating_label})',
            'progress_pct': medium_progress,
        }
    elif not hard_unlocked:
        next_unlock = {
            'target': 'Hard Difficulty Problems',
            'requirement': 'Solve 20 Medium problems OR attain 1500+ Platform Rating',
            'current': f'{medium_solved}/20 solved ({rating_label})',
            'progress_pct': hard_progress,
        }
    elif not contests_unlocked:
        next_unlock = {
            'target': 'Competitive Coding Contests',
            'requirement': 'Reach Level 3 (Apprentice) OR 500+ Rating',
            'current': f'Level {level} ({rating_label})' if level is not None else f'Level unavailable ({rating_label})',
            'progress_pct': contests_progress,
        }
    else:
        next_unlock = {
            'target': 'All Tiers Mastered',
            'requirement': 'All problem tiers and competitive features are fully unlocked',
            'current': 'Complete access',
            'progress_pct': 100.0,
        }

    return {
        'unlocked_tiers': unlocked_tiers,
        'medium_unlocked': medium_unlocked,
        'hard_unlocked': hard_unlocked,
        'contests_unlocked': contests_unlocked,
        'next_unlock': next_unlock,
        'stats': {
            'easy_solved': easy_solved,
            'medium_solved': medium_solved,
            'rating': round(rating, 1) if rating is not None else None,
            'level': level,
        },
    }
