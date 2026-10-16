"""
Seed comprehensive instructor analytics data for Greenwood Institute:
- 28 Instructors across 6 departments:
  - 8 in Computer Science
  - 6 in Electronics & Communication
  - 5 in Information Technology
  - 4 in Mechanical Engineering
  - 3 in Civil Engineering
  - 2 in Mathematics & Science
- Real section subjects, lab sessions, attendance, and student feedback.
- Aligned exactly with the user's mockup.
"""

from app import create_app, db
from app.models.user import User
from app.models.academic import Department, Section, SectionSubject
from app.models.subject import Subject
from app.models.session import LabSession, SessionAttendance
from app.models.grading import Grade
from app.models.feedback import SessionFeedback
from datetime import datetime, timedelta
import random

app = create_app()

with app.app_context():
    admin = User.query.filter_by(role='institution_admin').first()
    if not admin:
        print("Error: No institution_admin found.")
        exit(1)

    iid = 'inst-test-001'
    print(f"Target Institution ID: {iid} (Greenwood Institute)")

    # Fetch departments
    depts = Department.query.filter_by(institution_id=iid).all()
    dept_map = {d.name: d for d in depts}
    print(f"Found {len(depts)} departments.")

    # Top target instructors from mockup
    top_targets = [
        {
            'name': 'Dr. Priya Sharma',
            'email': 'priya.sharma@greenwood.edu',
            'dept': 'Computer Science',
            'sections': 3,
            'students': 142,
            'grade': 84.2,
            'attendance': 86.1,
            'engagement': 78.4,
            'feedback': 4.6,
            'status': 'Excellent',
            'spark': [80.1, 81.5, 82.8, 83.5, 84.2],
        },
        {
            'name': 'Dr. Rajesh Kumar',
            'email': 'rajesh.kumar@greenwood.edu',
            'dept': 'Electronics & Comm',
            'sections': 4,
            'students': 196,
            'grade': 78.6,
            'attendance': 81.3,
            'engagement': 72.1,
            'feedback': 4.2,
            'status': 'Good',
            'spark': [75.2, 76.5, 77.4, 78.0, 78.6],
        },
        {
            'name': 'Prof. Vikram Singh',
            'email': 'vikram.singh@greenwood.edu',
            'dept': 'Information Technology',
            'sections': 3,
            'students': 128,
            'grade': 76.4,
            'attendance': 79.8,
            'engagement': 69.5,
            'feedback': 4.1,
            'status': 'Good',
            'spark': [74.0, 75.1, 75.8, 76.0, 76.4],
        },
        {
            'name': 'Prof. Amit Patel',
            'email': 'amit.patel@greenwood.edu',
            'dept': 'Mechanical Engineering',
            'sections': 2,
            'students': 104,
            'grade': 72.1,
            'attendance': 77.4,
            'engagement': 63.2,
            'feedback': 3.8,
            'status': 'Watch',
            'spark': [74.5, 73.8, 73.0, 72.5, 72.1],
        },
        {
            'name': 'Dr. Meera Joshi',
            'email': 'meera.joshi@greenwood.edu',
            'dept': 'Civil Engineering',
            'sections': 2,
            'students': 96,
            'grade': 69.8,
            'attendance': 75.1,
            'engagement': 61.0,
            'feedback': 3.6,
            'status': 'Watch',
            'spark': [71.2, 70.8, 70.4, 70.0, 69.8],
        },
        {
            'name': 'Dr. Deepak Nair',
            'email': 'deepak.nair@greenwood.edu',
            'dept': 'Mathematics & Science',
            'sections': 2,
            'students': 88,
            'grade': 68.4,
            'attendance': 73.6,
            'engagement': 58.9,
            'feedback': 3.5,
            'status': 'Needs Support',
            'spark': [70.5, 69.8, 69.2, 68.8, 68.4],
        },
        {
            'name': 'Ritu Saxena',
            'email': 'ritu.saxena@greenwood.edu',
            'dept': 'Computer Science',
            'sections': 2,
            'students': 82,
            'grade': 67.5,
            'attendance': 74.0,
            'engagement': 66.5,
            'feedback': 4.0,
            'status': 'Watch',
            'spark': [65.0, 66.0, 66.8, 67.2, 67.5],
        },
        {
            'name': 'Sneha Patil',
            'email': 'sneha.patil@greenwood.edu',
            'dept': 'Electronics & Comm',
            'sections': 2,
            'students': 80,
            'grade': 66.8,
            'attendance': 73.5,
            'engagement': 62.0,
            'feedback': 3.7,
            'status': 'Watch',
            'spark': [68.5, 67.8, 67.4, 67.0, 66.8],
        },
        {
            'name': 'Neha Iyer',
            'email': 'neha.iyer@greenwood.edu',
            'dept': 'Information Technology',
            'sections': 2,
            'students': 78,
            'grade': 65.1,
            'attendance': 71.5,
            'engagement': 59.2,
            'feedback': 3.6,
            'status': 'Watch',
            'spark': [67.0, 66.2, 65.8, 65.4, 65.1],
        },
        {
            'name': 'Ananya Iyer',
            'email': 'ananya.iyer@greenwood.edu',
            'dept': 'Mechanical Engineering',
            'sections': 2,
            'students': 72,
            'grade': 59.4,
            'attendance': 68.2,
            'engagement': 54.0,
            'feedback': 3.3,
            'status': 'Needs Support',
            'spark': [62.0, 61.2, 60.5, 60.0, 59.4],
        },
    ]

    # Additional instructors to reach 28 total matching department distribution:
    # CS: 8 total (Priya Sharma, Ritu Saxena + 6)
    # ECE: 6 total (Rajesh Kumar, Sneha Patil + 4)
    # IT: 5 total (Vikram Singh, Neha Iyer + 3)
    # ME: 4 total (Amit Patel, Ananya Iyer + 2)
    # CE: 3 total (Meera Joshi + 2)
    # MS: 2 total (Deepak Nair + 1)
    extra_pool = [
        # CS (6 more)
        ('Dr. Arjun Rao', 'arjun.rao@greenwood.edu', 'Computer Science', 58.2, 69.0, 3.5),
        ('Prof. Kavita Reddy', 'kavita.reddy@greenwood.edu', 'Computer Science', 57.8, 68.5, 3.5),
        ('Dr. Manish Verma', 'manish.verma@greenwood.edu', 'Computer Science', 57.4, 68.0, 3.4),
        ('Prof. Pooja Deshmukh', 'pooja.deshmukh@greenwood.edu', 'Computer Science', 57.0, 67.5, 3.4),
        ('Dr. Sanjay Gupta', 'sanjay.gupta@greenwood.edu', 'Computer Science', 56.5, 67.0, 3.4),
        ('Prof. Tanvi Kulkarni', 'tanvi.kulkarni@greenwood.edu', 'Computer Science', 56.0, 66.5, 3.3),
        # ECE (4 more)
        ('Dr. Harish Bhat', 'harish.bhat@greenwood.edu', 'Electronics & Comm', 55.8, 66.0, 3.3),
        ('Prof. Shalini Roy', 'shalini.roy@greenwood.edu', 'Electronics & Comm', 55.4, 65.5, 3.3),
        ('Dr. Vivek Menon', 'vivek.menon@greenwood.edu', 'Electronics & Comm', 55.0, 65.0, 3.2),
        ('Prof. Rashmi Pillai', 'rashmi.pillai@greenwood.edu', 'Electronics & Comm', 54.6, 64.5, 3.2),
        # IT (3 more)
        ('Dr. Aditya Sen', 'aditya.sen@greenwood.edu', 'Information Technology', 54.2, 64.0, 3.2),
        ('Prof. Meenakshi Sundaram', 'meenakshi.s@greenwood.edu', 'Information Technology', 53.8, 63.5, 3.1),
        ('Dr. Nikhil Kadam', 'nikhil.kadam@greenwood.edu', 'Information Technology', 53.4, 63.0, 3.1),
        # ME (2 more)
        ('Dr. Suresh Nambiar', 'suresh.nambiar@greenwood.edu', 'Mechanical Engineering', 53.0, 62.5, 3.1),
        ('Prof. Gaurav Mishra', 'gaurav.mishra@greenwood.edu', 'Mechanical Engineering', 52.6, 62.0, 3.0),
        # CE (2 more)
        ('Dr. Anand Kulkarni', 'anand.kulkarni@greenwood.edu', 'Civil Engineering', 52.2, 61.5, 3.0),
        ('Prof. Sunita Rao', 'sunita.rao@greenwood.edu', 'Civil Engineering', 51.8, 61.0, 3.0),
        # MS (1 more)
        ('Dr. Arvind Swaminathan', 'arvind.s@greenwood.edu', 'Mathematics & Science', 51.4, 60.5, 3.0),
    ]

    print("Total instructors to seed/sync: 10 top + 18 extra = 28 instructors.")

    all_instructors_data = []
    for t in top_targets:
        all_instructors_data.append((t['name'], t['email'], t['dept'], t['grade'], t['attendance'], t['feedback'], t['sections'], t['students']))
    for item in extra_pool:
        all_instructors_data.append((item[0], item[1], item[2], item[3], item[4], item[5], 2, 60))

    # Upsert User records for instructors
    created_count = 0
    synced_instructors = []
    for item in all_instructors_data:
        full_name, email, dept_name, grade, att, feedback, num_sections, target_students = item
        dept = dept_map.get(dept_name)
        if not dept:
            # Try fuzzy match
            for dn, d_obj in dept_map.items():
                if dept_name.lower() in dn.lower() or dn.lower() in dept_name.lower():
                    dept = d_obj
                    break
        dept_id = dept.id if dept else None

        user = User.query.filter_by(institution_id=iid, email=email).first()
        if not user:
            user = User(
                institution_id=iid,
                full_name=full_name,
                email=email,
                role='instructor',
                department_id=dept_id,
                password_hash='scrypt:32768:8:1$dummyhash$dummy',
                is_active=True,
            )
            db.session.add(user)
            db.session.flush()
            created_count += 1
        else:
            user.full_name = full_name
            user.department_id = dept_id
            user.role = 'instructor'
            user.is_active = True

        synced_instructors.append((user, dept, grade, att, feedback, num_sections, target_students))

    # Deactivate any duplicate/other instructors in inst-test-001 so exactly 28 active instructors are present
    synced_emails = {item[1] for item in all_instructors_data}
    other_instructors = User.query.filter(
        User.institution_id == iid,
        User.role.in_(['instructor', 'faculty']),
        ~User.email.in_(synced_emails),
    ).all()
    for other in other_instructors:
        other.is_active = False

    db.session.commit()
    print(f"Synced {len(synced_instructors)} instructors (Created: {created_count}, Deactivated duplicates: {len(other_instructors)}).")

    # Link instructors to SectionSubject, LabSessions, Attendance, Grades, Feedback, and Focus
    from app.models.experiment import Experiment
    from app.models.academic import SectionStudent, Batch
    from app.models.knowledge import FocusScore

    # Clean previous telemetry records for this institution to ensure clean baseline
    old_sessions = LabSession.query.filter_by(institution_id=iid).all()
    old_sess_ids = [s.id for s in old_sessions]
    if old_sess_ids:
        Grade.query.filter(Grade.session_id.in_(old_sess_ids)).delete(synchronize_session=False)
        SessionAttendance.query.filter(SessionAttendance.session_id.in_(old_sess_ids)).delete(synchronize_session=False)
        SessionFeedback.query.filter(SessionFeedback.session_id.in_(old_sess_ids)).delete(synchronize_session=False)
        FocusScore.query.filter(FocusScore.session_id.in_(old_sess_ids)).delete(synchronize_session=False)
        db.session.commit()

    batch = Batch.query.filter_by(institution_id=iid).first()
    if not batch:
        batch = Batch(
            institution_id=iid,
            name='2028 (B.Tech)',
            academic_year='2024-2028',
            is_active=True,
        )
        db.session.add(batch)
        db.session.flush()

    subjects = Subject.query.filter_by(institution_id=iid).all()
    if not subjects:
        cs_dept = dept_map.get('Computer Science')
        subj1 = Subject(institution_id=iid, department_id=cs_dept.id if cs_dept else None, name='Data Structures & Algorithms', code='CS201')
        subj2 = Subject(institution_id=iid, department_id=cs_dept.id if cs_dept else None, name='Database Management Systems', code='CS202')
        db.session.add_all([subj1, subj2])
        db.session.commit()
        subjects = [subj1, subj2]

    all_students = User.query.filter_by(institution_id=iid, role='student').all()
    student_pool_ids = [s.id for s in all_students]
    exp = Experiment.query.first()
    exp_id = exp.id if exp else 'exp-demo-001'

    now = datetime.utcnow()
    total_sessions_created = 0
    total_grades_created = 0

    for idx, (instr, dept, target_grade, target_att, target_fb, num_sections, target_students) in enumerate(synced_instructors):
        base_st = target_students // num_sections
        rem_st = target_students % num_sections

        for s_idx in range(num_sections):
            sec_name = f"I{idx + 1}S{s_idx + 1}"
            sec = Section.query.filter_by(institution_id=iid, name=sec_name).first()
            if not sec:
                sec = Section(
                    institution_id=iid,
                    name=sec_name,
                    batch_id=batch.id,
                )
                db.session.add(sec)
                db.session.flush()

            subj = subjects[(idx + s_idx) % len(subjects)]
            ss = SectionSubject.query.filter_by(
                institution_id=iid,
                instructor_id=instr.id,
                section_id=sec.id,
                subject_id=subj.id
            ).first()
            if not ss:
                ss = SectionSubject(
                    institution_id=iid,
                    section_id=sec.id,
                    subject_id=subj.id,
                    instructor_id=instr.id,
                )
                db.session.add(ss)
                db.session.flush()

            # Enroll exact number of students into this section
            st_count_for_sec = base_st + (1 if s_idx < rem_st else 0)
            SectionStudent.query.filter_by(section_id=sec.id).delete()
            for st_i in range(st_count_for_sec):
                st_id = student_pool_ids[(idx * 7 + s_idx * 13 + st_i) % len(student_pool_ids)]
                db.session.add(SectionStudent(section_id=sec.id, student_id=st_id))
            db.session.flush()

            # Create 3 lab sessions in the last 30 days
            session_offsets = [22 - (s_idx * 4), 14 - (s_idx * 3), 4 - s_idx]
            for sess_offset in session_offsets:
                sess_date = now - timedelta(days=max(1, sess_offset))
                ls = LabSession.query.filter_by(
                    section_subject_id=ss.id,
                    scheduled_at=sess_date
                ).first()
                if not ls:
                    ls = LabSession(
                        institution_id=iid,
                        section_subject_id=ss.id,
                        experiment_id=exp_id,
                        title=f"{subj.name} Lab {s_idx + 1}",
                        scheduled_at=sess_date,
                        duration_minutes=90,
                        status='completed',
                    )
                    db.session.add(ls)
                    db.session.flush()
                    total_sessions_created += 1

                sec_st_ids = [sst.student_id for sst in SectionStudent.query.filter_by(section_id=sec.id).all()]
                num_presents = int(round((target_att / 100.0) * len(sec_st_ids)))
                num_presents = max(1, min(len(sec_st_ids), num_presents))

                for s_i, st_id in enumerate(sec_st_ids):
                    is_present = (s_i < num_presents)
                    att_status = 'present' if is_present else 'absent'
                    db.session.add(SessionAttendance(
                        session_id=ls.id,
                        student_id=st_id,
                        status=att_status,
                        joined_at=sess_date + timedelta(minutes=random.randint(1, 5)) if is_present else None,
                    ))

                    if is_present:
                        g_val = round(target_grade + random.uniform(-0.8, 0.8), 1)
                        db.session.add(Grade(
                            student_id=st_id,
                            experiment_id=exp_id,
                            session_id=ls.id,
                            final_grade=g_val,
                            auto_grade=g_val,
                            manual_grade=g_val,
                            graded_at=sess_date + timedelta(hours=2),
                        ))
                        total_grades_created += 1

                # Feedback from multiple students in this session to reach ~1,245 total institutional responses
                num_feedbacks = min(len(sec_st_ids), 7)
                for fb_idx in range(num_feedbacks):
                    if target_fb >= 4.5:
                        fb_val = 5 if random.random() < 0.8 else 4
                    elif target_fb >= 4.0:
                        fb_val = 5 if random.random() < 0.35 else (4 if random.random() < 0.85 else 3)
                    elif target_fb >= 3.5:
                        fb_val = 4 if random.random() < 0.6 else 3
                    else:
                        fb_val = 3 if random.random() < 0.7 else 2

                    db.session.add(SessionFeedback(
                        session_id=ls.id,
                        institution_id=iid,
                        overall_rating=fb_val,
                        experiment_clarity=fb_val,
                        session_pacing=fb_val,
                        ai_hint_helpfulness=fb_val,
                        comment="Engaging session with clear instructions.",
                        submitted_at=sess_date + timedelta(hours=3, minutes=fb_idx * 4),
                    ))

                # Focus score
                focus_val = round(target_grade * 0.93 + random.uniform(-0.5, 0.5), 1)
                db.session.add(FocusScore(
                    student_id=sec_st_ids[0] if sec_st_ids else student_pool_ids[0],
                    session_id=ls.id,
                    focus_score=focus_val,
                    recorded_at=sess_date + timedelta(minutes=30),
                ))

    db.session.commit()
    print(f"Created {total_sessions_created} LabSessions and {total_grades_created} Grades for 28 instructors!")
    print("Instructor analytics data seeded successfully with exact telemetry!")
