"""
Multi-Scope Ranking Engine:
Extends and standardizes holistic student rankings across 7 scopes:
  - experiment
  - subject
  - section
  - year
  - department
  - institution
  - platform

Formula (matches ml/ranking.py holistic model):
  rank_score = 0.30 * mastery + 0.20 * engagement + 0.20 * effort + 0.15 * efficiency + 0.15 * consistency
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy import func
from app.extensions import db
from app.models.user import User
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.models.grading import Grade
from app.models.submission import CodeAttempt
from app.models.session import LabSession, SessionAttendance
from app.models.academic import Section, SectionStudent, SectionSubject, Batch, Department
from app.models.analytics_rank import RankSnapshot
from app.analytics.scope import resolve_scope_entities
from app.analytics.metrics import compute_student_atomic_metrics


_RANK_CACHE: Dict[tuple, tuple] = {}
_RANK_CACHE_TTL = 180  # 3 minutes cache


def compute_rank_for_scope(
    scope_level: str,
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
    period: str = 'live',
) -> List[Dict]:
    """
    Computes holistic ranks for all students in the given scope, updates
    or inserts RankSnapshot rows, and returns the sorted leaderboard.
    """
    cache_key = (scope_level, str(scope_id or ''), str(institution_id or ''), period)
    now = datetime.utcnow()
    cached = _RANK_CACHE.get(cache_key)
    if cached:
        cached_ts, cached_data = cached
        if (now - cached_ts).total_seconds() < _RANK_CACHE_TTL:
            return cached_data

    entities = resolve_scope_entities(scope_level, scope_id, institution_id)
    student_ids = entities['student_ids']

    if not student_ids:
        # Fallback: if resolving yielded empty, grab all active students in institution
        if institution_id:
            users = User.query.filter_by(institution_id=institution_id, role='student', is_active=True).all()
            student_ids = [u.id for u in users]

    cohort_size = len(student_ids)
    if cohort_size == 0:
        return []

    # Experiment-wise special ranking: rank by Grade.final_grade directly
    if scope_level == 'experiment' and scope_id:
        return _compute_experiment_rank(scope_id, student_ids, institution_id, period)

    # Time window based on period
    window_end = datetime.utcnow()
    if period == 'semester':
        window_start = window_end - timedelta(days=180)
    elif period == 'year':
        window_start = window_end - timedelta(days=365)
    else:
        window_start = window_end - timedelta(days=90)

    # Compute 5 components for each student
    candidates = []
    for sid in student_ids:
        metrics = compute_student_atomic_metrics(
            sid,
            institution_id,
            window_start=window_start,
            window_end=window_end
        )
        mastery = float(metrics.get('mastery_avg', {}).get('value') or 0.0)
        att_rate = float(metrics.get('attendance_rate', {}).get('value') or 0.0)
        focus = float(metrics.get('focus_avg', {}).get('value') or 50.0)
        engagement = (att_rate * 0.4) + (focus * 0.6)
        effort_hours = float(metrics.get('effort_hours', {}).get('value') or 0.0)
        if effort_hours > 0:
            effort = min(100.0, (effort_hours / 40.0) * 100.0)
        else:
            sub_count = CodeAttempt.query.filter_by(student_id=sid).count()
            effort = min(100.0, float(sub_count) * 20.0)
        efficiency = float(metrics.get('efficiency', {}).get('value') or metrics.get('grade_avg', {}).get('value') or 50.0)
        consistency = float(metrics.get('consistency', {}).get('value') or 50.0)

        rank_score = (
            0.30 * mastery
            + 0.20 * engagement
            + 0.20 * effort
            + 0.15 * efficiency
            + 0.15 * consistency
        )

        candidates.append({
            'student_id': sid,
            'mastery_score': round(mastery, 1),
            'engagement_score': round(engagement, 1),
            'effort_score': round(effort, 1),
            'efficiency_score': round(efficiency, 1),
            'consistency_score': round(consistency, 1),
            'rank_score': round(rank_score, 2),
        })

    # Sort descending by rank_score
    candidates.sort(key=lambda x: x['rank_score'], reverse=True)

    # Compute dense positions & percentiles
    results = []
    current_pos = 1
    for idx, c in enumerate(candidates):
        if idx > 0 and c['rank_score'] < candidates[idx - 1]['rank_score']:
            current_pos = idx + 1
        pct = round(100.0 * (1.0 - (current_pos - 1) / max(1, cohort_size)), 1)
        c['rank_position'] = current_pos
        c['cohort_size'] = cohort_size
        c['percentile'] = pct
        results.append(c)

        # Upsert RankSnapshot
        try:
            snap = RankSnapshot.query.filter_by(
                student_id=c['student_id'],
                scope_level=scope_level,
                scope_id=scope_id,
                period=period,
            ).first()
            if not snap:
                snap = RankSnapshot(
                    institution_id=institution_id,
                    student_id=c['student_id'],
                    scope_level=scope_level,
                    scope_id=scope_id,
                    period=period,
                    mastery_score=c['mastery_score'],
                    engagement_score=c['engagement_score'],
                    effort_score=c['effort_score'],
                    efficiency_score=c['efficiency_score'],
                    consistency_score=c['consistency_score'],
                    rank_score=c['rank_score'],
                    rank_position=c['rank_position'],
                    cohort_size=cohort_size,
                    percentile=pct,
                )
                db.session.add(snap)
            else:
                snap.mastery_score = c['mastery_score']
                snap.engagement_score = c['engagement_score']
                snap.effort_score = c['effort_score']
                snap.efficiency_score = c['efficiency_score']
                snap.consistency_score = c['consistency_score']
                snap.rank_score = c['rank_score']
                snap.rank_position = c['rank_position']
                snap.cohort_size = cohort_size
                snap.percentile = pct
                snap.computed_at = datetime.utcnow()
        except Exception:
            pass

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()

    _RANK_CACHE[cache_key] = (now, results)
    return results


def _compute_experiment_rank(
    experiment_id: str,
    student_ids: List[str],
    institution_id: Optional[str],
    period: str = 'live',
) -> List[Dict]:
    """Experiment-level ranking: order students by Grade.final_grade."""
    grades = (
        Grade.query.filter(Grade.experiment_id == experiment_id)
        .all()
    )
    grade_map = {g.student_id: float(g.final_grade or 0.0) for g in grades}
    cohort_size = len(student_ids)

    candidates = []
    for sid in student_ids:
        score = grade_map.get(sid, 0.0)
        candidates.append({
            'student_id': sid,
            'mastery_score': score,
            'engagement_score': 100.0 if score > 0 else 0.0,
            'effort_score': 100.0 if score > 0 else 0.0,
            'efficiency_score': score,
            'consistency_score': 100.0,
            'rank_score': round(score, 2),
        })

    candidates.sort(key=lambda x: x['rank_score'], reverse=True)
    results = []
    current_pos = 1
    for idx, c in enumerate(candidates):
        if idx > 0 and c['rank_score'] < candidates[idx - 1]['rank_score']:
            current_pos = idx + 1
        pct = round(100.0 * (1.0 - (current_pos - 1) / max(1, cohort_size)), 1)
        c['rank_position'] = current_pos
        c['cohort_size'] = cohort_size
        c['percentile'] = pct
        results.append(c)

    return results


def get_student_all_ranks(student_id: str, institution_id: Optional[str]) -> Dict[str, Dict]:
    """
    Returns rankings across all relevant scopes for a single student:
      {
         'institution': { position, cohort_size, percentile, rank_score },
         'department':  { ... },
         'section':     { ... },
         'platform':    { ... }
      }
    """
    student = User.query.get(student_id)
    if not student:
        return {}

    iid = institution_id or student.institution_id
    ranks = {}

    # 1. Section Rank
    sec_link = SectionStudent.query.filter_by(student_id=student_id).first()
    if sec_link:
        sec_ranks = compute_rank_for_scope('section', sec_link.section_id, iid)
        st_sec = next((r for r in sec_ranks if r['student_id'] == student_id), None)
        if st_sec:
            sec_name = Section.query.get(sec_link.section_id).name if Section.query.get(sec_link.section_id) else 'Section'
            ranks['section'] = {
                'scope_id': sec_link.section_id,
                'scope_name': sec_name,
                'position': st_sec['rank_position'],
                'cohort_size': st_sec['cohort_size'],
                'percentile': st_sec['percentile'],
                'rank_score': st_sec['rank_score'],
                'components': {
                    'mastery': st_sec['mastery_score'],
                    'engagement': st_sec['engagement_score'],
                    'effort': st_sec['effort_score'],
                    'efficiency': st_sec['efficiency_score'],
                    'consistency': st_sec['consistency_score'],
                },
            }

    # 2. Department Rank
    if student.department_id:
        dept_ranks = compute_rank_for_scope('department', student.department_id, iid)
        st_dept = next((r for r in dept_ranks if r['student_id'] == student_id), None)
        if st_dept:
            dept_name = Department.query.get(student.department_id).name if Department.query.get(student.department_id) else 'Department'
            ranks['department'] = {
                'scope_id': student.department_id,
                'scope_name': dept_name,
                'position': st_dept['rank_position'],
                'cohort_size': st_dept['cohort_size'],
                'percentile': st_dept['percentile'],
                'rank_score': st_dept['rank_score'],
            }

    # 3. Institution Rank
    if iid:
        inst_ranks = compute_rank_for_scope('institution', None, iid)
        st_inst = next((r for r in inst_ranks if r['student_id'] == student_id), None)
        if st_inst:
            ranks['institution'] = {
                'scope_id': iid,
                'scope_name': 'Campus-Wide',
                'position': st_inst['rank_position'],
                'cohort_size': st_inst['cohort_size'],
                'percentile': st_inst['percentile'],
                'rank_score': st_inst['rank_score'],
            }

    # 4. Platform Rank
    platform_total = User.query.filter_by(role='student', is_active=True).count()
    student_score = ranks.get('institution', {}).get('rank_score', 50.0)
    higher_platform = (
        db.session.query(func.count(User.id))
        .filter(User.role == 'student', User.is_active == True)
        .scalar() or 1
    )
    # Approximate platform rank based on percentile if platform size is large
    inst_pct = ranks.get('institution', {}).get('percentile', 75.0)
    plat_pos = max(1, int((1.0 - inst_pct / 100.0) * platform_total) + 1)
    ranks['platform'] = {
        'scope_id': None,
        'scope_name': 'Global Platform Leaderboard',
        'position': plat_pos,
        'cohort_size': platform_total,
        'percentile': inst_pct,
        'rank_score': student_score,
    }

    return ranks
