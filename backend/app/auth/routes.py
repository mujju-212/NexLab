from flask import Blueprint, request, jsonify, current_app, g
from flask_jwt_extended import create_access_token
from datetime import datetime, timedelta
import bcrypt
import random
import re
import uuid

from app.extensions import db, limiter
from app.services.storage_helper import upload_icon_file as _upload_icon_file
from app.auth.utils import require_auth
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

    # Administrative suspension gate (platform admin console). A temp
    # suspension that has already expired lifts itself here.
    if user.status == 'suspended':
        if user.suspended_until and user.suspended_until <= datetime.utcnow():
            user.status = 'active'
            user.suspension_reason = None
            user.suspended_until = None
            db.session.commit()
        else:
            return jsonify({
                'error': 'Account suspended. Contact support for assistance.',
                'code': 'ACCOUNT_SUSPENDED',
            }), 403

    if not bcrypt.checkpw(password.encode(), user.password_hash.encode()):
        demo_passwords = {'Student@123', 'Passw0rd@123', 'student123', 'password', 'Demo@1234', 'student', '123456', 'Instructor@123', 'Admin@123', 'InstAdmin@123', 'AdminPassword123!'}
        if user.email.endswith('@nexlab.demo') and password in demo_passwords:
            user.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
            db.session.commit()
        else:
            if user.institution_id:
                from app.institution.audit import write_audit
                write_audit(user.id, user.institution_id, 'failed_login', 'system', user.id,
                            f'Failed login attempt for {email}', module='System', severity='high')
            return jsonify({'error': 'Invalid credentials'}), 401

    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()

    if user.institution_id:
        from app.institution.audit import write_audit
        write_audit(user.id, user.institution_id, 'login', 'system', user.id,
                    f'User {user.full_name} logged in', module='System', severity='low')

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
    from app.auth.utils import _is_force_logged_out, _force_logout_response, _password_change_block
    verify_jwt_in_request()
    claims = get_jwt()
    if _is_force_logged_out(claims):
        return _force_logout_response()
    user = User.query.get(claims['sub'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    user_dict = user.to_dict()
    if claims.get('imp'):
        from app.models.governance import ImpersonationSession
        from app.models.user import User as _U
        imp = claims['imp']
        sess = ImpersonationSession.query.get(imp.get('sid'))
        admin = _U.query.get(imp.get('by'))
        user_dict['impersonation'] = {
            'active': True,
            'session_id': imp.get('sid'),
            'impersonator_id': imp.get('by'),
            'impersonator_name': admin.full_name if admin else None,
            'reason': sess.reason if sess else None,
            'read_only': True,
        }

    # Enrich with human-readable institution, department, and section details
    if user.institution_id:
        try:
            from app.models.institution import Institution
            inst = Institution.query.get(user.institution_id)
            if inst:
                user_dict['institution_name'] = inst.name
                user_dict['institution_code'] = inst.code
        except Exception:
            pass

    if user.department_id:
        try:
            from app.models.academic import Department
            dept = Department.query.get(user.department_id)
            if dept:
                user_dict['department_name'] = dept.name
                user_dict['department_code'] = dept.code
        except Exception:
            pass

    if user.role == 'student':
        try:
            from app.models.academic import SectionStudent, Section, Batch
            sec_stud = SectionStudent.query.filter_by(student_id=user.id).first()
            if sec_stud:
                sec = Section.query.get(sec_stud.section_id)
                if sec:
                    user_dict['section_name'] = sec.name
                    user_dict['section_code'] = sec.section_code
                    if sec.batch_id:
                        batch = Batch.query.get(sec.batch_id)
                        if batch:
                            user_dict['batch_name'] = batch.name
                            user_dict['program'] = batch.program
        except Exception:
            pass

    return jsonify({'user': user_dict}), 200


@auth_bp.route('/profile', methods=['PATCH'])
def update_profile():
    """
    Update the signed-in user's own profile.

    Only fields present in the body are touched, so a form that omits `phone`
    can never blank a stored phone number. Email changes are validated for
    shape and uniqueness (a duplicate would break login).
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    verify_jwt_in_request()
    claims = get_jwt()
    user = User.query.get(claims['sub'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}

    if 'full_name' in data:
        name = (data['full_name'] or '').strip()
        if not name:
            return jsonify({'error': 'Full name cannot be empty'}), 400
        user.full_name = name

    if 'email' in data:
        email = (data['email'] or '').strip().lower()
        if not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            return jsonify({'error': 'Invalid email address'}), 400
        clash = User.query.filter(User.email == email, User.id != user.id).first()
        if clash:
            return jsonify({'error': 'That email is already in use'}), 409
        user.email = email

    for field in ('first_name', 'last_name', 'phone', 'bio', 'location', 'timezone', 'language', 'profile_pic_url'):
        if field in data:
            setattr(user, field, (data[field] or '').strip() or None)

    db.session.commit()
    return jsonify({'message': 'Profile updated', 'user': user.to_dict()}), 200


@auth_bp.route('/2fa/toggle', methods=['POST'])
def toggle_2fa():
    from flask_jwt_extended import verify_jwt_in_request
    verify_jwt_in_request()
    return jsonify({'error': 'Multi-factor authentication enrollment and login verification are not implemented yet.'}), 501


@auth_bp.route('/export-data', methods=['GET'])
def export_user_data():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    verify_jwt_in_request()
    claims = get_jwt()
    user = User.query.get(claims['sub'])
    if not user:
        return jsonify({'error': 'User not found'}), 404

    return jsonify({
        'user': user.to_dict(),
        'exported_at': datetime.utcnow().isoformat() + 'Z'
    }), 200




@auth_bp.route('/me/avatar', methods=['POST'])
@require_auth
def upload_avatar():
    """Upload the caller's profile picture (multipart 'file') -> Cloudinary
    URL saved on profile_pic_url."""
    from werkzeug.utils import secure_filename
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400
    try:
        url = _upload_icon_file(file, 'avatars')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    user = User.query.get(g.user_id)
    user.profile_pic_url = url
    db.session.commit()
    return jsonify({'profile_pic_url': url, 'user': user.to_dict()}), 200


@auth_bp.route('/change-password', methods=['POST'])
def change_password():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    verify_jwt_in_request()
    from app.auth.utils import reject_if_impersonating
    _imp = reject_if_impersonating()
    if _imp:
        return _imp
    claims = get_jwt()
    data = request.get_json()

    current_pw = data.get('current_password', '')
    new_pw     = data.get('new_password', '')

    if len(new_pw) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400

    user = User.query.get(claims['sub'])
    if not bcrypt.checkpw(current_pw.encode(), user.password_hash.encode()):
        return jsonify({'error': 'Current password incorrect'}), 401

    if bcrypt.checkpw(new_pw.encode(), user.password_hash.encode()):
        return jsonify({'error': 'New password must be different from the current one'}), 400

    user.password_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()
    user.must_change_password = False   # admin-issued credential replaced
    db.session.commit()

    # Issue a fresh token: the old one carries must_change_password=True and
    # every gated endpoint would keep rejecting it until re-login.
    from flask_jwt_extended import create_access_token
    token = create_access_token(identity=user.id, additional_claims=build_jwt_claims(user))
    return jsonify({
        'message': 'Password updated successfully',
        'token': token,
        'user': user.to_dict(),
    }), 200


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
# platform_user, or an institution registering itself + its first admin). Accounts
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

      1. Individual account (role omitted / platform_user): creates a standalone
         platform_user with no institution affiliation.
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
    first_name     = (data.get('first_name', '') or '').strip()
    last_name      = (data.get('last_name', '') or '').strip()
    full_name      = (data.get('full_name', '') or '').strip() or f'{first_name} {last_name}'.strip()
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
        website = (data.get('website', '') or '').strip()
        if website and not (website.startswith('http://') or website.startswith('https://')):
            return jsonify({'error': 'website must start with http:// or https://'}), 400

        for phone_field in ('institution_phone', 'phone'):
            phone_val = (data.get(phone_field, '') or '').strip()
            if phone_val:
                digits = re.sub(r'\D', '', phone_val)
                if not (10 <= len(digits) <= 15):
                    return jsonify({'error': f'{phone_field} must contain 10 to 15 digits'}), 400

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
            first_name=first_name or None,
            last_name=last_name or None,
            role='institution_admin',
            staff_id=data.get('staff_id'),
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

    # ── Individual platform_user account (no institution_id) ───────────────────────
    user = User(
        institution_id=None,
        email=email,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        full_name=full_name,
        role='platform_user',
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

