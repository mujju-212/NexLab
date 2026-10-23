"""
NexLab Unified Student Risk Engine.
Replaces conflicting at-risk definitions with a single explainable 0–100 risk model.
"""
from typing import Dict, Any, List, Optional
from app.models.analytics_config import DEFAULT_RISK_WEIGHTS, DEFAULT_RISK_BANDS


def compute_student_risk(
    student_metrics: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
    previous_risk: Optional[float] = None
) -> Dict[str, Any]:
    """
    Compute Unified Risk Score (0–100, higher = more at risk) for student s in Cohort:
    R(s) = 0.30 * (100 - G_s) + 0.25 * (100 - A_s) + 0.20 * (100 - M_s) + 0.15 * (100 - F_s) + 0.10 * D_recency

    G_s: Average Grade from Grade.final_grade across required experiments
    A_s: Attendance Rate (sum(attended) / total scheduled) * 100 from SessionAttendance
    M_s: Concept Mastery Average (mean of mastery_score across concepts) from ConceptMastery
    F_s: Session Focus Score from FocusScore.focus_score
    D_recency: Penalty based on days since last code attempt min(100, days_idle * 10)
    """
    cfg = config or {}
    weights = dict(cfg.get('risk_weights') or DEFAULT_RISK_WEIGHTS)
    bands = dict(cfg.get('risk_bands') or DEFAULT_RISK_BANDS)

    # Component weights (defaults: 0.30 grade, 0.25 attendance, 0.20 mastery, 0.15 focus, 0.10 recency)
    w_sum = sum(weights.values()) or 1.0
    w_norm = {k: v / w_sum for k, v in weights.items()}
    w_grade = w_norm.get('grade', 0.30)
    w_att = w_norm.get('attendance', 0.25)
    w_mastery = w_norm.get('mastery', 0.20)
    w_focus = w_norm.get('focus', 0.15)
    w_recency = w_norm.get('recency', 0.10)

    # Extract component values (bounded to 0–100). P2/P4: a factor with no
    # sample is absent, not zero and not a neutral prior — and the composite
    # renormalises over whatever remains.
    from app.analytics.composite import metric_value, weighted_composite

    grade_v = metric_value(student_metrics.get('grade_avg'))
    att_v = metric_value(student_metrics.get('attendance_rate'))

    # One lab session is an observation, not an attendance *rate*. Until there
    # are enough sessions to mean something, attendance is reported but kept out
    # of the composite — otherwise a single missed lab (0% of 1) pushed a 94%
    # student into the "high risk" band while a 37% student who turned up
    # dropped to "ok".
    MIN_ATT_SESSIONS = 3
    att_sample = student_metrics.get('attendance_sessions')
    if att_sample is None:
        _att_box = student_metrics.get('attendance_rate')
        if isinstance(_att_box, dict):
            att_sample = _att_box.get('sample_size')
    attendance_is_thin = bool(att_sample is not None and att_sample < MIN_ATT_SESSIONS)
    if attendance_is_thin:
        att_v = None
    mastery_v = metric_value(student_metrics.get('mastery_avg'))
    focus_v = metric_value(student_metrics.get('focus_avg'))

    raw_recency = (
        metric_value(student_metrics.get('days_idle'))
        if metric_value(student_metrics.get('days_idle')) is not None
        else metric_value(student_metrics.get('submission_recency_days'))
    )
    days_idle = raw_recency
    d_recency = None if days_idle is None else min(100.0, max(0.0, days_idle * 10.0))

    def _bounded(v):
        return None if v is None else max(0.0, min(100.0, float(v)))

    g_s, a_s, m_s, f_s = _bounded(grade_v), _bounded(att_v), _bounded(mastery_v), _bounded(focus_v)

    components = {
        'grade': None if g_s is None else round(g_s, 2),
        'attendance': None if a_s is None else round(a_s, 2),
        'mastery': None if m_s is None else round(m_s, 2),
        'focus': None if f_s is None else round(f_s, 2),
        'recency': None if d_recency is None else round(d_recency, 2),
        'days_idle': None if days_idle is None else round(days_idle, 1),
    }

    # R(s) = weighted mean of the factor deficits, renormalised over the factors
    # that actually have data.
    deficits = {
        'grade': None if g_s is None else 100.0 - g_s,
        'attendance': None if a_s is None else 100.0 - a_s,
        'mastery': None if m_s is None else 100.0 - m_s,
        'focus': None if f_s is None else 100.0 - f_s,
        'recency': d_recency,
    }
    composite = weighted_composite(deficits, dict(weights))

    if composite['score'] is None:
        return {
            'risk_score': None,
            'risk_band': 'unknown',
            'is_at_risk': False,
            'primary_reason': 'Not enough activity to assess risk',
            'primary_component': None,
            'trend_arrow': 'stable',
            'risk_delta': None,
            'components': components,
            'risk_contributions': {},
            'weights': {k: round(v, 4) for k, v in w_norm.items()},
            'coverage': 0.0,
            'factors_used': [],
            'factors_missing': composite['missing'],
            'attendance_sessions': None if att_sample is None else int(att_sample),
            'attendance_thin': attendance_is_thin,
        }

    risk_score = round(max(0.0, min(100.0, composite['score'])), 1)


    crit_threshold = float(bands.get('critical', DEFAULT_RISK_BANDS['critical']))
    high_threshold = float(bands.get('high', DEFAULT_RISK_BANDS['high']))
    watch_threshold = float(bands.get('watch', DEFAULT_RISK_BANDS['watch']))

    if risk_score >= crit_threshold:
        band = 'critical'
    elif risk_score >= high_threshold:
        band = 'high'
    elif risk_score >= watch_threshold:
        band = 'watch'
    else:
        band = 'ok'

    # Explainability: contribution of each *used* factor to the deficit
    used_weights = composite['weights_used']
    risk_penalties = {
        k: round(used_weights.get(k, 0.0) * deficits[k], 2)
        for k in used_weights
        if deficits.get(k) is not None
    }

    reason_labels = {
        'grade': 'Low assessment grades',
        'attendance': 'Low session attendance',
        'mastery': 'Low concept mastery',
        'focus': 'Low lab session focus',
        'recency': 'Prolonged submission inactivity',
    }

    max_k = max(risk_penalties, key=lambda k: risk_penalties[k]) if risk_penalties else None
    primary_reason = (
        reason_labels.get(max_k, 'Multiple risk factors')
        if (risk_score >= watch_threshold and max_k)
        else 'On track'
    )

    # Trend vs previous snapshot
    trend_arrow = 'stable'
    risk_delta = None
    if previous_risk is not None:
        risk_delta = round(risk_score - previous_risk, 1)
        if risk_delta >= 3.0:
            trend_arrow = 'rising'
        elif risk_delta <= -3.0:
            trend_arrow = 'falling'

    return {
        'risk_score': risk_score,
        'risk_band': band,
        'is_at_risk': bool(band in ('critical', 'high')),
        'primary_reason': primary_reason,
        'primary_component': max_k if band != 'ok' else None,
        'trend_arrow': trend_arrow,
        'risk_delta': risk_delta,
        'components': components,
        'risk_contributions': risk_penalties,
        'weights': {k: round(v, 4) for k, v in w_norm.items()},
        'coverage': composite['coverage'],
        'factors_used': composite['available'],
        'factors_missing': composite['missing'],
        # Evidence metadata: how many sessions the attendance rate is based on,
        # and whether it was too thin to enter the score. Kept out of
        # `components` so the drawer's per-factor breakdown stays factor-only.
        'attendance_sessions': None if att_sample is None else int(att_sample),
        'attendance_thin': attendance_is_thin,
    }


def compute_cohort_risk_summary(
    students_with_risk: List[Dict[str, Any]],
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Aggregate cohort risk metrics, band distributions, and campus drivers."""
    total = len(students_with_risk)
    if total == 0:
        return {
            'total_students': 0,
            'at_risk_count': 0,
            'at_risk_pct': 0.0,
            'bands': {'critical': 0, 'high': 0, 'watch': 0, 'ok': 0},
            'band_percentages': {'critical': 0.0, 'high': 0.0, 'watch': 0.0, 'ok': 0.0},
            'avg_risk_score': 0.0,
            'top_risk_drivers': {},
        }

    band_counts = {'critical': 0, 'high': 0, 'watch': 0, 'ok': 0}
    reasons = {}
    measured_risk = []          # students whose risk could actually be computed
    unknown_count = 0

    for s in students_with_risk:
        r = s.get('risk', {})
        band = r.get('risk_band') or 'unknown'
        score = r.get('risk_score')
        # An unmeasured student is not a 0-risk student: count them apart.
        if not isinstance(score, (int, float)):
            unknown_count += 1
            continue
        band_counts[band] = band_counts.get(band, 0) + 1
        measured_risk.append(float(score))

        if band in ('critical', 'high', 'watch'):
            reason = r.get('primary_reason')
            if reason:
                reasons[reason] = reasons.get(reason, 0) + 1

    at_risk_count = band_counts['critical'] + band_counts['high']
    at_risk_pct = round((at_risk_count / total) * 100.0, 1)

    return {
        'total_students': total,
        'at_risk_count': at_risk_count,
        'at_risk_pct': at_risk_pct,
        'bands': band_counts,
        'band_percentages': {
            k: round((v / total) * 100.0, 1) for k, v in band_counts.items()
        },
        'avg_risk_score': round(sum(measured_risk) / len(measured_risk), 1) if measured_risk else None,
        'measured_students': len(measured_risk),
        'unknown_risk_students': unknown_count,
        'top_risk_drivers': reasons,
    }
