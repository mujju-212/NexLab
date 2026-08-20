# -*- coding: utf-8 -*-
"""
seed_institution_demo.py
Populates the existing demo institution (inst-test-001, "NexLab Demo University")
with a full academic dataset so the admin -> instructor -> session flow can be
demonstrated end to end:

  * Departments (CSE, ECE, ME)
  * Academic year 2024-2025
  * Batches + Sections (A / B)
  * Subjects (with course codes)
  * Instructors + Students (with proper details)
  * Section enrollments (SectionStudent)
  * Subject -> section -> instructor assignments (SectionSubject)

Idempotent: every entity is looked up by a natural key first, so re-running
only fills gaps. Safe to run repeatedly.

Run:  python database/seed_institution_demo.py
Prereq: database/seed_test_users.py (institution + base role users) has run.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
from app.models.academic import (
    Department, AcademicYear, Batch, Section, SectionStudent, SectionSubject,
)
from app.models.subject import Subject, EnvironmentProfile
import bcrypt
import uuid
from datetime import datetime

app = create_app()

INST_ID = 'inst-test-001'
DEMO_PASSWORD = 'Passw0rd@123'
_PW_HASH = None  # computed once inside app context


def _hash():
    global _PW_HASH
    if _PW_HASH is None:
        _PW_HASH = bcrypt.hashpw(DEMO_PASSWORD.encode(), bcrypt.gensalt()).decode()
    return _PW_HASH

# ── Static data ────────────────────────────────────────────────────────────

DEPARTMENTS = [
    {'name': 'Computer Science & Engineering', 'code': 'CSE'},
    {'name': 'Electronics & Communication',    'code': 'ECE'},
    {'name': 'Mechanical Engineering',         'code': 'ME'},
]

YEAR_LABEL = '2024-2025'

# batch name -> (dept code, program)
BATCHES = [
    {'name': 'CSE 2nd Year', 'dept': 'CSE', 'program': 'B.E. CSE'},
    {'name': 'ECE 2nd Year', 'dept': 'ECE', 'program': 'B.E. ECE'},
    {'name': 'ME 2nd Year',  'dept': 'ME',  'program': 'B.E. ME'},
]

# subjects live under CSE (that is where the experiment/content demo runs)
SUBJECTS = [
    {'name': 'Data Structures',       'code': 'CS3401', 'description': 'Arrays, lists, trees, graphs, and complexity analysis.'},
    {'name': 'Database Management',   'code': 'CS3492', 'description': 'Relational model, SQL, normalization, transactions.'},
    {'name': 'Object Oriented Programming', 'code': 'CS3391', 'description': 'OOP principles with Java.'},
    {'name': 'Operating Systems',     'code': 'CS3451', 'description': 'Processes, scheduling, memory, file systems.'},
    {'name': 'Python Programming',    'code': 'CS3111', 'description': 'Core Python, data handling, scripting.'},
]

# instructors (instructor@nexlab.demo already exists from seed_test_users.py)
INSTRUCTORS = [
    {'email': 'instructor@nexlab.demo', 'full_name': 'Dr. Arun Mehta',    'staff_id': 'NDU-FAC-001', 'dept': 'CSE', 'phone': '+919800000101'},
    {'email': 'priya.sharma@nexlab.demo', 'full_name': 'Prof. Priya Sharma', 'staff_id': 'NDU-FAC-002', 'dept': 'CSE', 'phone': '+919800000102'},
    {'email': 'rajesh.kumar@nexlab.demo', 'full_name': 'Dr. Rajesh Kumar',   'staff_id': 'NDU-FAC-003', 'dept': 'ECE', 'phone': '+919800000103'},
    {'email': 'anita.desai@nexlab.demo',  'full_name': 'Prof. Anita Desai',   'staff_id': 'NDU-FAC-004', 'dept': 'ME',  'phone': '+919800000104'},
]

# 24 students. #1 is the existing student@nexlab.demo (roll NDU2024001).
_STUDENT_NAMES = [
    'Aarav Sharma', 'Diya Patel', 'Vivaan Reddy', 'Ananya Iyer', 'Aditya Nair',
    'Ishita Gupta', 'Arjun Menon', 'Saanvi Rao', 'Krishna Verma', 'Myra Joshi',
    'Reyansh Das', 'Aadhya Pillai', 'Vihaan Bose', 'Anaya Kulkarni', 'Kabir Malhotra',
    'Navya Shetty', 'Shaurya Ghosh', 'Kiara Chauhan', 'Atharv Jain', 'Pari Deshmukh',
    'Advik Kapoor', 'Riya Bhat', 'Dhruv Saxena', 'Aisha Khan',
]

def _get_or_create(model, defaults=None, **lookup):
    """Return (obj, created). Look up by **lookup; if absent, create with lookup+defaults."""
    obj = model.query.filter_by(**lookup).first()
    if obj:
        return obj, False
    params = dict(lookup)
    params.update(defaults or {})
    obj = model(**params)
    db.session.add(obj)
    db.session.flush()
    return obj, True


def _mk_student(idx, name, dept_id):
    """Build a student User dict for the given 1-based index."""
    roll = f'NDU2024{idx:03d}'
    first = name.split()[0].lower()
    email = f'{first}.{roll[-3:]}@nexlab.demo'
    return {
        'email': email,
        'full_name': name,
        'roll_number': roll,
        'department_id': dept_id,
        'year_of_study': 2,
        'semester': 3,
        'phone': f'+9198111{idx:05d}',
    }


with app.app_context():
    created = {'dept': 0, 'year': 0, 'batch': 0, 'section': 0,
               'subject': 0, 'instructor': 0, 'student': 0,
               'enroll': 0, 'assign': 0}

    inst = Institution.query.filter_by(id=INST_ID).first()
    if not inst:
        print(f'[ABORT] Institution {INST_ID} not found. Run seed_test_users.py first.')
        sys.exit(1)

    # 1. Departments
    depts = {}
    for d in DEPARTMENTS:
        obj, was_new = _get_or_create(Department, institution_id=INST_ID, code=d['code'],
                                      defaults={'name': d['name']})
        depts[d['code']] = obj
        created['dept'] += was_new

    # 2. Academic year
    year, was_new = _get_or_create(AcademicYear, institution_id=INST_ID, year_label=YEAR_LABEL,
                                   defaults={'is_active': True})
    created['year'] += was_new

    # 3. Batches
    batches = {}
    for b in BATCHES:
        obj, was_new = _get_or_create(Batch, institution_id=INST_ID, name=b['name'],
                                      defaults={'year_id': year.id, 'program': b['program']})
        batches[b['dept']] = obj
        created['batch'] += was_new

    # 4. Instructors
    instructors = {}
    for it in INSTRUCTORS:
        obj = User.query.filter_by(email=it['email']).first()
        if not obj:
            obj = User(
                id=str(uuid.uuid4()), email=it['email'], password_hash=_hash(),
                full_name=it['full_name'], role='instructor', institution_id=INST_ID,
                staff_id=it['staff_id'], department_id=depts[it['dept']].id,
                phone=it['phone'], is_active=True, created_at=datetime.utcnow(),
            )
            db.session.add(obj)
            db.session.flush()
            created['instructor'] += 1
        else:
            # backfill details on the pre-existing instructor@nexlab.demo
            obj.staff_id = obj.staff_id or it['staff_id']
            obj.department_id = obj.department_id or depts[it['dept']].id
            obj.phone = obj.phone or it['phone']
        instructors[it['email']] = obj

    # 5. Sections — A & B per batch; CSE class teachers are the first two instructors
    sections = {}   # (dept_code, section_name) -> Section
    teacher_cycle = list(instructors.values())
    for i, (dept_code, batch) in enumerate(batches.items()):
        for j, sec_name in enumerate(('A', 'B')):
            teacher = teacher_cycle[(i + j) % len(teacher_cycle)]
            obj, was_new = _get_or_create(
                Section, batch_id=batch.id, name=sec_name,
                defaults={'institution_id': INST_ID, 'class_teacher_id': teacher.id})
            sections[(dept_code, sec_name)] = obj
            created['section'] += was_new

    # 6. Subjects (link to a platform-default env profile if one exists)
    default_env = EnvironmentProfile.query.filter_by(is_platform_default=True).first()
    subjects = {}
    for s in SUBJECTS:
        obj, was_new = _get_or_create(
            Subject, institution_id=INST_ID, code=s['code'],
            defaults={'name': s['name'], 'description': s['description'],
                      'env_profile_id': default_env.id if default_env else None})
        subjects[s['code']] = obj
        created['subject'] += was_new

    # 7. Students — all in CSE for the demo (24 total; #1 is the existing student)
    cse_dept_id = depts['CSE'].id
    student_objs = []
    for idx, name in enumerate(_STUDENT_NAMES, start=1):
        if idx == 1:
            obj = User.query.filter_by(email='student@nexlab.demo').first()
            if obj:
                obj.roll_number = obj.roll_number or 'NDU2024001'
                obj.department_id = obj.department_id or cse_dept_id
                obj.year_of_study = obj.year_of_study or 2
                obj.semester = obj.semester or 3
                student_objs.append(obj)
                continue
        sd = _mk_student(idx, name, cse_dept_id)
        obj = User.query.filter_by(email=sd['email']).first()
        if not obj:
            obj = User(
                id=str(uuid.uuid4()), email=sd['email'], password_hash=_hash(),
                full_name=sd['full_name'], role='student', institution_id=INST_ID,
                roll_number=sd['roll_number'], department_id=sd['department_id'],
                year_of_study=sd['year_of_study'], semester=sd['semester'],
                phone=sd['phone'], is_active=True, created_at=datetime.utcnow(),
            )
            db.session.add(obj)
            db.session.flush()
            created['student'] += 1
        student_objs.append(obj)

    # 8. Enrollments — first 12 -> CSE-A, next 12 -> CSE-B
    for i, stu in enumerate(student_objs):
        sec = sections[('CSE', 'A' if i < 12 else 'B')]
        exists = SectionStudent.query.filter_by(section_id=sec.id, student_id=stu.id).first()
        if not exists:
            db.session.add(SectionStudent(section_id=sec.id, student_id=stu.id))
            created['enroll'] += 1

    # 9. Assignments — every CSE subject to both CSE sections, rotating instructors
    instr_list = list(instructors.values())
    for sec_name in ('A', 'B'):
        sec = sections[('CSE', sec_name)]
        for k, code in enumerate(subjects):
            subj = subjects[code]
            exists = SectionSubject.query.filter_by(section_id=sec.id, subject_id=subj.id).first()
            if not exists:
                db.session.add(SectionSubject(
                    id=str(uuid.uuid4()), institution_id=INST_ID,
                    section_id=sec.id, subject_id=subj.id,
                    instructor_id=instr_list[k % len(instr_list)].id))
                created['assign'] += 1

    db.session.commit()

    # 10. Summary
    print('\n' + '=' * 60)
    print('  NexLab Demo University (inst-test-001) — academic seed')
    print('=' * 60)
    print(f'  Departments created : {created["dept"]}  (total {Department.query.filter_by(institution_id=INST_ID).count()})')
    print(f'  Academic years      : {created["year"]}  ({YEAR_LABEL})')
    print(f'  Batches created     : {created["batch"]}')
    print(f'  Sections created    : {created["section"]}')
    print(f'  Subjects created    : {created["subject"]}  (total {Subject.query.filter_by(institution_id=INST_ID).count()})')
    print(f'  Instructors created : {created["instructor"]}')
    print(f'  Students created    : {created["student"]}')
    print(f'  Enrollments created : {created["enroll"]}')
    print(f'  Assignments created : {created["assign"]}')
    print('=' * 60)
    print('  Instructor logins (password for all seeded accounts below):')
    for it in INSTRUCTORS:
        print(f'    {it["email"]:34s}  {it["full_name"]}')
    print(f'  Shared demo password: {DEMO_PASSWORD}')
    print(f'  Students: {len(_STUDENT_NAMES)} in CSE 2nd Year (Sections A & B)')
    print('=' * 60)
    print('[DONE] Academic dataset committed.')





