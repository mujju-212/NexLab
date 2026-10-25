"""
app/admin/tenant.py — Platform Admin: Institution drill-down (Phase 2).

Everything the platform owner needs INSIDE one tenant: the member directory
(crossing straight into User-360) and a per-tenant analytics snapshot
(people, sessions, AI, executions, learning) computed live from the DB.

Read-only by design — institution-level mutations (suspend/activate, reset
admin password, billing) already exist in app/admin/routes.py and
app/admin/platform.py and stay the single write path.
"""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from app.auth.utils import require_role
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
from app.models.session import LabSession
from app.models.ai_usage import AIUsageLog
from app.models.submission import CodeAttempt
from app.models.practice import PracticeSubmission
from app.models.platform_content import PlatformProgress

admin_tenant_bp = Blueprint('admin_tenant', __name__)


def _inst_or_404(iid):
    inst = Institution.query.get(iid)
    if not inst:
        return None, (jsonify({'error': 'Institution not found.'}), 404)
    return inst, None


def _day_series(rows, days=30):
    """rows: [(datetime, count)] -> dense per-day list for charting."""
    start = datetime.utcnow().date() - timedelta(days=days - 1)
    by_day = {}
    for dt, n in rows:
        if dt is None:
            continue
        d = dt.date() if isinstance(dt, datetime) else dt
        if d >= start:
            by_day[d.isoformat()] = by_day.get(d.isoformat(), 0) + (n or 0)
    out, cur = [], start
    today = datetime.utcnow().date()
    while cur <= today:
        iso = cur.isoformat()
        out.append({'date': iso, 'count': by_day.get(iso, 0)})
        cur += timedelta(days=1)
    return out


# ── member directory ──────────────────────────────────────────────────────

@admin_tenant_bp.route('/institutions/<iid>/users', methods=['GET'])
@require_role('platform_admin')
def institution_users(iid):
    """Paginated tenant members — same row shape as the global directory so
    the drill-down crosses straight into User-360."""
    inst, err = _inst_or_404(iid)
    if err:
        return err

    from app.admin.users import _dir_row
    q_txt = (request.args.get('q') or '').strip()
    role = request.args.get('role') or None
    status = (request.args.get('status') or '').strip() or None
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(int(request.args.get('per_page', 25)), 100)

    query = User.query.filter_by(institution_id=iid)
    if q_txt:
        like = f'%{q_txt}%'
        query = query.filter(db.or_(User.full_name.ilike(like), User.email.ilike(like)))
    if role:
        query = query.filter_by(role=role)
    if status:
        query = query.filter_by(status=status)
    query = query.order_by(User.full_name.asc())

    total = query.count()
    rows = query.paginate(page=page, per_page=per_page, error_out=False).items
    return jsonify({
        'institution': {'id': inst.id, 'name': inst.name, 'plan': inst.plan},
        'total': total,
        'page': page,
        'pages': max(1, -(-total // per_page)),
        'users': [_dir_row(u) for u in rows],
    }), 200


# ── per-tenant analytics ──────────────────────────────────────────────────

@admin_tenant_bp.route('/institutions/<iid>/analytics', methods=['GET'])
@require_role('platform_admin')
def institution_analytics(iid):
    """One tenant, whole story: people, sessions, AI, executions, learning.
    Live-computed; hot dashboards should move to snapshots in Phase 3."""
    inst, err = _inst_or_404(iid)
    if err:
        return err

    days = min(max(int(request.args.get('days', 30)), 7), 90)
    since = datetime.utcnow() - timedelta(days=days)
    since_30 = datetime.utcnow() - timedelta(days=30)

    # ── people ────────────────────────────────────────────────────────
    role_counts = dict(
        db.session.query(User.role, db.func.count(User.id))
        .filter_by(institution_id=iid)
        .group_by(User.role).all()
    )
    suspended = User.query.filter_by(institution_id=iid, status='suspended').count()
    active_recently = User.query.filter(
        User.institution_id == iid,
        User.last_login >= since_30).count()
    total_users = sum(role_counts.values())

    # ── sessions ──────────────────────────────────────────────────────
    sessions_total = LabSession.query.filter_by(institution_id=iid).count()
    sessions_live = LabSession.query.filter_by(institution_id=iid, status='active').count()
    session_trend = _day_series(db.session.query(
        LabSession.scheduled_at, db.func.count(LabSession.id)
    ).filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= since,
    ).group_by(LabSession.scheduled_at).all(), days)

    # ── AI ────────────────────────────────────────────────────────────
    ai_trend_rows = db.session.query(
        AIUsageLog.created_at, db.func.count(AIUsageLog.id)
    ).filter(
        AIUsageLog.institution_id == iid,
        AIUsageLog.created_at >= since,
    ).group_by(AIUsageLog.created_at).all()
    ai_total = sum(n for _, n in ai_trend_rows)

    # ── executions (lab code runs by this tenant's users) ─────────────
    tenant_user_ids = db.session.query(User.id).filter(User.institution_id == iid)
    exec_rows = db.session.query(
        CodeAttempt.submitted_at, db.func.count(CodeAttempt.id)
    ).filter(
        CodeAttempt.student_id.in_(tenant_user_ids.subquery()),
        CodeAttempt.submitted_at >= since,
    ).group_by(CodeAttempt.submitted_at).all()
    exec_total = sum(n for _, n in exec_rows)

    # ── learning (cross-tenant practice + platform courses) ───────────
    solves_rows = db.session.query(
        PracticeSubmission.submitted_at, db.func.count(PracticeSubmission.id)
    ).filter(
        PracticeSubmission.student_id.in_(tenant_user_ids.subquery()),
        PracticeSubmission.status == 'Accepted',
        PracticeSubmission.submitted_at >= since,
    ).group_by(PracticeSubmission.submitted_at).all()
    practice_solves = sum(n for _, n in solves_rows)
    course_solves = db.session.query(db.func.count(PlatformProgress.id)).filter(
        PlatformProgress.user_id.in_(tenant_user_ids.subquery()),
        PlatformProgress.status == 'solved',
    ).scalar() or 0

    return jsonify({
        'institution': {'id': inst.id, 'name': inst.name, 'plan': inst.plan},
        'window_days': days,
        'people': {
            'total_users': total_users,
            'role_counts': role_counts,
            'active_users_30d': active_recently,
            'suspended_users': suspended,
        },
        'sessions': {
            'total': sessions_total,
            'live': sessions_live,
            'trend': session_trend,
        },
        'ai': {
            'calls_in_window': ai_total,
            'trend': _day_series(ai_trend_rows, days),
        },
        'executions': {
            'runs_in_window': exec_total,
            'trend': _day_series(exec_rows, days),
        },
        'learning': {
            'practice_solves_in_window': practice_solves,
            'solves_trend': _day_series(solves_rows, days),
            'course_solves_total': course_solves,
        },
    }), 200
