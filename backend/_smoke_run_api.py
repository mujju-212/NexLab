"""
_smoke_run_api.py — Auth'd smoke for the migrated Docker execution endpoints.

Runs the Flask app IN-PROCESS via test_client() — no :5000 server required, so it
always exercises the CURRENT (post-Judge0) code, not whatever is already running.

Verifies plan Verification step 4:
  [A] POST /api/execution/run  -> status_id == 3, and a CodeAttempt row is
      persisted with execution_time_ms / memory_used_kb / compile_status matching
      the response (Docker shape: time_ms is already ms — no Judge0 x1000).
  [B] POST /api/free/exercises/<id>/run -> engine executes; per-case status
      'Accepted' (== internal status_id 3). Output need not match the expected
      value — we are checking the Docker path, not the student's correctness.

Requires: Docker Desktop running, Docker Postgres at 127.0.0.1:5433, and the
fixtures created by test_instructor.py (student + at least one experiment).
Like test_student.py, this writes one CodeAttempt/CodeVersion to the dev DB.

Run:  cd backend && python _smoke_run_api.py
"""
import os
import sys

os.environ['DATABASE_URL'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'

from app import create_app
from app.extensions import db

app = create_app('development')
app.config.update(
    SQLALCHEMY_DATABASE_URI='postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab',
    TESTING=True,
    JWT_SECRET_KEY='test-secret',
    DOCKER_RUNNER_ENABLED=True,   # /run + free-run both gate on this master switch
)
client = app.test_client()

# Trivial, always-clean programs so the case exits 0 (status 'Accepted') in any
# of the languages a free exercise might allow.
TRIVIAL = {
    'python':     'print("free-smoke")',
    'javascript': 'console.log("free-smoke")',
    'c':          '#include <stdio.h>\nint main(){printf("free-smoke\\n");return 0;}',
    'cpp':        '#include <iostream>\nint main(){std::cout<<"free-smoke\\n";return 0;}',
    'java':       'public class Main{public static void main(String[] a){System.out.println("free-smoke");}}',
}

fails = []


def check(cond, msg):
    print(('  OK  ' if cond else '  XX  ') + msg)
    if not cond:
        fails.append(msg)


with app.app_context():
    db.create_all()

    # ── Auth ────────────────────────────────────────────────────────────────────
    r = client.post('/api/auth/login',
                    json={'email': 'stud@tinstrc.edu', 'password': 'Stud@1234'})
    assert r.status_code == 200, (
        f'Student login failed ({r.status_code}) — run test_instructor.py first: {r.data[:200]}'
    )
    H = {'Authorization': f'Bearer {r.get_json()["token"]}'}

    from app.models.user import User
    from app.models.experiment import Experiment
    from app.models.submission import CodeAttempt

    stud = User.query.filter_by(email='stud@tinstrc.edu').first()
    assert stud, 'Student not found — run test_instructor.py first'
    exp = Experiment.query.filter_by(institution_id=stud.institution_id).first()
    assert exp, 'No experiment found — run test_instructor.py first'
    print(f'Fixtures: student={stud.email}  experiment=[{exp.title}]\n')

    # ── [A] /api/execution/run ──────────────────────────────────────────────────
    print('[A] POST /api/execution/run  (lab exec -> Docker sandbox)')
    before = CodeAttempt.query.filter_by(student_id=stud.id, experiment_id=exp.id).count()
    r = client.post('/api/execution/run', headers=H, json={
        'files':               {'main': 'print("smoke-run-ok")'},
        'language':            'python',
        'stdin':               '',
        'experiment_id':       exp.id,
        'is_final_submission': False,
    })
    check(r.status_code == 200, f'HTTP 200 (got {r.status_code}: {r.data[:150]})')
    body = r.get_json() or {}
    check(body.get('status_id') == 3,
          f"status_id == 3 (got {body.get('status_id')} / {body.get('status')})")
    check('smoke-run-ok' in (body.get('stdout') or ''),
          f"stdout carries program output (got {(body.get('stdout') or '')[:40]!r})")
    print(f"      status={body.get('status')}  time_ms={body.get('time_ms')}  memory_kb={body.get('memory_kb')}")

    # persistence — the migration's field mapping is the whole point of step 4
    after = CodeAttempt.query.filter_by(student_id=stud.id, experiment_id=exp.id).count()
    check(after == before + 1, f'CodeAttempt row persisted ({before} -> {after})')
    att = (CodeAttempt.query
           .filter_by(student_id=stud.id, experiment_id=exp.id)
           .order_by(CodeAttempt.attempt_number.desc()).first())
    if att:
        check(att.execution_time_ms == int(body.get('time_ms') or 0),
              f"execution_time_ms == response time_ms ({att.execution_time_ms} == {int(body.get('time_ms') or 0)})")
        check(att.memory_used_kb == (body.get('memory_kb') or None),
              f"memory_used_kb == response memory_kb ({att.memory_used_kb} == {body.get('memory_kb') or None})")
        check(att.compile_status == body.get('status'),
              f"compile_status == response status ({att.compile_status!r} == {body.get('status')!r})")

    # ── [B] /api/free/exercises/<id>/run ────────────────────────────────────────
    print('\n[B] POST /api/free/exercises/<id>/run  (practice -> Docker sandbox)')
    from app.models.free import FreeExercise
    ex = lang = None
    for cand in FreeExercise.query.filter_by(is_published=True, exercise_type='coding').all():
        visible = [tc for tc in (cand.test_cases or []) if not tc.get('hidden', False)]
        pick    = next((l for l in (cand.allowed_languages or []) if l in TRIVIAL), None)
        if visible and pick:
            ex, lang = cand, pick
            break
    if not ex:
        print('      -> skipped (no published coding free exercise with a visible test case)')
    else:
        r = client.post(f'/api/free/exercises/{ex.id}/run', headers=H,
                        json={'code': TRIVIAL[lang], 'language': lang})
        check(r.status_code == 200, f'HTTP 200 (got {r.status_code}: {r.data[:150]})')
        fb      = r.get_json() or {}
        results = fb.get('results') or []
        check(len(results) > 0, f'engine returned per-case results ({len(results)})')
        if results:
            check(results[0].get('status') == 'Accepted',
                  f"case ran clean, status 'Accepted' (got {results[0].get('status')!r})")
            print(f"      exercise=[{ex.title}] lang={lang}  "
                  f"passed={fb.get('passed')}/{fb.get('total')}  status={results[0].get('status')}")

print('\n' + '=' * 62)
if fails:
    print(f'SMOKE FAILED — {len(fails)} check(s): ' + '; '.join(fails))
    sys.exit(1)
print('SMOKE PASSED — /run + free-run execute via Docker; CodeAttempt persists correctly')
sys.exit(0)
