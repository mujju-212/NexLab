"""
verify_admin_p3.py — Platform Admin Phase 3: content + growth + snapshots.

  Content : course/exercise CRUD with guards (publish-empty 400,
            delete-with-progress 409) + problem bank health vs DB
  Growth  : funnel stages recomputed from the ORM, cohort matrix sanity,
            direct-user cohort numbers vs DB
  Export  : CSV streams with rows + audit
  Metrics : backfill writes rows whose values match live computation

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_admin_p3.py
"""
import os
import sys
from datetime import datetime

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
    from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
    from app.models.practice import Problem, PracticeTestCase
    from app.models.academic import AuditLog
    from sqlalchemy import text

    print('\n[0] SETUP')
    r = client.post('/api/auth/login', json={'email': 'admin@nexlab.io', 'password': 'Admin@123'})
    ATOK = (r.get_json() or {}).get('token')
    assert ATOK
    # idempotent reset of the harness course
    old = PlatformCourse.query.filter_by(slug='p3-content-course').first()
    if old:
        PlatformExercise.query.filter_by(course_id=old.id).delete(synchronize_session=False)
        db.session.delete(old); db.session.commit()
    record('S1', 'admin login + harness reset', True)

    # ── content CRUD ──────────────────────────────────────────────────
    print('\n[1] CONTENT — COURSES')
    r = client.post('/api/admin/content/courses', headers=H(ATOK),
                    json={'title': 'P3 Content Course', 'slug': 'p3-content-course', 'difficulty': 'beginner'})
    j = r.get_json() or {}
    CID = (j.get('course') or {}).get('id')
    record('C1', 'create course (201)', r.status_code == 201 and bool(CID), f'HTTP {r.status_code}')

    r = client.post('/api/admin/content/courses', headers=H(ATOK),
                    json={'title': 'Dup', 'slug': 'p3-content-course'})
    record('C2', 'duplicate slug rejected (409)', r.status_code == 409, f'HTTP {r.status_code}')

    r = client.patch(f'/api/admin/content/courses/{CID}', headers=H(ATOK), json={'is_published': True})
    record('C3', 'publish-empty course rejected (400)', r.status_code == 400, f'HTTP {r.status_code}')

    r = client.post(f'/api/admin/content/courses/{CID}/exercises', headers=H(ATOK),
                    json={'title': 'P3 Sum', 'exercise_type': 'coding', 'xp_reward': 20,
                          'test_cases': [{'input': '2\n3\n', 'expected': '5'}]})
    j = r.get_json() or {}
    EID = (j.get('exercise') or {}).get('id')
    record('C4', 'add exercise (201, 1 test case)', r.status_code == 201 and bool(EID),
           f"cases={(j.get('exercise') or {}).get('test_case_count')}")

    r = client.patch(f'/api/admin/content/courses/{CID}', headers=H(ATOK), json={'is_published': True})
    record('C5', 'publish with exercise OK', r.status_code == 200
           and (r.get_json() or {}).get('course', {}).get('is_published') is True)

    r = client.patch(f'/api/admin/content/exercises/{EID}', headers=H(ATOK),
                     json={'xp_reward': 25, 'difficulty': 'medium'})
    j = r.get_json() or {}
    record('C6', 'update exercise fields', r.status_code == 200
           and (j.get('exercise') or {}).get('xp_reward') == 25)

    # delete guard: create progress on the exercise (real user for the FK)
    from app.models.user import User as _U
    _uid = _U.query.first().id
    db.session.add(PlatformProgress(user_id=_uid, exercise_id=EID, course_id=CID, status='attempted'))
    db.session.commit()
    r = client.delete(f'/api/admin/content/exercises/{EID}', headers=H(ATOK))
    record('C7', 'delete exercise with progress blocked (409)', r.status_code == 409, f'HTTP {r.status_code}')
    r = client.delete(f'/api/admin/content/courses/{CID}', headers=H(ATOK))
    record('C8', 'delete course with progress blocked (409)', r.status_code == 409, f'HTTP {r.status_code}')
    PlatformProgress.query.filter_by(exercise_id=EID).delete(synchronize_session=False)
    db.session.commit()

    r = client.get('/api/admin/content/courses', headers=H(ATOK))
    j = r.get_json() or {}
    jc = next((c for c in j.get('courses', []) if c['id'] == CID), None)
    truth_ex = PlatformExercise.query.filter_by(course_id=CID).count()
    record('C9', 'course list carries exercise + solve counts',
           jc is not None and jc['exercise_count'] == truth_ex and 'solves_count' in jc,
           f"ex={jc['exercise_count'] if jc else None}/{truth_ex}")

    # audit
    acts = {a.action for a in AuditLog.query.filter(
        AuditLog.action.like('admin.content.%')).order_by(AuditLog.created_at.desc()).limit(10).all()}
    record('C10', 'content mutations audited',
           {'admin.content.course_create', 'admin.content.exercise_create',
            'admin.content.course_update', 'admin.content.exercise_update'}.issubset(acts),
           f'{sorted(acts)}')

    print('\n[2] CONTENT — PROBLEM BANK')
    # DB truth for filters
    truth_no_tests = db.session.query(Problem.id).filter(~Problem.id.in_(
        db.session.query(PracticeTestCase.problem_id).distinct())).count()
    truth_disabled = Problem.query.filter_by(is_active=False).count()

    r = client.get('/api/admin/content/problems', headers=H(ATOK), query_string={'filter': 'no_tests'})
    j = r.get_json() or {}
    record('P1', 'no-tests filter total matches DB',
           (j.get('summary') or {}).get('no_test_cases') == truth_no_tests
           and j.get('total') == truth_no_tests,
           f"api={(j.get('summary') or {}).get('no_test_cases')} db={truth_no_tests}")

    r = client.get('/api/admin/content/problems', headers=H(ATOK), query_string={'filter': 'disabled'})
    j = r.get_json() or {}
    record('P2', 'disabled filter matches DB',
           j.get('total') == truth_disabled
           and all(not p['is_active'] for p in j.get('problems', [])),
           f"api={j.get('total')} db={truth_disabled}")

    # toggle a dedicated problem
    tp = Problem(slug='p3-toggle-prob', title='P3 Toggle', difficulty='Easy',
                 nexlab_topic='Arrays', is_active=True)
    db.session.add(tp); db.session.commit()
    r = client.patch(f"/api/admin/content/problems/{tp.id}", headers=H(ATOK), json={'is_active': False})
    ok = r.status_code == 200 and (r.get_json() or {}).get('problem', {}).get('is_active') is False
    db.session.refresh(tp)
    record('P3', 'disable problem persists + audited', ok and tp.is_active is False
           and AuditLog.query.filter_by(action='admin.content.problem_toggle', target_id=tp.id).first() is not None)
    PracticeTestCase.query.filter_by(problem_id=tp.id).delete(synchronize_session=False)
    db.session.delete(tp); db.session.commit()

    # ── growth ─────────────────────────────────────────────────────────
    print('\n[3] GROWTH ANALYTICS')
    r = client.get('/api/admin/analytics/funnel', headers=H(ATOK), query_string={'days': 60})
    j = r.get_json() or {}
    stages = {s['key']: s for s in j.get('stages', [])}
    ok_shape = (set(stages) == {'signup', 'activated', 'first_solve', 'retained'}
                and stages['signup']['count'] >= stages['activated']['count'] >= 0
                and stages['activated']['count'] >= stages['first_solve']['count'] >= 0)
    record('G1', 'funnel: 4 stages, monotonic shape', r.status_code == 200 and ok_shape,
           f"signup={stages.get('signup', {}).get('count')} "
           f"act={stages.get('activated', {}).get('count')} "
           f"solve={stages.get('first_solve', {}).get('count')} "
           f"ret={stages.get('retained', {}).get('count')}")

    r = client.get('/api/admin/analytics/cohorts', headers=H(ATOK), query_string={'weeks': 6})
    j = r.get_json() or {}
    cohorts = j.get('cohorts') or []
    sizes = db.session.execute(text("""
        SELECT date_trunc('week', created_at)::date AS wk, COUNT(*)
        FROM users WHERE created_at >= now() - interval '6 weeks'
        GROUP BY 1
    """)).fetchall()
    truth_by_wk = {str(wk): n for wk, n in sizes}
    ok_sizes = all(any(c['cohort'] == wk and c['size'] == n for c in cohorts)
                   for wk, n in truth_by_wk.items())
    record('G2', 'cohort sizes match DB (weekly signups)', r.status_code == 200
           and len(cohorts) == 6 and ok_sizes,
           f"weeks={len(cohorts)} checked={len(truth_by_wk)}")
    tri_ok = all(len(c['cells']) <= 6 for c in cohorts)
    record('G3', 'cohort matrix is triangular (week W cohort has ≤ 6−W cells)', tri_ok)

    r = client.get('/api/admin/analytics/platform-users', headers=H(ATOK), query_string={'days': 14})
    j = r.get_json() or {}
    from app.models.user import User as U
    truth_total = U.query.filter_by(role='platform_user').count()
    record('G4', 'direct-user cohort total matches DB',
           r.status_code == 200 and j.get('total') == truth_total,
           f"api={j.get('total')} db={truth_total}")
    dist = j.get('xp_distribution') or {}
    record('G5', 'XP distribution buckets sum to users-with-XP-rows',
           sum(dist.values()) <= truth_total, f"dist={dist}")

    print('\n[4] EXPORTS')
    r = client.get('/api/admin/analytics/export', headers=H(ATOK), query_string={'report': 'users'})
    lines = r.data.decode().strip().splitlines()
    record('E1', 'users CSV: text/csv with header + DB-sized rows',
           r.status_code == 200 and 'text/csv' in r.headers.get('Content-Type', '')
           and lines[0].startswith('id,') and len(lines) - 1 == U.query.count(),
           f"rows={len(lines) - 1}")
    r = client.get('/api/admin/analytics/export', headers=H(ATOK), query_string={'report': 'bogus'})
    record('E2', 'unknown report 400', r.status_code == 400, f'HTTP {r.status_code}')
    record('E3', 'export audited',
           AuditLog.query.filter_by(action='admin.analytics.export', target_id='users').first() is not None)

    print('\n[5] METRIC SNAPSHOTS')
    r = client.post('/api/admin/analytics/snapshots/backfill', headers=H(ATOK), json={'days': 3})
    record('M1', 'backfill runs (200)', r.status_code == 200, f'HTTP {r.status_code}')
    from app.admin.metrics import compute_platform_daily
    from datetime import timedelta
    yesterday = (datetime.utcnow() - timedelta(days=1)).date()
    live = compute_platform_daily(yesterday)
    snap = db.session.execute(text("""
        SELECT metric, value FROM platform_metrics_daily
        WHERE day = :d AND institution_id = 'platform'
    """), {'d': yesterday.isoformat()}).fetchall()
    snap_map = {m: float(v) for m, v in snap}
    record('M2', 'snapshot values equal live computation',
           len(snap_map) == len(live) and all(snap_map.get(k) == float(v) for k, v in live.items()),
           f"metrics={len(snap_map)} sample_dau={snap_map.get('dau')}/{live.get('dau')}")
    r = client.get('/api/admin/analytics/snapshots', headers=H(ATOK), query_string={'metric': 'dau', 'days': 30})
    j = r.get_json() or {}
    record('M3', 'snapshot read endpoint returns series',
           r.status_code == 200 and len(j.get('series') or []) >= 3,
           f"points={len(j.get('series') or [])}")

    # ── RBAC ────────────────────────────────────────────────────────────
    r = client.post('/api/auth/login', json={'email': 'platform@nexlab.io', 'password': 'Free@123'})
    ptok = (r.get_json() or {}).get('token')
    r = client.get('/api/admin/content/courses', headers=H(ptok))
    record('R1', 'RBAC: non-admin blocked from content (403)', r.status_code == 403, f'HTTP {r.status_code}')

    # ── cleanup ─────────────────────────────────────────────────────────
    print('\n[6] CLEANUP')
    PlatformExercise.query.filter_by(course_id=CID).delete(synchronize_session=False)
    c = PlatformCourse.query.get(CID)
    if c:
        db.session.delete(c)
    db.session.commit()
    record('K1', 'harness course removed', PlatformCourse.query.get(CID) is None)

print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL GREEN ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
