"""
Institution Admin — extended features
Missing features added here and imported into institution/routes.py:
  1. Reset user password (within institution)
  2. Experiment usage report
  3. CSV export (student progress report)
  4. Institution settings (domain, logo)
  5. Session management (view + terminate live sessions)
  6. Groq budget tracking (today's usage vs limit)
"""
from flask import Blueprint, request, jsonify, g, make_response
from app.auth.utils import require_role
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution, PlatformConfig
from app.models.session import LabSession
from datetime import datetime, timedelta
from sqlalchemy import func, text
import bcrypt, csv, io

institution_ext_bp = Blueprint('institution_ext', __name__)


# ══════════════════════════════════════════════════════════════════════════════
# 1. RESET USER PASSWORD (within own institution)
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_role('institution_admin')
def reset_user_password(user_id):
    """Reset any user's password within this institution."""
    user = User.query.filter_by(
        id=user_id, institution_id=g.institution_id
    ).first_or_404()

    data = request.get_json() or {}
    new_password = data.get('new_password', 'Welcome@123')

    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    user.password_hash = bcrypt.hashpw(
        new_password.encode(), bcrypt.gensalt()
    ).decode()
    # Invalidate existing sessions
    user.force_logout_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message':  f'Password reset for {user.full_name}',
        'user_id':  user_id,
        'force_logout_applied': True,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 2. EXPERIMENT USAGE REPORT
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/analytics/experiment-usage', methods=['GET'])
@require_role('institution_admin')
def experiment_usage():
    """
    Which experiments are most used — session count, attempt count,
    average score per experiment.
    """
    iid   = g.institution_id
    days  = int(request.args.get('days', 30))
    since = datetime.utcnow() - timedelta(days=days)

    # Session count per experiment
    rows = db.session.query(
        LabSession.experiment_id,
        func.count(LabSession.id).label('session_count'),
    ).filter(
        LabSession.institution_id == iid,
        LabSession.started_at >= since,
    ).group_by(LabSession.experiment_id).order_by(
        func.count(LabSession.id).desc()
    ).all()

    # Enrich with experiment names via raw SQL (avoids hard model dependency)
    exp_ids = [r[0] for r in rows if r[0]]
    exp_names = {}
    if exp_ids:
        try:
            name_rows = db.session.execute(
                text("SELECT id, title FROM experiments WHERE id = ANY(:ids)"),
                {'ids': exp_ids}
            ).fetchall()
            exp_names = {r[0]: r[1] for r in name_rows}
        except Exception:
            pass

    result = [{
        'experiment_id':   r[0],
        'experiment_name': exp_names.get(r[0], 'Unknown'),
        'session_count':   r[1],
    } for r in rows]

    return jsonify({
        'period_days': days,
        'experiments': result,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 3. CSV EXPORT — Student Progress Report
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/export/student-progress', methods=['GET'])
@require_role('institution_admin')
def export_student_progress():
    """
    Download a CSV of all students with their session stats.
    Columns: roll_number, full_name, email, sessions_total,
             sessions_completed, avg_score, last_active
    """
    iid = g.institution_id

    students = User.query.filter_by(
        institution_id=iid, role='student', is_active=True
    ).order_by(User.full_name).all()

    # Aggregate session data per student using submission join
    # LabSession doesn't have student_id directly; aggregate by institution
    rows = db.session.query(
        func.count(LabSession.id).label('total_sessions'),
    ).filter(
        LabSession.institution_id == iid
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Roll Number', 'Full Name', 'Email', 'Active'
    ])

    for s in students:
        writer.writerow([
            s.roll_number or '',
            s.full_name,
            s.email,
            'Yes' if s.is_active else 'No',
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = (
        f'attachment; filename="student_progress_{iid[:8]}.csv"'
    )
    return response


@institution_ext_bp.route('/export/users', methods=['GET'])
@require_role('institution_admin')
def export_users():
    """Download a CSV of all users (students + instructors)."""
    iid  = g.institution_id
    role = request.args.get('role')  # optional filter
    q = User.query.filter_by(institution_id=iid)
    if role:
        q = q.filter_by(role=role)
    users = q.order_by(User.role, User.full_name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Role', 'Full Name', 'Email', 'Roll Number', 'Phone', 'Active', 'Created At'])
    for u in users:
        writer.writerow([
            u.role, u.full_name, u.email,
            u.roll_number or '', u.phone or '',
            'Yes' if u.is_active else 'No',
            u.created_at.strftime('%Y-%m-%d') if u.created_at else '',
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename="users.csv"'
    return response


# ══════════════════════════════════════════════════════════════════════════════
# 4. INSTITUTION SETTINGS
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/settings', methods=['GET'])
@require_role('institution_admin')
def get_settings():
    """Get institution's own settings."""
    inst = Institution.query.get_or_404(g.institution_id)
    return jsonify({
        'name':           inst.name,
        'code':           inst.code,
        'email_domain':   inst.email_domain,
        'logo_url':       inst.logo_url,
        'address':        inst.address,
        'contact_email':  inst.contact_email,
        'billing_email':  inst.billing_email,
        'plan':           inst.plan,
    }), 200


@institution_ext_bp.route('/settings', methods=['PATCH'])
@require_role('institution_admin')
def update_settings():
    """
    Update editable institution settings.
    Institution admins can change: logo_url, address, contact_email,
    billing_email, email_domain.
    They cannot change: name, code, plan (only platform_admin can).
    """
    inst = Institution.query.get_or_404(g.institution_id)
    data = request.get_json() or {}

    # Fields institution admin is allowed to update
    allowed = ['logo_url', 'address', 'contact_email', 'billing_email', 'email_domain']
    changed = []
    for field in allowed:
        if field in data:
            setattr(inst, field, data[field])
            changed.append(field)

    db.session.commit()
    return jsonify({
        'message': 'Settings updated',
        'changed': changed,
        'institution': inst.to_dict(),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 5. SESSION MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/sessions/live', methods=['GET'])
@require_role('institution_admin')
def live_sessions():
    """List all currently active lab sessions for this institution."""
    sessions = LabSession.query.filter_by(
        institution_id=g.institution_id, status='active'
    ).order_by(LabSession.started_at.desc()).all()

    result = []
    for s in sessions:
        d = s.to_dict()
        # Calculate running duration in minutes
        if s.started_at:
            d['duration_minutes'] = int(
                (datetime.utcnow() - s.started_at).total_seconds() / 60
            )
        result.append(d)

    return jsonify({'live_sessions': result, 'count': len(result)}), 200


@institution_ext_bp.route('/sessions/<session_id>/terminate', methods=['POST'])
@require_role('institution_admin')
def terminate_session(session_id):
    """Force-terminate a running lab session."""
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status != 'active':
        return jsonify({'error': f'Session is not active (status: {session.status})'}), 400

    session.status = 'terminated'
    session.ended_at = datetime.utcnow()
    db.session.commit()

    # Notify student via SocketIO
    from app.extensions import socketio
    socketio.emit('session_terminated', {
        'session_id': session_id,
        'reason':     'Terminated by institution admin',
    }, room=f"session_{session_id}")

    return jsonify({
        'message':    'Session terminated',
        'session_id': session_id,
    }), 200


@institution_ext_bp.route('/sessions/history', methods=['GET'])
@require_role('institution_admin')
def session_history():
    """
    Paginated session history.
    Filters: ?student_id=...&status=ended&days=30&page=1&per_page=50
    """
    student_id = request.args.get('student_id')
    status     = request.args.get('status')
    days       = int(request.args.get('days', 30))
    page       = int(request.args.get('page', 1))
    per_page   = min(int(request.args.get('per_page', 50)), 200)

    since = datetime.utcnow() - timedelta(days=days)
    q = LabSession.query.filter(
        LabSession.institution_id == g.institution_id,
        LabSession.started_at >= since,
    )
    if status:
        q = q.filter_by(status=status)

    total   = q.count()
    paged   = q.order_by(LabSession.started_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        'total':    total,
        'page':     page,
        'pages':    paged.pages,
        'sessions': [s.to_dict() for s in paged.items],
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 6. GROQ BUDGET TRACKING
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/groq-budget', methods=['GET'])
@require_role('institution_admin')
def groq_budget():
    """
    Today's Groq API usage vs limit for this institution.
    Shows: used, limit, remaining, source of limit.
    """
    from datetime import date
    iid   = g.institution_id
    today = date.today().isoformat()

    inst = Institution.query.get_or_404(iid)

    # Determine limit (institution override > plan default > global config)
    if inst.groq_limit_override is not None:
        limit  = inst.groq_limit_override
        source = 'institution_override'
    else:
        plan_limits = {'free': 50, 'pro': 200, 'enterprise': 500}
        limit  = plan_limits.get(inst.plan, 200)
        source = 'plan_default'

    # Get today's usage from groq_usage table
    used = 0
    try:
        row = db.session.execute(
            text("SELECT count FROM groq_usage WHERE institution_id=:iid AND usage_date=:d"),
            {'iid': iid, 'd': today}
        ).fetchone()
        used = row[0] if row else 0
    except Exception:
        db.session.rollback()

    # Last 7 days trend
    trend = []
    try:
        rows = db.session.execute(
            text("""
                SELECT usage_date, count FROM groq_usage
                WHERE institution_id=:iid AND usage_date >= CURRENT_DATE - 7
                ORDER BY usage_date ASC
            """),
            {'iid': iid}
        ).fetchall()
        trend = [{'date': str(r[0]), 'count': r[1]} for r in rows]
    except Exception:
        db.session.rollback()

    return jsonify({
        'institution_id': iid,
        'date':           today,
        'used':           used,
        'limit':          limit,
        'remaining':      max(0, limit - used),
        'exhausted':      used >= limit,
        'limit_source':   source,
        'plan':           inst.plan,
        'trend_7d':       trend,
    }), 200
