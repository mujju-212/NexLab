"""
verify_live_scenario.py — End-to-end verification harness for the live-session
scenario seeded by database/seed_live_scenario.py.

Drives the REAL Flask API in-process (app.test_client) against Postgres:5433 with
REAL JWT logins — no :5000 restart needed. Prints a PASS/FAIL table and exits 0
only if every check passed.

  Instructor journey  (instructor@nexlab.demo)
    1  login
    2  GET /dashboard          — sees active + upcoming sessions
    3  GET /sessions           — sees the seeded sessions
    4  GET /experiments        — sees own 3 published experiments
    5  POST /experiments       — can create a new experiment

  Student journey  (student@nexlab.demo)
    6  login
    7  GET /sessions           — sees the sessions their section is in
    8  GET check-gate (S2)     — active no-quiz session → gate open, jitsi room handed out
    9  quiz gate (S4/Exp1)     — blocked before quiz, passes quiz, gate opens
   10  POST catchup (S1)       — ended + catchup_enabled → allowed to join late

Run (see memory: run-backend-scripts):
    cd backend
    DATABASE_URL=postgresql://postgres:vlabpass@localhost:5433/virtuallab \
        PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_live_scenario.py
"""
import os, sys, json
os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@localhost:5433/virtuallab')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models.session import LabSession, SessionAttendance
from app.models.experiment import Experiment, ContentModule, QuizQuestion, ContentProgress

INST             = 'inst-test-001'
INSTRUCTOR_EMAIL = 'instructor@nexlab.demo'
STUDENT_EMAIL    = 'student@nexlab.demo'
# seed_test_users.py assigns per-role passwords (NOT the shared DEMO_PASSWORD).
PASSWORDS = {
    INSTRUCTOR_EMAIL: 'Instructor@123',
    STUDENT_EMAIL:    'Student@123',
}

app = create_app('development')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
# PROPAGATE_EXCEPTIONS=False so a 500 inside a route comes back as a 500 *response*
# we can record, instead of raising through the test client and aborting the harness.
app.config.update(TESTING=True, PROPAGATE_EXCEPTIONS=False, DOCKER_RUNNER_ENABLED=True)
client = app.test_client()
ctx = app.app_context(); ctx.push()

results = []   # (step, name, passed, detail)


def record(step, name, passed, detail=''):
    results.append((step, name, bool(passed), detail))
    mark = 'PASS' if passed else 'FAIL'
    print(f"  [{mark}] {step:<4} {name}" + (f"  — {detail}" if detail else ''))


def login(email):
    r = client.post('/api/auth/login', json={'email': email, 'password': PASSWORDS[email]})
    if r.status_code != 200:
        return None, r
    return r.get_json()['token'], r


def auth(token):
    return {'Authorization': f'Bearer {token}'}


# ── Resolve the seeded rows we assert against ────────────────────────────────────
def resolve_ids():
    exp1 = Experiment.query.filter_by(institution_id=INST, title='Stack Implementation using Arrays').first()
    exp3 = Experiment.query.filter_by(institution_id=INST, title='Python List Comprehensions').first()
    s1 = LabSession.query.filter_by(institution_id=INST, title='DS Lab 1 — Stacks (completed)').first()
    s2 = LabSession.query.filter_by(institution_id=INST, title='DS Lab 2 — Linked Lists (LIVE)').first()
    s3 = LabSession.query.filter_by(institution_id=INST, title='Python Lab 1 — List Comprehensions').first()
    s4 = LabSession.query.filter_by(institution_id=INST, title='DS Lab 3 — Stacks Reprise (gated)').first()
    quiz = ContentModule.query.filter_by(experiment_id=exp1.id, module_type='quiz').first() if exp1 else None
    return exp1, exp3, s1, s2, s3, s4, quiz


def main():
    exp1, exp3, s1, s2, s3, s4, quiz = resolve_ids()
    missing = [n for n, v in [('exp1', exp1), ('exp3', exp3), ('s1', s1),
                              ('s2', s2), ('s3', s3), ('s4', s4), ('quiz', quiz)] if v is None]
    if missing:
        print(f"FATAL: seed rows missing: {missing}. Run seed_live_scenario.py first.")
        sys.exit(2)

    print("=" * 72)
    print("INSTRUCTOR JOURNEY")
    print("=" * 72)

    itok, r = login(INSTRUCTOR_EMAIL)
    record('1', 'instructor login', itok is not None, f"HTTP {r.status_code}")
    if not itok:
        _finish(); return

    # 2 — dashboard
    r = client.get('/api/instructor/dashboard', headers=auth(itok))
    j = r.get_json() if r.status_code == 200 else {}
    active = j.get('active_sessions', [])
    upcoming = j.get('upcoming_sessions', [])
    record('2', 'dashboard active+upcoming', r.status_code == 200 and len(active) >= 1 and len(upcoming) >= 1,
           f"active={len(active)} upcoming={len(upcoming)}")

    # 3 — list sessions
    r = client.get('/api/instructor/sessions', headers=auth(itok))
    sess = r.get_json().get('sessions', []) if r.status_code == 200 else []
    seeded_titles = {s1.title, s2.title, s3.title, s4.title}
    seen_titles = {s.get('title') for s in sess}
    record('3', 'instructor sees seeded sessions', seeded_titles.issubset(seen_titles),
           f"{len(seeded_titles & seen_titles)}/4 seeded visible")

    # 4 — list own experiments
    r = client.get('/api/instructor/experiments', headers=auth(itok))
    exps = r.get_json().get('experiments', []) if r.status_code == 200 else []
    titles = {e.get('title') for e in exps}
    want = {'Stack Implementation using Arrays', 'Linked List Traversal', 'Python List Comprehensions'}
    record('4', 'instructor sees own 3 experiments', want.issubset(titles),
           f"{len(want & titles)}/3 present")

    # 5 — create a new experiment
    payload = {
        'subject_id': exp1.subject_id, 'exp_number': 99,
        'title': '[verify] Queue with Two Stacks',
        'concept_tags': ['queues', 'stacks'], 'difficulty_level': 2,
        'allowed_languages': ['python'],
        'rubric_test_cases': 60, 'rubric_lab_report': 20,
        'rubric_code_quality': 10, 'rubric_viva': 10,
    }
    r = client.post('/api/instructor/experiments', headers=auth(itok), json=payload)
    new_exp = r.get_json().get('experiment') if r.status_code == 201 else None
    record('5', 'instructor creates experiment', r.status_code == 201 and new_exp is not None,
           f"HTTP {r.status_code}")
    # cleanup the throwaway experiment
    if new_exp:
        e = Experiment.query.get(new_exp['id'])
        if e:
            db.session.delete(e); db.session.commit()

    print("=" * 72)
    print("STUDENT JOURNEY")
    print("=" * 72)

    stok, r = login(STUDENT_EMAIL)
    stok_uid = r.get_json().get('user', {}).get('id') if r.status_code == 200 else None
    record('6', 'student login', stok is not None, f"HTTP {r.status_code}")
    if not stok:
        _finish(); return

    # S2 was seeded with started_at = now-20m, late_join_window_min=30.
    # But "now" was captured at seed-time; the DB row is stale after the first run.
    # Refresh started_at so the late-join window is always open for step 8.
    from datetime import datetime, timedelta
    s2.started_at = datetime.utcnow() - timedelta(minutes=20)
    db.session.commit()

    # 7 — my sessions
    r = client.get('/api/student/sessions', headers=auth(stok))
    ssess = r.get_json().get('sessions', []) if r.status_code == 200 else []
    ss_ids = {s.get('id') for s in ssess}
    # student is in DS-A + Py-A, so should see S1..S4
    want_ids = {s1.id, s2.id, s3.id, s4.id}
    record('7', 'student sees enrolled sessions', want_ids.issubset(ss_ids),
           f"{len(want_ids & ss_ids)}/4 visible")

    # 8 — check-gate on S2 (active, no quiz on Exp2) → gate open + jitsi room handed out.
    # S3 is scheduled, so check_gate correctly returns jitsi_room=null for it (F4 fix).
    # S2 is active, so it should return a live jitsi_room.
    r = client.get(f'/api/student/sessions/{s2.id}/check-gate', headers=auth(stok))
    j = r.get_json() if r.status_code == 200 else {}
    record('8', 'gate open (active no-quiz session S2) + jitsi room',
           r.status_code == 200 and j.get('gate_passed') is True and bool(j.get('jitsi_room')),
           f"gate_passed={j.get('gate_passed')} room={'yes' if j.get('jitsi_room') else 'no'}")

    # 9 — gate on S4 (Exp1 HAS a quiz): blocked → pass quiz → open
    # Idempotency: if a prior harness run already passed the quiz, reset ContentProgress
    # so the gate is reliably blocked on entry (making blocked_first always True).
    if stok_uid:
        prior_progress = ContentProgress.query.filter_by(
            student_id=stok_uid, module_id=quiz.id
        ).first()
        if prior_progress:
            db.session.delete(prior_progress)
            db.session.commit()

    r = client.get(f'/api/student/sessions/{s4.id}/check-gate', headers=auth(stok))
    before = r.get_json() if r.status_code == 200 else {}
    blocked_first = before.get('gate_passed') is False and not before.get('jitsi_room')

    # answer the quiz correctly (B=pop, C=LIFO)
    qs = QuizQuestion.query.filter_by(module_id=quiz.id).all()
    answers = {q.id: q.correct_answer for q in qs}
    rq = client.post(f'/api/student/prelab/{quiz.id}/quiz/submit', headers=auth(stok),
                     json={'answers': answers})
    quiz_ok = rq.status_code == 200
    quiz_json = rq.get_json() if quiz_ok else {}
    passed_quiz = quiz_json.get('passed') is True

    if not quiz_ok:
        # A 500 here is the real defect (F9): ContentProgress.attempts is None on
        # the first-ever submit, so `progress.attempts += 1` throws.
        record('9', 'quiz gate: blocked -> pass -> open', False,
               f"quiz submit HTTP {rq.status_code} [DEFECT F9] — blocked_first={blocked_first}")
    else:
        r = client.get(f'/api/student/sessions/{s4.id}/check-gate', headers=auth(stok))
        after = r.get_json() if r.status_code == 200 else {}
        # S4 is scheduled, so check_gate correctly returns jitsi_room=null (F4 fix).
        # We only assert gate_passed=True — the jitsi_room will appear once S4 goes active.
        opened_after = after.get('gate_passed') is True
        record('9', 'quiz gate: blocked -> pass -> open', blocked_first and passed_quiz and opened_after,
               f"blocked={blocked_first} score={quiz_json.get('score')} gate_passed_after={after.get('gate_passed')}")

    # 10 — catchup on S1 (ended + catchup_enabled).
    # Reset any attendance row that a prior harness run may have left as 'partial'/'present'
    # (the catchup route blocks re-entry when status is already partial/present/late).
    if stok_uid:
        stale = SessionAttendance.query.filter_by(
            session_id=s1.id, student_id=stok_uid
        ).first()
        if stale and stale.status in ('partial', 'present', 'late'):
            db.session.delete(stale)
            db.session.commit()

    r = client.post(f'/api/student/sessions/{s1.id}/catchup', headers=auth(stok), json={})
    record('10', 'student catch-up join (ended session)', r.status_code == 200,
           f"HTTP {r.status_code} {r.get_json().get('message') or r.get_json().get('error')}")

    _finish()


def _finish():
    total = len(results)
    passed = sum(1 for _, _, ok, _ in results if ok)
    print("=" * 72)
    print(f"RESULT: {passed}/{total} checks passed")
    fails = [(s, n, d) for s, n, ok, d in results if not ok]
    if fails:
        print("FAILURES:")
        for s, n, d in fails:
            print(f"  - [{s}] {n}: {d}")
    print("=" * 72)
    # write machine-readable result for the report step
    with open('_verify_result.json', 'w', encoding='utf-8') as f:
        json.dump([{'step': s, 'name': n, 'passed': ok, 'detail': d} for s, n, ok, d in results], f, indent=2)
    sys.exit(0 if passed == total else 1)


if __name__ == '__main__':
    main()
