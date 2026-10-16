"""
Exact database seeder for Integrity Analytics matching user UI specifications.
Inserts/updates real SQLite records in dev.db for:
- 6 Students (Aadhya Pillai, Aditya Nair, Ananya Iyer, Rahul Kumar, Diya Patel, Karan Mehta)
- Experiments (Exp 1: Arrays, Exp 2: Trees, Exp 3: DP, Exp 4: Graphs, Exp 1: Stacks)
- PlagiarismFlags for the exact plagiarism pairs
- ProctorEvents for violation timelines & review queue
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(__file__))))

import uuid
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.academic import AcademicYear, Batch, Department, Section, SectionStudent, SectionSubject
from app.models.experiment import Experiment
from app.models.session import LabSession
from app.models.proctor_event import ProctorEvent
from app.models.feedback import PlagiarismFlag
from app.models.submission import CodeAttempt

app = create_app()

with app.app_context():
    inst = Institution.query.first()
    if not inst:
        inst = Institution(id="inst-test-001", name="NexLab Institute of Technology", slug="nexlab-tech")
        db.session.add(inst)
        db.session.commit()
    inst_id = inst.id

    print(f"Targeting institution: {inst_id} ({inst.name})")

    # 1. Ensure or update Department & Section
    dept = Department.query.filter_by(institution_id=inst_id).first()
    if not dept:
        dept = Department(name="Computer Science & Engineering", code="CSE", institution_id=inst_id)
        db.session.add(dept)
        db.session.commit()

    sec = Section.query.filter_by(institution_id=inst_id).first()
    if not sec:
        batch = Batch.query.filter_by(institution_id=inst_id).first()
        if not batch:
            ay = AcademicYear.query.filter_by(institution_id=inst_id).first()
            if not ay:
                ay = AcademicYear(institution_id=inst_id, year_label="2024-2025")
                db.session.add(ay)
                db.session.commit()
            batch = Batch(institution_id=inst_id, year_id=ay.id, name="CSE 2024", program="B.Tech")
            db.session.add(batch)
            db.session.commit()
        sec = Section(name="A", section_code="DSA-A", institution_id=inst_id, batch_id=batch.id)
        db.session.add(sec)
        db.session.commit()

    # 2. Experiments
    template_exp = Experiment.query.filter_by(institution_id=inst_id).first()
    exp_specs = [
        ("Exp 1: Arrays", "Arrays & String Manipulation", 1),
        ("Exp 2: Trees", "Binary Search Trees & Balancing", 2),
        ("Exp 3: DP", "Dynamic Programming & Memoization", 3),
        ("Exp 4: Graphs", "Graph Traversal & Shortest Path", 2),
        ("Exp 1: Stacks", "Stack Operations & Applications", 1),
    ]
    exp_map = {}
    for idx, (title, aim, diff) in enumerate(exp_specs, start=1):
        exp = Experiment.query.filter_by(title=title).first()
        if not exp:
            exp = Experiment(
                id=str(uuid.uuid4()),
                institution_id=inst_id,
                subject_id=template_exp.subject_id if template_exp else "sub-test-001",
                instructor_id=template_exp.instructor_id if template_exp else "user-inst-001",
                exp_number=idx,
                title=title,
                aim=aim,
                difficulty_level=diff,
                allowed_languages=["python"]
            )
            db.session.add(exp)
            db.session.commit()
        exp_map[title] = exp

    # 3. LabSession
    sess = LabSession.query.first()
    if not sess:
        sess = LabSession(
            id=str(uuid.uuid4()),
            institution_id=inst_id,
            title="DSA Proctored Lab Session",
            status="completed"
        )
        db.session.add(sess)
        db.session.commit()

    # 4. Students
    student_specs = [
        {"name": "Aadhya Pillai", "roll": "NDU2024012", "email": "aadhya.pillai@nexlab.edu"},
        {"name": "Aditya Nair", "roll": "NDU2024005", "email": "aditya.nair@nexlab.edu"},
        {"name": "Ananya Iyer", "roll": "NDU2024004", "email": "ananya.iyer@nexlab.edu"},
        {"name": "Rahul Kumar", "roll": "NDU2024007", "email": "rahul.kumar@nexlab.edu"},
        {"name": "Diya Patel", "roll": "NDU2024011", "email": "diya.patel@nexlab.edu"},
        {"name": "Karan Mehta", "roll": "NDU2024015", "email": "karan.mehta@nexlab.edu"},
    ]

    student_map = {}
    for spec in student_specs:
        u = User.query.filter((User.full_name == spec["name"]) | (User.email == spec["email"])).first()
        if not u:
            u = User(
                id=str(uuid.uuid4()),
                full_name=spec["name"],
                email=spec["email"],
                roll_number=spec["roll"],
                role="student",
                institution_id=inst_id,
                password_hash=generate_password_hash("Student@123"),
                is_active=True
            )
            db.session.add(u)
        else:
            u.full_name = spec["name"]
            u.roll_number = spec["roll"]
            u.institution_id = inst_id
        db.session.commit()
        student_map[spec["name"]] = u

        # Enroll in section
        ss = SectionStudent.query.filter_by(section_id=sec.id, student_id=u.id).first()
        if not ss:
            ss = SectionStudent(section_id=sec.id, student_id=u.id)
            db.session.add(ss)
    db.session.commit()

    # 5. PlagiarismFlags
    # Remove existing flags between these students to prevent duplicates
    PlagiarismFlag.query.filter(
        PlagiarismFlag.student_a_id.in_([u.id for u in student_map.values()])
    ).delete(synchronize_session=False)
    db.session.commit()

    plag_specs = [
        {
            "a": "Aadhya Pillai",
            "b": "Aditya Nair",
            "exp": "Exp 2: Trees",
            "pct": 78.0,
            "status": "needs_review",
            "date": datetime(2024, 4, 27, 14, 30),
            "notes": "78% similarity with Aditya Nair (1 code block in inorder traversal)"
        },
        {
            "a": "Rahul Kumar",
            "b": "Diya Patel",
            "exp": "Exp 3: DP",
            "pct": 64.0,
            "status": "under_review",
            "date": datetime(2024, 4, 26, 11, 15),
            "notes": "64% similarity in knapsack state transition logic"
        },
        {
            "a": "Ananya Iyer",
            "b": "Karan Mehta",
            "exp": "Exp 1: Arrays",
            "pct": 58.0,
            "status": "low_priority",
            "date": datetime(2024, 4, 25, 16, 45),
            "notes": "58% similarity in two-pointer helper utility"
        },
    ]

    for p in plag_specs:
        flag = PlagiarismFlag(
            id=str(uuid.uuid4()),
            institution_id=inst_id,
            experiment_id=exp_map[p["exp"]].id,
            session_id=sess.id,
            student_a_id=student_map[p["a"]].id,
            student_b_id=student_map[p["b"]].id,
            similarity_pct=p["pct"],
            status=p["status"],
            detected_at=p["date"],
            review_notes=p["notes"]
        )
        db.session.add(flag)
    db.session.commit()

    # 6. ProctorEvents for Timeline & Queue
    ProctorEvent.query.filter(
        ProctorEvent.student_id.in_([u.id for u in student_map.values()])
    ).delete(synchronize_session=False)
    db.session.commit()

    events_data = [
        # Aadhya Pillai:
        {
            "student": "Aadhya Pillai",
            "type": "tab_switch",
            "sev": "medium",
            "date": datetime(2024, 4, 28, 10, 42),
            "payload": {
                "details": "Switched to another application (2 switches in 1 min)",
                "session_time": "08:30 – 09:00 AM",
                "experiment_title": "Exp 1: Arrays",
                "section": "DSA Section A"
            }
        },
        {
            "student": "Aadhya Pillai",
            "type": "fullscreen_exit",
            "sev": "low",
            "date": datetime(2024, 4, 28, 10, 38),
            "payload": {
                "details": "Exited fullscreen mode (1 occurrence)",
                "session_time": "08:30 – 09:00 AM",
                "experiment_title": "Exp 1: Arrays",
                "section": "DSA Section A"
            }
        },
        {
            "student": "Aadhya Pillai",
            "type": "unusual_code_pattern",
            "sev": "info",
            "date": datetime(2024, 4, 25, 9, 12),
            "payload": {
                "details": "Unusually fast submission after long inactivity (z-score 2.8)",
                "experiment_title": "Exp 1: Arrays",
                "section": "DSA Section A"
            }
        },
        # Aditya Nair:
        {
            "student": "Aditya Nair",
            "type": "code_anomaly",
            "sev": "medium",
            "date": datetime(2024, 4, 28, 10, 16),
            "payload": {
                "details": "Instant leap from 0/10 to 10/10 test cases without incremental execution",
                "experiment_title": "Exp 2: Trees",
                "section": "Core CS"
            }
        },
        # Ananya Iyer:
        {
            "student": "Ananya Iyer",
            "type": "fullscreen_exit",
            "sev": "low",
            "date": datetime(2024, 4, 27, 16, 32),
            "payload": {
                "details": "Exited fullscreen window during assessment",
                "experiment_title": "Exp 3: DP",
                "section": "Algorithms"
            }
        },
        # Diya Patel:
        {
            "student": "Diya Patel",
            "type": "code_anomaly",
            "sev": "medium",
            "date": datetime(2024, 4, 27, 13, 18),
            "payload": {
                "details": "Large paste block (84 lines) inserted into editor buffer",
                "experiment_title": "Exp 4: Graphs",
                "section": "Programming"
            }
        },
        {
            "student": "Diya Patel",
            "type": "tab_switch",
            "sev": "low",
            "date": datetime(2024, 4, 27, 13, 14),
            "payload": {
                "details": "Brief window blur (4 seconds)",
                "experiment_title": "Exp 4: Graphs",
                "section": "Programming"
            }
        },
    ]

    for ed in events_data:
        pe = ProctorEvent(
            id=str(uuid.uuid4()),
            institution_id=inst_id,
            session_id=sess.id,
            student_id=student_map[ed["student"]].id,
            event_type=ed["type"],
            severity=ed["sev"],
            payload=ed["payload"],
            recorded_at=ed["date"]
        )
        db.session.add(pe)
    db.session.commit()

    print("Successfully seeded exact integrity dataset into dev.db!")
