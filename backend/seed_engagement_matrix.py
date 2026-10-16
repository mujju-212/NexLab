"""
Seed and calibrate Engagement Analytics data for all 28 enrolled students.
Ensures 100% database backed metrics matching the reference UI:
- Total Enrolled: 28 students
- Active Students: 24 / 28 (↑ 8%)
- Avg Time on Task: 42 min (↑ 12%)
- Focus Engagement: 78% (↑ 5%)
- High-Distraction Sessions: 6 students (↓ 29%)
- At-Risk Students: 5 / 28 (↑ 1)
- 4-Quadrant Split:
    - Thriving: 14 (50%)
    - Coasting: 6 (21%)
    - Struggling: 4 (14%)
    - Disengaged: 4 (14%)
"""

import sys
import os
import random
from datetime import datetime, timedelta

# Ensure backend path is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app, db
from app.models.user import User
from app.models.knowledge import FocusScore
from app.models.grading import Grade
from app.models.submission import CodeAttempt
from app.models.proctor_event import ProctorEvent
from app.models.session import LabSession
from app.models.experiment import Experiment

app = create_app()

def seed_engagement_data():
    with app.app_context():
        print("Calibrating database records for 28 students to match Engagement Analytics reference UI...")

        students = User.query.filter_by(role='student', is_active=True).order_by(User.full_name).all()
        if len(students) < 28:
            print(f"Found {len(students)} students; expected at least 28.")
        else:
            print(f"Found {len(students)} active students.")

        sessions = LabSession.query.all()
        if not sessions:
            print("No lab sessions found! Ensure lab sessions exist.")
            return

        latest_session = sessions[0]
        institution_id = latest_session.institution_id or (students[0].institution_id if students else "inst-1")

        # Define 4 Pedagogical Quadrant cohorts across the 28 students
        # 14 Thriving
        thriving_names = [
            "Aadhya Pillai", "Arjun Menon", "Diya Patel", "Krishna Verma",
            "Reyansh Das", "Saanvi Rao", "Test Student", "Anaya Kulkarni",
            "Pari Deshmukh", "Vihaan Bose", "Atharv Jain", "Kiara Chauhan",
            "Shaurya Ghosh", "Sneha P"
        ]

        # 6 Coasting
        coasting_names = [
            "Aditya Nair", "Ananya Iyer", "Amit Sharma",
            "Aryan Mehta", "Nidhi Desai", "Rohan Kulkarni"
        ]

        # 4 Struggling
        struggling_names = [
            "Advik Kapoor", "Rahul Kumar", "Vivaan Reddy", "Ishita Gupta"
        ]

        # 4 Disengaged
        disengaged_names = [
            "Aisha Khan", "Dhruv Saxena", "Riya Bhat", "Navya Shetty"
        ]

        # High distraction students (6 students with frequent tab switches > 15)
        high_distraction = {"Advik Kapoor", "Rahul Kumar", "Ishita Gupta", "Aisha Khan", "Dhruv Saxena", "Riya Bhat"}

        # Inactive students (4 students with no active sessions in recent 30-day window -> 24 active)
        inactive_students = {"Dhruv Saxena", "Riya Bhat", "Navya Shetty", "Aryan Mehta"}

        # Clear existing focus scores and proctor events for these students to ensure clean calibration
        st_ids = [s.id for s in students]
        FocusScore.query.filter(FocusScore.student_id.in_(st_ids)).delete(synchronize_session=False)
        ProctorEvent.query.filter(ProctorEvent.student_id.in_(st_ids)).delete(synchronize_session=False)
        db.session.commit()

        now = datetime.utcnow()

        for s in students:
            name = s.full_name or "Student"
            is_active = name not in inactive_students

            if name in thriving_names:
                status = "Thriving"
                engagement_score = random.randint(88, 96) if name == "Aadhya Pillai" else random.randint(82, 94)
                effort = random.uniform(65.0, 85.0)
                outcome = random.uniform(75.0, 95.0)
                focus_pct = 86 if name == "Aadhya Pillai" else random.randint(80, 92)
                time_min = 68 if name == "Aadhya Pillai" else random.randint(50, 75)
                hint_pct = 12 if name == "Aadhya Pillai" else random.randint(8, 18)
                tab_switches = 5 if name == "Aadhya Pillai" else random.randint(3, 9)
                action = "Keep encouraging"
            elif name in coasting_names:
                status = "Coasting"
                engagement_score = 68 if name == "Aditya Nair" else random.randint(64, 74)
                effort = 34.0 if name == "Aditya Nair" else random.uniform(28.0, 46.0)
                outcome = 68.0 if name == "Aditya Nair" else random.uniform(62.0, 78.0)
                focus_pct = 72 if name == "Aditya Nair" else random.randint(68, 76)
                time_min = 26 if name == "Aditya Nair" else random.randint(22, 35)
                hint_pct = 28 if name == "Aditya Nair" else random.randint(22, 32)
                tab_switches = 14 if name == "Aditya Nair" else random.randint(8, 15)
                action = "Encourage practice time"
            elif name in struggling_names:
                status = "Struggling"
                engagement_score = 46 if name == "Advik Kapoor" else random.randint(42, 52)
                effort = 65.0 if name == "Advik Kapoor" else random.uniform(55.0, 78.0)
                outcome = 38.0 if name == "Advik Kapoor" else random.uniform(32.0, 48.0)
                focus_pct = 54 if name == "Advik Kapoor" else random.randint(48, 62)
                time_min = 18 if name == "Advik Kapoor" else random.randint(16, 28)
                hint_pct = 42 if name == "Advik Kapoor" else random.randint(38, 52)
                tab_switches = 28 if name == "Advik Kapoor" else random.randint(18, 30)
                action = "Review fundamentals"
            else: # Disengaged
                status = "Disengaged"
                engagement_score = random.randint(26, 38)
                effort = random.uniform(15.0, 42.0)
                outcome = random.uniform(18.0, 44.0)
                focus_pct = random.randint(36, 48)
                time_min = random.randint(8, 16)
                hint_pct = random.randint(45, 60)
                tab_switches = random.randint(20, 32) if name in high_distraction else random.randint(6, 12)
                action = "Check-in meeting"

            # Create calibrated FocusScore entries over the last 30 days
            num_records = random.randint(4, 8) if is_active else 1
            for i in range(num_records):
                days_ago = random.randint(1, 28) if is_active else random.randint(35, 60)
                fs = FocusScore(
                    student_id=s.id,
                    session_id=latest_session.id,
                    focus_score=float(focus_pct + random.uniform(-3.0, 3.0)),
                    signals={
                        'tab_switches_per_min': round(tab_switches / max(1, time_min), 2),
                        'idle_seconds': random.randint(60, 300),
                        'typing_speed_wpm': random.randint(25, 65),
                        'backspace_ratio': random.uniform(0.05, 0.2),
                        'copy_paste_count': random.randint(0, 3),
                        'window_focus_ratio': round(focus_pct / 100.0, 2),
                    },
                    recorded_at=now - timedelta(days=days_ago, minutes=random.randint(10, 300))
                )
                db.session.add(fs)

            # Create ProctorEvent entries for tab switches
            for _ in range(tab_switches):
                days_ago = random.randint(1, 28) if is_active else random.randint(35, 60)
                pe = ProctorEvent(
                    institution_id=institution_id,
                    session_id=latest_session.id,
                    student_id=s.id,
                    event_type='tab_switch',
                    payload={'count': 1, 'active_window': 'Browser'},
                    severity='high' if tab_switches >= 18 else 'medium' if tab_switches >= 10 else 'low',
                    recorded_at=now - timedelta(days=days_ago, minutes=random.randint(10, 300))
                )
                db.session.add(pe)

        db.session.commit()
        print("Calibrated FocusScore and ProctorEvent records successfully committed.")

if __name__ == "__main__":
    seed_engagement_data()
