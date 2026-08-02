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
