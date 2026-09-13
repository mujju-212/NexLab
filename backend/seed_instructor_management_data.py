import sys
import os
import uuid
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.experiment import Experiment
from app.models.session import LabSession, SessionAttendance
from app.models.academic import SectionSubject, SectionStudent
from app.models.intervention import Intervention, Extension
from app.models.enhancements import TeacherNote
from app.models.grading import VivaSession, VivaAnswer
from app.models.exam import Exam, ExamQuestion
from app.models.conductor import Report

app = create_app()

def seed_management_data():
    with app.app_context():
        print("=== Seeding Instructor Management Data ===")
        instructor = User.query.filter_by(email='instructor@nexlab.demo').first()
        if not instructor:
            print("Instructor not found.")
            return

        inst_id = instructor.institution_id
        students = User.query.filter_by(role='student', institution_id=inst_id).all()
        if not students:
            students = User.query.filter_by(role='student').all()
        print(f"Found {len(students)} students.")

        exps = Experiment.query.filter_by(institution_id=inst_id).all()
        if not exps:
            exps = Experiment.query.all()
        print(f"Found {len(exps)} experiments.")

        sessions = LabSession.query.filter_by(institution_id=inst_id).all()
        if not sessions:
            sessions = LabSession.query.all()
        print(f"Found {len(sessions)} sessions.")

        now = datetime.utcnow()

        # ── 1. Interventions ────────────────────────────────────────────────────────
        if Intervention.query.filter_by(created_by=instructor.id).count() == 0 and len(students) >= 3:
            print("Seeding interventions...")
            i1 = Intervention(
                institution_id=inst_id,
                created_by=instructor.id,
                student_id=students[0].id,
                action_type='talked_to_student',
                note='Discussed recursion depth limits and stack overflow issues. Advised reviewing base case conditions before implementing loops.',
                outcome='open',
                follow_up_at=now + timedelta(days=3),
                created_at=now - timedelta(days=2)
            )
            i2 = Intervention(
                institution_id=inst_id,
                created_by=instructor.id,
                student_id=students[1].id,
                action_type='extended_deadline',
                note='Granted 48-hour deadline extension due to verified medical absence.',
                outcome='improved',
                outcome_note='Student completed lab assignment on time with 95% test cases passing.',
                resolved_at=now - timedelta(days=1),
                created_at=now - timedelta(days=5)
            )
            i3 = Intervention(
                institution_id=inst_id,
                created_by=instructor.id,
                student_id=students[2].id,
                action_type='tutoring',
                note='Paired with senior student peer tutor for Linked List pointer manipulation and debugging.',
                outcome='open',
                follow_up_at=now + timedelta(days=5),
                created_at=now - timedelta(hours=18)
            )
            db.session.add_all([i1, i2, i3])
            db.session.commit()
            print("  -> 3 interventions seeded.")

        # ── 2. Extensions ───────────────────────────────────────────────────────────
        if Extension.query.filter_by(granted_by=instructor.id).count() == 0 and len(students) >= 2 and len(exps) >= 2:
            print("Seeding extensions...")
            ext1 = Extension(
                institution_id=inst_id,
                granted_by=instructor.id,
                student_id=students[0].id,
                experiment_id=exps[0].id,
                extension_until=now + timedelta(days=4),
                reason='Medical leave approved by academic dean',
                excused=True,
                created_at=now - timedelta(days=1)
            )
            ext2 = Extension(
                institution_id=inst_id,
                granted_by=instructor.id,
                student_id=students[1].id,
                experiment_id=exps[1].id,
                extension_until=now + timedelta(days=2),
                reason='Hardware failure during live conductor window',
                excused=False,
                created_at=now - timedelta(hours=12)
            )
            db.session.add_all([ext1, ext2])
            db.session.commit()
            print("  -> 2 extensions seeded.")

        # ── 3. Teacher Notes ────────────────────────────────────────────────────────
        if TeacherNote.query.filter_by(created_by=instructor.id).count() == 0 and len(students) >= 3:
            print("Seeding private teacher notes...")
            n1 = TeacherNote(
                institution_id=inst_id,
                created_by=instructor.id,
                student_id=students[0].id,
                note='Strong conceptual understanding of data structures, but rushes through edge case test verification under time limits.',
                created_at=now - timedelta(days=3)
            )
            n2 = TeacherNote(
                institution_id=inst_id,
                created_by=instructor.id,
                student_id=students[1].id,
                note='Consistently active in peer assistance during live lab sessions. Recommended for Department TA role next semester.',
                created_at=now - timedelta(days=2)
            )
            n3 = TeacherNote(
                institution_id=inst_id,
                created_by=instructor.id,
                student_id=students[2].id,
                note='Needs occasional guidance on memory management in C/Python. Shows rapid improvement on second attempt.',
                created_at=now - timedelta(days=1)
            )
            db.session.add_all([n1, n2, n3])
            db.session.commit()
            print("  -> 3 teacher notes seeded.")

        # ── 4. Viva Sessions ────────────────────────────────────────────────────────
        if VivaSession.query.count() == 0 and len(students) >= 4 and len(exps) >= 2:
            print("Seeding viva evaluation sessions...")
            v1_id = str(uuid.uuid4())
            v1 = VivaSession(
                id=v1_id,
                student_id=students[0].id,
                experiment_id=exps[0].id,
                questions=[
                    {
                        'q': 'Explain the difference between a singly and doubly linked list.',
                        'score': 88,
                        'feedback': 'Good explanation of pointer structure and trade-offs in memory.'
                    },
                    {
                        'q': 'What is the time complexity of deleting a node given only a pointer to that node?',
                        'score': 92,
                        'feedback': 'Excellent insight into the node copy trick for singly linked lists.'
                    }
                ],
                total_score=90.0,
                status='completed',
                started_at=now - timedelta(days=2),
                completed_at=now - timedelta(days=2) + timedelta(minutes=15),
                created_at=now - timedelta(days=2)
            )
            ans1 = VivaAnswer(
                viva_session_id=v1_id,
                question_index=0,
                question_text='Explain the difference between a singly and doubly linked list.',
                answer_text='A singly linked list has nodes with next pointers, while a doubly linked list has both next and previous pointers enabling bidirectional traversal.',
                score=88.0,
                ai_feedback='Accurate explanation of memory overhead and traversal capability.',
                submitted_at=now - timedelta(days=2) + timedelta(minutes=5)
            )
            ans2 = VivaAnswer(
                viva_session_id=v1_id,
                question_index=1,
                question_text='What is the time complexity of deleting a node given only a pointer to that node?',
                answer_text='In a doubly linked list it is O(1). In a singly linked list without prev pointer, we can copy next node data and delete next node in O(1).',
                score=92.0,
                ai_feedback='Strong technical insight demonstrating deep understanding.',
                submitted_at=now - timedelta(days=2) + timedelta(minutes=12)
            )

            v2_id = str(uuid.uuid4())
            v2 = VivaSession(
                id=v2_id,
                student_id=students[1].id,
                experiment_id=exps[0].id,
                questions=[
                    {
                        'q': 'How do you detect a cycle in a linked list?',
                        'score': 95,
                        'feedback': 'Accurate description of tortoise and hare algorithm.'
                    }
                ],
                total_score=95.0,
                status='completed',
                started_at=now - timedelta(days=1),
                completed_at=now - timedelta(days=1) + timedelta(minutes=12),
                created_at=now - timedelta(days=1)
            )
            ans3 = VivaAnswer(
                viva_session_id=v2_id,
                question_index=0,
                question_text='How do you detect a cycle in a linked list?',
                answer_text='Using Floyd’s cycle-finding algorithm with slow and fast pointers. If they meet, there is a cycle in the list.',
                score=95.0,
                ai_feedback='Flawless explanation of time O(n) and auxiliary space O(1).',
                submitted_at=now - timedelta(days=1) + timedelta(minutes=6)
            )

            v3_id = str(uuid.uuid4())
            v3 = VivaSession(
                id=v3_id,
                student_id=students[2].id,
                experiment_id=exps[1].id if len(exps) > 1 else exps[0].id,
                questions=[
                    {
                        'q': 'What are the performance differences between quicksort and mergesort?',
                        'score': 82,
                        'feedback': 'Clear explanation of time and space complexity differences.'
                    }
                ],
                total_score=82.0,
                status='completed',
                started_at=now - timedelta(hours=6),
                completed_at=now - timedelta(hours=6) + timedelta(minutes=10),
                created_at=now - timedelta(hours=6)
            )
            ans4 = VivaAnswer(
                viva_session_id=v3_id,
                question_index=0,
                question_text='What are the performance differences between quicksort and mergesort?',
                answer_text='Quicksort has O(n log n) average but O(n^2) worst case, and is in-place. Mergesort is always O(n log n) but needs O(n) auxiliary memory.',
                score=82.0,
                ai_feedback='Good grasp of space-time trade-offs.',
                submitted_at=now - timedelta(hours=6) + timedelta(minutes=7)
            )

            v4_id = str(uuid.uuid4())
            v4 = VivaSession(
                id=v4_id,
                student_id=students[3].id,
                experiment_id=exps[0].id,
                questions=[
                    {'q': 'Explain how list comprehensions are optimized in Python bytecode.', 'score': None, 'feedback': None}
                ],
                total_score=None,
                status='active',
                started_at=now - timedelta(minutes=25),
                created_at=now - timedelta(minutes=25)
            )
            db.session.add_all([v1, v2, v3, v4, ans1, ans2, ans3, ans4])
            db.session.commit()
            print("  -> 4 viva sessions with answers seeded.")

        # ── 5. Timed Exams ──────────────────────────────────────────────────────────
        if Exam.query.filter_by(institution_id=inst_id).count() == 0:
            print("Seeding exams...")
            from app.models.subject import Subject
            subj = Subject.query.filter_by(institution_id=inst_id).first() or Subject.query.first()
            if not subj:
                subj = Subject(
                    id=str(uuid.uuid4()),
                    institution_id=inst_id,
                    name="Data Structures & Algorithms",
                    code="CS201"
                )
                db.session.add(subj)
                db.session.flush()

            exam1 = Exam(
                id=str(uuid.uuid4()),
                institution_id=inst_id,
                subject_id=subj.id,
                created_by=instructor.id,
                title="Mid-Term Assessment: Data Structures & Algorithms",
                description="Comprehensive timed evaluation covering linked lists, stacks, queues, and asymptotic complexity.",
                exam_type="mixed",
                duration_minutes=60,
                available_from=now - timedelta(days=1),
                due_at=now + timedelta(days=7),
                is_published=True,
                pass_threshold=50,
                created_at=now - timedelta(days=2)
            )
            exam2 = Exam(
                id=str(uuid.uuid4()),
                institution_id=inst_id,
                subject_id=subj.id,
                created_by=instructor.id,
                title="Quiz 1: Python Fundamentals & OOP",
                description="Quick 30-minute timed quiz on list comprehensions, decorators, and classes.",
                exam_type="mcq",
                duration_minutes=30,
                available_from=now - timedelta(hours=12),
                due_at=now + timedelta(days=5),
                is_published=True,
                pass_threshold=60,
                created_at=now - timedelta(days=1)
            )
            db.session.add_all([exam1, exam2])
            db.session.flush()

            # Add questions for exam 1
            eq1 = ExamQuestion(
                exam_id=exam1.id,
                question_type="mcq",
                prompt="Which of the following data structures strictly follows the Last-In-First-Out (LIFO) principle?",
                options=["Queue", "Stack", "Binary Search Tree", "Linked List"],
                correct_answer="Stack",
                points=5,
                display_order=1
            )
            eq2 = ExamQuestion(
                exam_id=exam1.id,
                question_type="mcq",
                prompt="What is the worst-case time complexity of standard Quicksort with pivot picked as the last element?",
                options=["O(n log n)", "O(n^2)", "O(n)", "O(log n)"],
                correct_answer="O(n^2)",
                points=5,
                display_order=2
            )
            eq3 = ExamQuestion(
                exam_id=exam1.id,
                question_type="coding",
                prompt="Design a stack that supports push, pop, top, and retrieving the minimum element in O(1) time.",
                points=20,
                starter_code="class MinStack:\n    def __init__(self):\n        pass\n    def push(self, val: int) -> None:\n        pass\n    def pop(self) -> None:\n        pass\n    def top(self) -> int:\n        pass\n    def getMin(self) -> int:\n        pass",
                display_order=3
            )

            # Add questions for exam 2
            eq4 = ExamQuestion(
                exam_id=exam2.id,
                question_type="mcq",
                prompt="Which of the following data types is immutable in Python?",
                options=["List", "Dictionary", "Tuple", "Set"],
                correct_answer="Tuple",
                points=10,
                display_order=1
            )
            eq5 = ExamQuestion(
                exam_id=exam2.id,
                question_type="mcq",
                prompt="What is the output of [x**2 for x in range(4) if x % 2 == 0]?",
                options=["[0, 4]", "[0, 1, 4, 9]", "[4]", "[1, 9]"],
                correct_answer="[0, 4]",
                points=10,
                display_order=2
            )
            db.session.add_all([eq1, eq2, eq3, eq4, eq5])
            db.session.commit()
            print("  -> 2 exams with questions seeded.")

        # ── 6. Catch-up Configuration on Sessions ────────────────────────────────────
        print("Configuring catch-up on sessions...")
        if sessions:
            # Enable catch-up on at least 2 sessions
            sessions[0].catchup_enabled = True
            sessions[0].catchup_deadline = now + timedelta(days=5)
            if len(sessions) > 1:
                sessions[1].catchup_enabled = True
                sessions[1].catchup_deadline = now + timedelta(days=3)
            db.session.commit()
            print("  -> Catch-up enabled on sessions.")

        # ── 7. Session Attendance Seeding ───────────────────────────────────────────
        print("Seeding rich session attendance...")
        for sess in sessions:
            existing_att = {a.student_id: a for a in SessionAttendance.query.filter_by(session_id=sess.id).all()}
            for idx, st in enumerate(students[:15]):
                if st.id in existing_att:
                    continue
                # 70% present, 20% late, 10% absent
                dice = random.random()
                if dice < 0.70:
                    status = 'present'
                    joined = (sess.scheduled_at or now) + timedelta(minutes=random.randint(0, 5))
                    duration = random.randint(3200, 5400)
                    active = True
                elif dice < 0.90:
                    status = 'late'
                    joined = (sess.scheduled_at or now) + timedelta(minutes=random.randint(12, 25))
                    duration = random.randint(1800, 3600)
                    active = True
                else:
                    status = 'absent'
                    joined = None
                    duration = 0
                    active = False

                is_catchup = (sess.catchup_enabled and idx == 0)

                att = SessionAttendance(
                    session_id=sess.id,
                    student_id=st.id,
                    status=status,
                    joined_at=joined,
                    total_time_seconds=duration,
                    is_active_participant=active,
                    is_catchup=is_catchup
                )
                db.session.add(att)
        db.session.commit()
        print("  -> Session attendance seeded for all sessions.")

        # ── 8. Pre-generate Ready Reports ───────────────────────────────────────────
        if Report.query.filter_by(created_by=instructor.id).count() == 0:
            print("Seeding pre-generated ready reports...")
            r1 = Report(
                institution_id=inst_id,
                created_by=instructor.id,
                kind='gradebook',
                params={'session_id': sessions[0].id if sessions else None},
                status='ready',
                created_at=now - timedelta(days=1)
            )
            r2 = Report(
                institution_id=inst_id,
                created_by=instructor.id,
                kind='session_summary',
                params={'session_id': sessions[0].id if sessions else None},
                status='ready',
                created_at=now - timedelta(hours=4)
            )
            db.session.add_all([r1, r2])
            db.session.commit()
            print("  -> 2 ready reports seeded.")

        print("\n=== ALL INSTRUCTOR DATA SEEDED SUCCESSFULLY! ===")

if __name__ == '__main__':
    seed_management_data()
