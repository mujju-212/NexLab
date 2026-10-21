"""
Practice Topic Mastery Engine (Track 2)
Computes topic-level proficiency and strength from practice problem submissions.
"""
from typing import Dict, Any, List
from collections import defaultdict
from app.extensions import db
from app.models.practice import Problem, PracticeSubmission


def get_practice_topic_mastery(student_id: str) -> List[Dict[str, Any]]:
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
    subs = (
        db.session.query(PracticeSubmission, Problem)
        .join(Problem, PracticeSubmission.problem_id == Problem.id)
        .filter(PracticeSubmission.student_id == student_id, PracticeSubmission.is_run == False)
        .all()
    )

    # 2. Fetch course exercise records from FreeProgress (Track 2 unified)
    from app.models.free import FreeProgress, FreeExercise, FreeCourse
    course_records = (
        db.session.query(FreeProgress, FreeExercise, FreeCourse)
        .join(FreeExercise, FreeProgress.exercise_id == FreeExercise.id)
        .join(FreeCourse, FreeProgress.course_id == FreeCourse.id)
        .filter(FreeProgress.user_id == student_id)
        .all()
    )

    if not subs and not course_records:
        # Return default topics with 0 strength
        topics_query = db.session.query(Problem.nexlab_topic).distinct().all()
        known_topics = [t[0] for t in topics_query if t[0]]
        return [
            {
                'topic': top,
                'strength': 0.0,
                'band': 'Needs Practice',
                'solved_by_difficulty': {'Easy': 0, 'Medium': 0, 'Hard': 0},
                'total_solved': 0,
                'total_attempted': 0,
                'accuracy_pct': 0.0,
            }
            for top in (known_topics or ['Arrays', 'Strings', 'Linked Lists', 'Trees', 'Dynamic Programming'])
        ]

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
        top = prob.nexlab_topic or 'General'
        diff = (prob.difficulty or 'Easy').capitalize()

        td = topic_data[top]
        td['attempted_pids'].add(prob.id)
        td['total_subs'] += 1
        td['total_passed_cases'] += (sub.passed or 0)
        td['total_test_cases'] += max(1, (sub.total or 1))

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
        diff = (ex.difficulty or 'Easy').capitalize()

        for tag in course_tags:
            top_name = str(tag).strip().title()
            td = topic_data[top_name]
            td['attempted_pids'].add(f"course_ex_{ex.id}")
            attempts = (prog.attempts or 1)
            td['total_subs'] += attempts
            best_score = float(prog.best_score or 0.0)
            td['total_passed_cases'] += int(round(best_score))
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
        solve_strength = min(100.0, round((raw_pts / 15.0) * 100.0, 1))

        # Test case pass ratio: passed / total
        pass_ratio = round(100.0 * (data['total_passed_cases'] / max(1, data['total_test_cases'])), 1)
        # Combined practice strength: blends test case passing ratio and difficulty solve coverage
        if total_solved > 0:
            strength = round(0.5 * pass_ratio + 0.5 * solve_strength, 1)
        else:
            strength = pass_ratio

        if strength >= 80:
            band = 'Mastered'
        elif strength >= 60:
            band = 'Proficient'
        elif strength >= 30:
            band = 'Learning'
        else:
            band = 'Needs Practice'

        acc = round(100.0 * (data['accepted_subs'] / max(1, data['total_subs'])), 1)

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
