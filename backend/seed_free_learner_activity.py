"""
seed_free_learner_activity.py
Populates rich, realistic analytics telemetry for free@nexlab.io
so all tabs (Hero, Overview, Ladder, Skills, Activity, Courses) display live, vibrant charts.
"""
from datetime import datetime, timedelta
import random

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.practice import (
    Problem,
    PracticeSubmission,
    StudentXP,
    StudentBadge,
    PlatformRating,
    BADGE_CATALOG,
    xp_to_level,
)
from app.models.free import FreeCourse, FreeExercise, FreeProgress
from app.platform_rank.rating import (
    compute_student_platform_rating,
    update_all_platform_ranks,
)

app = create_app()

with app.app_context():
    user = User.query.filter_by(email="free@nexlab.io").first()
    if not user:
        print("User free@nexlab.io not found!")
        exit(1)

    print(f"Seeding telemetry for: {user.full_name} ({user.id})")

    # 1. Ensure/Update StudentXP
    xp = StudentXP.query.filter_by(student_id=user.id).first()
    if not xp:
        xp = StudentXP(student_id=user.id)
        db.session.add(xp)

    xp.streak_days = 6
    xp.longest_streak = 12
    xp.last_active_date = datetime.utcnow().date()
    xp.profile_public = True
    xp.profile_slug = "free-learner"

    # 2. Add realistic Practice Submissions across diverse problems
    problems = Problem.query.all()
    if problems:
        print(f"Found {len(problems)} practice problems.")
        now = datetime.utcnow()
        # Seed 18 accepted submissions spread over the last 30 days
        for i, prob in enumerate(problems[:18]):
            existing_sub = PracticeSubmission.query.filter_by(
                student_id=user.id,
                problem_id=prob.id
            ).first()
            if not existing_sub:
                sub_date = now - timedelta(days=random.randint(0, 25), hours=random.randint(1, 12))
                sub = PracticeSubmission(
                    student_id=user.id,
                    problem_id=prob.id,
                    code="def solution():\n    return True\n",
                    language="python",
                    status="Accepted",
                    passed=5,
                    total=5,
                    time_ms=random.randint(45, 210),
                    memory_kb=random.randint(12000, 18000),
                    xp_earned=10 if prob.difficulty == "Easy" else (25 if prob.difficulty == "Medium" else 50),
                    submitted_at=sub_date,
                )
                db.session.add(sub)

    # 3. Add Badges
    earned_badges = ['first_solve', 'speed_demon', 'beginner_path']
    for b_id in earned_badges:
        if not StudentBadge.query.filter_by(student_id=user.id, badge_id=b_id).first():
            b = StudentBadge(
                student_id=user.id,
                badge_id=b_id,
                earned_at=datetime.utcnow() - timedelta(days=random.randint(1, 10)),
            )
            db.session.add(b)

    # 4. Add Course Progress via FreeExercise
    courses = FreeCourse.query.all()
    if courses:
        print(f"Found {len(courses)} free courses.")
        for i, c in enumerate(courses[:3]):
            exercises = FreeExercise.query.filter_by(course_id=c.id).order_by(FreeExercise.order_index).all()
            if not exercises:
                continue
            
            # For first course, solve all exercises
            # For second course, solve half
            count_to_solve = len(exercises) if i == 0 else max(1, len(exercises) // 2)
            for ex in exercises[:count_to_solve]:
                prog = FreeProgress.query.filter_by(user_id=user.id, exercise_id=ex.id).first()
                if not prog:
                    prog = FreeProgress(
                        user_id=user.id,
                        course_id=c.id,
                        exercise_id=ex.id,
                        status="completed",
                        attempts=1,
                        best_score=100.0,
                        xp_earned=ex.xp_reward or 20,
                        solved_at=datetime.utcnow() - timedelta(days=random.randint(1, 5)),
                    )
                    db.session.add(prog)

    db.session.commit()

    # 5. Recompute Platform Rating & Standings
    print("Computing updated Platform Rating...")
    compute_student_platform_rating(user.id, commit=True)
    update_all_platform_ranks()

    print("[SUCCESS] Free user analytics data seeded successfully!")
