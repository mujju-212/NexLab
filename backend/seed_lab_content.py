"""
seed_lab_content.py — Seeds rich, complete Lab Content into the database:
- Subjects (Data Structures, Python & Web Dev, Computer Networks)
- Experiments (Stack Implementation, HTML Animation, Linked List, BST)
- Content Pages (Theory, Interactive Code, Assignment, Quiz, Viva)
- Content Modules (Markdown Notes, Code Snippets, Assignments, Quiz, Viva)
- Test Cases (Public + Hidden test cases with exact input/expected outputs)
- Quiz Questions (4-option MCQs with explanations)

Run: cd backend && python seed_lab_content.py
"""

import os
import sys
import uuid
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
from app.models.subject import Subject
from app.models.experiment import Experiment, TestCase, ContentPage, ContentModule, QuizQuestion

app = create_app()

def seed_lab_content():
    with app.app_context():
        print("=" * 70)
        print("SEEDING RICH LAB EXPERIMENTS & PRE-LAB CONTENT")
        print("=" * 70)

        # 1. Get or create Institution
        institution = Institution.query.first()
        if not institution:
            institution = Institution(
                id=str(uuid.uuid4()),
                name="NexLab Autonomous Institute of Technology",
                slug="nexlab-tech",
                code="NEX001"
            )
            db.session.add(institution)
            db.session.commit()
            print(f"[+] Created Institution: {institution.name}")

        # 2. Get or create Instructor
        instructor = User.query.filter_by(role='instructor').first()
        if not instructor:
            instructor = User(
                id=str(uuid.uuid4()),
                email="instructor@nexlab.app",
                name="Prof. Alan Turing",
                role="instructor",
                institution_id=institution.id
            )
            instructor.set_password("password123")
            db.session.add(instructor)
            db.session.commit()
            print(f"[+] Created Instructor: {instructor.name} ({instructor.email})")

        # 3. Seed Subjects
        subjects_data = [
            {
                "code": "CS201",
                "name": "Data Structures & Algorithms Lab",
                "description": "Computer Science & Engineering - Semester 3"
            },
            {
                "code": "CS102",
                "name": "Python Programming & Web Technologies Lab",
                "description": "Computer Science & Engineering - Semester 1"
            },
            {
                "code": "CS304",
                "name": "Computer Networks & Systems Lab",
                "description": "Information Technology - Semester 5"
            }
        ]

        seeded_subjects = {}
        for sdata in subjects_data:
            subj = Subject.query.filter_by(code=sdata["code"]).first()
            if not subj:
                subj = Subject(
                    id=str(uuid.uuid4()),
                    institution_id=institution.id,
                    code=sdata["code"],
                    name=sdata["name"],
                    description=sdata["description"]
                )
                db.session.add(subj)
                db.session.commit()
                print(f"[+] Seeded Subject: {subj.code} - {subj.name}")
            seeded_subjects[sdata["code"]] = subj

        # 3b. Seed AcademicYear, Batch, Section, and SectionSubject
        from app.models.academic import AcademicYear, Batch, Section, SectionSubject

        acad_year = AcademicYear.query.filter_by(institution_id=institution.id).first()
        if not acad_year:
            acad_year = AcademicYear(
                id=str(uuid.uuid4()),
                institution_id=institution.id,
                year_label="2024-2025",
                is_active=True
            )
            db.session.add(acad_year)
            db.session.commit()

        batch = Batch.query.filter_by(institution_id=institution.id).first()
        if not batch:
            batch = Batch(
                id=str(uuid.uuid4()),
                institution_id=institution.id,
                year_id=acad_year.id,
                name="CSE 2024 Batch",
                program="B.Tech CSE"
            )
            db.session.add(batch)
            db.session.commit()

        section = Section.query.filter_by(institution_id=institution.id).first()
        if not section:
            section = Section(
                id=str(uuid.uuid4()),
                institution_id=institution.id,
                batch_id=batch.id,
                name="Section A",
                class_teacher_id=instructor.id
            )
            db.session.add(section)
            db.session.commit()

        for code, subj in seeded_subjects.items():
            ss = SectionSubject.query.filter_by(subject_id=subj.id).first()
            if not ss:
                ss = SectionSubject(
                    id=str(uuid.uuid4()),
                    institution_id=institution.id,
                    section_id=section.id,
                    subject_id=subj.id,
                    instructor_id=instructor.id
                )
                db.session.add(ss)
                db.session.commit()
                print(f"[+] Seeded SectionSubject for {code} -> Section {section.name}")

        # 4. Seed Experiment 1: Stack Implementation (CS201)
        ds_subj = seeded_subjects["CS201"]
        exp_stack = Experiment.query.filter_by(subject_id=ds_subj.id, exp_number=1).first()
        if not exp_stack:
            exp_stack = Experiment(
                id=str(uuid.uuid4()),
                institution_id=institution.id,
                subject_id=ds_subj.id,
                instructor_id=instructor.id,
                exp_number=1,
                title="Pre-Lab: Simple Stack Implementation (LIFO Semantics)",
                aim="Implement a Stack class in Python using dynamic array backing and verify LIFO operations.",
                theory="""### Stack Data Structure Theory
A **Stack** is a linear data structure following the **Last-In, First-Out (LIFO)** ordering principle.

#### Key Operations:
- `push(item)`: Appends element to the top of the stack (O(1) amortized).
- `pop()`: Removes and returns the top element (O(1) time). Raises `IndexError` if stack is empty.
- `peek()`: Returns the top element without mutating stack state (O(1) time).
- `is_empty()`: Checks if internal element count is zero (O(1) time).
""",
                problem_statement="Write a Python class named `Stack` supporting `push`, `pop`, `peek`, and `is_empty` methods.",
                input_format="Automated unit test execution.",
                output_format="Method return values matching expected test outputs.",
                difficulty_level=2,
                concept_tags=["stack", "data-structures", "python", "lifo"],
                allowed_languages=["python", "cpp", "java"],
                rubric_test_cases=60,
                rubric_lab_report=20,
                rubric_code_quality=10,
                rubric_viva=10,
                enable_viva=True,
                is_published=True,
                experiment_type="coding"
            )
            db.session.add(exp_stack)
            db.session.commit()
            print(f"[+] Seeded Experiment 1: {exp_stack.title}")

        # Seed Test Cases for Stack Experiment
        existing_tc = TestCase.query.filter_by(experiment_id=exp_stack.id).count()
        if existing_tc == 0:
            tc_list = [
                TestCase(
                    id=str(uuid.uuid4()),
                    experiment_id=exp_stack.id,
                    input_data="s = Stack(); s.push(10); print(s.pop())",
                    expected_output="10",
                    is_hidden=False,
                    points_weight=1.0,
                    description="Push 10 and pop immediately"
                ),
                TestCase(
                    id=str(uuid.uuid4()),
                    experiment_id=exp_stack.id,
                    input_data="s = Stack(); s.push(5); s.push(20); print(s.peek())",
                    expected_output="20",
                    is_hidden=False,
                    points_weight=1.0,
                    description="Peek top element after two pushes"
                ),
                TestCase(
                    id=str(uuid.uuid4()),
                    experiment_id=exp_stack.id,
                    input_data="s = Stack(); print(s.is_empty())",
                    expected_output="True",
                    is_hidden=True,
                    points_weight=1.0,
                    description="Check empty stack state"
                ),
                TestCase(
                    id=str(uuid.uuid4()),
                    experiment_id=exp_stack.id,
                    input_data="s = Stack(); s.pop()",
                    expected_output="IndexError",
                    is_hidden=True,
                    points_weight=1.0,
                    description="Pop from empty stack raises IndexError"
                ),
                TestCase(
                    id=str(uuid.uuid4()),
                    experiment_id=exp_stack.id,
                    input_data="s = Stack()\nfor i in range(5): s.push(i)\nprint(s.pop(), s.pop())",
                    expected_output="4 3",
                    is_hidden=True,
                    points_weight=1.0,
                    description="LIFO order verification on 5 elements"
                )
            ]
            db.session.add_all(tc_list)
            db.session.commit()
            print(f"    [+] Seeded {len(tc_list)} Automated Test Cases")

        # Seed Content Pages & Modules for Stack Experiment
        page1 = ContentPage.query.filter_by(experiment_id=exp_stack.id, title="1. Theory & Notes").first()
        if not page1:
            page1 = ContentPage(
                id=str(uuid.uuid4()),
                experiment_id=exp_stack.id,
                title="1. Theory & Notes",
                display_order=1,
                is_live=True
            )
            db.session.add(page1)
            db.session.commit()

            mod_notes = ContentModule(
                id=str(uuid.uuid4()),
                experiment_id=exp_stack.id,
                page_id=page1.id,
                module_type="markdown",
                title="Pre-Lab Reading: Stack Memory & LIFO Semantics",
                display_order=1,
                content_data={
                    "html": """<h2>Stack Memory & Data Structures</h2>
<p>A stack is a fundamental data structure operating on <strong>Last-In, First-Out (LIFO)</strong> principles.</p>
<ul>
<li><strong>Push</strong>: Adds element to top. Time Complexity: <code>O(1)</code>.</li>
<li><strong>Pop</strong>: Removes top element. Time Complexity: <code>O(1)</code>.</li>
<li><strong>Call Stack</strong>: Runtime execution environments use stacks to manage function return addresses and local variables.</li>
</ul>"""
                }
            )
            db.session.add(mod_notes)

        page2 = ContentPage.query.filter_by(experiment_id=exp_stack.id, title="2. Coding Assignment").first()
        if not page2:
            page2 = ContentPage(
                id=str(uuid.uuid4()),
                experiment_id=exp_stack.id,
                title="2. Coding Assignment",
                display_order=2,
                is_live=True
            )
            db.session.add(page2)
            db.session.commit()

            mod_assign = ContentModule(
                id=str(uuid.uuid4()),
                experiment_id=exp_stack.id,
                page_id=page2.id,
                module_type="assign",
                title="Stack Class Implementation",
                display_order=1,
                content_data={
                    "language": "python",
                    "instructions": "Implement a `Stack` class with `push`, `pop`, `peek`, and `is_empty` methods.",
                    "starter_code": """class Stack:
    def __init__(self):
        self._data = []

    def push(self, item):
        self._data.append(item)

    def pop(self):
        if not self._data:
            raise IndexError("pop from empty stack")
        return self._data.pop()

    def peek(self):
        if not self._data:
            raise IndexError("peek from empty stack")
        return self._data[-1]

    def is_empty(self):
        return len(self._data) == 0
""",
                    "pass_threshold": 60,
                    "test_cases": [
                        {"input": "s = Stack(); s.push(10); print(s.pop())", "expected": "10", "hidden": False, "weight": 1},
                        {"input": "s = Stack(); s.push(5); s.push(20); print(s.peek())", "expected": "20", "hidden": False, "weight": 1},
                        {"input": "s = Stack(); print(s.is_empty())", "expected": "True", "hidden": True, "weight": 1},
                        {"input": "s = Stack(); s.pop()", "expected": "IndexError", "hidden": True, "weight": 1},
                        {"input": "s = Stack()\nfor i in range(5): s.push(i)\nprint(s.pop(), s.pop())", "expected": "4 3", "hidden": True, "weight": 1}
                    ]
                }
            )
            db.session.add(mod_assign)

        page3 = ContentPage.query.filter_by(experiment_id=exp_stack.id, title="3. Quiz & Viva").first()
        if not page3:
            page3 = ContentPage(
                id=str(uuid.uuid4()),
                experiment_id=exp_stack.id,
                title="3. Quiz & Viva",
                display_order=3,
                is_live=True
            )
            db.session.add(page3)
            db.session.commit()

            mod_quiz = ContentModule(
                id=str(uuid.uuid4()),
                experiment_id=exp_stack.id,
                page_id=page3.id,
                module_type="quiz",
                title="Pre-Lab Knowledge Quiz",
                display_order=1,
                content_data={"pass_threshold": 70, "max_attempts": 3}
            )
            db.session.add(mod_quiz)
            db.session.commit()

            q1 = QuizQuestion(
                id=str(uuid.uuid4()),
                module_id=mod_quiz.id,
                question_text="Which ordering principle governs a Stack data structure?",
                options=["First-In, First-Out (FIFO)", "Last-In, First-Out (LIFO)", "Random Access", "Priority Queue"],
                correct_answer="B",
                points=1,
                explanation="Stacks enforce LIFO ordering where the last inserted element is removed first."
            )
            q2 = QuizQuestion(
                id=str(uuid.uuid4()),
                module_id=mod_quiz.id,
                question_text="What is the average time complexity of push and pop operations?",
                options=["O(N)", "O(log N)", "O(1)", "O(N^2)"],
                correct_answer="C",
                points=1,
                explanation="Push and pop operations perform constant time O(1) array operations."
            )
            db.session.add_all([q1, q2])

        # 5. Seed Experiment 2: Simple Animation in HTML File (CS102)
        web_subj = seeded_subjects["CS102"]
        exp_html = Experiment.query.filter_by(subject_id=web_subj.id, exp_number=1).first()
        if not exp_html:
            exp_html = Experiment(
                id=str(uuid.uuid4()),
                institution_id=institution.id,
                subject_id=web_subj.id,
                instructor_id=instructor.id,
                exp_number=1,
                title="Pre-Lab: Simple Animation in an HTML File",
                aim="Create a minimal HTML page that animates a shape using CSS keyframes and DOM rendering.",
                theory="""### Browser Rendering Pipeline & CSS Keyframe Animations
Browsers process HTML and CSS through 5 distinct execution stages:
`HTML parsing` -> `DOM Construction` -> `Style Recalculation` -> `Layout` -> `Paint & Composite`.

#### CSS Keyframes Syntax:
```css
@keyframes slideAndRotate {
  0% { transform: translateX(0px) rotate(0deg); background-color: #4f46e5; }
  50% { transform: translateX(150px) rotate(180deg); background-color: #ec4899; }
  100% { transform: translateX(0px) rotate(360deg); background-color: #4f46e5; }
}
```
""",
                problem_statement="Write a single standalone `animation.html` file containing CSS keyframes to continuously rotate and translate a 100px square div.",
                input_format="HTML / CSS Source Code",
                output_format="Animated element rendered in browser viewport",
                difficulty_level=1,
                concept_tags=["html", "css", "animation", "frontend"],
                allowed_languages=["html", "javascript"],
                rubric_test_cases=50,
                rubric_lab_report=30,
                rubric_code_quality=20,
                rubric_viva=0,
                enable_viva=False,
                is_published=True,
                experiment_type="coding"
            )
            db.session.add(exp_html)
            db.session.commit()
            print(f"[+] Seeded Experiment 2: {exp_html.title}")

        # Seed HTML Page and Module
        page_html = ContentPage.query.filter_by(experiment_id=exp_html.id, title="Animation Lab Page").first()
        if not page_html:
            page_html = ContentPage(
                id=str(uuid.uuid4()),
                experiment_id=exp_html.id,
                title="Animation Lab Page",
                display_order=1,
                is_live=True
            )
            db.session.add(page_html)
            db.session.commit()

            mod_html_code = ContentModule(
                id=str(uuid.uuid4()),
                experiment_id=exp_html.id,
                page_id=page_html.id,
                module_type="code",
                title="CSS Keyframe Animation Source Code",
                display_order=1,
                content_data={
                    "language": "html",
                    "code": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CSS Animation Demo</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #0f172a;
    }
    .box {
      width: 100px;
      height: 100px;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      border-radius: 16px;
      animation: spinAndMove 3s infinite ease-in-out;
      box-shadow: 0 10px 25px rgba(99, 102, 241, 0.5);
    }
    @keyframes spinAndMove {
      0% { transform: translateY(0) rotate(0deg) scale(1); }
      50% { transform: translateY(-100px) rotate(180deg) scale(1.2); }
      100% { transform: translateY(0) rotate(360deg) scale(1); }
    }
  </style>
</head>
<body>
  <div class="box"></div>
</body>
</html>"""
                }
            )
            db.session.add(mod_html_code)

        db.session.commit()
        print("=" * 70)
        print("ALL LAB CONTENT, EXPERIMENTS, & TEST CASES SEEDED SUCCESSFULLY!")
        print("=" * 70)

if __name__ == '__main__':
    seed_lab_content()
