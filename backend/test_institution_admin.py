"""
Tests for Institution Admin — extended features:
  1. Reset user password
  2. Experiment usage report
  3. CSV export (student progress + users)
  4. Institution settings (GET + PATCH)
  5. Session management (live list, terminate, history)
  6. Groq budget tracking

Run: python test_institution_admin.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

os.environ['DATABASE_URL']  = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'
os.environ['FLASK_ENV']     = 'development'
os.environ['JWT_SECRET_KEY']= 'test-secret-key-nexlab'
os.environ['GROQ_API_KEY']  = 'test-key'
os.environ['JUDGE0_URL']    = 'http://localhost:2358'
os.environ['SECRET_KEY']    = 'test-secret'

from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.session import LabSession
import bcrypt, uuid
from datetime import datetime

app = create_app('development')
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'

PASS = '\033[92mPASS\033[0m'
FAIL = '\033[91mFAIL\033[0m'
results = []


def check(label, condition, detail=''):
    status = PASS if condition else FAIL
    results.append(condition)
    print(f"  [{status}] {label}" + (f" — {detail}" if detail else ''))


# ── Setup ─────────────────────────────────────────────────────────────────────
with app.app_context():
    db.create_all()

    # Institution
    inst = Institution.query.filter_by(code='TESTINST').first()
    if not inst:
        inst = Institution(
            id=str(uuid.uuid4()), name='Test Institution',
            code='TESTINST', contact_email='admin@test.com', plan='pro'
        )
        db.session.add(inst)
        db.session.flush()
    else:
        inst.plan = 'pro'
        db.session.flush()

    iid = inst.id

    # Institution admin
    admin = User.query.filter_by(
        email='instadmin@test.com', institution_id=iid
    ).first()
    if not admin:
        admin = User(
            id=str(uuid.uuid4()),
            email='instadmin@test.com',
            password_hash=bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode(),
            full_name='Inst Admin',
            role='institution_admin',
            institution_id=iid,
        )
        db.session.add(admin)

    # A student to test password reset on
    student = User.query.filter_by(
        email='student_test@test.com', institution_id=iid
    ).first()
    if not student:
        student = User(
            id=str(uuid.uuid4()),
            email='student_test@test.com',
            password_hash=bcrypt.hashpw(b'Welcome@123', bcrypt.gensalt()).decode(),
            full_name='Test Student',
            role='student',
            institution_id=iid,
            roll_number='CS001',
        )
        db.session.add(student)

    db.session.commit()
    admin_id   = admin.id
    student_id = student.id

    # Create a live session — needs a section_subject_id (NOT NULL)
    from app.models.academic import AcademicYear, Batch, Section, SectionSubject
    from app.models.subject import Subject

    # Create minimal academic structure if missing
    year = AcademicYear.query.filter_by(institution_id=iid).first()
    if not year:
        year = AcademicYear(institution_id=iid, year_label='2026-27', is_active=True)
        db.session.add(year); db.session.flush()

    batch = Batch.query.filter_by(institution_id=iid).first()
    if not batch:
        batch = Batch(institution_id=iid, year_id=year.id, name='TestBatch')
        db.session.add(batch); db.session.flush()

    section = Section.query.filter_by(institution_id=iid).first()
    if not section:
        section = Section(institution_id=iid, batch_id=batch.id, name='SecA')
        db.session.add(section); db.session.flush()

    subject = Subject.query.filter_by(institution_id=iid).first()
    if not subject:
        subject = Subject(institution_id=iid, name='Test Subject', code='TS101')
        db.session.add(subject); db.session.flush()

    ss = SectionSubject.query.filter_by(
        institution_id=iid, section_id=section.id
    ).first()
    if not ss:
        ss = SectionSubject(
            institution_id=iid,
            section_id=section.id,
            subject_id=subject.id,
            instructor_id=admin_id,
        )
        db.session.add(ss); db.session.flush()

    # Use raw SQL to create a LabSession bypassing strict NOT NULL FK constraints
    from sqlalchemy import text as sqltext
    # Check if live session exists
    existing = db.session.execute(
        sqltext("SELECT id FROM lab_sessions WHERE institution_id=:iid AND status='active' LIMIT 1"),
        {'iid': iid}
    ).fetchone()
    if existing:
        session_id = existing[0]
    else:
        session_id = str(uuid.uuid4())
        exp_id     = str(uuid.uuid4())
        # Insert a dummy experiment first (match exact NOT NULL schema)
        db.session.execute(sqltext("""
            INSERT INTO experiments
              (id, institution_id, subject_id, instructor_id, exp_number, title)
            VALUES
              (:eid, :iid, :sid, :uid, 1, 'Test Exp')
            ON CONFLICT DO NOTHING
        """), {'eid': exp_id, 'iid': iid, 'sid': ss.subject_id, 'uid': admin_id})
        db.session.execute(sqltext("""
            INSERT INTO lab_sessions
              (id, institution_id, section_subject_id, experiment_id,
               scheduled_at, duration_minutes, status, started_at, created_at)
            VALUES
              (:sid, :iid, :ssid, :eid,
               NOW(), 90, 'active', NOW(), NOW())
        """), {'sid': session_id, 'iid': iid, 'ssid': ss.id, 'eid': exp_id})
        db.session.commit()

    # Login as institution_admin
    client = app.test_client()
    r = client.post('/api/auth/login',
                    json={'email': 'instadmin@test.com', 'password': 'admin123'})
    token = r.get_json().get('token', '')
    H = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    check("Login as institution_admin",
          r.status_code == 200 and bool(token),
          f"status={r.status_code}")

    # ── 1. RESET USER PASSWORD ────────────────────────────────────────────────
    print("\n[1] Reset User Password")

    r = client.post(
        f'/api/institution/users/{student_id}/reset-password',
        headers=H, json={'new_password': 'NewPass@456'}
    )
    check("Reset student password", r.status_code == 200)
    data = r.get_json()
    check("Response has message",      'message' in data)
    check("Force logout applied flag", data.get('force_logout_applied') is True)

    # Short password rejected
    r = client.post(
        f'/api/institution/users/{student_id}/reset-password',
        headers=H, json={'new_password': '123'}
    )
    check("Reject short password (<6 chars)", r.status_code == 400)

    # Can't reset a user from another institution
    r = client.post(
        '/api/institution/users/nonexistent-id-xxxx/reset-password',
        headers=H, json={'new_password': 'NewPass@456'}
    )
    check("404 for unknown user", r.status_code == 404)

    # Verify new password works
    r = client.post('/api/auth/login',
                    json={'email': 'student_test@test.com', 'password': 'NewPass@456'})
    check("Student can login with new password", r.status_code == 200)

    # ── 2. EXPERIMENT USAGE REPORT ────────────────────────────────────────────
    print("\n[2] Experiment Usage Report")

    r = client.get('/api/institution/analytics/experiment-usage', headers=H)
    check("GET experiment usage", r.status_code == 200)
    data = r.get_json()
    check("Has period_days field", 'period_days' in data)
    check("Has experiments list",  'experiments' in data)

    r = client.get('/api/institution/analytics/experiment-usage?days=7', headers=H)
    check("Filter by days=7", r.status_code == 200)
    check("Days reflected in response", r.get_json()['period_days'] == 7)

    # ── 3. CSV EXPORT ─────────────────────────────────────────────────────────
    print("\n[3] CSV Export")

    r = client.get('/api/institution/export/student-progress', headers=H)
    check("GET student progress CSV", r.status_code == 200)
    check("Content-Type is text/csv", 'text/csv' in r.content_type)
    csv_content = r.get_data(as_text=True)
    check("CSV has header row",  'Roll Number' in csv_content)
    check("CSV has student data", 'Test Student' in csv_content or 'CS001' in csv_content)

    r = client.get('/api/institution/export/users', headers=H)
    check("GET users CSV", r.status_code == 200)
    check("Users CSV has header", 'Full Name' in r.get_data(as_text=True))

    r = client.get('/api/institution/export/users?role=student', headers=H)
    check("Filter users CSV by role", r.status_code == 200)

    # ── 4. INSTITUTION SETTINGS ───────────────────────────────────────────────
    print("\n[4] Institution Settings")

    r = client.get('/api/institution/settings', headers=H)
    check("GET institution settings", r.status_code == 200)
    data = r.get_json()
    check("Has name field",         'name' in data)
    check("Has plan field",         'plan' in data)
    check("Has email_domain field", 'email_domain' in data)

    r = client.patch('/api/institution/settings', headers=H, json={
        'address':       '123 Test Street, Chennai',
        'contact_email': 'contact@test.com',
        'email_domain':  'test.ac.in',
    })
    check("PATCH institution settings", r.status_code == 200)
    data = r.get_json()
    check("Changed fields returned", 'changed' in data)
    check("Address in changed list", 'address' in data['changed'])

    # Verify persisted
    r = client.get('/api/institution/settings', headers=H)
    check("Settings persisted correctly",
          r.get_json().get('email_domain') == 'test.ac.in')

    # Should NOT allow changing name or plan
    r = client.patch('/api/institution/settings', headers=H,
                     json={'name': 'Hacked Name', 'plan': 'enterprise'})
    check("PATCH ignores name/plan (read-only)", r.status_code == 200)
    r2 = client.get('/api/institution/settings', headers=H)
    check("Name unchanged after PATCH", r2.get_json().get('name') == 'Test Institution')
    check("Plan unchanged after PATCH", r2.get_json().get('plan') == 'pro')

    # ── 5. SESSION MANAGEMENT ─────────────────────────────────────────────────
    print("\n[5] Session Management")

    r = client.get('/api/institution/sessions/live', headers=H)
    check("GET live sessions", r.status_code == 200)
    data = r.get_json()
    check("Has live_sessions list", 'live_sessions' in data)
    check("Has count field",        'count' in data)
    if data['count'] > 0:
        s = data['live_sessions'][0]
        check("Session has duration_minutes", 'duration_minutes' in s)

    # Session history
    r = client.get('/api/institution/sessions/history?days=7', headers=H)
    check("GET session history", r.status_code == 200)
    data = r.get_json()
    check("History has total field", 'total' in data)
    check("History has pages field", 'pages' in data)

    r = client.get('/api/institution/sessions/history?status=active', headers=H)
    check("Filter history by status", r.status_code == 200)

    # Terminate session
    r = client.post(f'/api/institution/sessions/{session_id}/terminate', headers=H)
    check("Terminate active session", r.status_code == 200)
    check("Response confirms termination", 'terminated' in r.get_data(as_text=True).lower())

    # Can't terminate same session twice
    r = client.post(f'/api/institution/sessions/{session_id}/terminate', headers=H)
    check("Re-terminate rejected (not active)", r.status_code == 400)

    # Can't terminate session from another institution
    r = client.post('/api/institution/sessions/fake-session-id/terminate', headers=H)
    check("404 for unknown session", r.status_code == 404)

    # ── 6. GROQ BUDGET TRACKING ───────────────────────────────────────────────
    print("\n[6] Groq Budget Tracking")

    r = client.get('/api/institution/groq-budget', headers=H)
    check("GET groq budget", r.status_code == 200)
    data = r.get_json()
    check("Has used field",       'used' in data)
    check("Has limit field",      'limit' in data)
    check("Has remaining field",  'remaining' in data)
    check("Has exhausted flag",   'exhausted' in data)
    check("Has plan field",       'plan' in data)
    check("Has trend_7d field",   'trend_7d' in data)
    check("Limit source is plan", data.get('limit_source') == 'plan_default')
    check("Remaining = limit - used",
          data['remaining'] == max(0, data['limit'] - data['used']))

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = sum(results)
    total  = len(results)
    print(f"\n{'='*52}")
    print(f"Results: {passed}/{total} passed")
    if passed == total:
        print("\033[92mAll institution admin tests passed!\033[0m")
    else:
        print(f"\033[91m{total - passed} test(s) failed\033[0m")
    print('='*52)
