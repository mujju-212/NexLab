"""
Admin Blueprint — Platform Super Admin routes
Manages institutions, system health, cross-institution visibility
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.session import LabSession
from datetime import datetime
import bcrypt
import uuid
import secrets
import string
import re
from sqlalchemy.exc import IntegrityError
from app.models.academic import AuditLog

admin_bp = Blueprint('admin', __name__)


def _audit_platform(action, target_type, target_id, detail, severity='medium'):
    """Record a platform-scope administrative action (no tenant id)."""
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


def _new_temp_password():
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(20)) + '!9'


# ── Institution Management ────────────────────────────────────────────────────

@admin_bp.route('/institutions', methods=['GET'])
@require_role('platform_admin')
def list_institutions():
    institutions = Institution.query.all()
    return jsonify({'institutions': [i.to_dict() for i in institutions]}), 200


@admin_bp.route('/institutions', methods=['POST'])
@require_role('platform_admin')
def create_institution():
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    code = (data.get('code') or '').strip().upper()
    email = (data.get('contact_email') or '').strip().lower()
    plan = data.get('plan', 'free')

    if not name or not code or not email:
        return jsonify({'error': 'name, code, and contact_email are required'}), 400
    if len(code) > 20 or not re.fullmatch(r'[A-Z0-9_-]+', code):
        return jsonify({'error': 'Institution code must contain only letters, numbers, _ or - (max 20).'}), 400
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
        return jsonify({'error': 'A valid contact_email is required.'}), 400
    if plan not in ('free', 'pro', 'enterprise'):
        return jsonify({'error': 'plan must be free, pro, or enterprise.'}), 400
    if Institution.query.filter_by(code=code).first():
        return jsonify({'error': 'Institution code already exists'}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'A user with this contact email already exists.'}), 409

    # Never accept or reuse a caller-supplied/shared bootstrap password.
    temp_password = _new_temp_password()
    institution = Institution(
        name=name,
        code=code,
        email_domain=(data.get('email_domain') or '').strip() or None,
        address=(data.get('address') or '').strip() or None,
        contact_email=email,
        plan=plan,
    )
    try:
        db.session.add(institution)
        db.session.flush()
        admin_user = User(
            institution_id=institution.id,
            email=email,
            password_hash=bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode(),
            full_name=(data.get('admin_name') or '').strip() or 'Institution Admin',
            role='institution_admin',
            must_change_password=True,
        )
        db.session.add(admin_user)
        db.session.flush()
        _audit_platform(
            'admin.institution.create', 'institution', institution.id,
            f'Created institution {institution.name!r} ({institution.code})', 'high')
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'Institution code or admin email is already in use.'}), 409

    return jsonify({
        'institution': institution.to_dict(),
        'admin_user': admin_user.to_dict(),
        'temp_password': temp_password,
    }), 201


@admin_bp.route('/institutions/<institution_id>', methods=['PATCH'])
@require_role('platform_admin')
def update_institution(institution_id):
    institution = Institution.query.get_or_404(institution_id)
    data = request.get_json(silent=True) or {}
    changed = []
    for field in ('name', 'plan', 'is_active', 'email_domain'):
        if field not in data:
            continue
        value = data[field]
        if field == 'plan' and value not in ('free', 'pro', 'enterprise'):
            return jsonify({'error': 'plan must be free, pro, or enterprise.'}), 400
        if field == 'name':
            value = str(value).strip()
            if not value:
                return jsonify({'error': 'name cannot be empty.'}), 400
        if getattr(institution, field) != value:
            setattr(institution, field, value)
            changed.append(field)
    if not changed:
        return jsonify({'institution': institution.to_dict(), 'updated': False}), 200
    _audit_platform('admin.institution.update', 'institution', institution.id,
                    f'Updated {institution.code}: {", ".join(changed)}', 'medium')
    db.session.commit()
    return jsonify({'institution': institution.to_dict(), 'updated': True}), 200


# ── Platform Health Dashboard ─────────────────────────────────────────────────

@admin_bp.route('/dashboard', methods=['GET'])
@require_role('platform_admin')
def platform_dashboard():
    """Platform-wide stats for super admin"""
    from sqlalchemy import func
    from app.models.session import LabSession

    total_institutions = Institution.query.count()
    active_institutions = Institution.query.filter_by(is_active=True).count()
    total_users = User.query.count()
    active_sessions = LabSession.query.filter_by(status='active').count()

    # Today's active institutions
    from datetime import date
    today_str = date.today().isoformat()

    return jsonify({
        'institutions': {
            'total': total_institutions,
            'active': active_institutions,
        },
        'users': {'total': total_users},
        'live_sessions': {'active': active_sessions},
    }), 200


@admin_bp.route('/health', methods=['GET'])
@require_role('platform_admin')
def system_health():
    """Check health of external services"""
    import subprocess
    from flask import current_app

    health = {'execution': 'unknown', 'database': 'unknown', 'groq': 'unknown'}

    # Check the Docker execution engine (daemon reachable + enabled)
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        health['execution'] = 'disabled'
    else:
        try:
            r = subprocess.run(
                [current_app.config.get('DOCKER_BIN', 'docker'),
                 'version', '--format', '{{.Server.Version}}'],
                capture_output=True, timeout=5,
            )
            health['execution'] = 'online' if r.returncode == 0 else 'degraded'
        except Exception:
            health['execution'] = 'offline'

    # Check DB
    try:
        db.session.execute(db.text('SELECT 1'))
        health['database'] = 'online'
    except Exception:
        health['database'] = 'offline'

    # Check Groq (simple check — don't call API, just verify key is set)
    health['groq'] = 'configured' if current_app.config.get('GROQ_API_KEY') else 'not_configured'

    return jsonify({'health': health}), 200


# ── Groq Usage Across Institutions ────────────────────────────────────────────

@admin_bp.route('/groq-usage', methods=['GET'])
@require_role('platform_admin')
def groq_usage():
    from datetime import date
    from sqlalchemy import text
    today = date.today().isoformat()
    result = db.session.execute(
        text("SELECT institution_id, count FROM groq_usage WHERE usage_date = :date ORDER BY count DESC"),
        {'date': today}
    ).fetchall()
    return jsonify({
        'date': today,
        'usage': [{'institution_id': r[0], 'count': r[1]} for r in result]
    }), 200


# ── Institution Detail & Suspension ───────────────────────────────────────────

@admin_bp.route('/institutions/<institution_id>', methods=['GET'])
@require_role('platform_admin')
def get_institution(institution_id):
    """Full institution detail — user counts, session counts, Groq usage"""
    from datetime import date
    inst = Institution.query.get_or_404(institution_id)

    total_students    = User.query.filter_by(institution_id=institution_id, role='student').count()
    total_instructors = User.query.filter_by(institution_id=institution_id, role='instructor').count()
    total_sessions    = LabSession.query.filter_by(institution_id=institution_id).count()
    live_sessions     = LabSession.query.filter_by(institution_id=institution_id, status='active').count()

    today = date.today().isoformat()
    from sqlalchemy import text
    groq_today = db.session.execute(
        text("SELECT count FROM groq_usage WHERE institution_id=:iid AND usage_date=:d"),
        {'iid': institution_id, 'd': today}
    ).fetchone()

    return jsonify({
        'institution': inst.to_dict(),
        'stats': {
            'students':    total_students,
            'instructors': total_instructors,
            'sessions':    total_sessions,
            'live':        live_sessions,
            'groq_today':  groq_today[0] if groq_today else 0,
        }
    }), 200


@admin_bp.route('/institutions/<institution_id>/suspend', methods=['POST'])
@require_role('platform_admin')
def suspend_institution(institution_id):
    """Suspend a tenant; the auth guard enforces this for new and live sessions."""
    inst = Institution.query.get_or_404(institution_id)
    data = request.get_json(silent=True) or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'A suspension reason is required.'}), 400
    if inst.is_active:
        inst.is_active = False
        _audit_platform('admin.institution.suspend', 'institution', inst.id,
                        f'Suspended {inst.name!r}: {reason}', 'high')
        db.session.commit()
    return jsonify({'message': f'{inst.name} suspended', 'reason': reason, 'is_active': False}), 200


@admin_bp.route('/institutions/<institution_id>/activate', methods=['POST'])
@require_role('platform_admin')
def activate_institution(institution_id):
    """Reactivate a tenant and record the administrative transition."""
    inst = Institution.query.get_or_404(institution_id)
    if not inst.is_active:
        inst.is_active = True
        _audit_platform('admin.institution.activate', 'institution', inst.id,
                        f'Reactivated {inst.name!r}', 'medium')
        db.session.commit()
    return jsonify({'message': f'{inst.name} activated', 'is_active': True}), 200


@admin_bp.route('/institutions/<institution_id>/reset-admin-password', methods=['POST'])
@require_role('platform_admin')
def reset_admin_password(institution_id):
    """Issue a unique one-time password and revoke every old admin session."""
    admin = User.query.filter_by(
        institution_id=institution_id,
        role='institution_admin'
    ).first_or_404()

    temp_password = _new_temp_password()
    admin.password_hash = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()
    admin.must_change_password = True
    admin.force_logout_at = datetime.utcnow()
    from app.auth.utils import invalidate_force_logout_cache
    invalidate_force_logout_cache(admin.id)
    _audit_platform('admin.institution_admin.reset_password', 'user', admin.id,
                    f'Issued temporary password for institution admin {admin.email}; all sessions revoked.', 'high')
    db.session.commit()
    return jsonify({
        'message': f'Temporary password issued for {admin.email}',
        'email': admin.email,
        'temp_password': temp_password,
        'must_change_password': True,
    }), 200


# ── Platform-Wide User Search ──────────────────────────────────────────────────

@admin_bp.route('/users/search', methods=['GET'])
@require_role('platform_admin')
def search_users():
    """
    Find any user across all institutions.
    Params: ?q=email_or_name&role=student&institution_id=...
    """
    q               = request.args.get('q', '')
    role            = request.args.get('role')
    institution_id  = request.args.get('institution_id')

    query = User.query
    if q:
        query = query.filter(
            db.or_(
                User.email.ilike(f'%{q}%'),
                User.full_name.ilike(f'%{q}%'),
                User.roll_number.ilike(f'%{q}%'),
            )
        )
    if role:
        query = query.filter_by(role=role)
    if institution_id:
        query = query.filter_by(institution_id=institution_id)

    users = query.limit(50).all()
    return jsonify({'users': [u.to_dict() for u in users], 'count': len(users)}), 200


# ── Docker Environment Profile Approval ───────────────────────────────────────

@admin_bp.route('/environments/pending', methods=['GET'])
@require_role('platform_admin')
def pending_environments():
    """List all custom Docker environment requests awaiting approval"""
    from app.models.subject import EnvironmentProfile
    pending = EnvironmentProfile.query.filter_by(
        is_platform_default=False,
        build_status='pending'
    ).all()
    return jsonify({'pending': [e.to_dict() for e in pending]}), 200


@admin_bp.route('/environments/<env_id>/approve', methods=['POST'])
@require_role('platform_admin')
def approve_environment(env_id):
    """Approve + mark an environment as building"""
    from app.models.subject import EnvironmentProfile
    profile = EnvironmentProfile.query.get_or_404(env_id)
    profile.build_status = 'approved'
    db.session.commit()
    return jsonify({'message': f'{profile.display_name} approved for build', 'profile': profile.to_dict()}), 200


@admin_bp.route('/environments/<env_id>/reject', methods=['POST'])
@require_role('platform_admin')
def reject_environment(env_id):
    """Reject a custom environment request"""
    from app.models.subject import EnvironmentProfile
    profile = EnvironmentProfile.query.get_or_404(env_id)
    profile.build_status = 'rejected'
    db.session.commit()
    return jsonify({'message': f'{profile.display_name} rejected'}), 200


# ── Platform-Wide Announcements ────────────────────────────────────────────────

@admin_bp.route('/announcements', methods=['POST'])
@require_role('platform_admin')
def platform_announcement():
    """
    Broadcast to ALL institution admins across ALL institutions.
    Body: { title, message }
    """
    from app.models.feedback import Notification
    data    = request.get_json()
    title   = data.get('title', '')
    message = data.get('message', '')

    if not title or not message:
        return jsonify({'error': 'title and message required'}), 400

    admins = User.query.filter_by(role='institution_admin', is_active=True).all()
    for admin in admins:
        db.session.add(Notification(
            user_id=admin.id,
            type='announcement',
            title=title,
            message=message,
        ))

    # SocketIO broadcast to all connected institution admins
    from app.extensions import socketio
    socketio.emit('platform_announcement', {
        'title': title,
        'message': message,
        'from': 'NexLab Platform',
        'timestamp': datetime.utcnow().isoformat(),
    })

    db.session.commit()
    return jsonify({'sent_to': len(admins)}), 201


# ── Platform Stats Snapshot ────────────────────────────────────────────────────

@admin_bp.route('/stats/snapshot', methods=['GET'])
@require_role('platform_admin')
def stats_snapshot():
    """
    Full platform snapshot — institutions breakdown, plan distribution,
    total sessions today, peak activity.
    """
    from datetime import date
    from sqlalchemy import func

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    sessions_today = LabSession.query.filter(
        LabSession.started_at >= today_start
    ).count()

    plan_dist = db.session.query(
        Institution.plan, func.count(Institution.id)
    ).group_by(Institution.plan).all()

    institutions_by_size = db.session.query(
        Institution.id,
        Institution.name,
        Institution.plan,
        func.count(User.id).label('user_count')
    ).join(User, User.institution_id == Institution.id
    ).group_by(Institution.id).order_by(
        db.text('user_count DESC')
    ).limit(10).all()

    return jsonify({
        'sessions_today': sessions_today,
        'plan_distribution': {plan: count for plan, count in plan_dist},
        'top_institutions': [
            {'id': r[0], 'name': r[1], 'plan': r[2], 'users': r[3]}
            for r in institutions_by_size
        ],
    }), 200
