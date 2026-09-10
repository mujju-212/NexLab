import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.session import LabSession
from app.models.academic import SectionSubject, Section, SectionStudent, Batch, AcademicYear, Department
from app.models.subject import Subject
from app.models.user import User

app = create_app()

def seed_upcoming_sessions():
    with app.app_context():
        print("=== Seeding Upcoming Lab Sessions matching reference UI ===")

        inst_admin = User.query.filter_by(role='institution_admin').first()
        if not inst_admin:
            print("No institution admin found.")
            return
        iid = inst_admin.institution_id

        from werkzeug.security import generate_password_hash
        pw_hash = generate_password_hash('Password@123')

        # 1. Instructors
        dr_kulkarni = User.query.filter(User.full_name.ilike('%Kulkarni%')).first()
        if not dr_kulkarni:
            dr_kulkarni = User(
                institution_id=iid,
                full_name='Dr. Rohan Kulkarni',
                email='dr.kulkarni@nexlab.demo',
                password_hash=pw_hash,
                role='instructor',
            )
            db.session.add(dr_kulkarni)

        prof_patil = User.query.filter(User.full_name.ilike('%Patil%')).first()
        if not prof_patil:
            prof_patil = User(
                institution_id=iid,
                full_name='Prof. Sneha Patil',
                email='prof.patil@nexlab.demo',
                password_hash=pw_hash,
                role='instructor',
            )
            db.session.add(prof_patil)

        dr_sharma = User.query.filter(User.full_name.ilike('%Priya Sharma%')).first()
        if not dr_sharma:
            dr_sharma = User(
                institution_id=iid,
                full_name='Dr. Priya Sharma',
                email='dr.sharma@nexlab.demo',
                password_hash=pw_hash,
                role='instructor',
            )
            db.session.add(dr_sharma)

        dr_iyer = User.query.filter(User.full_name.ilike('%Iyer%')).first()
        if not dr_iyer:
            dr_iyer = User(
                institution_id=iid,
                full_name='Dr. Neha Iyer',
                email='dr.iyer@nexlab.demo',
                password_hash=pw_hash,
                role='instructor',
            )
            db.session.add(dr_iyer)

        dr_amit = User.query.filter(User.full_name.ilike('%Amit Sharma%')).first()
        if not dr_amit:
            dr_amit = User(
                institution_id=iid,
                full_name='Dr. Amit Sharma',
                email='dr.amit.sharma@nexlab.demo',
                password_hash=pw_hash,
                role='instructor',
            )
            db.session.add(dr_amit)

        db.session.commit()

        # 2. Section B and Department
        dept = Department.query.filter(Department.name.ilike('%Computer Science%')).first()
        batch = Batch.query.filter(Batch.name.ilike('%CSE 3rd Year%')).first()
        if not batch:
            batch = Batch.query.first()

        sec_b = Section.query.filter(Section.name.ilike('%Section B%')).first()
        if not sec_b:
            sec_b = Section.query.filter(Section.name.ilike('%B%')).first()
        if not sec_b:
            sec_b = Section(
                institution_id=iid,
                batch_id=batch.id if batch else None,
                name='Section B',
                section_code='CSE-3B',
                max_students=60,
                is_active=True
            )
            db.session.add(sec_b)
            db.session.commit()

        # 3. Subjects
        subjects_data = [
            {'code': 'CS102', 'name': 'Data Structures Lab', 'color': '#0284c7'},
            {'code': 'CS301', 'name': 'Computer Networks Lab', 'color': '#16a34a'},
            {'code': 'CS104', 'name': 'Database Systems Lab', 'color': '#e11d48'},
            {'code': 'CS205', 'name': 'Machine Learning Lab', 'color': '#7c3aed'},
            {'code': 'CS111', 'name': 'OOP Concepts Lab', 'color': '#d97706'},
            {'code': 'CS107', 'name': 'Web Technologies Lab', 'color': '#0284c7'},
            {'code': 'CS208', 'name': 'Python Lab', 'color': '#d97706'},
            {'code': 'CS303', 'name': 'Database Systems', 'color': '#16a34a'},
            {'code': 'CS304', 'name': 'AI & ML Lab', 'color': '#e11d48'},
        ]

        subjects_map = {}
        for sd in subjects_data:
            subj = Subject.query.filter(
                (Subject.code == sd['code']) | (Subject.name.ilike(f"%{sd['name']}%"))
            ).first()
            if not subj:
                subj = Subject(
                    institution_id=iid,
                    department_id=dept.id if dept else None,
                    name=sd['name'],
                    code=sd['code'],
                    color=sd['color'],
                    is_active=True
                )
                db.session.add(subj)
                db.session.flush()
            subjects_map[sd['code']] = subj

        db.session.commit()

        # Helper to get or create SectionSubject
        def get_or_create_ss(section, subject, instructor):
            ss = SectionSubject.query.filter_by(
                section_id=section.id,
                subject_id=subject.id,
                instructor_id=instructor.id
            ).first()
            if not ss:
                ss = SectionSubject(
                    institution_id=iid,
                    section_id=section.id,
                    subject_id=subject.id,
                    instructor_id=instructor.id,
                )
                db.session.add(ss)
                db.session.flush()
            return ss

        # Schedule items strictly reflecting the user's reference screenshot:
        # Today - 7 September 2026:
        #   05:30 PM - 07:00 PM: Data Structures Lab, CS102, Lab 1, Section B, Dr. Rohan Kulkarni, 42 students
        #   07:30 PM - 09:00 PM: Computer Networks Lab, CS301, Lab 2, Section B, Prof. Sneha Patil, 38 students
        #   09:15 PM - 10:45 PM: Database Systems Lab, CS104, Lab 1, Section B, Dr. Amit Sharma, 40 students
        # Tomorrow - 8 September 2026:
        #   10:00 AM - 11:30 AM: Machine Learning Lab, CS205, Lab 3, Section B, Dr. Neha Iyer, 36 students
        #   02:00 PM - 04:00 PM: OOP Concepts Lab, CS111, Lab 2, Section B, Dr. Rohan Kulkarni, 42 students
        # Wednesday - 9 September 2026:
        #   08:30 AM - 10:30 AM: DBMS Lab, CS104, Lab 1, Section B, Dr. Priya Sharma, 40 students
        #   03:00 PM - 05:00 PM: Web Technologies Lab, CS107, Lab 3, Section B, Prof. Sneha Patil, 38 students
        # Thursday - 10 September 2026:
        #   11:00 AM - 01:00 PM: Python Lab, CS208, Lab 3, Section B, Dr. Neha Iyer, 40 students
        # Friday - 11 September 2026:
        #   09:00 AM - 11:00 AM: OOP Concepts Lab, CS111, Lab 2, Section B, Dr. Priya Sharma, 38 students
        #   01:00 PM - 03:00 PM: Database Systems, CS303, Lab 2, Section B, Dr. Rohan Kulkarni, 42 students
        # Saturday - 12 September 2026:
        #   04:00 PM - 06:00 PM: AI & ML Lab, CS304, Lab 1, Section B, Dr. Priya Sharma, 40 students

        upcoming_schedule = [
            {
                'title': 'Data Structures Lab',
                'subj_code': 'CS102',
                'sec': sec_b,
                'instr': dr_kulkarni,
                'year': 2026, 'month': 9, 'day': 7, 'hour': 17, 'minute': 30,
                'duration': 90,
                'room': 'Lab 1',
                'status': 'scheduled',
            },
            {
                'title': 'Computer Networks Lab',
                'subj_code': 'CS301',
                'sec': sec_b,
                'instr': prof_patil,
                'year': 2026, 'month': 9, 'day': 7, 'hour': 19, 'minute': 30,
                'duration': 90,
                'room': 'Lab 2',
                'status': 'scheduled',
            },
            {
                'title': 'Database Systems Lab',
                'subj_code': 'CS104',
                'sec': sec_b,
                'instr': dr_amit,
                'year': 2026, 'month': 9, 'day': 7, 'hour': 21, 'minute': 15,
                'duration': 90,
                'room': 'Lab 1',
                'status': 'scheduled',
            },
            {
                'title': 'Machine Learning Lab',
                'subj_code': 'CS205',
                'sec': sec_b,
                'instr': dr_iyer,
                'year': 2026, 'month': 9, 'day': 8, 'hour': 10, 'minute': 0,
                'duration': 90,
                'room': 'Lab 3',
                'status': 'scheduled',
            },
            {
                'title': 'OOP Concepts Lab',
                'subj_code': 'CS111',
                'sec': sec_b,
                'instr': dr_kulkarni,
                'year': 2026, 'month': 9, 'day': 8, 'hour': 14, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2',
                'status': 'scheduled',
            },
            {
                'title': 'DBMS Lab',
                'subj_code': 'CS104',
                'sec': sec_b,
                'instr': dr_sharma,
                'year': 2026, 'month': 9, 'day': 9, 'hour': 8, 'minute': 30,
                'duration': 120,
                'room': 'Lab 1',
                'status': 'scheduled',
            },
            {
                'title': 'Web Technologies Lab',
                'subj_code': 'CS107',
                'sec': sec_b,
                'instr': prof_patil,
                'year': 2026, 'month': 9, 'day': 9, 'hour': 15, 'minute': 0,
                'duration': 120,
                'room': 'Lab 3',
                'status': 'scheduled',
            },
            {
                'title': 'Python Lab',
                'subj_code': 'CS208',
                'sec': sec_b,
                'instr': dr_iyer,
                'year': 2026, 'month': 9, 'day': 10, 'hour': 11, 'minute': 0,
                'duration': 120,
                'room': 'Lab 3',
                'status': 'scheduled',
            },
            {
                'title': 'OOP Concepts Lab',
                'subj_code': 'CS111',
                'sec': sec_b,
                'instr': dr_sharma,
                'year': 2026, 'month': 9, 'day': 11, 'hour': 9, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2',
                'status': 'scheduled',
            },
            {
                'title': 'Database Systems',
                'subj_code': 'CS303',
                'sec': sec_b,
                'instr': dr_kulkarni,
                'year': 2026, 'month': 9, 'day': 11, 'hour': 13, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2',
                'status': 'scheduled',
            },
            {
                'title': 'AI & ML Lab',
                'subj_code': 'CS304',
                'sec': sec_b,
                'instr': dr_sharma,
                'year': 2026, 'month': 9, 'day': 12, 'hour': 16, 'minute': 0,
                'duration': 120,
                'room': 'Lab 1',
                'status': 'scheduled',
            },
            {
                'title': 'Cloud Computing Lab',
                'subj_code': 'CS208',
                'sec': sec_b,
                'instr': dr_kulkarni,
                'year': 2026, 'month': 9, 'day': 13, 'hour': 10, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2',
                'status': 'scheduled',
            },
        ]

        created_count = 0
        for item in upcoming_schedule:
            subj = subjects_map[item['subj_code']]
            ss = get_or_create_ss(item['sec'], subj, item['instr'])
            sched_dt = datetime(item['year'], item['month'], item['day'], item['hour'], item['minute'])

            existing = LabSession.query.filter_by(
                institution_id=iid,
                section_subject_id=ss.id,
                scheduled_at=sched_dt,
            ).first()

            if not existing:
                session = LabSession(
                    institution_id=iid,
                    section_subject_id=ss.id,
                    title=item['title'],
                    scheduled_at=sched_dt,
                    duration_minutes=item['duration'],
                    status=item['status'],
                    jitsi_room_name=f"{item['room']} (Main Block)",
                )
                db.session.add(session)
                created_count += 1
            else:
                existing.title = item['title']
                existing.status = item['status']
                existing.duration_minutes = item['duration']
                existing.jitsi_room_name = f"{item['room']} (Main Block)"

        db.session.commit()
        print(f"Successfully seeded/updated {len(upcoming_schedule)} upcoming sessions! New created: {created_count}")

if __name__ == '__main__':
    seed_upcoming_sessions()
