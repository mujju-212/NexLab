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

    # Extract component values (bounded to 0–100)
    grade_v = float(student_metrics.get('grade_avg', {}).get('value') or 0.0)
    att_v = float(student_metrics.get('attendance_rate', {}).get('value') or 0.0)
    mastery_v = float(student_metrics.get('mastery_avg', {}).get('value') or 0.0)
    focus_v = float(student_metrics.get('focus_avg', {}).get('value') or 0.0)

    # D_recency: min(100, days_idle * 10)
    days_idle = float(
        student_metrics.get('days_idle', {}).get('value') or
        student_metrics.get('submission_recency_days', {}).get('value') or
        student_metrics.get('recency_days', {}).get('value') or 0.0
    )
    d_recency = min(100.0, max(0.0, days_idle * 10.0))

    g_s = max(0.0, min(100.0, grade_v))
    a_s = max(0.0, min(100.0, att_v))
    m_s = max(0.0, min(100.0, mastery_v))
    f_s = max(0.0, min(100.0, focus_v))

    components = {
        'grade': round(g_s, 2),
        'attendance': round(a_s, 2),
        'mastery': round(m_s, 2),
        'focus': round(f_s, 2),
        'recency': round(d_recency, 2),
        'days_idle': round(days_idle, 1),
    }

    # Mathematical formulation:
    # R(s) = 0.30 * (100 - G_s) + 0.25 * (100 - A_s) + 0.20 * (100 - M_s) + 0.15 * (100 - F_s) + 0.10 * D_recency
    risk_score_raw = (
        w_grade * (100.0 - g_s) +
        w_att * (100.0 - a_s) +
        w_mastery * (100.0 - m_s) +
        w_focus * (100.0 - f_s) +
        w_recency * d_recency
    )
    risk_score = round(max(0.0, min(100.0, risk_score_raw)), 1)

    # Risk band categorization:
    # Critical: R(s) >= 70, High: 50 <= R(s) < 70, Watch: 35 <= R(s) < 50, On Track: R(s) < 35
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

    # Explainability: deficit per factor
    risk_penalties = {
        'grade': round(w_grade * (100.0 - g_s), 2),
        'attendance': round(w_att * (100.0 - a_s), 2),
        'mastery': round(w_mastery * (100.0 - m_s), 2),
        'focus': round(w_focus * (100.0 - f_s), 2),
        'recency': round(w_recency * d_recency, 2),
    }

    reason_labels = {
        'grade': 'Low assessment grades',
        'attendance': 'Low session attendance',
        'mastery': 'Low concept mastery',
        'focus': 'Low lab session focus',
        'recency': 'Prolonged submission inactivity',
    }

    # Primary reason: largest contributor to the risk deficit
    max_k = max(risk_penalties.keys(), key=lambda k: risk_penalties[k])
    primary_reason = reason_labels.get(max_k, 'Multiple risk factors') if risk_score >= watch_threshold else 'On track'

    # Trend vs previous snapshot
    trend_arrow = 'stable'
    risk_delta = 0.0
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
    total_risk = 0.0

    for s in students_with_risk:
        r = s.get('risk', {})
        band = r.get('risk_band', 'ok')
        score = float(r.get('risk_score', 0.0))
        band_counts[band] = band_counts.get(band, 0) + 1
        total_risk += score

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
        'avg_risk_score': round(total_risk / total, 1),
        'top_risk_drivers': reasons,
    }
