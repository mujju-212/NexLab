from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token
from datetime import datetime
import bcrypt

from app.extensions import db, limiter
from app.models.user import User
from app.auth.utils import build_jwt_claims

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.get_json()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password required'}), 400

    user = User.query.filter_by(email=email, is_active=True).first()
    if not user:
        return jsonify({'error': 'Invalid credentials'}), 401

    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        return jsonify({'error': 'Invalid credentials'}), 401

    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()

    # Create JWT with custom claims
    additional_claims = build_jwt_claims(user)
    token = create_access_token(identity=user.id, additional_claims=additional_claims)

    return jsonify({
        'token': token,
        'user': user.to_dict(),
    }), 200


@auth_bp.route('/me', methods=['GET'])
def me():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    verify_jwt_in_request()
    claims = get_jwt()
    user = User.query.get(claims['sub'])
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user.to_dict()}), 200


@auth_bp.route('/change-password', methods=['POST'])
def change_password():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    verify_jwt_in_request()
    claims = get_jwt()
    data = request.get_json()

    current_pw = data.get('current_password', '')
    new_pw     = data.get('new_password', '')

    if len(new_pw) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    user = User.query.get(claims['sub'])
    if not bcrypt.checkpw(current_pw.encode(), user.password_hash.encode()):
        return jsonify({'error': 'Current password incorrect'}), 401

    user.password_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    db.session.commit()
    return jsonify({'message': 'Password updated successfully'}), 200


@auth_bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    """
    Self-registration for free/individual users.
    Creates a free_user account with no institution affiliation.
    Requires: PlatformConfig allow_self_registration = 'true'
    """
    from app.models.institution import PlatformConfig

    # Check if self-registration is enabled
    allow = PlatformConfig.get('allow_self_registration', 'false')
    if allow != 'true':
        return jsonify({
            'error': 'Self-registration is currently disabled. Contact a platform admin.',
        }), 403

    data     = request.get_json()
    email    = (data.get('email', '') or '').strip().lower()
    password = data.get('password', '')
    full_name= (data.get('full_name', '') or '').strip()

    # Validation
    if not email or not password or not full_name:
        return jsonify({'error': 'full_name, email, and password are required'}), 400

    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    if '@' not in email:
        return jsonify({'error': 'Invalid email address'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with this email already exists'}), 409

    # Create free_user account (no institution_id)
    user = User(
        institution_id=None,
        email=email,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        full_name=full_name,
        role='free_user',
        phone=data.get('phone'),
    )
    db.session.add(user)
    db.session.commit()

    # Auto-login: return token immediately
    additional_claims = build_jwt_claims(user)
    token = create_access_token(identity=user.id, additional_claims=additional_claims)

    return jsonify({
        'message': 'Account created successfully!',
        'token': token,
        'user': user.to_dict(),
    }), 201


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    Stateless JWT logout — client drops the token.
    Endpoint exists for future token blacklisting.
    """
    return jsonify({'message': 'Logged out successfully'}), 200

