from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token
from datetime import datetime, timedelta
import bcrypt
import random
import re
import uuid

from app.extensions import db, limiter
from app.models.user import User
from app.models.institution import Institution
from app.models.otp import EmailOTP, OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS
from app.auth.utils import build_jwt_claims
from app.services.email_service import send_otp_email

auth_bp = Blueprint('auth', __name__)

OTP_PURPOSES = ('individual_register', 'institution_register')


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


def _generate_institution_code(name: str) -> str:
    """Derive a unique short institution code from its name, e.g. 'ABC Institute' -> 'ABC7F2A'."""
    base = re.sub(r'[^A-Za-z]', '', name).upper()[:6] or 'INST'
    for _ in range(20):
        candidate = f"{base}{uuid.uuid4().hex[:4].upper()}"[:20]
        if not Institution.query.filter_by(code=candidate).first():
            return candidate
    raise RuntimeError('Could not generate a unique institution code')


# ── Email OTP Verification (self-registration ONLY) ─────────────────────────────────────
# NOTE: This flow is used ONLY when someone signs themselves up (an individual
# free_user, or an institution registering itself + its first admin). Accounts
# created BY an institution/platform admin (POST /institution/users, bulk
# upload, POST /admin/institutions) are trusted, admin-initiated actions and
# never require OTP.

@auth_bp.route('/otp/send', methods=['POST'])
@limiter.limit("3 per 10 minutes")
def send_otp():
    data    = request.get_json() or {}
    email   = (data.get('email', '') or '').strip().lower()
    purpose = data.get('purpose', '')

    if not email or '@' not in email:
        return jsonify({'error': 'A valid email address is required'}), 400
    if purpose not in OTP_PURPOSES:
        return jsonify({'error': f'purpose must be one of {OTP_PURPOSES}'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with this email already exists'}), 409

    code = f"{random.randint(0, 999999):06d}"
    otp = EmailOTP(
        email=email,
        purpose=purpose,
        code_hash=EmailOTP.hash_code(code),
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    db.session.add(otp)
    db.session.commit()

    sent, error = send_otp_email(email, code, purpose)
    if not sent:
        return jsonify({'error': f'Failed to send verification email: {error}'}), 502

    return jsonify({
        'message': f'A verification code has been sent to {email}. It expires in {OTP_EXPIRY_MINUTES} minutes.',
    }), 200


@auth_bp.route('/otp/verify', methods=['POST'])
@limiter.limit("10 per 10 minutes")
def verify_otp():
    data    = request.get_json() or {}
    email   = (data.get('email', '') or '').strip().lower()
    code    = (data.get('otp', '') or '').strip()
    purpose = data.get('purpose', '')

    if not email or not code or purpose not in OTP_PURPOSES:
        return jsonify({'error': 'email, otp, and a valid purpose are required'}), 400

    otp = EmailOTP.query.filter_by(email=email, purpose=purpose).order_by(
        EmailOTP.created_at.desc()
    ).first()

    if not otp:
        return jsonify({'error': 'No verification code was requested for this email'}), 400
    if otp.verified and otp.is_verification_still_fresh:
        return jsonify({'verified': True, 'message': 'Already verified'}), 200
    if otp.is_expired:
        return jsonify({'error': 'Verification code expired. Please request a new one.'}), 400
    if otp.attempts >= OTP_MAX_ATTEMPTS:
        return jsonify({'error': 'Too many incorrect attempts. Please request a new code.'}), 400

    if not otp.check_code(code):
        otp.attempts += 1
        db.session.commit()
        remaining = max(0, OTP_MAX_ATTEMPTS - otp.attempts)
        return jsonify({'error': 'Incorrect code', 'attempts_remaining': remaining}), 400

    otp.verified    = True
    otp.verified_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'verified': True, 'message': 'Email verified successfully'}), 200


@auth_bp.route('/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    """
    Self-registration — two flows, both require a fresh verified EmailOTP:

      1. Individual account (role omitted / free_user): creates a standalone
         free_user with no institution affiliation.
      2. Institution self-registration (role='institution_admin' +
         institution_name): creates a new Institution AND its first
         institution_admin user in one call.

    Requires: PlatformConfig allow_self_registration = 'true'
    """
    from app.models.institution import PlatformConfig

    allow = PlatformConfig.get('allow_self_registration', 'false')
    if allow != 'true':
        return jsonify({
            'error': 'Self-registration is currently disabled. Contact a platform admin.',
        }), 403

    data           = request.get_json() or {}
    email          = (data.get('email', '') or '').strip().lower()
    password       = data.get('password', '')
    full_name      = (data.get('full_name', '') or '').strip()
    institution_name = (data.get('institution_name', '') or '').strip()
    is_institution = data.get('role') == 'institution_admin' and bool(institution_name)
    purpose        = 'institution_register' if is_institution else 'individual_register'

    # ── Basic validation ────────────────────────────────────────────────────
    if not email or not password or not full_name:
        return jsonify({'error': 'full_name, email, and password are required'}), 400
    if '@' not in email:
        return jsonify({'error': 'Invalid email address'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if not (re.search(r'[A-Z]', password) and re.search(r'[a-z]', password) and re.search(r'\d', password)):
        return jsonify({'error': 'Password must contain an uppercase letter, a lowercase letter, and a number'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'An account with this email already exists'}), 409

    # ── OTP gate — email must have been verified for this exact purpose ───────
    otp = EmailOTP.query.filter_by(email=email, purpose=purpose).order_by(
        EmailOTP.created_at.desc()
    ).first()
    if not otp or not otp.is_verification_still_fresh:
        return jsonify({'error': 'Please verify your email with the OTP sent to it before continuing'}), 403

    if is_institution:
        institution_code = (data.get('institution_code', '') or '').strip().upper()
        if institution_code and Institution.query.filter_by(code=institution_code).first():
            return jsonify({'error': 'That institution code is already taken'}), 409
        if not institution_code:
            institution_code = _generate_institution_code(institution_name)

        institution = Institution(
            name=institution_name,
            code=institution_code,
            institution_type=data.get('institution_type'),
            contact_email=email,
            phone=data.get('institution_phone'),
            address=data.get('address'),
            website=data.get('website'),
        )
        db.session.add(institution)
        db.session.flush()   # get institution.id before creating the admin user

        user = User(
            institution_id=institution.id,
            email=email,
            password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            full_name=full_name,
            role='institution_admin',
            phone=data.get('phone'),
        )
        db.session.add(user)
        db.session.delete(otp)   # one-time use
        db.session.commit()

        additional_claims = build_jwt_claims(user)
        token = create_access_token(identity=user.id, additional_claims=additional_claims)
        return jsonify({
            'message': f'{institution.name} and your admin account were created successfully!',
            'token': token,
            'user': user.to_dict(),
            'institution': institution.to_dict(),
        }), 201

    # ── Individual free_user account (no institution_id) ───────────────────────
    user = User(
        institution_id=None,
        email=email,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        full_name=full_name,
        role='free_user',
        phone=data.get('phone'),
    )
    db.session.add(user)
    db.session.delete(otp)   # one-time use
    db.session.commit()

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

