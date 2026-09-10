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

def seed_calendar_sessions():
    with app.app_context():
        print("=== Seeding Calendar Lab Sessions for 7-13 Sep 2026 ===")

        inst_admin = User.query.filter_by(role='institution_admin').first()
        if not inst_admin:
            print("No institution admin found.")
            return
        iid = inst_admin.institution_id

        # Make sure subjects exist with proper codes and names
        subjects_data = [
            {'code': 'CS102', 'name': 'Data Structures Lab', 'color': '#0284c7'},
            {'code': 'CS105', 'name': 'Computer Networks Lab', 'color': '#16a34a'},
            {'code': 'CS104', 'name': 'DBMS Lab', 'color': '#e11d48'},
            {'code': 'CS205', 'name': 'Python Lab', 'color': '#d97706'},
            {'code': 'CS201', 'name': 'OOP Concepts', 'color': '#7c3aed'},
            {'code': 'CS301', 'name': 'Machine Learning', 'color': '#7c3aed'},
            {'code': 'CS302', 'name': 'Web Technologies', 'color': '#06b6d4'},
            {'code': 'CS303', 'name': 'Database Systems', 'color': '#0d9488'},
            {'code': 'CS304', 'name': 'AI & ML Lab', 'color': '#f43f5e'},
        ]

        subjects_map = {}
        for sd in subjects_data:
            subj = Subject.query.filter_by(institution_id=iid, code=sd['code']).first()
            if not subj:
                subj = Subject.query.filter(Subject.name.ilike(f"%{sd['name']}%")).first()
            if not subj:
                subj = Subject(
                    institution_id=iid,
                    code=sd['code'],
                    name=sd['name'],
                    color=sd['color'],
                    is_active=True,
                )
                db.session.add(subj)
                db.session.flush()
            subjects_map[sd['code']] = subj

        # Get or create sections
        sections = Section.query.filter_by(institution_id=iid).all()
        sec_a = next((s for s in sections if 'A' in s.name.upper()), sections[0] if sections else None)
        sec_b = next((s for s in sections if 'B' in s.name.upper()), sections[-1] if sections else None)

        # Get instructors
        instructors = User.query.filter_by(institution_id=iid, role='instructor').all()
        if not instructors:
            instructors = User.query.filter_by(role='instructor').all()
        if not instructors:
            instructors = [inst_admin]

        # Named instructors matching UI
        dr_kulkarni = next((i for i in instructors if 'kulkarni' in i.full_name.lower()), instructors[0])
        prof_patil = next((i for i in instructors if 'patil' in i.full_name.lower()), instructors[min(1, len(instructors)-1)])
        dr_sharma = next((i for i in instructors if 'sharma' in i.full_name.lower() or 'priya' in i.full_name.lower()), instructors[min(2, len(instructors)-1)])
        dr_iyer = next((i for i in instructors if 'iyer' in i.full_name.lower() or 'neha' in i.full_name.lower()), instructors[min(3, len(instructors)-1)])

        def get_or_create_ss(sec, subj, instr):
            ss = SectionSubject.query.filter_by(
                institution_id=iid, section_id=sec.id, subject_id=subj.id
            ).first()
            if not ss:
                ss = SectionSubject(
                    institution_id=iid, section_id=sec.id, subject_id=subj.id, instructor_id=instr.id
                )
                db.session.add(ss)
                db.session.flush()
            return ss

        # Schedule items for 7 - 13 Sep 2026
        # Reference items from screenshot:
        # Mon 7 Sep:
        #   09:00 - 11:00: Data Structures Lab, Lab 1, Dr. R. Kulkarni
        #   14:00 - 16:00: Machine Learning, Lab 1, Dr. Neha Iyer
        # Tue 8 Sep:
        #   10:00 - 12:00: Computer Networks Lab, Lab 2, Prof. S. Patil
        # Wed 9 Sep:
        #   08:30 - 10:30: DBMS Lab, Lab 1, Dr. A. Sharma
        #   15:00 - 17:00: Web Technologies, Lab 3, Prof. S. Patil
        # Thu 10 Sep:
        #   11:00 - 13:00: Python Lab, Lab 3, Dr. N. Iyer
        # Fri 11 Sep:
        #   09:00 - 11:00: OOP Concepts, Lab 2, Dr. A. Sharma
        #   13:00 - 15:00: Database Systems, Lab 2, Dr. R. Kulkarni
        # Sat 12 Sep:
        #   16:00 - 18:00: AI & ML Lab, Lab 1, Dr. A. Sharma

        calendar_schedule = [
            {
                'title': 'Data Structures Lab — Linked Lists & Pointers',
                'subj_code': 'CS102',
                'sec': sec_a,
                'instr': dr_kulkarni,
                'year': 2026, 'month': 9, 'day': 7, 'hour': 9, 'minute': 0,
                'duration': 120,
                'room': 'Lab 1 (Main Block)',
                'status': 'ended',
            },
            {
                'title': 'Machine Learning — Linear Models',
                'subj_code': 'CS301',
                'sec': sec_b,
                'instr': dr_iyer,
                'year': 2026, 'month': 9, 'day': 7, 'hour': 14, 'minute': 0,
                'duration': 120,
                'room': 'Lab 1 (Main Block)',
                'status': 'ended',
            },
            {
                'title': 'Computer Networks Lab — Socket Programming',
                'subj_code': 'CS105',
                'sec': sec_b,
                'instr': prof_patil,
                'year': 2026, 'month': 9, 'day': 8, 'hour': 10, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2 (Network Lab)',
                'status': 'active',
            },
            {
                'title': 'DBMS Lab — Complex Joins & Subqueries',
                'subj_code': 'CS104',
                'sec': sec_a,
                'instr': dr_sharma,
                'year': 2026, 'month': 9, 'day': 9, 'hour': 8, 'minute': 30,
                'duration': 120,
                'room': 'Lab 1 (Main Block)',
                'status': 'scheduled',
            },
            {
                'title': 'Web Technologies — REST APIs & Express',
                'subj_code': 'CS302',
                'sec': sec_a,
                'instr': prof_patil,
                'year': 2026, 'month': 9, 'day': 9, 'hour': 15, 'minute': 0,
                'duration': 120,
                'room': 'Lab 3 (Web Lab)',
                'status': 'scheduled',
            },
            {
                'title': 'Python Lab — Data Analysis with Pandas',
                'subj_code': 'CS205',
                'sec': sec_b,
                'instr': dr_iyer,
                'year': 2026, 'month': 9, 'day': 10, 'hour': 11, 'minute': 0,
                'duration': 120,
                'room': 'Lab 3 (Data Science Lab)',
                'status': 'scheduled',
            },
            {
                'title': 'OOP Concepts — Polymorphism & Interfaces',
                'subj_code': 'CS201',
                'sec': sec_a,
                'instr': dr_sharma,
                'year': 2026, 'month': 9, 'day': 11, 'hour': 9, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2 (Software Lab)',
                'status': 'scheduled',
            },
            {
                'title': 'Database Systems — Indexing & Transactions',
                'subj_code': 'CS303',
                'sec': sec_b,
                'instr': dr_kulkarni,
                'year': 2026, 'month': 9, 'day': 11, 'hour': 13, 'minute': 0,
                'duration': 120,
                'room': 'Lab 2 (Network Lab)',
                'status': 'scheduled',
            },
            {
                'title': 'AI & ML Lab — Neural Networks Workshop',
                'subj_code': 'CS304',
                'sec': sec_a,
                'instr': dr_sharma,
                'year': 2026, 'month': 9, 'day': 12, 'hour': 16, 'minute': 0,
                'duration': 120,
                'room': 'Lab 1 (AI Center)',
                'status': 'scheduled',
            },
        ]

        created_count = 0
        for item in calendar_schedule:
            subj = subjects_map[item['subj_code']]
            ss = get_or_create_ss(item['sec'], subj, item['instr'])
            sched_dt = datetime(item['year'], item['month'], item['day'], item['hour'], item['minute'])

            # Check if matching session already exists
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
                    started_at=sched_dt if item['status'] in ('active', 'ended') else None,
                    ended_at=(sched_dt + timedelta(minutes=item['duration'])) if item['status'] == 'ended' else None,
                )
                db.session.add(session)
                created_count += 1
            else:
                existing.status = item['status']
                existing.title = item['title']
                existing.duration_minutes = item['duration']

        db.session.commit()
        print(f"Successfully seeded/updated {created_count} calendar sessions for 7-13 Sep 2026!")

if __name__ == '__main__':
    seed_calendar_sessions()
