from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.session import LabSession
from app.models.academic import Department, Section, SectionStudent
from app.models.proctor_event import ProctorEvent
from datetime import datetime, timedelta
import random

app = create_app()
with app.app_context():
    inst = Institution.query.filter_by(id='inst-test-001').first()
    if not inst:
        print('Institution inst-test-001 not found')
        exit(1)

    print('Configuring exact students and seeding 128 proctor events for inst-test-001...')

    # Ensure departments
    cs_dept = Department.query.filter_by(institution_id='inst-test-001', name='Computer Science & Engineering').first()
    ec_dept = Department.query.filter_by(institution_id='inst-test-001', name='Electronics & Communication').first()
    me_dept = Department.query.filter_by(institution_id='inst-test-001', name='Mechanical Engineering').first()
    it_dept = Department.query.filter_by(institution_id='inst-test-001', name='Data Science & Engineering').first()

    students = User.query.filter_by(institution_id='inst-test-001', role='student').all()
    if len(students) < 86:
        print(f'Warning: only {len(students)} students found, need at least 86')

    # Configure top 5 students to match watchlist mockup exactly
    top_profiles = [
        {'name': 'Aarav Mehta', 'roll': 'STU2024001', 'dept': cs_dept, 'total': 12, 'high': 6, 'last_date': datetime(2026, 10, 15, 14, 32)},
        {'name': 'Diya Sharma', 'roll': 'STU2024015', 'dept': ec_dept, 'total': 8, 'high': 4, 'last_date': datetime(2026, 10, 14, 10, 21)},
        {'name': 'Rohan Verma', 'roll': 'STU2024023', 'dept': cs_dept, 'total': 7, 'high': 3, 'last_date': datetime(2026, 10, 13, 16, 45)},
        {'name': 'Sneha Iyer', 'roll': 'STU2024041', 'dept': it_dept or cs_dept, 'total': 5, 'high': 2, 'last_date': datetime(2026, 10, 12, 11, 8)},
        {'name': 'Karan Patel', 'roll': 'STU2024055', 'dept': me_dept, 'total': 4, 'high': 1, 'last_date': datetime(2026, 10, 11, 9, 17)},
    ]

    for i, prof in enumerate(top_profiles):
        st = students[i]
        st.full_name = prof['name']
        st.roll_number = prof['roll']
        if prof['dept']:
            st.department_id = prof['dept'].id
    db.session.commit()

    # Clear previous events
    ProctorEvent.query.filter_by(institution_id='inst-test-001').delete()
    db.session.commit()

    # Build exact pool of 128 events
    # Types:
    # tab_switch: 42
    # fullscreen_exit: 28
    # lockdown_violation: 24
    # screen_share_stop: 18
    # multiple_faces: 12
    # other: 6
    # Total = 128

    # Severities:
    # high: 68
    # medium: 36
    # low: 18
    # info: 6
    # Total = 128

    event_pool = (
        # High (68 total)
        [('tab_switch', 'high')] * 22 +
        [('fullscreen_exit', 'high')] * 18 +
        [('lockdown_violation', 'high')] * 18 +
        [('screen_share_stop', 'high')] * 6 +
        [('multiple_faces', 'high')] * 4 +
        # Medium (36 total)
        [('tab_switch', 'medium')] * 12 +
        [('fullscreen_exit', 'medium')] * 8 +
        [('lockdown_violation', 'medium')] * 6 +
        [('screen_share_stop', 'medium')] * 8 +
        [('multiple_faces', 'medium')] * 2 +
        # Low (18 total)
        [('tab_switch', 'low')] * 6 +
        [('fullscreen_exit', 'low')] * 2 +
        [('screen_share_stop', 'low')] * 4 +
        [('multiple_faces', 'low')] * 4 +
        [('other', 'low')] * 2 +
        # Info (6 total)
        [('tab_switch', 'info')] * 2 +
        [('other', 'info')] * 4
    )
    assert len(event_pool) == 128, f"Expected 128 events, got {len(event_pool)}"

    # Exact daily distribution over 13 milestones:
    # Sep 16 - Oct 16
    daily_targets = [
        (datetime(2026, 9, 16), 3),
        (datetime(2026, 9, 18), 5),
        (datetime(2026, 9, 21), 7),
        (datetime(2026, 9, 23), 8),
        (datetime(2026, 9, 25), 10),
        (datetime(2026, 9, 28), 7),
        (datetime(2026, 9, 30), 9),
        (datetime(2026, 10, 2), 11),
        (datetime(2026, 10, 5), 14),
        (datetime(2026, 10, 8), 16),
        (datetime(2026, 10, 10), 13),
        (datetime(2026, 10, 12), 15),
        (datetime(2026, 10, 15), 10),
    ]
    assert sum(cnt for _, cnt in daily_targets) == 128

    # Assign dates to the 128 events
    event_dates = []
    for dt, cnt in daily_targets:
        for _ in range(cnt):
            h = random.randint(9, 17)
            m = random.randint(5, 55)
            event_dates.append(dt.replace(hour=h, minute=m))

    # Separate events into high and non-high
    high_events = [e for e in event_pool if e[1] == 'high']
    other_events = [e for e in event_pool if e[1] != 'high']

    student_assignments = []

    # Assign to top 5 profiles
    for i, prof in enumerate(top_profiles):
        st = students[i]
        st_high = [high_events.pop() for _ in range(prof['high'])]
        st_other = [other_events.pop() for _ in range(prof['total'] - prof['high'])]
        st_events = st_high + st_other
        for j, ev in enumerate(st_events):
            if j == 0:
                dt = prof['last_date']
            else:
                dt = prof['last_date'] - timedelta(days=random.randint(1, 15), hours=random.randint(1, 12))
            student_assignments.append((st, ev[0], ev[1], dt))

    # Next 3 repeat offenders (students 5, 6, 7 each get 3 violations, 1 high each)
    for i in range(5, 8):
        st = students[i]
        st_events = [high_events.pop()] + [other_events.pop(), other_events.pop()]
        for ev in st_events:
            dt = datetime(2026, 10, 10) - timedelta(days=random.randint(1, 20), hours=random.randint(1, 8))
            student_assignments.append((st, ev[0], ev[1], dt))

    # Next 15 students get 1 high violation each (making exactly 5 + 3 + 15 = 23 high risk students!)
    for i in range(8, 23):
        st = students[i]
        ev = high_events.pop()
        dt = datetime(2026, 10, 9) - timedelta(days=random.randint(1, 22), hours=random.randint(1, 8))
        student_assignments.append((st, ev[0], ev[1], dt))

    # Any remaining high events distribute among remaining students
    # Remaining students up to 86 unique students
    curr_st_idx = 23
    while high_events:
        st = students[curr_st_idx % min(len(students), 86)]
        ev = high_events.pop()
        dt = datetime(2026, 10, 8) - timedelta(days=random.randint(1, 20), hours=random.randint(1, 8))
        student_assignments.append((st, ev[0], ev[1], dt))
        curr_st_idx += 1

    # Remaining other events distribute up to index 86
    while other_events:
        st = students[curr_st_idx % min(len(students), 86)]
        ev = other_events.pop()
        dt = datetime(2026, 10, 8) - timedelta(days=random.randint(1, 20), hours=random.randint(1, 8))
        student_assignments.append((st, ev[0], ev[1], dt))
        curr_st_idx += 1

    assert len(student_assignments) == 128

    # Retrieve actual sessions from the database
    real_sessions = LabSession.query.all()
    if not real_sessions:
        print('No LabSession found in db')
        exit(1)
    
    # Save to ProctorEvent
    for idx, (st, etype, sev, dt) in enumerate(student_assignments):
        sess = real_sessions[idx % len(real_sessions)]
        pe = ProctorEvent(
            institution_id='inst-test-001',
            session_id=sess.id,
            student_id=st.id,
            event_type=etype,
            severity=sev,
            payload={'details': f'{etype} during proctored exam', 'confidence': 0.96},
            recorded_at=dt
        )
        db.session.add(pe)

    db.session.commit()
    print('Seeding completed successfully with 128 events across 86 students and 214 sessions!')
