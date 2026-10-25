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
    token was issued, the account is administratively suspended, or the
    user no longer exists (cached 30s in memory to avoid per-request DB
    scans). Suspended accounts fail here so their live tokens die at once;
    the login route gives them the explanatory 'Account suspended' error.
    """
    iat = claims.get('iat')
    uid = claims.get('sub')
    if not iat or not uid:
        return True
    now_mono = _time.monotonic()
    cached = _FORCE_LOGOUT_CACHE.get(uid)
    if cached and cached[0] > now_mono:
        force_dt, user_exists, suspended = cached[1], cached[2], cached[3]
        if not user_exists:
            return True
    else:
        from app.extensions import db
        from app.models.user import User
        row = db.session.query(
            User.id, User.force_logout_at, User.status, User.suspended_until
        ).filter_by(id=uid).first()
        if not row:
            # User row does not exist in database (deleted or stale token)
            _FORCE_LOGOUT_CACHE[uid] = (now_mono + 30.0, None, False, False)
            return True
        force_dt = row[1]
        suspended = (row[2] == 'suspended') and (
            row[3] is None or row[3] > datetime.utcnow())
        _FORCE_LOGOUT_CACHE[uid] = (now_mono + 30.0, force_dt, True, suspended)
    if suspended:
        return True
    if force_dt is None:
        return False
    # 'iat_f' is a float-precision issue-time claim (see build_jwt_claims).
    # flask-jwt's standard 'iat' is truncated to whole seconds, so a token
    # re-issued within the same wall-second as the logout would otherwise
    # look revoked. Prefer iat_f; for legacy tokens without it, allow a
    # one-second grace on the truncated comparison.
    iat_f = claims.get('iat_f')
    if iat_f is not None:
        return force_dt > datetime.utcfromtimestamp(float(iat_f))
    from datetime import timedelta as _td
    return force_dt > datetime.utcfromtimestamp(float(iat)) + _td(seconds=1)


def _impersonation_write_block(claims):
    """
    Impersonated sessions are READ-ONLY by policy. The minted token carries
    the TARGET's role, so role checks alone would happily let an impersonated
    instructor save grades or an impersonated student hijack the account via
    change-password — every non-GET request on an impersonation token is
    refused here, except ending the session itself.
    """
    if not claims.get('imp') or request.method in ('GET', 'HEAD', 'OPTIONS'):
        return None
    path = (request.path or '').rstrip('/')
    if path.endswith('/admin/impersonation/end'):
        return None
    return jsonify({
        'error': 'Read-only mode: this action is not available while impersonating.',
        'code': 'IMPERSONATING',
    }), 403


def reject_if_impersonating():
    """Explicit guard for JWT-handling routes outside the decorators."""
    return _impersonation_write_block(get_jwt())


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
        blocked = _impersonation_write_block(claims)
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
            blocked = _impersonation_write_block(claims)
            if blocked:
                return blocked
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
    import time as _t
    return {
        'institution_id': user.institution_id,
        'role': user.role,
        'full_name': user.full_name,
        'must_change_password': bool(user.must_change_password),
        # float-precision issue time — the force-logout check needs more
        # resolution than flask-jwt's whole-second 'iat'.
        'iat_f': _t.time(),
    }
