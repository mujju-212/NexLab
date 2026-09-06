import sys
import os
import random
from datetime import datetime, timedelta

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.session import LabSession, SessionAttendance
from app.models.academic import SectionSubject, SectionStudent, Section
from app.models.user import User
from app.models.experiment import Experiment
from app.models.conductor import Checkpoint, CheckpointProgress, LivePageState, ChatMessage
from app.models.knowledge import FocusScore
from app.models.proctor_event import ProctorEvent
from app.models.submission import CodeAttempt, CodeVersion

app = create_app()

def seed_conductor_data():
    with app.app_context():
        print("=== Seeding Live Conductor Data ===")

        # 1. Fetch sessions
        sessions = LabSession.query.all()
        if not sessions:
            print("No sessions found in database.")
            return

        for sess in sessions:
            print(f"\nProcessing Session: [{sess.id}] - {sess.title}")

            # Ensure Experiment has Checkpoints
            if sess.experiment_id:
                exp = Experiment.query.get(sess.experiment_id)
                if exp:
                    cps = Checkpoint.query.filter_by(experiment_id=exp.id).order_by(Checkpoint.order).all()
                    if not cps:
                        print(f"   Creating default checkpoints for Experiment '{exp.title}'...")
                        cp_titles = [
                            "CP1: Environment Setup & Warmup",
                            "CP2: Core Logic Implementation",
                            "CP3: Unit Test Verification",
                            "CP4: Performance & Submission"
                        ]
                        cps = []
                        for idx, title in enumerate(cp_titles, start=1):
                            cp = Checkpoint(
                                experiment_id=exp.id,
                                order=idx,
                                title=title,
                                description=f"Checkpoint {idx} description for {exp.title}"
                            )
                            db.session.add(cp)
                            cps.append(cp)
                        db.session.flush()

            # Ensure LivePageState exists
            lps = LivePageState.query.filter_by(session_id=sess.id).first()
            if not lps:
                lps = LivePageState(session_id=sess.id, updated_by="system")
                db.session.add(lps)
                db.session.flush()

            # Get enrolled students for this session's section
            sec_sub = SectionSubject.query.get(sess.section_subject_id) if sess.section_subject_id else None
            if not sec_sub:
                continue

            sec_students = SectionStudent.query.filter_by(section_id=sec_sub.section_id).all()
            student_ids = [s.student_id for s in sec_students]
            students = User.query.filter(User.id.in_(student_ids)).all()

            print(f"   Found {len(students)} enrolled students for this session.")

            cps = Checkpoint.query.filter_by(experiment_id=sess.experiment_id).order_by(Checkpoint.order).all() if sess.experiment_id else []

            # Populate student live state & proctoring metrics
            for idx, student in enumerate(students):
                sid = student.id

                # A. Session Attendance
                att = SessionAttendance.query.filter_by(session_id=sess.id, student_id=sid).first()
                if not att:
                    att = SessionAttendance(
                        session_id=sess.id,
                        student_id=sid,
                        status="joined",
                        joined_at=datetime.utcnow() - timedelta(minutes=random.randint(15, 45)),
                        total_time_seconds=random.randint(900, 2700)
                    )
                    db.session.add(att)
                else:
                    att.status = "joined"

                # B. Focus Scores (create recent timeline)
                # Assign 2 students low focus (<60) to trigger Low Focus counter
                if idx in (1, 5):
                    base_focus = random.randint(35, 55)
                else:
                    base_focus = random.randint(75, 98)

                for m in range(5, 0, -1):
                    fs_score = max(20, min(100, base_focus + random.randint(-8, 8)))
                    fs = FocusScore(
                        session_id=sess.id,
                        student_id=sid,
                        focus_score=fs_score,
                        recorded_at=datetime.utcnow() - timedelta(minutes=m * 2)
                    )
                    db.session.add(fs)

                # C. Checkpoint Progress
                if cps:
                    for cp_idx, cp in enumerate(cps):
                        prog = CheckpointProgress.query.filter_by(
                            session_id=sess.id, student_id=sid, checkpoint_id=cp.id
                        ).first()

                        if not prog:
                            if cp_idx < (idx % len(cps)) + 1:
                                status_val = "verified" if cp_idx < 2 else "manual_pass"
                                passed_time = datetime.utcnow() - timedelta(minutes=random.randint(5, 20))
                            elif cp_idx == (idx % len(cps)) + 1:
                                status_val = "in_progress"
                                passed_time = None
                            else:
                                status_val = "pending"
                                passed_time = None

                            prog = CheckpointProgress(
                                session_id=sess.id,
                                student_id=sid,
                                checkpoint_id=cp.id,
                                status=status_val,
                                passed_at=passed_time,
                                last_signal_at=datetime.utcnow()
                            )
                            db.session.add(prog)

                # D. Proctor Events (Tab switches, Fullscreen exit, Copy/Paste)
                if idx in (1, 3, 5, 8):  # add proctor events for distracted students
                    for _ in range(random.randint(2, 5)):
                        ev_type = random.choice(["tab_switch", "fullscreen_exit", "copy_paste", "lockdown_violation"])
                        pe = ProctorEvent(
                            institution_id=student.institution_id or "default-inst-id",
                            session_id=sess.id,
                            student_id=sid,
                            event_type=ev_type,
                            payload={"detail": f"Detected {ev_type.replace('_', ' ')} during active session"},
                            severity="high" if ev_type in ("fullscreen_exit", "lockdown_violation") else "medium",
                            recorded_at=datetime.utcnow() - timedelta(minutes=random.randint(1, 20))
                        )
                        db.session.add(pe)

                # E. Code Attempts & Code Versions
                if sess.experiment_id:
                    attempt = CodeAttempt(
                        session_id=sess.id,
                        experiment_id=sess.experiment_id,
                        student_id=sid,
                        attempt_number=1,
                        language="python",
                        files={"main.py": f"# Solution by {student.full_name}\nprint('Solving lab problem...')"},
                        test_cases_passed=random.randint(3, 5),
                        test_cases_total=5,
                        is_final_submission=(idx % 2 == 0),
                        submitted_at=datetime.utcnow() - timedelta(minutes=random.randint(2, 15))
                    )
                    db.session.add(attempt)

                    code_ver = CodeVersion(
                        session_id=sess.id,
                        experiment_id=sess.experiment_id,
                        student_id=sid,
                        version_number=1,
                        files={
                            "main.py": f"# Solution by {student.full_name}\ndef solve():\n    print('Executing Python Lab Solution...')\n\nsolve()\n"
                        },
                        save_type="auto_save",
                        saved_at=datetime.utcnow() - timedelta(minutes=2)
                    )
                    db.session.add(code_ver)

            # F. Chat Messages
            if students and sec_sub.instructor_id:
                chat1 = ChatMessage(
                    session_id=sess.id,
                    from_id=sec_sub.instructor_id,
                    to_id=None,
                    text="Welcome to the live lab session! Please complete Checkpoint 1.",
                    at=datetime.utcnow() - timedelta(minutes=30)
                )
                chat2 = ChatMessage(
                    session_id=sess.id,
                    from_id=students[0].id,
                    to_id=sec_sub.instructor_id,
                    text="Instructor, I have completed CP1 and started CP2.",
                    at=datetime.utcnow() - timedelta(minutes=15)
                )
                db.session.add(chat1)
                db.session.add(chat2)

        db.session.commit()
        print("\n=== Successfully seeded Live Conductor data for all sessions! ===")

if __name__ == "__main__":
    seed_conductor_data()
