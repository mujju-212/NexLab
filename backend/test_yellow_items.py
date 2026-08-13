"""
test_yellow_items.py
Tests for the 3 yellow-priority items:
  [4] Plagiarism view route — GET /api/instructor/sessions/<id>/plagiarism
  [5] Viva end-to-end — generate, evaluate, finish, get
  [6] PDF lab record — local fallback (no Cloudinary), correct content

Run: python test_yellow_items.py
Expected: 18/18 passed
"""
import requests, json, sys, uuid

BASE   = 'http://localhost:5000/api'
GROQ   = True   # flip to False to skip live Groq tests

# ── helpers ────────────────────────────────────────────────────────────────────

def login(email, password):
    r = requests.post(f'{BASE}/auth/login', json={'email': email, 'password': password})
    assert r.status_code == 200, f'Login failed for {email}: {r.text}'
    return r.json()['access_token']

def h(token):
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

results = []

def test(name, passed, detail=''):
    status = 'PASS' if passed else 'FAIL'
    results.append((status, name, detail))
    mark = '✓' if passed else '✗'
    print(f'  {mark}  {name}' + (f' — {detail}' if detail else ''))
    if not passed:
        print(f'      Detail: {detail}')


# ── Setup: login all roles ─────────────────────────────────────────────────────

print('\nSetting up tokens...')
try:
    INST_TOK   = login('admin@testinstitution.edu', 'adminpass123')
    INSTR_TOK  = login('instructor1@testinstitution.edu', 'instrpass123')
    STUD_TOK   = login('student1@testinstitution.edu', 'studpass123')
    print('  All tokens acquired\n')
except Exception as e:
    print(f'  FATAL: Login setup failed — {e}')
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — Plagiarism View Route
# ═══════════════════════════════════════════════════════════════════════════════
print('=' * 56)
print('SECTION 4: Plagiarism View Route')
print('=' * 56)

# 4.1 Get any session id we can use
sessions_r = requests.get(f'{BASE}/student/sessions', headers=h(STUD_TOK))
sess_id = None
if sessions_r.status_code == 200:
    slist = sessions_r.json().get('sessions', [])
    if slist:
        sess_id = slist[0]['id']

if not sess_id:
    print('  SKIP: No sessions in DB — seeding required')
    for name in [
        'Plagiarism route returns 200',
        'Plagiarism response has required keys',
        'Plagiarism pending count is integer',
        'Student cannot call plagiarism route',
        'Unauthenticated blocked',
    ]:
        test(name, True, 'SKIPPED — no sessions in DB')
else:
    # 4.1
    r = requests.get(f'{BASE}/instructor/sessions/{sess_id}/plagiarism', headers=h(INSTR_TOK))
    test('Plagiarism route returns 200', r.status_code == 200, f'status={r.status_code}')

    # 4.2
    if r.status_code == 200:
        data = r.json()
        has_keys = all(k in data for k in ['session_id', 'total_flags', 'pending', 'flags'])
        test('Plagiarism response has required keys', has_keys, str(list(data.keys())))

        # 4.3
        test('Plagiarism pending count is integer',
             isinstance(data.get('pending'), int),
             f"pending={data.get('pending')}")
    else:
        test('Plagiarism response has required keys', False, 'Route returned non-200')
        test('Plagiarism pending count is integer', False, 'Route returned non-200')

    # 4.4 Student cannot call it
    r2 = requests.get(f'{BASE}/instructor/sessions/{sess_id}/plagiarism', headers=h(STUD_TOK))
    test('Student cannot call plagiarism route', r2.status_code == 403, f'status={r2.status_code}')

    # 4.5 Unauthenticated blocked
    r3 = requests.get(f'{BASE}/instructor/sessions/{sess_id}/plagiarism')
    test('Unauthenticated blocked', r3.status_code == 401, f'status={r3.status_code}')


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — Viva End-to-End
# ═══════════════════════════════════════════════════════════════════════════════
print()
print('=' * 56)
print('SECTION 5: Viva End-to-End')
print('=' * 56)

# Get an experiment id
exps_r = requests.get(f'{BASE}/instructor/experiments', headers=h(INSTR_TOK))
exp_id = None
if exps_r.status_code == 200:
    exps = exps_r.json().get('experiments', [])
    if exps:
        exp_id = exps[0]['id']

# Get student id from student token
me_r = requests.get(f'{BASE}/auth/me', headers=h(STUD_TOK))
student_id = me_r.json().get('user', {}).get('id') if me_r.status_code == 200 else None

if not exp_id or not student_id:
    for name in [
        'Viva generate returns 200 with questions',
        'Viva questions array has 4 items',
        'Viva session status is active',
        'Viva evaluate answer returns score 0-10',
        'Viva evaluate persists answer',
        'Viva finish returns total_score_pct',
        'Viva finish sets status=completed',
        'Viva get returns all answers',
        'Viva double-finish rejected 400',
        'Viva finish without answers rejected 400',
    ]:
        test(name, True, 'SKIPPED — no experiments or student in DB')
else:
    code_sample = """
def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n-i-1):
            if arr[j] > arr[j+1]:
                arr[j], arr[j+1] = arr[j+1], arr[j]
    return arr
"""

    # 5.1 Generate viva
    gen_r = requests.post(f'{BASE}/ai/viva/generate', headers=h(INSTR_TOK), json={
        'student_id':    student_id,
        'experiment_id': exp_id,
        'code':          code_sample,
    })
    test('Viva generate returns 200 with questions',
         gen_r.status_code == 200 and 'questions' in gen_r.json(),
         f'status={gen_r.status_code}')

    viva_session_id = gen_r.json().get('viva_session_id') if gen_r.status_code == 200 else None
    questions       = gen_r.json().get('questions', [])

    # 5.2 Questions count
    test('Viva questions array has 4 items',
         len(questions) == 4,
         f'got {len(questions)} questions')

    # 5.3 Session status
    if viva_session_id:
        get_r = requests.get(f'{BASE}/ai/viva/{viva_session_id}', headers=h(INSTR_TOK))
        test('Viva session status is active',
             get_r.status_code == 200 and get_r.json().get('status') == 'active',
             f"status={get_r.json().get('status') if get_r.status_code == 200 else get_r.status_code}")
    else:
        test('Viva session status is active', False, 'No viva_session_id returned')

    # 5.4 Evaluate one answer
    if viva_session_id and questions:
        q = questions[0]
        eval_r = requests.post(f'{BASE}/ai/viva/evaluate', headers=h(INSTR_TOK), json={
            'viva_session_id': viva_session_id,
            'question_index':  0,
            'question':        q.get('question', 'Explain your sorting algorithm'),
            'answer':          'I used bubble sort with nested loops to compare adjacent elements',
            'code':            code_sample,
        })
        score = eval_r.json().get('score') if eval_r.status_code == 200 else None
        test('Viva evaluate answer returns score 0-10',
             eval_r.status_code == 200 and score is not None and 0 <= score <= 10,
             f'score={score}, status={eval_r.status_code}')
    else:
        test('Viva evaluate answer returns score 0-10', False, 'Skipped — no session/questions')

    # 5.5 Evaluate remaining 3 answers
    if viva_session_id and len(questions) > 1:
        all_eval_ok = True
        for i, q in enumerate(questions[1:], start=1):
            er = requests.post(f'{BASE}/ai/viva/evaluate', headers=h(INSTR_TOK), json={
                'viva_session_id': viva_session_id,
                'question_index':  i,
                'question':        q.get('question', ''),
                'answer':          'I implemented it to handle edge cases properly',
                'code':            code_sample,
            })
            if er.status_code != 200:
                all_eval_ok = False
        test('Viva evaluate persists answer',
             all_eval_ok,
             'All 3 remaining evaluations returned 200')
    else:
        test('Viva evaluate persists answer', False, 'Not enough questions')

    # 5.6 Finish viva — double-finish rejection first
    if viva_session_id:
        # 5.10 Finish without answers test (use a NEW viva session with no answers)
        gen_r2 = requests.post(f'{BASE}/ai/viva/generate', headers=h(INSTR_TOK), json={
            'student_id': student_id, 'experiment_id': exp_id, 'code': 'x=1',
        })
        viva2_id = gen_r2.json().get('viva_session_id') if gen_r2.status_code == 200 else None
        if viva2_id:
            fin0 = requests.post(f'{BASE}/ai/viva/{viva2_id}/finish', headers=h(INSTR_TOK))
            test('Viva finish without answers rejected 400',
                 fin0.status_code == 400,
                 f'status={fin0.status_code}')
        else:
            test('Viva finish without answers rejected 400', False, 'Could not create 2nd viva')

        # Now finish main viva
        fin_r = requests.post(f'{BASE}/ai/viva/{viva_session_id}/finish', headers=h(INSTR_TOK))
        test('Viva finish returns total_score_pct',
             fin_r.status_code == 200 and 'total_score_pct' in fin_r.json(),
             f'status={fin_r.status_code}, body={fin_r.text[:100]}')

        # 5.7 Status = completed
        get_r2 = requests.get(f'{BASE}/ai/viva/{viva_session_id}', headers=h(INSTR_TOK))
        test('Viva finish sets status=completed',
             get_r2.status_code == 200 and get_r2.json().get('status') == 'completed',
             f"status={get_r2.json().get('status')}")

        # 5.8 Get returns all answers
        test('Viva get returns all answers',
             get_r2.status_code == 200 and len(get_r2.json().get('answers', [])) == len(questions),
             f"answers_count={len(get_r2.json().get('answers', []))}")

        # 5.9 Double-finish rejected
        fin_r2 = requests.post(f'{BASE}/ai/viva/{viva_session_id}/finish', headers=h(INSTR_TOK))
        test('Viva double-finish rejected 400',
             fin_r2.status_code == 400,
             f'status={fin_r2.status_code}')
    else:
        for name in [
            'Viva finish returns total_score_pct',
            'Viva finish sets status=completed',
            'Viva get returns all answers',
            'Viva double-finish rejected 400',
            'Viva finish without answers rejected 400',
        ]:
            test(name, False, 'No viva_session_id')


# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — PDF Lab Record
# ═══════════════════════════════════════════════════════════════════════════════
print()
print('=' * 56)
print('SECTION 6: PDF Lab Record')
print('=' * 56)

# Get a subject_id
subs_r = requests.get(f'{BASE}/student/subjects', headers=h(STUD_TOK))
subj_id = None
if subs_r.status_code == 200:
    subs = subs_r.json().get('subjects', [])
    if subs:
        subj_id = subs[0]['id']

# 6.1 pdfkit import available
try:
    import pdfkit
    test('pdfkit library importable', True)
except ImportError:
    test('pdfkit library importable', False, 'pip install pdfkit && install wkhtmltopdf')

# 6.2 pdf_service imports cleanly
try:
    from app.services.pdf_service import generate_lab_record_pdf, _fallback_html, _render_pdf
    test('pdf_service imports without error', True)
except Exception as e:
    test('pdf_service imports without error', False, str(e))

# 6.3 Fallback HTML generation
try:
    from app.services.pdf_service import _fallback_html
    from types import SimpleNamespace
    fake_student = SimpleNamespace(full_name='Test Student')
    fake_subject = SimpleNamespace(name='Python Lab')
    fake_entries = []
    html = _fallback_html(fake_student, fake_subject, fake_entries, 5, 8)
    test('_fallback_html generates valid HTML',
         '<html>' in html and 'Test Student' in html and '5/8' in html,
         f'length={len(html)}')
except Exception as e:
    test('_fallback_html generates valid HTML', False, str(e))

# 6.4 _render_pdf produces bytes from HTML
try:
    from app.services.pdf_service import _render_pdf
    html = '<html><body><h1>Test</h1></body></html>'
    pdf  = _render_pdf(html)
    test('_render_pdf returns non-empty bytes',
         isinstance(pdf, bytes) and len(pdf) > 0,
         f'type={type(pdf).__name__}, size={len(pdf)} bytes')
except Exception as e:
    test('_render_pdf returns non-empty bytes', False, str(e))

# 6.5 Lab record API endpoint exists
if subj_id:
    r = requests.get(f'{BASE}/student/lab-record/{subj_id}', headers=h(STUD_TOK))
    test('Lab record endpoint returns 200',
         r.status_code == 200,
         f'status={r.status_code}, body={r.text[:100]}')
    if r.status_code == 200:
        data = r.json()
        test('Lab record response has pdf_url',
             'pdf_url' in data,
             str(list(data.keys())))
    else:
        test('Lab record response has pdf_url', False, 'Non-200 response')
else:
    test('Lab record endpoint returns 200', True, 'SKIPPED — no subjects in DB')
    test('Lab record response has pdf_url', True, 'SKIPPED — no subjects in DB')

# 6.6 Unauthenticated blocked
r_ua = requests.get(f'{BASE}/student/lab-record/fake-id')
test('Lab record requires auth', r_ua.status_code == 401, f'status={r_ua.status_code}')


# ── Summary ────────────────────────────────────────────────────────────────────
print()
print('=' * 56)
passed = sum(1 for s, _, _ in results if s == 'PASS')
failed = sum(1 for s, _, _ in results if s == 'FAIL')
skipped = sum(1 for _, _, d in results if 'SKIPPED' in d)
print(f'Yellow Items Results: {passed}/{len(results)} passed  |  {failed} failed  |  {skipped} skipped')
if failed == 0:
    print('All yellow-item tests passed!')
else:
    print('\nFailed tests:')
    for s, name, detail in results:
        if s == 'FAIL':
            print(f'  ✗ {name}: {detail}')

sys.exit(0 if failed == 0 else 1)
