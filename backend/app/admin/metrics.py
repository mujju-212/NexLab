"""
app/admin/metrics.py — Platform-wide daily metric snapshots (Phase 3, M3).

One row per (day, metric) in platform_metrics_daily keeps the admin
dashboards O(1): trends read the snapshot table instead of recomputing
across the hot submission/usage tables. The nightly APScheduler job
(jobs.py, 'platform_metric_snapshots') refreshes yesterday; the backfill
helper recomputes history on demand.
"""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify

from app.auth.utils import require_role
from app.extensions import db

admin_metrics_bp = Blueprint('admin_metrics', __name__)

METRICS = (
    'signups',            # users created that day (all roles)
    'platform_signups',   # direct platform_user accounts created that day
    'dau',                # distinct users with real activity that day
    'solves',             # accepted practice submissions + course solves
    'submissions',        # practice submissions (graded, non-run)
    'exec_runs',          # sandbox executions (lab code attempts)
    'ai_calls',          # AIUsageLog rows
    'sessions_held',      # lab sessions scheduled that day
)


def compute_platform_daily(day) -> dict:
    """Live-compute every metric for one calendar day (UTC)."""
    from app.models.user import User
    from app.models.session import LabSession
    from app.models.ai_usage import AIUsageLog
    from app.models.submission import CodeAttempt
    from app.models.practice import PracticeSubmission
    from app.models.platform_content import PlatformProgress

    start = datetime.combine(day, datetime.min.time())
    end = start + timedelta(days=1)

    signups = User.query.filter(
        User.created_at >= start, User.created_at < end).count()
    platform_signups = User.query.filter(
        User.created_at >= start, User.created_at < end,
        User.role == 'platform_user').count()

    practice_users = db.session.query(PracticeSubmission.student_id).filter(
        PracticeSubmission.submitted_at >= start, PracticeSubmission.submitted_at < end,
    ).distinct()
    exec_users = db.session.query(CodeAttempt.student_id).filter(
        CodeAttempt.submitted_at >= start, CodeAttempt.submitted_at < end,
    ).distinct()
    course_users = db.session.query(PlatformProgress.user_id).filter(
        PlatformProgress.created_at >= start, PlatformProgress.created_at < end,
    ).distinct()
    active = {r[0] for r in practice_users} | {r[0] for r in exec_users} | {r[0] for r in course_users}
    dau = len(active)

    solves = PracticeSubmission.query.filter(
        PracticeSubmission.submitted_at >= start, PracticeSubmission.submitted_at < end,
        PracticeSubmission.status == 'Accepted',
        PracticeSubmission.is_run == False,  # noqa: E712
    ).count() + PlatformProgress.query.filter(
        PlatformProgress.solved_at >= start, PlatformProgress.solved_at < end,
        PlatformProgress.status == 'solved',
    ).count()

    submissions = PracticeSubmission.query.filter(
        PracticeSubmission.submitted_at >= start, PracticeSubmission.submitted_at < end,
        PracticeSubmission.is_run == False,  # noqa: E712
    ).count()

    exec_runs = CodeAttempt.query.filter(
        CodeAttempt.submitted_at >= start, CodeAttempt.submitted_at < end).count()
    ai_calls = AIUsageLog.query.filter(
        AIUsageLog.created_at >= start, AIUsageLog.created_at < end).count()
    sessions_held = LabSession.query.filter(
        LabSession.scheduled_at >= start, LabSession.scheduled_at < end).count()

    return {
        'signups': signups,
        'platform_signups': platform_signups,
        'dau': dau,
        'solves': solves,
        'submissions': submissions,
        'exec_runs': exec_runs,
        'ai_calls': ai_calls,
        'sessions_held': sessions_held,
    }


def snapshot_platform_metrics(day=None) -> dict:
    """Upsert one day's metrics (defaults to yesterday — the last full day)."""
    from sqlalchemy import text
    if day is None:
        day = (datetime.utcnow() - timedelta(days=1)).date()
    values = compute_platform_daily(day)
    for metric, value in values.items():
        db.session.execute(text("""
            INSERT INTO platform_metrics_daily (day, metric, institution_id, value)
            VALUES (:day, :metric, 'platform', :value)
            ON CONFLICT (day, metric, institution_id)
            DO UPDATE SET value = EXCLUDED.value, computed_at = now()
        """), {'day': day.isoformat(), 'metric': metric, 'value': value})
    db.session.commit()
    return {'day': day.isoformat(), **values}


def backfill_platform_metrics(days=30) -> dict:
    """Recompute the last N days (inclusive of today)."""
    done = []
    today = datetime.utcnow().date()
    for i in range(days):
        day = today - timedelta(days=i)
        snapshot_platform_metrics(day)
        done.append(day.isoformat())
    return {'days': done}


# ── endpoints ──────────────────────────────────────────────────────────────

@admin_metrics_bp.route('/analytics/snapshots', methods=['GET'])
@require_role('platform_admin')
def read_snapshots():
    """?metric=dau&days=30 — read the snapshot series for one metric."""
    from sqlalchemy import text
    metric = __import__('flask').request.args.get('metric', 'dau')
    days = min(max(int(__import__('flask').request.args.get('days', 30)), 7), 365)
    since = (datetime.utcnow() - timedelta(days=days)).date().isoformat()
    rows = db.session.execute(text("""
        SELECT day, value FROM platform_metrics_daily
        WHERE metric = :m AND institution_id = 'platform' AND day >= :since
        ORDER BY day ASC
    """), {'m': metric, 'since': since}).fetchall()
    return jsonify({
        'metric': metric,
        'series': [{'date': r[0].isoformat(), 'value': float(r[1])} for r in rows],
    }), 200


@admin_metrics_bp.route('/analytics/snapshots/backfill', methods=['POST'])
@require_role('platform_admin')
def run_backfill():
    """Recompute snapshots on demand (audited)."""
    from flask import request, g
    from app.models.academic import AuditLog
    days = min(max(int((request.get_json() or {}).get('days', 30)), 1), 365)
    res = backfill_platform_metrics(days)
    db.session.add(AuditLog(
        institution_id=None, actor_id=g.user_id, action='admin.metrics.backfill',
        target_type='system', target_id='platform_metrics_daily',
        detail=f'Backfilled {len(res["days"])} day(s) of platform metric snapshots',
        module='Platform Analytics', severity='low'))
    db.session.commit()
    return jsonify(res), 200
