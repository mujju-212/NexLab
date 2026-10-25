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
from app.models.ai_usage import AIUsageLog
from app.institution.quota import student_quota
from datetime import datetime, timedelta
from sqlalchemy import func, text
import re

platform_bp = Blueprint('platform', __name__)

_NUMERIC_CONFIG_LIMITS = {
    'groq_daily_limit': 1_000_000,
    'platform_user_daily_ai_calls': 1_000_000,
    'max_students_free': 10_000_000,
    'max_students_pro': 10_000_000,
    'max_students_enterprise': 10_000_000,
}


def _audit_platform(action, target_type, target_id, detail, severity='medium'):
    db.session.add(AuditLog(
        institution_id=None,
        actor_id=g.user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        module='Platform Administration',
        severity=severity,
        ip_address=request.remote_addr or '',
    ))


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
    quota = student_quota(iid)
    plan_info = PLAN_LIMITS.get(inst.plan, PLAN_LIMITS['free'])
    return jsonify({
        'institution_id':    iid,
        'name':              inst.name,
        'plan':              inst.plan,
        'plan_updated_at':   inst.plan_updated_at.isoformat() if inst.plan_updated_at else None,
        'billing_email':     inst.billing_email,
        'billing_notes':     inst.billing_notes,
        'groq_limit':        inst.groq_limit_override if inst.groq_limit_override is not None else plan_info['groq'],
        'groq_limit_source': 'override' if inst.groq_limit_override is not None else 'plan_default',
        'student_limit':     quota['limit'],
        'student_count':     quota['used'],
        'student_headroom':  quota['remaining'],
    }), 200


@platform_bp.route('/institutions/<iid>/billing/plan', methods=['PATCH'])
@require_role('platform_admin')
def update_plan(iid):
    inst = Institution.query.get_or_404(iid)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be an object.'}), 400
    new_plan = data.get('plan')
    if new_plan not in PLAN_LIMITS:
        return jsonify({'error': f'Invalid plan. Choose from: {list(PLAN_LIMITS)}'}), 400
    if 'billing_email' in data:
        email = data['billing_email']
        if not isinstance(email, str) or len(email) > 320:
            return jsonify({'error': 'billing_email must be text up to 320 characters.'}), 400
        email = email.strip()
        if email and not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
            return jsonify({'error': 'billing_email must be a valid email address or blank.'}), 400
        data['billing_email'] = email
    if 'billing_notes' in data and (not isinstance(data['billing_notes'], str) or len(data['billing_notes']) > 4000):
        return jsonify({'error': 'billing_notes must be text up to 4000 characters.'}), 400
    old_plan = inst.plan
    inst.plan = new_plan
    inst.plan_updated_at = datetime.utcnow()
    if 'billing_notes' in data:
        inst.billing_notes = data['billing_notes']
    if 'billing_email' in data:
        inst.billing_email = data['billing_email'] or None
    _audit_platform('admin.billing.plan_update', 'institution', inst.id,
                    f'Plan changed {old_plan} -> {new_plan}; billing fields updated.', severity='high')
    db.session.commit()
    quota = student_quota(iid)
    return jsonify({
        'message':  f'{inst.name} plan changed {old_plan} -> {new_plan}',
        'new_plan': new_plan,
        'limits':   {'groq': PLAN_LIMITS[new_plan]['groq'], 'students': quota['limit']},
    }), 200


@platform_bp.route('/institutions/<iid>/billing/groq-limit', methods=['PATCH'])
@require_role('platform_admin')
def set_groq_limit(iid):
    inst = Institution.query.get_or_404(iid)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'limit' not in data:
        return jsonify({'error': 'Request body must include limit (a non-negative integer or null).'}), 400
    limit = data['limit']
    if limit is not None and (type(limit) is not int or not 0 <= limit <= 1_000_000):
        return jsonify({'error': 'limit must be a non-negative integer up to 1000000, or null to reset.'}), 400
    inst.groq_limit_override = limit   # None resets to platform default
    _audit_platform('admin.billing.groq_limit', 'institution', inst.id,
                    f'Groq request limit override set to {limit!r}.', severity='medium')
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
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('notes'), str) or len(data['notes']) > 4000:
        return jsonify({'error': 'notes must be text up to 4000 characters.'}), 400
    inst.billing_notes = data['notes']
    _audit_platform('admin.billing.notes', 'institution', inst.id,
                    'Updated institution billing notes.', severity='low')
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


def _onboarding_checklist(iid):
    user_count = User.query.filter_by(institution_id=iid).filter(
        User.role.in_(['student', 'instructor'])
    ).count()
    exp_count = db.session.execute(
        text("SELECT COUNT(*) FROM experiments WHERE institution_id=:iid"), {'iid': iid}
    ).scalar()
    env_count = db.session.execute(
        text("SELECT COUNT(*) FROM environment_profiles WHERE institution_id=:iid"), {'iid': iid}
    ).scalar()
    return {
        'institution_created': True,
        'admin_account_exists': User.query.filter_by(institution_id=iid, role='institution_admin').count() > 0,
        'has_users': user_count > 0,
        'has_experiments': bool(exp_count),
        'has_environment': bool(env_count),
    }


@platform_bp.route('/institutions/<iid>/onboarding', methods=['GET'])
@require_role('platform_admin')
def onboarding_checklist(iid):
    """Live checklist — auto-checks DB for each criterion."""
    inst = Institution.query.get_or_404(iid)
    checklist = _onboarding_checklist(iid)
    complete = all(checklist.values())

    # Sync model flags from the same checklist returned to the caller.
    inst.has_users = checklist['has_users']
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
    checklist = _onboarding_checklist(iid)
    incomplete = [key for key, done in checklist.items() if not done]
    if incomplete:
        return jsonify({
            'error': 'Onboarding cannot be completed until every checklist item is satisfied.',
            'checklist': checklist,
            'incomplete': incomplete,
        }), 409
    inst.onboarding_status = 'active'
    inst.onboarding_completed_at = datetime.utcnow()
    _audit_platform('admin.institution.onboarding_complete', 'institution', inst.id,
                    'Marked institution onboarding complete.', severity='medium')
    db.session.commit()
    return jsonify({'message': f'{inst.name} marked as fully onboarded', 'checklist': checklist}), 200


@platform_bp.route('/institutions/<iid>/onboarding/reset', methods=['POST'])
@require_role('platform_admin')
def reset_onboarding(iid):
    inst = Institution.query.get_or_404(iid)
    inst.onboarding_status = 'pending'
    inst.onboarding_completed_at = None
    _audit_platform('admin.institution.onboarding_reset', 'institution', inst.id,
                    'Reset institution onboarding to pending.', severity='medium')
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

    # A session's activity timestamp is when it started, or — for sessions that
    # were scheduled but never launched — when it was meant to run. Filtering on
    # started_at alone reported 0 activity on a platform with real scheduled labs.
    activity_ts = func.coalesce(LabSession.started_at, LabSession.scheduled_at)

    total_users        = User.query.count()
    new_users          = User.query.filter(User.created_at >= since).count()
    total_sessions     = LabSession.query.count()
    sessions_in_period = LabSession.query.filter(activity_ts >= since).count()
    active_insts       = db.session.query(func.count(func.distinct(LabSession.institution_id))).filter(
        activity_ts >= since
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
    activity_ts = func.coalesce(LabSession.started_at, LabSession.scheduled_at)
    rows = db.session.query(
        func.date(activity_ts).label('day'),
        func.count(LabSession.id).label('count')
    ).filter(activity_ts >= since).group_by(
        func.date(activity_ts)
    ).order_by('day').all()
    return jsonify({'trend': [{'date': str(r[0]), 'sessions': r[1]} for r in rows]}), 200


@platform_bp.route('/analytics/peak-usage', methods=['GET'])
@require_role('platform_admin')
def peak_usage():
    """Hour-of-day distribution of sessions — for infra capacity planning."""
    # Peak demand: the hour a session actually ran, or the hour it was scheduled
    # for when it never launched. coalesce also removes the NULL bucket that
    # used to make int(None) 500 the endpoint.
    _hour = func.extract('hour', func.coalesce(LabSession.started_at, LabSession.scheduled_at))
    rows = db.session.query(
        _hour.label('hour'),
        func.count(LabSession.id).label('count')
    ).filter(_hour.isnot(None)).group_by('hour').order_by('hour').all()
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


@platform_bp.route('/analytics/ai-usage/cross-institution', methods=['GET'])
@require_role('platform_admin')
def cross_institution_ai_usage():
    """
    C6 — Platform roll-up of AI consumption per institution.

    Groups AIUsageLog by institution for the last `days` (default 30) and
    reports total calls, tokens, estimated spend, and per-feature breakdown,
    sorted by tokens desc. Institutions with no AI activity are included with
    zeroed totals so the platform admin sees the whole tenant list at once.
    """
    days = int(request.args.get('days', 30) or 30)
    days = max(1, min(days, 365))
    since = datetime.utcnow() - timedelta(days=days)

    rows = db.session.query(
        AIUsageLog.institution_id,
        func.count(AIUsageLog.id).label('calls'),
        func.coalesce(func.sum(AIUsageLog.total_tokens), 0).label('tokens'),
        func.coalesce(func.sum(AIUsageLog.estimated_cost_usd), 0).label('cost'),
    ).filter(
        AIUsageLog.institution_id.isnot(None),
        AIUsageLog.created_at >= since,
    ).group_by(AIUsageLog.institution_id).all()

    feature_rows = db.session.query(
        AIUsageLog.institution_id,
        AIUsageLog.feature,
        func.count(AIUsageLog.id).label('calls'),
    ).filter(
        AIUsageLog.institution_id.isnot(None),
        AIUsageLog.created_at >= since,
    ).group_by(AIUsageLog.institution_id, AIUsageLog.feature).all()

    by_inst_feature = {}
    for iid, feature, calls in feature_rows:
        by_inst_feature.setdefault(iid, {})[feature] = calls

    inst = {i.id: i for i in Institution.query.all()}
    results = []
    for iid, calls, tokens, cost in rows:
        results.append({
            'institution_id': iid,
            'name':           inst[iid].name if iid in inst else 'Deleted institution',
            'plan':           inst[iid].plan if iid in inst else '—',
            'calls':          calls,
            'tokens':         tokens,
            'cost_usd':       round(float(cost), 4),
            'by_feature':     by_inst_feature.get(iid, {}),
        })
    for iid, i in inst.items():
        if iid not in {r['institution_id'] for r in results}:
            results.append({
                'institution_id': iid, 'name': i.name, 'plan': i.plan,
                'calls': 0, 'tokens': 0, 'cost_usd': 0.0, 'by_feature': {},
            })

    results.sort(key=lambda x: x['tokens'], reverse=True)
    return jsonify({'days': days, 'institutions': results}), 200


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
    """Update only the documented numeric quota keys; reject partial bad writes."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return jsonify({'error': 'Request body must be a non-empty object.'}), 400
    unknown = sorted(set(data) - set(_NUMERIC_CONFIG_LIMITS))
    if unknown:
        return jsonify({'error': f'Unsupported configuration keys: {", ".join(unknown)}'}), 400

    normalized = {}
    for key, value in data.items():
        if isinstance(value, bool):
            return jsonify({'error': f'{key} must be a non-negative integer.'}), 400
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return jsonify({'error': f'{key} must be a non-negative integer.'}), 400
        if str(value).strip() != str(parsed) or not 0 <= parsed <= _NUMERIC_CONFIG_LIMITS[key]:
            return jsonify({'error': f'{key} must be between 0 and {_NUMERIC_CONFIG_LIMITS[key]}.'}), 400
        normalized[key] = str(parsed)

    for key, value in normalized.items():
        PlatformConfig.set(key, value, updated_by=g.user_id)
    _audit_platform('admin.platform.quotas_update', 'platform_config', None,
                    f'Updated platform quota keys: {", ".join(sorted(normalized))}.', severity='high')
    db.session.commit()
    return jsonify({'updated': sorted(normalized)}), 200


@platform_bp.route('/config/maintenance/status', methods=['GET'])
def maintenance_status():
    """Public, read-only state used to display maintenance notices before login."""
    return jsonify({
        'enabled': str(PlatformConfig.get('maintenance_mode', 'false')).lower() == 'true',
        'message': PlatformConfig.get('maintenance_message', ''),
    }), 200


@platform_bp.route('/config/maintenance', methods=['POST'])
@require_role('platform_admin')
def set_maintenance():
    """Enable or disable maintenance notices for connected users."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('enabled'), bool):
        return jsonify({'error': 'enabled must be a boolean.'}), 400
    if 'message' in data and (not isinstance(data['message'], str) or len(data['message']) > 500):
        return jsonify({'error': 'message must be text up to 500 characters.'}), 400
    enabled = data['enabled']
    message = data.get('message', PlatformConfig.get('maintenance_message', ''))

    PlatformConfig.set('maintenance_mode', 'true' if enabled else 'false', g.user_id)
    PlatformConfig.set('maintenance_message', message, g.user_id)
    _audit_platform('admin.platform.maintenance', 'platform_config', 'maintenance_mode',
                    f'Maintenance notice {"enabled" if enabled else "disabled"}.', severity='high')
    db.session.commit()

    from app.extensions import socketio
    socketio.emit('maintenance_mode', {'enabled': enabled, 'message': message})
    return jsonify({'maintenance_mode': enabled, 'message': message}), 200


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
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get('enabled'), bool):
        return jsonify({'error': 'enabled must be a boolean.'}), 400
    enabled = data['enabled']
    PlatformConfig.set(flag, 'true' if enabled else 'false', g.user_id)
    _audit_platform('admin.platform.feature_toggle', 'platform_config', flag,
                    f'{flag} set to {enabled}.', severity='high')
    db.session.commit()
    return jsonify({'flag': flag, 'enabled': enabled}), 200
