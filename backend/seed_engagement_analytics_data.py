"""
Seed script to establish realistic Engagement telemetry for Greenwood Institute (inst-test-001).
Ensures:
- 7 departments exist with proper names matching UI mockup
- 6 specific low-engagement students exist with their exact departments and roll numbers
- LabSessions and SessionAttendance distributed across days/hours (matching heatmap and trend)
- Proctor events for behavioral focus scores
"""
import uuid
import random
from datetime import datetime, timedelta, time
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.academic import Department, Section, Batch, SectionStudent, SectionSubject, AcademicYear
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.session import LabSession, SessionAttendance
from app.models.proctor_event import ProctorEvent


def seed_engagement_data():
    app = create_app()
    with app.app_context():
        iid = 'inst-test-001'
        print(f"Aligning engagement telemetry for Greenwood Institute ({iid})...")

        # 1. Departments mapping
        dept_configs = [
            {'name': 'Computer Science', 'code': 'CS', 'color': '#7c3aed'},
            {'name': 'Electronics & Comm', 'code': 'ECE', 'color': '#0284c7'},
            {'name': 'Information Technology', 'code': 'IT', 'color': '#059669'},
            {'name': 'Mechanical Engineering', 'code': 'ME', 'color': '#ea580c'},
            {'name': 'Civil Engineering', 'code': 'CIVIL', 'color': '#b45309'},
            {'name': 'Electrical Engineering', 'code': 'EE', 'color': '#4f46e5'},
            {'name': 'Mathematics & Science', 'code': 'MATH', 'color': '#9333ea'},
        ]

        dept_map = {}
        for cfg in dept_configs:
            # Check by code or name
            dept = Department.query.filter(
                Department.institution_id == iid,
                (Department.name == cfg['name']) | (Department.code == cfg['code'])
            ).first()
            if not dept:
                # Check for similar existing names like 'Computer Science & Engineering'
                if cfg['code'] == 'CS':
                    dept = Department.query.filter_by(institution_id=iid, code='CSE').first()
                elif cfg['code'] == 'ECE':
                    dept = Department.query.filter_by(institution_id=iid, code='ECE').first()
                elif cfg['code'] == 'ME':
                    dept = Department.query.filter_by(institution_id=iid, code='ME').first()

            if not dept:
                dept = Department(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    name=cfg['name'],
                    code=cfg['code'],
                    color=cfg['color'],
                    is_active=True,
                )
                db.session.add(dept)
                db.session.flush()
                print(f"Created department: {cfg['name']}")
            else:
                dept.name = cfg['name']
                dept.code = cfg['code']
                dept.color = cfg['color']
            dept_map[cfg['name']] = dept

        db.session.commit()

        # 2. Key Students
        target_students = [
            {
                'name': 'Aarav Mehta',
                'roll': 'STU2024001',
                'dept': 'Computer Science',
                'email': 'aarav.mehta@greenwood.edu',
                'status': 'Dormant',
                'focus': 42.1,
                'rate': 12.5,
                'days_ago': 8,
            },
            {
                'name': 'Diya Sharma',
                'roll': 'STU2024015',
                'dept': 'Electronics & Comm',
                'email': 'diya.sharma@greenwood.edu',
                'status': 'Dormant',
                'focus': 48.6,
                'rate': 18.3,
                'days_ago': 6,
            },
            {
                'name': 'Rohan Verma',
                'roll': 'STU2024023',
                'dept': 'Information Technology',
                'email': 'rohan.verma@greenwood.edu',
                'status': 'At Risk',
                'focus': 52.4,
                'rate': 25.1,
                'days_ago': 5,
            },
            {
                'name': 'Sneha Iyer',
                'roll': 'STU2024041',
                'dept': 'Mechanical Engineering',
                'email': 'sneha.iyer@greenwood.edu',
                'status': 'At Risk',
                'focus': 55.1,
                'rate': 28.4,
                'days_ago': 4,
            },
            {
                'name': 'Karan Patel',
                'roll': 'STU2024055',
                'dept': 'Civil Engineering',
                'email': 'karan.patel@greenwood.edu',
                'status': 'Watch',
                'focus': 61.3,
                'rate': 31.2,
                'days_ago': 3,
            },
            {
                'name': 'Meera Nair',
                'roll': 'STU2024062',
                'dept': 'Electrical Engineering',
                'email': 'meera.nair@greenwood.edu',
                'status': 'Watch',
                'focus': 63.7,
                'rate': 33.5,
                'days_ago': 3,
            },
        ]

        target_uids = []
        for ts in target_students:
            u = User.query.filter_by(institution_id=iid, full_name=ts['name']).first()
            dept_obj = dept_map.get(ts['dept'])
            if not u:
                u = User(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    email=ts['email'],
                    full_name=ts['name'],
                    roll_number=ts['roll'],
                    role='student',
                    department_id=dept_obj.id if dept_obj else None,
                    password_hash='scrypt:32768:8:1$dummyhash$dummy',
                    is_active=True,
                )
                db.session.add(u)
                db.session.flush()
                print(f"Created student: {ts['name']} ({ts['roll']})")
            else:
                u.roll_number = ts['roll']
                if dept_obj:
                    u.department_id = dept_obj.id
            target_uids.append(u.id)

        # Distribute all other students among the 7 departments evenly
        all_students = User.query.filter_by(institution_id=iid, role='student').all()
        dept_list = list(dept_map.values())
        for idx, s in enumerate(all_students):
            if s.id not in target_uids and not s.department_id:
                s.department_id = dept_list[idx % len(dept_list)].id

        db.session.commit()
        print(f"All {len(all_students)} students distributed across departments.")

        # 3. Create Sections and assign students if needed
        batch = Batch.query.filter_by(institution_id=iid).first()
        if not batch:
            ay = AcademicYear.query.filter_by(institution_id=iid).first()
            if not ay:
                ay = AcademicYear(id=str(uuid.uuid4()), institution_id=iid, year_label='2025-2026', is_active=True)
                db.session.add(ay)
                db.session.flush()
            batch = Batch(id=str(uuid.uuid4()), institution_id=iid, year_id=ay.id, name='2028 (B.Tech)', program='B.Tech')
            db.session.add(batch)
            db.session.flush()

        sections = Section.query.filter_by(institution_id=iid).all()
        if not sections:
            sec_a = Section(id=str(uuid.uuid4()), institution_id=iid, batch_id=batch.id, name='A', section_code='SEC-A')
            sec_b = Section(id=str(uuid.uuid4()), institution_id=iid, batch_id=batch.id, name='B', section_code='SEC-B')
            sec_c = Section(id=str(uuid.uuid4()), institution_id=iid, batch_id=batch.id, name='C', section_code='SEC-C')
            db.session.add_all([sec_a, sec_b, sec_c])
            db.session.flush()
            sections = [sec_a, sec_b, sec_c]

        # Ensure SectionStudent links
        for idx, s in enumerate(all_students):
            sec = sections[idx % len(sections)]
            existing = SectionStudent.query.filter_by(student_id=s.id).first()
            if not existing:
                db.session.add(SectionStudent(section_id=sec.id, student_id=s.id))

        db.session.commit()

        # 4. Create Subjects and SectionSubjects if missing
        instructor = User.query.filter_by(institution_id=iid, role='instructor').first()
        if not instructor:
            instructor = User.query.filter_by(institution_id=iid, role='institution_admin').first()

        for d_name, d_obj in dept_map.items():
            subj = Subject.query.filter_by(institution_id=iid, department_id=d_obj.id).first()
            if not subj:
                subj = Subject(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    department_id=d_obj.id,
                    name=f"{d_name} Lab Practice",
                    code=f"{d_obj.code}-LAB",
                )
                db.session.add(subj)
                db.session.flush()

            for sec in sections:
                ss = SectionSubject.query.filter_by(section_id=sec.id, subject_id=subj.id).first()
                if not ss:
                    ss = SectionSubject(
                        id=str(uuid.uuid4()),
                        institution_id=iid,
                        section_id=sec.id,
                        subject_id=subj.id,
                        instructor_id=instructor.id,
                    )
                    db.session.add(ss)

        db.session.commit()
        print("Subjects & SectionSubjects verified.")

        # 5. Seed Sessions across 30 days and hours (8AM - 5PM) to build a realistic activity heatmap
        # Today is approx 2026-10-17
        base_date = datetime(2026, 10, 17, 12, 0, 0)
        ss_all = SectionSubject.query.filter_by(institution_id=iid).all()
        if not ss_all:
            print("No section subjects available!")
            return

        exp = Experiment.query.filter_by(institution_id=iid).first()
        exp_id = exp.id if exp else None

        print("Generating realistic session schedule across past 30 days...")
        # Create sessions for the past 30 days
        created_sessions = []
        for day_offset in range(30):
            current_day = base_date - timedelta(days=day_offset)
            weekday = current_day.weekday()  # 0=Mon, 6=Sun
            
            # Hours 8 through 17 (8AM to 5PM)
            # Wednesday (2) and Thursday (3) around 11AM-2PM have peak density
            for h in range(8, 18):
                # Probability of session occurring at hour h
                prob = 0.4
                if weekday in [1, 2, 3]:  # Tue, Wed, Thu
                    if 11 <= h <= 14:
                        prob = 0.95
                    else:
                        prob = 0.65
                elif weekday in [0, 4]:  # Mon, Fri
                    prob = 0.55
                elif weekday in [5, 6]:  # Sat, Sun
                    prob = 0.20

                if random.random() < prob:
                    # Create 1-3 concurrent sessions
                    num_sess = 2 if (weekday in [2, 3] and 11 <= h <= 14) else 1
                    for _ in range(num_sess):
                        chosen_ss = random.choice(ss_all)
                        sched_dt = datetime(current_day.year, current_day.month, current_day.day, h, random.choice([0, 15, 30]))
                        
                        ls = LabSession(
                            id=str(uuid.uuid4()),
                            institution_id=iid,
                            section_subject_id=chosen_ss.section_id if hasattr(chosen_ss, 'section_subject_id') else chosen_ss.id,
                            experiment_id=exp_id,
                            title=f"Lab Practice - {sched_dt.strftime('%b %d %I:%M %p')}",
                            scheduled_at=sched_dt,
                            duration_minutes=random.choice([60, 90, 120]),
                            status='ended',
                            started_at=sched_dt,
                            ended_at=sched_dt + timedelta(minutes=90),
                        )
                        db.session.add(ls)
                        created_sessions.append(ls)

        db.session.flush()
        print(f"Created {len(created_sessions)} realistic LabSession records.")

        # 6. Seed Attendance records
        # Students in general attend with ~68.4% probability
        # Active students attend regularly, low-engagement students attend very rarely
        target_dict = {ts['name']: ts for ts in target_students}
        user_by_name = {u.full_name: u for u in all_students}

        print("Generating attendance and proctoring telemetry...")
        att_count = 0
        proctor_count = 0
        for ls in created_sessions:
            sess_dt = ls.scheduled_at
            days_ago = (base_date - sess_dt).days

            # Pick a subset of students enrolled
            # Let's pick ~30-50 students per session
            batch_students = random.sample(all_students, min(len(all_students), random.randint(30, 55)))

            for s in batch_students:
                # Check if this student is one of the low-engagement targets
                if s.full_name in target_dict:
                    ts_info = target_dict[s.full_name]
                    # Target only attended if days_ago >= ts_info['days_ago'] and randomly sparse
                    if days_ago < ts_info['days_ago']:
                        continue  # no recent activity!
                    if random.random() > (ts_info['rate'] / 100.0):
                        continue
                    
                    status = 'present' if random.random() < 0.8 else 'late'
                    att = SessionAttendance(
                        session_id=ls.id,
                        student_id=s.id,
                        joined_at=ls.scheduled_at,
                        left_at=ls.scheduled_at + timedelta(minutes=random.randint(40, 85)),
                        total_time_seconds=random.randint(2400, 5100),
                        status=status,
                        is_active_participant=True,
                    )
                    db.session.add(att)
                    att_count += 1

                    # Add proctor events (tab switch, etc.) to lower focus score
                    for _ in range(random.randint(2, 6)):
                        pe = ProctorEvent(
                            id=str(uuid.uuid4()),
                            institution_id=iid,
                            session_id=ls.id,
                            student_id=s.id,
                            event_type=random.choice(['tab_switch', 'fullscreen_exit']),
                            severity=random.choice(['low', 'medium']),
                            recorded_at=ls.scheduled_at + timedelta(minutes=random.randint(5, 75)),
                        )
                        db.session.add(pe)
                        proctor_count += 1
                else:
                    # Regular student: ~75% attendance
                    if random.random() < 0.75:
                        att = SessionAttendance(
                            session_id=ls.id,
                            student_id=s.id,
                            joined_at=ls.scheduled_at,
                            left_at=ls.scheduled_at + timedelta(minutes=random.randint(60, 90)),
                            total_time_seconds=random.randint(3600, 5400),
                            status='present',
                            is_active_participant=True,
                        )
                        db.session.add(att)
                        att_count += 1

                        if random.random() < 0.15:
                            pe = ProctorEvent(
                                id=str(uuid.uuid4()),
                                institution_id=iid,
                                session_id=ls.id,
                                student_id=s.id,
                                event_type='tab_switch',
                                severity='low',
                                recorded_at=ls.scheduled_at + timedelta(minutes=random.randint(10, 60)),
                            )
                            db.session.add(pe)
                            proctor_count += 1

        db.session.commit()
        print(f"Successfully seeded {att_count} SessionAttendances and {proctor_count} ProctorEvents!")
        print("Engagement telemetry seeding complete.")


if __name__ == '__main__':
    seed_engagement_data()
