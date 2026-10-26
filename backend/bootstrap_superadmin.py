"""
bootstrap_superadmin.py — create the ONE platform super-admin account.

The platform super-admin is the root of trust: it is the only role that can
onboard institutions, and there is no API to create it (it can't be
self-registered, by design). Run this once on a fresh database.

Usage:
    python3 bootstrap_superadmin.py [email] [password] ["Full Name"]
"""
import sys
import bcrypt

from app import create_app
from app.extensions import db
from app.models.user import User

EMAIL    = sys.argv[1] if len(sys.argv) > 1 else 'superadmin@nexlab.io'
PASSWORD = sys.argv[2] if len(sys.argv) > 2 else 'SuperAdmin@2026'
NAME     = sys.argv[3] if len(sys.argv) > 3 else 'Platform Super Admin'


def main():
    app = create_app()
    with app.app_context():
        existing = User.query.filter_by(email=EMAIL).first()
        if existing:
            print(f'[SKIP] {EMAIL} already exists (role={existing.role})')
            return
        if len(PASSWORD) < 8:
            print('[ERROR] password must be at least 8 characters')
            sys.exit(1)

        user = User(
            institution_id=None,          # platform-level, not bound to an institution
            email=EMAIL,
            password_hash=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode(),
            full_name=NAME,
            role='platform_admin',
            is_active=True,
            must_change_password=False,   # we set this credential ourselves
        )
        db.session.add(user)
        db.session.commit()
        print('[OK] platform_admin created')
        print(f'     email    : {EMAIL}')
        print(f'     password : {PASSWORD}')
        print(f'     id       : {user.id}')


if __name__ == '__main__':
    main()
