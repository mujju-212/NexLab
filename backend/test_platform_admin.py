"""
Tests for Platform Super Admin features:
  1. Billing & Plan Management
  2. Global Audit Log
  3. Institution Onboarding Workflow
  4. Global Analytics
  5. Platform Configuration

Run: python test_platform_admin.py
Requires: Flask app running is NOT needed — uses app context directly.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

# Force env vars BEFORE any app import to prevent load_dotenv override
os.environ['DATABASE_URL']  = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'
os.environ['FLASK_ENV']     = 'development'
os.environ['JWT_SECRET_KEY']= 'test-secret-key-nexlab'
os.environ['GROQ_API_KEY']  = 'test-key'
os.environ['JUDGE0_URL']    = 'http://localhost:2358'
os.environ['SECRET_KEY']    = 'test-secret'

from app import create_app
from app.extensions import db
from app.models.institution import Institution, PlatformConfig
from app.models.user import User
from app.models.academic import AuditLog
import bcrypt, uuid, json

app = create_app('development')
# Hard-override AFTER creation — prevents any load_dotenv from winning
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'
# JWT key must match what login route uses — get it from the app after creation
_jwt_key = app.config.get('JWT_SECRET_KEY', 'test-secret-key-nexlab')

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

    # Create test institution
    inst = Institution.query.filter_by(code='TESTINST').first()
    if not inst:
        inst = Institution(
            id=str(uuid.uuid4()), name='Test Institution',
            code='TESTINST', contact_email='admin@test.com', plan='free'
        )
        db.session.add(inst)
        db.session.flush()

    # Create platform_admin user
    admin = User.query.filter_by(email='superadmin@nexlab.com').first()
    if not admin:
        admin = User(
            id=str(uuid.uuid4()),
            email='superadmin@nexlab.com',
            password_hash=bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode(),
            full_name='Super Admin',
            role='platform_admin',
            institution_id=None,
        )
        db.session.add(admin)

    db.session.commit()
    inst_id  = inst.id
    admin_id = admin.id

    # Get JWT token
    client = app.test_client()
    r = client.post('/api/auth/login', json={'email': 'superadmin@nexlab.com', 'password': 'admin123'})
    token = r.get_json().get('token', '')   # login returns 'token' not 'access_token'
    H = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    check("Login as platform_admin", r.status_code == 200 and bool(token), f"status={r.status_code}")

    # ── 1. BILLING ────────────────────────────────────────────────────────────
    print("\n[1] Billing & Plan Management")

    r = client.get(f'/api/platform/institutions/{inst_id}/billing', headers=H)
    check("GET billing info", r.status_code == 200)
    data = r.get_json()
    check("Billing has plan field", 'plan' in data)
    check("Billing has groq_limit", 'groq_limit' in data)

    r = client.patch(f'/api/platform/institutions/{inst_id}/billing/plan',
                     headers=H, json={'plan': 'pro'})
    check("Upgrade plan to pro", r.status_code == 200)
    check("Response mentions pro", 'pro' in r.get_data(as_text=True))

    r = client.patch(f'/api/platform/institutions/{inst_id}/billing/plan',
                     headers=H, json={'plan': 'invalid_plan'})
    check("Reject invalid plan", r.status_code == 400)

    r = client.patch(f'/api/platform/institutions/{inst_id}/billing/groq-limit',
                     headers=H, json={'limit': 999})
    check("Set groq limit override", r.status_code == 200)

    r = client.patch(f'/api/platform/institutions/{inst_id}/billing/groq-limit',
                     headers=H, json={'limit': None})
    check("Reset groq limit to plan default", r.status_code == 200)

    r = client.patch(f'/api/platform/institutions/{inst_id}/billing/notes',
                     headers=H, json={'notes': 'Upgraded for demo'})
    check("Update billing notes", r.status_code == 200)

    # ── 2. GLOBAL AUDIT LOG ───────────────────────────────────────────────────
    print("\n[2] Global Audit Log")

    # Seed a test audit log entry
    log = AuditLog(
        id=str(uuid.uuid4()),
        institution_id=inst_id,
        actor_id=admin_id,
        action='force_logout',
        target_type='user',
        target_id=str(uuid.uuid4()),
        detail='Test audit entry',
    )
    db.session.add(log)
    db.session.commit()

    r = client.get('/api/platform/audit-logs', headers=H)
    check("GET global audit logs", r.status_code == 200)
    data = r.get_json()
    check("Audit logs has items", len(data.get('logs', [])) >= 1)
    check("Audit log has actor_name", 'actor_name' in data['logs'][0])

    r = client.get(f'/api/platform/audit-logs?institution_id={inst_id}', headers=H)
    check("Filter audit by institution", r.status_code == 200)

    r = client.get('/api/platform/audit-logs?action=force_logout', headers=H)
    check("Filter audit by action", r.status_code == 200)

    r = client.get('/api/platform/audit-logs/summary', headers=H)
    check("Audit log summary", r.status_code == 200)
    check("Summary has force_logout", 'force_logout' in r.get_json().get('summary', {}))

    # ── 3. ONBOARDING ─────────────────────────────────────────────────────────
    print("\n[3] Institution Onboarding Workflow")

    # Set to pending for testing
    inst_obj = Institution.query.get(inst_id)
    inst_obj.onboarding_status = 'pending'
    db.session.commit()

    r = client.get('/api/platform/institutions/pending', headers=H)
    check("GET pending institutions", r.status_code == 200)
    check("Pending list has test inst", any(i['id'] == inst_id for i in r.get_json()['pending']))

    r = client.get(f'/api/platform/institutions/{inst_id}/onboarding', headers=H)
    check("GET onboarding checklist", r.status_code == 200)
    data = r.get_json()
    check("Checklist has institution_created", data['checklist']['institution_created'] is True)
    check("Checklist has has_users key", 'has_users' in data['checklist'])

    r = client.post(f'/api/platform/institutions/{inst_id}/onboarding/complete', headers=H)
    check("Mark onboarding complete", r.status_code == 200)
    inst_obj = Institution.query.get(inst_id)
    check("Status is now active", inst_obj.onboarding_status == 'active')

    r = client.post(f'/api/platform/institutions/{inst_id}/onboarding/reset', headers=H)
    check("Reset onboarding to pending", r.status_code == 200)
    db.session.refresh(inst_obj)
    check("Status is now pending again", inst_obj.onboarding_status == 'pending')

    # ── 4. GLOBAL ANALYTICS ───────────────────────────────────────────────────
    print("\n[4] Global Analytics")

    r = client.get('/api/platform/analytics/overview', headers=H)
    check("GET analytics overview", r.status_code == 200)
    data = r.get_json()
    check("Overview has total_users", 'total_users' in data)
    check("Overview has sessions_in_period", 'sessions_in_period' in data)

    r = client.get('/api/platform/analytics/groq-trend?days=7', headers=H)
    check("GET groq trend", r.status_code == 200)
    check("Trend has days field", 'days' in r.get_json())

    r = client.get('/api/platform/analytics/sessions-trend?days=14', headers=H)
    check("GET sessions trend", r.status_code == 200)

    r = client.get('/api/platform/analytics/peak-usage', headers=H)
    check("GET peak usage by hour", r.status_code == 200)

    r = client.get('/api/platform/analytics/cross-institution', headers=H)
    check("GET cross-institution comparison", r.status_code == 200)
    data = r.get_json()
    check("Has institutions list", 'institutions' in data)

    # ── 5. PLATFORM CONFIGURATION ─────────────────────────────────────────────
    print("\n[5] Platform Configuration")

    r = client.get('/api/platform/config', headers=H)
    check("GET platform config", r.status_code == 200)
    data = r.get_json()
    check("Config has groq_daily_limit", 'groq_daily_limit' in data.get('config', {}))
    check("Config has maintenance_mode", 'maintenance_mode' in data['config'])

    r = client.patch('/api/platform/config',
                     headers=H, json={'groq_daily_limit': '300'})
    check("PATCH config key", r.status_code == 200)
    check("Updated key returned", 'groq_daily_limit' in r.get_json()['updated'])

    r = client.post('/api/platform/config/maintenance',
                    headers=H, json={'enabled': True, 'message': 'Test maintenance'})
    check("Enable maintenance mode", r.status_code == 200)
    check("Response confirms enabled", r.get_json()['maintenance_mode'] is True)

    r = client.post('/api/platform/config/maintenance',
                    headers=H, json={'enabled': False})
    check("Disable maintenance mode", r.status_code == 200)

    r = client.get('/api/platform/config/features', headers=H)
    check("GET feature flags", r.status_code == 200)
    data = r.get_json()
    check("Has ai_hints_enabled flag", 'ai_hints_enabled' in data.get('features', {}))

    r = client.patch('/api/platform/config/features/ai_hints_enabled',
                     headers=H, json={'enabled': False})
    check("Toggle feature flag off", r.status_code == 200)
    check("Flag returned as disabled", r.get_json()['enabled'] is False)

    r = client.patch('/api/platform/config/features/nonexistent_flag',
                     headers=H, json={'enabled': True})
    check("Reject unknown feature flag", r.status_code == 400)

    # ── Summary ───────────────────────────────────────────────────────────────
    passed = sum(results)
    total  = len(results)
    print(f"\n{'='*50}")
    print(f"Results: {passed}/{total} passed")
    if passed == total:
        print("\033[92mAll tests passed!\033[0m")
    else:
        print(f"\033[91m{total - passed} test(s) failed\033[0m")
    print('='*50)
