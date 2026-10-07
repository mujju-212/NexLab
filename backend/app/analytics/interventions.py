"""
Intervention Management & Effectiveness Engine
Tracks instructor interventions for struggling students and calculates
risk-score reduction / outcome efficacy.
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy import desc
from app.extensions import db
from app.models.intervention import Intervention
from app.models.user import User
from app.analytics.metrics import compute_student_atomic_metrics
from app.analytics.risk import compute_student_risk


def record_intervention(
    student_id: str,
    instructor_id: str,
    institution_id: str,
    action_type: str,
    note: Optional[str] = None,
    follow_up_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Creates a new student intervention record, automatically capturing the current
    baseline risk score before the action is executed.
    """
    # Compute current baseline risk
    now = datetime.utcnow()
    atomic = compute_student_atomic_metrics(
        student_id=student_id,
        institution_id=institution_id,
        window_start=now.replace(month=1, day=1) if now.month > 6 else now.replace(year=now.year - 1, month=7, day=1),
        window_end=now,
    )
    current_risk = compute_student_risk(atomic).get('risk_score', 50.0)

    intervention = Intervention(
        institution_id=institution_id,
        student_id=student_id,
        created_by=instructor_id,
        action_type=action_type,
        note=note,
        follow_up_at=follow_up_at,
        outcome='open',
        risk_score_before=current_risk,
    )

    db.session.add(intervention)
    db.session.commit()

    return intervention.to_dict()


def update_intervention_outcome(
    intervention_id: str,
    outcome: str,
    outcome_note: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Updates the outcome of an intervention ('improved', 'no_change', 'worsened'),
    automatically sampling the post-intervention risk score to measure impact.
    """
    q = Intervention.query.filter_by(id=intervention_id)
    if institution_id:
        q = q.filter_by(institution_id=institution_id)

    intervention = q.first()
    if not intervention:
        return {'error': 'Intervention not found'}

    # Compute latest risk score after intervention
    now = datetime.utcnow()
    atomic = compute_student_atomic_metrics(
        student_id=intervention.student_id,
        institution_id=intervention.institution_id,
        window_start=now.replace(month=1, day=1) if now.month > 6 else now.replace(year=now.year - 1, month=7, day=1),
        window_end=now,
    )
    post_risk = compute_student_risk(atomic).get('risk_score', 50.0)

    intervention.outcome = outcome
    intervention.outcome_note = outcome_note
    intervention.risk_score_after = post_risk
    intervention.resolved_at = now

    db.session.commit()

    res = intervention.to_dict()
    res['risk_delta'] = round(intervention.risk_score_after - (intervention.risk_score_before or post_risk), 1)
    return res


def list_interventions(
    institution_id: str,
    student_id: Optional[str] = None,
    instructor_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> Dict[str, Any]:
    """
    Lists interventions with filtering and aggregated efficacy metrics.
    """
    q = Intervention.query.filter_by(institution_id=institution_id)

    if student_id:
        q = q.filter_by(student_id=student_id)
    if instructor_id:
        q = q.filter_by(created_by=instructor_id)
    if status == 'open':
        q = q.filter_by(outcome='open')
    elif status == 'resolved':
        q = q.filter(Intervention.outcome != 'open')

    rows = q.order_by(desc(Intervention.created_at)).limit(limit).all()

    items = []
    total_delta = 0.0
    measured_count = 0

    for it in rows:
        d = it.to_dict()
        if it.risk_score_before is not None and it.risk_score_after is not None:
            delta = it.risk_score_after - it.risk_score_before
            d['risk_delta'] = round(delta, 1)
            total_delta += delta
            measured_count += 1
        items.append(d)

    avg_impact = round(total_delta / max(1, measured_count), 1) if measured_count > 0 else 0.0

    return {
        'total': len(items),
        'avg_risk_delta': avg_impact,  # negative is good (reduced risk)
        'interventions': items,
    }
