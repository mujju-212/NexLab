# -*- coding: utf-8 -*-
"""
seed_test_users.py
Creates one test user for every role, plus a sample institution.
Run: python database/seed_test_users.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
import bcrypt
import uuid
from datetime import datetime

app = create_app()

# ── Test data ────────────────────────────────────────────────────────────────

INSTITUTION = {
    'id':            'inst-test-001',
    'name':          'NexLab Demo University',
    'code':          'NDU',
    'email_domain':  'nexlab.demo',
    'contact_email': 'admin@nexlab.demo',
    'plan':          'pro',
    'is_active':     True,
    'onboarded_at':  datetime.utcnow(),
}

USERS = [
    {
        'role':      'platform_admin',
        'full_name': 'Platform Admin',
        'email':     'admin@nexlab.io',
        'password':  'Admin@123',
        'institution_id': None,
    },
    {
        'role':      'institution_admin',
        'full_name': 'Institution Admin',
        'email':     'inst.admin@nexlab.demo',
        'password':  'InstAdmin@123',
        'institution_id': 'inst-test-001',
    },
    {
        'role':      'instructor',
        'full_name': 'Dr. Instructor',
        'email':     'instructor@nexlab.demo',
        'password':  'Instructor@123',
        'institution_id': 'inst-test-001',
    },
    {
        'role':      'student',
        'full_name': 'Test Student',
        'email':     'student@nexlab.demo',
        'password':  'Student@123',
        'institution_id': 'inst-test-001',
        'roll_number': 'NDU2024001',
    },
    {
        'role':      'platform_user',
        'full_name': 'Platform Learner',
        'email':     'platform@nexlab.io',
        'password':  'Free@123',
        'institution_id': None,
    },
]

# ── Seed ─────────────────────────────────────────────────────────────────────

with app.app_context():

    # 1. Institution
    inst = Institution.query.filter_by(id='inst-test-001').first()
    if not inst:
        inst = Institution(**INSTITUTION)
        db.session.add(inst)
        db.session.flush()
        print('[OK] Institution created: NexLab Demo University (code: NDU)')
    else:
        print('[SKIP] Institution already exists')

    # 2. Users
    for ud in USERS:
        existing = User.query.filter_by(email=ud['email']).first()
        if existing:
            print(f'[SKIP] {ud["role"]:20s}  {ud["email"]}')
            continue

        user = User(
            id=str(uuid.uuid4()),
            email=ud['email'],
            password_hash=bcrypt.hashpw(ud['password'].encode(), bcrypt.gensalt()).decode(),
            full_name=ud['full_name'],
            role=ud['role'],
            institution_id=ud.get('institution_id'),
            roll_number=ud.get('roll_number'),
            is_active=True,
            created_at=datetime.utcnow(),
        )
        db.session.add(user)
        print(f'[OK]   {ud["role"]:20s}  {ud["email"]:35s}  pw: {ud["password"]}')

    db.session.commit()
    print('\n[DONE] All test users committed.')

    # 3. Summary table
    print('\n' + '='*65)
    print(f'  {"ROLE":<20}  {"EMAIL":<35}  {"PASSWORD"}')
    print('='*65)
    for ud in USERS:
        print(f'  {ud["role"]:<20}  {ud["email"]:<35}  {ud["password"]}')
    print('='*65)
    print('  Institution: NexLab Demo University  |  code: NDU')
    print('='*65)
