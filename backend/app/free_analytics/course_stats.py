"""
Free User Course Statistics & Certificate Eligibility Engine
Computes per-course completion %, exercises solved/total, XP earned,
and certificate eligibility (100% completion) across the curated catalog.
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from collections import defaultdict

from app.extensions import db
from app.models.free import FreeCourse, FreeExercise, FreeProgress


def get_user_course_analytics(user_id: str) -> Dict[str, Any]:
    """
    Computes comprehensive course progress rollups and certificate eligibility
    for a free / self-signup user across all published courses.
    """
    # 1. Fetch all published courses ordered by order_index
    courses = FreeCourse.query.filter_by(is_published=True).order_by(FreeCourse.order_index.asc()).all()

    # 2. Fetch all progress records for this user
    progress_records = FreeProgress.query.filter_by(user_id=user_id).all()
    prog_by_course = defaultdict(list)
    for p in progress_records:
        prog_by_course[p.course_id].append(p)

    course_items: List[Dict[str, Any]] = []
    total_exercises_catalog = 0
    total_exercises_solved = 0
    total_course_xp = 0
    enrolled_count = 0
    completed_count = 0
    certificates: List[Dict[str, Any]] = []

    for course in courses:
        # Exercises in this course
        published_exercises = course.exercises.filter_by(is_published=True).all()
        exercise_count = len(published_exercises)
        total_exercises_catalog += exercise_count

        total_xp_possible = sum(ex.xp_reward or 10 for ex in published_exercises)

        user_progs = prog_by_course.get(course.id, [])
        solved_progs = [p for p in user_progs if p.status == 'solved']
        attempted_progs = [p for p in user_progs if p.status == 'attempted']

        solved_count = len(solved_progs)
        attempted_count = len(attempted_progs)
        course_xp = sum(p.xp_earned or 0 for p in user_progs)

        total_exercises_solved += solved_count
        total_course_xp += course_xp

        pct = round((float(solved_count) / max(1, float(exercise_count))) * 100.0, 1) if exercise_count > 0 else 0.0
        cert_eligible = (exercise_count > 0 and solved_count >= exercise_count)

        if solved_count > 0 or attempted_count > 0:
            enrolled_count += 1

        completed_at = None
        if cert_eligible:
            completed_count += 1
            # Latest solved_at timestamp
            solved_times = [p.solved_at for p in solved_progs if p.solved_at]
            completed_at = max(solved_times).isoformat() if solved_times else datetime.utcnow().isoformat()
            cert_id = f"NEX-{course.slug.upper()[:12]}-{user_id[:8].upper()}"
            certificates.append({
                'certificate_id': cert_id,
                'course_id': course.id,
                'course_title': course.title,
                'course_slug': course.slug,
                'completed_at': completed_at,
                'verification_slug': f"cert-{cert_id.lower()}",
            })
        else:
            cert_id = None

        course_items.append({
            'id': course.id,
            'slug': course.slug,
            'title': course.title,
            'description': course.description,
            'thumbnail_url': course.thumbnail_url,
            'difficulty': course.difficulty,
            'tags': course.tags or [],
            'language': course.language,
            'exercise_count': exercise_count,
            'solved_count': solved_count,
            'attempted_count': attempted_count,
            'xp_earned': course_xp,
            'total_xp_possible': total_xp_possible,
            'completion_pct': pct,
            'cert_eligible': cert_eligible,
            'certificate_id': cert_id,
            'completed_at': completed_at,
        })

    # Sort courses: active first, then display order
    course_items.sort(key=lambda c: (c['completion_pct'] == 0, -c['completion_pct']))

    overall_pct = round((float(total_exercises_solved) / max(1, float(total_exercises_catalog))) * 100.0, 1)

    return {
        'total_courses': len(courses),
        'enrolled_courses': enrolled_count,
        'completed_courses': completed_count,
        'total_exercises_catalog': total_exercises_catalog,
        'total_exercises_solved': total_exercises_solved,
        'total_course_xp': total_course_xp,
        'overall_completion_pct': overall_pct,
        'certificates': certificates,
        'courses': course_items,
    }
