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

admin_bp = Blueprint('admin', __name__)


# ── Institution Management ────────────────────────────────────────────────────

@admin_bp.route('/institutions', methods=['GET'])
@require_role('platform_admin')
def list_institutions():
    institutions = Institution.query.all()
    return jsonify({'institutions': [i.to_dict() for i in institutions]}), 200


@admin_bp.route('/institutions', methods=['POST'])
@require_role('platform_admin')
def create_institution():
    data = request.get_json()
    required = ['name', 'code', 'contact_email']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    if Institution.query.filter_by(code=data['code'].upper()).first():
        return jsonify({'error': 'Institution code already exists'}), 409

    institution = Institution(
        name=data['name'],
        code=data['code'].upper(),
        email_domain=data.get('email_domain'),
        address=data.get('address'),
        contact_email=data['contact_email'],
        plan=data.get('plan', 'free'),
    )
    db.session.add(institution)
    db.session.flush()   # get id before commit

    # Create institution admin account
    admin_password = data.get('admin_password', 'ChangeMe@123')
    admin_user = User(
        institution_id=institution.id,
        email=data['contact_email'],
        password_hash=bcrypt.hashpw(admin_password.encode(), bcrypt.gensalt()).decode(),
        full_name=data.get('admin_name', 'Institution Admin'),
        role='institution_admin',
    )
    db.session.add(admin_user)
    db.session.commit()

    return jsonify({
        'institution': institution.to_dict(),
        'admin_user': admin_user.to_dict(),
        'temp_password': admin_password,
    }), 201


@admin_bp.route('/institutions/<institution_id>', methods=['PATCH'])
@require_role('platform_admin')
def update_institution(institution_id):
    institution = Institution.query.get_or_404(institution_id)
    data = request.get_json()
    for field in ['name', 'plan', 'is_active', 'email_domain']:
        if field in data:
            setattr(institution, field, data[field])
    db.session.commit()
    return jsonify({'institution': institution.to_dict()}), 200


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
    import requests as req
    from flask import current_app

    judge0_url = current_app.config['JUDGE0_URL']
    health = {'judge0': 'unknown', 'database': 'unknown', 'groq': 'unknown'}

    # Check Judge0
    try:
        r = req.get(f"{judge0_url}/system_info", timeout=3)
        health['judge0'] = 'online' if r.status_code == 200 else 'degraded'
    except Exception:
        health['judge0'] = 'offline'

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
    """Suspend (disable) an institution — all logins blocked"""
    inst = Institution.query.get_or_404(institution_id)
    reason = request.get_json().get('reason', '')
    inst.is_active = False
    db.session.commit()
    return jsonify({'message': f'{inst.name} suspended', 'reason': reason}), 200


@admin_bp.route('/institutions/<institution_id>/activate', methods=['POST'])
@require_role('platform_admin')
def activate_institution(institution_id):
    """Re-activate a suspended institution"""
    inst = Institution.query.get_or_404(institution_id)
    inst.is_active = True
    db.session.commit()
    return jsonify({'message': f'{inst.name} activated'}), 200


@admin_bp.route('/institutions/<institution_id>/reset-admin-password', methods=['POST'])
@require_role('platform_admin')
def reset_admin_password(institution_id):
    """Reset the institution admin account password"""
    admin = User.query.filter_by(
        institution_id=institution_id,
        role='institution_admin'
    ).first_or_404()

    new_password = request.get_json().get('new_password', 'ChangeMe@123')
    admin.password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    db.session.commit()
    return jsonify({'message': f'Password reset for {admin.email}'}), 200


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
