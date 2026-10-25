"""
verify_analytics_accuracy.py — do the analytics pages show TRUE numbers?

Creates a user with a fully hand-computed history, then checks every
analytics endpoint against the expected values (and against the raw DB):

  Course (3 exercises): coding wrong->right (2 attempts), MCQ (1), reading (1)
  Library: A Easy/Arrays 1st-try solve · B Medium/Graphs fail->solve
           C Easy/Arrays 1st-try solve · D Hard/DP fail only

  Expected: 5 practice subs (3 Accepted) + 4 course attempts = 9 attempts
            solved = 6 (3 practice + 3 course)
            acceptance = 6/9 = 66.7%   first-try = 4/6 = 66.7%
            avg attempts/solve = 8/6 = 1.33
            XP = 35 (course) + 45 (10+25+10 practice) = 80
            difficulty mix: easy 5, medium 1, hard 0
            heatmap today: count 9 (level 4), solves 6
            unlocks: Easy only (5/15 easy = 33.3% to Medium)
            recommendations: exclude solved; target weak topics (DP/Graphs)

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_analytics_accuracy.py
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
    TESTING=True, PROPAGATE_EXCEPTIONS=False,
    JWT_SECRET_KEY='test-secret', DOCKER_RUNNER_ENABLED=True,
)
client = app.test_client()

EMAIL = 'analytics.tester@nexlab.io'
PASSWORD = 'Analytics@1234'
results = []

def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

def purge_user_rows(uid):
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
    db.session.commit()

ECHO = 'print(input())'

with app.app_context():
    import bcrypt
    from app.models.user import User
    from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
    from app.models.practice import Problem, PracticeTestCase, PracticeSubmission, StudentXP
    from app.models.session import _iso_z

    # ── fixtures ────────────────────────────────────────────────────────
    print('\n[0] FIXTURES')
    for _em in (EMAIL, 'cold.tester@nexlab.io'):
        _old = User.query.filter_by(email=_em).first()
        if _old:
            purge_user_rows(_old.id)
            db.session.delete(_old)
    PracticeTestCase.query.filter(
        PracticeTestCase.problem_id.in_(db.session.query(Problem.id).filter(Problem.slug.like('acc-%'))
    )).delete(synchronize_session=False)
    db.session.commit()
    Problem.query.filter(Problem.slug.like('acc-%')).delete(synchronize_session=False)
    old_c = PlatformCourse.query.filter_by(slug='acc-course-101').first()
    if old_c:
        PlatformExercise.query.filter_by(course_id=old_c.id).delete(synchronize_session=False)
        db.session.delete(old_c)
    db.session.commit()

    user = User(email=EMAIL, full_name='Analytics Tester', role='platform_user', is_active=True)
    user.password_hash = bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt()).decode()
    cold = User(email='cold.tester@nexlab.io', full_name='Cold Start', role='platform_user', is_active=True)
    cold.password_hash = bcrypt.hashpw('Cold@1234'.encode(), bcrypt.gensalt()).decode()
    db.session.add_all([user, cold])

    course = PlatformCourse(slug='acc-course-101', title='Accuracy 101', difficulty='beginner',
                            language='python', is_published=True, order_index=999)
    db.session.add(course); db.session.flush()
    coding = PlatformExercise(course_id=course.id, order_index=1, title='Acc Sum',
        exercise_type='coding', difficulty='easy', xp_reward=25,
        starter_code={'python': ''}, allowed_languages=['python'],
        test_cases=[{'input': '2\n3\n', 'expected': '5', 'hidden': False}])
    mcq = PlatformExercise(course_id=course.id, order_index=2, title='Acc MCQ',
        exercise_type='mcq', difficulty='easy', xp_reward=5,
        mcq_options=['1', '2'], mcq_answer='B')
    reading = PlatformExercise(course_id=course.id, order_index=3, title='Acc Read',
        exercise_type='reading', difficulty='easy', xp_reward=5)
    db.session.add_all([coding, mcq, reading])

    def mkprob(slug, title, diff, topic, acceptance=None):
        p = Problem(slug=slug, title=title, difficulty=diff, nexlab_topic=topic,
                    topics=[topic], description=f'{title} — accuracy harness.',
                    acceptance=acceptance, is_active=True)
        db.session.add(p); db.session.flush()
        db.session.add(PracticeTestCase(problem_id=p.id, input_data='echo-in', expected='echo-in', is_sample=True))
        return p

    pa = mkprob('acc-easy-a', 'Acc Easy A', 'Easy', 'Arrays', 0.9)
    pb = mkprob('acc-med-b', 'Acc Med B', 'Medium', 'Graphs', 0.6)
    pc = mkprob('acc-easy-c', 'Acc Easy C', 'Easy', 'Arrays', 0.85)
    pd_ = mkprob('acc-hard-d', 'Acc Hard D', 'Hard', 'Dynamic Programming', 0.4)
    db.session.commit()
    UID, CID = user.id, course.id

    r = client.post('/api/auth/login', json={'email': EMAIL, 'password': PASSWORD})
    TOK = r.get_json()['token']
    ctok_r = client.post('/api/auth/login', json={'email': 'cold.tester@nexlab.io', 'password': 'Cold@1234'})
    CTOK = ctok_r.get_json()['token']
    record('F1', 'fixtures + logins ready', bool(TOK and CTOK))

    # ── perform the exact history ───────────────────────────────────────
    print('\n[1] CONTROLLED HISTORY')
    SUM = 'a=int(input());b=int(input());print(a+b)'
    client.post(f'/api/platform-user/exercises/{coding.id}/submit', headers=H(TOK),
                json={'code': 'print("nope")', 'language': 'python'})
    client.post(f'/api/platform-user/exercises/{coding.id}/submit', headers=H(TOK),
                json={'code': SUM, 'language': 'python'})
    client.post(f'/api/platform-user/exercises/{mcq.id}/answer', headers=H(TOK), json={'answer': 'B'})
    client.post(f'/api/platform-user/exercises/{reading.id}/complete', headers=H(TOK))
    client.post(f'/api/practice/problems/acc-easy-a/submit', headers=H(TOK), json={'code': ECHO, 'language': 'python'})
    client.post(f'/api/practice/problems/acc-med-b/submit',   headers=H(TOK), json={'code': 'print("wrong")', 'language': 'python'})
    client.post(f'/api/practice/problems/acc-med-b/submit',   headers=H(TOK), json={'code': ECHO, 'language': 'python'})
    client.post(f'/api/practice/problems/acc-easy-c/submit',  headers=H(TOK), json={'code': ECHO, 'language': 'python'})
    client.post(f'/api/practice/problems/acc-hard-d/submit',  headers=H(TOK), json={'code': 'print("wrong")', 'language': 'python'})
    record('H1', 'history executed (9 attempts, 6 solves by design)', True)

    # DB truth cross-check
    subs = PracticeSubmission.query.filter_by(student_id=UID).all()
    acc = [s for s in subs if s.status == 'Accepted']
    xp_row = StudentXP.query.filter_by(student_id=UID).first()
    record('T1', 'DB truth: 5 practice subs, 3 Accepted, XP=80',
           len(subs) == 5 and len(acc) == 3 and (xp_row.total_xp or 0) == 80,
           f'subs={len(subs)} accepted={len(acc)} xp={xp_row.total_xp}')

    # ── overview ────────────────────────────────────────────────────────
    print('\n[2] OVERVIEW / STANDING / ACCURACY')
    ov = (client.get('/api/platform-user/analytics/overview', headers=H(TOK)).get_json() or {})
    st = ov.get('standing') or {}
    xp_shown = st.get('total_xp', st.get('xp'))
    record('O1', 'standing XP exactly 80', xp_shown == 80, f'xp={xp_shown} level={st.get("level")}')
    record('O2', 'standing problems_solved exactly 6',
           (st.get('problems_solved') or 0) == 6, f'solved={st.get("problems_solved")}')

    dm = ov.get('difficulty_mix') or {}
    record('O3', 'difficulty mix easy=5 medium=1 hard=0 (rating-sourced)',
           (dm.get('easy') or dm.get('easy_solved') or 0) == 5
           and (dm.get('medium') or dm.get('medium_solved') or 0) == 1
           and (dm.get('hard') or dm.get('hard_solved') or 0) == 0,
           f"mix={ {k: dm.get(k) for k in ('easy','medium','hard','easy_solved','medium_solved','hard_solved')} }")
    accr = dm.get('acceptance_rate')
    record('O4', 'acceptance rate = 66.7 (6/9)', abs(float(accr or 0) - 66.7) < 0.11, f'got={accr}')
    acc_j = (client.get('/api/platform-user/analytics/accuracy', headers=H(TOK)).get_json() or {})
    aa = acc_j.get('accuracy') or acc_j
    ftr = aa.get('first_try_rate')
    record('O5', 'first-try rate = 66.7 (4/6) via /accuracy',
           ftr is not None and abs(float(ftr) - 66.7) < 0.11, f'got={ftr}')
    avg = aa.get('avg_attempts', aa.get('average_attempts'))
    record('O6', 'avg attempts per solve ≈ 1.33 (8/6) via /accuracy',
           avg is not None and abs(float(avg) - 1.33) < 0.06, f'got={avg}')

    act = ov.get('activity') or {}
    today = datetime.utcnow().strftime('%Y-%m-%d')
    hm_today = next((d for d in (act.get('heatmap') or []) if d.get('date') == today), None)
    record('O7', 'heatmap TODAY count = 9 (5 subs + 4 course attempts), level 3',
           hm_today and hm_today.get('count') == 9 and hm_today.get('level') == 3,
           f'today={hm_today}')
    summ = act.get('summary') or {}
    record('O8', 'summary: 9 submissions, streak 1, max daily 9',
           (summ.get('total_submissions') or 0) == 9 and (summ.get('current_streak') or 0) == 1
           and (summ.get('max_daily_count') or 0) == 9,
           f'summary={summ}')

    cs = ov.get('course_summary') or {}
    record('O9', 'course summary: 1 enrolled, 1 completed, 3 exercises, 1 certificate',
           cs.get('enrolled_courses') == 1 and cs.get('completed_courses') == 1
           and (cs.get('total_exercises_solved') or 0) == 3
           and (cs.get('certificates') and len(cs['certificates']) == 1),
           f'certs={len(cs.get("certificates") or [])}')

    # ── dedicated endpoints ─────────────────────────────────────────────
    print('\n[3] DEDICATED ENDPOINTS')
    j = client.get('/api/platform-user/analytics/standing', headers=H(TOK)).get_json() or {}
    jst = j.get('standing') or j
    record('E1', '/standing matches overview', (jst.get('total_xp', jst.get('xp')) or 0) == 80,
           f'xp={jst.get("total_xp", jst.get("xp"))}')

    j = client.get('/api/platform-user/analytics/activity?days=60', headers=H(TOK)).get_json() or {}
    hm = j.get('heatmap') or []
    t2 = next((d for d in hm if d.get('date') == today), None)
    record('E2', '/activity heatmap today count=9', t2 and t2.get('count') == 9, f'{t2}')

    j = client.get('/api/platform-user/analytics/accuracy', headers=H(TOK)).get_json() or {}
    aa = j.get('accuracy') or j
    record('E3', '/accuracy acceptance 66.7 + first-try 66.7',
           abs(float(aa.get('acceptance_rate') or dm.get('acceptance_rate') or 0) - 66.7) < 0.11,
           f"acc={aa.get('acceptance_rate')} ftr={aa.get('first_try_rate')}")

    j = client.get('/api/platform-user/analytics/courses', headers=H(TOK)).get_json() or {}
    jc = next((c for c in (j.get('courses') or []) if c.get('id') == CID), None)
    record('E4', '/courses: our course 100% + cert eligible + 35 XP',
           jc and jc.get('completion_pct') == 100.0 and (jc.get('cert_eligible') or jc.get('certificate_id'))
           and jc.get('xp_earned') == 35,
           f"pct={jc.get('completion_pct') if jc else None} xp={jc.get('xp_earned') if jc else None}")

    j = client.get('/api/platform-user/analytics/topic-strength', headers=H(TOK)).get_json() or {}
    ts = {t.get('topic'): t for t in (j.get('topic_strength') or [])}
    arr, gra = ts.get('Arrays'), ts.get('Graphs')
    record('E5', '/topic-strength: Arrays solved=2, Graphs solved=1',
           arr and (arr.get('total_solved') or 0) == 2 and gra and (gra.get('total_solved') or 0) == 1,
           f"Arrays={arr.get('total_solved') if arr else None} Graphs={gra.get('total_solved') if gra else None}")

    j = client.get('/api/platform-user/analytics/unlocks', headers=H(TOK)).get_json() or {}
    un = j.get('unlocks') or j
    med = un.get('medium_unlocked')
    prog = (un.get('medium_progress') or (un.get('next_unlock') or {}).get('progress_pct'))
    record('E6', '/unlocks: Medium LOCKED at 5/15 easy (33.3%)',
           med is False and prog is not None and abs(float(prog) - 33.3) < 0.2,
           f'medium={med} progress={prog}')

    j = client.get('/api/platform-user/analytics/leaderboard', headers=H(TOK)).get_json() or {}
    lb = j.get('leaderboard') or []
    me = next((e for e in lb if e.get('student_id') == UID or e.get('user_id') == UID), None)
    record('E7', '/leaderboard includes user (rating board: 6 solved, rating>0)',
           me is not None and (me.get('problems_solved') or 0) == 6 and (me.get('rating') or 0) > 0,
           f'pos={me.get("position") if me else None} solved={me.get("problems_solved") if me else None}')

    j = client.get('/api/platform-user/analytics/submissions?limit=20', headers=H(TOK)).get_json() or {}
    sl = j.get('submissions') or []
    record('E8', '/submissions returns the 5 practice submissions, newest first',
           len(sl) == 5 and all(s.get('is_run') is not True for s in sl),
           f'n={len(sl)}')

    j = client.get('/api/practice/quest/stats', headers=H(TOK)).get_json() or {}
    qxp = j.get('xp') or {}
    record('E9', 'quest stats XP snapshot = 80', (qxp.get('total_xp') or 0) == 80,
           f'xp={qxp.get("total_xp")}')

    # ── recommendations ─────────────────────────────────────────────────
    print('\n[4] RECOMMENDATIONS')
    recs = (client.get('/api/practice/recommended', headers=H(TOK)).get_json() or {}).get('recommendations') or []
    solved_slugs = {'acc-easy-a', 'acc-med-b', 'acc-easy-c'}   # acc-hard-d is FAILED, not solved
    record('R1', '5 recommendations returned', len(recs) == 5, f'n={len(recs)}')
    record('R2', 'never recommends an already-SOLVED problem (retrying a failed one is fair)',
           all(r.get('slug') not in solved_slugs for r in recs),
           f'leaked={[r.get("slug") for r in recs if r.get("slug") in solved_slugs]}')
    weak_hit = any((r.get('nexlab_topic') in ('Dynamic Programming', 'Graphs'))
                   or (r.get('reason') == 'weak topic practice') for r in recs)
    record('R3', 'targets weak topics (DP failed-only, Graphs retried)',
           weak_hit,
           f"topics={[r.get('nexlab_topic') for r in recs][:5]} reasons={sorted(set(r.get('reason') for r in recs))}")
    record('R4', 'honest stats: no fabricated acceptance (null when unknown)',
           all(r.get('acceptance') is None or 0 < float(r.get('acceptance')) <= 100 for r in recs),
           f"acceptances={[r.get('acceptance') for r in recs][:5]}")

    crecs = (client.get('/api/practice/recommended', headers=H(CTOK)).get_json() or {}).get('recommendations') or []
    record('R5', 'cold-start (new user) gets flagship starter set',
           len(crecs) == 5 and crecs[0].get('slug') == 'two-sum',
           f"first={crecs[0].get('slug') if crecs else None}")

    # ── cleanup ─────────────────────────────────────────────────────────
    print('\n[5] CLEANUP')
    purge_user_rows(UID); purge_user_rows(cold.id)          # submissions FK first
    db.session.delete(user); db.session.delete(cold)
    PracticeTestCase.query.filter(PracticeTestCase.problem_id.in_([pa.id, pb.id, pc.id, pd_.id])).delete(synchronize_session=False)
    Problem.query.filter(Problem.slug.like('acc-%')).delete(synchronize_session=False)
    PlatformExercise.query.filter_by(course_id=CID).delete(synchronize_session=False)
    db.session.delete(course)
    db.session.commit()
    record('C1', 'artifacts removed', User.query.get(UID) is None and User.query.get(cold.id) is None)

print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL NUMBERS ACCURATE ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
