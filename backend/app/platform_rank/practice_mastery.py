"""
Practice Topic Mastery Engine (Track 2)
Computes topic-level proficiency and strength from practice problem submissions.
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
from collections import defaultdict
from app.extensions import db
from app.models.practice import Problem, PracticeSubmission


def get_practice_topic_mastery(student_id: str, window_start: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Computes difficulty-weighted mastery strength across all practice topics
    for a given student.
    Returns:
      [{
        'topic': str,
        'strength': float (0-100),
        'band': 'Mastered' | 'Proficient' | 'Learning' | 'Needs Practice',
        'solved_by_difficulty': {'Easy': int, 'Medium': int, 'Hard': int},
        'total_solved': int,
        'total_attempted': int,
        'accuracy_pct': float,
      }]
    """
    # 1. Fetch practice submissions by this student
    sub_q = (
        db.session.query(PracticeSubmission, Problem)
        .join(Problem, PracticeSubmission.problem_id == Problem.id)
        .filter(PracticeSubmission.student_id == student_id, PracticeSubmission.is_run.is_(False))
    )
    if window_start is not None:
        sub_q = sub_q.filter(PracticeSubmission.submitted_at >= window_start)
    subs = sub_q.all()

    # 2. Fetch course exercise records from PlatformProgress (Track 2 unified)
    from app.models.platform_content import PlatformProgress, PlatformExercise, PlatformCourse
    course_records = (
        db.session.query(PlatformProgress, PlatformExercise, PlatformCourse)
        .join(PlatformExercise, PlatformProgress.exercise_id == PlatformExercise.id)
        .join(PlatformCourse, PlatformProgress.course_id == PlatformCourse.id)
        .filter(PlatformProgress.user_id == student_id)
    )
    if window_start is not None:
        course_q = course_records.filter(PlatformProgress.updated_at >= window_start)
        course_records = course_q.all()
    else:
        course_records = course_records.all()

    if not subs and not course_records:
        return []

    # Aggregate by topic
    topic_data = defaultdict(lambda: {
        'solved_pids': set(),
        'attempted_pids': set(),
        'easy_solved': 0,
        'medium_solved': 0,
        'hard_solved': 0,
        'total_subs': 0,
        'accepted_subs': 0,
        'total_passed_cases': 0,
        'total_test_cases': 0,
    })

    # 3a. Process practice library submissions
    for sub, prob in subs:
        top = (prob.nexlab_topic or '').strip()
        if not top:
            continue
        diff = (prob.difficulty or '').capitalize()

        td = topic_data[top]
        td['attempted_pids'].add(prob.id)
        td['total_subs'] += 1
        td['total_passed_cases'] += (sub.passed or 0)
        td['total_test_cases'] += max(0, int(sub.total or 0))

        if sub.status == 'Accepted':
            td['accepted_subs'] += 1
            if prob.id not in td['solved_pids']:
                td['solved_pids'].add(prob.id)
                if diff == 'Easy':
                    td['easy_solved'] += 1
                elif diff == 'Medium':
                    td['medium_solved'] += 1
                elif diff == 'Hard':
                    td['hard_solved'] += 1

    # 3b. Process course exercises
    for prog, ex, course in course_records:
        course_tags = course.tags if (course.tags and isinstance(course.tags, list)) else [course.title or 'Programming']
        diff = (ex.difficulty or '').capitalize()

        for tag in course_tags:
            top_name = str(tag or '').strip().title()
            if not top_name:
                continue
            td = topic_data[top_name]
            td['attempted_pids'].add(f"course_ex_{ex.id}")
            attempts = int(prog.attempts or 0)
            td['total_subs'] += attempts
            if prog.best_score is not None:
                td['total_passed_cases'] += int(round(float(prog.best_score)))
                td['total_test_cases'] += 100

            if prog.status == 'solved':
                td['accepted_subs'] += 1
                if f"course_ex_{ex.id}" not in td['solved_pids']:
                    td['solved_pids'].add(f"course_ex_{ex.id}")
                    if diff == 'Easy':
                        td['easy_solved'] += 1
                    elif diff == 'Medium':
                        td['medium_solved'] += 1
                    elif diff == 'Hard':
                        td['hard_solved'] += 1

    result = []
    for top, data in sorted(topic_data.items(), key=lambda x: x[0]):
        easy = data['easy_solved']
        med = data['medium_solved']
        hard = data['hard_solved']
        total_solved = len(data['solved_pids'])
        total_attempted = len(data['attempted_pids'])

        # Difficulty weighted score
        # e.g., 5 Easy + 3 Medium + 1 Hard = 5*1 + 3*2.5 + 1*5 = 17.5 points
        # Benchmark for 100% mastery = 15 points
        raw_pts = (easy * 1.0) + (med * 2.5) + (hard * 5.0)
        solve_strength = min(100.0, round((raw_pts / 15.0) * 100.0, 1)) if total_solved > 0 else None

        # Test case pass ratio: passed / total
        pass_ratio = round(100.0 * data['total_passed_cases'] / data['total_test_cases'], 1) if data['total_test_cases'] > 0 else None
        # Combine only measurements that exist; do not treat missing test-case
        # results as zero or infer an unrecorded solve score.
        measured = [v for v in (pass_ratio, solve_strength) if v is not None]
        if not measured:
            continue
        strength = round(sum(measured) / len(measured), 1)

        if strength >= 80:
            band = 'Mastered'
        elif strength >= 60:
            band = 'Proficient'
        elif strength >= 30:
            band = 'Learning'
        else:
            band = 'Needs Practice'

        acc = round(100.0 * data['accepted_subs'] / data['total_subs'], 1) if data['total_subs'] > 0 else None

        result.append({
            'topic': top,
            'strength': strength,
            'pass_ratio': pass_ratio,
            'band': band,
            'solved_by_difficulty': {'Easy': easy, 'Medium': med, 'Hard': hard},
            'total_solved': total_solved,
            'total_attempted': total_attempted,
            'accuracy_pct': acc,
        })

    return result
