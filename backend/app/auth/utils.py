from functools import wraps
from flask import g, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt


def require_auth(f):
    """Verify JWT and inject user context into Flask g"""
    @wraps(f)
    def decorated(*args, **kwargs):
        verify_jwt_in_request()
        claims = get_jwt()
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
            verify_jwt_in_request()
            claims = get_jwt()
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
        verify_jwt_in_request()
        claims = get_jwt()
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
