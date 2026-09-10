import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.session import LabSession, SessionAttendance
from app.models.academic import SectionSubject, Section, SectionStudent
from app.models.subject import Subject
from app.models.user import User

app = create_app()

def seed_live_sessions():
    with app.app_context():
        print("=== Seeding Live Lab Sessions ===")

        # Find institution ID
        inst_admin = User.query.filter_by(role='institution_admin').first()
        if not inst_admin:
            print("No institution admin found.")
            return
        iid = inst_admin.institution_id
        print(f"Institution ID: {iid}")

        # Find or create subjects
        dsa = Subject.query.filter_by(institution_id=iid, code='CS102').first()
        if not dsa:
            dsa = Subject.query.filter(Subject.name.ilike('%Data Structures%')).first()
        
        cn = Subject.query.filter_by(institution_id=iid, code='CS105').first()
        if not cn:
            cn = Subject.query.filter(Subject.name.ilike('%Computer Networks%')).first()

        dbms = Subject.query.filter_by(institution_id=iid, code='CS104').first()
        if not dbms:
            dbms = Subject.query.filter(Subject.name.ilike('%Database%')).first()

        # Find sections
        sections = Section.query.filter_by(institution_id=iid).all()
        if not sections:
            print("No sections found.")
            return

        sec_a = next((s for s in sections if s.name.upper() in ('A', 'SECTION A')), sections[0])
        sec_b = next((s for s in sections if s.name.upper() in ('B', 'SECTION B')), sections[-1])

        # Find instructors
        instructors = User.query.filter_by(institution_id=iid, role='instructor').all()
        if not instructors:
            instructors = User.query.filter_by(role='instructor').all()

        instr1 = instructors[0] if len(instructors) > 0 else inst_admin
        instr2 = instructors[1] if len(instructors) > 1 else instr1
        instr3 = instructors[2] if len(instructors) > 2 else instr1

        # Find students
        students = User.query.filter_by(institution_id=iid, role='student').all()
        if not students:
            students = User.query.filter_by(role='student').all()

        now = datetime.utcnow()

        # Helper to ensure SectionSubject exists
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
            elif ss.instructor_id != instr.id:
                ss.instructor_id = instr.id
                db.session.flush()
            return ss

        # Helper to ensure students are enrolled
        def enroll_students(sec, stud_list):
            for st in stud_list:
                exists = SectionStudent.query.filter_by(section_id=sec.id, student_id=st.id).first()
                if not exists:
                    db.session.add(SectionStudent(section_id=sec.id, student_id=st.id))
            db.session.flush()

        half = len(students) // 2
        students_a = students[:max(20, half)]
        students_b = students[max(10, half):]

        enroll_students(sec_a, students_a)
        enroll_students(sec_b, students_b)

        # 3 Live Sessions definitions
        live_configs = [
            {
                'subj': dsa,
                'sec': sec_a,
                'instr': instr1,
                'title': 'Lab 1 — Linked Lists',
                'duration': 120,
                'started_at': now - timedelta(minutes=46),
                'room': 'Lab 1 (Main Block)',
                'students': students_a,
                'online_ratio': 0.90,
            },
            {
                'subj': cn,
                'sec': sec_b,
                'instr': instr2,
                'title': 'Lab 2 — Socket Programming',
                'duration': 120,
                'started_at': now - timedelta(hours=1, minutes=12),
                'room': 'Lab 2 (Network Lab)',
                'students': students_b,
                'online_ratio': 0.87,
            },
            {
                'subj': dbms,
                'sec': sec_a,
                'instr': instr3,
                'title': 'Lab 3 — SQL Queries',
                'duration': 60,
                'started_at': now - timedelta(minutes=28),
                'room': 'Lab 3 (DB Lab)',
                'students': students_a,
                'online_ratio': 0.69,
            },
        ]

        created_sessions = []
        for conf in live_configs:
            if not conf['subj']:
                continue
            ss = get_or_create_ss(conf['sec'], conf['subj'], conf['instr'])

            # Look for existing session or create
            sess = LabSession.query.filter_by(
                institution_id=iid, section_subject_id=ss.id, status='active'
            ).first()

            if not sess:
                sess = LabSession(
                    institution_id=iid,
                    section_subject_id=ss.id,
                    title=conf['title'],
                    scheduled_at=conf['started_at'],
                    started_at=conf['started_at'],
                    duration_minutes=conf['duration'],
                    status='active',
                    jitsi_room_name=conf['room'],
                )
                db.session.add(sess)
                db.session.flush()
            else:
                sess.title = conf['title']
                sess.started_at = conf['started_at']
                sess.duration_minutes = conf['duration']
                sess.jitsi_room_name = conf['room']
                sess.status = 'active'
                db.session.flush()

            # Seed attendance records
            s_list = conf['students']
            target_online = max(1, int(len(s_list) * conf['online_ratio']))
            for idx, st in enumerate(s_list):
                att = SessionAttendance.query.filter_by(session_id=sess.id, student_id=st.id).first()
                if not att:
                    att = SessionAttendance(session_id=sess.id, student_id=st.id)
                    db.session.add(att)

                if idx < target_online:
                    # Online now
                    join_offset = (idx % 25) + 5
                    att.joined_at = conf['started_at'] + timedelta(minutes=join_offset)
                    att.left_at = None
                    att.status = 'present'
                    att.reconnect_count = idx % 2
                else:
                    # Left or absent
                    if idx % 2 == 0:
                        att.joined_at = conf['started_at'] + timedelta(minutes=5)
                        att.left_at = conf['started_at'] + timedelta(minutes=25)
                        att.status = 'partial'
                    else:
                        att.joined_at = None
                        att.left_at = None
                        att.status = 'absent'

            created_sessions.append(sess)

        db.session.commit()
        print(f"Successfully ensured {len(created_sessions)} active live sessions in database!")

if __name__ == '__main__':
    seed_live_sessions()
