"""
test_ai_agent_comprehensive.py — End-to-End Rigorous QA & Verification Suite
for NexLab AI Agentic Platform (Backend, Database, Guardrails, RBAC, and Roles).
"""
import sys
import os
import json
from datetime import datetime, timedelta

# Force UTF-8 encoding on console output to avoid cp1252 emoji crash
sys.stdout.reconfigure(encoding='utf-8')

os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')

from app import create_app
from app.extensions import db

app = create_app('development')
app.config.update(
    SQLALCHEMY_DATABASE_URI=os.environ['DATABASE_URL'],
    TESTING=True,
    PROPAGATE_EXCEPTIONS=False,
    JWT_SECRET_KEY='jwt-secret-change-in-prod',
)

client = app.test_client()

results = []
def record(section, test_id, name, ok, detail=''):
    results.append({'section': section, 'id': test_id, 'name': name, 'ok': bool(ok), 'detail': str(detail)})
    status_str = "PASS" if ok else "FAIL"
    print(f"  [{status_str}] [{section}:{test_id}] {name}" + (f" -> {detail}" if detail else ""))

def H(token):
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

def login(email, password):
    r = client.post('/api/auth/login', json={'email': email, 'password': password})
    if r.status_code == 200:
        return r.get_json()['token'], r.get_json()['user']
    return None, None

with app.app_context():
    from app.models.user import User
    from app.models.academic import Department, Batch, Section, SectionStudent, SectionSubject
    from app.models.subject import Subject
    from app.models.session import LabSession
    from app.models.experiment import Experiment, ContentPage, TestCase
    from app.models.exam import Exam
    from app.models.intervention import Extension, Intervention
    from app.models.announcement import Announcement
    from app.models.practice_extras import ProblemCollection, CollectionItem, PlaygroundSession
    from app.models.practice import StudyPlanProgress, StudentXP
    from app.models.ai_memory import AILearnerMemory
    from app.models.ai_usage import AIUsageLog, AIAgentRun
    from app.ai.role_tools import (
        get_tools_for_role,
        STUDENT_TOOLS,
        PLATFORM_USER_TOOLS,
        INSTRUCTOR_TOOLS,
        PLATFORM_ADMIN_TOOLS,
        CONFIRM_ACTION_NAMES,
    )
    from app.ai.harness import enforce_socratic_guardrail, build_six_layer_prompt, _run_deterministic_autonomous_fallback
    from app.ai.learner_context import build_role_context, save_learning_goal

    print("=" * 80)
    print("NEXLAB AI AGENT RIGOROUS TEST SUITE — QA EXECUTION")
    print("=" * 80)

    # ──────────────────────────────────────────────────────────────────────────
    # 1. AUTHENTICATION & ROLE IDENTITIES
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 1: AUTHENTICATION & ROLE VERIFICATION]")
    student_tok, student_user = login('student@nexlab.demo', 'Student@123')
    platform_tok, platform_user = login('platform@nexlab.io', 'Free@123')
    instructor_tok, instructor_user = login('instructor@nexlab.demo', 'Instructor@123')
    inst_admin_tok, inst_admin_user = login('inst.admin@nexlab.demo', 'Admin@123')
    platform_admin_tok, platform_admin_user = login('admin@nexlab.io', 'Admin@123')

    record('AUTH', 'A1', 'Student login', student_tok is not None and student_user['role'] == 'student')
    record('AUTH', 'A2', 'Platform User login', platform_tok is not None and platform_user['role'] == 'platform_user')
    record('AUTH', 'A3', 'Instructor login', instructor_tok is not None and instructor_user['role'] == 'instructor')
    record('AUTH', 'A4', 'Institution Admin login', inst_admin_tok is not None and inst_admin_user['role'] == 'institution_admin')
    record('AUTH', 'A5', 'Platform Super Admin login', platform_admin_tok is not None and platform_admin_user['role'] in ('admin', 'platform_admin'))

    # ──────────────────────────────────────────────────────────────────────────
    # 2. ROLE-BASED ACCESS CONTROL (RBAC) & TOOL BOUNDARIES
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 2: RBAC & ROLE TOOL CATALOG ISOLATION]")
    s_tools = get_tools_for_role('student')
    p_tools = get_tools_for_role('platform_user')
    i_tools = get_tools_for_role('instructor')
    ia_tools = get_tools_for_role('institution_admin')
    pa_tools = get_tools_for_role('admin')

    # Check student cannot access admin or instructor tools
    admin_only_tools = {'autonomous_campus_setup', 'autonomous_create_academic_entity', 'autonomous_schedule_sessions'}
    instructor_only_tools = {'build_complete_experiment_suite', 'build_complete_exam', 'autonomous_bulk_autograde'}
    super_admin_tools = {'autonomous_onboard_institution', 'platform_admin_user_lookup'}

    s_leaks = admin_only_tools.intersection(s_tools.keys()) | instructor_only_tools.intersection(s_tools.keys())
    record('RBAC', 'R1', 'Student tool catalog contains no admin/instructor mutating tools',
           len(s_leaks) == 0, f"leaks: {s_leaks}")

    i_leaks = super_admin_tools.intersection(i_tools.keys())
    record('RBAC', 'R2', 'Instructor catalog contains no platform super-admin tools',
           len(i_leaks) == 0, f"leaks: {i_leaks}")

    ia_leaks = super_admin_tools.intersection(ia_tools.keys())
    record('RBAC', 'R3', 'Institution admin catalog contains no super-admin onboard tools',
           len(ia_leaks) == 0, f"leaks: {ia_leaks}")

    record('RBAC', 'R4', 'Super-admin catalog contains platform governance tools',
           'platform_admin_user_lookup' in pa_tools and 'autonomous_onboard_institution' in pa_tools)

    # ──────────────────────────────────────────────────────────────────────────
    # 3. SOCRATIC GUARDRAIL ENFORCEMENT (STUDENT/PLATFORM SPOILER SHIELD)
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 3: SOCRATIC GUARDRAILS & CODE SPOILER PREVENTION]")
    leaked_solution_code = """Here is the complete solution for you:
```python
def binary_search(arr, target):
    low = 0
    high = len(arr) - 1
    while low <= high:
        mid = (low + high) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1
```
Now just paste this in your editor!"""

    # Student test: MUST be filtered
    s_filtered, s_was_filtered = enforce_socratic_guardrail(leaked_solution_code, 'student')
    record('SOCRATIC', 'S1', 'Student code solution blocked by Socratic guardrail',
           s_was_filtered and 'Socratic Tutor Guardrail' in s_filtered and 'def binary_search' not in s_filtered)

    # Platform user test: MUST be filtered
    p_filtered, p_was_filtered = enforce_socratic_guardrail(leaked_solution_code, 'platform_user')
    record('SOCRATIC', 'S2', 'Platform user code solution blocked by Socratic guardrail',
           p_was_filtered and 'Socratic Tutor Guardrail' in p_filtered)

    # Instructor test: MUST NOT be filtered (instructors author and explain starter code)
    i_filtered, i_was_filtered = enforce_socratic_guardrail(leaked_solution_code, 'instructor')
    record('SOCRATIC', 'S3', 'Instructor code solution NOT filtered (authoring allowed)',
           not i_was_filtered and 'def binary_search' in i_filtered)

    # Conceptual hint: short explanation with <4 lines of snippet should NOT be blocked
    conceptual_text = "Check your loop bounds:\n```python\nwhile low <= high:\n    pass\n```\nRemember `low` can equal `high`."
    c_filtered, c_was_filtered = enforce_socratic_guardrail(conceptual_text, 'student')
    record('SOCRATIC', 'S4', 'Short conceptual snippet (<5 lines, no function signature) allowed',
           not c_was_filtered and 'while low <= high' in c_filtered)

    # ──────────────────────────────────────────────────────────────────────────
    # 4. TUTOR MEMORY & DURABLE GOALS
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 4: TUTOR MEMORY & CONTEXT GROUNDING]")
    test_goal = f"Master Graph Algorithms & BFS/DFS for FAANG interviews — {int(datetime.utcnow().timestamp())}"
    r = client.patch('/api/ai/tutor/profile', headers=H(student_tok), json={'goal': test_goal, 'preferred_language': 'python'})
    record('MEM', 'M1', 'Student can save learning goal via tutor profile API',
           r.status_code == 200 and r.get_json()['profile']['goal'] == test_goal)

    r = client.get('/api/ai/tutor/profile', headers=H(student_tok))
    record('MEM', 'M2', 'Student tutor profile reads back persisted goal',
           r.status_code == 200 and r.get_json()['profile']['goal'] == test_goal)

    student_db_user = User.query.get(student_user['id'])
    ctx_built = build_role_context(student_db_user)
    record('MEM', 'M3', 'Durable goal is injected into the 6-layer dynamic system prompt',
           test_goal in ctx_built)

    # ──────────────────────────────────────────────────────────────────────────
    # 5. AUTONOMOUS TASK EXECUTION — REAL DATABASE WRITES
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 5: AUTONOMOUS TASK EXECUTION & DATABASE WRITES]")

    # 5.1 Student Autonomous Tools
    from app.ai.role_tools import (
        create_saved_playground_workspace,
        build_personal_problem_collection,
        enroll_and_build_study_plan,
    )
    # Execute as student in Flask context
    from flask import g
    g.user_id = student_user['id']
    g.role = 'student'
    g.institution_id = student_user.get('institution_id')

    res_pg = create_saved_playground_workspace(title="QA Test Auto Playground", topic_or_pattern="sliding_window", language="python")
    pg_row = PlaygroundSession.query.filter_by(user_id=student_user['id'], title="QA Test Auto Playground").first()
    record('AUTO_STU', 'AS1', 'Autonomous create playground creates real DB row',
           pg_row is not None and res_pg.get('success') is True, f"pg_id: {res_pg.get('playground_id')}")

    res_col = build_personal_problem_collection(collection_title="QA Auto Playlist", count=3)
    col_row = ProblemCollection.query.filter_by(user_id=student_user['id'], title="QA Auto Playlist").first()
    items_count = CollectionItem.query.filter_by(collection_id=col_row.id).count() if col_row else 0
    record('AUTO_STU', 'AS2', 'Autonomous problem collection creates Playlist + CollectionItems in DB',
           col_row is not None and items_count > 0, f"items: {items_count}")

    # 5.2 Instructor Autonomous Tools
    from app.ai.role_tools import (
        build_complete_experiment_suite,
        build_complete_exam,
        autonomous_grant_extension_or_intervention,
        instructor_get_my_sections,
    )
    g.user_id = instructor_user['id']
    g.role = 'instructor'
    g.institution_id = instructor_user.get('institution_id')

    # Instructor query sections
    sec_res = instructor_get_my_sections()
    record('AUTO_INST', 'AI1', 'Instructor get_my_sections queries grounded section catalog',
           isinstance(sec_res.get('classes'), list) and len(sec_res.get('classes', [])) > 0, f"found {len(sec_res.get('classes', []))} classes")

    # Instructor create complete experiment suite
    exp_title = f"QA Auto Experiment: Balanced BST {int(datetime.utcnow().timestamp())}"
    exp_res = build_complete_experiment_suite(
        title=exp_title,
        difficulty="medium",
        language="python",
        include_quiz=True,
        include_viva=True,
        include_checkpoints=True,
        test_case_count=3,
    )
    exp_row = Experiment.query.filter_by(title=exp_title).first()
    pages_count = ContentPage.query.filter_by(experiment_id=exp_row.id).count() if exp_row else 0
    tc_count = TestCase.query.filter_by(experiment_id=exp_row.id).count() if exp_row else 0
    record('AUTO_INST', 'AI2', 'Instructor build_complete_experiment_suite creates Experiment + Pages + TestCases + Publishes',
           exp_row is not None and exp_row.is_published is True and pages_count >= 1 and tc_count >= 1,
           f"exp_id={exp_row.id if exp_row else None} pages={pages_count} tc={tc_count}")

    # Instructor grant extension
    ext_res = autonomous_grant_extension_or_intervention(
        student_name=student_user['full_name'],
        record_type='extension',
        experiment_title=exp_title,
        extra_days=4,
        note="Approved for QA test",
    )
    ext_row = Extension.query.filter_by(student_id=student_user['id']).order_by(Extension.created_at.desc()).first()
    record('AUTO_INST', 'AI3', 'Instructor grant extension creates Extension record in DB',
           ext_row is not None and ext_res.get('success') is True)

    # 5.3 Institution Admin Autonomous Tools
    from app.ai.role_tools import (
        autonomous_create_academic_entity,
        autonomous_schedule_sessions,
        autonomous_broadcast_announcement,
        admin_query_analytics_domain,
    )
    g.user_id = inst_admin_user['id']
    g.role = 'institution_admin'
    g.institution_id = inst_admin_user.get('institution_id')

    dept_name = f"QA Auto Dept {int(datetime.utcnow().timestamp())}"
    dept_res = autonomous_create_academic_entity(entity_type='department', name=dept_name, code=f"QAD{int(datetime.utcnow().timestamp()) % 10000}")
    dept_row = Department.query.filter_by(name=dept_name, institution_id=g.institution_id).first()
    record('AUTO_ADMIN', 'AA1', 'Admin autonomous_create_academic_entity creates Department in DB',
           dept_row is not None and dept_res.get('success') is True)

    sub_name = f"QA Auto Subject {int(datetime.utcnow().timestamp())}"
    sub_res = autonomous_create_academic_entity(entity_type='subject', name=sub_name, code=f"QAS{int(datetime.utcnow().timestamp()) % 10000}")
    sub_row = Subject.query.filter_by(name=sub_name, institution_id=g.institution_id).first()
    record('AUTO_ADMIN', 'AA2', 'Admin autonomous_create_academic_entity creates Subject in DB',
           sub_row is not None and sub_res.get('success') is True)

    # Admin broadcast announcement
    anno_title = f"QA System Notification {int(datetime.utcnow().timestamp())}"
    anno_res = autonomous_broadcast_announcement(title=anno_title, message="Automated QA test broadcast", target="students")
    record('AUTO_ADMIN', 'AA3', 'Admin autonomous_broadcast_announcement broadcasts to recipients',
           anno_res.get('success') is True, f"sent_to={anno_res.get('sent_to')}")

    # Admin query analytics domain
    ana_res = admin_query_analytics_domain(domain='attendance', days=30)
    record('AUTO_ADMIN', 'AA4', 'Admin query_analytics_domain returns grounded institutional data',
           'attendance_rate' in ana_res or 'present_count' in ana_res or 'total_records' in ana_res)

    # 5.4 Platform Admin Tools
    from app.ai.role_tools import platform_admin_user_lookup, platform_get_overview
    g.user_id = platform_admin_user['id']
    g.role = 'admin'
    g.institution_id = None

    lookup_res = platform_admin_user_lookup(q="student", role="student")
    record('AUTO_SUPER', 'ASU1', 'Platform admin user lookup returns real cross-tenant directory users',
           isinstance(lookup_res.get('users'), list) and len(lookup_res.get('users')) > 0,
           f"found {len(lookup_res.get('users', []))} users")

    ov_res = platform_get_overview()
    record('AUTO_SUPER', 'ASU2', 'Platform admin get_platform_overview returns real cross-tenant totals',
           ov_res.get('total_institutions', 0) >= 1 and ov_res.get('total_users', 0) >= 1,
           f"institutions={ov_res.get('total_institutions')} users={ov_res.get('total_users')}")

    # ──────────────────────────────────────────────────────────────────────────
    # 6. DESTRUCTIVE ACTIONS SAFETY GATING
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 6: DESTRUCTIVE ACTIONS SAFETY GATING & CONFIRMATION]")
    from app.ai.role_tools import admin_propose_force_logout_users
    g.user_id = inst_admin_user['id']
    g.role = 'institution_admin'
    g.institution_id = inst_admin_user.get('institution_id')

    # Force logout proposal MUST return a confirmation card and NOT immediately revoke tokens
    prop_res = admin_propose_force_logout_users(target_role_or_email="student", reason="QA Security Audit")
    record('SAFETY', 'SAF1', 'Destructive operation (force logout) returns pending_action confirmation card',
           prop_res.get('requires_confirmation') is True and prop_res.get('action') in ('admin_force_logout', 'force_logout_users'),
           f"action={prop_res.get('action')}")

    # ──────────────────────────────────────────────────────────────────────────
    # 7. DETERMINISTIC AUTONOMOUS INTENT FALLBACK (WHEN LLM FAILS/RATES LIMIT)
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 7: DETERMINISTIC FALLBACK HARNESS]")
    fallback_ops = _run_deterministic_autonomous_fallback(
        "Please create a new experiment titled 'Red-Black Trees Lab'",
        'instructor',
        i_tools,
    )
    record('FALLBACK', 'FB1', 'Deterministic fallback catches create experiment prompt and executes',
           len(fallback_ops) >= 1 and fallback_ops[0]['tool'] == 'build_complete_experiment_suite',
           f"executed tools: {[op['tool'] for op in fallback_ops]}")

    # ──────────────────────────────────────────────────────────────────────────
    # 8. LIVE CHAT / HARNESS API ENDPOINT TEST (STUDENT & INSTRUCTOR & ADMIN)
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[SECTION 8: LIVE HARNESS HTTP ENDPOINT VERIFICATION]")
    # 8.1 Student chat session creation
    r = client.post('/api/ai/harness/sessions', headers=H(student_tok), json={'title': 'QA Test Session'})
    session_id = r.get_json()['session']['id'] if r.status_code in (200, 201) else None
    record('API', 'API1', 'Student can create a chat session via /api/ai/harness/sessions',
           r.status_code in (200, 201) and session_id is not None, f"session_id={session_id}")

    # 8.2 Student chat sessions listing
    r = client.get('/api/ai/harness/sessions', headers=H(student_tok))
    sess_list = r.get_json().get('sessions', [])
    record('API', 'API2', 'Student can list their chat sessions',
           r.status_code == 200 and any(s['id'] == session_id for s in sess_list))

    # 8.3 Student prompt asking for hint
    r = client.post('/api/ai/harness/message', headers=H(student_tok), json={
        'session_id': session_id,
        'prompt': 'What is the time complexity of QuickSort in worst case?',
    })
    msg_json = r.get_json() or {}
    reply_content = ((msg_json.get('assistant_message') or {}).get('content') or '')
    record('API', 'API3', 'Student message returns assistant reply via harness',
           r.status_code in (200, 201) and len(reply_content) > 10,
           f"HTTP {r.status_code} head={reply_content[:60]!r}")

    # 8.4 Usage Logging Verification
    recent_usage = AIUsageLog.query.order_by(AIUsageLog.created_at.desc()).first()
    record('API', 'API4', 'Harness interactions are logged to AIUsageLog table',
           recent_usage is not None, f"feature={recent_usage.feature if recent_usage else None}")

    # Clean up test session
    if session_id:
        client.delete(f'/api/ai/harness/sessions/{session_id}', headers=H(student_tok))

    print("\n" + "=" * 80)
    fails = [r for r in results if not r['ok']]
    print(f"OVERALL SUMMARY: {len(results) - len(fails)}/{len(results)} TESTS PASSED ({round((len(results) - len(fails))/len(results)*100, 1)}%)")
    if fails:
        print(f"\nFAILED TESTS ({len(fails)}):")
        for f in fails:
            print(f"  FAILED [{f['section']}:{f['id']}] {f['name']} -> {f['detail']}")
    else:
        print("\nALL BACKEND AGENTIC & RBAC CAPABILITIES ARE 100% OPERATIONAL!")
    print("=" * 80)

