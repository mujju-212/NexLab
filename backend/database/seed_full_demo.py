"""
seed_full_demo.py — Full demo dataset for the Instructor Experience.

PURPOSE
-------
Give every instructor page something real to show:
  • Experiment editor with EVERY content block type (markdown, text, code,
    html, image, video, pdf, link, file, quiz, viva, assign)
  • SPARK checkpoints + progress grid
  • Sessions across the lifecycle (ended / active / scheduled)
  • Student submissions: CodeAttempt, CodeVersion, Grades, FocusScore,
    HintLog, SessionAttendance, ProctorEvent, PlagiarismFlag, ConceptMastery
  • 6-tab analytics + dashboard attention + reports

WHAT IT DOES
------------
1. Deletes ALL experiments owned by the instructor (children first), then
   re-creates 4 richly-built experiments (coding / coding / mixed / quiz_only).
2. Creates/refreshes sessions + attendance + submissions for the demo students.
3. Everything is scoped to institution 'inst-test-001' + instructor@nexlab.demo.

IDEMPOTENT — safe to re-run; each run resets the instructor's experiment data.

Run (see memory: run-backend-scripts):
    cd backend
    ./venv/Scripts/python.exe database/seed_full_demo.py
"""
import os, sys, json, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.academic import SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.experiment import (
    Experiment, TestCase, ContentModule, ContentPage, QuizQuestion, ContentProgress,
)
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, HintLog, VivaSession
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.models.feedback import PlagiarismFlag
from app.models.proctor_event import ProctorEvent
from app.models.conductor import (
    Checkpoint, CheckpointProgress, LivePageState, ChatMessage, SessionModeTransition,
)

INST             = 'inst-test-001'
INSTRUCTOR_EMAIL = 'instructor@nexlab.demo'

now = datetime.utcnow()
random.seed(20260831)


def _get_or_create(model, defaults=None, **filters):
    obj = model.query.filter_by(**filters).first()
    if obj:
        return obj, False
    params = dict(filters)
    params.update(defaults or {})
    obj = model(**params)
    db.session.add(obj)
    db.session.flush()
    return obj, True


def _room(slug):
    return f"vlab-{INST[:8]}-{slug}"


def wipe_instructor_experiments(instructor_id):
    """Delete every experiment owned by the instructor, children first."""
    exps = Experiment.query.filter_by(instructor_id=instructor_id).all()
    n = len(exps)
    for exp in exps:
        # ContentModules -> QuizQuestions, ContentProgress
        for m in ContentModule.query.filter_by(experiment_id=exp.id).all():
            QuizQuestion.query.filter_by(module_id=m.id).delete(synchronize_session=False)
            ContentProgress.query.filter_by(module_id=m.id).delete(synchronize_session=False)
            db.session.delete(m)
        # Checkpoints -> CheckpointProgress
        for cp in Checkpoint.query.filter_by(experiment_id=exp.id).all():
            CheckpointProgress.query.filter_by(checkpoint_id=cp.id).delete(synchronize_session=False)
            db.session.delete(cp)
        # TestCases
        TestCase.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
        # ContentPages
        ContentPage.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
        # Sessions referencing this experiment -> children
        for s in LabSession.query.filter_by(experiment_id=exp.id).all():
            SessionAttendance.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            CheckpointProgress.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            LivePageState.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            ChatMessage.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            SessionModeTransition.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            FocusScore.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            ProctorEvent.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            PlagiarismFlag.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            Grade.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            CodeAttempt.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            CodeVersion.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            HintLog.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            VivaSession.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
            db.session.delete(s)
        # CodeAttempts/Grades/HintLog not tied to a session
        CodeAttempt.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
        CodeVersion.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
        Grade.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
        HintLog.query.filter_by(experiment_id=exp.id).delete(synchronize_session=False)
        db.session.delete(exp)
    db.session.flush()
    return n


def build_experiment(instructor, subject_id, exp_number, title, aim, theory,
                     concept_tags, exp_type='coding', difficulty=2,
                     rubric=None, weightage=10, proctor=None):
    """Create a published experiment with full defaults."""
    exp = Experiment(
        institution_id=INST,
        subject_id=subject_id,
        instructor_id=instructor.id,
        exp_number=exp_number,
        title=title,
        aim=aim,
        theory=theory,
        problem_statement=f"Solve: {title}. Follow the instructions below.",
        input_format='Standard input. First line N, then N values.',
        output_format='One value per line.',
        difficulty_level=difficulty,
        concept_tags=concept_tags,
        allowed_languages=['python', 'c', 'cpp', 'java'],
        enable_viva=True,
        enable_lockdown=True,
        allow_ai_hints=True,
        time_limit_sec=10,
        memory_limit_kb=262144,
        is_published=True,
        is_multi_file=False,
        weightage=weightage,
        grade_scale=100,
        experiment_type=exp_type,
        proctor_defaults=proctor or {
            'lockdown_fullscreen': True,
            'block_copy_paste': True,
            'block_tab_switch': True,
            'plagiarism_scan': True,
            'focus_ml': True,
            'webcam_required': False,
        },
    )
    if rubric:
        exp.rubric_test_cases   = rubric.get('test_cases', 60)
        exp.rubric_lab_report   = rubric.get('lab_report', 0)
        exp.rubric_code_quality = rubric.get('code_quality', 10)
        exp.rubric_viva         = rubric.get('viva', 10)
        exp.rubric_quiz         = rubric.get('quiz', 20)
    db.session.add(exp)
    db.session.flush()
    return exp


def add_page(exp, title, order):
    p = ContentPage(experiment_id=exp.id, title=title, display_order=order, is_live=True)
    db.session.add(p)
    db.session.flush()
    return p


def add_module(exp, page_id, mtype, title, content_data, order):
    m = ContentModule(
        experiment_id=exp.id, page_id=page_id, module_type=mtype,
        title=title, content_data=content_data, display_order=order,
    )
    db.session.add(m)
    db.session.flush()
    return m


def add_quiz_question(module_id, q, opts, ans, expl, points=1):
    db.session.add(QuizQuestion(
        module_id=module_id, question_text=q, options=opts,
        correct_answer=ans, points=points, explanation=expl,
    ))


def add_test_case(exp, input_data, expected_output, hidden=False, desc=None, weight=1.0):
    tc = TestCase(
        experiment_id=exp.id, input_data=input_data, expected_output=expected_output,
        is_hidden=hidden, points_weight=weight, description=desc,
    )
    db.session.add(tc)
    db.session.flush()
    return tc


def add_checkpoint(exp, order, title, desc, tc_ids, weight=10, gated=False):
    cp = Checkpoint(
        experiment_id=exp.id, order=order, title=title, description=desc,
        test_case_ids=tc_ids, weight=weight, is_gated=gated,
    )
    db.session.add(cp)
    db.session.flush()
    return cp


def seed():
    instructor = User.query.filter_by(institution_id=INST, email=INSTRUCTOR_EMAIL).first()
    if not instructor:
        raise SystemExit(f"FATAL: instructor {INSTRUCTOR_EMAIL} not found in {INST}")

    subj_ds = Subject.query.filter_by(institution_id=INST, code='CS3401').first()
    subj_py = Subject.query.filter_by(institution_id=INST, code='CS3111').first()
    if not subj_ds or not subj_py:
        raise SystemExit("FATAL: expected subjects CS3401/CS3111 not found.")

    ss_ds = SectionSubject.query.filter_by(institution_id=INST, subject_id=subj_ds.id).first()
    ss_py = SectionSubject.query.filter_by(institution_id=INST, subject_id=subj_py.id).first()
    if not ss_ds or not ss_py:
        raise SystemExit("FATAL: section-subjects not found.")

    ds_students = [r.student_id for r in SectionStudent.query.filter_by(section_id=ss_ds.section_id).all()]
    py_students = [r.student_id for r in SectionStudent.query.filter_by(section_id=ss_py.section_id).all()]
    all_students = list(dict.fromkeys(ds_students + py_students))
    student_users = {u.id: u for u in User.query.filter(User.id.in_(all_students)).all()}

    if not all_students:
        raise SystemExit("FATAL: no students enrolled in DS-A or Python-A sections.")

    log = []

    # ── 1. Wipe existing instructor experiments (children first) ────────────
    wiped = wipe_instructor_experiments(instructor.id)
    log.append(f"wiped {wiped} previous experiment(s)")

    db.session.flush()

    # ════════════════════════════════════════════════════════════════════════
    # EXP 1 — Data Structures: Stack (coding) — the FULL kitchen-sink demo
    # ════════════════════════════════════════════════════════════════════════
    exp1 = build_experiment(
        instructor, subj_ds.id, 1,
        title='Stack Implementation using Arrays',
        aim='Implement a fixed-size stack (push/pop/peek) using arrays.',
        theory=(
            "A **stack** is a LIFO data structure supporting push, pop and peek. "
            "Implement it with a plain array and a `top` index."
        ),
        concept_tags=['stacks', 'arrays', 'data-structures'],
        exp_type='mixed', difficulty=2,
        rubric={'test_cases': 50, 'quiz': 20, 'viva': 15, 'code_quality': 15, 'lab_report': 0},
        weightage=15,
    )

    # Page 1 — Overview
    p1 = add_page(exp1, 'Introduction', 1)
    add_module(exp1, p1.id, 'markdown', 'Stack — Study Notes', {
        'md': "# Stack Using Arrays\n\n"
              "## Key operations\n"
              "- **push(x)** — add to top\n"
              "- **pop()** — remove top\n"
              "- **peek()** — view top\n\n"
              "```python\n"
              "def push(stack, top, x):\n"
              "    stack[top] = x\n"
              "    return top + 1\n"
              "```\n\n"
              "A stack is **Last-In-First-Out (LIFO)**."
    }, 1)
    add_module(exp1, p1.id, 'text', 'Theory (HTML)', {
        'html': "<p>A stack can be implemented over an array with a <code>top</code> "
                "index. Push increments it, pop decrements it. Watch for overflow "
                "and underflow.</p><ul><li>Overflow — pushing past capacity</li>"
                "<li>Underflow — popping an empty stack</li></ul>"
    }, 2)
    add_module(exp1, p1.id, 'html', 'Visual (HTML block)', {
        'html': "<div style='padding:14px;border:1px solid #ddd;border-radius:10px'>"
                "<b>Top</b> → [ 42 | 17 | 8 | _ | _ ]<br/>"
                "<i>Capacity = 5, current size = 3</i></div>"
    }, 3)
    add_module(exp1, p1.id, 'link', 'Reference — Python list as stack', {
        'url': 'https://docs.python.org/3/tutorial/datastructures.html',
        'label': 'Python Docs — Using Lists as Stacks',
    }, 4)

    # Page 2 — Code
    p2 = add_page(exp1, 'Code Example', 2)
    add_module(exp1, p2.id, 'code', 'Runnable stack snippet', {
        'code': "class Stack:\n"
                "    def __init__(self, cap):\n"
                "        self.a = [None]*cap\n"
                "        self.top = -1\n"
                "    def push(self, x):\n"
                "        if self.top+1 < len(self.a):\n"
                "            self.top += 1\n"
                "            self.a[self.top] = x\n"
                "        else:\n"
                "            print('overflow')\n"
                "    def pop(self):\n"
                "        if self.top >= 0:\n"
                "            v = self.a[self.top]\n"
                "            self.top -= 1\n"
                "            return v\n"
                "        return None\n"
                "\n"
                "s = Stack(5)\n"
                "for x in [10, 20, 30]:\n"
                "    s.push(x)\n"
                "print(s.pop(), s.pop(), s.pop())",
        'language': 'python', 'stdin': '', 'runnable': True,
    }, 5)

    # Page 3 — Assessment (quiz + assign + viva)
    p3 = add_page(exp1, 'Assessment', 3)

    quiz1 = add_module(exp1, p3.id, 'quiz', 'Stack Pre-lab Quiz', {
        'pass_threshold': 70, 'max_attempts': 3, 'cooldown_minutes': 0,
        'shuffle': True, 'weight': 20,
    }, 6)
    add_quiz_question(quiz1.id, 'Which operation removes the top element?',
                      ['enqueue', 'pop', 'peek', 'insert'], 'B',
                      'pop() removes and returns the top (LIFO).')
    add_quiz_question(quiz1.id, 'A stack follows which ordering discipline?',
                      ['FIFO', 'Random', 'LIFO', 'Priority'], 'C',
                      'Stacks are Last-In-First-Out.')
    add_quiz_question(quiz1.id, 'What is the time complexity of push() on an array stack?',
                      ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], 'A',
                      'With a top index, push is O(1) amortized.')

    assign1 = add_module(exp1, p3.id, 'assign', 'Stack Coding Assignment', {
        'language': 'python', 'pass_threshold': 60, 'time_limit_sec': 5,
        'instructions': "Implement a stack with push/pop/peek. First line is the "
                        "operation count N. Then N lines: `push <x>`, `pop`, `peek`. "
                        "Print the result of each pop/peek, or 'empty' on underflow.",
        'starter_code': "class Stack:\n    def __init__(self):\n        self.a = []\n"
                        "    def push(self, x):\n        self.a.append(x)\n"
                        "    def pop(self):\n        return self.a.pop() if self.a else None\n",
        'test_cases': [
            {'input': '4\npush 5\npush 9\npop\npeek\n',
             'expected': '9\n5\n', 'weight': 1},
            {'input': '3\npush 1\npop\npop\n',
             'expected': '1\nempty\n', 'weight': 1},
            {'input': '2\npeek\npush 7\n',
             'expected': 'empty\n', 'weight': 1, 'hidden': True},
        ],
    }, 7)

    viva1 = add_module(exp1, p3.id, 'viva', 'Stack Viva', {
        'mode': 'topics', 'topics': ['stacks', 'arrays'], 'count': 3,
        'difficulty': 2, 'pass_threshold': 70,
        'questions': [
            {'question': 'What is LIFO and why is a stack LIFO?',
             'expected_answer': 'Last-In-First-Out: the most recently added element is removed first.'},
            {'question': 'How would you detect stack overflow?',
             'expected_answer': 'Compare the top index against capacity before push.'},
            {'question': 'Compare array vs linked-list stack.',
             'expected_answer': 'Array: O(1) access, fixed capacity. Linked: dynamic, extra pointer overhead.'},
        ],
    }, 8)

    # Test cases for the code component
    tc1 = add_test_case(exp1, '4\npush 5\npush 9\npop\npeek\n', '9\n5\n',
                        desc='Basic push/pop/peek')
    tc2 = add_test_case(exp1, '3\npush 1\npop\npop\n', '1\nempty\n',
                        desc='Underflow handling')
    tc3 = add_test_case(exp1, '6\npush 1\npush 2\npush 3\npop\npop\npop\n',
                        '3\n2\n1\n', hidden=True, desc='Reverse order')

    # Checkpoints (SPARK)
    cp1 = add_checkpoint(exp1, 1, 'Push & pop', 'Implement push and pop correctly.',
                         [tc1.id, tc2.id], weight=40, gated=False)
    cp2 = add_checkpoint(exp1, 2, 'Underflow', 'Handle pop on an empty stack.',
                         [tc2.id], weight=30, gated=True)
    cp3 = add_checkpoint(exp1, 3, 'Full sequence', 'Correct LIFO output for mixed ops.',
                         [tc3.id], weight=30, gated=False)

    # ════════════════════════════════════════════════════════════════════════
    # EXP 2 — Data Structures: Linked List (coding, reading content)
    # ════════════════════════════════════════════════════════════════════════
    exp2 = build_experiment(
        instructor, subj_ds.id, 2,
        title='Linked List Traversal',
        aim='Traverse a singly linked list and print its values.',
        theory='A linked list stores nodes with a value and a next pointer. '
               'Traversal walks node → next until null.',
        concept_tags=['linked-lists', 'traversal', 'pointers'],
        exp_type='coding', difficulty=2,
        rubric={'test_cases': 70, 'quiz': 0, 'viva': 10, 'code_quality': 20, 'lab_report': 0},
        weightage=15,
    )

    p2a = add_page(exp2, 'Reading', 1)
    add_module(exp2, p2a.id, 'markdown', 'Linked lists — notes', {
        'md': "# Singly Linked List\n\n"
              "A node has `data` and `next`. To traverse:\n\n"
              "```python\n"
              "def traverse(head):\n"
              "    cur = head\n"
              "    while cur:\n"
              "        print(cur.data)\n"
              "        cur = cur.next\n"
              "```"
    }, 1)
    add_module(exp2, p2a.id, 'text', 'Theory', {
        'html': "<p>A linked list allocates memory per node, so it grows "
                "dynamically — unlike an array with fixed capacity.</p>"
    }, 2)
    p2b = add_page(exp2, 'Assessment', 2)
    assign2 = add_module(exp2, p2b.id, 'assign', 'Traverse linked list', {
        'language': 'python', 'pass_threshold': 60, 'time_limit_sec': 5,
        'instructions': 'Given a head node, print each data value on its own line.',
        'starter_code': "class Node:\n    def __init__(self, data):\n"
                        "        self.data = data\n        self.next = None\n",
        'test_cases': [
            {'input': '1 2 3 4\n', 'expected': '1\n2\n3\n4\n', 'weight': 1},
            {'input': '9\n', 'expected': '9\n', 'weight': 1},
        ],
    }, 3)
    tc4 = add_test_case(exp2, '1 2 3 4\n', '1\n2\n3\n4\n', desc='Basic traverse')
    tc5 = add_test_case(exp2, '9\n', '9\n', hidden=True, desc='Single node')

    # Checkpoints for exp2 (so the LIVE conductor SPARK grid has data)
    add_checkpoint(exp2, 1, 'Build the list', 'Construct the linked list from input.',
                   [tc4.id], weight=50, gated=False)
    add_checkpoint(exp2, 2, 'Traverse & print', 'Print each node value in order.',
                   [tc4.id, tc5.id], weight=50, gated=False)

    # ════════════════════════════════════════════════════════════════════════
    # EXP 3 — Python: List Comprehensions (coding + quiz)
    # ════════════════════════════════════════════════════════════════════════
    exp3 = build_experiment(
        instructor, subj_py.id, 1,
        title='Python List Comprehensions',
        aim='Use list comprehensions to transform and filter sequences.',
        theory='A list comprehension `[expr for x in seq if cond]` builds a new '
               'list concisely and readably.',
        concept_tags=['python', 'list-comprehensions', 'iteration'],
        exp_type='coding', difficulty=1,
        rubric={'test_cases': 60, 'quiz': 0, 'viva': 0, 'code_quality': 40, 'lab_report': 0},
        weightage=10,
    )

    p3a = add_page(exp3, 'Reading', 1)
    add_module(exp3, p3a.id, 'markdown', 'Comprehensions — notes', {
        'md': "# List Comprehensions\n\n"
              "```python\n"
              "squares = [x*x for x in range(10)]\n"
              "evens   = [x for x in range(20) if x % 2 == 0]\n"
              "pairs   = [(x, y) for x in range(3) for y in range(3)]\n"
              "```"
    }, 1)
    add_module(exp3, p3a.id, 'code', 'Quick demo', {
        'code': "nums = [1, 2, 3, 4, 5]\n"
                "print([x*x for x in nums])\n"
                "print([x for x in nums if x % 2 == 1])",
        'language': 'python', 'runnable': True,
    }, 2)
    p3b = add_page(exp3, 'Assessment', 2)
    assign3 = add_module(exp3, p3b.id, 'assign', 'Comprehension practice', {
        'language': 'python', 'pass_threshold': 60, 'time_limit_sec': 5,
        'instructions': 'Given N numbers, print the squares of the even ones, '
                        'one per line.',
        'starter_code': "nums = list(map(int, input().split()))\n",
        'test_cases': [
            {'input': '1 2 3 4\n', 'expected': '4\n16\n', 'weight': 1},
            {'input': '2 4 6\n', 'expected': '4\n16\n36\n', 'weight': 1},
        ],
    }, 3)
    tc6 = add_test_case(exp3, '1 2 3 4\n', '4\n16\n', desc='Squares of evens')
    tc7 = add_test_case(exp3, '2 4 6\n', '4\n16\n36\n', hidden=True, desc='Three evens')

    # Checkpoints for exp3
    add_checkpoint(exp3, 1, 'Read input', 'Parse N numbers from stdin.', [tc6.id], weight=40, gated=False)
    add_checkpoint(exp3, 2, 'Square the evens', 'Output squares of even numbers.', [tc6.id, tc7.id], weight=60, gated=False)

    # ════════════════════════════════════════════════════════════════════════
    # EXP 4 — Python: Quiz-only (quiz_only type)
    # ════════════════════════════════════════════════════════════════════════
    exp4 = build_experiment(
        instructor, subj_py.id, 2,
        title='Python Fundamentals — Concepts Quiz',
        aim='Assess core Python language concepts.',
        theory='Covers variables, types, control flow, functions and exceptions.',
        concept_tags=['python', 'basics', 'functions'],
        exp_type='quiz_only', difficulty=1,
        rubric={'test_cases': 0, 'quiz': 100, 'viva': 0, 'code_quality': 0, 'lab_report': 0},
        weightage=10,
    )

    p4a = add_page(exp4, 'Assessment', 1)
    quiz2 = add_module(exp4, p4a.id, 'quiz', 'Python Fundamentals Quiz', {
        'pass_threshold': 70, 'max_attempts': 3, 'cooldown_minutes': 0,
        'shuffle': True, 'weight': 100,
    }, 1)
    add_quiz_question(quiz2.id, 'Which keyword defines a function in Python?',
                      ['func', 'def', 'function', 'lambda'], 'B',
                      'def defines a function.')
    add_quiz_question(quiz2.id, 'What is the output of `type(3.14)`?',
                      ['<class \'int\'>', '<class \'float\'>', '<class \'str\'>', '<class \'list\'>'], 'B',
                      '3.14 is a float literal.')
    add_quiz_question(quiz2.id, 'Which is a valid dictionary literal?',
                      ['{1: "a"}', '[1, 2]', '(1, 2)', '{1, 2}'], 'A',
                      '{key: value} is a dict literal.')

    db.session.flush()

    # ════════════════════════════════════════════════════════════════════════
    # Sessions
    # ════════════════════════════════════════════════════════════════════════
    s1, _ = _get_or_create(
        LabSession, section_subject_id=ss_ds.id, title='DS Lab 1 — Stacks (completed)',
        defaults=dict(
            institution_id=INST, experiment_id=exp1.id,
            scheduled_at=now - timedelta(days=3, hours=2),
            duration_minutes=120, status='ended',
            started_at=now - timedelta(days=3, hours=2),
            ended_at=now - timedelta(days=3),
            catchup_enabled=True, catchup_deadline=now + timedelta(days=3),
            gate_score_threshold=70, jitsi_room_name=_room('s1'),
            current_mode='ended',
        ),
    )

    s2, _ = _get_or_create(
        LabSession, section_subject_id=ss_ds.id, title='DS Lab 2 — Linked Lists (LIVE)',
        defaults=dict(
            institution_id=INST, experiment_id=exp2.id,
            scheduled_at=now - timedelta(minutes=25),
            duration_minutes=120, status='active',
            started_at=now - timedelta(minutes=25),
            late_join_window_min=30,
            gate_score_threshold=70, jitsi_room_name=_room('s2'),
            current_mode='working',
        ),
    )

    s3, _ = _get_or_create(
        LabSession, section_subject_id=ss_py.id, title='Python Lab 1 — Comprehensions',
        defaults=dict(
            institution_id=INST, experiment_id=exp3.id,
            scheduled_at=now + timedelta(days=1),
            duration_minutes=90, status='scheduled',
            gate_score_threshold=70, jitsi_room_name=_room('s3'),
        ),
    )

    s4, _ = _get_or_create(
        LabSession, section_subject_id=ss_py.id, title='Python Lab 2 — Concepts Quiz',
        defaults=dict(
            institution_id=INST, experiment_id=exp4.id,
            scheduled_at=now + timedelta(days=2),
            duration_minutes=60, status='scheduled',
            gate_score_threshold=70, jitsi_room_name=_room('s4'),
        ),
    )

    # Attendance for S1 (ended) — varied statuses
    for i, sid in enumerate(ds_students[:8]):
        joined = s1.started_at + timedelta(minutes=2)
        att, _ = _get_or_create(
            SessionAttendance, session_id=s1.id, student_id=sid,
            defaults=dict(
                joined_at=joined, left_at=s1.ended_at,
                total_time_seconds=118 * 60, reconnect_count=i % 2,
                status='present' if i % 3 != 2 else 'late',
                is_active_participant=True,
            ),
        )
        att.status = 'present' if i % 3 != 2 else 'late'
        att.total_time_seconds = 118 * 60
        att.joined_at = joined
        att.is_active_participant = True

    # Attendance for S2 (active)
    for i, sid in enumerate(ds_students):
        att, _ = _get_or_create(
            SessionAttendance, session_id=s2.id, student_id=sid,
            defaults=dict(status='absent'),
        )
        if i < len(ds_students) - 2:   # a couple still absent
            att.status = 'present' if i % 4 != 3 else 'late'
            att.joined_at = s2.started_at + timedelta(minutes=(i * 2) % 20)
            att.total_time_seconds = 20 * 60 + i * 60
            att.is_active_participant = i % 2 == 0
            att.reconnect_count = 1 if i % 5 == 0 else 0

    db.session.flush()

    # ════════════════════════════════════════════════════════════════════════
    # Student submissions for analytics
    # ════════════════════════════════════════════════════════════════════════
    exp1_submitters = ds_students[:10] if len(ds_students) >= 10 else ds_students
    exp2_submitters = ds_students[1:9] if len(ds_students) >= 9 else ds_students
    exp3_submitters = py_students[:8] if len(py_students) >= 8 else py_students

    QUALITY_GRADES = ['A', 'B', 'B', 'C', 'C', 'A', 'B', 'D', 'C', 'A']
    FOCUS_LEVELS   = [92, 74, 55, 81, 63, 88, 47, 69, 78, 95]

    def make_submission(student_id, exp, session_id, is_final=True, attempt_n=1,
                        passed=None, total=None, quality='B', submit_dt=None):
        passed = passed if passed is not None else random.randint(1, total or 3)
        total = total or 3
        files = {'main': (
            "# student solution\n"
            f"# {exp.title}\n"
            "class Stack:\n"
            "    def __init__(self):\n"
            "        self.a = []\n"
            "    def push(self, x):\n"
            "        self.a.append(x)\n"
            "    def pop(self):\n"
            "        return self.a.pop() if self.a else None\n"
            f"print('ok {passed}/{total}')\n"
        )}
        dt = submit_dt or (session_id and (LabSession.query.get(session_id).started_at + timedelta(minutes=20)))
        attempt = CodeAttempt(
            student_id=student_id, experiment_id=exp.id, session_id=session_id,
            attempt_number=attempt_n, language='python', files=files, stdin='',
            compile_status='success', compile_output='',
            stdout=f"ok {passed}/{total}\n", stderr='',
            test_cases_passed=passed, test_cases_total=total,
            execution_time_ms=random.randint(15, 220),
            memory_used_kb=random.randint(9000, 18000),
            loc=random.randint(18, 60),
            cyclomatic_complexity=round(random.uniform(2, 7), 1),
            quality_grade=quality,
            is_final_submission=is_final, is_catchup=False,
            submitted_at=dt or datetime.utcnow(),
        )
        db.session.add(attempt)
        db.session.flush()
        # Code version
        db.session.add(CodeVersion(
            student_id=student_id, experiment_id=exp.id, session_id=session_id,
            version_number=attempt_n, files=files, is_full_snapshot=True,
            saved_at=dt or datetime.utcnow(),
            save_type='on_submit' if is_final else 'on_run',
        ))
        return attempt

    # Submissions for S1 (exp1, ended) → grades
    rubric1 = {'test_cases': 50, 'lab_report': 0, 'code_quality': 15, 'viva': 15, 'quiz': 20}
    for i, sid in enumerate(exp1_submitters):
        total = 3
        passed = min(total, max(0, i % 4))        # 0..3 pass distribution
        if i == 0:
            passed = 3
        if i == 9:
            passed = 0
        attempt = make_submission(
            sid, exp1, s1.id, is_final=True, attempt_n=random.randint(2, 5),
            passed=passed, total=total, quality=QUALITY_GRADES[i % len(QUALITY_GRADES)],
            submit_dt=s1.ended_at - timedelta(minutes=random.randint(2, 40)),
        )
        quiz_score = random.choice([40, 60, 80, 90, 100])
        viva_score = random.choice([0, 50, 70, 85, 100])
        quality_score = {'A': 10, 'B': 8, 'C': 6, 'D': 4}[QUALITY_GRADES[i % len(QUALITY_GRADES)]]
        auto = passed / total * 100
        hint_d = random.choice([0, 0, 0, 2, 5])
        final = (auto * 0.5 + quiz_score * 0.2 + viva_score * 0.15 + quality_score * 0.15) - hint_d
        gr = Grade(
            student_id=sid, experiment_id=exp1.id, session_id=s1.id,
            auto_grade=round(auto, 2), quiz_grade=quiz_score,
            viva_grade=viva_score, code_quality_grade=quality_score,
            hint_deduction=hint_d, final_grade=round(max(0, final), 2),
            manual_feedback='Solid attempt. Watch underflow edge case.',
            graded_by=instructor.id,
            graded_at=s1.ended_at + timedelta(hours=random.randint(1, 30)),
        )
        db.session.add(gr)

        # Focus scores for S1
        for _ in range(6):
            db.session.add(FocusScore(
                student_id=sid, session_id=s1.id,
                signals={
                    'tab_switches_per_min': random.randint(0, 3),
                    'idle_seconds': random.randint(0, 60),
                    'typing_speed_wpm': random.randint(20, 70),
                    'backspace_ratio': round(random.uniform(0, 0.4), 2),
                    'copy_paste_count': random.randint(0, 3),
                    'window_focus_ratio': round(random.uniform(0.4, 1.0), 2),
                },
                focus_score=FOCUS_LEVELS[i % len(FOCUS_LEVELS)],
                recorded_at=s1.started_at + timedelta(minutes=random.randint(2, 115)),
            ))
        # Hint logs
        if i % 3 == 0:
            db.session.add(HintLog(
                student_id=sid, experiment_id=exp1.id, session_id=s1.id,
                hint_level=random.choice([1, 2, 3]),
                prompt_sent='student asked for a hint on pop()',
                response_received='Check whether the stack is empty before popping.',
                model_used='llama-3.3-70b-versatile', latency_ms=random.randint(400, 900),
                is_fallback=False,
            ))
        # Concept mastery
        for concept, score in [('stacks', random.randint(30, 95)),
                               ('arrays', random.randint(30, 95))]:
            _get_or_create(
                ConceptMastery, student_id=sid, concept=concept,
                defaults=dict(institution_id=INST, mastery_score=score,
                              experiment_count=1),
            )
        # Checkpoint progress on S1 for exp1 checkpoints
        for cp in (cp1, cp2, cp3):
            status = 'verified' if passed >= cp.order else ('failed' if passed > 0 else 'pending')
            if cp.order == 2 and passed == 3:
                status = 'verified'
            _get_or_create(
                CheckpointProgress, session_id=s1.id, student_id=sid, checkpoint_id=cp.id,
                defaults=dict(status=status, passed_at=s1.ended_at if status in ('verified', 'failed') else None,
                              attempts=random.randint(1, 4), last_signal_at=s1.ended_at),
            )

    # Submissions for S2 (exp2, active) — some in progress
    for i, sid in enumerate(exp2_submitters):
        passed = 1 if i % 2 else 2
        make_submission(
            sid, exp2, s2.id, is_final=i % 3 == 0, attempt_n=i + 1,
            passed=passed, total=2,
            quality=QUALITY_GRADES[(i + 1) % len(QUALITY_GRADES)],
            submit_dt=s2.started_at + timedelta(minutes=random.randint(1, 22)),
        )
        for _ in range(3):
            db.session.add(FocusScore(
                student_id=sid, session_id=s2.id,
                signals={'tab_switches_per_min': random.randint(0, 2),
                         'idle_seconds': random.randint(0, 40),
                         'typing_speed_wpm': random.randint(25, 75),
                         'backspace_ratio': round(random.uniform(0, 0.35), 2),
                         'copy_paste_count': random.randint(0, 2),
                         'window_focus_ratio': round(random.uniform(0.5, 1.0), 2)},
                focus_score=FOCUS_LEVELS[(i + 1) % len(FOCUS_LEVELS)],
                recorded_at=s2.started_at + timedelta(minutes=random.randint(1, 24)),
            ))
        # A few proctor events for integrity analytics
        if i % 3 == 0:
            db.session.add(ProctorEvent(
                institution_id=INST, session_id=s2.id, student_id=sid,
                event_type='tab_switch', payload={'count': random.randint(1, 4)},
                severity='medium' if i % 6 else 'high',
            ))
        if i % 5 == 0:
            db.session.add(ProctorEvent(
                institution_id=INST, session_id=s2.id, student_id=sid,
                event_type='fullscreen_exit', payload={}, severity='high',
            ))
        # Checkpoint progress on S2 for exp2 checkpoints (reuse tc4/tc5)
        cp_exp2 = Checkpoint.query.filter_by(experiment_id=exp2.id).all()
        for c in cp_exp2:
            _get_or_create(
                CheckpointProgress, session_id=s2.id, student_id=sid, checkpoint_id=c.id,
                defaults=dict(status=('verified' if passed == 2 else 'claimed'),
                              attempts=random.randint(1, 3), last_signal_at=datetime.utcnow()),
            )

    # Submissions for exp3 (scheduled, but graded via prelab assignment)
    for i, sid in enumerate(exp3_submitters):
        total = 2
        passed = 1 if i % 2 else 2
        make_submission(
            sid, exp3, None, is_final=True, attempt_n=i + 1,
            passed=passed, total=total,
            quality=QUALITY_GRADES[(i + 2) % len(QUALITY_GRADES)],
            submit_dt=now - timedelta(days=1),
        )
        # ContentProgress for the assign/quiz modules of exp3
        for m in ContentModule.query.filter_by(experiment_id=exp3.id).all():
            _get_or_create(
                ContentProgress, student_id=sid, module_id=m.id,
                defaults=dict(completed=True, score=random.choice([40, 60, 80, 100]),
                              attempts=random.randint(1, 3),
                              completed_at=now - timedelta(days=1)),
            )

    # Plagiarism flag pair (for integrity cluster view)
    if len(exp1_submitters) >= 2:
        a, b = exp1_submitters[0], exp1_submitters[3]
        _get_or_create(
            PlagiarismFlag, student_a_id=a, student_b_id=b, experiment_id=exp1.id,
            defaults=dict(institution_id=INST, session_id=s1.id,
                          similarity_pct=88.0, status='pending'),
        )

    # StudentRanking per section-subject
    for idx, sid in enumerate(all_students):
        _get_or_create(
            StudentRanking, student_id=sid, section_subject_id=ss_ds.id,
            defaults=dict(institution_id=INST,
                          mastery_score=random.randint(40, 95),
                          engagement_score=random.randint(40, 95),
                          effort_score=random.randint(40, 95),
                          efficiency_score=random.randint(40, 95),
                          consistency_score=random.randint(40, 95),
                          rank_score=random.randint(40, 95),
                          rank_position=idx + 1),
        )

    db.session.commit()

    log.append(
        f"4 experiments: {exp1.title} (mixed, {exp1.rubric_quiz}% quiz), "
        f"{exp2.title}, {exp3.title}, {exp4.title} (quiz_only)"
    )
    log.append(f"4 sessions: S1 ended, S2 LIVE, S3/S4 scheduled")
    log.append(f"submissions: exp1×{len(exp1_submitters)}, exp2×{len(exp2_submitters)}, exp3×{len(exp3_submitters)} students")
    log.append(f"students seeded: {len(all_students)}")
    return log


with create_app().app_context():
    for line in seed():
        print(f"[seed-full-demo] {line}")
    print("[seed-full-demo] done.")
