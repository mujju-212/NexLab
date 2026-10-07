"""
NexLab Canonical Metric & Analytics Layer
Single source of truth for institution, instructor, and student analytics.
"""
from app.analytics.config import get_analytics_config, save_analytics_config
from app.analytics.metrics import resolve_window, compute_student_atomic_metrics, batch_student_atomic_metrics
from app.analytics.risk import compute_student_risk, compute_cohort_risk_summary
from app.analytics.benchmark import compute_cohort_benchmarks
from app.analytics.funnel import compute_student_funnel
from app.analytics.snapshots import record_daily_snapshot_for_institution, backfill_snapshots, run_all_institution_daily_snapshots
from app.analytics.scope import resolve_scope_entities
from app.analytics.ranking import compute_rank_for_scope, get_student_all_ranks
from app.analytics.mastery import compute_scoped_mastery, get_concept_prerequisite_graph
from app.analytics.completion import (
    compute_student_completion_rollup,
    compute_student_attendance_rollup,
    get_student_360_overview,
)
from app.analytics.integrity import compute_integrity_confidence, get_integrity_review_queue
from app.analytics.advanced import (
    compute_struggle_quadrant,
    cluster_error_patterns,
    get_attempt_replay,
    forecast_student_trajectory,
)
from app.analytics.interventions import (
    record_intervention,
    update_intervention_outcome,
    list_interventions,
)
from app.analytics.routes import student_analytics_bp

__all__ = [
    'get_analytics_config',
    'save_analytics_config',
    'resolve_window',
    'compute_student_atomic_metrics',
    'batch_student_atomic_metrics',
    'compute_student_risk',
    'compute_cohort_risk_summary',
    'compute_cohort_benchmarks',
    'compute_student_funnel',
    'record_daily_snapshot_for_institution',
    'backfill_snapshots',
    'run_all_institution_daily_snapshots',
    'resolve_scope_entities',
    'compute_rank_for_scope',
    'get_student_all_ranks',
    'compute_scoped_mastery',
    'get_concept_prerequisite_graph',
    'compute_student_completion_rollup',
    'compute_student_attendance_rollup',
    'get_student_360_overview',
    'compute_integrity_confidence',
    'get_integrity_review_queue',
    'compute_struggle_quadrant',
    'cluster_error_patterns',
    'get_attempt_replay',
    'forecast_student_trajectory',
    'record_intervention',
    'update_intervention_outcome',
    'list_interventions',
    'student_analytics_bp',
]
