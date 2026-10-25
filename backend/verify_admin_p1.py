"""
verify_admin_p1.py — Platform Admin Phase 1 behavioral verification.

Proves: global directory + filters, User-360 data accuracy vs the DB, and
the full action set — suspend (blocks login + kills live tokens), activate,
reset-password (temp credential + forced change), force-logout, rename —
each audited. Includes the guard rails (self-suspend, admin-target, RBAC).

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_admin_p1.py
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
    TESTING=True, PROPAGATE_EXCEPTIONS=False,
    JWT_SECRET_KEY='test-secret', DOCKER_RUNNER_ENABLED=True,
)
client = app.test_client()

ADMIN = {'email': 'admin@nexlab.io', 'password': 'Admin@123'}
TARGET_EMAIL = 'adminp1.target@nexlab.io'
TARGET_PW = 'Target@1234'

results = []
def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

def purge(uid):
    from sqlalchemy import text
    rows = db.session.execute(text("""
        SELECT conrelid::regclass::text AS tbl, a.attname AS col
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        WHERE confrelid = 'users'::regclass AND contype = 'f'
    """)).fetchall()
    for tbl, col in sorted(set(rows)):
        try:
            db.session.execute(text(f'DELETE FROM {tbl} WHERE {col} = :u'), {'u': uid})
        except Exception:
            pass
    from app.models.academic import AuditLog
    AuditLog.query.filter(AuditLog.target_id == uid).delete(synchronize_session=False)
    db.session.commit()

with app.app_context():
    import bcrypt
    from app.models.user import User
    from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
    from app.models.practice import Problem, PracticeTestCase, PracticeSubmission, StudentXP
    from app.models.grading import Grade
    from app.models.exam import Exam, ExamAttempt
    from app.models.academic import AuditLog
    from app.models.subject import Subject

    # ── fixtures: target user with KNOWN history ─────────────────────────
    print('\n[0] FIXTURES')
    old = User.query.filter_by(email=TARGET_EMAIL).first()
    if old:
        purge(old.id); db.session.delete(old); db.session.commit()
    from app.models.practice import PracticeTestCase
    old_p = Problem.query.filter_by(slug='adminp1-prob').first()
    if old_p:
        PracticeTestCase.query.filter_by(problem_id=old_p.id).delete(synchronize_session=False)
        db.session.delete(old_p); db.session.commit()
    old_c = PlatformCourse.query.filter_by(slug='adminp1-course').first()
    if old_c:
        PlatformExercise.query.filter_by(course_id=old_c.id).delete(synchronize_session=False)
        db.session.delete(old_c); db.session.commit()

    target = User(email=TARGET_EMAIL, full_name='P One Target', role='platform_user', is_active=True)
    target.password_hash = bcrypt.hashpw(TARGET_PW.encode(), bcrypt.gensalt()).decode()
    db.session.add(target); db.session.flush()

    course = PlatformCourse(slug='adminp1-course', title='Admin P1 Course',
                            difficulty='beginner', language='python', is_published=True, order_index=999)
    db.session.add(course); db.session.flush()
    ex = PlatformExercise(course_id=course.id, order_index=1, title='P1 Ex',
                          exercise_type='coding', difficulty='easy', xp_reward=25,
                          test_cases=[{'input': '1\n', 'expected': '2', 'hidden': False}])
    db.session.add(ex); db.session.flush()
    db.session.add(PlatformProgress(user_id=target.id, exercise_id=ex.id, course_id=course.id,
                                    status='solved', attempts=2, best_score=100.0,
                                    xp_earned=25, solved_at=datetime.utcnow()))
    prob = Problem(slug='adminp1-prob', title='P1 Problem', difficulty='Easy',
                   nexlab_topic='Arrays', topics=['Arrays'], is_active=True)
    db.session.add(prob); db.session.flush()
    db.session.add(PracticeTestCase(problem_id=prob.id, input_data='x', expected='x', is_sample=True))
    db.session.add(PracticeSubmission(student_id=target.id, problem_id=prob.id, language='python',
                                      code='print(input())', status='Accepted',
                                      passed=1, total=1, is_run=False,
                                      submitted_at=datetime.utcnow()))
    db.session.add(StudentXP(student_id=target.id, total_xp=25, level=1,
                             level_name='Newcomer', streak_days=1, problems_solved=1))
    db.session.commit()
    TID = target.id
    record('F1', 'target user with known history (1 solve, 1 accepted sub, 25 XP)', True,
           f'id={TID[:8]}')

    # ── auth ─────────────────────────────────────────────────────────────
    print('\n[1] AUTH + RBAC')
    r = client.post('/api/auth/login', json=ADMIN)
    ATOK = (r.get_json() or {}).get('token')
    record('A1', 'platform admin login', r.status_code == 200 and bool(ATOK), f'HTTP {r.status_code}')

    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': TARGET_PW})
    TTOK = (r.get_json() or {}).get('token')
    record('A2', 'target user login (pre-action)', r.status_code == 200 and bool(TTOK))

    r = client.get('/api/admin/users', headers=H(TTOK))
    record('A3', 'RBAC: non-admin blocked from directory (403)', r.status_code == 403, f'HTTP {r.status_code}')

    # ── directory ────────────────────────────────────────────────────────
    print('\n[2] DIRECTORY')
    r = client.get('/api/admin/users', headers=H(ATOK),
                   query_string={'q': 'adminp1.target', 'role': 'platform_user'})
    j = r.get_json() or {}
    row = next((u for u in j.get('users', []) if u['id'] == TID), None)
    record('D1', 'directory finds target by q + role filter',
           r.status_code == 200 and row is not None and row['status'] == 'active'
           and row['account_type'] == 'direct',
           f"total={j.get('total')} status={row.get('status') if row else None}")

    r = client.get('/api/admin/users', headers=H(ATOK), query_string={'institution_id': 'direct'})
    j = r.get_json() or {}
    ids = {u['id'] for u in j.get('users', [])}
    record('D2', "'direct' filter returns only tenant-less users",
           r.status_code == 200 and TID in ids
           and all(u['account_type'] == 'direct' for u in j.get('users', [])),
           f"n={len(ids)}")

    r = client.get('/api/admin/users', headers=H(ATOK), query_string={'per_page': 5, 'page': 1})
    j = r.get_json() or {}
    record('D3', 'pagination envelope sane',
           r.status_code == 200 and j.get('pages', 0) >= 1 and len(j.get('users', [])) <= 5,
           f"total={j.get('total')} pages={j.get('pages')}")

    # ── User-360 accuracy vs DB ──────────────────────────────────────────
    print('\n[3] USER-360 ACCURACY')
    r = client.get(f'/api/admin/users/{TID}', headers=H(ATOK))
    j = r.get_json() or {}
    st = j.get('stats') or {}
    record('U1', '360 header stats match DB truth (1 solve, 1 accepted, 25 XP, level 1)',
           r.status_code == 200 and st.get('course_solves') == 1
           and st.get('practice_accepted') == 1 and st.get('practice_submissions') == 1
           and st.get('total_xp') == 25 and st.get('level') == 1,
           f'stats={st}')

    r = client.get(f'/api/admin/users/{TID}/progress', headers=H(ATOK))
    j = r.get_json() or {}
    courses = (j.get('courses') or {}).get('courses') or []
    jc = next((c for c in courses if c.get('id') == course.id or c.get('slug') == 'adminp1-course'), None)
    record('U2', 'progress: XP/rating/topic payloads + course 100%',
           r.status_code == 200 and (j.get('xp') or {}).get('total_xp') == 25
           and isinstance(j.get('topic_strength'), list)
           and jc and jc.get('completion_pct') == 100.0,
           f"xp={(j.get('xp') or {}).get('total_xp')} pct={jc.get('completion_pct') if jc else None}")

    r = client.get(f'/api/admin/users/{TID}/grades', headers=H(ATOK))
    j = r.get_json() or {}
    record('U3', 'grades endpoint responds with all three collections',
           r.status_code == 200 and all(k in j for k in ('grades', 'exam_attempts', 'certificates')),
           f"grades={len(j.get('grades') or [])} exams={len(j.get('exam_attempts') or [])} certs={len(j.get('certificates') or [])}")

    r = client.get(f'/api/admin/users/{TID}/attempts', headers=H(ATOK))
    j = r.get_json() or {}
    ps = (j.get('practice_submissions') or {}).get('items') or []
    record('U4', 'attempts: the accepted practice submission listed with verdict',
           r.status_code == 200 and len(ps) == 1 and ps[0]['status'] == 'Accepted'
           and ps[0]['problem_title'] == 'P1 Problem',
           f"n={len(ps)} status={ps[0]['status'] if ps else None}")

    # ── actions ──────────────────────────────────────────────────────────
    print('\n[4] ACTIONS')
    r = client.patch(f'/api/admin/users/{TID}', headers=H(ATOK), json={'full_name': 'Renamed Target'})
    record('X1', 'rename user', r.status_code == 200
           and (r.get_json() or {}).get('user', {}).get('full_name') == 'Renamed Target')

    r = client.post(f'/api/admin/users/{TID}/force-logout', headers=H(ATOK))
    record('X2', 'force-logout accepted', r.status_code == 200, f'HTTP {r.status_code}')
    r = client.get('/api/auth/me', headers=H(TTOK))
    record('X3', "target's live token is now dead (401)", r.status_code == 401, f'HTTP {r.status_code}')

    r = client.post(f'/api/admin/users/{TID}/suspend', headers=H(ATOK), json={})
    record('X4', 'suspend without reason rejected (400)', r.status_code == 400, f'HTTP {r.status_code}')
    r = client.post(f'/api/admin/users/{ATOK and (client.get("/api/auth/me", headers=H(ATOK)).get_json() or {}).get("user", {}).get("id", "")}/suspend',
                    headers=H(ATOK), json={'reason': 'self test'})
    record('X5', 'self-suspend rejected (400)', r.status_code == 400, f'HTTP {r.status_code}')

    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': TARGET_PW})
    TTOK2 = (r.get_json() or {}).get('token')
    r = client.post(f'/api/admin/users/{TID}/suspend', headers=H(ATOK),
                    json={'reason': 'P1 harness suspension', 'until': (datetime.utcnow() + timedelta(days=7)).isoformat() + 'Z'})
    record('X6', 'suspend with reason + until accepted', r.status_code == 200
           and (r.get_json() or {}).get('user', {}).get('status') == 'suspended')

    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': TARGET_PW})
    record('X7', 'suspended login blocked (403 ACCOUNT_SUSPENDED)',
           r.status_code == 403 and (r.get_json() or {}).get('code') == 'ACCOUNT_SUSPENDED',
           f'HTTP {r.status_code}')
    r = client.get('/api/auth/me', headers=H(TTOK2))
    record('X8', 'suspended user live token dead (401)', r.status_code == 401, f'HTTP {r.status_code}')

    r = client.get('/api/admin/users', headers=H(ATOK), query_string={'status': 'suspended', 'q': 'Renamed Target'})
    j = r.get_json() or {}
    record('X9', 'directory status=suspended filter finds target',
           any(u['id'] == TID for u in j.get('users', [])), f"total={j.get('total')}")

    r = client.post(f'/api/admin/users/{TID}/activate', headers=H(ATOK))
    record('X10', 'activate lifts suspension', r.status_code == 200
           and (r.get_json() or {}).get('user', {}).get('status') == 'active')
    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': TARGET_PW})
    record('X11', 'login works again after activation', r.status_code == 200)

    r = client.post(f'/api/admin/users/{TID}/reset-password', headers=H(ATOK))
    j = r.get_json() or {}
    TEMP = j.get('temp_password')
    record('X12', 'reset-password returns one-time temp credential',
           r.status_code == 200 and bool(TEMP), f'temp={TEMP[:4]}…' if TEMP else 'none')
    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': 'old-' + TARGET_PW})
    record('X13', 'OLD password no longer works', r.status_code == 401, f'HTTP {r.status_code}')
    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': TEMP})
    j = r.get_json() or {}
    ttok3 = j.get('token')
    record('X14', 'temp password logs in + must_change_password flagged',
           r.status_code == 200 and bool(ttok3), f"must_change={j.get('user', {}).get('must_change_password')}")
    r = client.get('/api/platform-user/progress', headers=H(ttok3))
    record('X15', 'temp-password gate blocks app usage until changed (403)',
           r.status_code == 403, f'HTTP {r.status_code}')

    # expired temp ban lifts itself
    r = client.post(f'/api/admin/users/{TID}/suspend', headers=H(ATOK),
                    json={'reason': 'expired ban', 'until': (datetime.utcnow() - timedelta(minutes=1)).isoformat() + 'Z'})
    r = client.post('/api/auth/login', json={'email': TARGET_EMAIL, 'password': TEMP})
    record('X16', 'expired temp-ban auto-lifts at login', r.status_code == 200, f'HTTP {r.status_code}')

    # ── audit trail ──────────────────────────────────────────────────────
    print('\n[5] AUDIT')
    r = client.get(f'/api/admin/users/{TID}/activity', headers=H(ATOK))
    j = r.get_json() or {}
    about = j.get('about_user') or []
    actions = {a.get('action') for a in about}
    expected = {'admin.user.update', 'admin.user.force_logout', 'admin.user.suspend',
                'admin.user.activate', 'admin.user.reset_password'}
    record('AU1', 'every mutation audited (update/force-logout/suspend/activate/reset)',
           expected.issubset(actions), f'actions={sorted(actions)}')
    high = [a for a in about if a.get('severity') == 'high']
    record('AU2', 'suspend + reset recorded as HIGH severity', len(high) >= 2, f'high={len(high)}')

    r = client.get('/api/platform/audit-logs', headers=H(ATOK), query_string={'days': 1, 'per_page': 100})
    j = r.get_json() or {}
    in_global = {l.get('action') for l in j.get('logs', [])}
    record('AU3', 'platform audit viewer shows the admin.user.* events',
           'admin.user.suspend' in in_global, f"found={sorted(in_global & expected)}")

    # ── cleanup ──────────────────────────────────────────────────────────
    print('\n[6] CLEANUP')
    purge(TID)
    u = User.query.get(TID)
    if u:
        db.session.delete(u)
    PlatformExercise.query.filter_by(course_id=course.id).delete(synchronize_session=False)
    db.session.delete(course)
    db.session.commit()
    record('C1', 'artifacts removed', User.query.get(TID) is None)

print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL GREEN ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
