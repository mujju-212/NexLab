"""
NexLab Canonical Metric Layer.
Defines every atomic and composite metric once.
Pure functions (testable without Flask request context).
"""
import math
import statistics
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional
from collections import defaultdict
from sqlalchemy import func

from app.extensions import db
from app.models.knowledge import ConceptMastery, FocusScore
from app.models.grading import Grade, HintLog
from app.models.submission import CodeAttempt
from app.models.session import LabSession, SessionAttendance
from app.models.academic import SectionSubject, SectionStudent
from app.models.proctor_event import ProctorEvent


def resolve_window(from_date: Optional[str] = None,
                   to_date: Optional[str] = None,
                   days: Optional[int] = None) -> Tuple[datetime, datetime, int]:
    """
    Shared window resolver for all analytics endpoints.
    Returns (start_datetime, end_datetime, days_count).
    """
    now = datetime.utcnow()
    if from_date and to_date:
        try:
            start = datetime.strptime(from_date[:10], '%Y-%m-%d')
            end = datetime.strptime(to_date[:10], '%Y-%m-%d') + timedelta(days=1, microseconds=-1)
            days_count = max(1, (end - start).days)
            return start, end, days_count
        except Exception:
            pass

    d = int(days) if days else 30
    d = max(1, min(730, d))
    start = now - timedelta(days=d)
    return start, now, d


def _metric_box(value: float, sample_size: int, min_sample_size: int = 3, window_days: int = 30) -> Dict[str, Any]:
    """
    Wrap a metric with confidence metadata.

    P2: a metric with no sample is ``None`` — never a neutral prior. Callers that
    build composites must renormalise over ``is_available`` factors instead of
    imputing a value (see app/analytics/composite.py).
    """
    has_value = value is not None
    return {
        'value': round(float(value), 2) if has_value else None,
        'sample_size': int(sample_size),
        'window_days': int(window_days),
        'is_available': bool(has_value),
        'is_sufficient': bool(has_value and sample_size >= min_sample_size),
    }


def compute_student_atomic_metrics(
    student_id: str,
    institution_id: str,
    window_start: Optional[datetime] = None,
    window_end: Optional[datetime] = None,
    min_sample_size: int = 3,
    halflife_days: int = 30,
    now: Optional[datetime] = None,
    experiment_ids: Optional[List[str]] = None,
    session_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Compute atomic metrics for a single student."""
    res = batch_student_atomic_metrics(
        student_ids=[student_id],
        institution_id=institution_id,
        window_start=window_start,
        window_end=window_end,
        min_sample_size=min_sample_size,
        halflife_days=halflife_days,
        now=now,
        experiment_ids=experiment_ids,
        session_ids=session_ids,
    )
    return res.get(student_id, {})


def batch_student_atomic_metrics(
    student_ids: List[str],
    institution_id: str,
    window_start: Optional[datetime] = None,
    window_end: Optional[datetime] = None,
    min_sample_size: int = 3,
    halflife_days: int = 30,
    now: Optional[datetime] = None,
    experiment_ids: Optional[List[str]] = None,
    session_ids: Optional[List[str]] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    High-performance batch loader for atomic student metrics.
    Runs bounded bulk queries instead of N+1 per student.
    """
    if not student_ids:
        return {}

    curr_time = now or datetime.utcnow()
    if window_end is None:
        window_end = curr_time
    if window_start is None:
        window_start = window_end - timedelta(days=90)
    window_days = max(1, (window_end - window_start).days)
    ln2 = math.log(2)
    hl = max(1, halflife_days)

    # ── 1. Mastery: recency-weighted avg and concept breadth ───────────────
    mastery_rows = ConceptMastery.query.filter(
        ConceptMastery.institution_id == institution_id,
        ConceptMastery.student_id.in_(student_ids),
        ConceptMastery.experiment_count > 0,
        ConceptMastery.mastery_score.isnot(None),
    ).all()

    mastery_map = defaultdict(list)
    for row in mastery_rows:
        score = float(row.mastery_score or 0.0)
        dt = row.last_updated or curr_time
        age_days = max(0.0, (curr_time - dt).total_seconds() / 86400.0)
        decay_weight = math.exp(-ln2 * age_days / hl)
        mastery_map[row.student_id].append({
            'score': score,
            'weight': decay_weight,
            'concept': row.concept,
        })

    # ── 2. Grades: avg, slope, consistency ─────────────────────────────────
    grade_filters = [
        Grade.student_id.in_(student_ids),
        Grade.created_at >= window_start,
        Grade.created_at <= window_end,
        Grade.final_grade.isnot(None),
    ]
    if experiment_ids is not None:
        grade_filters.append(Grade.experiment_id.in_(experiment_ids) if experiment_ids else db.literal(False))

    grade_rows = Grade.query.filter(*grade_filters).order_by(Grade.created_at.asc()).all()

    grade_map = defaultdict(list)
    experiment_cache = {}
    for g in grade_rows:
        if not g.experiment_id:
            continue
        exp = experiment_cache.get(g.experiment_id)
        if exp is None:
            exp = db.session.get(Experiment, g.experiment_id)
            if exp is not None:
                experiment_cache[g.experiment_id] = exp
        if not exp or not exp.grade_scale or exp.grade_scale <= 0 or not exp.weightage or exp.weightage <= 0:
            continue
        normalized = max(0.0, min(100.0, float(g.final_grade) / float(exp.grade_scale) * 100.0))
        grade_map[g.student_id].append({
            'grade': normalized, 'weight': float(exp.weightage),
            'timestamp': g.created_at or window_start,
        })

    # ── 3. Attendance & Effort ─────────────────────────────────────────────
    # Expected sessions for students in window
    # Join SessionAttendance with LabSession
    att_filters = [
        SessionAttendance.student_id.in_(student_ids),
        LabSession.institution_id == institution_id,
        LabSession.scheduled_at >= window_start,
        LabSession.scheduled_at <= window_end,
        LabSession.status != 'cancelled',
    ]
    if session_ids is not None:
        att_filters.append(LabSession.id.in_(session_ids) if session_ids else db.literal(False))

    att_rows = db.session.query(
        SessionAttendance.student_id,
        SessionAttendance.status,
        SessionAttendance.total_time_seconds,
        SessionAttendance.session_id,
    ).join(
        LabSession, SessionAttendance.session_id == LabSession.id
    ).filter(*att_filters).all()

    att_map = defaultdict(list)
    for r in att_rows:
        att_map[r.student_id].append({
            'status': r.status,
            'seconds': r.total_time_seconds or 0,
        })

    # ── 4. Focus Scores ───────────────────────────────────────────────────
    focus_rows = db.session.query(
        FocusScore.student_id,
        FocusScore.focus_score,
    ).filter(
        FocusScore.student_id.in_(student_ids),
        FocusScore.recorded_at >= window_start,
        FocusScore.recorded_at <= window_end,
        FocusScore.focus_score.isnot(None),
    ).all()

    focus_map = defaultdict(list)
    for f in focus_rows:
        focus_map[f.student_id].append(float(f.focus_score))

    # ── 5. Code Attempts & Efficiency & Recency ───────────────────────────
    # Recent attempts for recency days
    recent_attempts = db.session.query(
        CodeAttempt.student_id,
        func.max(CodeAttempt.submitted_at).label('last_submit'),
    ).filter(
        CodeAttempt.student_id.in_(student_ids),
    ).group_by(CodeAttempt.student_id).all()

    last_submit_map = {}
    for r in recent_attempts:
        if r.last_submit:
            diff_days = max(0.0, (curr_time - r.last_submit).total_seconds() / 86400.0)
            last_submit_map[r.student_id] = diff_days

    # Attempts in window for efficiency
    attempt_rows = db.session.query(
        CodeAttempt.student_id,
        CodeAttempt.experiment_id,
        func.count(CodeAttempt.id).label('attempt_count'),
    ).filter(
        CodeAttempt.student_id.in_(student_ids),
        CodeAttempt.submitted_at >= window_start,
        CodeAttempt.submitted_at <= window_end,
    ).group_by(CodeAttempt.student_id, CodeAttempt.experiment_id).all()

    eff_map = defaultdict(list)
    for a in attempt_rows:
        eff_map[a.student_id].append(a.attempt_count)

    # ── 6. Proctor Events & Integrity ─────────────────────────────────────
    proctor_rows = db.session.query(
        ProctorEvent.student_id,
        ProctorEvent.severity,
        ProctorEvent.event_type,
    ).filter(
        ProctorEvent.institution_id == institution_id,
        ProctorEvent.student_id.in_(student_ids),
        ProctorEvent.recorded_at >= window_start,
        ProctorEvent.recorded_at <= window_end,
    ).all()

    proctor_map = defaultdict(list)
    for p in proctor_rows:
        proctor_map[p.student_id].append({
            'severity': (p.severity or 'medium').lower(),
            'event_type': p.event_type,
        })

    # ── 7. AI Hints / Reliance ────────────────────────────────────────────
    hint_rows = db.session.query(
        HintLog.student_id,
        func.count(HintLog.id).label('hint_count'),
    ).filter(
        HintLog.student_id.in_(student_ids),
        HintLog.created_at >= window_start,
        HintLog.created_at <= window_end,
    ).group_by(HintLog.student_id).all()

    hint_map = {r.student_id: r.hint_count for r in hint_rows}

    # ── Assemble Metrics per Student ──────────────────────────────────────
    results = {}
    for sid in student_ids:
        # A. Mastery
        m_items = mastery_map.get(sid, [])
        m_sample = len(m_items)
        if m_sample > 0:
            sum_weighted = sum(x['score'] * x['weight'] for x in m_items)
            sum_weights = sum(x['weight'] for x in m_items) or 1.0
            mastery_avg_val = sum_weighted / sum_weights
            mastery_breadth_val = len({x['concept'] for x in m_items})
        else:
            mastery_avg_val = None
            mastery_breadth_val = None

        # B. Grades
        g_items = grade_map.get(sid, [])
        g_sample = len(g_items)
        if g_sample > 0:
            g_vals = [x['grade'] for x in g_items]
            g_weights = [x['weight'] for x in g_items]
            grade_avg_val = sum(v * w for v, w in zip(g_vals, g_weights)) / sum(g_weights) if sum(g_weights) else None
            consistency_val = max(0.0, 100.0 - statistics.stdev(g_vals)) if g_sample >= 2 else None

            # OLS Slope (points change per week)
            if g_sample >= 2:
                t_weeks = [(x['timestamp'] - window_start).total_seconds() / (7 * 86400.0) for x in g_items]
                t_mean = statistics.mean(t_weeks)
                y_mean = statistics.mean(g_vals)
                numerator = sum((t_weeks[i] - t_mean) * (g_vals[i] - y_mean) for i in range(g_sample))
                denominator = sum((t_weeks[i] - t_mean) ** 2 for i in range(g_sample))
                grade_trend_val = numerator / denominator if denominator > 1e-6 else None
            else:
                grade_trend_val = 0.0
        else:
            grade_avg_val = None
            consistency_val = None
            grade_trend_val = None

        # C. Attendance & Effort
        att_items = att_map.get(sid, [])
        att_sample = len(att_items)
        equiv_weights = {
            'present': 1.0,
            'late': 0.8,
            'partial': 0.6,
            'inactive_present': 0.5,
            'absent': 0.0,
        }
        if att_sample > 0:
            equiv_sum = sum(equiv_weights.get(x['status'], 0.0) for x in att_items)
            attendance_rate_val = min(100.0, (equiv_sum / att_sample) * 100.0)
            # Attendance rows carry `seconds` only when the session actually
            # measured active time. A sum of 0 means "unmeasured", not "the
            # student did nothing", so effort stays None instead of 0.
            total_seconds = sum(x['seconds'] or 0 for x in att_items)
            effort_hours_val = (total_seconds / 3600.0) if total_seconds > 0 else None
        else:
            attendance_rate_val = None
            effort_hours_val = None

        # D. Focus
        f_items = focus_map.get(sid, [])
        f_sample = len(f_items)
        focus_avg_val = statistics.mean(f_items) if f_sample > 0 else None

        # E. Efficiency (attempts curve)
        eff_items = eff_map.get(sid, [])
        eff_sample = len(eff_items)
        if eff_sample > 0:
            avg_attempts = statistics.mean(eff_items)
            # 1 attempt = 100, 2 attempts = 85, 3 = 70...
            efficiency_val = max(0.0, min(100.0, 100.0 - (avg_attempts - 1.0) * 15.0))
        else:
            efficiency_val = None  # no code attempts -> not measured

        # F. Submission Recency
        recency_days_val = last_submit_map.get(sid)

        # G. Integrity & Proctoring
        p_items = proctor_map.get(sid, [])
        p_sample = len(p_items)
        sev_weights = {'high': 3.0, 'medium': 2.0, 'low': 1.0}
        weighted_violations = sum(sev_weights.get(x['severity'], 1.0) for x in p_items)
        integrity_score_val = max(0.0, 100.0 - min(100.0, weighted_violations * 10.0))

        # H. AI Reliance
        hint_count = hint_map.get(sid, 0)
        exps_attempted = eff_sample or 1
        ai_reliance_val = min(100.0, (hint_count / exps_attempted) * 25.0)

        results[sid] = {
            'student_id': sid,
            'window': {'start': window_start.isoformat(), 'end': window_end.isoformat(), 'days': window_days},
            'mastery_avg': _metric_box(mastery_avg_val, m_sample, min_sample_size, window_days),
            'mastery_breadth': _metric_box(mastery_breadth_val, m_sample, 1, window_days),
            'grade_avg': _metric_box(grade_avg_val, g_sample, min_sample_size, window_days),
            'grade_trend': _metric_box(grade_trend_val, g_sample, 2, window_days),
            'consistency': _metric_box(consistency_val, g_sample, min_sample_size, window_days),
            'attendance_rate': _metric_box(attendance_rate_val, att_sample, min_sample_size, window_days),
            'effort_hours': _metric_box(effort_hours_val, att_sample, 1, window_days),
            'focus_avg': _metric_box(focus_avg_val, f_sample, min_sample_size, window_days),
            'efficiency': _metric_box(efficiency_val, eff_sample, 1, window_days),
            'submission_recency_days': _metric_box(recency_days_val, 1 if sid in last_submit_map else 0, 1, window_days),
            'integrity_score': _metric_box(integrity_score_val, p_sample, 1, window_days),
            'integrity_violations': _metric_box(weighted_violations, p_sample, 1, window_days),
            'ai_reliance': _metric_box(ai_reliance_val, hint_count, 1, window_days),
        }

    return results
