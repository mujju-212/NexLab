"""
Seed 128 real history sessions for Greenwood Institute (inst-test-001)
matching the exact distribution and top sessions in the reference design:
- Total Sessions: 128
- Completed: 112
- Cancelled: 8
- Rescheduled: 8
- By subject:
  * Data Structures (CS102): 28
  * Python Programming (CS205/CS3111): 24
  * Database Systems (CS104): 20
  * Computer Networks (CS301/CS105): 18
  * OOP Concepts (CS111/CS201): 16
  * Others (Machine Learning CS407, Web Technologies CS206, OS CS3451): 22
- Top featured sessions for Sep 1 - Sep 10, 2026:
  1. 10 Sep 2026, 09:00 - 11:00 AM | Data Structures Lab (Lab 1 — Linked Lists) | CS102 | Sec A | Dr. Rohan Kulkarni | 28/30 (93%) | completed
  2. 9 Sep 2026, 02:00 - 04:00 PM | Python Lab (Lab 2 — Functions) | CS205 | Sec B | Dr. Neha Iyer | 26/32 (81%) | completed
  3. 8 Sep 2026, 11:30 AM - 01:30 PM | Database Systems Lab (Lab 3 — SQL Queries) | CS104 | Sec A | Prof. Sneha Patil | 24/30 (80%) | completed
  4. 7 Sep 2026, 09:00 - 11:00 AM | Computer Networks Lab (Lab 1 — Basics) | CS301 | Sec B | Dr. Amit Sharma | 0/30 (0%) | cancelled
  5. 5 Sep 2026, 02:00 - 04:00 PM | OOP Concepts Lab (Lab 2 — Inheritance) | CS111 | Sec A | Dr. Rohan Kulkarni | 27/30 (90%) | completed
  6. 3 Sep 2026, 10:00 - 12:00 PM | Machine Learning Lab (Lab 1 — Linear Regression) | CS407 | Sec B | Dr. Neha Iyer | 25/28 (89%) | completed
  7. 1 Sep 2026, 01:00 - 03:00 PM | Web Technologies Lab (Lab 1 — HTML & CSS) | CS206 | Sec A | Prof. Sneha Patil | 22/30 (73%) | rescheduled
"""
import uuid
import random
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.session import LabSession, SessionAttendance
from app.models.academic import SectionSubject, Section, SectionStudent, Batch, AcademicYear, Department
from app.models.subject import Subject
from app.models.user import User

app = create_app('development')

with app.app_context():
    admin = User.query.filter_by(email='inst.admin@nexlab.demo').first()
    if not admin:
        print("Admin inst.admin@nexlab.demo not found!")
        exit(1)

    iid = admin.institution_id
    print(f"Target Institution ID: {iid}")

    # Don't delete sessions that have foreign key dependencies (code_attempts, etc.).
    # Instead, we will mark any existing non-scheduled sessions and create what is needed so the total reaches 128.
    existing_history = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.status.in_(['completed', 'ended', 'cancelled', 'rescheduled'])
    ).all()
    print(f"Found {len(existing_history)} existing history sessions in DB.")

    from werkzeug.security import generate_password_hash

    # Find or prepare instructors
    def get_or_create_inst(name, email):
        u = User.query.filter_by(email=email).first()
        if not u:
            u = User(
                email=email,
                password_hash=generate_password_hash('password123'),
                full_name=name,
                role='instructor',
                institution_id=iid,
                is_active=True
            )
            db.session.add(u)
            db.session.commit()
        return u

    inst_rohan = get_or_create_inst("Dr. Rohan Kulkarni", "rohan.k@greenwood.edu")
    inst_neha = get_or_create_inst("Dr. Neha Iyer", "neha.i@greenwood.edu")
    inst_sneha = get_or_create_inst("Prof. Sneha Patil", "sneha.p@greenwood.edu")
    inst_amit = get_or_create_inst("Dr. Amit Sharma", "amit.s@greenwood.edu")
    inst_priya = get_or_create_inst("Dr. Priya Sharma", "priya.s@greenwood.edu")

    # Find sections A and B
    sec_a = Section.query.filter_by(institution_id=iid, name='A').first()
    sec_b = Section.query.filter_by(institution_id=iid, name='B').first()
    if not sec_a:
        sec_a = Section.query.filter_by(institution_id=iid).first()
    if not sec_b:
        sec_b = sec_a

    # Find or create subjects with exact codes
    def get_or_create_subject(name, code):
        s = Subject.query.filter_by(institution_id=iid, code=code).first()
        if not s:
            s = Subject(
                institution_id=iid,
                name=name,
                code=code,
                description=f"{name} course"
            )
            db.session.add(s)
            db.session.commit()
        return s

    sub_ds = get_or_create_subject("Data Structures", "CS102")
    sub_py = get_or_create_subject("Python Programming", "CS205")
    sub_db = get_or_create_subject("Database Systems", "CS104")
    sub_cn = get_or_create_subject("Computer Networks", "CS301")
    sub_oop = get_or_create_subject("OOP Concepts", "CS111")
    sub_ml = get_or_create_subject("Machine Learning Lab", "CS407")
    sub_web = get_or_create_subject("Web Technologies", "CS206")
    sub_os = get_or_create_subject("Operating Systems", "CS3451")

    # Bind SectionSubjects
    def get_or_create_ss(sec, subj, inst):
        ss = SectionSubject.query.filter_by(section_id=sec.id, subject_id=subj.id).first()
        if not ss:
            ss = SectionSubject(
                institution_id=iid,
                section_id=sec.id,
                subject_id=subj.id,
                instructor_id=inst.id
            )
            db.session.add(ss)
            db.session.commit()
        return ss

    ss_ds_a = get_or_create_ss(sec_a, sub_ds, inst_rohan)
    ss_py_b = get_or_create_ss(sec_b, sub_py, inst_neha)
    ss_db_a = get_or_create_ss(sec_a, sub_db, inst_sneha)
    ss_cn_b = get_or_create_ss(sec_b, sub_cn, inst_amit)
    ss_oop_a = get_or_create_ss(sec_a, sub_oop, inst_rohan)
    ss_ml_b = get_or_create_ss(sec_b, sub_ml, inst_neha)
    ss_web_a = get_or_create_ss(sec_a, sub_web, inst_sneha)
    ss_os_a = get_or_create_ss(sec_a, sub_os, inst_priya)

    # 1. First insert the exact 7 featured sessions on page 1
    featured = [
        {
            "title": "Data Structures Lab — Lab 1 — Linked Lists",
            "scheduled_at": datetime(2026, 9, 10, 9, 0),
            "duration": 120,
            "status": "completed",
            "ss": ss_ds_a,
            "room": "Lab 1 (Main Block)",
            "attended": 28,
            "total": 30,
            "notes": "Covered basic concepts of linked lists, implementation in Python. Good participation from students."
        },
        {
            "title": "Python Lab — Lab 2 — Functions",
            "scheduled_at": datetime(2026, 9, 9, 14, 0),
            "duration": 120,
            "status": "completed",
            "ss": ss_py_b,
            "room": "Lab 2 (Network Lab)",
            "attended": 26,
            "total": 32,
            "notes": "Focused on lambda functions, map/filter/reduce, and list comprehensions."
        },
        {
            "title": "Database Systems Lab — Lab 3 — SQL Queries",
            "scheduled_at": datetime(2026, 9, 8, 11, 30),
            "duration": 120,
            "status": "completed",
            "ss": ss_db_a,
            "room": "Lab 1 (Main Block)",
            "attended": 24,
            "total": 30,
            "notes": "Complex nested subqueries, grouping, joins, and aggregate functions covered."
        },
        {
            "title": "Computer Networks Lab — Lab 1 — Basics",
            "scheduled_at": datetime(2026, 9, 7, 9, 0),
            "duration": 120,
            "status": "cancelled",
            "ss": ss_cn_b,
            "room": "Lab 3 (Systems Block)",
            "attended": 0,
            "total": 30,
            "notes": "Session cancelled due to network switch maintenance in Main Block."
        },
        {
            "title": "OOP Concepts Lab — Lab 2 — Inheritance",
            "scheduled_at": datetime(2026, 9, 5, 14, 0),
            "duration": 120,
            "status": "completed",
            "ss": ss_oop_a,
            "room": "Lab 1 (Main Block)",
            "attended": 27,
            "total": 30,
            "notes": "Single, multi-level, and multiple inheritance via interfaces in Java/Python."
        },
        {
            "title": "Machine Learning Lab — Lab 1 — Linear Regression",
            "scheduled_at": datetime(2026, 9, 3, 10, 0),
            "duration": 120,
            "status": "completed",
            "ss": ss_ml_b,
            "room": "Lab 2 (Network Lab)",
            "attended": 25,
            "total": 28,
            "notes": "Hands-on gradient descent optimization, cost function visualization with Matplotlib."
        },
        {
            "title": "Web Technologies Lab — Lab 1 — HTML & CSS",
            "scheduled_at": datetime(2026, 9, 1, 13, 0),
            "duration": 120,
            "status": "rescheduled",
            "ss": ss_web_a,
            "room": "Lab 1 (Main Block)",
            "attended": 22,
            "total": 30,
            "notes": "Rescheduled slot to accommodate orientation session."
        },
    ]

    all_sessions_to_create = []

    # Track subject counts:
    # Target: DS: 28, Py: 24, DB: 20, CN: 18, OOP: 16, Others: 22 -> Total: 128
    # Target status: Completed: 112, Cancelled: 8, Rescheduled: 8 -> Total: 128
    curr_counts = {
        "ds": 1,
        "py": 1,
        "db": 1,
        "cn": 1,
        "oop": 1,
        "others": 2 # ml, web
    }
    curr_status = {
        "completed": 5,
        "cancelled": 1,
        "rescheduled": 1
    }

    # Add the 7 featured
    for f in featured:
        all_sessions_to_create.append(f)

    # Now generate the remaining 121 sessions:
    # Remaining subjects needed:
    # ds: 27, py: 23, db: 19, cn: 17, oop: 15, others: 20
    # Remaining statuses needed:
    # completed: 107, cancelled: 7, rescheduled: 7
    subject_pools = [
        ("ds", ss_ds_a, "Data Structures Lab", 27),
        ("py", ss_py_b, "Python Programming Lab", 23),
        ("db", ss_db_a, "Database Systems Lab", 19),
        ("cn", ss_cn_b, "Computer Networks Lab", 17),
        ("oop", ss_oop_a, "OOP Concepts Lab", 15),
        ("others", ss_ml_b, "Machine Learning Lab", 8),
        ("others", ss_web_a, "Web Technologies Lab", 7),
        ("others", ss_os_a, "Operating Systems Lab", 5),
    ]

    needed_records = []
    for key, ss, title_prefix, count in subject_pools:
        for i in range(count):
            needed_records.append((key, ss, title_prefix, i + 1))

    # Mark existing history sessions as completed
    for s in existing_history:
        s.status = 'completed'
    db.session.commit()

    needed_total = 128 - 7 - len(existing_history) # 121 - 6 = 115
    needed_records = needed_records[:needed_total]
    statuses = (['cancelled'] * 7) + (['rescheduled'] * 7)
    while len(statuses) < needed_total:
        statuses.append('completed')
    statuses = statuses[:needed_total]
    random.seed(42)
    random.shuffle(statuses)

    # Dates spread between Aug 10, 2026 and Sep 9, 2026
    start_dt = datetime(2026, 8, 10, 9, 0)

    for idx, (s_type, ss, title_prefix, num) in enumerate(needed_records):
        st = statuses[idx]
        # Spread dates
        day_offset = int((idx / len(needed_records)) * 28) # 0 to 28 days
        hour = 9 if (idx % 3 == 0) else (14 if (idx % 3 == 1) else 11)
        minute = 0 if (idx % 2 == 0) else 30
        sched = start_dt + timedelta(days=day_offset, hours=hour - 9, minutes=minute)

        tot = 30
        if st == 'cancelled':
            att = 0
        elif st == 'rescheduled':
            att = random.randint(20, 24)
        else:
            att = random.randint(24, 29)

        all_sessions_to_create.append({
            "title": f"{title_prefix} — Session {num}",
            "scheduled_at": sched,
            "duration": 120,
            "status": st,
            "ss": ss,
            "room": f"Lab {(idx % 3) + 1} (Main Block)",
            "attended": att,
            "total": tot,
            "notes": f"Standard curriculum session for {title_prefix} covered with lab exercises."
        })

    print(f"Total sessions prepared: {len(all_sessions_to_create)}")

    # Sort sessions newest first
    all_sessions_to_create.sort(key=lambda s: s["scheduled_at"], reverse=True)

    # Insert into DB
    for sess_data in all_sessions_to_create:
        sess = LabSession(
            institution_id=iid,
            section_subject_id=sess_data["ss"].id,
            title=sess_data["title"],
            scheduled_at=sess_data["scheduled_at"],
            duration_minutes=sess_data["duration"],
            status=sess_data["status"],
            jitsi_room_name=sess_data["room"],
            started_at=sess_data["scheduled_at"] if sess_data["status"] != 'cancelled' else None,
            ended_at=(sess_data["scheduled_at"] + timedelta(minutes=sess_data["duration"])) if sess_data["status"] != 'cancelled' else None,
        )
        db.session.add(sess)

    db.session.commit()

    # Verify counts
    total_in_db = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.status.in_(['completed', 'cancelled', 'rescheduled'])
    ).count()
    completed_in_db = LabSession.query.filter_by(institution_id=iid, status='completed').count()
    cancelled_in_db = LabSession.query.filter_by(institution_id=iid, status='cancelled').count()
    rescheduled_in_db = LabSession.query.filter_by(institution_id=iid, status='rescheduled').count()

    print(f"Successfully seeded {total_in_db} real history sessions!")
    print(f"  Completed: {completed_in_db}")
    print(f"  Cancelled: {cancelled_in_db}")
    print(f"  Rescheduled: {rescheduled_in_db}")
