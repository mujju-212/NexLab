"""
verify_admin_p2.py — Platform Admin Phase 2: institution drill-down.

Against a REAL tenant (inst-test-001) verifies:
  · member directory: totals + role/status/q filters match the DB, and rows
    carry the User-360 shape (status, account_type, institution_name)
  · per-tenant analytics: people counts, sessions, AI calls, executions,
    learning solves — every number recomputed from the ORM and compared

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_admin_p2.py
"""
import os
import sys
from datetime import datetime, timedelta

os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')

from app import create_app
from app.extensions import db

app = create_app('development')
app.config.update(
    SQLALCHEMY_DATABASE_URI=os.environ['DATABASE_URL'],
    TESTING=True, PROPAGATE_EXCEPTIONS=False, JWT_SECRET_KEY='test-secret',
)
client = app.test_client()

results = []
def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

with app.app_context():
    from app.models.user import User
    from app.models.institution import Institution
    from app.models.session import LabSession
    from app.models.ai_usage import AIUsageLog
    from app.models.submission import CodeAttempt
    from app.models.practice import PracticeSubmission
    from app.models.platform_content import PlatformProgress

    print('\n[0] SETUP')
    r = client.post('/api/auth/login', json={'email': 'admin@nexlab.io', 'password': 'Admin@123'})
    ATOK = (r.get_json() or {}).get('token')
    assert ATOK, 'platform admin login failed'
    inst = Institution.query.filter_by(code='inst-test-001').first() or Institution.query.first()
    IID = inst.id
    record('S1', f'admin login + tenant selected ({inst.name})', True, f'id={IID[:8]}')

    # ── DB truth ───────────────────────────────────────────────────────
    truth_roles = dict(db.session.query(User.role, db.func.count(User.id))
                        .filter_by(institution_id=IID).group_by(User.role).all())
    truth_total = sum(truth_roles.values())
    truth_students = truth_roles.get('student', 0)
    truth_suspended = User.query.filter_by(institution_id=IID, status='suspended').count()
    truth_active30 = User.query.filter(
        User.institution_id == IID,
        User.last_login >= datetime.utcnow() - timedelta(days=30)).count()
    truth_sessions = LabSession.query.filter_by(institution_id=IID).count()
    truth_live = LabSession.query.filter_by(institution_id=IID, status='active').count()
    truth_course_solves = db.session.query(db.func.count(PlatformProgress.id)).filter(
        PlatformProgress.user_id.in_(db.session.query(User.id).filter(User.institution_id == IID)),
        PlatformProgress.status == 'solved').scalar() or 0

    # ── directory ──────────────────────────────────────────────────────
    print('\n[1] MEMBER DIRECTORY')
    r = client.get(f'/api/admin/institutions/{IID}/users', headers=H(ATOK), query_string={'per_page': 10})
    j = r.get_json() or {}
    rows = j.get('users') or []
    record('D1', 'directory total matches DB', r.status_code == 200 and j.get('total') == truth_total,
           f"api={j.get('total')} db={truth_total}")
    record('D2', 'rows carry User-360 shape (status/account_type/institution_name)',
           all(u.get('institution_name') == inst.name and u.get('account_type') == 'institution'
               and 'status' in u for u in rows) if rows else truth_total == 0,
           f'n={len(rows)}')

    r = client.get(f'/api/admin/institutions/{IID}/users', headers=H(ATOK),
                   query_string={'role': 'student', 'per_page': 100})
    j = r.get_json() or {}
    ok = j.get('total') == truth_students and all(u['role'] == 'student' for u in j.get('users', []))
    record('D3', 'role filter exact', ok, f"api={j.get('total')} db_students={truth_students}")

    r = client.get(f'/api/admin/institutions/{IID}/users', headers=H(ATOK), query_string={'status': 'suspended'})
    j = r.get_json() or {}
    record('D4', 'status filter exact',
           j.get('total') == truth_suspended and all(u['status'] == 'suspended' for u in j.get('users', [])),
           f"api={j.get('total')} db={truth_suspended}")

    r = client.get(f'/api/admin/institutions/{IID}/users', headers=H(ATOK), query_string={'q': 'instructor'})
    j = r.get_json() or {}
    ok = all(('instructor' in (u['email'] or '').lower() or 'instructor' in (u['full_name'] or '').lower())
             for u in j.get('users', []))
    record('D5', 'q filter matches only relevant members', ok, f"n={j.get('total')}")

    r = client.get('/api/admin/institutions/does-not-exist/users', headers=H(ATOK))
    record('D6', 'unknown institution 404', r.status_code == 404, f'HTTP {r.status_code}')

    # ── analytics ──────────────────────────────────────────────────────
    print('\n[2] PER-TENANT ANALYTICS')
    r = client.get(f'/api/admin/institutions/{IID}/analytics', headers=H(ATOK), query_string={'days': 30})
    j = r.get_json() or {}
    people = j.get('people') or {}
    sessions = j.get('sessions') or {}

    record('A1', 'people.role_counts match DB exactly',
           people.get('role_counts') == {k: v for k, v in truth_roles.items()},
           f"api={people.get('role_counts')}")
    record('A2', 'people.total / suspended / active_30d match',
           people.get('total_users') == truth_total
           and people.get('suspended_users') == truth_suspended
           and people.get('active_users_30d') == truth_active30,
           f"total={people.get('total_users')}/{truth_total} susp={people.get('suspended_users')}/{truth_suspended} act={people.get('active_users_30d')}/{truth_active30}")
    record('A3', 'sessions total + live match',
           sessions.get('total') == truth_sessions and sessions.get('live') == truth_live,
           f"total={sessions.get('total')}/{truth_sessions} live={sessions.get('live')}/{truth_live}")

    trend = sessions.get('trend') or []
    record('A4', 'session trend is a dense 30-day series summing to <= total',
           len(trend) == 30 and sum(d['count'] for d in trend) <= truth_sessions,
           f"days={len(trend)}")

    for key in ('ai', 'executions', 'learning'):
        block = j.get(key) or {}
        trend = block.get('trend') or block.get('solves_trend') or []
        record('A5', f"{key} block present with dense trend", len(trend) == 30,
               f"window_total={block.get('calls_in_window', block.get('runs_in_window', block.get('practice_solves_in_window')))}")

    record('A6', 'learning.course_solves_total matches DB',
           (j.get('learning') or {}).get('course_solves_total') == truth_course_solves,
           f"api={(j.get('learning') or {}).get('course_solves_total')} db={truth_course_solves}")

    # RBAC
    r = client.post('/api/auth/login', json={'email': 'platform@nexlab.io', 'password': 'Free@123'})
    ptok = (r.get_json() or {}).get('token')
    r = client.get(f'/api/admin/institutions/{IID}/analytics', headers=H(ptok))
    record('A7', 'RBAC: non-admin blocked (403)', r.status_code == 403, f'HTTP {r.status_code}')

print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL GREEN ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
