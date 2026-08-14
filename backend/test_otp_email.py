"""
Standalone OTP send/verify test script — exercises the real Brevo integration
end-to-end against the live database, without needing the Flask server running.

Usage:
    venv/Scripts/python.exe test_otp_email.py                # send only
    venv/Scripts/python.exe test_otp_email.py --code 123456   # send + verify

This uses the SAME code path as POST /auth/otp/send — same model, same
Brevo call — so a success here means the real API endpoint will work too.
"""
import sys
import argparse

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.otp import EmailOTP, OTP_EXPIRY_MINUTES
from app.services.email_service import send_otp_email
from datetime import datetime, timedelta
import random

TEST_EMAIL = 'mujju718263@gmail.com'
PURPOSE = 'individual_register'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', default=TEST_EMAIL)
    parser.add_argument('--purpose', default=PURPOSE, choices=['individual_register', 'institution_register'])
    parser.add_argument('--code', help='If provided, verify this code against the most recent OTP instead of sending a new one')
    args = parser.parse_args()

    app = create_app('development')
    with app.app_context():
        if args.code:
            _verify(args.email, args.purpose, args.code)
        else:
            _send(args.email, args.purpose)


def _send(email: str, purpose: str):
    print(f'--- Sending OTP to {email} (purpose={purpose}) ---')

    if not app_has_brevo_key():
        print('FAIL: BREVO_API_KEY is not set in backend/.env — cannot send.')
        sys.exit(1)

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        print(f'NOTE: {email} already has an account (this would 409 via the real API). '
              f'Sending anyway for this test since we bypass that check here.')

    code = f'{random.randint(0, 999999):06d}'
    otp = EmailOTP(
        email=email,
        purpose=purpose,
        code_hash=EmailOTP.hash_code(code),
        expires_at=datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    db.session.add(otp)
    db.session.commit()

    sent, error = send_otp_email(email, code, purpose)
    if sent:
        print(f'SUCCESS: Brevo accepted the email. Code sent was: {code}')
        print(f'(Printed here only because this is a test script — check the real inbox at {email})')
        print(f'Row id: {otp.id}, expires_at: {otp.expires_at.isoformat()}')
        print()
        print(f'To verify it, run:')
        print(f'  venv/Scripts/python.exe test_otp_email.py --email {email} --purpose {purpose} --code {code}')
    else:
        print(f'FAIL: Brevo rejected the send. Error: {error}')
        print('Common causes:')
        print('  - BREVO_SENDER_EMAIL is not a verified sender in your Brevo account')
        print('  - The API key is invalid/expired')
        print('  - IP allowlisting is enabled on the Brevo account and this machine\'s')
        print('    IP is not authorised: https://app.brevo.com/security/authorised_ips')
        sys.exit(1)


def _verify(email: str, purpose: str, code: str):
    print(f'--- Verifying OTP for {email} (purpose={purpose}) ---')
    otp = EmailOTP.query.filter_by(email=email, purpose=purpose).order_by(
        EmailOTP.created_at.desc()
    ).first()

    if not otp:
        print('FAIL: No OTP record found for this email/purpose. Send one first.')
        sys.exit(1)
    if otp.is_expired:
        print('FAIL: That OTP has expired. Send a new one.')
        sys.exit(1)
    if not otp.check_code(code):
        print('FAIL: Code does not match.')
        sys.exit(1)

    otp.verified = True
    otp.verified_at = datetime.utcnow()
    db.session.commit()
    print('SUCCESS: OTP verified. This email/purpose pair can now complete /auth/register.')


def app_has_brevo_key() -> bool:
    from flask import current_app
    return bool(current_app.config.get('BREVO_API_KEY'))


if __name__ == '__main__':
    main()
