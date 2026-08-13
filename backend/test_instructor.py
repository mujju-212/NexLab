"""
test_instructor.py — Full instructor module test suite
Tests: experiments, test cases, AI gen, sessions, grading, content modules,
       quiz questions, attendance, simulation, analytics, plagiarism, replay
Run: python test_instructor.py  (Docker PostgreSQL must be running)
"""
import os, sys, uuid, json, io
os.environ['DATABASE_URL'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'

import pytest
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db as _db
from app.models.user import User
from app.models.institution import Institution
from app.models.academic import AcademicYear, Batch, Section, SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.experiment import Experiment, TestCase, ContentModule, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.grading import Grade
import bcrypt, datetime

# ══════════════════════════════════════════════════════════════════
# SETUP
# ══════════════════════════════════════════════════════════════════

DB_URL = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'

app = create_app('development')
app.config['SQLALCHEMY_DATABASE_URI'] = DB_URL
app.config.update(
    TESTING=True,
    JWT_SECRET_KEY='test-secret',
    GROQ_API_KEY='dummy-key',
    JUDGE0_URL='http://localhost:2358',
)

client   = app.test_client()
ctx      = app.app_context()
ctx.push()
_db.create_all()

# ── Fixtures ────────────────────────────────────────────────────

def _pw(plain):
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def _uid():
    return str(uuid.uuid4())

# Institution
inst = Institution.query.filter_by(code='TINSTRC').first()
if not inst:
    inst = Institution(id=_uid(), name='Test Inst Instructor', code='TINSTRC',
                       email_domain='tinstrc.edu', plan='pro', is_active=True)
    _db.session.add(inst)
    _db.session.flush()

# Instructor user
instr = User.query.filter_by(email='instr@tinstrc.edu').first()
if not instr:
    instr = User(id=_uid(), institution_id=inst.id, email='instr@tinstrc.edu',
                 password_hash=_pw('Instr@1234'), role='instructor',
                 full_name='Test Instructor', is_active=True)
    _db.session.add(instr)

# Student user
stud = User.query.filter_by(email='stud@tinstrc.edu').first()
if not stud:
    stud = User(id=_uid(), institution_id=inst.id, email='stud@tinstrc.edu',
                password_hash=_pw('Stud@1234'), role='student',
                full_name='Test Student', roll_number='TS001', is_active=True)
    _db.session.add(stud)

_db.session.commit()

# Academic structure (raw SQL to satisfy NOT NULL constraints)
from sqlalchemy import text
conn = _db.engine.connect()

yr_id  = _uid(); bat_id  = _uid(); sec_id  = _uid()
sub_id = _uid(); ss_id   = _uid()

conn.execute(text("""
    INSERT INTO academic_years (id,institution_id,year_label,is_active)
    VALUES (:id,:inst,:lbl,true)
    ON CONFLICT DO NOTHING
"""), {'id': yr_id, 'inst': inst.id, 'lbl': 'TINSTRC-2026'})

conn.execute(text("""
    INSERT INTO batches (id,institution_id,year_id,name)
    VALUES (:id,:inst,:yr,:nm)
    ON CONFLICT DO NOTHING
"""), {'id': bat_id, 'inst': inst.id, 'yr': yr_id, 'nm': 'B-TC'})

conn.execute(text("""
    INSERT INTO sections (id,institution_id,batch_id,name)
    VALUES (:id,:inst,:bat,:nm)
    ON CONFLICT DO NOTHING
"""), {'id': sec_id, 'inst': inst.id, 'bat': bat_id, 'nm': 'S1'})

conn.execute(text("""
    INSERT INTO subjects (id,institution_id,name,code)
    VALUES (:id,:inst,:nm,:code)
    ON CONFLICT DO NOTHING
"""), {'id': sub_id, 'inst': inst.id, 'nm': 'Data Structures', 'code': 'DS101'})

conn.execute(text("""
    INSERT INTO section_subjects (id,institution_id,section_id,subject_id,instructor_id)
    VALUES (:id,:inst,:sec,:sub,:instr)
    ON CONFLICT DO NOTHING
"""), {'id': ss_id, 'inst': inst.id, 'sec': sec_id, 'sub': sub_id, 'instr': instr.id})

conn.execute(text("""
    INSERT INTO section_students (section_id,student_id)
    VALUES (:sec,:stud)
    ON CONFLICT DO NOTHING
"""), {'sec': sec_id, 'stud': stud.id})

conn.commit()
conn.close()

# ── Helpers ──────────────────────────────────────────────────────

def login(email, password):
    r = client.post('/api/auth/login',
                    json={'email': email, 'password': password})
    assert r.status_code == 200, f"Login failed: {r.data}"
    return r.get_json()['token']

def auth(token):
    return {'Authorization': f'Bearer {token}'}

# ══════════════════════════════════════════════════════════════════
# TESTS
# ══════════════════════════════════════════════════════════════════

results = {'passed': 0, 'failed': 0, 'errors': []}

def test(name, fn):
    try:
        fn()
        results['passed'] += 1
        print(f'  ✅ {name}')
    except Exception as e:
        results['failed'] += 1
        results['errors'].append(f'{name}: {e}')
        print(f'  ❌ {name}: {e}')

TOKEN = login('instr@tinstrc.edu', 'Instr@1234')
H = auth(TOKEN)

# Global state shared across tests
STATE = {}

# ── 1. EXPERIMENT MANAGEMENT ─────────────────────────────────────
print('\n[1] Experiment Management')

def t_create_experiment():
    r = client.post('/api/instructor/experiments', headers=H, json={
        'subject_id': sub_id, 'exp_number': 1,
        'title': 'Bubble Sort', 'aim': 'Sort a list',
        'problem_statement': 'Given N integers, sort ascending.',
        'input_format': 'First line N, then N integers.',
        'output_format': 'Sorted integers space-separated.',
        'allowed_languages': ['python', 'cpp'],
        'difficulty_level': 2,
        'rubric_test_cases': 60, 'rubric_lab_report': 20,
        'rubric_code_quality': 10, 'rubric_viva': 10,
        'enable_lockdown': True, 'allow_ai_hints': False,
    })
    assert r.status_code == 201
    STATE['exp_id'] = r.get_json()['experiment']['id']
test('Create experiment', t_create_experiment)

def t_list_experiments():
    r = client.get('/api/instructor/experiments', headers=H)
    assert r.status_code == 200
    assert len(r.get_json()['experiments']) >= 1
test('List experiments', t_list_experiments)

def t_update_experiment():
    r = client.patch(f"/api/instructor/experiments/{STATE['exp_id']}", headers=H,
                     json={'title': 'Bubble Sort v2', 'allow_ai_hints': True})
    assert r.status_code == 200
    assert r.get_json()['experiment']['title'] == 'Bubble Sort v2'
test('Update experiment', t_update_experiment)

def t_publish_experiment():
    r = client.patch(f"/api/instructor/experiments/{STATE['exp_id']}", headers=H,
                     json={'is_published': True})
    assert r.status_code == 200
test('Publish experiment', t_publish_experiment)

# ── 2. TEST CASES ────────────────────────────────────────────────
print('\n[2] Test Cases')

def t_add_test_cases():
    r = client.post(f"/api/instructor/experiments/{STATE['exp_id']}/test-cases",
                    headers=H, json=[
        {'input_data': '3\n3 1 2', 'expected_output': '1 2 3',
         'is_hidden': False, 'description': 'Basic'},
        {'input_data': '1\n5',     'expected_output': '5',
         'is_hidden': True,  'description': 'Single element'},
    ])
    assert r.status_code == 201
    assert r.get_json()['created'] == 2
test('Add test cases (batch)', t_add_test_cases)

def t_list_test_cases():
    r = client.get(f"/api/instructor/experiments/{STATE['exp_id']}/test-cases",
                   headers=H)
    assert r.status_code == 200
    assert len(r.get_json()['test_cases']) >= 2
test('List test cases (with hidden)', t_list_test_cases)

# ── 3. CONTENT MODULES ───────────────────────────────────────────
print('\n[3] Content Modules')

def t_add_text_module():
    r = client.post(f"/api/instructor/experiments/{STATE['exp_id']}/content",
                    headers=H, json={
        'module_type': 'text',
        'title': 'Theory',
        'content_data': {'html': '<p>Bubble sort is O(n²).</p>'},
    })
    assert r.status_code == 201
    STATE['text_module_id'] = r.get_json()['module']['id']
test('Add text module', t_add_text_module)

def t_add_video_module():
    r = client.post(f"/api/instructor/experiments/{STATE['exp_id']}/content",
                    headers=H, json={
        'module_type': 'video',
        'title': 'Video Lecture',
        'content_data': {'url': 'https://youtube.com/watch?v=abc', 'duration_sec': 600},
        'min_watch_pct': 75,
    })
    assert r.status_code == 201
    STATE['video_module_id'] = r.get_json()['module']['id']
test('Add video module', t_add_video_module)

def t_add_quiz_module():
    r = client.post(f"/api/instructor/experiments/{STATE['exp_id']}/content",
                    headers=H, json={
        'module_type': 'quiz',
        'title': 'Pre-lab Quiz',
        'content_data': {'pass_threshold': 70, 'max_attempts': 3,
                         'cooldown_minutes': 30, 'shuffle': True},
    })
    assert r.status_code == 201
    STATE['quiz_module_id'] = r.get_json()['module']['id']
test('Add quiz module', t_add_quiz_module)

def t_invalid_module_type():
    r = client.post(f"/api/instructor/experiments/{STATE['exp_id']}/content",
                    headers=H, json={'module_type': 'video3d', 'title': 'X'})
    assert r.status_code == 400
test('Reject invalid module_type', t_invalid_module_type)

def t_list_content():
    r = client.get(f"/api/instructor/experiments/{STATE['exp_id']}/content",
                   headers=H)
    assert r.status_code == 200
    assert r.get_json()['count'] >= 3
test('List content modules', t_list_content)

def t_update_text_module():
    r = client.patch(
        f"/api/instructor/experiments/{STATE['exp_id']}/content/{STATE['text_module_id']}",
        headers=H, json={'title': 'Theory Updated'})
    assert r.status_code == 200
    assert r.get_json()['module']['title'] == 'Theory Updated'
test('Update text module', t_update_text_module)

def t_reorder_modules():
    order = [STATE['quiz_module_id'], STATE['text_module_id'], STATE['video_module_id']]
    r = client.post(f"/api/instructor/experiments/{STATE['exp_id']}/content/reorder",
                    headers=H, json={'order': order})
    assert r.status_code == 200
test('Reorder content modules', t_reorder_modules)

def t_update_quiz_config():
    r = client.patch(f"/api/instructor/content/{STATE['quiz_module_id']}/quiz-config",
                     headers=H, json={'pass_threshold': 80, 'max_attempts': 2})
    assert r.status_code == 200, f'Expected 200, got {r.status_code}: {r.data}'
    body = r.get_json()
    assert body['module']['content_data']['pass_threshold'] == 80
test('Update quiz config', t_update_quiz_config)

def t_invalid_pass_threshold():
    r = client.patch(f"/api/instructor/content/{STATE['quiz_module_id']}/quiz-config",
                     headers=H, json={'pass_threshold': 150})
    assert r.status_code == 400
test('Reject invalid pass_threshold > 100', t_invalid_pass_threshold)

# ── 4. QUIZ QUESTIONS ────────────────────────────────────────────
print('\n[4] Quiz Questions')

def t_add_questions():
    r = client.post(f"/api/instructor/content/{STATE['quiz_module_id']}/questions",
                    headers=H, json=[
        {'question_text': 'What is time complexity of bubble sort?',
         'options': ['O(n)', 'O(n²)', 'O(log n)', 'O(n log n)'],
         'correct_answer': 'B', 'points': 2, 'explanation': 'Two nested loops.'},
        {'question_text': 'Is bubble sort stable?',
         'options': ['Yes', 'No', 'Sometimes', 'Never'],
         'correct_answer': 'A', 'points': 1},
    ])
    assert r.status_code == 201
    assert r.get_json()['created'] == 2
    STATE['q_id'] = r.get_json()['questions'][0]['id']
test('Add quiz questions (batch)', t_add_questions)

def t_list_questions():
    r = client.get(f"/api/instructor/content/{STATE['quiz_module_id']}/questions",
                   headers=H)
    assert r.status_code == 200
    assert len(r.get_json()['questions']) >= 2
test('List quiz questions', t_list_questions)

def t_wrong_options_count():
    r = client.post(f"/api/instructor/content/{STATE['quiz_module_id']}/questions",
                    headers=H, json={
        'question_text': 'Bad?', 'options': ['A', 'B'], 'correct_answer': 'A'
    })
    assert r.status_code == 400
test('Reject question with != 4 options', t_wrong_options_count)

def t_update_question():
    r = client.patch(f"/api/instructor/content/questions/{STATE['q_id']}",
                     headers=H, json={'points': 3})
    assert r.status_code == 200
    assert r.get_json()['question']['points'] == 3
test('Update quiz question', t_update_question)

def t_not_quiz_module_for_questions():
    r = client.get(f"/api/instructor/content/{STATE['text_module_id']}/questions",
                   headers=H)
    assert r.status_code == 400
test('Reject list questions on non-quiz module', t_not_quiz_module_for_questions)

# ── 5. CONTENT PROGRESS SUMMARY ──────────────────────────────────
print('\n[5] Content Progress Summary')

def t_progress_summary():
    r = client.get(
        f"/api/instructor/experiments/{STATE['exp_id']}/content/progress-summary",
        headers=H)
    assert r.status_code == 200
    assert 'modules' in r.get_json()
test('Content progress summary', t_progress_summary)

# ── 6. SIMULATION ────────────────────────────────────────────────
print('\n[6] Simulation')

def t_get_simulation_prompt():
    r = client.get(
        f"/api/instructor/experiments/{STATE['exp_id']}/simulation/prompt",
        headers=H)
    assert r.status_code == 200
    data = r.get_json()
    assert 'prompt' in data
    assert 'Bubble Sort' in data['experiment_title']
test('Get simulation AI prompt', t_get_simulation_prompt)

def t_upload_html_simulation():
    html = b'<html><body><h1>Bubble Sort Viz</h1></body></html>'
    r = client.post(
        f"/api/instructor/experiments/{STATE['exp_id']}/simulation/upload",
        headers=H,
        data={'file': (io.BytesIO(html), 'simulation.html')},
        content_type='multipart/form-data',
    )
    assert r.status_code == 201
    assert r.get_json()['entry_point'] == 'index.html'
test('Upload HTML simulation', t_upload_html_simulation)

def t_simulation_info():
    r = client.get(
        f"/api/instructor/experiments/{STATE['exp_id']}/simulation",
        headers=H)
    assert r.status_code == 200
    assert r.get_json()['has_simulation'] is True
test('Get simulation info (has_simulation=True)', t_simulation_info)

def t_upload_disallowed_extension():
    r = client.post(
        f"/api/instructor/experiments/{STATE['exp_id']}/simulation/upload",
        headers=H,
        data={'file': (io.BytesIO(b'evil'), 'exploit.exe')},
        content_type='multipart/form-data',
    )
    assert r.status_code == 400
test('Reject disallowed file extension', t_upload_disallowed_extension)

def t_delete_simulation():
    r = client.delete(
        f"/api/instructor/experiments/{STATE['exp_id']}/simulation",
        headers=H)
    assert r.status_code == 200
    # Confirm gone
    r2 = client.get(
        f"/api/instructor/experiments/{STATE['exp_id']}/simulation",
        headers=H)
    assert r2.get_json()['has_simulation'] is False
test('Delete simulation', t_delete_simulation)

# ── 7. SESSION MANAGEMENT ────────────────────────────────────────
print('\n[7] Session Management')

def t_schedule_session():
    r = client.post('/api/instructor/sessions', headers=H, json={
        'section_subject_id': ss_id,
        'experiment_id':      STATE['exp_id'],
        'scheduled_at':       '2026-09-01T09:00:00',
        'duration_minutes':   120,
        'gate_score_threshold': 70,
        'late_join_window_min': 10,
        'catchup_enabled':    False,
        'focus_ml_enabled':   True,
        'lockdown_enabled':   True,
    })
    assert r.status_code == 201
    STATE['session_id'] = r.get_json()['session']['id']
test('Schedule session', t_schedule_session)

def t_list_sessions():
    r = client.get('/api/instructor/sessions', headers=H)
    assert r.status_code == 200
    assert len(r.get_json()['sessions']) >= 1
test('List sessions', t_list_sessions)

def t_live_dashboard_empty():
    r = client.get(f"/api/instructor/sessions/{STATE['session_id']}/dashboard",
                   headers=H)
    assert r.status_code == 200
    assert 'students' in r.get_json()
test('Live dashboard (empty attendance)', t_live_dashboard_empty)

# ── 8. ATTENDANCE ────────────────────────────────────────────────
print('\n[8] Attendance')

def t_get_attendance():
    r = client.get(f"/api/instructor/sessions/{STATE['session_id']}/attendance",
                   headers=H)
    assert r.status_code == 200
    assert 'attendance' in r.get_json()
test('Get attendance list', t_get_attendance)

def t_attendance_summary():
    r = client.get(
        f"/api/instructor/sessions/{STATE['session_id']}/attendance/summary",
        headers=H)
    assert r.status_code == 200
    assert 'breakdown' in r.get_json()
test('Attendance summary', t_attendance_summary)

def t_export_attendance_csv():
    r = client.get(
        f"/api/instructor/sessions/{STATE['session_id']}/attendance/export",
        headers=H)
    assert r.status_code == 200
    assert 'text/csv' in r.content_type
test('Export attendance CSV', t_export_attendance_csv)

def _seed_attendance():
    """Add an attendance record for override test."""
    att = SessionAttendance.query.filter_by(
        session_id=STATE['session_id'], student_id=stud.id
    ).first()
    if not att:
        att = SessionAttendance(
            session_id=STATE['session_id'],
            student_id=stud.id,
            status='absent',
        )
        _db.session.add(att)
        _db.session.commit()

def t_override_attendance():
    _seed_attendance()
    r = client.post(
        f"/api/instructor/sessions/{STATE['session_id']}/attendance/{stud.id}/override",
        headers=H,
        json={'status': 'present', 'reason': 'Technical issue — confirmed via email'},
    )
    assert r.status_code == 200
    assert r.get_json()['status'] == 'present'
test('Override attendance to present', t_override_attendance)

def t_invalid_override_status():
    r = client.post(
        f"/api/instructor/sessions/{STATE['session_id']}/attendance/{stud.id}/override",
        headers=H,
        json={'status': 'flying'},
    )
    assert r.status_code == 400
test('Reject invalid override status', t_invalid_override_status)

# ── 9. GRADING ───────────────────────────────────────────────────
print('\n[9] Grading')

def t_save_grade():
    r = client.post('/api/instructor/grades', headers=H, json={
        'student_id':    stud.id,
        'experiment_id': STATE['exp_id'],
        'session_id':    STATE['session_id'],
        'manual_grade':  75.0,
        'manual_feedback': 'Good approach, minor efficiency issue.',
    })
    assert r.status_code == 200
    STATE['grade_id'] = r.get_json()['grade']['id']
test('Save/create grade', t_save_grade)

def t_add_inline_comment():
    r = client.post(f"/api/instructor/grades/{STATE['grade_id']}/inline-comment",
                    headers=H, json={
        'file_name': 'main.py',
        'line_number': 12,
        'comment': 'Consider using enumerate() here.',
    })
    assert r.status_code == 201
test('Add inline code comment', t_add_inline_comment)

def t_list_submissions():
    r = client.get(f"/api/instructor/submissions/{STATE['exp_id']}", headers=H)
    assert r.status_code == 200
    assert 'submissions' in r.get_json()
test('List submissions for grading', t_list_submissions)

# ── 10. CODE REPLAY ──────────────────────────────────────────────
print('\n[10] Code Replay')

def t_code_replay_empty():
    r = client.get(f"/api/instructor/replay/{stud.id}/{STATE['exp_id']}", headers=H)
    assert r.status_code == 200
    assert 'versions' in r.get_json()
test('Code replay (no versions yet = empty list)', t_code_replay_empty)

# ── 11. PLAGIARISM ───────────────────────────────────────────────
print('\n[11] Plagiarism')

def t_list_plagiarism_flags():
    r = client.get(f"/api/instructor/plagiarism-flags?experiment_id={STATE['exp_id']}",
                   headers=H)
    assert r.status_code == 200
    assert 'flags' in r.get_json()
test('List plagiarism flags (empty)', t_list_plagiarism_flags)

# ── 12. ANALYTICS ────────────────────────────────────────────────
print('\n[12] Analytics')

def t_section_analytics():
    r = client.get(f"/api/instructor/analytics/section/{ss_id}", headers=H)
    assert r.status_code == 200
    assert 'rankings' in r.get_json()
test('Section analytics / rankings', t_section_analytics)

def t_student_mastery():
    r = client.get(f"/api/instructor/analytics/student/{stud.id}/mastery", headers=H)
    assert r.status_code == 200
    assert 'mastery' in r.get_json()
test('Student concept mastery', t_student_mastery)

# ── 13. DELETE CONTENT MODULE ────────────────────────────────────
print('\n[13] Cleanup / Delete')

def t_delete_question():
    r = client.delete(f"/api/instructor/content/questions/{STATE['q_id']}", headers=H)
    assert r.status_code == 200
test('Delete quiz question', t_delete_question)

def t_delete_content_module():
    r = client.delete(
        f"/api/instructor/experiments/{STATE['exp_id']}/content/{STATE['quiz_module_id']}",
        headers=H)
    assert r.status_code == 200
test('Delete quiz module (cascades questions)', t_delete_content_module)

# ══════════════════════════════════════════════════════════════════
# RESULTS
# ══════════════════════════════════════════════════════════════════

total = results['passed'] + results['failed']
print(f'\n{"="*50}')
print(f'Results: {results["passed"]}/{total} passed')
if results['errors']:
    print('\nFailed tests:')
    for e in results['errors']:
        print(f'  ✗ {e}')
else:
    print('All instructor tests passed! ✅')
ctx.pop()
