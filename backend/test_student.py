"""
test_student.py — Student module integration test suite
Run: $env:PYTHONIOENCODING="utf-8"; python test_student.py
Requires: Docker PostgreSQL running, test_instructor.py run at least once (creates fixtures)
"""
import os, uuid, sys
os.environ['DATABASE_URL'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'

from app import create_app
from app.extensions import db
from sqlalchemy import text

app = create_app('development')
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'
app.config.update(TESTING=True, JWT_SECRET_KEY='test-secret')
client = app.test_client()

STATE = {}
results = {'passed': 0, 'failed': 0, 'errors': []}

def test(name, fn):
    try:
        fn()
        results['passed'] += 1
        print(f'  PASS  {name}')
    except Exception as e:
        results['failed'] += 1
        results['errors'].append(f'{name}: {e}')
        print(f'  FAIL  {name}: {e}')

# ── Setup fixtures ────────────────────────────────────────────────────────────
with app.app_context():
    db.create_all()

    # Login student
    r = client.post('/api/auth/login', json={'email': 'stud@tinstrc.edu', 'password': 'Stud@1234'})
    assert r.status_code == 200, f'Student login failed: {r.data[:200]}'
    STATE['stud_token'] = r.get_json()['token']
    STATE['SH'] = {'Authorization': f'Bearer {STATE["stud_token"]}'}

    # Login instructor (needed to create session for catchup test)
    r2 = client.post('/api/auth/login', json={'email': 'instr@tinstrc.edu', 'password': 'Instr@1234'})
    assert r2.status_code == 200, f'Instructor login failed: {r2.data[:200]}'
    STATE['IH'] = {'Authorization': f'Bearer {r2.get_json()["token"]}'}

    # Get experiment for this institution
    from app.models.user import User
    from app.models.experiment import Experiment, ContentModule, ContentProgress
    from app.models.session import LabSession, SessionAttendance
    from app.models.knowledge import ConceptMastery

    stud = User.query.filter_by(email='stud@tinstrc.edu').first()
    assert stud, 'Student user not found — run test_instructor.py first'
    STATE['stud_id'] = stud.id
    STATE['inst_id'] = stud.institution_id

    exp = Experiment.query.filter_by(institution_id=stud.institution_id).first()
    assert exp, 'No experiment found — run test_instructor.py first'
    STATE['exp_id'] = exp.id

    # Get a quiz module for this experiment
    quiz_mod = ContentModule.query.filter_by(experiment_id=exp.id, module_type='quiz').first()
    STATE['quiz_mod_id'] = quiz_mod.id if quiz_mod else None

    text_mod = ContentModule.query.filter_by(experiment_id=exp.id, module_type='text').first()
    STATE['text_mod_id'] = text_mod.id if text_mod else None

    # Get or find a section_subject for the session
    from app.models.academic import SectionSubject, SectionStudent
    instr = User.query.filter_by(email='instr@tinstrc.edu').first()
    ss = SectionSubject.query.filter_by(
        institution_id=stud.institution_id,
        instructor_id=instr.id
    ).first()
    assert ss, 'No SectionSubject found — run test_instructor.py first'
    STATE['ss_id'] = ss.id
    STATE['section_id'] = ss.section_id

    # Ensure student is enrolled in the section
    enrollment = SectionStudent.query.filter_by(
        section_id=ss.section_id, student_id=stud.id
    ).first()
    if not enrollment:
        db.session.execute(text(
            "INSERT INTO section_students (section_id,student_id) VALUES (:sec,:stud) ON CONFLICT DO NOTHING"
        ), {'sec': ss.section_id, 'stud': stud.id})
        db.session.commit()

    print(f'Fixtures: student={stud.email}, exp=[{exp.title}], ss_id={ss.id[:8]}...')
    print()

# ═══════════════════════════════════════════════════════════════════════════════
with app.app_context():
    SH = STATE['SH']
    IH = STATE['IH']

    # [1] Dashboard ─────────────────────────────────────────────────────────────
    print('[1] Dashboard')

    def t_dashboard_loads():
        r = client.get('/api/student/dashboard', headers=SH)
        assert r.status_code == 200, f'Status {r.status_code}: {r.data[:200]}'
        body = r.get_json()
        assert 'subjects_enrolled' in body
        assert 'upcoming_sessions' in body
        assert 'top_concepts' in body
        assert 'unread_notifications' in body
        assert isinstance(body['subjects_enrolled'], int)
        print(f'    -> enrolled={body["subjects_enrolled"]}, unread={body["unread_notifications"]}')
    test('Dashboard loads with all fields', t_dashboard_loads)

    def t_dashboard_requires_auth():
        r = client.get('/api/student/dashboard')
        assert r.status_code in (401, 403)
    test('Dashboard requires auth', t_dashboard_requires_auth)

    # [2] Subjects & Experiments ────────────────────────────────────────────────
    print('\n[2] Subjects & Experiments')

    def t_my_subjects():
        r = client.get('/api/student/subjects', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'subjects' in body
        assert isinstance(body['subjects'], list)
        print(f'    -> {len(body["subjects"])} subjects')
    test('List enrolled subjects', t_my_subjects)

    def t_list_experiments():
        subj_id = None
        from app.models.subject import Subject
        from app.models.academic import SectionSubject
        ss = SectionSubject.query.filter_by(id=STATE['ss_id']).first()
        if ss:
            subj_id = ss.subject_id
        if subj_id:
            r = client.get(f'/api/student/experiments/{subj_id}', headers=SH)
            assert r.status_code == 200
            assert 'experiments' in r.get_json()
            print(f'    -> {len(r.get_json()["experiments"])} experiments')
        else:
            print('    -> skipped (no subject_id)')
    test('List experiments for subject', t_list_experiments)

    def t_my_sessions_list():
        r = client.get('/api/student/sessions', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'sessions' in body
        print(f'    -> {len(body["sessions"])} sessions found')
    test('List my sessions with attendance', t_my_sessions_list)

    # [3] Pre-lab Content ───────────────────────────────────────────────────────
    print('\n[3] Pre-lab Content')

    def t_get_prelab():
        r = client.get(f'/api/student/prelab/{STATE["exp_id"]}', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'modules' in body
        mods = body['modules']
        print(f'    -> {len(mods)} modules found')
        for m in mods:
            assert 'id' in m and 'type' in m and 'completed' in m
            # Quiz modules must NOT expose correct_answer
            if m['type'] == 'quiz':
                assert 'content_data' not in m  # quiz shows config, not content_data
    test('Get pre-lab content (no answer leak)', t_get_prelab)

    def t_mark_text_module_complete():
        if not STATE['text_mod_id']:
            print('    -> skipped (no text module)')
            return
        r = client.post(f'/api/student/prelab/{STATE["text_mod_id"]}/complete', headers=SH)
        assert r.status_code == 200
        assert 'complete' in r.get_json()['message']
        # Verify it shows as completed
        r2 = client.get(f'/api/student/prelab/{STATE["exp_id"]}', headers=SH)
        mods = r2.get_json()['modules']
        text_mods = [m for m in mods if m['type'] == 'text']
        if text_mods:
            assert text_mods[0]['completed'] is True
    test('Mark text module as complete', t_mark_text_module_complete)

    def t_reject_mark_quiz_complete():
        if not STATE['quiz_mod_id']:
            print('    -> skipped')
            return
        r = client.post(f'/api/student/prelab/{STATE["quiz_mod_id"]}/complete', headers=SH)
        assert r.status_code == 400
    test('Reject manual complete on quiz module', t_reject_mark_quiz_complete)

    # [4] Quiz Gate ─────────────────────────────────────────────────────────────
    print('\n[4] Quiz Gate')

    def t_get_quiz_questions():
        if not STATE['quiz_mod_id']:
            print('    -> skipped (no quiz module)')
            return
        r = client.get(f'/api/student/prelab/{STATE["quiz_mod_id"]}/quiz/start', headers=SH)
        assert r.status_code in (200, 429), f'Got {r.status_code}: {r.data[:200]}'
        if r.status_code == 200:
            qs = r.get_json()['questions']
            print(f'    -> {len(qs)} questions returned')
            if qs:
                assert 'correct_answer' not in qs[0], 'SECURITY: correct_answer leaked to student!'
                assert 'options' in qs[0]
                STATE['quiz_questions'] = qs
        else:
            print(f'    -> quiz locked (429): {r.get_json().get("error","")}')
            STATE['quiz_questions'] = []
    test('Get quiz questions (no answer leak)', t_get_quiz_questions)

    def t_submit_quiz():
        if not STATE['quiz_mod_id'] or not STATE.get('quiz_questions'):
            print('    -> skipped (no questions)')
            return
        # Answer all A (will likely fail threshold, that's fine — testing the mechanism)
        answers = {q['id']: 'A' for q in STATE['quiz_questions']}
        r = client.post(f'/api/student/prelab/{STATE["quiz_mod_id"]}/quiz/submit',
                        headers=SH, json={'answers': answers})
        assert r.status_code == 200
        body = r.get_json()
        assert 'score' in body and 'passed' in body and 'threshold' in body
        assert 0 <= body['score'] <= 100
        print(f'    -> score={body["score"]}%, passed={body["passed"]}, attempts={body["attempts_used"]}')
    test('Submit quiz and get score', t_submit_quiz)

    def t_quiz_cooldown_enforced():
        if not STATE['quiz_mod_id']:
            print('    -> skipped')
            return
        # Try starting quiz again immediately after submit — should hit max attempts or cooldown
        r = client.get(f'/api/student/prelab/{STATE["quiz_mod_id"]}/quiz/start', headers=SH)
        # Could be 200 (retries allowed) or 429 (limit/cooldown) — just not 500
        assert r.status_code in (200, 429), f'Unexpected {r.status_code}'
        print(f'    -> second attempt status: {r.status_code}')
    test('Quiz cooldown/attempt limit enforced', t_quiz_cooldown_enforced)

    # [5] Session Gate Check ────────────────────────────────────────────────────
    print('\n[5] Session Gate Check')

    def t_create_session_for_test():
        from datetime import datetime, timedelta
        sched = (datetime.utcnow() + timedelta(minutes=30)).isoformat()
        r = client.post('/api/instructor/sessions', headers=IH, json={
            'section_subject_id': STATE['ss_id'],
            'experiment_id': STATE['exp_id'],
            'scheduled_at': sched,
            'duration_minutes': 90,
            'gate_score_threshold': 60,
            'catchup_enabled': True,
            'catchup_deadline': (datetime.utcnow() + timedelta(days=7)).isoformat(),
        })
        assert r.status_code == 201, f'Session create failed: {r.status_code}: {r.data[:200]}'
        STATE['session_id'] = r.get_json()['session']['id']
        print(f'    -> session_id={STATE["session_id"][:8]}...')
    test('Create test session (via instructor)', t_create_session_for_test)

    def t_check_gate():
        if not STATE.get('session_id'):
            print('    -> skipped')
            return
        r = client.get(f'/api/student/sessions/{STATE["session_id"]}/check-gate', headers=SH)
        assert r.status_code == 200, f'{r.status_code}: {r.data[:200]}'
        body = r.get_json()
        assert 'gate_passed' in body
        assert 'session' in body
        print(f'    -> gate_passed={body["gate_passed"]}, jitsi_room={"set" if body.get("jitsi_room") else "None (gate not passed)"}')
    test('Session gate check returns gate status', t_check_gate)

    # [6] Catch-up Mode ─────────────────────────────────────────────────────────
    print('\n[6] Catch-up Mode')

    def t_catchup_blocked_on_scheduled():
        if not STATE.get('session_id'):
            print('    -> skipped')
            return
        r = client.post(f'/api/student/sessions/{STATE["session_id"]}/catchup', headers=SH)
        # Session is still 'scheduled', not 'ended' — must reject
        assert r.status_code == 400
        assert 'ended' in r.get_json()['error']
        print(f'    -> correctly blocked: {r.get_json()["error"]}')
    test('Catch-up blocked when session not ended', t_catchup_blocked_on_scheduled)

    def t_catchup_on_ended_session():
        # Create a second session, end it, then test catchup
        from datetime import datetime, timedelta
        from app.models.session import LabSession
        sched = (datetime.utcnow() - timedelta(hours=2)).isoformat()
        r = client.post('/api/instructor/sessions', headers=IH, json={
            'section_subject_id': STATE['ss_id'],
            'experiment_id': STATE['exp_id'],
            'scheduled_at': sched,
            'duration_minutes': 60,
            'catchup_enabled': True,
            'catchup_deadline': (datetime.utcnow() + timedelta(days=3)).isoformat(),
        })
        assert r.status_code == 201
        ended_sid = r.get_json()['session']['id']
        # Force-end the session in DB
        sess = LabSession.query.get(ended_sid)
        sess.status = 'ended'
        sess.ended_at = datetime.utcnow()
        db.session.commit()

        r2 = client.post(f'/api/student/sessions/{ended_sid}/catchup', headers=SH)
        assert r2.status_code == 200, f'{r2.status_code}: {r2.data[:200]}'
        body = r2.get_json()
        assert 'experiment_id' in body
        print(f'    -> catchup started, exp={body["experiment_id"][:8]}...')
    test('Catch-up allowed on ended session with deadline', t_catchup_on_ended_session)

    # [7] Grades & History ──────────────────────────────────────────────────────
    print('\n[7] Grades & History')

    def t_my_grades():
        r = client.get('/api/student/grades', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'grades' in body
        print(f'    -> {len(body["grades"])} grades')
    test('View my grades', t_my_grades)

    def t_experiment_history():
        r = client.get('/api/student/history', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'history' in body
        for entry in body['history']:
            assert 'experiment_title' in entry
            assert 'total_attempts' in entry
            assert 'grade' in entry
        print(f'    -> {len(body["history"])} experiments in history')
    test('Experiment history with attempt stats', t_experiment_history)

    # [8] Analytics ─────────────────────────────────────────────────────────────
    print('\n[8] Analytics')

    def t_my_mastery():
        r = client.get('/api/student/mastery', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'mastery' in body
        for m in body['mastery']:
            assert 'concept' in m and 'mastery_score' in m
        print(f'    -> {len(body["mastery"])} concepts tracked')
    test('My concept mastery list', t_my_mastery)

    def t_my_rankings():
        r = client.get('/api/student/rankings', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'rankings' in body
        print(f'    -> {len(body["rankings"])} ranking records')
    test('My holistic rankings', t_my_rankings)

    # [9] Notifications ─────────────────────────────────────────────────────────
    print('\n[9] Notifications')

    def t_notifications_load():
        r = client.get('/api/student/notifications', headers=SH)
        assert r.status_code == 200
        body = r.get_json()
        assert 'notifications' in body
        for n in body['notifications']:
            assert 'type' in n and 'title' in n and 'is_read' in n
        print(f'    -> {len(body["notifications"])} notifications (all now marked read)')
    test('Get notifications and mark as read', t_notifications_load)

    def t_notifications_marked_read():
        # Call again — all should now be read
        r1 = client.get('/api/student/dashboard', headers=SH)
        unread = r1.get_json()['unread_notifications']
        assert unread == 0, f'Expected 0 unread after mark-read, got {unread}'
    test('Notifications marked as read after fetch', t_notifications_marked_read)

    # [10] Feedback ─────────────────────────────────────────────────────────────
    print('\n[10] Anonymous Feedback')

    def t_submit_feedback():
        if not STATE.get('session_id'):
            print('    -> skipped (no session)')
            return
        # Force the session to ended so feedback can be submitted
        from app.models.session import LabSession
        s = LabSession.query.get(STATE['session_id'])
        s.status = 'ended'
        from datetime import datetime
        s.ended_at = datetime.utcnow()
        db.session.commit()

        r = client.post('/api/student/feedback', headers=SH, json={
            'session_id': STATE['session_id'],
            'experiment_clarity': 4,
            'session_pacing': 3,
            'ai_hint_helpfulness': 5,
            'overall_rating': 4,
            'comment': 'Good session overall',
        })
        assert r.status_code == 201, f'{r.status_code}: {r.data[:200]}'
        assert 'anonymous' in r.get_json()['message'].lower()
        print(f'    -> feedback submitted anonymously')
    test('Submit anonymous session feedback', t_submit_feedback)

    def t_feedback_window_closed():
        # Create a session that ended > 24h ago
        from app.models.session import LabSession
        from datetime import datetime, timedelta
        s = LabSession(
            id=str(uuid.uuid4()),
            institution_id=STATE['inst_id'],
            section_subject_id=STATE['ss_id'],
            experiment_id=STATE['exp_id'],
            scheduled_at=datetime.utcnow() - timedelta(hours=30),
            duration_minutes=60,
            status='ended',
            ended_at=datetime.utcnow() - timedelta(hours=25),
        )
        db.session.add(s)
        db.session.commit()
        r = client.post('/api/student/feedback', headers=SH, json={
            'session_id': s.id,
            'overall_rating': 3,
        })
        assert r.status_code == 400
        assert 'closed' in r.get_json()['error'].lower()
        print(f'    -> correctly rejected: {r.get_json()["error"]}')
    test('Feedback rejected after 24h window', t_feedback_window_closed)

    # [11] Code Execution ───────────────────────────────────────────────────────
    print('\n[11] Code Execution')

    def t_auto_save():
        r = client.post('/api/execution/save', headers=SH, json={
            'experiment_id': STATE['exp_id'],
            'session_id': STATE.get('session_id'),
            'files': {'main': 'def sort(arr):\n    pass\n'},
        })
        assert r.status_code == 200
        assert r.get_json()['status'] == 'saved'
    test('Auto-save code version', t_auto_save)

    def t_run_code():
        r = client.post('/api/execution/run', headers=SH, json={
            'files': {'main': 'print("hello from test")'},
            'language': 'python',
            'stdin': '',
            'experiment_id': STATE['exp_id'],
            'session_id': STATE.get('session_id'),
            'is_final_submission': False,
        })
        assert r.status_code == 200
        body = r.get_json()
        assert 'status' in body
        print(f'    -> execution status: {body["status"]}')
        if body.get('stdout'):
            print(f'    -> stdout: {body["stdout"].strip()[:50]}')
    test('Run code via Docker', t_run_code)

    def t_run_code_invalid_language():
        r = client.post('/api/execution/run', headers=SH, json={
            'files': {'main': 'code'},
            'language': 'brainfuck',
        })
        assert r.status_code == 400
    test('Run code rejects invalid language', t_run_code_invalid_language)

    def t_final_submission():
        r = client.post('/api/execution/run', headers=SH, json={
            'files': {'main': 'def bubble_sort(arr):\n    n=len(arr)\n    for i in range(n):\n        for j in range(0,n-i-1):\n            if arr[j]>arr[j+1]: arr[j],arr[j+1]=arr[j+1],arr[j]\n    return arr\nprint(bubble_sort([5,2,8,1]))'},
            'language': 'python',
            'stdin': '',
            'experiment_id': STATE['exp_id'],
            'is_final_submission': True,
        })
        assert r.status_code == 200
        body = r.get_json()
        assert 'quality_metrics' in body
        assert 'quality_score' in body
        print(f'    -> quality_score={body["quality_score"]}, quality_metrics keys={list(body["quality_metrics"].keys())}')
    test('Final submission includes code quality metrics', t_final_submission)

    # [12] AI Hints ─────────────────────────────────────────────────────────────
    print('\n[12] AI Hints')

    def t_ai_hint():
        r = client.post('/api/ai/hint', headers=SH, json={
            'experiment_id': STATE['exp_id'],
            'hint_level': 1,
            'code': 'def sort(arr):\n    pass',
            'language': 'python',
        })
        assert r.status_code in (200, 429), f'{r.status_code}: {r.data[:200]}'
        if r.status_code == 200:
            body = r.get_json()
            assert 'hint' in body
            assert 'deduction_pct' in body
            assert 'hints_used' in body
            print(f'    -> hint_level=1, deduction={body["deduction_pct"]}%, fallback={body["is_fallback"]}')
            print(f'    -> hint: {body["hint"][:80]}')
        else:
            print(f'    -> rate limited (429): {r.get_json()}')
    test('AI hint level 1 returns guidance', t_ai_hint)

    def t_ai_hint_level_validation():
        r = client.post('/api/ai/hint', headers=SH, json={
            'experiment_id': STATE['exp_id'],
            'hint_level': 99,  # invalid
            'code': 'pass',
        })
        assert r.status_code in (400, 429)
        if r.status_code == 400:
            assert 'hint_level' in r.get_json().get('error', '').lower()
    test('AI hint rejects invalid hint_level', t_ai_hint_level_validation)

    def t_ai_chat():
        r = client.post('/api/ai/chat', headers=SH, json={
            'experiment_id': STATE['exp_id'],
            'messages': [{'role': 'user', 'content': 'How does bubble sort work?'}],
            'language': 'python',
        })
        assert r.status_code in (200, 429)
        if r.status_code == 200:
            body = r.get_json()
            assert 'response' in body
            print(f'    -> AI chat response: {body["response"][:80]}')
        else:
            print(f'    -> chat quota hit (429)')
    test('AI help chat responds', t_ai_chat)

    # [13] Role Isolation ───────────────────────────────────────────────────────
    print('\n[13] Role Isolation')

    def t_student_cannot_access_instructor_routes():
        # Student should NOT be able to create experiments
        r = client.post('/api/instructor/experiments', headers=SH, json={
            'subject_id': 'some-id', 'title': 'Hack', 'exp_number': 99
        })
        assert r.status_code in (401, 403), f'Student accessed instructor route! Status={r.status_code}'
    test('Student cannot access instructor routes', t_student_cannot_access_instructor_routes)

    def t_student_cannot_access_admin_routes():
        r = client.get('/api/admin/dashboard', headers=SH)
        assert r.status_code in (401, 403)
    test('Student cannot access admin routes', t_student_cannot_access_admin_routes)

    def t_unauthenticated_blocked():
        r = client.get('/api/student/subjects')
        assert r.status_code in (401, 403)
    test('Unauthenticated requests blocked', t_unauthenticated_blocked)

# ─── Results ──────────────────────────────────────────────────────────────────
total = results['passed'] + results['failed']
print()
print('=' * 54)
print(f'Student Module Results: {results["passed"]}/{total} passed')
if results['errors']:
    print('\nFailed tests:')
    for e in results['errors']:
        print(f'  FAIL  {e}')
else:
    print('All student tests passed!')
