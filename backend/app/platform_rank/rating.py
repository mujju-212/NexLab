"""
Platform Rating Engine (Track 2)
Computes competitive difficulty-weighted rating, anti-farming single-solve credit,
recency decay, and global platform rank/percentiles.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import func, desc
from app.extensions import db
from app.models.practice import Problem, PracticeSubmission, StudentXP, PlatformRating, PlatformRatingPeriod
from app.models.user import User

DIFFICULTY_BASE = {
    'Easy': 10.0,
    'Medium': 30.0,
    'Hard': 70.0,
}


def compute_student_platform_rating(student_id: str, commit: bool = True) -> Dict[str, Any]:
    """
    Computes difficulty-weighted rating for a student across all distinct solved practice problems:
    Formula: RATING = Σ_over_first_accepted( base[diff] × quality × recency )
    Guarantees anti-farming: multiple accepted runs on the same problem only count once.
    """
    now = datetime.utcnow()
    ninety_days_ago = now - timedelta(days=90)

    # 1. Fetch all accepted submissions for this student, ordered by submitted_at ASC
    accepted_subs = (
        PracticeSubmission.query
        .filter(
            PracticeSubmission.student_id == student_id,
            PracticeSubmission.status == 'Accepted',
            PracticeSubmission.is_run == False,
        )
        .order_by(PracticeSubmission.submitted_at.asc())
        .all()
    )

    # 2. De-duplicate by problem_id: only take the FIRST accepted solve per problem
    first_solves: Dict[str, PracticeSubmission] = {}
    for sub in accepted_subs:
        if sub.problem_id not in first_solves:
            first_solves[sub.problem_id] = sub

    # 3. Fetch all solved course exercises from FreeProgress (Track 2 unified)
    from app.models.free import FreeProgress, FreeExercise
    course_solves = (
        db.session.query(FreeProgress, FreeExercise)
        .join(FreeExercise, FreeProgress.exercise_id == FreeExercise.id)
        .filter(
            FreeProgress.user_id == student_id,
            FreeProgress.status == 'solved',
        )
        .all()
    )

    BASE_RATING = 1000.0

    if not first_solves and not course_solves:
        # Initial baseline rating for new student
        rating_rec = PlatformRating.query.get(student_id)
        if not rating_rec:
            rating_rec = PlatformRating(student_id=student_id, rating=BASE_RATING)
            db.session.add(rating_rec)
        else:
            rating_rec.rating = BASE_RATING
            rating_rec.problems_solved = 0
            rating_rec.easy_solved = 0
            rating_rec.medium_solved = 0
            rating_rec.hard_solved = 0

        if commit:
            db.session.commit()

        return {
            'student_id': student_id,
            'rating': BASE_RATING,
            'problems_solved': 0,
            'easy_solved': 0,
            'medium_solved': 0,
            'hard_solved': 0,
            'global_rank': None,
            'global_percentile': 0.0,
        }

    # 4. Load library problems in bulk
    problem_ids = list(first_solves.keys())
    problems = {p.id: p for p in Problem.query.filter(Problem.id.in_(problem_ids)).all()} if problem_ids else {}

    total_xp_earned = 0.0
    easy_count = 0
    medium_count = 0
    hard_count = 0

    # 4a. Score practice problem first-solves
    for pid, sub in first_solves.items():
        problem = problems.get(pid)
        if not problem:
            continue

        diff = (problem.difficulty or 'Easy').capitalize()
        if diff == 'Easy':
            easy_count += 1
        elif diff == 'Medium':
            medium_count += 1
        elif diff == 'Hard':
            hard_count += 1

        base = DIFFICULTY_BASE.get(diff, 10.0)

        # Quality factor: test cases passed ratio + acceptance difficulty scaling
        passed_ratio = float(sub.passed or 1) / max(1, float(sub.total or 1))
        # Harder problem (lower acceptance) gives slight bonus up to +20%
        acceptance = float(problem.acceptance or 0.5)
        acceptance_bonus = max(0.0, min(0.2, (0.7 - acceptance) * 0.4))
        quality = max(0.5, min(1.2, passed_ratio + acceptance_bonus))

        # Recency factor: 1.0 for last 90 days, decays smoothly to 0.7 for older solves
        sub_time = sub.submitted_at or now
        days_old = max(0, (now - sub_time).days)
        if days_old <= 90:
            recency = 1.0
        else:
            # decays from 1.0 down to 0.7 over 1 year
            recency = max(0.7, 1.0 - ((days_old - 90) / 275.0) * 0.3)

        problem_rating = base * quality * recency
        total_xp_earned += problem_rating

    # 4b. Score course exercise solves (anti-farming: each exercise unique per user)
    for prog, ex in course_solves:
        diff = (ex.difficulty or 'Easy').capitalize()
        if diff == 'Easy':
            easy_count += 1
        elif diff == 'Medium':
            medium_count += 1
        elif diff == 'Hard':
            hard_count += 1

        base = DIFFICULTY_BASE.get(diff, 10.0)

        # Quality factor: best score + first-try bonus
        score = float(prog.best_score or 100.0)
        score_ratio = (score / 100.0) if score > 1.0 else max(0.5, score)
        first_try_bonus = 1.1 if (prog.attempts or 1) == 1 else 1.0
        quality = max(0.5, min(1.2, score_ratio * first_try_bonus))

        # Recency factor
        solved_time = prog.solved_at or prog.created_at or now
        days_old = max(0, (now - solved_time).days)
        if days_old <= 90:
            recency = 1.0
        else:
            recency = max(0.7, 1.0 - ((days_old - 90) / 275.0) * 0.3)

        exercise_rating = base * quality * recency
        total_xp_earned += exercise_rating

    # 4c. Anti-farming protection: single-solve credit de-duplicates by problem_id so repeat solves earn 0 XP
    anti_farming_penalty = 0.0

    total_solved = len(first_solves) + len(course_solves)
    if total_solved == 0:
        total_rating = 0.0
    else:
        # Formula: Rating = 1000.0 + sum(BaseXP * RecencyWeight) - AntiFarmingPenalty
        total_rating = round(max(500.0, BASE_RATING + total_xp_earned - anti_farming_penalty), 1)

    # 5. Save/update PlatformRating
    rating_rec = PlatformRating.query.get(student_id)
    if not rating_rec:
        rating_rec = PlatformRating(student_id=student_id)
        db.session.add(rating_rec)

    rating_rec.rating = total_rating
    rating_rec.problems_solved = total_solved
    rating_rec.easy_solved = easy_count
    rating_rec.medium_solved = medium_count
    rating_rec.hard_solved = hard_count
    rating_rec.updated_at = now

    # Also keep StudentXP counters in sync if present
    xp = StudentXP.query.filter_by(student_id=student_id).first()
    if xp:
        xp.problems_solved = total_solved
        xp.easy_solved = easy_count
        xp.medium_solved = medium_count
        xp.hard_solved = hard_count
        rating_rec.streak_days = xp.streak_days or 0

    # Fast O(1) indexed rank calculation for this user without scanning all rows in Python
    if total_solved > 0 and total_rating > 0:
        db.session.flush()
        higher_cnt = PlatformRating.query.filter(
            PlatformRating.problems_solved > 0,
            PlatformRating.rating > total_rating,
        ).count()
        total_ranked = max(1, PlatformRating.query.filter(PlatformRating.problems_solved > 0).count())
        rating_rec.global_rank = higher_cnt + 1
        rating_rec.global_percentile = round(100.0 * (1.0 - (float(higher_cnt) / float(total_ranked))), 1)
    else:
        rating_rec.global_rank = None
        rating_rec.global_percentile = 0.0

    if commit:
        db.session.commit()

    return {
        'student_id': student_id,
        'rating': total_rating,
        'problems_solved': total_solved,
        'easy_solved': easy_count,
        'medium_solved': medium_count,
        'hard_solved': hard_count,
        'global_rank': rating_rec.global_rank,
        'global_percentile': rating_rec.global_percentile,
    }


def update_all_platform_ranks() -> int:
    """
    Ranks all platform users by rating DESC and updates global_rank and global_percentile.
    Users with 0 solves or 0 rating remain unranked (global_rank=None, percentile=0.0).
    """
    ratings = PlatformRating.query.order_by(PlatformRating.rating.desc()).all()
    if not ratings:
        return 0

    ranked_users = [r for r in ratings if (r.problems_solved or 0) > 0 and (r.rating or 0.0) > 0]
    unranked_users = [r for r in ratings if (r.problems_solved or 0) == 0 or (r.rating or 0.0) <= 0]
    n = len(ranked_users)

    for i, rec in enumerate(ranked_users):
        rank = i + 1
        percentile = round(100.0 * (1.0 - (float(rank - 1) / max(1, n))), 1)
        rec.global_rank = rank
        rec.global_percentile = percentile

    for rec in unranked_users:
        rec.global_rank = None
        rec.global_percentile = 0.0

    db.session.commit()
    return len(ratings)


def get_student_platform_standing(student_id: str) -> Dict[str, Any]:
    """
    Retrieves complete Track-2 platform standing for a student including:
      - Current rating, level, level_name, next_level_xp
      - Global rank position and global percentile
      - Solved count breakdown by difficulty
      - Streak, badges list
      - Rank movement delta from previous period
    """
    # Ensure rating is initialized
    rating_rec = PlatformRating.query.get(student_id)
    if not rating_rec:
        compute_student_platform_rating(student_id, commit=True)
        rating_rec = PlatformRating.query.get(student_id)

    # Fallback rank calculation if uncomputed
    if rating_rec and ((rating_rec.problems_solved or 0) == 0 or (rating_rec.rating or 0.0) <= 0):
        rating_rec.global_rank = None
        rating_rec.global_percentile = 0.0
    elif rating_rec and (rating_rec.global_rank is None or rating_rec.global_rank == 0):
        higher = PlatformRating.query.filter(
            PlatformRating.problems_solved > 0,
            PlatformRating.rating > rating_rec.rating
        ).count()
        total = max(1, PlatformRating.query.filter(PlatformRating.problems_solved > 0).count())
        rating_rec.global_rank = higher + 1
        rating_rec.global_percentile = round(100.0 * (1.0 - (float(higher) / float(total))), 1)

    xp = StudentXP.query.filter_by(student_id=student_id).first()
    from app.models.practice import xp_to_level, LEVELS, StudentBadge
    total_xp = xp.total_xp if xp else 0
    level, level_name = xp_to_level(total_xp)

    next_xp = None
    for lvl_num, lvl_nm, req in LEVELS:
        if req > total_xp:
            next_xp = req
            break

    # Badges earned
    badges = [b.to_dict() for b in StudentBadge.query.filter_by(student_id=student_id).all()]

    # Rank movement from last weekly period
    last_period = (
        PlatformRatingPeriod.query
        .filter_by(student_id=student_id, period_type='weekly')
        .order_by(desc(PlatformRatingPeriod.created_at))
        .first()
    )
    rank_movement = 0
    if last_period and last_period.rank_pos and rating_rec and rating_rec.global_rank:
        # positive means moved up in rank (e.g. from 50 to 40 = +10)
        rank_movement = last_period.rank_pos - rating_rec.global_rank

    is_unranked = not rating_rec or (rating_rec.problems_solved or 0) == 0 or (rating_rec.rating or 0.0) <= 0

    return {
        'student_id': student_id,
        'rating': 0.0 if is_unranked else round(float(rating_rec.rating or 0.0), 1),
        'level': level,
        'level_name': level_name,
        'total_xp': total_xp,
        'next_level_xp': next_xp,
        'global_rank': None if is_unranked else rating_rec.global_rank,
        'global_percentile': 0.0 if is_unranked else round(float(rating_rec.global_percentile or 0.0), 1),
        'rank_movement': 0 if is_unranked else rank_movement,
        'problems_solved': 0 if is_unranked else (rating_rec.problems_solved if rating_rec else 0),
        'easy_solved': 0 if is_unranked else (rating_rec.easy_solved if rating_rec else 0),
        'medium_solved': 0 if is_unranked else (rating_rec.medium_solved if rating_rec else 0),
        'hard_solved': 0 if is_unranked else (rating_rec.hard_solved if rating_rec else 0),
        'streak_days': xp.streak_days if xp else 0,
        'badges': badges,
    }
