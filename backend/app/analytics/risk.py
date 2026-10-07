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
    Compute Unified Risk Score (0–100, higher = more at risk) for one student.
    
    risk = 100 - healthy
    healthy = sum(w_i * v_i)
    """
    cfg = config or {}
    weights = dict(cfg.get('risk_weights') or DEFAULT_RISK_WEIGHTS)
    bands = dict(cfg.get('risk_bands') or DEFAULT_RISK_BANDS)

    # Normalize weights
    w_sum = sum(weights.values()) or 1.0
    w_norm = {k: v / w_sum for k, v in weights.items()}

    # Extract component values (0–100)
    mastery_v = float(student_metrics.get('mastery_avg', {}).get('value') or 0.0)
    grade_v = float(student_metrics.get('grade_avg', {}).get('value') or 0.0)
    att_v = float(student_metrics.get('attendance_rate', {}).get('value') or 0.0)
    focus_v = float(student_metrics.get('focus_avg', {}).get('value') or 0.0)
    consistency_v = float(student_metrics.get('consistency', {}).get('value') or 0.0)

    # Freshness from submission recency days: 0 days -> 100, 14+ days -> 0
    recency_days = float(student_metrics.get('submission_recency_days', {}).get('value') or 99.0)
    freshness_v = max(0.0, min(100.0, 100.0 - (recency_days * 7.0)))

    components = {
        'mastery': max(0.0, min(100.0, mastery_v)),
        'grade': max(0.0, min(100.0, grade_v)),
        'attendance': max(0.0, min(100.0, att_v)),
        'focus': max(0.0, min(100.0, focus_v)),
        'consistency': max(0.0, min(100.0, consistency_v)),
        'freshness': round(freshness_v, 2),
    }

    # Healthy weighted sum
    healthy = sum(w_norm.get(k, 0.0) * components[k] for k in components)
    healthy = max(0.0, min(100.0, healthy))
    risk_score = round(100.0 - healthy, 1)

    # Risk band categorization
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

    # Explainability: compute deficit (risk points caused by each factor)
    risk_penalties = {}
    reason_labels = {
        'mastery': 'Low concept mastery',
        'grade': 'Low assessment grades',
        'attendance': 'Low session attendance',
        'focus': 'Low lab session focus',
        'consistency': 'High grade volatility',
        'freshness': 'Prolonged submission inactivity',
    }

    for k, val in components.items():
        w = w_norm.get(k, 0.0)
        deficit = 100.0 - val
        risk_penalties[k] = round(w * deficit, 2)

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
