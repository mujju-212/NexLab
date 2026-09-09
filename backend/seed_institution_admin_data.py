"""
Seed script for Institution Admin Dashboard:
- Renames institution to Greenwood Institute
- Seeds 12 batches, 18 instructors, 245 students, 36 subjects
- Seeds 2 active sessions and 4 upcoming sessions
- Seeds 5 recent AuditLog events for the live activity feed
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.academic import AcademicYear, Batch, Department, Section, SectionStudent, SectionSubject, AuditLog
from app.models.subject import Subject, EnvironmentProfile
from app.models.session import LabSession
from datetime import datetime, timedelta
import bcrypt, uuid

app = create_app('development')

DEPARTMENTS = [
    ('Computer Science & Engineering', 'CSE'),
    ('Artificial Intelligence & Machine Learning', 'AIML'),
    ('Data Science & Engineering', 'DSE'),
    ('Electronics & Communication', 'ECE'),
]

BATCH_NAMES = [
    'CS-2026', 'AI & ML - 2026', 'Data Science - 2026', 'Cybersecurity - 2025',
    'Information Tech - 2026', 'Software Engineering - 2026', 'Cloud Computing - 2025',
    'Robotics & IoT - 2026', 'Electronics & Comm - 2026', 'Electrical Eng - 2025',
    'Mechanical Eng - 2025', 'Bioinformatics - 2026',
]

INSTRUCTOR_NAMES = [
    'Dr. Priya Sharma', 'Prof. Rohan Mehta', 'Dr. Neha Kapoor', 'Prof. Vikram Singh',
    'Dr. Rajesh Kumar', 'Dr. Ananya Iyer', 'Prof. Amit Patel', 'Dr. Sunita Rao',
    'Prof. Karthik Nambiar', 'Dr. Meera Joshi', 'Prof. Sanjay Verma', 'Dr. Shalini Menon',
    'Prof. Deepak Nair', 'Dr. Kavita Reddy', 'Prof. Manoj Kulkarni', 'Dr. Ritu Saxena',
    'Prof. Suresh Pillai', 'Dr. Pooja Bhatt',
]

SUBJECT_NAMES = [
    ('Python Lab - List Comprehensions', 'CS101', 'Core Python programming and list abstractions'),
    ('Data Structures & Algorithms', 'CS102', 'Arrays, Linked Lists, Trees, and Graphs'),
    ('Object Oriented Programming', 'CS103', 'Classes, Polymorphism, Inheritance in C++ & Java'),
    ('Database Management Systems', 'CS104', 'Relational models, SQL queries, indexing, transactions'),
    ('Computer Networks', 'CS105', 'TCP/IP stack, routing protocols, socket programming'),
    ('Operating Systems', 'CS106', 'Process scheduling, virtual memory, concurrency, POSIX'),
    ('Web Technologies', 'CS107', 'Full-stack modern web development and APIs'),
    ('Software Engineering', 'CS108', 'Design patterns, UML, agile development, CI/CD'),
    ('Discrete Mathematics', 'CS109', 'Set theory, propositional logic, graph theory'),
    ('Computer Architecture', 'CS110', 'Instruction set architecture, pipelining, cache memory'),
    ('Machine Learning', 'AI201', 'Supervised and unsupervised learning, regression, clustering'),
    ('Deep Learning', 'AI202', 'Neural networks, CNNs, RNNs, PyTorch fundamentals'),
    ('Cloud Computing', 'CS203', 'Virtualization, AWS, microservices, containerization'),
    ('Artificial Intelligence', 'AI204', 'Search algorithms, heuristic search, knowledge representation'),
    ('Natural Language Processing', 'AI205', 'Tokenization, embeddings, transformers, LLM prompt engineering'),
    ('Cybersecurity Fundamentals', 'CS206', 'Cryptography, network defense, threat modeling'),
    ('Compiler Design', 'CS207', 'Lexical analysis, parsing, AST generation, code optimization'),
    ('Distributed Systems', 'CS208', 'Consensus algorithms, Raft, Paxos, replication, fault tolerance'),
    ('IoT Systems', 'EC201', 'Sensors, microcontrollers, MQTT, embedded C programming'),
    ('Digital Logic Design', 'EC202', 'Boolean algebra, combinational and sequential logic circuits'),
    ('Microprocessors', 'EC203', '8086 architecture, assembly language, memory interfacing'),
    ('Cryptography', 'CS210', 'Symmetric & asymmetric encryption, hashing, digital signatures'),
    ('Big Data Analytics', 'DS201', 'Hadoop, Spark, distributed data processing pipelines'),
    ('Mobile App Development', 'CS211', 'Cross-platform mobile application architecture'),
    ('DevOps & Infrastructure', 'CS212', 'Docker, Kubernetes, GitHub Actions, Terraform'),
    ('Computer Graphics', 'CS213', 'OpenGL, 3D transformations, ray tracing, shading'),
    ('Theory of Computation', 'CS214', 'Automata theory, context-free grammars, Turing machines'),
    ('Embedded Systems', 'EC204', 'RTOS, microcontroller firmware, hardware interrupts'),
    ('Information Retrieval', 'CS215', 'Search engine indexing, TF-IDF, vector space models'),
    ('Blockchain Basics', 'CS216', 'Distributed ledgers, smart contracts, Ethereum, cryptography'),
    ('Parallel Computing', 'CS217', 'OpenMP, MPI, CUDA, multi-threaded algorithms'),
    ('Human Computer Interaction', 'CS218', 'UX research, wireframing, cognitive walkthroughs, Figma'),
    ('Pattern Recognition', 'AI206', 'Feature extraction, classification, Bayes decision theory'),
    ('Computer Vision', 'AI207', 'Image filtering, edge detection, OpenCV, YOLO object detection'),
    ('Agile Methodologies', 'CS219', 'Scrum ceremonies, sprint planning, backlog grooming'),
    ('Software Testing & QA', 'CS220', 'Unit testing, integration testing, Cypress, PyTest'),
]

def hash_pw(pwd='Password123!'):
    return bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()

def seed_all():
    with app.app_context():
        # 1. Update institution
        admin = User.query.filter_by(role='institution_admin').first()
        if not admin:
            print("No institution admin found! Creating one...")
            admin = User(
                id=str(uuid.uuid4()),
                email='inst.admin@nexlab.demo',
                full_name='Greenwood Admin',
                role='institution_admin',
                password_hash=hash_pw('Admin@123'),
                is_active=True,
                institution_id='inst-test-001',
            )
            db.session.add(admin)
            db.session.flush()

        iid = admin.institution_id or 'inst-test-001'
        inst = db.session.get(Institution, iid)
        if not inst:
            inst = Institution(id=iid, name='Greenwood Institute', code='GREENWOOD', plan='pro', contact_email='admin@greenwood.edu')
            db.session.add(inst)
        else:
            inst.name = 'Greenwood Institute'
            inst.code = 'GREENWOOD'
            inst.plan = 'pro'
            inst.contact_email = 'admin@greenwood.edu'
        db.session.flush()
        print(f"Updated Institution: {inst.name} ({inst.id})")

        # 2. Academic Year
        ay = AcademicYear.query.filter_by(institution_id=iid, is_active=True).first()
        if not ay:
            ay = AcademicYear(id=str(uuid.uuid4()), institution_id=iid, year_label='2026-2027', is_active=True)
            db.session.add(ay)
            db.session.flush()

        # 3. Departments
        dept_map = {}
        for dname, dcode in DEPARTMENTS:
            dept = Department.query.filter_by(institution_id=iid, code=dcode).first()
            if not dept:
                dept = Department(id=str(uuid.uuid4()), institution_id=iid, name=dname, code=dcode)
                db.session.add(dept)
                db.session.flush()
            dept_map[dcode] = dept

        # 4. Batches (12)
        batch_objs = []
        for bname in BATCH_NAMES:
            b = Batch.query.filter_by(institution_id=iid, name=bname).first()
            if not b:
                b = Batch(id=str(uuid.uuid4()), institution_id=iid, name=bname, program='B.Tech', year_id=ay.id)
                db.session.add(b)
                db.session.flush()
            batch_objs.append(b)
        print(f"Batches verified: {len(batch_objs)}")

        # 5. Sections for batches
        section_objs = []
        for b in batch_objs:
            for sname in ['A', 'B']:
                sec = Section.query.filter_by(batch_id=b.id, name=sname).first()
                if not sec:
                    sec = Section(id=str(uuid.uuid4()), institution_id=iid, batch_id=b.id, name=sname)
                    db.session.add(sec)
                    db.session.flush()
                section_objs.append(sec)

        # 6. Instructors (18)
        instructor_objs = User.query.filter_by(institution_id=iid, role='instructor').all()
        pw_hash = hash_pw('Instructor@123')
        existing_emails = {u.email for u in instructor_objs}
        for i, iname in enumerate(INSTRUCTOR_NAMES):
            email = f"prof.{iname.lower().replace(' ', '.').replace('dr.', '').replace('prof.', '').strip('.')}@greenwood.edu"
            if email not in existing_emails:
                dept_code = DEPARTMENTS[i % len(DEPARTMENTS)][1]
                dept = dept_map.get(dept_code)
                new_inst = User(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    email=email,
                    full_name=iname,
                    role='instructor',
                    password_hash=pw_hash,
                    department_id=dept.id if dept else None,
                    is_active=True,
                )
                db.session.add(new_inst)
                instructor_objs.append(new_inst)
        db.session.flush()
        print(f"Total instructors: {len(instructor_objs)}")

        # 7. Subjects (36)
        env = EnvironmentProfile.query.first()
        env_id = env.id if env else None
        subject_objs = []
        existing_subjects = {s.name for s in Subject.query.filter_by(institution_id=iid).all()}
        for sname, scode, sdesc in SUBJECT_NAMES:
            if sname not in existing_subjects:
                subj = Subject(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    name=sname,
                    code=scode,
                    description=sdesc,
                    env_profile_id=env_id,
                    total_marks=100,
                )
                db.session.add(subj)
                subject_objs.append(subj)
            else:
                subject_objs.append(Subject.query.filter_by(institution_id=iid, name=sname).first())
        db.session.flush()
        print(f"Total subjects: {len(subject_objs)}")

        # 8. Students (bring up to 245)
        current_students = User.query.filter_by(institution_id=iid, role='student').count()
        needed = 245 - current_students
        student_pw = hash_pw('Student@123')
        print(f"Current students: {current_students}, adding {needed} more...")

        FIRST_NAMES = ['Aarav', 'Vihaan', 'Aditi', 'Rohan', 'Ananya', 'Ishaan', 'Diya', 'Kabir', 'Saanvi', 'Aryan',
                       'Tanvi', 'Dev', 'Mira', 'Arjun', 'Isha', 'Reyansh', 'Neha', 'Aditya', 'Pooja', 'Rahul',
                       'Meera', 'Gaurav', 'Nisha', 'Karan', 'Sneha', 'Varun', 'Rhea', 'Nikhil', 'Shreya', 'Manish']
        LAST_NAMES = ['Sharma', 'Verma', 'Patel', 'Rao', 'Gupta', 'Iyer', 'Nair', 'Mehta', 'Kapoor', 'Singh',
                      'Joshi', 'Kulkarni', 'Reddy', 'Menon', 'Bhatt', 'Saxena', 'Pillai', 'Nambiar', 'Kumar', 'Desai']

        if needed > 0:
            new_students = []
            for idx in range(needed):
                seq = current_students + idx + 1
                fn = FIRST_NAMES[idx % len(FIRST_NAMES)]
                ln = LAST_NAMES[(idx // len(FIRST_NAMES)) % len(LAST_NAMES)]
                full_name = f"{fn} {ln}"
                email = f"student.{seq}@greenwood.edu"
                roll_number = f"GW26-CS{seq:03d}"
                created_dt = datetime.utcnow() - timedelta(days=(idx % 60))
                s_user = User(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    email=email,
                    full_name=full_name,
                    role='student',
                    password_hash=student_pw,
                    roll_number=roll_number,
                    created_at=created_dt,
                    is_active=True,
                )
                db.session.add(s_user)
                new_students.append((s_user, idx))
            db.session.flush()

            for s_user, idx in new_students:
                sec_chosen = section_objs[idx % len(section_objs)]
                link = SectionStudent(section_id=sec_chosen.id, student_id=s_user.id)
                db.session.add(link)
            db.session.flush()
        print(f"Total students now: {User.query.filter_by(institution_id=iid, role='student').count()}")

        # 9. Sessions: 2 Active, 4 Upcoming
        now = datetime.utcnow()
        active_sess_data = [
            ('Python Lab - List Comprehensions', now - timedelta(minutes=45), now + timedelta(minutes=45), 'active'),
            ('DS Lab 1 - Stacks', now - timedelta(minutes=30), now + timedelta(minutes=60), 'active'),
        ]
        upcoming_sess_data = [
            ('OOP Concepts', now + timedelta(days=1, hours=2), now + timedelta(days=1, hours=4), 'scheduled'),
            ('Database Systems', now + timedelta(days=1, hours=5), now + timedelta(days=1, hours=7), 'scheduled'),
            ('Machine Learning - Linear Regression', now + timedelta(days=2, hours=1), now + timedelta(days=2, hours=3), 'scheduled'),
            ('Computer Networks - Socket Programming', now + timedelta(days=3, hours=3), now + timedelta(days=3, hours=5), 'scheduled'),
        ]

        from app.models.experiment import Experiment
        first_exp = Experiment.query.first()
        exp_id = first_exp.id if first_exp else None

        # Ensure SectionSubject exists for sessions
        ss = SectionSubject.query.filter_by(institution_id=iid).first()
        if not ss and section_objs and subject_objs and instructor_objs:
            ss = SectionSubject(
                id=str(uuid.uuid4()),
                institution_id=iid,
                section_id=section_objs[0].id,
                subject_id=subject_objs[0].id,
                instructor_id=instructor_objs[0].id,
            )
            db.session.add(ss)
            db.session.flush()

        ss_id = ss.id if ss else None

        # Set 2 active and 4 upcoming sessions
        existing_sessions = LabSession.query.filter_by(institution_id=iid).order_by(LabSession.created_at).all()
        all_sess_info = active_sess_data + upcoming_sess_data
        for idx, (title, start_t, end_t, stat) in enumerate(all_sess_info):
            if idx < len(existing_sessions):
                ls = existing_sessions[idx]
                ls.title = title
                ls.scheduled_at = start_t
                ls.started_at = start_t if stat == 'active' else None
                ls.ended_at = end_t if stat == 'ended' else None
                ls.status = stat
                if not ls.experiment_id:
                    ls.experiment_id = exp_id
                if not ls.section_subject_id:
                    ls.section_subject_id = ss_id
            else:
                ls = LabSession(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    title=title,
                    scheduled_at=start_t,
                    started_at=start_t if stat == 'active' else None,
                    ended_at=end_t if stat == 'ended' else None,
                    status=stat,
                    experiment_id=exp_id,
                    section_subject_id=ss_id,
                )
                db.session.add(ls)
        db.session.flush()
        print(f"Total sessions updated/seeded: {LabSession.query.filter_by(institution_id=iid).count()}")

        # 10. Audit Log Events (5 latest for Recent Activity)
        AuditLog.query.filter_by(institution_id=iid).delete()
        db.session.flush()

        recent_logs = [
            ('student_register', 'New student registered: Aarav Sharma joined CS-2026 batch', now - timedelta(hours=2)),
            ('instructor_create', 'New instructor added: Dr. Priya Sharma joined the institution', now - timedelta(hours=4)),
            ('batch_create', 'Batch created: AI & ML - 2026', now - timedelta(hours=6)),
            ('subject_create', 'Subject created: Object Oriented Programming', now - timedelta(days=1, hours=2)),
            ('session_schedule', 'Session scheduled: Python Lab - List Comprehensions', now - timedelta(days=1, hours=5)),
        ]

        for action, detail_text, ts in recent_logs:
            log_item = AuditLog(
                institution_id=iid,
                actor_id=admin.id,
                action=action,
                detail=detail_text,
                created_at=ts,
            )
            db.session.add(log_item)

        db.session.commit()
        print("ALL SEED DATA FOR GREENWOOD INSTITUTE COMMITTED SUCCESSFULLY!")

if __name__ == '__main__':
    seed_all()
