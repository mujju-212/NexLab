from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.session import LabSession, SessionAttendance
from app.models.academic import Department, Section, SectionStudent, Batch, SectionSubject
from datetime import datetime, timedelta
import random

app = create_app()
with app.app_context():
    inst = Institution.query.filter_by(id='inst-test-001').first()
    if not inst:
        print('Institution inst-test-001 not found')
        exit(1)

    print('Ensuring departments and academic structure for Attendance Matrix...')

    dept_specs = [
        ('Computer Science & Engineering', 'CSE'),
        ('Electronics & Communication', 'ECE'),
        ('Information Technology', 'IT'),
        ('Mechanical Engineering', 'ME'),
        ('Civil Engineering', 'CE'),
        ('Electrical Engineering', 'EE'),
        ('Mathematics & Science', 'MS'),
    ]

    dept_map = {}
    for name, code in dept_specs:
        dept = Department.query.filter_by(institution_id='inst-test-001', name=name).first()
        if not dept:
            dept = Department(institution_id='inst-test-001', name=name, code=code)
            db.session.add(dept)
            db.session.flush()
        dept_map[name] = dept

    db.session.commit()

    # Students setup
    students = User.query.filter_by(institution_id='inst-test-001', role='student').all()
    print(f'Total students found: {len(students)}')

    # Ensure top low attendance student profiles
    top_profiles = [
        {'name': 'Aarav Mehta', 'roll': 'STU2024001', 'dept': dept_map['Computer Science & Engineering'], 'rate': 42.1, 'missed': 18, 'total': 31},
        {'name': 'Diya Sharma', 'roll': 'STU2024015', 'dept': dept_map['Electronics & Communication'], 'rate': 56.3, 'missed': 12, 'total': 28},
        {'name': 'Rohan Verma', 'roll': 'STU2024023', 'dept': dept_map['Information Technology'], 'rate': 61.8, 'missed': 10, 'total': 26},
        {'name': 'Sneha Iyer', 'roll': 'STU2024041', 'dept': dept_map['Mechanical Engineering'], 'rate': 63.5, 'missed': 9, 'total': 25},
        {'name': 'Karan Patel', 'roll': 'STU2024055', 'dept': dept_map['Civil Engineering'], 'rate': 68.2, 'missed': 8, 'total': 25},
    ]

    for i, prof in enumerate(top_profiles):
        if i < len(students):
            st = students[i]
            st.full_name = prof['name']
            st.roll_number = prof['roll']
            st.department_id = prof['dept'].id

    # Distribute other students across the 7 departments
    dept_list = list(dept_map.values())
    for idx, st in enumerate(students[5:]):
        st.department_id = dept_list[idx % len(dept_list)].id

    db.session.commit()

    # Clear existing SessionAttendance for inst-test-001 sessions to make clean state
    inst_session_ids = [s.id for s in LabSession.query.filter_by(institution_id='inst-test-001').all()]
    if inst_session_ids:
        SessionAttendance.query.filter(SessionAttendance.session_id.in_(inst_session_ids)).delete(synchronize_session=False)
        db.session.commit()

    # Ensure 416 scheduled sessions across the 30-day window (Sep 16 to Oct 16, 2026)
    existing_sessions = LabSession.query.filter_by(institution_id='inst-test-001').all()
    needed_sessions = 416 - len(existing_sessions)

    section_subjects = SectionSubject.query.filter_by(institution_id='inst-test-001').all()
    ss_ids = [ss.id for ss in section_subjects]
    if not ss_ids:
        print('No SectionSubject found')
        exit(1)

    base_date = datetime(2026, 9, 16, 8, 0, 0)
    hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] # 8AM to 5PM

    if needed_sessions > 0:
        print(f'Creating {needed_sessions} additional lab sessions to reach 416 scheduled sessions...')
        for i in range(needed_sessions):
            day_offset = (i * 30) // needed_sessions
            hour = hours[i % len(hours)]
            session_dt = base_date + timedelta(days=day_offset, hours=hour - 8, minutes=(i * 15) % 60)
            
            # Avoid Sunday (6)
            if session_dt.weekday() == 6:
                session_dt += timedelta(days=1)

            ls = LabSession(
                institution_id='inst-test-001',
                section_subject_id=ss_ids[i % len(ss_ids)],
                title=f'Scheduled Lab Session #{len(existing_sessions) + i + 1}',
                scheduled_at=session_dt,
                duration_minutes=90,
                status='completed',
                started_at=session_dt,
                ended_at=session_dt + timedelta(hours=1, minutes=30),
            )
            db.session.add(ls)
        db.session.commit()

    all_inst_sessions = LabSession.query.filter_by(institution_id='inst-test-001').order_by(LabSession.scheduled_at.asc()).limit(416).all()
    print(f'Active sessions ready for attendance seeding: {len(all_inst_sessions)}')

    # Target total records: 12,842 Present, 3,516 Absent (Total: 16,358)
    # Target overall rate: 78.4%
    total_target_present = 12842
    total_target_absent = 3516
    total_records = total_target_present + total_target_absent # 16358

    # Assign attendance records:
    # 1. Top 5 low-attendance students get exact missed and present sessions
    top_attendance = []
    for i, prof in enumerate(top_profiles):
        st = students[i]
        st_sess = all_inst_sessions[:prof['total']]
        missed_set = set(st_sess[:prof['missed']])
        for sess in st_sess:
            status = 'absent' if sess in missed_set else 'present'
            top_attendance.append((sess.id, st.id, status, sess.scheduled_at))

    # Remaining counts needed
    created_present = sum(1 for _, _, st, _ in top_attendance if st == 'present')
    created_absent = sum(1 for _, _, st, _ in top_attendance if st == 'absent')

    rem_present = total_target_present - created_present
    rem_absent = total_target_absent - created_absent

    # Distribute remaining records across other students and sessions
    other_students = students[5:]
    if not other_students:
        other_students = students

    # Target attendance probability by department:
    dept_rates = {
        'Computer Science & Engineering': 0.852,
        'Electronics & Communication': 0.786,
        'Information Technology': 0.764,
        'Mechanical Engineering': 0.721,
        'Civil Engineering': 0.698,
        'Electrical Engineering': 0.685,
        'Mathematics & Science': 0.823,
    }

    # Generate attendance entries
    batch_records = []
    # Add top student records first
    for sess_id, st_id, status, dt in top_attendance:
        batch_records.append(SessionAttendance(
            session_id=sess_id,
            student_id=st_id,
            status=status,
            joined_at=dt + timedelta(minutes=random.randint(1, 10)) if status == 'present' else None,
            total_time_seconds=random.randint(3000, 5400) if status == 'present' else 0,
            is_active_participant=(status == 'present'),
        ))

    # Create remaining records
    # Spread evenly across all 416 sessions
    records_per_session = (rem_present + rem_absent) // len(all_inst_sessions)
    
    current_present = created_present
    current_absent = created_absent

    for s_idx, sess in enumerate(all_inst_sessions):
        # Pick a slice of students for this session
        st_start = (s_idx * 17) % len(other_students)
        session_students = [other_students[(st_start + k) % len(other_students)] for k in range(records_per_session)]

        for st in session_students:
            # Check remaining quota
            if current_present < total_target_present and current_absent < total_target_absent:
                dept_name = st.department.name if st.department else 'Computer Science & Engineering'
                prob = dept_rates.get(dept_name, 0.784)
                is_pres = random.random() < prob
            elif current_present < total_target_present:
                is_pres = True
            elif current_absent < total_target_absent:
                is_pres = False
            else:
                break

            if is_pres:
                status = 'present'
                current_present += 1
            else:
                status = 'absent'
                current_absent += 1

            batch_records.append(SessionAttendance(
                session_id=sess.id,
                student_id=st.id,
                status=status,
                joined_at=sess.scheduled_at + timedelta(minutes=random.randint(1, 12)) if is_pres else None,
                total_time_seconds=random.randint(2800, 5400) if is_pres else 0,
                is_active_participant=is_pres,
            ))

    # Commit in chunks
    chunk_size = 2000
    for i in range(0, len(batch_records), chunk_size):
        db.session.bulk_save_objects(batch_records[i:i+chunk_size])
        db.session.commit()

    print(f'Successfully seeded {len(batch_records)} attendance records ({current_present} present, {current_absent} absent)!')
