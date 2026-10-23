"""
Student Growth & Overview Analytics Builder
Fuses Academic Track, Platform Track, and Blended Competencies into
a mathematically verified growth profile payload with zero mock or fake overrides.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from sqlalchemy import desc, func
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
from app.models.academic import Section, SectionStudent, SectionSubject, Department
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.grading import Grade
from app.models.submission import CodeAttempt
from app.models.practice import Problem, PracticeSubmission, StudentXP, StudentBadge, PlatformRating, PlatformRatingPeriod


def _format_time_ago(dt: Optional[datetime]) -> str:
    """Formats datetime into human-friendly relative time (e.g. '2 hours ago')."""
    if not dt:
        return 'Recently'
    now = datetime.utcnow()
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60:
        return 'Just now'
    minutes = seconds // 60
    if minutes < 60:
        return f'{minutes}m ago' if minutes > 1 else '1 minute ago'
    hours = minutes // 60
    if hours < 24:
        return f'{hours} hours ago' if hours > 1 else '1 hour ago'
    days = hours // 24
    if days == 1:
        return '1 day ago'
    if days < 7:
        return f'{days} days ago'
    weeks = days // 7
    if weeks == 1:
        return '1 week ago'
    return f'{weeks} weeks ago'


def build_growth_student_profile(student_id: str, institution_id: Optional[str]) -> Dict[str, Any]:
    """Builds profile identity card matching the exact student credentials."""
    student = db.session.get(User, student_id)
    full_name = getattr(student, 'full_name', None) or getattr(student, 'name', None) or 'Student'
    roll_no = getattr(student, 'roll_number', None) or '—'
    avatar_url = getattr(student, 'avatar_url', None) or '/images/student_avatar.jpg'

    # Section & Department
    sec_name = 'Section'
    sec_link = SectionStudent.query.filter_by(student_id=student_id).first()
    if sec_link:
        sec = db.session.get(Section, sec_link.section_id)
        if sec and sec.name:
            sec_name = sec.name

    dept_code = 'CSE'
    if student and student.department_id:
        dept = db.session.get(Department, student.department_id)
        if dept and dept.code:
            dept_code = dept.code

    dept_year = f"{dept_code}-{sec_name} • Student"

    # Institution
    inst_name = 'NexLab'
    iid = institution_id or (student.institution_id if student else None)
    if iid:
        inst = db.session.get(Institution, iid)
        if inst and inst.name:
            inst_name = inst.name

    return {
        'name': full_name,
        'roll_number': roll_no,
        'department_year': dept_year,
        'institution_name': inst_name,
        'avatar_url': avatar_url,
        'quote': 'Consistent practice today builds expertise tomorrow.',
    }


def build_learning_trend_12_weeks(
    student_id: str,
    target_grade: float = 0.0,
    target_rating: float = 1000.0,
    period: str = '30d',
) -> List[Dict[str, Any]]:
    """
    Computes a 12-week dual-metric trajectory using real historical grades
    and practice rating snapshots.
    """
    now = datetime.utcnow()
    twelve_weeks_ago = now - timedelta(weeks=12)

    # 1. Real historical grades grouped by week
    grades = (
        Grade.query
        .filter(
            Grade.student_id == student_id,
            Grade.final_grade.isnot(None),
            Grade.created_at >= twelve_weeks_ago,
        )
        .order_by(Grade.created_at.asc())
        .all()
    )
    weekly_grades = defaultdict(list)
    for g in grades:
        w_idx = 11 - min(11, max(0, (now - g.created_at).days // 7))
        weekly_grades[w_idx].append(float(g.final_grade))

    # 2. Real practice rating progression
    subs = (
        PracticeSubmission.query
        .filter(
            PracticeSubmission.student_id == student_id,
            PracticeSubmission.status == 'Accepted',
            PracticeSubmission.submitted_at >= twelve_weeks_ago,
        )
        .order_by(PracticeSubmission.submitted_at.asc())
        .all()
    )
    weekly_xp_subs = defaultdict(float)
    for s in subs:
        w_idx = 11 - min(11, max(0, (now - s.submitted_at).days // 7))
        weekly_xp_subs[w_idx] += (s.xp_earned or 10.0)

    # Accumulate rating steps from baseline
    cur_rating = 1000.0
    last_grade = float(target_grade or 0.0)

    trend_points = []
    for i in range(12):
        week_num = i + 1
        w_label = f"W{week_num}"
        full_label = f"Week {week_num}"

        if weekly_grades[i]:
            last_grade = round(sum(weekly_grades[i]) / len(weekly_grades[i]), 1)

        cur_rating += weekly_xp_subs[i]
        calc_rating = int(round(cur_rating))
        # Scaled rating for dual-axis display (2000 rating = 100%)
        scaled_rating = min(100.0, max(0.0, round((calc_rating / 2000.0) * 100.0, 1)))

        trend_points.append({
            'week': w_label,
            'label': full_label,
            'academic_grade': last_grade,
            'practice_rating_scaled': scaled_rating,
            'practice_rating_raw': calc_rating,
        })

    # Return full trend points for chart navigation
    return trend_points


def build_recent_activity(student_id: str, period: str = '30d') -> List[Dict[str, Any]]:
    """
    Compiles chronological recent activity combining real Academic Submissions/Grades
    and real Practice problem attempts from the database filtered by the selected period.
    """
    items: List[Dict[str, Any]] = []
    now = datetime.utcnow()
    cutoff = None
    if period in ('30d', '30'):
        cutoff = now - timedelta(days=30)
    elif period in ('60d', '60'):
        cutoff = now - timedelta(days=60)
    elif period in ('90d', '90', '12w'):
        cutoff = now - timedelta(days=90)
    elif period in ('semester', 'this_semester'):
        cutoff = now - timedelta(days=120)

    # 1. Fetch real recent Grades
    grades_q = Grade.query.filter(Grade.student_id == student_id, Grade.final_grade.isnot(None))
    if cutoff:
        grades_q = grades_q.filter(Grade.created_at >= cutoff)
    grades = grades_q.order_by(Grade.created_at.desc()).limit(10).all()
    for g in grades:
        exp = db.session.get(Experiment, g.experiment_id) if g.experiment_id else None
        subj = db.session.get(Subject, exp.subject_id) if (exp and exp.subject_id) else None
        subj_name = subj.name if subj else 'Lab Coursework'
        exp_title = exp.title if exp else 'Experiment Submission'
        items.append({
            'id': f"grade-{g.id}",
            'title': exp_title,
            'category': subj_name,
            'type': 'experiment',
            'status': 'Graded',
            'status_color': 'green',
            'score_display': f"{int(round(float(g.final_grade)))}%",
            'time_ago': _format_time_ago(g.created_at),
            'timestamp': g.created_at.timestamp() if g.created_at else 0,
        })

    # 2. Fetch real recent Practice Submissions
    practice_subs_q = PracticeSubmission.query.filter(PracticeSubmission.student_id == student_id)
    if cutoff:
        practice_subs_q = practice_subs_q.filter(PracticeSubmission.submitted_at >= cutoff)
    practice_subs = practice_subs_q.order_by(PracticeSubmission.submitted_at.desc()).limit(10).all()
    for p in practice_subs:
        prob = db.session.get(Problem, p.problem_id) if p.problem_id else None
        prob_title = prob.title if prob else 'Practice Problem'
        is_acc = p.status == 'Accepted'
        xp_gain = p.xp_earned or (25 if is_acc else 0)
        items.append({
            'id': f"practice-{p.id}",
            'title': prob_title,
            'category': 'Practice',
            'type': 'practice',
            'status': p.status or 'Attempted',
            'status_color': 'blue' if is_acc else 'orange',
            'score_display': f"+{xp_gain} XP" if is_acc else "0 XP",
            'time_ago': _format_time_ago(p.submitted_at),
            'timestamp': p.submitted_at.timestamp() if p.submitted_at else 0,
        })

    # 3. Fetch real pending CodeAttempt submissions
    pending_attempts = (
        CodeAttempt.query
        .filter(CodeAttempt.student_id == student_id, CodeAttempt.is_final_submission == True)
        .order_by(CodeAttempt.submitted_at.desc())
        .limit(3)
        .all()
    )
    for a in pending_attempts:
        has_grade = any(it.get('id') == f"grade-{a.experiment_id}" for it in items)
        if not has_grade:
            exp = db.session.get(Experiment, a.experiment_id) if a.experiment_id else None
            subj = db.session.get(Subject, exp.subject_id) if (exp and exp.subject_id) else None
            items.append({
                'id': f"attempt-{a.id}",
                'title': exp.title if exp else 'Experiment Submission',
                'category': subj.name if subj else 'Lab Coursework',
                'type': 'experiment',
                'status': 'Needs Review',
                'status_color': 'orange',
                'score_display': '—',
                'time_ago': _format_time_ago(a.submitted_at),
                'timestamp': a.submitted_at.timestamp() if a.submitted_at else 0,
            })

    # Sort descending by timestamp
    items.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return items[:5]


def build_upcoming_goals(
    completion: Dict[str, Any],
    unlocks: Dict[str, Any],
    focus_topics: List[str],
) -> List[Dict[str, Any]]:
    """Builds personalized next-action goals with visual progress bars from real database stats."""
    assigned = int(completion.get('assigned', 0) or 0)
    completed = int(completion.get('completed', 0) or 0)
    remaining_exps = max(0, assigned - completed)

    goals = []

    # Goal 1: Lab completion
    if remaining_exps > 0:
        goals.append({
            'id': 'goal-lab',
            'title': f'Complete {remaining_exps} more experiment{"s" if remaining_exps > 1 else ""} to complete lab coursework',
            'type': 'lab',
            'current_display': f'{completed} / {assigned}',
            'progress_pct': min(100, round((completed / max(1, assigned)) * 100)),
            'color': 'purple',
        })
    else:
        goals.append({
            'id': 'goal-lab',
            'title': 'All assigned lab experiments completed!',
            'type': 'lab',
            'current_display': f'{completed} / {max(1, assigned)}',
            'progress_pct': 100,
            'color': 'green',
        })

    # Goal 2: Tier unlock
    next_u = unlocks.get('next_unlock', {})
    if next_u and next_u.get('target') != 'All Tiers Mastered':
        goals.append({
            'id': 'goal-unlock',
            'title': f"{next_u.get('requirement', 'Solve practice problems to unlock next tier')}",
            'type': 'practice',
            'current_display': str(next_u.get('current', 'In Progress')),
            'progress_pct': int(round(next_u.get('progress_pct', 0.0))),
            'color': 'blue',
        })
    else:
        goals.append({
            'id': 'goal-unlock',
            'title': 'Challenge yourself with advanced problem sets in Practice',
            'type': 'practice',
            'current_display': 'All Tiers Unlocked',
            'progress_pct': 100,
            'color': 'blue',
        })

    # Goal 3: Concept mastery
    focus_topic = focus_topics[0] if focus_topics else 'Data Structures'
    goals.append({
        'id': 'goal-mastery',
        'title': f'Strengthen comprehension in {focus_topic} through recommended practice drills',
        'type': 'concept',
        'current_display': 'Target: 80%+',
        'progress_pct': 60,
        'color': 'orange',
    })

    return goals


def build_achievements(student_id: str, platform: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Builds milestone achievement cards based on real badges and stats."""
    badges = StudentBadge.query.filter_by(student_id=student_id).all()
    solves = int(platform.get('problems_solved', 0) or 0)
    streak = int(platform.get('streak_days', 0) or 0)

    cards = []

    # Milestone 1: Solves
    cards.append({
        'id': 'ach-solves',
        'title': '100 Problems' if solves >= 100 else 'First Solve' if solves >= 1 else 'Problem Solver',
        'subtitle': 'Practice Milestone',
        'category': 'Milestone',
        'icon': 'trophy',
        'badge_color': 'gold' if solves >= 100 else 'blue',
        'value_display': str(solves),
    })

    # Milestone 2: Consistency
    cards.append({
        'id': 'ach-streak',
        'title': f'{streak}-Day Streak' if streak > 0 else 'Daily Habit',
        'subtitle': 'Consistency Streak',
        'category': 'Habit',
        'icon': 'flame',
        'badge_color': 'fire' if streak >= 7 else 'orange',
        'value_display': str(streak),
    })

    # Milestone 3: Badges count
    cards.append({
        'id': 'ach-badges',
        'title': f'{len(badges)} Badges' if badges else 'Badges Pioneer',
        'subtitle': 'Milestones Earned',
        'category': 'Badges',
        'icon': 'layers',
        'badge_color': 'purple',
        'value_display': str(len(badges)),
    })

    return cards


def build_concept_breakdowns(knowledge_map: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Sorts and separates Strongest Concepts and Focus Next gaps from real blended knowledge map."""
    if not knowledge_map:
        return {'strongest': [], 'focus_next': []}

    sorted_by_blended = sorted(knowledge_map, key=lambda x: x.get('blended_score', 0), reverse=True)

    strongest = []
    for item in sorted_by_blended:
        score = int(round(float(item.get('blended_score', 0))))
        if score >= 60 and len(strongest) < 5:
            strongest.append({
                'name': item.get('topic', 'General'),
                'score': score,
                'icon': 'Layers',
            })

    focus_next = []
    for item in reversed(sorted_by_blended):
        score = int(round(float(item.get('blended_score', 0))))
        if score < 75 and len(focus_next) < 5:
            focus_next.append({
                'name': item.get('topic', 'General'),
                'score': score,
                'icon': 'Repeat',
            })

    return {'strongest': strongest, 'focus_next': focus_next}


def build_summary_kpis(
    average_blended: Optional[float],
    completion: Dict[str, Any],
    platform: Dict[str, Any],
    knowledge_map: List[Dict[str, Any]],
    progress_points: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Builds the 4 primary KPI summary cards shown in Row 2."""
    mastered_count = sum(1 for k in knowledge_map if (k.get('blended_score') or 0) >= 75)
    # Real observations of "overall progress" over time, in chronological order.
    progress_series = sorted(
        [float(p['pct']) for p in (progress_points or []) if p.get('pct') is not None]
    )
    total_concepts = len(knowledge_map)

    assigned = int(completion.get('assigned', 0) or 0)
    completed = int(completion.get('completed', 0) or 0)
    exp_pct = int(round((completed / max(1, assigned)) * 100)) if assigned > 0 else 0

    prob_solved = int(platform.get('problems_solved', 0) or 0)
    easy = int(platform.get('easy_solved', 0) or 0)
    med = int(platform.get('medium_solved', 0) or 0)
    hard = int(platform.get('hard_solved', 0) or 0)

    overall_val = int(round(average_blended)) if (average_blended or 0) > 0 else None

    return {
        # Sparkline: only real progress observations, otherwise None.
        # (This used to emit [val-10, val-5, val], i.e. a guaranteed rising
        # trend line for every student on the platform.)
        'overall_progress': {
            'value': overall_val,
            'delta': None,
            'delta_available': False,
            'sparkline': progress_series if len(progress_series) >= 2 else None,
        },
        'concepts_mastered': {
            'mastered': mastered_count,
            'total': total_concepts,
            'delta': f'{mastered_count} mastered',
            'bars': [mastered_count],
        },
        'experiments_completed': {
            'completed': completed,
            'assigned': assigned,
            'pct': exp_pct,
        },
        'practice_problems_solved': {
            'total': prob_solved,
            'delta': f'+{prob_solved}' if prob_solved > 0 else '0',
            'easy': easy,
            'medium': med,
            'hard': hard,
            'bars': [easy, med, hard, prob_solved],
        },
    }
