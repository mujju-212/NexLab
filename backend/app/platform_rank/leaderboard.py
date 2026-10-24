"""
Platform Leaderboard Engine (Track 2)
Provides Global, Topic-specific, and Institution-scoped practice leaderboards
with period filtering (all-time, monthly, weekly) and tenant isolation.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy import func, desc, or_
from app.extensions import db
from app.models.user import User
from app.models.practice import Problem, PracticeSubmission, StudentXP, PlatformRating, PlatformRatingPeriod, xp_to_level
from app.platform_rank.rating import compute_student_platform_rating
from app.platform_rank.blended import expand_topic_aliases


def get_platform_leaderboard(
    scope: str = 'global',
    scope_id: Optional[str] = None,
    period: str = 'all_time',
    current_student_id: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    Builds the competitive Track-2 platform leaderboard.
    Scopes:
      - 'global': all platform students
      - 'topic': students ranked by solves in a specific nexlab_topic
      - 'institution': students belonging to institution_id (using platform rating only!)
    Periods:
      - 'all_time', 'monthly', 'weekly'
    """
    now = datetime.utcnow()

    # 1. Topic-scoped Leaderboard
    if scope == 'topic' and scope_id:
        # Calculate rating per student strictly for problems matching this nexlab_topic
        topic_subs = (
            db.session.query(
                PracticeSubmission.student_id,
                Problem.id.label('problem_id'),
                Problem.difficulty,
                PracticeSubmission.passed,
                PracticeSubmission.total,
                func.min(PracticeSubmission.submitted_at).label('first_solved'),
            )
            .join(Problem, PracticeSubmission.problem_id == Problem.id)
            .filter(
                Problem.nexlab_topic.in_(expand_topic_aliases(scope_id)),
                PracticeSubmission.status == 'Accepted',
                PracticeSubmission.is_run == False,
            )
            .group_by(PracticeSubmission.student_id, Problem.id, Problem.difficulty, PracticeSubmission.passed, PracticeSubmission.total)
            .all()
        )

        # Aggregate topic rating per student
        diff_weights = {'Easy': 10.0, 'Medium': 30.0, 'Hard': 70.0}
        student_topic_ratings: Dict[str, float] = {}
        student_solved_counts: Dict[str, int] = {}

        for row in topic_subs:
            sid = row.student_id
            diff = (row.difficulty or 'Easy').capitalize()
            score = diff_weights.get(diff, 10.0)
            student_topic_ratings[sid] = student_topic_ratings.get(sid, 0.0) + score
            student_solved_counts[sid] = student_solved_counts.get(sid, 0) + 1

        # Also blend course exercises matching this topic tag
        from app.models.free import FreeProgress, FreeExercise, FreeCourse
        free_course_solves = (
            db.session.query(
                FreeProgress.user_id,
                FreeExercise.id,
                FreeExercise.difficulty,
                FreeCourse.tags,
                FreeCourse.title,
            )
            .join(FreeExercise, FreeProgress.exercise_id == FreeExercise.id)
            .join(FreeCourse, FreeProgress.course_id == FreeCourse.id)
            .filter(FreeProgress.status == 'solved')
            .all()
        )
        for uid, ex_id, ex_diff, tags, ctitle in free_course_solves:
            tags_list = [str(t).strip().lower() for t in (tags or [])]
            if ctitle:
                tags_list.append(str(ctitle).strip().lower())
            if scope_id.strip().lower() in tags_list:
                diff = (ex_diff or 'Easy').capitalize()
                score = diff_weights.get(diff, 10.0)
                student_topic_ratings[uid] = student_topic_ratings.get(uid, 0.0) + score
                student_solved_counts[uid] = student_solved_counts.get(uid, 0) + 1

        # Sort students by topic score
        sorted_students = sorted(student_topic_ratings.items(), key=lambda x: x[1], reverse=True)
        cohort_size = len(sorted_students)

        # Load user display info
        user_ids = [s[0] for s in sorted_students[:limit]]
        if current_student_id and current_student_id not in user_ids:
            user_ids.append(current_student_id)

        users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}
        xps = {x.student_id: x for x in StudentXP.query.filter(StudentXP.student_id.in_(user_ids)).all()} if user_ids else {}

        leaderboard_items = []
        my_standing = None

        for idx, (sid, score) in enumerate(sorted_students):
            pos = idx + 1
            percentile = round(100.0 * (1.0 - (float(pos - 1) / max(1, cohort_size))), 1)

            u = users.get(sid)
            xp_rec = xps.get(sid)
            lvl, lvl_name = xp_to_level(xp_rec.total_xp if xp_rec else 0)

            # Tenant-fairness: zero academic data included
            item = {
                'position': pos,
                'student_id': sid,
                'student_name': u.name if u else 'Anonymous Coder',
                'full_name': u.name if u else 'Anonymous Coder',
                'name': u.name if u else 'Anonymous Coder',
                'avatar_url': getattr(u, 'avatar_url', None) if u else None,
                'profile_slug': xp_rec.profile_slug if (xp_rec and xp_rec.profile_public) else None,
                'rating': round(score, 1),
                'level': lvl,
                'level_name': lvl_name,
                'problems_solved': student_solved_counts.get(sid, 0),
                'percentile': percentile,
            }

            if sid == current_student_id:
                my_standing = item

            if pos <= limit:
                leaderboard_items.append(item)

        return {
            'scope': 'topic',
            'topic': scope_id,
            'period': period,
            'cohort_size': cohort_size,
            'leaderboard': leaderboard_items,
            'my_standing': my_standing,
        }

    # 2. Global or Institution-scoped Leaderboard
    q = db.session.query(PlatformRating, User, StudentXP).join(User, PlatformRating.student_id == User.id)
    q = q.outerjoin(StudentXP, PlatformRating.student_id == StudentXP.student_id)
    q = q.filter(PlatformRating.problems_solved > 0, PlatformRating.rating > 0)

    if scope == 'institution' and scope_id:
        q = q.filter(User.institution_id == scope_id)

    # Period filter
    if period == 'monthly':
        start_date = now - timedelta(days=30)
        q = q.filter(PlatformRating.updated_at >= start_date)
    elif period == 'weekly':
        start_date = now - timedelta(days=7)
        q = q.filter(PlatformRating.updated_at >= start_date)

    q = q.order_by(PlatformRating.rating.desc())
    all_rows = q.all()
    cohort_size = len(all_rows)

    leaderboard_items = []
    my_standing = None

    for idx, (rating_rec, u, xp_rec) in enumerate(all_rows):
        pos = idx + 1
        percentile = round(100.0 * (1.0 - (float(pos - 1) / max(1, cohort_size))), 1)
        lvl, lvl_name = xp_to_level(xp_rec.total_xp if xp_rec else 0)

        # Tenant-fairness: zero institution-private academic metrics leak into platform board
        item = {
            'position': pos,
            'student_id': u.id,
            'student_name': u.name,
            'full_name': u.name,
            'name': u.name,
            'avatar_url': getattr(u, 'avatar_url', None),
            'profile_slug': xp_rec.profile_slug if (xp_rec and xp_rec.profile_public) else None,
            'rating': round(float(rating_rec.rating or 0.0), 1),
            'level': lvl,
            'level_name': lvl_name,
            'problems_solved': rating_rec.problems_solved,
            'streak_days': rating_rec.streak_days,
            'percentile': percentile,
        }

        if u.id == current_student_id:
            my_standing = item

        if pos <= limit:
            leaderboard_items.append(item)

    # If current student is not in top limit, still include my_standing
    if not my_standing and current_student_id:
        st_rating = PlatformRating.query.get(current_student_id)
        if st_rating and (st_rating.problems_solved or 0) > 0 and (st_rating.rating or 0.0) > 0:
            st_user = User.query.get(current_student_id)
            st_xp = StudentXP.query.filter_by(student_id=current_student_id).first()
            lvl, lvl_name = xp_to_level(st_xp.total_xp if st_xp else 0)
            st_name = st_user.name if st_user else 'You'
            my_standing = {
                'position': st_rating.global_rank,
                'student_id': current_student_id,
                'student_name': st_name,
                'full_name': st_name,
                'name': st_name,
                'avatar_url': getattr(st_user, 'avatar_url', None) if st_user else None,
                'profile_slug': st_xp.profile_slug if (st_xp and st_xp.profile_public) else None,
                'rating': round(float(st_rating.rating or 0.0), 1),
                'level': lvl,
                'level_name': lvl_name,
                'problems_solved': st_rating.problems_solved,
                'streak_days': st_rating.streak_days,
                'percentile': round(float(st_rating.global_percentile), 1) if st_rating.global_percentile is not None else None,
            }

    return {
        'scope': scope,
        'period': period,
        'cohort_size': cohort_size,
        'leaderboard': leaderboard_items,
        'my_standing': my_standing,
    }
