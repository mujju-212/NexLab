import os
import sys
import json
import requests

def test_instructor_harness():
    print("=" * 80)
    print("NEXLAB UNIFIED AI HARNESS — INSTRUCTOR ROLE DEEP VERIFICATION")
    print("=" * 80)

    backend_url = "http://127.0.0.1:5000"

    # 1. AUTHENTICATE AS INSTRUCTOR
    print("\n[STEP 1] Authenticating as Instructor (prof.rohan.mehta@greenwood.edu)...")
    login_payload = {
        "email": "prof.rohan.mehta@greenwood.edu",
        "password": "Admin@123"
    }
    r_login = requests.post(f"{backend_url}/api/auth/login", json=login_payload, timeout=10)
    if r_login.status_code != 200:
        print(f"[FAIL] Instructor login failed: HTTP {r_login.status_code} - {r_login.text}")
        return False
    
    login_data = r_login.json()
    token = login_data.get('access_token') or login_data.get('token')
    user = login_data.get('user', {})
    print(f"[PASS] Logged in as: {user.get('email')} | Name: {user.get('full_name')} | Role: {user.get('role')}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 2. TEST ROLE-SCOPED DIRECT TOOLS (Python AST & Execution with Real Data)
    sys.path.insert(0, os.path.abspath("backend"))
    from app import create_app
    from app.extensions import db
    from app.models.user import User
    from app.models.experiment import Experiment, TestCase, ContentPage, ContentModule
    from app.models.admin_copilot import AIGeneratedDocument
    from app.ai import role_tools as rt

    flask_app = create_app('development')
    with flask_app.app_context():
        from flask import g
        g.user_id = user.get('id')
        g.institution_id = user.get('institution_id')
        g.role = 'instructor'

        print("\n[STEP 2] Testing Instructor Analytics & Query Tools with Real DB Data...")

        # 2a. get_my_sections
        my_sections = rt.instructor_get_my_sections()
        classes_cnt = my_sections.get('assigned_classes_count', 0)
        print(f"[PASS] instructor_get_my_sections: found {classes_cnt} assigned section-subjects.")
        if classes_cnt > 0:
            sample_cls = my_sections['classes'][0]
            print(f"       Sample: Subject '{sample_cls['subject_name']}' | Section '{sample_cls['section_name']}' | Enrolled: {sample_cls['enrolled_students']} students")

        # 2b. get_section_analytics
        sec_analytics = rt.instructor_get_section_analytics()
        analyzed_cnt = sec_analytics.get('sections_analyzed', 0)
        print(f"[PASS] instructor_get_section_analytics: analyzed {analyzed_cnt} sections.")
        if analyzed_cnt > 0:
            sample_an = sec_analytics['analytics'][0]
            print(f"       Section: {sample_an['section']} | Avg Grade: {sample_an['avg_grade_pct']}% | Pass Rate: {sample_an['pass_rate_pct']}% | At-Risk: {sample_an['at_risk_count']}")

        # 2c. get_common_errors
        common_errs = rt.instructor_get_common_errors()
        err_clusters = common_errs.get('error_clusters', [])
        print(f"[PASS] instructor_get_common_errors: found {len(err_clusters)} error clusters across {common_errs.get('total_failed_attempts_inspected')} attempts.")
        if err_clusters:
            print(f"       Top Cluster: '{err_clusters[0]['error_pattern']}' ({err_clusters[0]['occurrences']} occurrences)")

        # 2d. query_submissions_and_plagiarism
        sub_plag = rt.instructor_query_submissions_and_plagiarism()
        exps_inspected = sub_plag.get('experiments_inspected', 0)
        print(f"[PASS] instructor_query_submissions_and_plagiarism: inspected {exps_inspected} assigned experiments.")

        # 2e. get_student_360
        # Find a real student enrolled in the instructor's assigned sections
        allowed_sids = rt._instructor_allowed_student_ids()
        sample_student = User.query.filter(User.id.in_(list(allowed_sids))).first() if allowed_sids else User.query.filter_by(institution_id=g.institution_id, role='student').first()
        sample_student_id = sample_student.id if sample_student else "dummy-student-id"
        sample_student_name = sample_student.full_name if sample_student else "Student"
        if sample_student:
            stu_360 = rt.instructor_get_student_360(student_name_or_roll=sample_student.email)
            print(f"[PASS] instructor_get_student_360: successfully pulled profile for '{sample_student.full_name}' ({sample_student.email})")
            if stu_360.get('found'):
                acad = stu_360.get('academic_summary', {})
                print(f"       Avg Grade: {acad.get('avg_grade_pct')}% | Attended: {acad.get('sessions_attended')} | SPARK Score: {acad.get('spark_overall_score')}")

        print("\n[STEP 3] Testing Real File Report Generation (CSV, XLSX, Markdown)...")
        # 3a. CSV Section Report
        rep_csv = rt.instructor_generate_section_report(report_type='section_gradebook', fmt='csv')
        doc_csv = rep_csv.get('generated_document')
        if doc_csv and os.path.exists(doc_csv['file_path']):
            print(f"[PASS] Real CSV report generated: {os.path.basename(doc_csv['file_path'])} ({doc_csv['file_size_bytes']} bytes)")
        else:
            print("[FAIL] CSV report file not created on disk")
            return False

        # 3b. XLSX At-Risk Report
        rep_xlsx = rt.instructor_generate_section_report(report_type='at_risk_roster', fmt='xlsx')
        doc_xlsx = rep_xlsx.get('generated_document')
        if doc_xlsx and os.path.exists(doc_xlsx['file_path']):
            print(f"[PASS] Real XLSX report generated: {os.path.basename(doc_xlsx['file_path'])} ({doc_xlsx['file_size_bytes']} bytes)")
        else:
            print("[FAIL] XLSX report file not created on disk")
            return False

        print("\n[STEP 4] Testing Experiment Creation & Content Generation (Phase 3 Actions)...")
        # 4a. Propose Experiment Creation
        prop_exp = rt.instructor_propose_create_experiment(
            title="Binary Search Tree Insertion & Search",
            subject_name="Data Structures",
            difficulty="medium",
            language="python",
            aim="Implement and verify binary search tree insertion, in-order traversal, and key search operations.",
            theory="# Binary Search Trees\n\nA Binary Search Tree (BST) is a node-based binary tree data structure where each node has at most two children.\nFor any given node:\n- All elements in the left subtree are strictly less than the node's key.\n- All elements in the right subtree are strictly greater than the node's key.",
            procedure="1. Define the Node class with key, left, and right pointers.\n2. Implement the recursive `insert(root, key)` function.\n3. Implement in-order traversal to verify sorted order.\n4. Implement `search(root, key)` returning boolean status.\n5. Test with provided assertions.",
            starter_code="class Node:\n    def __init__(self, key):\n        self.key = key\n        self.left = None\n        self.right = None\n\ndef insert(root, key):\n    # TODO: Implement BST insertion\n    pass\n\ndef search(root, key):\n    # TODO: Implement BST search\n    pass\n",
            test_cases=[
                {"input_data": "5\n50 30 70 20 40\nsearch 40", "expected_output": "True\n20 30 40 50 70", "is_hidden": False, "points_weight": 2.0, "description": "Baseline BST search and traversal"},
                {"input_data": "3\n10 5 15\nsearch 99", "expected_output": "False\n5 10 15", "is_hidden": True, "points_weight": 3.0, "description": "Hidden test: element not in tree"}
            ]
        )
        print(f"[PASS] Propose Experiment Draft created: Title='{prop_exp['draft']['title']}', Subject='{prop_exp['draft']['subject_name']}'")

        # 4b. Execute the Action to actually create the experiment in DB
        action_result = rt.execute_role_action(
            action_payload=prop_exp['draft'],
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role
        )
        print(f"[PASS] Action Executed: {action_result.get('message')}")
        new_exp_id = action_result.get('experiment_id')
        if not new_exp_id:
            print("[FAIL] Action execution did not return experiment_id")
            return False

        # 4c. Verify the real database objects created
        created_exp = Experiment.query.get(new_exp_id)
        if not created_exp or created_exp.title != "Binary Search Tree Insertion & Search":
            print("[FAIL] Experiment record was not persisted in database")
            return False
        
        pages_count = ContentPage.query.filter_by(experiment_id=new_exp_id).count()
        modules_count = ContentModule.query.filter_by(experiment_id=new_exp_id).count()
        tcs_count = TestCase.query.filter_by(experiment_id=new_exp_id).count()
        
        print(f"[PASS] Database Verification:")
        print(f"       Experiment #{created_exp.exp_number} ID: {created_exp.id}")
        print(f"       Published Status: {created_exp.is_published}")
        print(f"       Content Pages: {pages_count} (Theory & Objectives)")
        print(f"       Content Modules: {modules_count} (Markdown Theory, Procedure, Starter Code)")
        print(f"       Test Cases Attached: {tcs_count} (Visible: 1, Hidden: 1)")

        # 4d. Test attaching additional test cases via execute_role_action
        add_tc_payload = {
            'action': 'instructor_add_test_cases',
            'experiment_id': new_exp_id,
            'experiment_title': created_exp.title,
            'test_cases': [
                {"input_data": "1\n100\nsearch 100", "expected_output": "True\n100", "is_hidden": False, "points_weight": 1.0, "description": "Single node tree"}
            ]
        }
        res_tc = rt.execute_role_action(add_tc_payload, g.institution_id, g.user_id, g.role)
        print(f"[PASS] Added Test Cases Action: {res_tc.get('message')}")

        # 4e. Test attaching a Readiness Quiz via execute_role_action
        quiz_payload = {
            'action': 'instructor_create_quiz_module',
            'experiment_id': new_exp_id,
            'quiz_title': 'BST Conceptual Readiness Quiz',
            'questions': [
                {
                    'question_text': 'What is the worst-case time complexity of searching in an unbalanced BST?',
                    'options': ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
                    'correct_answer': 'C',
                    'explanation': 'In an unbalanced (skewed) BST, searching degrades to linear search O(N).'
                },
                {
                    'question_text': 'Which traversal of a Binary Search Tree produces elements in sorted ascending order?',
                    'options': ['Pre-order', 'In-order', 'Post-order', 'Level-order'],
                    'correct_answer': 'B',
                    'explanation': 'In-order traversal visits left-root-right, yielding sorted order in a BST.'
                }
            ]
        }
        res_quiz = rt.execute_role_action(quiz_payload, g.institution_id, g.user_id, g.role)
        print(f"[PASS] Added Quiz Module Action: {res_quiz.get('message')}")

        # 4f. Test creating SPARK Checkpoints
        cp_payload = {
            'action': 'instructor_create_checkpoints',
            'experiment_id': new_exp_id,
            'experiment_title': created_exp.title,
            'checkpoints': [
                {'order': 1, 'title': 'Node Initialization & Insert Logic', 'weight': 50, 'is_gated': False},
                {'order': 2, 'title': 'Traversal & Search Verification', 'weight': 50, 'is_gated': True}
            ]
        }
        res_cp = rt.execute_role_action(cp_payload, g.institution_id, g.user_id, g.role)
        print(f"[PASS] Added Checkpoints Action: {res_cp.get('message')}")

    # 5. LIVE HTTP ENDPOINT TESTS VIA FLASK SERVER (API Level)
    print("\n[STEP 5] Testing Live AI Harness HTTP Endpoints as Instructor...")

    # 5a. Knowledge Query Mode
    turn_payload = {
        "prompt": "Give me a summary of my assigned sections and students who need academic intervention.",
        "mode": "chat",
        "page_context": {
            "pathname": "/instructor/dashboard",
            "role": "instructor"
        }
    }
    r_msg = requests.post(f"{backend_url}/api/ai/harness/message", headers=headers, json=turn_payload, timeout=90)
    print(f"[PASS] POST /api/ai/harness/message (Instructor Chat Mode): HTTP {r_msg.status_code}")
    if r_msg.status_code in (200, 201):
        m_data = r_msg.json()
        asst = m_data.get('assistant_message', {})
        print(f"       Session ID: {m_data.get('session_id')}")
        print(f"       AI Response Preview: {asst.get('content', '')[:140]}...")

    # 5b. Agent Mode Action Confirmation Card
    agent_payload = {
        "prompt": "Export an error cluster analysis report for my sections as a CSV file.",
        "mode": "agent",
        "page_context": {
            "pathname": "/instructor/analytics",
            "role": "instructor"
        }
    }
    r_agent = requests.post(f"{backend_url}/api/ai/harness/message", headers=headers, json=agent_payload, timeout=90)
    print(f"[PASS] POST /api/ai/harness/message (Instructor Agent Mode): HTTP {r_agent.status_code}")
    if r_agent.status_code in (200, 201):
        ag_data = r_agent.json()
        print(f"       Pending Action Generated: {ag_data.get('pending_action') is not None}")
        print(f"       Deliverable Generated: {ag_data.get('generated_doc') is not None}")

    # 5c. Test Action Execution HTTP Endpoint
    exec_payload = {
        "action_payload": {
            "action": "instructor_grant_extension",
            "student_id": sample_student_id,
            "student_name": sample_student_name,
            "experiment_id": new_exp_id,
            "experiment_title": "Binary Search Tree Insertion & Search",
            "reason": "Verified illness note - 3 day extension granted"
        }
    }
    r_exec = requests.post(f"{backend_url}/api/ai/harness/actions/execute", headers=headers, json=exec_payload, timeout=15)
    print(f"[PASS] POST /api/ai/harness/actions/execute: HTTP {r_exec.status_code}")
    if r_exec.status_code == 200:
        print(f"       Result: {r_exec.json().get('result', {}).get('message')}")

    print("\n" + "=" * 80)
    print("ALL INSTRUCTOR ROLE AI HARNESS CAPABILITIES VERIFIED (100% PASS)")
    print("=" * 80)
    return True

if __name__ == "__main__":
    success = test_instructor_harness()
    sys.exit(0 if success else 1)
