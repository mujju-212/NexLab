import json
from datetime import datetime, date
from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.academic import AcademicYear, Batch, Department, Section, SectionSubject
from app.models.subject import Subject
from app.models.user import User
from app.models.planner import RecurringPlan

def seed_planner():
    app = create_app()
    with app.app_context():
        # Ensure database tables are created
        db.create_all()

        # 1. Target Greenwood Institute
        inst = Institution.query.filter(Institution.name.ilike('%greenwood%')).first()
        if not inst:
            inst = Institution.query.first()
        if not inst:
            print("ERROR: No institution found to seed planner data into.")
            return

        print(f"Target Institution: {inst.name} ({inst.id})")

        # 2. Get or create Department (CSE)
        dept = Department.query.filter_by(institution_id=inst.id).filter(
            Department.code.ilike('CSE') | Department.name.ilike('%Computer Science%')
        ).first()
        if not dept:
            dept = Department(
                institution_id=inst.id,
                name="Computer Science & Engineering",
                code="CSE",
                color="#7c3aed",
                description="Department of Computer Science & Engineering"
            )
            db.session.add(dept)
            db.session.flush()

        # 3. Get or create Academic Year
        ay = AcademicYear.query.filter_by(institution_id=inst.id).first()
        if not ay:
            ay = AcademicYear(institution_id=inst.id, year_label="2026 - 2027", is_active=True)
            db.session.add(ay)
            db.session.flush()

        # 4. Get or create Batches
        batch_2026 = Batch.query.filter_by(institution_id=inst.id).filter(Batch.name.ilike('%2026%')).first()
        if not batch_2026:
            batch_2026 = Batch(institution_id=inst.id, year_id=ay.id, name="2026 (B.Tech)", program="B.Tech CSE")
            db.session.add(batch_2026)
            db.session.flush()

        batch_2028 = Batch.query.filter_by(institution_id=inst.id).filter(Batch.name.ilike('%2028%')).first()
        if not batch_2028:
            batch_2028 = Batch(institution_id=inst.id, year_id=ay.id, name="2028 (B.Tech)", program="B.Tech CSE")
            db.session.add(batch_2028)
            db.session.flush()

        # 5. Get or create Sections
        sec_a = Section.query.filter_by(institution_id=inst.id, batch_id=batch_2026.id, name="A").first()
        if not sec_a:
            sec_a = Section(institution_id=inst.id, batch_id=batch_2026.id, name="A", section_code="CSE-2026-A")
            db.session.add(sec_a)
            db.session.flush()

        sec_b = Section.query.filter_by(institution_id=inst.id, batch_id=batch_2026.id, name="B").first()
        if not sec_b:
            sec_b = Section(institution_id=inst.id, batch_id=batch_2026.id, name="B", section_code="CSE-2026-B")
            db.session.add(sec_b)
            db.session.flush()

        # 6. Fetch instructors
        instr = User.query.filter_by(institution_id=inst.id, role='instructor').first()
        instr_id = instr.id if instr else None

        # 7. Clear old recurring plans
        RecurringPlan.query.filter_by(institution_id=inst.id).delete()
        db.session.commit()

        # 8. Define the 12 recurring plans matching reference screenshot
        plans_data = [
            {
                'name': 'CSE Core Labs',
                'description': 'Core subjects lab schedule',
                'batch_id': batch_2026.id,
                'sections': ['A', 'B'],
                'subjects': [
                    {'id': 'sub1', 'name': 'Data Structures Lab', 'code': 'CS102'},
                    {'id': 'sub2', 'name': 'Computer Networks Lab', 'code': 'CS301'},
                    {'id': 'sub3', 'name': 'Database Systems Lab', 'code': 'CS104'}
                ],
                'schedule_days': ['Mon', 'Wed', 'Fri'],
                'start_time': '09:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 18,
            },
            {
                'name': 'Data Structures Labs',
                'description': 'DS lab for all sections',
                'batch_id': batch_2026.id,
                'sections': ['A'],
                'subjects': [
                    {'id': 'sub1', 'name': 'Data Structures Lab', 'code': 'CS102'}
                ],
                'schedule_days': ['Mon'],
                'start_time': '09:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 14,
            },
            {
                'name': 'Python Programming',
                'description': 'Lab schedule - Sem 1',
                'batch_id': batch_2026.id,
                'sections': ['A', 'B'],
                'subjects': [
                    {'id': 'sub4', 'name': 'Python Programming', 'code': 'CS205'}
                ],
                'schedule_days': ['Tue', 'Thu'],
                'start_time': '10:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 16,
            },
            {
                'name': 'Database Systems Lab',
                'description': 'DBMS lab sessions',
                'batch_id': batch_2028.id,
                'sections': ['B'],
                'subjects': [
                    {'id': 'sub3', 'name': 'Database Systems Lab', 'code': 'CS104'}
                ],
                'schedule_days': ['Wed'],
                'start_time': '02:00 PM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'draft',
                'sessions_generated_count': 0,
            },
            {
                'name': 'AI & ML Labs',
                'description': 'Elective lab schedule',
                'batch_id': batch_2026.id,
                'sections': ['A', 'B'],
                'subjects': [
                    {'id': 'sub5', 'name': 'Machine Learning Lab', 'code': 'CS305'},
                    {'id': 'sub6', 'name': 'Deep Learning Lab', 'code': 'CS308'}
                ],
                'schedule_days': ['Fri'],
                'start_time': '01:00 PM',
                'start_date': date(2026, 9, 15),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 12,
            },
            {
                'name': 'Networking Labs',
                'description': 'CN lab for section A',
                'batch_id': batch_2026.id,
                'sections': ['A'],
                'subjects': [
                    {'id': 'sub2', 'name': 'Computer Networks Lab', 'code': 'CS301'}
                ],
                'schedule_days': ['Thu'],
                'start_time': '11:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'paused',
                'sessions_generated_count': 8,
            },
            {
                'name': 'OOP Labs',
                'description': 'OOP lab (Python)',
                'batch_id': batch_2026.id,
                'sections': ['A', 'B'],
                'subjects': [
                    {'id': 'sub7', 'name': 'OOP Concepts Lab', 'code': 'CS111'}
                ],
                'schedule_days': ['Tue'],
                'start_time': '02:00 PM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 10,
            },
            {
                'name': 'Web Technologies',
                'description': 'Web dev lab schedule',
                'batch_id': batch_2028.id,
                'sections': ['B'],
                'subjects': [
                    {'id': 'sub8', 'name': 'Web Technologies Lab', 'code': 'CS208'}
                ],
                'schedule_days': ['Sat'],
                'start_time': '10:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 6,
            },
            {
                'name': 'Operating Systems Lab',
                'description': 'OS Kernel & Shell scripting labs',
                'batch_id': batch_2026.id,
                'sections': ['A'],
                'subjects': [
                    {'id': 'sub9', 'name': 'Operating Systems', 'code': 'CS202'}
                ],
                'schedule_days': ['Wed'],
                'start_time': '11:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 0,
            },
            {
                'name': 'Cloud Computing Lab',
                'description': 'AWS & Containerization practicals',
                'batch_id': batch_2026.id,
                'sections': ['B'],
                'subjects': [
                    {'id': 'sub10', 'name': 'Cloud Computing', 'code': 'CS401'}
                ],
                'schedule_days': ['Thu'],
                'start_time': '02:00 PM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 0,
            },
            {
                'name': 'Compiler Design Lab',
                'description': 'Lex & Yacc parser practicals',
                'batch_id': batch_2026.id,
                'sections': ['A', 'B'],
                'subjects': [
                    {'id': 'sub11', 'name': 'Compiler Design', 'code': 'CS304'}
                ],
                'schedule_days': ['Mon'],
                'start_time': '02:00 PM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'draft',
                'sessions_generated_count': 0,
            },
            {
                'name': 'Information Security Lab',
                'description': 'Cryptography & Penetration testing',
                'batch_id': batch_2028.id,
                'sections': ['A'],
                'subjects': [
                    {'id': 'sub12', 'name': 'Information Security', 'code': 'CS405'}
                ],
                'schedule_days': ['Fri'],
                'start_time': '10:00 AM',
                'start_date': date(2026, 9, 1),
                'end_date': date(2026, 12, 15),
                'status': 'active',
                'sessions_generated_count': 0,
            }
        ]

        total_gen = 0
        for item in plans_data:
            plan = RecurringPlan(
                institution_id=inst.id,
                name=item['name'],
                description=item['description'],
                department_id=dept.id,
                batch_id=item['batch_id'],
                academic_year_id=ay.id,
                sections_json=json.dumps(item['sections']),
                subjects_json=json.dumps(item['subjects']),
                schedule_days_json=json.dumps(item['schedule_days']),
                start_time=item['start_time'],
                duration_minutes=60,
                start_date=item['start_date'],
                end_date=item['end_date'],
                room='Lab 1 (Main Block)',
                instructor_id=instr_id,
                status=item['status'],
                sessions_generated_count=item['sessions_generated_count']
            )
            total_gen += item['sessions_generated_count']
            db.session.add(plan)

        db.session.commit()
        print(f"SUCCESS: Seeded {len(plans_data)} recurring plans with {total_gen} total generated sessions!")

if __name__ == '__main__':
    seed_planner()
