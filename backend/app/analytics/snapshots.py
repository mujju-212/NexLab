"""
NexLab Daily Metric & KPI Snapshot Engine.
Writes StudentMetricSnapshot and InstitutionDailyKPI for O(1) trend reads and predictive risk slopes.
"""
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy import func

from app.extensions import db
from app.models.user import User
from app.models.analytics_snapshot import StudentMetricSnapshot, InstitutionDailyKPI
from app.models.institution import Institution
from app.analytics.config import get_analytics_config
from app.analytics.metrics import batch_student_atomic_metrics
from app.analytics.risk import compute_student_risk, compute_cohort_risk_summary


def record_daily_snapshot_for_institution(
    institution_id: str,
    target_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Idempotent daily rollup for an institution.
    Computes all student metrics + risk, upserts StudentMetricSnapshot rows,
    and stores aggregate campus KPIs in InstitutionDailyKPI.
    """
    snap_date = target_date or datetime.utcnow().date()
    # Window: 30 days leading up to snap_date
    window_end = datetime.combine(snap_date, datetime.max.time())
    window_start = window_end - timedelta(days=30)

    cfg = get_analytics_config(institution_id)

    # 1. Fetch active students
    students = User.query.filter(
        User.institution_id == institution_id,
        User.role == 'student',
        User.is_active == True,
    ).all()
    student_ids = [s.id for s in students]

    if not student_ids:
        return {'institution_id': institution_id, 'snapshot_date': snap_date.isoformat(), 'students_snapshotted': 0}

    # 2. Previous snapshot risk scores (for trend delta)
    prev_date = snap_date - timedelta(days=1)
    prev_snapshots = StudentMetricSnapshot.query.filter(
        StudentMetricSnapshot.institution_id == institution_id,
        StudentMetricSnapshot.snapshot_date == prev_date,
        StudentMetricSnapshot.section_subject_id.is_(None),
    ).all()
    prev_risk_map = {}
    for ps in prev_snapshots:
        if isinstance(ps.metrics, dict) and 'risk' in ps.metrics:
            prev_risk_map[ps.student_id] = float(ps.metrics['risk'].get('risk_score', 0.0))

    # 3. Batch compute atomic metrics
    atomic_results = batch_student_atomic_metrics(
        student_ids=student_ids,
        institution_id=institution_id,
        window_start=window_start,
        window_end=window_end,
        min_sample_size=cfg.get('min_sample_size', 3),
        halflife_days=cfg.get('mastery_halflife_days', 30),
        now=window_end,
    )

    # 4. Existing snapshots today (to upsert)
    existing_snaps = StudentMetricSnapshot.query.filter(
        StudentMetricSnapshot.institution_id == institution_id,
        StudentMetricSnapshot.snapshot_date == snap_date,
        StudentMetricSnapshot.section_subject_id.is_(None),
    ).all()
    existing_map = {es.student_id: es for es in existing_snaps}

    student_risk_items = []
    for sid in student_ids:
        m = atomic_results.get(sid, {})
        prev_r = prev_risk_map.get(sid)
        r = compute_student_risk(m, cfg, previous_risk=prev_r)

        frozen_metrics = {
            'mastery_avg': m.get('mastery_avg', {}).get('value', 0.0),
            'mastery_breadth': m.get('mastery_breadth', {}).get('value', 0),
            'grade_avg': m.get('grade_avg', {}).get('value', 0.0),
            'grade_trend': m.get('grade_trend', {}).get('value', 0.0),
            'attendance_rate': m.get('attendance_rate', {}).get('value', 0.0),
            'focus_avg': m.get('focus_avg', {}).get('value', 50.0),
            'consistency': m.get('consistency', {}).get('value', 100.0),
            'efficiency': m.get('efficiency', {}).get('value', 70.0),
            'submission_recency_days': m.get('submission_recency_days', {}).get('value', 99.0),
            'integrity_score': m.get('integrity_score', {}).get('value', 100.0),
            'risk': r,
        }

        student_risk_items.append({'student_id': sid, 'risk': r, 'metrics': frozen_metrics})

        if sid in existing_map:
            snap = existing_map[sid]
            snap.metrics = frozen_metrics
            snap.created_at = datetime.utcnow()
        else:
            snap = StudentMetricSnapshot(
                institution_id=institution_id,
                student_id=sid,
                section_subject_id=None,
                snapshot_date=snap_date,
                metrics=frozen_metrics,
            )
            db.session.add(snap)

    # 5. Campus KPI rollup
    cohort_risk = compute_cohort_risk_summary(student_risk_items, cfg)
    
    # Campus-wide average grade, attendance, focus
    valid_grades = [item['metrics']['grade_avg'] for item in student_risk_items if item['metrics']['grade_avg'] > 0]
    valid_atts = [item['metrics']['attendance_rate'] for item in student_risk_items]
    valid_focus = [item['metrics']['focus_avg'] for item in student_risk_items if item['metrics']['focus_avg'] is not None]

    campus_kpis = {
        'total_students': len(student_ids),
        'at_risk_count': cohort_risk['at_risk_count'],
        'at_risk_pct': cohort_risk['at_risk_pct'],
        'avg_risk_score': cohort_risk['avg_risk_score'],
        'bands': cohort_risk['bands'],
        'top_risk_drivers': cohort_risk['top_risk_drivers'],
        'avg_grade': round(sum(valid_grades) / len(valid_grades), 1) if valid_grades else 0.0,
        'avg_attendance': round(sum(valid_atts) / len(valid_atts), 1) if valid_atts else 0.0,
        'avg_focus': round(sum(valid_focus) / len(valid_focus), 1) if valid_focus else 50.0,
    }

    existing_kpi = InstitutionDailyKPI.query.filter_by(
        institution_id=institution_id,
        snapshot_date=snap_date
    ).first()

    if existing_kpi:
        existing_kpi.kpis = campus_kpis
        existing_kpi.created_at = datetime.utcnow()
    else:
        kpi_row = InstitutionDailyKPI(
            institution_id=institution_id,
            snapshot_date=snap_date,
            kpis=campus_kpis,
        )
        db.session.add(kpi_row)

    db.session.commit()
    return {
        'institution_id': institution_id,
        'snapshot_date': snap_date.isoformat(),
        'students_snapshotted': len(student_ids),
        'kpis': campus_kpis,
    }


def backfill_snapshots(institution_id: str, days: int = 14) -> List[Dict[str, Any]]:
    """Backfill snapshots for past days to initialize history."""
    results = []
    today = datetime.utcnow().date()
    for d in range(days, -1, -1):
        target = today - timedelta(days=d)
        res = record_daily_snapshot_for_institution(institution_id, target_date=target)
        results.append(res)
    return results


def run_all_institution_daily_snapshots() -> Dict[str, Any]:
    """Runner for APScheduler nightly job across all active institutions."""
    institutions = Institution.query.filter_by(is_active=True).all()
    today = datetime.utcnow().date()
    processed = []
    for inst in institutions:
        try:
            r = record_daily_snapshot_for_institution(inst.id, target_date=today)
            processed.append({'institution_id': inst.id, 'status': 'success', 'details': r})
        except Exception as e:
            db.session.rollback()
            processed.append({'institution_id': inst.id, 'status': 'error', 'error': str(e)})

    return {'target_date': today.isoformat(), 'institutions_count': len(institutions), 'results': processed}
