from datetime import datetime
from functools import wraps
from flask import g, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt

# Endpoints a user may still call while their password is forced-expired —
# enough to change the password and read their own identity. Everything else
# returns 403 PASSWORD_CHANGE_REQUIRED.
_PASSWORD_GATE_EXEMPT = (
    '/auth/change-password',
    '/auth/me',
    '/auth/logout',
)


def _password_change_block(claims: dict):
    """
    403 response when the user's credentials are admin-issued temp passwords
    they have not replaced yet. Returns None when the request may proceed.
    """
    if not claims.get('must_change_password'):
        return None
    path = (request.path or '').rstrip('/')
    if any(path.endswith(exempt) for exempt in _PASSWORD_GATE_EXEMPT):
        return None
    return jsonify({
        'error': 'You must change your password before continuing.',
        'code': 'PASSWORD_CHANGE_REQUIRED',
    }), 403


import time as _time
_FORCE_LOGOUT_CACHE: dict = {}  # user_id -> (expires_monotonic, force_logout_at)


def invalidate_force_logout_cache(user_id: str = None) -> None:
    """Invalidate cached force_logout_at for a specific user (or all users)."""
    if user_id:
        _FORCE_LOGOUT_CACHE.pop(user_id, None)
    else:
        _FORCE_LOGOUT_CACHE.clear()


invalidate_auth_cache = invalidate_force_logout_cache
_AUTH_USER_CACHE = _FORCE_LOGOUT_CACHE


def _force_logout_response():
    return jsonify({
        'error': 'Your session is invalid or has expired. Please log in again.'
    }), 401


def _is_force_logged_out(claims: dict) -> bool:
    """
    True when an admin force-logged-out this user AFTER the presented
    token was issued, OR the user account no longer exists in the database
    (cached for 30s in memory to avoid per-request DB scans).
    """
    iat = claims.get('iat')
    uid = claims.get('sub')
    if not iat or not uid:
        return True
    now_mono = _time.monotonic()
    cached = _FORCE_LOGOUT_CACHE.get(uid)
    if cached and cached[0] > now_mono:
        force_dt, user_exists = cached[1], cached[2]
        if not user_exists:
            return True
    else:
        from app.extensions import db
        from app.models.user import User
        row = db.session.query(User.id, User.force_logout_at).filter_by(id=uid).first()
        if not row:
            # User row does not exist in database (deleted or stale token)
            _FORCE_LOGOUT_CACHE[uid] = (now_mono + 30.0, None, False)
            return True
        force_dt = row[1]
        _FORCE_LOGOUT_CACHE[uid] = (now_mono + 30.0, force_dt, True)
    if force_dt is None:
        return False
    return force_dt > datetime.utcfromtimestamp(int(iat))


def require_auth(f):
    """Verify JWT and inject user context into Flask g"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        verify_jwt_in_request()
        claims = get_jwt()
        if _is_force_logged_out(claims):
            return _force_logout_response()
        blocked = _password_change_block(claims)
        if blocked:
            return blocked
        g.user_id        = claims['sub']
        g.institution_id = claims.get('institution_id')
        g.role           = claims.get('role')
        return f(*args, **kwargs)
    return decorated


def require_role(*roles):
    """Restrict endpoint to specific roles"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method == 'OPTIONS':
                return f(*args, **kwargs)
            verify_jwt_in_request()
            claims = get_jwt()
            if _is_force_logged_out(claims):
                return _force_logout_response()
            blocked = _password_change_block(claims)
            if blocked:
                return blocked
            if claims.get('role') not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            g.user_id        = claims['sub']
            g.institution_id = claims.get('institution_id')
            g.role           = claims.get('role')
            return f(*args, **kwargs)
        return decorated
    return decorator


def require_institution(f):
    """Ensure request comes from an institution user (not platform_admin)"""
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        verify_jwt_in_request()
        claims = get_jwt()
        if _is_force_logged_out(claims):
            return _force_logout_response()
        blocked = _password_change_block(claims)
        if blocked:
            return blocked
        if not claims.get('institution_id'):
            return jsonify({'error': 'Institution context required'}), 403
        g.user_id        = claims['sub']
        g.institution_id = claims['institution_id']
        g.role           = claims.get('role')
        return f(*args, **kwargs)
    return decorated



def build_jwt_claims(user):
    """Build additional claims for JWT token"""
    return {
        'institution_id': user.institution_id,
        'role': user.role,
        'full_name': user.full_name,
        'must_change_password': bool(user.must_change_password),
    }
