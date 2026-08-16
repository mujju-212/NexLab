from datetime import datetime
from functools import wraps
from flask import g, jsonify, request
from flask_jwt_extended import verify_jwt_in_request, get_jwt


def _is_force_logged_out(claims: dict) -> bool:
    """
    True when an admin force-logged-out this user AFTER the presented
    token was issued — i.e. the token predates force_logout_at and must
    be rejected (there is no blacklist, so we compare timestamps).
    """
    iat = claims.get('iat')
    if not iat:
        return False
    from app.extensions import db
    from app.models.user import User
    user = db.session.get(User, claims.get('sub'))
    if user is None or user.force_logout_at is None:
        return False
    return user.force_logout_at > datetime.utcfromtimestamp(int(iat))


def _force_logout_response():
    return jsonify({
        'error': 'Your session was terminated by an administrator. Please log in again.'
    }), 401


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
    }
