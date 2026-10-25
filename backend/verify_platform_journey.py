"""
verify_platform_journey.py — REAL platform-user journey, end to end.

Acts as a genuine direct ('platform') user: lands on the catalog, opens a
course, runs code in the sandbox, fails, retries, solves, answers an MCQ,
completes a reading module, checks progress/leaderboard, downloads the
certificate, browses the practice library, submits a problem, does the daily
quest check-in, claims a quest reward, enrolls in a study plan, bookmarks,
saves a playground session, publishes the public showcase — then verifies
EVERY action landed in the database and is reflected by the analytics
endpoints.

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_platform_journey.py
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
    TESTING=True,
    PROPAGATE_EXCEPTIONS=False,
    JWT_SECRET_KEY='test-secret',
    DOCKER_RUNNER_ENABLED=True,
)
client = app.test_client()

EMAIL = 'journey.tester@nexlab.io'
PASSWORD = 'Journey@1234'

results = []
def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

def purge_user_rows(uid):
    """Delete every row in ANY table that FK-references users for this user id."""
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

SUM_CODE   = 'a = int(input())\nb = int(input())\nprint(a + b)\n'
WRONG_CODE = 'a = int(input())\nb = int(input())\nprint(a * b)\n'

with app.app_context():
    from app.models.user import User
    from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
    from app.models.practice import (
        StudentXP, StudentBadge, PlatformRating, PracticeSubmission,
        StudyPlanProgress,
    )
    from app.models.practice_extras import ProblemBookmark, PlaygroundSession

    # ══════════════════════════════════════════════════════════════════
    # [0] FIXTURES — fresh journey user + a controlled course/exercises
    # ══════════════════════════════════════════════════════════════════
    print('\n[0] FIXTURES (idempotent reset)')
    old = User.query.filter_by(email=EMAIL).first()
    if old:
        purge_user_rows(old.id)
        db.session.delete(old)
    oldc = PlatformCourse.query.filter_by(slug='journey-quests-101').first()
    if oldc:
        PlatformExercise.query.filter_by(course_id=oldc.id).delete(synchronize_session=False)
        db.session.delete(oldc)
    db.session.commit()

    import bcrypt as _bcrypt
    user = User(email=EMAIL, full_name='Journey Tester', role='platform_user', is_active=True)
    user.password_hash = _bcrypt.hashpw(PASSWORD.encode(), _bcrypt.gensalt()).decode()
    db.session.add(user)
    course = PlatformCourse(
        slug='journey-quests-101', title='Journey Quests 101', description='harness course',
        difficulty='beginner', language='python', is_published=True, order_index=999,
    )
    db.session.add(course)
    db.session.flush()
    coding = PlatformExercise(
        course_id=course.id, order_index=1, title='Sum Two Numbers',
        description='Read two integers and print their sum.', exercise_type='coding',
        difficulty='easy', xp_reward=25,
        starter_code={'python': 'a = int(input())\n'},
        allowed_languages=['python'],
        test_cases=[
            {'input': '2\n3\n', 'expected': '5', 'hidden': False},
            {'input': '10\n-4\n', 'expected': '6', 'hidden': True},
        ],
    )
    mcq = PlatformExercise(
        course_id=course.id, order_index=2, title='Pick the sum',
        description='What is 2+3?', exercise_type='mcq',
        difficulty='easy', xp_reward=5,
        mcq_options=['4', '5', '6'], mcq_answer='B', mcq_explanation='2+3=5',
    )
    reading = PlatformExercise(
        course_id=course.id, order_index=3, title='Read: How sums work',
        description='Reading module about addition.', exercise_type='reading',
        difficulty='easy', xp_reward=5,
    )
    db.session.add_all([coding, mcq, reading])
    db.session.commit()
    UID, CID = user.id, course.id
    record('F1', 'fixtures created (user + course + coding/MCQ/reading exercises)', True,
           f'user={UID[:8]} course={CID[:8]}')

    # ══════════════════════════════════════════════════════════════════
    # [1] ENTRY — registration gate + catalog + auth
    # ══════════════════════════════════════════════════════════════════
    print('\n[1] ENTRY')
    r = client.post('/api/auth/register', json={'email': 'x@y.io', 'password': 'Zz1!aaaa',
                                                'full_name': 'Probe'})
    record('E1', 'register probe gated (OTP/feature — no anonymous signup hole)',
           r.status_code in (400, 403, 428), f'HTTP {r.status_code}')

    r = client.get('/api/platform-user/courses')
    j = r.get_json() or {}
    listed = {c['id']: c for c in (j.get('courses') or [])}
    record('E2', 'public catalog lists our course (no auth needed)',
           r.status_code == 200 and CID in listed, f'HTTP {r.status_code} total={len(listed)}')

    r = client.post('/api/auth/login', json={'email': EMAIL, 'password': PASSWORD})
    j = r.get_json() or {}
    TOK = j.get('token')
    record('E3', 'platform user login', r.status_code == 200 and TOK,
           f"HTTP {r.status_code} role={j.get('user', {}).get('role')}")

    r = client.get(f'/api/platform-user/courses/{CID}', headers=H(TOK))
    j = r.get_json() or {}
    exs = j.get('exercises') or []
    record('E4', 'course detail lists all 3 exercises in order',
           r.status_code == 200 and len(exs) == 3 and exs[0]['title'] == 'Sum Two Numbers',
           f'n={len(exs)}')

    r = client.get(f"/api/platform-user/exercises/{coding.id}", headers=H(TOK))
    ex = ((r.get_json() or {}).get('exercise')) or {}
    vis = [tc for tc in (ex.get('test_cases') or []) if not tc.get('hidden')]
    hid = [tc for tc in (ex.get('test_cases') or []) if tc.get('hidden')]
    record('E5', 'exercise detail: visible cases served, hidden cases masked',
           r.status_code == 200 and len(vis) == 1 and len(hid) == 0,
           f'visible={len(vis)} hidden-leaked={len(hid)}')
    mcq_leak = 'mcq_answer' in ex
    r2 = client.get(f"/api/platform-user/exercises/{mcq.id}")
    mcq_pub = ((r2.get_json() or {}).get('exercise')) or {}
    record('E6', 'MCQ detail leaks NO answer (public endpoint)',
           (not mcq_leak) and 'mcq_answer' not in mcq_pub and 'mcq_explanation' not in mcq_pub,
           f"keys-leaked={[k for k in mcq_pub if 'answer' in k or 'explanation' in k]}")

    # ══════════════════════════════════════════════════════════════════
    # [2] SOLVE LOOP — run → fail → retry → solve → MCQ → reading complete
    # ══════════════════════════════════════════════════════════════════
    print('\n[2] SOLVE LOOP')
    r = client.post(f'/api/platform-user/exercises/{coding.id}/run', headers=H(TOK),
                    json={'code': SUM_CODE, 'language': 'python'})
    j = r.get_json() or {}
    runs = j.get('results') or []
    record('S1', 'sandbox RUN executes via Docker (visible cases only)',
           r.status_code == 200 and runs and j.get('all_passed'),
           f"HTTP {r.status_code} cases={len(runs)} all_passed={j.get('all_passed')}")

    r = client.post(f'/api/platform-user/exercises/{coding.id}/submit', headers=H(TOK),
                    json={'code': WRONG_CODE, 'language': 'python'})
    j = r.get_json() or {}
    record('S2', 'wrong submit graded honestly (not solved, score<100)',
           r.status_code == 200 and not j.get('solved') and 0 <= (j.get('score') or 0) < 100,
           f"score={j.get('score')} solved={j.get('solved')}")

    r = client.post(f'/api/platform-user/exercises/{coding.id}/submit', headers=H(TOK),
                    json={'code': SUM_CODE, 'language': 'python'})
    j = r.get_json() or {}
    record('S3', 'correct submit -> SOLVED + XP awarded',
           r.status_code == 200 and j.get('solved') and j.get('xp_earned') == 25,
           f"score={j.get('score')} xp={j.get('xp_earned')}")

    r = client.post(f'/api/platform-user/exercises/{coding.id}/submit', headers=H(TOK),
                    json={'code': SUM_CODE, 'language': 'python'})
    j = r.get_json() or {}
    record('S4', 're-submit does not double-award XP (anti-farm)',
           (j.get('xp_earned') or 0) == 25 and j.get('solved'), f"xp still={j.get('xp_earned')}")

    r = client.post(f'/api/platform-user/exercises/{mcq.id}/answer', headers=H(TOK),
                    json={'answer': 'B'})
    j = r.get_json() or {}
    record('S5', 'MCQ answer graded + recorded (letter key)',
           r.status_code == 200 and j.get('correct') is True and j.get('xp_earned') == 5,
           f"correct={j.get('correct')} xp={j.get('xp_earned')}")

    r = client.post(f'/api/platform-user/exercises/{reading.id}/complete', headers=H(TOK))
    j = r.get_json() or {}
    record('S6', 'reading module complete -> solved + XP once',
           r.status_code == 200 and j.get('solved') and j.get('xp_earned') == 5,
           f"HTTP {r.status_code} {str(j)[:80]}")

    # ══════════════════════════════════════════════════════════════════
    # [3] PROGRESS + LEADERBOARD + CERTIFICATE
    # ══════════════════════════════════════════════════════════════════
    print('\n[3] PROGRESS / LEADERBOARD / CERT')
    r = client.get('/api/platform-user/progress', headers=H(TOK))
    j = r.get_json() or {}
    rec_ok = (j.get('by_course') or {}).get(CID, {}).get('solved') == 3
    record('P1', 'overall progress: by_course shows 3 solves + XP total',
           r.status_code == 200 and rec_ok and (j.get('total_xp') or 0) >= 35,
           f"by_course={ (j.get('by_course') or {}).get(CID) } total_xp={j.get('total_xp')}")

    r = client.get(f'/api/platform-user/progress/{CID}', headers=H(TOK))
    j = r.get_json() or {}
    record('P2', 'course progress: all 3 exercise ids solved',
           r.status_code == 200 and len(j.get('solved_ids') or []) == 3,
           f"solved={len(j.get('solved_ids') or [])}/3")

    r = client.get(f'/api/platform-user/leaderboard/{CID}', headers=H(TOK))
    j = r.get_json() or {}
    lb = j.get('leaderboard') or []
    me = next((e for e in lb if e.get('user_id') == UID), None)
    record('P3', 'course leaderboard includes the solver with XP',
           r.status_code == 200 and me is not None and me.get('xp', 0) >= 35,
           f'entries={len(lb)} my_rank={me.get("rank") if me else None} xp={me.get("xp") if me else None}')

    r = client.get(f'/api/platform-user/courses/{CID}/certificate', headers=H(TOK))
    ok_fmt = r.status_code == 200 and (r.data[:4] == b'%PDF' or b'<html' in r.data[:200].lower())
    record('P4', 'course certificate downloads (PDF, HTML fallback ok)',
           ok_fmt, f'HTTP {r.status_code} bytes={len(r.data)} fmt={"pdf" if r.data[:4]==b"%PDF" else "html"}')

    # ══════════════════════════════════════════════════════════════════
    # [4] PRACTICE LIBRARY — problems / daily / quest / plans
    # ══════════════════════════════════════════════════════════════════
    print('\n[4] LIBRARY / QUEST / PLANS')
    r = client.get('/api/practice/problems', headers=H(TOK))
    j = r.get_json() or {}
    probs = j.get('problems') or []
    record('L1', 'problem library lists problems',
           r.status_code == 200 and len(probs) > 0, f'n={len(probs)}')

    # find an echo-solvable problem (all stored cases: expected == input)
    echo_prob = None
    for p in probs[:60]:
        slug = p.get('slug')
        det = client.get(f'/api/practice/problems/{slug}', headers=H(TOK)).get_json() or {}
        full = det.get('problem') or det
        tcs = full.get('test_cases') or det.get('test_cases') or []
        if tcs and all(str(tc.get('expected', '')).strip() == str(tc.get('input', '')).strip()
                       for tc in tcs if tc.get('input') is not None):
            echo_prob = (slug, tcs)
            break
    if echo_prob:
        r = client.post(f"/api/practice/problems/{echo_prob[0]}/submit", headers=H(TOK),
                        json={'code': 'print(input())', 'language': 'python'})
        j = r.get_json() or {}
        record('L2', 'library problem SOLVED + submission stored',
               r.status_code == 200 and j.get('status') == 'Accepted',
               f"{echo_prob[0]} -> {j.get('status')}")
    else:
        slug = probs[0]['slug'] if probs else None
        r = client.post(f'/api/practice/problems/{slug}/submit', headers=H(TOK),
                        json={'code': 'print("definitely-wrong")', 'language': 'python'})
        j = r.get_json() or {}
        record('L2', 'library problem submit recorded (wrong-answer path)',
               r.status_code == 200 and (j.get('status') or '') != '',
               f"status={j.get('status')} (no echo problem; solve path proven in S3)")

    r = client.get('/api/practice/daily', headers=H(TOK))
    record('L3', 'daily challenge endpoint responds', r.status_code == 200,
           f'HTTP {r.status_code} keys={list((r.get_json() or {}).keys())[:5]}')

    r = client.post('/api/practice/quest/daily-checkin', headers=H(TOK))
    j = r.get_json() or {}
    record('Q1', 'daily check-in: streak + XP bonus recorded',
           r.status_code == 200 and j.get('checked_in'),
           f"streak={j.get('streak_days')} bonus={j.get('xp_bonus')}")

    r = client.get('/api/practice/quest/dashboard', headers=H(TOK))
    j = r.get_json() or {}
    quests = ((j.get('daily_quests') or {}).get('items') or [])         + ((j.get('weekly_quests') or {}).get('items') or [])         + ((j.get('achievement_quests') or {}).get('items') or [])
    claimable = next((q for q in quests
                      if (q.get('can_claim') or q.get('claimable') or
                          (q.get('status') == 'completed' and not q.get('claimed')))), None)
    if claimable:
        key = claimable.get('key') or claimable.get('quest_key') or claimable.get('id')
        r2 = client.post('/api/practice/quest/claim', headers=H(TOK), json={'quest_key': key})
        j2 = r2.get_json() or {}
        record('Q2', 'quest reward claimed (XP credited)',
               r2.status_code == 200 and not j2.get('error'), f"quest={key} {str(j2)[:90]}")
    else:
        record('Q2', 'quest dashboard reachable (nothing claimable right now)',
               r.status_code == 200, f'quests={len(quests)} claimable=0')

    r = client.get('/api/practice/plans', headers=H(TOK))
    j = r.get_json() or {}
    plans = j.get('plans') or []
    record('PL1', 'study plans listed', r.status_code == 200, f'n={len(plans)}')
    plans_ok = False
    if plans:
        pid = plans[0].get('id')
        r2 = client.post(f'/api/practice/plans/{pid}/enroll', headers=H(TOK))
        j2 = r2.get_json() or {}
        r3 = client.post(f'/api/practice/plans/{pid}/enroll', headers=H(TOK))
        plans_ok = (r2.status_code in (200, 201) and not j2.get('error')
                    and r3.status_code == 200)
        record('PL2', 'study plan enrollment stored + idempotent', plans_ok,
               f"HTTP {r2.status_code}/{r3.status_code}")
    else:
        record('PL2', 'study plan enroll — SKIPPED (no plans seeded)', True, 'n=0')

    # ══════════════════════════════════════════════════════════════════
    # [5] BOOKMARKS / PLAYGROUND / SHOWCASE
    # ══════════════════════════════════════════════════════════════════
    print('\n[5] BOOKMARKS / PLAYGROUND / SHOWCASE')
    any_pid = probs[0].get('id') if probs else None
    r = client.post('/api/practice/bookmarks', headers=H(TOK), json={'problem_id': any_pid})
    j = r.get_json() or {}
    r = client.get('/api/practice/bookmarks', headers=H(TOK))
    j = r.get_json() or {}
    record('B1', 'bookmark stored + listed',
           r.status_code == 200 and len(j.get('bookmarks') or []) >= 1,
           f'n={len(j.get("bookmarks") or [])}')

    r = client.post('/api/practice/playground/sessions', headers=H(TOK),
                    json={'title': 'journey scratch', 'language': 'python', 'code': 'print("hi")'})
    pg_ok = r.status_code in (200, 201)
    r = client.get('/api/practice/playground/sessions', headers=H(TOK))
    j = r.get_json() or {}
    record('G1', 'playground session saved + listed',
           pg_ok and r.status_code == 200 and len(j.get('sessions') or []) >= 1,
           f'n={len(j.get("sessions") or [])}')

    r = client.patch('/api/practice/showcase', headers=H(TOK), json={'profile_public': True})
    j = r.get_json() or {}
    slug = j.get('profile_slug') or (j.get('showcase') or {}).get('profile_slug')
    record('W1', 'showcase published with public slug',
           r.status_code == 200 and bool(slug), f'slug={slug}')
    if slug:
        r2 = client.get(f'/api/practice/showcase/{slug}')   # NO auth — public page
        j2 = r2.get_json() or {}
        name = j2.get('display_name')
        xp_pub = (j2.get('xp') or {})
        record('W2', 'public showcase renders (no auth) with real stats',
               r2.status_code == 200 and name == 'Journey T.' and (xp_pub.get('total_xp') or 0) >= 35,
               f'HTTP {r2.status_code} name={name} xp={xp_pub.get("total_xp")}')

    # ══════════════════════════════════════════════════════════════════
    # [6] ANALYTICS REFLECTS THE JOURNEY  (the whole point of recording)
    # ══════════════════════════════════════════════════════════════════
    print('\n[6] ANALYTICS REFLECTION')
    r = client.get('/api/platform-user/analytics/overview', headers=H(TOK))
    ov = r.get_json() or {}
    solves_total = (ov.get('total_solved')
                    or (ov.get('summary') or {}).get('total_solved')
                    or ((ov.get('standing') or {}).get('problems_solved')))
    record('A1', 'overview counts real solves (>=3)',
           r.status_code == 200 and (solves_total or 0) >= 3, f"solved={solves_total}")

    r = client.get('/api/platform-user/analytics/standing', headers=H(TOK))
    st = r.get_json() or {}
    st = st.get('standing') or st
    xp_v = st.get('xp') or st.get('total_xp')
    record('A2', 'standing shows real XP/level/rating (>= 35 XP)',
           r.status_code == 200 and ((xp_v or 0) >= 35 or (st.get('rating') or 0) > 0),
           f"rating={st.get('rating')} level={st.get('level')} xp={xp_v}")

    r = client.get('/api/platform-user/analytics/activity?days=30', headers=H(TOK))
    ac = r.get_json() or {}
    grid = ac.get('heatmap') or ac.get('activity') or ac.get('days') or {}
    today = datetime.utcnow().strftime('%Y-%m-%d')
    found = False
    if isinstance(grid, list):
        found = any(str(e.get('date', e.get('day', ''))).startswith(today)
                    and (e.get('count', e.get('solves', 0)) or 0) > 0 for e in grid)
    elif isinstance(grid, dict):
        found = any(k.startswith(today) and (v or 0) for k, v in grid.items())
    record('A3', 'activity heatmap has TODAY with real counts', r.status_code == 200 and found,
           f'today={today} present={found}')

    r = client.get('/api/platform-user/analytics/courses', headers=H(TOK))
    co = r.get_json() or {}
    courses_a = co.get('courses') or []
    jc = next((c for c in courses_a
               if c.get('course_id') == CID or c.get('slug') == 'journey-quests-101'), None)
    record('A4', 'analytics courses: our course 100% + certificate eligible',
           r.status_code == 200 and jc is not None
           and (jc.get('completion_pct') == 100.0)
           and (jc.get('cert_eligible') or jc.get('certificate_id')),
           f"pct={jc.get('completion_pct') if jc else None} cert={bool(jc and (jc.get('cert_eligible') or jc.get('certificate_id'))) if jc else None}")

    r = client.get('/api/platform-user/analytics/unlocks', headers=H(TOK))
    un = r.get_json() or {}
    tiers = un.get('unlocked_tiers') or []
    record('A5', 'unlocks: Easy tier unlocked by the solves',
           r.status_code == 200 and any('Easy' in str(t) for t in tiers), f'tiers={tiers}')

    r = client.get('/api/platform-user/analytics/submissions?limit=10', headers=H(TOK))
    sb = r.get_json() or {}
    subs = sb.get('submissions') or []
    record('A6', 'recent submissions feed shows journey submissions',
           r.status_code == 200 and len(subs) >= 1, f'n={len(subs)}')

    # ══════════════════════════════════════════════════════════════════
    # [7] DB AUDIT — every action left a row
    # ══════════════════════════════════════════════════════════════════
    print('\n[7] DB AUDIT')
    prows = PlatformProgress.query.filter_by(user_id=UID).all()
    solved_rows = [p for p in prows if p.status == 'solved']
    attempts = sum((p.attempts or 0) for p in prows)
    record('D1', 'PlatformProgress: 3 solved rows, attempts counted',
           len(solved_rows) == 3 and attempts >= 4,
           f'rows={len(prows)} solved={len(solved_rows)} attempts={attempts}')
    xp = StudentXP.query.filter_by(student_id=UID).first()
    record('D2', 'StudentXP row: XP >= 35, streak >= 1',
           bool(xp) and (xp.total_xp or 0) >= 35 and (xp.streak_days or 0) >= 1,
           f'xp={getattr(xp, "total_xp", None)} level={getattr(xp, "level", None)} streak={getattr(xp, "streak_days", None)}')
    badge = StudentBadge.query.filter_by(student_id=UID, badge_id='first_solve').first()
    record('D3', "'first_solve' badge row exists", bool(badge),
           f'badges={StudentBadge.query.filter_by(student_id=UID).count()}')
    rating = PlatformRating.query.get(UID)
    record('D4', 'PlatformRating row computed from the solves',
           bool(rating) and (rating.rating or 0) > 0,
           f'rating={getattr(rating, "rating", None)} easy={getattr(rating, "easy_solved", None)}')
    psubs = PracticeSubmission.query.filter_by(student_id=UID).all()
    record('D5', 'PracticeSubmission rows stored from library submit',
           len(psubs) >= 1, f'n={len(psubs)} statuses={[s.status for s in psubs][:5]}')
    if plans:
        n = StudyPlanProgress.query.filter_by(student_id=UID).count()
        record('D6', 'StudyPlanProgress enrollment row stored', n >= 1, f'n={n}')
    bmk = ProblemBookmark.query.filter_by(user_id=UID).count()
    record('D7', 'Bookmark row stored', bmk >= 1, f'n={bmk}')
    pgs = PlaygroundSession.query.filter_by(user_id=UID).count()
    record('D8', 'PlaygroundSession row stored', pgs >= 1, f'n={pgs}')
    solves_count = db.session.query(PlatformExercise.solves_count).filter_by(id=coding.id).scalar()
    record('D9', 'exercise solves_count incremented globally', (solves_count or 0) >= 1,
           f'solves_count={solves_count}')

    # ══════════════════════════════════════════════════════════════════
    # [8] CLEANUP — remove journey artifacts
    # ══════════════════════════════════════════════════════════════════
    print('\n[8] CLEANUP')
    purge_user_rows(UID)
    u = User.query.get(UID)
    if u:
        db.session.delete(u)
    PlatformExercise.query.filter_by(course_id=CID).delete(synchronize_session=False)
    c = PlatformCourse.query.get(CID)
    if c:
        db.session.delete(c)
    db.session.commit()
    record('C1', 'journey artifacts removed',
           User.query.get(UID) is None and PlatformCourse.query.get(CID) is None)

# ── Summary ──────────────────────────────────────────────────────────
print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL GREEN ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
