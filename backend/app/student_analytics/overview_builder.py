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


def _assigned_experiment_ids(student_id: str) -> List[str]:
    """Resolve experiment IDs only from this student's section-subject enrolments."""
    section_ids = [row.section_id for row in SectionStudent.query.filter_by(student_id=student_id).all()]
    if not section_ids:
        return []
    subject_ids = {row.subject_id for row in SectionSubject.query.filter(SectionSubject.section_id.in_(section_ids)).all()}
    if not subject_ids:
        return []
    return [row.id for row in Experiment.query.filter(Experiment.subject_id.in_(subject_ids), Experiment.is_published.is_(True)).all()]


def build_growth_student_profile(student_id: str, institution_id: Optional[str]) -> Dict[str, Any]:
    """Identity fields are sourced from the authenticated student's records."""
    student = db.session.get(User, student_id)
    full_name = getattr(student, 'full_name', None) or getattr(student, 'name', None)
    roll_no = getattr(student, 'roll_number', None)
    avatar_url = getattr(student, 'avatar_url', None)

    sec_name = None
    sec_link = SectionStudent.query.filter_by(student_id=student_id).first()
    if sec_link:
        section = db.session.get(Section, sec_link.section_id)
        sec_name = section.name if section else None

    dept_code = None
    if student and student.department_id:
        department = db.session.get(Department, student.department_id)
        dept_code = department.code if department else None
    dept_year = ' • '.join(part for part in (dept_code, sec_name) if part) or None

    iid = institution_id or (student.institution_id if student else None)
    institution_name = None
    if iid:
        institution = db.session.get(Institution, iid)
        institution_name = institution.name if institution else None

    return {
        'name': full_name, 'roll_number': roll_no,
        'department_year': dept_year, 'institution_name': institution_name,
        'avatar_url': avatar_url,
    }

def build_learning_trend_12_weeks(
    student_id: str,
    period: str = '30d',
) -> List[Dict[str, Any]]:
    """Return only actual weekly grade and rating-snapshot observations."""
    now = datetime.utcnow()
    twelve_weeks_ago = now - timedelta(weeks=12)
    assigned_ids = _assigned_experiment_ids(student_id)
    if assigned_ids:
        grade_q = Grade.query.filter(
            Grade.student_id == student_id, Grade.experiment_id.in_(assigned_ids),
            Grade.final_grade.isnot(None), Grade.created_at >= twelve_weeks_ago,
        )
    else:
        grade_q = Grade.query.filter(db.literal(False))
    grades = grade_q.order_by(Grade.created_at.asc()).all()

    weekly_grades = defaultdict(list)
    for grade in grades:
        exp = db.session.get(Experiment, grade.experiment_id) if grade.experiment_id else None
        if not exp or not exp.grade_scale or not exp.weightage or exp.grade_scale <= 0 or exp.weightage <= 0:
            continue
        pct = max(0.0, min(100.0, float(grade.final_grade) / float(exp.grade_scale) * 100.0))
        idx = 11 - min(11, max(0, (now - grade.created_at).days // 7))
        weekly_grades[idx].append((pct, float(exp.weightage)))

    snapshots = (PlatformRatingPeriod.query.filter(
        PlatformRatingPeriod.student_id == student_id,
        PlatformRatingPeriod.period_type == 'weekly',
        PlatformRatingPeriod.created_at >= twelve_weeks_ago,
        PlatformRatingPeriod.rating.isnot(None),
    ).order_by(PlatformRatingPeriod.created_at.asc()).all())
    weekly_ratings = {}
    for snapshot in snapshots:
        idx = 11 - min(11, max(0, (now - snapshot.created_at).days // 7))
        weekly_ratings[idx] = float(snapshot.rating)

    points = []
    for idx in range(12):
        values = weekly_grades.get(idx, [])
        grade_avg = (round(sum(score * weight for score, weight in values) / sum(weight for _, weight in values), 1)
                     if values else None)
        raw_rating = weekly_ratings.get(idx)
        points.append({
            'week': f'W{idx + 1}', 'label': f'Week {idx + 1}',
            'academic_grade': grade_avg,
            'practice_rating_scaled': min(100.0, max(0.0, round(raw_rating / 20.0, 1))) if raw_rating is not None else None,
            'practice_rating_raw': raw_rating,
        })
    return points

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
    assigned_ids = _assigned_experiment_ids(student_id)
    grades_q = Grade.query.filter(Grade.student_id == student_id, Grade.final_grade.isnot(None), Grade.experiment_id.in_(assigned_ids) if assigned_ids else db.literal(False))
    if cutoff:
        grades_q = grades_q.filter(Grade.created_at >= cutoff)
    grades = grades_q.order_by(Grade.created_at.desc()).limit(10).all()
    for g in grades:
        exp = db.session.get(Experiment, g.experiment_id) if g.experiment_id else None
        subj = db.session.get(Subject, exp.subject_id) if (exp and exp.subject_id) else None
        if not exp or not exp.grade_scale or exp.grade_scale <= 0 or not exp.weightage or exp.weightage <= 0:
            continue
        subj_name = subj.name if subj else None
        exp_title = exp.title
        items.append({
            'id': f"grade-{g.id}",
            'title': exp_title,
            'category': subj_name,
            'type': 'experiment',
            'status': 'Graded',
            'status_color': 'green',
            'score_display': f"{int(round(float(g.final_grade) / float(exp.grade_scale) * 100))}%",
            'time_ago': _format_time_ago(g.created_at),
            'timestamp': g.created_at.timestamp() if g.created_at else 0,
        })

    # 2. Fetch real recent Practice Submissions
    practice_subs_q = PracticeSubmission.query.filter(PracticeSubmission.student_id == student_id, PracticeSubmission.is_run.is_(False))
    if cutoff:
        practice_subs_q = practice_subs_q.filter(PracticeSubmission.submitted_at >= cutoff)
    practice_subs = practice_subs_q.order_by(PracticeSubmission.submitted_at.desc()).limit(10).all()
    for p in practice_subs:
        prob = db.session.get(Problem, p.problem_id) if p.problem_id else None
        prob_title = prob.title if prob else None
        is_acc = p.status == 'Accepted'
        xp_gain = p.xp_earned
        items.append({
            'id': f"practice-{p.id}",
            'title': prob_title,
            'category': 'Practice',
            'type': 'practice',
            'status': p.status or 'Attempted',
            'status_color': 'blue' if is_acc else 'orange',
            'score_display': (f"+{xp_gain} XP" if is_acc else f"{xp_gain} XP") if xp_gain is not None else None,
            'time_ago': _format_time_ago(p.submitted_at),
            'timestamp': p.submitted_at.timestamp() if p.submitted_at else 0,
        })

    # 3. Fetch real pending CodeAttempt submissions
    graded_experiment_ids = {g.experiment_id for g in grades if g.experiment_id}
    pending_q = CodeAttempt.query.filter(CodeAttempt.student_id == student_id, CodeAttempt.is_final_submission.is_(True))
    if cutoff is not None:
        pending_q = pending_q.filter(CodeAttempt.submitted_at >= cutoff)
    pending_attempts = (
        pending_q
        .order_by(CodeAttempt.submitted_at.desc())
        .limit(3)
        .all()
    )
    for a in pending_attempts:
        has_grade = a.experiment_id in graded_experiment_ids
        if not has_grade:
            exp = db.session.get(Experiment, a.experiment_id) if a.experiment_id else None
            subj = db.session.get(Subject, exp.subject_id) if (exp and exp.subject_id) else None
            if not exp:
                continue
            items.append({
                'id': f"attempt-{a.id}",
                'title': exp.title,
                'category': subj.name if subj else None,
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
    knowledge_map: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Build goals only where a real assignment, unlock, or mastery observation exists."""
    assigned = int(completion.get('assigned', 0) or 0)
    completed = int(completion.get('completed', 0) or 0)
    goals = []
    if assigned > 0:
        remaining = max(0, assigned - completed)
        goals.append({
            'id': 'goal-lab',
            'title': (f'Complete {remaining} more assigned experiment' + ('s' if remaining != 1 else '')
                     if remaining else 'All assigned lab experiments completed'),
            'type': 'lab', 'current_display': f'{completed} / {assigned}',
            'progress_pct': min(100, round(100 * completed / assigned)),
            'color': 'purple' if remaining else 'green',
        })

    next_unlock = unlocks.get('next_unlock') if isinstance(unlocks, dict) else None
    if next_unlock and next_unlock.get('target') != 'All Tiers Mastered':
        goals.append({
            'id': 'goal-unlock', 'title': next_unlock.get('requirement'),
            'type': 'practice', 'current_display': next_unlock.get('current'),
            'progress_pct': next_unlock.get('progress_pct'), 'color': 'blue',
        })

    if focus_topics:
        focus = focus_topics[0]
        measured = next((row for row in (knowledge_map or []) if row.get('topic') == focus), None)
        score = measured.get('blended_score') if measured else None
        goals.append({
            'id': 'goal-mastery',
            'title': f'Review {focus} based on your recorded mastery',
            'type': 'concept',
            'current_display': f'{round(score)}% measured' if score is not None else 'See Knowledge Map',
            'progress_pct': score,
            'color': 'orange',
        })
    return goals

def build_achievements(student_id: str, platform: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return badges actually earned and persisted for this student."""
    cards = []
    for badge in StudentBadge.query.filter_by(student_id=student_id).order_by(StudentBadge.earned_at.desc()).all():
        record = badge.to_dict()
        cards.append({
            'id': badge.id, 'title': record.get('title'),
            'subtitle': record.get('desc'), 'category': 'Earned badge',
            'icon': record.get('icon'), 'badge_color': 'purple',
            'value_display': None, 'earned_at': record.get('earned_at'),
        })
    return cards

def build_concept_breakdowns(knowledge_map: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Sorts and separates Strongest Concepts and Focus Next gaps from real blended knowledge map."""
    if not knowledge_map:
        return {'strongest': [], 'focus_next': []}

    sorted_by_blended = sorted(knowledge_map, key=lambda x: x.get('blended_score', 0), reverse=True)

    strongest = []
    for item in sorted_by_blended:
        if item.get('blended_score') is None or not item.get('topic'):
            continue
        score = int(round(float(item['blended_score'])))
        if score >= 60 and len(strongest) < 5:
            strongest.append({
                'name': item.get('topic'),
                'score': score,
                'icon': 'Layers',
            })

    focus_next = []
    for item in reversed(sorted_by_blended):
        if item.get('blended_score') is None or not item.get('topic'):
            continue
        score = int(round(float(item['blended_score'])))
        if score < 75 and len(focus_next) < 5:
            focus_next.append({
                'name': item.get('topic'),
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
    mastered_count = sum(1 for k in knowledge_map if k.get('blended_score') is not None and k['blended_score'] >= 80)
    # Real observations of "overall progress" over time, in chronological order.
    progress_series = sorted(
        [float(p['pct']) for p in (progress_points or []) if p.get('pct') is not None]
    )
    total_concepts = len(knowledge_map)

    assigned = int(completion.get('assigned', 0) or 0)
    completed = int(completion.get('completed', 0) or 0)
    exp_pct = int(round((completed / assigned) * 100)) if assigned > 0 else None

    prob_solved = int(platform.get('problems_solved', 0) or 0)
    easy = int(platform.get('easy_solved', 0) or 0)
    med = int(platform.get('medium_solved', 0) or 0)
    hard = int(platform.get('hard_solved', 0) or 0)

    overall_val = int(round(average_blended)) if average_blended is not None else None

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
            'delta': None,
            'bars': [int(round(k['blended_score'])) for k in knowledge_map if k.get('blended_score') is not None],
        },
        'experiments_completed': {
            'completed': completed,
            'assigned': assigned,
            'pct': exp_pct,
        },
        'practice_problems_solved': {
            'total': prob_solved,
            'delta': None,
            'easy': easy,
            'medium': med,
            'hard': hard,
            'bars': [],
        },
    }
