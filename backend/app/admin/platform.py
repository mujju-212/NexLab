"""
Platform Super Admin — extended features blueprint
Features: Billing, Global Audit Log, Onboarding, Global Analytics, Platform Config
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role, require_auth
from app.extensions import db
from app.models.institution import Institution, PlatformConfig
from app.models.user import User
from app.models.academic import AuditLog
from app.models.session import LabSession
from datetime import datetime, timedelta
from sqlalchemy import func, text

platform_bp = Blueprint('platform', __name__)

PLAN_LIMITS = {
    'free':       {'groq': 50,  'students': 100},
    'pro':        {'groq': 200, 'students': 500},
    'enterprise': {'groq': 500, 'students': 99999},
}


# ══════════════════════════════════════════════════════════════════════════════
# 1. BILLING & PLAN MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@platform_bp.route('/institutions/<iid>/billing', methods=['GET'])
@require_role('platform_admin')
def get_billing(iid):
    inst = Institution.query.get_or_404(iid)
    student_count = User.query.filter_by(institution_id=iid, role='student').count()
    plan_info = PLAN_LIMITS.get(inst.plan, PLAN_LIMITS['free'])
    return jsonify({
        'institution_id':    iid,
        'name':              inst.name,
        'plan':              inst.plan,
        'plan_updated_at':   inst.plan_updated_at.isoformat() if inst.plan_updated_at else None,
        'billing_email':     inst.billing_email,
        'billing_notes':     inst.billing_notes,
        'groq_limit':        inst.groq_limit_override or plan_info['groq'],
        'groq_limit_source': 'override' if inst.groq_limit_override else 'plan_default',
        'student_limit':     plan_info['students'],
        'student_count':     student_count,
        'student_headroom':  plan_info['students'] - student_count,
    }), 200


@platform_bp.route('/institutions/<iid>/billing/plan', methods=['PATCH'])
@require_role('platform_admin')
def update_plan(iid):
    inst = Institution.query.get_or_404(iid)
    data = request.get_json()
    new_plan = data.get('plan')
    if new_plan not in PLAN_LIMITS:
        return jsonify({'error': f'Invalid plan. Choose from: {list(PLAN_LIMITS)}'}), 400
    old_plan = inst.plan
    inst.plan = new_plan
    inst.plan_updated_at = datetime.utcnow()
    if data.get('billing_notes'):
        inst.billing_notes = data['billing_notes']
    if data.get('billing_email'):
        inst.billing_email = data['billing_email']
    db.session.commit()
    return jsonify({
        'message':  f'{inst.name} plan changed {old_plan} -> {new_plan}',
        'new_plan': new_plan,
        'limits':   PLAN_LIMITS[new_plan],
    }), 200


@platform_bp.route('/institutions/<iid>/billing/groq-limit', methods=['PATCH'])
@require_role('platform_admin')
def set_groq_limit(iid):
    inst = Institution.query.get_or_404(iid)
    data = request.get_json()
    limit = data.get('limit')
    if limit is not None and (not isinstance(limit, int) or limit < 0):
        return jsonify({'error': 'limit must be a non-negative integer'}), 400
    inst.groq_limit_override = limit   # None resets to plan default
    db.session.commit()
    return jsonify({
        'institution_id': iid,
        'groq_limit':     limit,
        'message':        'Reset to plan default' if limit is None else f'Override set to {limit}',
    }), 200


@platform_bp.route('/institutions/<iid>/billing/notes', methods=['PATCH'])
@require_role('platform_admin')
def update_billing_notes(iid):
    inst = Institution.query.get_or_404(iid)
    inst.billing_notes = request.get_json().get('notes', '')
    db.session.commit()
    return jsonify({'message': 'Billing notes updated'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 2. GLOBAL AUDIT LOG
# ══════════════════════════════════════════════════════════════════════════════

@platform_bp.route('/audit-logs', methods=['GET'])
@require_role('platform_admin')
def global_audit_logs():
    """
    Cross-institution audit log viewer.
    Filters: ?institution_id=...&action=...&actor_id=...&days=7&page=1&per_page=50
    """
    institution_id = request.args.get('institution_id')
    action         = request.args.get('action')
    actor_id       = request.args.get('actor_id')
    days           = int(request.args.get('days', 7))
    page           = int(request.args.get('page', 1))
    per_page       = min(int(request.args.get('per_page', 50)), 200)

    since = datetime.utcnow() - timedelta(days=days)
    q = AuditLog.query.filter(AuditLog.created_at >= since)

    if institution_id:
        q = q.filter_by(institution_id=institution_id)
    if action:
        q = q.filter_by(action=action)
    if actor_id:
        q = q.filter_by(actor_id=actor_id)

    total  = q.count()
    logs   = q.order_by(AuditLog.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    # Enrich with actor name
    actor_ids = {l.actor_id for l in logs.items}
    actors    = {u.id: u.full_name for u in User.query.filter(User.id.in_(actor_ids)).all()}

    return jsonify({
        'total':   total,
        'page':    page,
        'pages':   logs.pages,
        'logs': [{
            **l.to_dict(),
            'actor_name': actors.get(l.actor_id, 'Unknown'),
        } for l in logs.items],
    }), 200


@platform_bp.route('/audit-logs/summary', methods=['GET'])
@require_role('platform_admin')
def audit_log_summary():
    """Action frequency breakdown — last 30 days."""
    since = datetime.utcnow() - timedelta(days=30)
    rows = db.session.query(
        AuditLog.action,
        func.count(AuditLog.id).label('count')
    ).filter(AuditLog.created_at >= since).group_by(AuditLog.action).all()
    return jsonify({'summary': {r[0]: r[1] for r in rows}}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 3. INSTITUTION ONBOARDING WORKFLOW
# ══════════════════════════════════════════════════════════════════════════════

@platform_bp.route('/institutions/pending', methods=['GET'])
@require_role('platform_admin')
def pending_institutions():
    """Institutions with onboarding_status='pending'."""
    pending = Institution.query.filter_by(onboarding_status='pending').all()
    return jsonify({'pending': [i.to_dict() for i in pending], 'count': len(pending)}), 200


@platform_bp.route('/institutions/<iid>/onboarding', methods=['GET'])
@require_role('platform_admin')
def onboarding_checklist(iid):
    """Live checklist — auto-checks DB for each criterion."""
    inst = Institution.query.get_or_404(iid)

    # Auto-detect checklist state from DB
    user_count = User.query.filter_by(institution_id=iid).filter(
        User.role.in_(['student', 'instructor'])
    ).count()
    exp_count = db.session.execute(
        text("SELECT COUNT(*) FROM experiments WHERE institution_id=:iid"), {'iid': iid}
    ).scalar()
    env_count = db.session.execute(
        text("SELECT COUNT(*) FROM environment_profiles WHERE institution_id=:iid"), {'iid': iid}
    ).scalar()

    checklist = {
        'institution_created':  True,
        'admin_account_exists': User.query.filter_by(institution_id=iid, role='institution_admin').count() > 0,
        'has_users':            user_count > 0,
        'has_experiments':      exp_count > 0,
        'has_environment':      env_count > 0,
    }
    complete = all(checklist.values())

    # Sync model flags
    inst.has_users       = checklist['has_users']
    inst.has_experiments = checklist['has_experiments']
    inst.has_environment = checklist['has_environment']
    db.session.commit()

    return jsonify({
        'institution_id': iid,
        'name':           inst.name,
        'status':         inst.onboarding_status,
        'checklist':      checklist,
        'complete':       complete,
        'completed_at':   inst.onboarding_completed_at.isoformat() if inst.onboarding_completed_at else None,
    }), 200


@platform_bp.route('/institutions/<iid>/onboarding/complete', methods=['POST'])
@require_role('platform_admin')
def mark_onboarding_complete(iid):
    inst = Institution.query.get_or_404(iid)
    inst.onboarding_status       = 'active'
    inst.onboarding_completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': f'{inst.name} marked as fully onboarded'}), 200


@platform_bp.route('/institutions/<iid>/onboarding/reset', methods=['POST'])
@require_role('platform_admin')
def reset_onboarding(iid):
    inst = Institution.query.get_or_404(iid)
    inst.onboarding_status       = 'pending'
    inst.onboarding_completed_at = None
    db.session.commit()
    return jsonify({'message': f'{inst.name} onboarding reset to pending'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 4. GLOBAL ANALYTICS
# ══════════════════════════════════════════════════════════════════════════════

@platform_bp.route('/analytics/overview', methods=['GET'])
@require_role('platform_admin')
def analytics_overview():
    """Platform-wide KPIs — users, sessions, active institutions."""
    days = int(request.args.get('days', 30))
    since = datetime.utcnow() - timedelta(days=days)

    total_users        = User.query.count()
    new_users          = User.query.filter(User.created_at >= since).count()
    total_sessions     = LabSession.query.count()
    sessions_in_period = LabSession.query.filter(LabSession.started_at >= since).count()
    active_insts       = db.session.query(func.count(func.distinct(LabSession.institution_id))).filter(
        LabSession.started_at >= since
    ).scalar()

    return jsonify({
        'period_days':        days,
        'total_users':        total_users,
        'new_users':          new_users,
        'total_sessions':     total_sessions,
        'sessions_in_period': sessions_in_period,
        'active_institutions': active_insts,
    }), 200


@platform_bp.route('/analytics/groq-trend', methods=['GET'])
@require_role('platform_admin')
def groq_trend():
    """Groq usage per day — last N days, all institutions combined."""
    days = int(request.args.get('days', 7))
    try:
        rows = db.session.execute(text("""
            SELECT usage_date, SUM(count) as total
            FROM groq_usage
            WHERE usage_date >= CURRENT_DATE - :days
            GROUP BY usage_date
            ORDER BY usage_date ASC
        """), {'days': days}).fetchall()
        trend = [{'date': str(r[0]), 'total': int(r[1])} for r in rows]
    except Exception:
        db.session.rollback()   # prevent aborted-transaction from poisoning next queries
        trend = []              # groq_usage table not yet created
    return jsonify({'days': days, 'trend': trend}), 200




@platform_bp.route('/analytics/sessions-trend', methods=['GET'])
@require_role('platform_admin')
def sessions_trend():
    """Daily session count — last N days."""
    days = int(request.args.get('days', 14))
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.session.query(
        func.date(LabSession.started_at).label('day'),
        func.count(LabSession.id).label('count')
    ).filter(LabSession.started_at >= since).group_by(
        func.date(LabSession.started_at)
    ).order_by('day').all()
    return jsonify({'trend': [{'date': str(r[0]), 'sessions': r[1]} for r in rows]}), 200


@platform_bp.route('/analytics/peak-usage', methods=['GET'])
@require_role('platform_admin')
def peak_usage():
    """Hour-of-day distribution of sessions — for infra capacity planning."""
    rows = db.session.query(
        func.extract('hour', LabSession.started_at).label('hour'),
        func.count(LabSession.id).label('count')
    ).group_by('hour').order_by('hour').all()
    return jsonify({
        'peak_by_hour': [{'hour': int(r[0]), 'sessions': r[1]} for r in rows],
    }), 200


@platform_bp.route('/analytics/cross-institution', methods=['GET'])
@require_role('platform_admin')
def cross_institution_analytics():
    """Compare institutions by session count, user count, avg sessions per student."""
    rows = db.session.query(
        Institution.id,
        Institution.name,
        Institution.plan,
        func.count(func.distinct(User.id)).label('users'),
        func.count(func.distinct(LabSession.id)).label('sessions'),
    ).outerjoin(User, User.institution_id == Institution.id
    ).outerjoin(LabSession, LabSession.institution_id == Institution.id
    ).group_by(Institution.id).all()

    results = []
    for r in rows:
        sessions_per_user = round(r[4] / r[3], 2) if r[3] > 0 else 0
        results.append({
            'id':                r[0],
            'name':              r[1],
            'plan':              r[2],
            'users':             r[3],
            'sessions':          r[4],
            'sessions_per_user': sessions_per_user,
        })
    results.sort(key=lambda x: x['sessions'], reverse=True)
    return jsonify({'institutions': results}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 5. PLATFORM CONFIGURATION
# ══════════════════════════════════════════════════════════════════════════════

@platform_bp.route('/config', methods=['GET'])
@require_role('platform_admin')
def get_config():
    """Get all platform config keys."""
    rows = PlatformConfig.query.order_by(PlatformConfig.key).all()
    # Merge with defaults for keys not yet in DB
    config = dict(PlatformConfig.DEFAULTS)
    config.update({r.key: r.value for r in rows})
    return jsonify({'config': config}), 200


@platform_bp.route('/config', methods=['PATCH'])
@require_role('platform_admin')
def update_config():
    """
    Update one or more config keys.
    Body: { "key1": "value1", "key2": "value2" }
    """
    data    = request.get_json()
    updated = []
    for key, value in data.items():
        PlatformConfig.set(key, value, updated_by=g.user_id)
        updated.append(key)
    db.session.commit()
    return jsonify({'updated': updated}), 200


@platform_bp.route('/config/maintenance', methods=['POST'])
@require_role('platform_admin')
def set_maintenance():
    """
    Enable or disable maintenance mode.
    Body: { "enabled": true, "message": "optional custom message" }
    """
    data    = request.get_json()
    enabled = data.get('enabled', False)
    message = data.get('message')

    PlatformConfig.set('maintenance_mode', 'true' if enabled else 'false', g.user_id)
    if message:
        PlatformConfig.set('maintenance_message', message, g.user_id)
    db.session.commit()

    # Broadcast via SocketIO so connected clients show maintenance banner
    from app.extensions import socketio
    socketio.emit('maintenance_mode', {
        'enabled': enabled,
        'message': message or PlatformConfig.get('maintenance_message'),
    })

    return jsonify({
        'maintenance_mode': enabled,
        'message': message or PlatformConfig.get('maintenance_message'),
    }), 200


@platform_bp.route('/config/features', methods=['GET'])
@require_role('platform_admin')
def feature_flags():
    """Get all boolean feature flags."""
    flag_keys = ['ai_hints_enabled', 'code_execution_enabled', 'allow_self_registration']
    flags = {k: PlatformConfig.get(k, 'true') == 'true' for k in flag_keys}
    return jsonify({'features': flags}), 200


@platform_bp.route('/config/features/<flag>', methods=['PATCH'])
@require_role('platform_admin')
def toggle_feature(flag):
    """Toggle a feature flag on/off. Body: { "enabled": true }"""
    allowed = {'ai_hints_enabled', 'code_execution_enabled', 'allow_self_registration'}
    if flag not in allowed:
        return jsonify({'error': f'Unknown flag. Allowed: {list(allowed)}'}), 400
    enabled = request.get_json().get('enabled', True)
    PlatformConfig.set(flag, 'true' if enabled else 'false', g.user_id)
    db.session.commit()
    return jsonify({'flag': flag, 'enabled': enabled}), 200
