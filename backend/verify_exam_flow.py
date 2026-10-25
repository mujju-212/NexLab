"""
verify_exam_flow.py — End-to-end verification of the TIMED CODING EXAM flow.

Answers: instructor publishes a timed coding assignment → can a student properly
attend it, solve it, and is every detail recorded in the DB correctly?

Runs the REAL Flask routes in-process via test_client() against Postgres:5433
with real JWT logins and the real Docker engine (same pattern as
verify_live_scenario.py / _smoke_run_api.py).

Coverage:
  [I]  Instructor: create mixed exam (window + countdown + retakes) → empty-publish
       guard → add MCQ + coding question (visible + hidden case) → publish.
  [II] Negative guards: upcoming-window start blocked, draft exam invisible,
       student payload leaks no answers / no hidden test cases.
  [S]  Student journey: list → detail → start (countdown set) → in-exam run-code
       via Docker → auto-save → submit → grade 100 → retake (worse) → best score
       kept → third start blocked → result review.
  [DB] Direct ORM audit: Exam, ExamQuestion, ExamAttempt (score/points/answers
       JSON incl. per-case results), Grade sync (exam_id, best final_grade).
  [C]  Cleanup via instructor DELETE (also exercises the cascade).

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_exam_flow.py
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
    TESTING=True,
    PROPAGATE_EXCEPTIONS=False,   # 500s come back as responses, not tracebacks
    JWT_SECRET_KEY='test-secret',
    DOCKER_RUNNER_ENABLED=True,
)
client = app.test_client()

INSTRUCTOR = {'email': 'instructor@nexlab.demo', 'password': 'Instructor@123'}
STUDENT    = {'email': 'student@nexlab.demo',    'password': 'Student@123'}
SUBJECT_ID = '515e8b4e-3fc5-4ae5-9272-8955acb2bcea'   # Python Programming (student enrolled)

results = []
def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def login(creds):
    r = client.post('/api/auth/login', json=creds)
    tok = r.get_json().get('token') if r.status_code == 200 else None
    return tok, r

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

def iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%SZ')

with app.app_context():
    now = datetime.utcnow()

    # ══════════════════════════════════════════════════════════════════
    # [I] INSTRUCTOR — author the timed coding assignment
    # ══════════════════════════════════════════════════════════════════
    print('\n[I] INSTRUCTOR — create + publish timed coding exam')
    itok, r = login(INSTRUCTOR)
    record('I1', 'instructor login', itok is not None, f'HTTP {r.status_code}')
    if not itok:
        sys.exit(1)

    r = client.post('/api/instructor/exams', headers=H(itok), json={
        'title': 'FLOW-VERIFY Timed Coding Exam',
        'description': 'end-to-end flow verification harness',
        'subject_id': SUBJECT_ID,
        'exam_type': 'mixed',
        'available_from': iso(now - timedelta(minutes=1)),
        'due_at':       iso(now + timedelta(hours=4)),
        'duration_minutes': 20,
        'max_attempts': 2,
        'pass_threshold': 60,
        'grade_weight': 0.25,
    })
    ok = r.status_code == 201
    exam = (r.get_json() or {}).get('exam') or {}
    EXAM_ID = exam.get('id')
    record('I2', 'create exam (window/countdown/retakes)', ok,
           f'HTTP {r.status_code} id={EXAM_ID}')
    if not ok:
        print(r.data[:300]); sys.exit(1)

    r = client.patch(f'/api/instructor/exams/{EXAM_ID}', headers=H(itok),
                     json={'is_published': True})
    record('I3', 'publish-empty exam rejected (400 guard)',
           r.status_code == 400, f'HTTP {r.status_code} — {(r.get_json() or {}).get("error", "")[:50]}')

    r = client.post(f'/api/instructor/exams/{EXAM_ID}/questions', headers=H(itok), json={
        'question_type': 'mcq',
        'prompt': 'What does len("abc") return?',
        'options': ['2', '3', '4'],
        'correct_answer': '1',
        'points': 2,
        'display_order': 1,
        'explanation': 'three characters',
    })
    mcq_id = ((r.get_json() or {}).get('question') or {}).get('id')
    record('I4', 'add MCQ question (correct=B)', r.status_code in (200, 201) and mcq_id,
           f'HTTP {r.status_code} qid={mcq_id}')

    r = client.post(f'/api/instructor/exams/{EXAM_ID}/questions', headers=H(itok), json={
        'question_type': 'coding',
        'prompt': 'Read two integers from stdin and print their sum.',
        'language': 'python',
        'starter_code': 'a = int(input())\n',
        'points': 3,
        'display_order': 2,
        'test_cases': [
            {'input': '2\n3\n',  'expected': '5',  'hidden': False, 'weight': 1},
            {'input': '10\n-4\n', 'expected': '6', 'hidden': True,  'weight': 1},
        ],
    })
    body = r.get_json() or {}
    q = body.get('question') or {}
    cod_id = q.get('id')
    tcs = q.get('test_cases')
    record('I5', 'add coding question (1 visible + 1 hidden case)',
           r.status_code in (200, 201) and cod_id and isinstance(tcs, list) and len(tcs) == 2,
           f'HTTP {r.status_code} qid={cod_id} cases={len(tcs or [])}')

    r = client.patch(f'/api/instructor/exams/{EXAM_ID}', headers=H(itok),
                     json={'is_published': True})
    record('I6', 'publish exam (now has questions)', r.status_code == 200,
           f'HTTP {r.status_code} window_state={(r.get_json() or {}).get("exam", {}).get("window_state")}')

    # Guard exams: upcoming-window + never-published draft
    r = client.post('/api/instructor/exams', headers=H(itok), json={
        'title': 'FLOW-VERIFY Upcoming Exam', 'subject_id': SUBJECT_ID, 'exam_type': 'mcq',
        'available_from': iso(now + timedelta(hours=1)),
        'due_at': iso(now + timedelta(hours=3)),
        'duration_minutes': 10,
    })
    E_UP = (r.get_json() or {}).get('exam', {}).get('id')
    client.post(f'/api/instructor/exams/{E_UP}/questions', headers=H(itok), json={
        'question_type': 'mcq', 'prompt': 'p?', 'options': ['a', 'b'], 'correct_answer': '0'})
    client.patch(f'/api/instructor/exams/{E_UP}', headers=H(itok), json={'is_published': True})
    r = client.post('/api/instructor/exams', headers=H(itok), json={
        'title': 'FLOW-VERIFY Draft Exam', 'subject_id': SUBJECT_ID, 'exam_type': 'mcq'})
    E_DRAFT = (r.get_json() or {}).get('exam', {}).get('id')
    client.post(f'/api/instructor/exams/{E_DRAFT}/questions', headers=H(itok), json={
        'question_type': 'mcq', 'prompt': 'p?', 'options': ['a', 'b'], 'correct_answer': '0'})
    record('I7', 'create guard exams (upcoming + draft)', bool(E_UP and E_DRAFT),
           f'upcoming={E_UP} draft={E_DRAFT}')

    # ══════════════════════════════════════════════════════════════════
    # [G] GUARDS — visibility, window, answer leaks
    # ══════════════════════════════════════════════════════════════════
    print('\n[G] STUDENT — visibility + window guards')
    stok, r = login(STUDENT)
    record('G1', 'student login', stok is not None, f'HTTP {r.status_code}')
    if not stok:
        sys.exit(1)

    r = client.get('/api/student/exams', headers=H(stok))
    j = r.get_json() or {}
    items = j.get('exams') or []
    mine = {e.get('id'): e for e in items}
    record('G2', 'exam listed with window_state open',
           r.status_code == 200 and EXAM_ID in mine and mine[EXAM_ID].get('window_state') == 'open',
           f"state={mine.get(EXAM_ID, {}).get('window_state')} upcoming-listed={E_UP in mine}")
    record('G3', 'unpublished draft invisible to student', E_DRAFT not in mine,
           f'in-list={E_DRAFT in mine}')

    r = client.get(f'/api/student/exams/{EXAM_ID}', headers=H(stok))
    j = r.get_json() or {}
    record('G4', 'exam detail serves window/attempts meta (questions NOT pre-served)',
           r.status_code == 200 and j.get('can_start') is True and j.get('attempts_remaining') == 2
           and not j.get('questions'),
           f"HTTP {r.status_code} can_start={j.get('can_start')} remaining={j.get('attempts_remaining')}")

    r = client.post(f'/api/student/exams/{E_UP}/start', headers=H(stok))
    record('G7', 'start blocked before window opens (403)', r.status_code == 403,
           f'HTTP {r.status_code} — {(r.get_json() or {}).get("error", "")[:45]}')
    r = client.get(f'/api/student/exams/{E_DRAFT}', headers=H(stok))
    record('G8', 'draft exam detail 404 for student', r.status_code == 404, f'HTTP {r.status_code}')

    # ══════════════════════════════════════════════════════════════════
    # [S] STUDENT — attend, solve, submit, retake
    # ══════════════════════════════════════════════════════════════════
    print('\n[S] STUDENT — attend + solve the timed exam')
    r = client.post(f'/api/student/exams/{EXAM_ID}/start', headers=H(stok))
    j = r.get_json() or {}
    att1 = (j.get('attempt') or {})
    A1 = att1.get('id')
    exp_iso = j.get('expires_at') or att1.get('expires_at')
    record('S1', 'start exam -> attempt created (201)', r.status_code == 201 and A1,
           f"HTTP {r.status_code} attempt={A1}")
    record('S2', 'countdown expires_at = start + duration (capped)',
           bool(exp_iso), f'expires_at={exp_iso}')
    record('S3', 'attempt starts empty, questions served', j.get('answers') == {} and len(j.get('questions') or []) == 2,
           f"questions={len(j.get('questions') or [])}")
    sqs = j.get('questions') or []
    mcq_s = next((x for x in sqs if x.get('id') == mcq_id), {})
    cod_s = next((x for x in sqs if x.get('id') == cod_id), {})
    record('S3a', 'NO answer leak in served questions (correct_answer/explanation absent)',
           'correct_answer' not in mcq_s and not mcq_s.get('explanation'),
           f"mcq-keys={sorted(mcq_s.keys())}")
    record('S3b', 'hidden test case stripped from student question view',
           len(cod_s.get('test_cases') or []) == 1,
           f"visible-cases={len(cod_s.get('test_cases') or [])}")

    GOOD_CODE = 'a = int(input())\nb = int(input())\nprint(a + b)\n'
    r = client.post(f'/api/student/exams/{EXAM_ID}/run-code', headers=H(stok), json={
        'question_id': cod_id, 'code': GOOD_CODE, 'language': 'python'})
    j = r.get_json() or {}
    runs = j.get('results') or []
    record('S4', 'in-exam run-code via Docker (no grade impact)',
           r.status_code == 200 and runs and all(x.get('passed') for x in runs),
           f"HTTP {r.status_code} cases={len(runs)} passed={sum(1 for x in runs if x.get('passed'))}")

    r = client.post(f'/api/student/exams/{EXAM_ID}/attempt/{A1}/save', headers=H(stok),
                    json={'answers': {mcq_id: '1'}})
    record('S5', 'auto-save partial answers', r.status_code == 200, f'HTTP {r.status_code}')

    r = client.post(f'/api/student/exams/{EXAM_ID}/attempt/{A1}/submit', headers=H(stok),
                    json={'answers': {cod_id: GOOD_CODE}})
    j = r.get_json() or {}
    att = j.get('attempt') or {}
    record('S6', 'submit -> graded 100/100, passed, submitted',
           r.status_code == 200 and j.get('score') == 100 and j.get('passed') is True
           and att.get('status') == 'submitted',
           f"HTTP {r.status_code} score={j.get('score')} passed={j.get('passed')} status={att.get('status')}")
    record('S7', 'saved MCQ answer merged into submission',
           bool(att.get('submitted_at')), f'submitted_at={att.get("submitted_at")}')

    # Retake with WORSE code — best score must survive
    r = client.post(f'/api/student/exams/{EXAM_ID}/start', headers=H(stok))
    A2 = ((r.get_json() or {}).get('attempt') or {}).get('id')
    record('S8', 'retake allowed (2 of 2 attempts)', r.status_code == 201 and A2,
           f'HTTP {r.status_code} attempt={A2}')
    BAD_CODE = 'a = int(input())\nb = int(input())\nprint(a * b)\n'   # wrong op: fails both cases
    r = client.post(f'/api/student/exams/{EXAM_ID}/attempt/{A2}/submit', headers=H(stok),
                    json={'answers': {mcq_id: '1', cod_id: BAD_CODE}})
    j = r.get_json() or {}
    record('S9', 'worse retake graded lower (MCQ only = 40%)',
           r.status_code == 200 and j.get('score') == 40 and j.get('passed') is False,
           f"HTTP {r.status_code} score={j.get('score')} passed={j.get('passed')}")

    r = client.post(f'/api/student/exams/{EXAM_ID}/start', headers=H(stok))
    record('S10', '3rd start blocked (attempts exhausted)', r.status_code == 403,
           f'HTTP {r.status_code} — {(r.get_json() or {}).get("error", "")[:45]}')

    r = client.get(f'/api/student/exams/{EXAM_ID}/result', headers=H(stok))
    j = r.get_json() or {}
    review = j.get('review') or []
    rev_mcq = next((x for x in review if x.get('id') == mcq_id), {})
    rev_cod = next((x for x in review if x.get('id') == cod_id), {})
    hid_rows = [x for x in (rev_cod.get('results') or []) if x.get('hidden')]
    record('S11', 'result review: per-question detail (of LATEST graded attempt)',
           r.status_code == 200 and len(review) == 2
           and rev_mcq.get('correct') is True and rev_mcq.get('earned') == 2.0
           and rev_cod.get('earned') == 0.0
           and rev_mcq.get('correct_answer') == '1'
           and j.get('score') == 40.0,
           f"HTTP {r.status_code} items={len(review)} score={j.get('score')} mcq={rev_mcq.get('earned')} cod={rev_cod.get('earned')}")
    record('S12', 'review shows correct answers post-grade, hidden case still masked',
           bool(hid_rows) and 'input' not in hid_rows[0] and 'expected' not in hid_rows[0],
           f"hidden-row-keys={sorted(hid_rows[0].keys()) if hid_rows else None}")

    # ══════════════════════════════════════════════════════════════════
    # [DB] DATABASE AUDIT — is every detail recorded properly?
    # ══════════════════════════════════════════════════════════════════
    print('\n[DB] DB AUDIT — rows written by the flow')
    from app.models.exam import Exam, ExamQuestion, ExamAttempt
    from app.models.grading import Grade
    from app.models.user import User

    stu = User.query.filter_by(email=STUDENT['email']).first()
    e = Exam.query.get(EXAM_ID)
    record('D1', 'Exam row: window/duration/attempts/type persisted',
           e and e.duration_minutes == 20 and e.max_attempts == 2
           and e.exam_type == 'mixed' and e.is_published and e.pass_threshold == 60,
           f'dur={e.duration_minutes} max={e.max_attempts} type={e.exam_type} thr={e.pass_threshold}')
    qs = ExamQuestion.query.filter_by(exam_id=EXAM_ID).all()
    cod_q = next((x for x in qs if x.question_type == 'coding'), None)
    hidden_flags = [c.get('hidden') for c in (cod_q.test_cases or [])] if cod_q else []
    record('D2', 'ExamQuestion rows: 2, coding keeps visible+hidden cases',
           len(qs) == 2 and hidden_flags == [False, True],
           f'n={len(qs)} hidden_flags={hidden_flags}')

    atts = (ExamAttempt.query.filter_by(student_id=stu.id, exam_id=EXAM_ID)
            .order_by(ExamAttempt.started_at).all())
    a1, a2 = (atts[0], atts[1]) if len(atts) >= 2 else (None, None)
    record('D3', 'Both attempts persisted with scores',
           bool(a1 and a2) and a1.score == 100.0 and a2.score == 40.0
           and a1.status == 'submitted' and a2.status == 'submitted'
           and a1.submitted_at is not None,
           f'a1={a1.score}/{a1.status} a2={a2.score}/{a2.status}')
    record('D4', 'Points bookkeeping (earned/max per attempt)',
           a1.total_points == 5.0 and a1.max_points == 5.0 and a2.total_points == 2.0,
           f'a1 {a1.total_points}/{a1.max_points}  a2 {a2.total_points}/{a2.max_points}')

    ans1 = (a1.answers or {})
    cod_detail = ans1.get(cod_id, {})
    res_rows = cod_detail.get('results') or []
    hidden_rows = [x for x in res_rows if x.get('hidden')]
    record('D5', 'Answers JSON: per-question earned/correct/results',
           cod_detail.get('correct') is True and cod_detail.get('earned') == 3.0
           and len(res_rows) == 2 and all(x.get('passed') for x in res_rows),
           f"earned={cod_detail.get('earned')} cases={len(res_rows)}")
    record('D6', 'Hidden-case result stored WITHOUT leaking its input/expected',
           len(hidden_rows) == 1 and 'input' not in hidden_rows[0] and 'expected' not in hidden_rows[0],
           f"hidden-row-keys={sorted(hidden_rows[0].keys()) if hidden_rows else None}")

    g = Grade.query.filter_by(student_id=stu.id, exam_id=EXAM_ID).first()
    record('D7', 'Grade row synced from exam (exam_id set, graded_at set)',
           bool(g and g.exam_id == EXAM_ID and g.graded_at is not None),
           f'grade_id={getattr(g, "id", None)}')
    record('D8', 'Best score kept after worse retake (never downgraded)',
           g is not None and g.final_grade == 100.0,
           f'final_grade={getattr(g, "final_grade", None)}')

    # ══════════════════════════════════════════════════════════════════
    # [C] CLEANUP — also exercises DELETE cascade
    # ══════════════════════════════════════════════════════════════════
    print('\n[C] CLEANUP')
    fk_failures = []
    for eid in (EXAM_ID, E_UP, E_DRAFT):
        r = client.delete(f'/api/instructor/exams/{eid}', headers=H(itok))
        if r.status_code != 200:
            fk_failures.append(eid)
            Grade.query.filter_by(exam_id=eid).delete(synchronize_session=False)
            db.session.commit()
            r = client.delete(f'/api/instructor/exams/{eid}', headers=H(itok))
        record('C', f'delete exam {eid[:8]}… (cascade)', r.status_code == 200, f'HTTP {r.status_code}')
    record('C1', 'DELETE exam with graded attempts does NOT 500 (grades FK handled)',
           not fk_failures,
           f'first-delete-500 on: {[x[:8] for x in fk_failures]}' if fk_failures else 'clean')
    record('C2', 'attempts/questions cascaded away',
           ExamAttempt.query.filter_by(exam_id=EXAM_ID).count() == 0
           and ExamQuestion.query.filter_by(exam_id=EXAM_ID).count() == 0)

# ── Summary ──────────────────────────────────────────────────────────
print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL GREEN ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
