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
from app.analytics.metrics import compute_student_atomic_metrics, batch_student_atomic_metrics


_RANK_CACHE: Dict[tuple, tuple] = {}
_RANK_CACHE_TTL = 300  # 5 minutes cache


RANK_WEIGHTS = {
    'mastery': 0.30,
    'engagement': 0.20,
    'effort': 0.20,
    'efficiency': 0.15,
    'consistency': 0.15,
}


def score_students(student_ids, institution_id, all_metrics, users_map):
    """
    The ONE implementation of the holistic 5-factor score.

    Every surface (student card, cohort leaderboard, instructor rankings,
    institution rollups) goes through this function, so the same student can
    never hold two different composite scores.
    """
    from app.analytics.composite import metric_value, weighted_composite

    candidates, unranked = [], []
    for sid in student_ids:
        u = users_map.get(sid)
        display_name = (u.full_name if (u and getattr(u, 'full_name', None))
                        else (getattr(u, 'name', None) if u else None)) or 'Student'
        m = all_metrics.get(sid, {})

        mastery = metric_value(m.get('mastery_avg'))
        grade = metric_value(m.get('grade_avg'))
        att_box = m.get('attendance_rate')
        att_rate = metric_value(att_box)
        # One session attended or missed is an observation, not an engagement
        # rate. With a single-session sample, a 94% student who missed one lab
        # scored engagement 0 and fell below a 37% student in the class rank.
        if isinstance(att_box, dict) and 0 < (att_box.get('sample_size') or 0) < 3:
            att_rate = None
        focus = metric_value(m.get('focus_avg'))
        if att_rate is not None and focus is not None:
            engagement = att_rate * 0.4 + focus * 0.6
        elif att_rate is not None:
            engagement = att_rate
        elif focus is not None:
            engagement = focus
        else:
            engagement = None

        hours = metric_value(m.get('effort_hours'))
        effort = min(100.0, (hours / 40.0) * 100.0) if hours is not None else None
        efficiency = metric_value(m.get('efficiency'))
        consistency = metric_value(m.get('consistency'))

        # Mastery and grade measure the same construct (academic performance);
        # they differ only in instrumentation. Mastery is the preferred signal,
        # and grade stands in for its 0.30 weight when knowledge tracing has no
        # data yet. Without this, the composite had NO academic term at all and
        # a student failing every lab at 37% but with tightly clustered marks
        # outranked one averaging 82% on consistency alone.
        academic = mastery if mastery is not None else grade

        composite = weighted_composite(
            {'mastery': academic, 'engagement': engagement, 'effort': effort,
             'efficiency': efficiency, 'consistency': consistency},
            RANK_WEIGHTS,
        )

        row = {
            'student_id': sid,
            'name': display_name,
            'student_name': display_name,
            'full_name': display_name,
            'roll_number': getattr(u, 'roll_number', None) if u else None,
            'avatar_url': getattr(u, 'profile_pic_url', None) if u else None,
            'mastery_score': None if mastery is None else round(mastery, 1),
            'grade_score': None if grade is None else round(grade, 1),
            'academic_basis': 'mastery' if mastery is not None else ('grade' if grade is not None else None),
            'engagement_score': None if engagement is None else round(engagement, 1),
            'effort_score': None if effort is None else round(effort, 1),
            'efficiency_score': None if efficiency is None else round(efficiency, 1),
            'consistency_score': None if consistency is None else round(consistency, 1),
            'rank_score': composite['score'],
            'score_coverage': composite['coverage'],
            'score_factors_available': composite['available'],
            'score_factors_missing': composite['missing'],
        }
        (candidates if row['rank_score'] is not None else unranked).append(row)
    return candidates, unranked


def rank_positions(candidates, unranked, cohort_size, min_cohort: int = 5):
    """Attach rank position + (only when meaningful) percentile."""
    from app.analytics.composite import percentile_of

    candidates.sort(key=lambda x: x['rank_score'], reverse=True)
    population = [c['rank_score'] for c in candidates]

    results, current_pos = [], 1
    for idx, c in enumerate(candidates):
        if idx > 0 and c['rank_score'] < candidates[idx - 1]['rank_score']:
            current_pos = idx + 1
        c['rank_position'] = current_pos
        c['cohort_size'] = cohort_size
        c['percentile'] = percentile_of(c['rank_score'], population, min_cohort=min_cohort)
        c['percentile_available'] = c['percentile'] is not None
        results.append(c)

    for c in unranked:
        c['rank_position'] = None
        c['cohort_size'] = cohort_size
        c['percentile'] = None
        c['percentile_available'] = False
        results.append(c)
    return results


def compute_section_subject_ranks(section_subject_id: str, institution_id: str, persist: bool = True):
    """
    Canonical ranking for one section-subject cohort.
    Used by the student's own rankings view and by the instructor ranking tab.
    """
    from app.models.academic import SectionSubject, SectionStudent
    from app.models.experiment import Experiment
    from app.models.knowledge import StudentRanking

    ss = db.session.get(SectionSubject, section_subject_id)
    if not ss:
        return []

    section_students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
    student_ids = [x.student_id for x in section_students]
    if not student_ids:
        return []

    exp_ids = [e.id for e in Experiment.query.filter_by(
        subject_id=ss.subject_id, instructor_id=ss.instructor_id
    ).all()]

    # Same window as the scope engine ('live' == 90 days) so both surfaces
    # produce the identical score for the identical student.
    window_end = datetime.utcnow()
    window_start = window_end - timedelta(days=90)

    all_metrics = batch_student_atomic_metrics(
        student_ids=student_ids,
        institution_id=institution_id,
        window_start=window_start,
        window_end=window_end,
        experiment_ids=exp_ids or None,
    )
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()}
    candidates, unranked = score_students(student_ids, institution_id, all_metrics, users_map)
    results = rank_positions(candidates, unranked, len(student_ids))

    if persist:
        _persist_student_rankings(results, section_subject_id, institution_id)
    return results


def _persist_student_rankings(results, section_subject_id: str, institution_id: str):
    """Write-through cache of the canonical scores into student_rankings."""
    from app.models.knowledge import StudentRanking
    try:
        existing = {
            r.student_id: r for r in StudentRanking.query.filter_by(
                section_subject_id=section_subject_id
            ).all()
        }
        for c in results:
            row = existing.get(c['student_id'])
            if row is None:
                row = StudentRanking(
                    student_id=c['student_id'],
                    section_subject_id=section_subject_id,
                    institution_id=institution_id,
                )
                db.session.add(row)
            if c['rank_score'] is not None:
                row.mastery_score = c['mastery_score']
                row.engagement_score = c['engagement_score']
                row.effort_score = c['effort_score']
                row.efficiency_score = c['efficiency_score']
                row.consistency_score = c['consistency_score']
                row.rank_score = c['rank_score']
            else:
                row.mastery_score = row.engagement_score = row.effort_score = None
                row.efficiency_score = row.consistency_score = row.rank_score = None
            row.rank_position = c['rank_position']
            row.updated_at = datetime.utcnow()
        db.session.commit()
    except Exception:
        db.session.rollback()


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

    exp_scope_ids = entities.get('experiment_ids') or None
    sess_scope_ids = entities.get('session_ids') or None

    # High performance batch metric computation (replaces slow N+1 single queries)
    all_metrics = batch_student_atomic_metrics(
        student_ids=student_ids,
        institution_id=institution_id,
        window_start=window_start,
        window_end=window_end,
        experiment_ids=exp_scope_ids,
        session_ids=sess_scope_ids,
    )

    # Bulk load submission counts in 1 query (scoped if experiment_ids present)
    sub_query = db.session.query(CodeAttempt.student_id, func.count(CodeAttempt.id)).filter(
        CodeAttempt.student_id.in_(student_ids)
    )
    if exp_scope_ids:
        sub_query = sub_query.filter(CodeAttempt.experiment_id.in_(exp_scope_ids))
    sub_counts = dict(sub_query.group_by(CodeAttempt.student_id).all()) if student_ids else {}

    users_map = {
        u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()
    } if student_ids else {}

    candidates, unranked = score_students(
        student_ids, institution_id, all_metrics, users_map
    )

    results = rank_positions(candidates, unranked, cohort_size, min_cohort=5)

    # Bulk upsert snapshots in 1 query
    try:
        existing_snaps = {
            s.student_id: s
            for s in RankSnapshot.query.filter(
                RankSnapshot.student_id.in_(student_ids),
                RankSnapshot.scope_level == scope_level,
                RankSnapshot.scope_id == scope_id,
                RankSnapshot.period == period,
            ).all()
        } if student_ids else {}

        for c in results:
            sid = c['student_id']
            pct = c['percentile']
            snap = existing_snaps.get(sid)
            if not snap:
                snap = RankSnapshot(
                    institution_id=institution_id,
                    student_id=sid,
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

    from app.analytics.composite import percentile_of

    candidates, unranked = [], []
    for sid in student_ids:
        score = grade_map.get(sid)
        row = {
            'student_id': sid,
            # Experiment scope ranks on the grade itself; the other four
            # components of the holistic model are not defined for a single
            # experiment, so they are reported as not measured rather than
            # filled with 100/0.
            'mastery_score': None if score is None else round(score, 1),
            'engagement_score': None,
            'effort_score': None,
            'efficiency_score': None,
            'consistency_score': None,
            'rank_score': None if score is None else round(score, 2),
            'score_coverage': 1.0 if score is not None else 0.0,
            'score_factors_available': ['grade'] if score is not None else [],
            'score_factors_missing': [] if score is not None else ['grade'],
        }
        (candidates if row['rank_score'] is not None else unranked).append(row)

    candidates.sort(key=lambda x: x['rank_score'], reverse=True)
    population = [c['rank_score'] for c in candidates]
    results, current_pos = [], 1
    for idx, c in enumerate(candidates):
        if idx > 0 and c['rank_score'] < candidates[idx - 1]['rank_score']:
            current_pos = idx + 1
        c['rank_position'] = current_pos
        c['cohort_size'] = cohort_size
        c['percentile'] = percentile_of(c['rank_score'], population, min_cohort=5)
        c['percentile_available'] = c['percentile'] is not None
        results.append(c)
    for c in unranked:
        c['rank_position'] = None
        c['cohort_size'] = cohort_size
        c['percentile'] = None
        c['percentile_available'] = False
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
                    # Which signal filled the academic slot (mastery when
                    # knowledge tracing has data, otherwise grade).
                    'academic_basis': st_sec.get('academic_basis'),
                    'grade': st_sec.get('grade_score'),
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
    inst_pct = ranks.get('institution', {}).get('percentile')
    # No percentile (cohort too small) => no approximated platform position.
    plat_pos = (
        max(1, int((1.0 - inst_pct / 100.0) * platform_total) + 1)
        if isinstance(inst_pct, (int, float)) else None
    )
    ranks['platform'] = {
        'scope_id': None,
        'scope_name': 'Global Platform Leaderboard',
        'position': plat_pos,
        'cohort_size': platform_total,
        'percentile': inst_pct,
        'rank_score': student_score,
    }

    return ranks
