"""
Seed real grade records, sessions, and subject mappings for Greenwood Institute (inst-test-001)
so the Grades & Marks analytics page computes from actual database rows matching the target UI.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import random
import uuid
from datetime import datetime, timedelta

from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.subject import Subject
from app.models.academic import Department, Section, SectionSubject, SectionStudent, AcademicYear
from app.models.experiment import Experiment
from app.models.session import LabSession
from app.models.grading import Grade

app = create_app('development')

TARGET_SUBJECTS = [
    # Top performing
    {"name": "Data Structures", "code": "CS201", "dept": "CSE", "target_gpa": 3.82, "pass_rate": 98.4},
    {"name": "Operating Systems", "code": "CS202", "dept": "CSE", "target_gpa": 3.71, "pass_rate": 96.2},
    {"name": "Computer Networks", "code": "CS203", "dept": "CSE", "target_gpa": 3.68, "pass_rate": 94.7},
    {"name": "Database Systems", "code": "CS204", "dept": "CSE", "target_gpa": 3.54, "pass_rate": 93.1},
    {"name": "Mathematics - II", "code": "MA201", "dept": "CSE", "target_gpa": 3.49, "pass_rate": 91.8},
    # Needs attention
    {"name": "Engineering Physics", "code": "PHY101", "dept": "ECE", "target_gpa": 2.11, "pass_rate": 68.9},
    {"name": "Engineering Chemistry", "code": "CHM101", "dept": "ME", "target_gpa": 2.32, "pass_rate": 72.1},
    {"name": "Mathematics - I", "code": "MA101", "dept": "CSE", "target_gpa": 2.48, "pass_rate": 76.3},
    {"name": "Basic Electrical", "code": "EE101", "dept": "ECE", "target_gpa": 2.61, "pass_rate": 78.4},
    {"name": "Environmental Science", "code": "ENV101", "dept": "ME", "target_gpa": 2.74, "pass_rate": 81.0},
]

def seed_grades_data():
    with app.app_context():
        inst_id = 'inst-test-001'
        inst = Institution.query.get(inst_id)
        if not inst:
            print(f"Error: Institution {inst_id} not found!")
            return

        print(f"Seeding Grades & Marks data for: {inst.name} ({inst_id})")

        # 1. Fetch departments
        depts = Department.query.filter_by(institution_id=inst_id).all()
        dept_map = {d.code: d.id for d in depts}
        fallback_dept_id = depts[0].id if depts else None

        # 2. Fetch sections
        sections = Section.query.filter_by(institution_id=inst_id).all()
        if not sections:
            print("No sections found for institution!")
            return
        section_ids = [s.id for s in sections]

        # 3. Fetch students
        students = User.query.filter_by(institution_id=inst_id, role='student').all()
        if not students:
            print("No students found for institution!")
            return
        print(f"Found {len(students)} students in {inst.name}")

        # 4. Fetch an instructor for sessions
        instructor = User.query.filter_by(institution_id=inst_id, role='instructor').first()
        instructor_id = instructor.id if instructor else None

        # 5. Ensure target subjects exist
        subject_objs = {}
        for s_info in TARGET_SUBJECTS:
            subj = Subject.query.filter_by(institution_id=inst_id, name=s_info['name']).first()
            dept_id = dept_map.get(s_info['dept'], fallback_dept_id)
            if not subj:
                subj = Subject(
                    id=str(uuid.uuid4()),
                    institution_id=inst_id,
                    name=s_info['name'],
                    code=s_info['code'],
                    description=f"{s_info['name']} course curriculum",
                    department_id=dept_id,
                    subject_type='lab',
                    is_active=True,
                    total_marks=100
                )
                db.session.add(subj)
                db.session.flush()
                print(f"Created Subject: {subj.name} ({subj.code})")
            else:
                if dept_id and not subj.department_id:
                    subj.department_id = dept_id
            subject_objs[s_info['name']] = subj

        db.session.commit()

        # 6. Ensure experiments exist for each subject
        exp_objs = {}
        for s_name, subj in subject_objs.items():
            exp = Experiment.query.filter_by(institution_id=inst_id, subject_id=subj.id).first()
            if not exp:
                exp = Experiment(
                    id=str(uuid.uuid4()),
                    institution_id=inst_id,
                    subject_id=subj.id,
                    instructor_id=instructor_id,
                    exp_number=1,
                    title=f"{s_name} - Practical Evaluation",
                    problem_statement=f"Implement and verify {s_name} core laboratory requirements.",
                    difficulty_level=2,
                    is_published=True
                )
                db.session.add(exp)
                db.session.flush()
            exp_objs[subj.id] = exp

        # 7. Ensure SectionSubject & LabSession exist for these subjects
        sess_objs = {}
        for s_name, subj in subject_objs.items():
            sec_id = random.choice(section_ids)
            sec_subj = SectionSubject.query.filter_by(
                institution_id=inst_id,
                subject_id=subj.id
            ).first()
            if not sec_subj:
                sec_subj = SectionSubject(
                    id=str(uuid.uuid4()),
                    institution_id=inst_id,
                    section_id=sec_id,
                    subject_id=subj.id,
                    instructor_id=instructor_id
                )
                db.session.add(sec_subj)
                db.session.flush()

            sess = LabSession.query.filter_by(
                institution_id=inst_id,
                section_subject_id=sec_subj.id
            ).first()
            if not sess:
                sess = LabSession(
                    id=str(uuid.uuid4()),
                    institution_id=inst_id,
                    section_subject_id=sec_subj.id,
                    experiment_id=exp_objs[subj.id].id,
                    title=f"{s_name} Lab Examination",
                    scheduled_at=datetime(2026, 1, 15, 10, 0, 0),
                    duration_minutes=90,
                    status='completed'
                )
                db.session.add(sess)
                db.session.flush()
            sess_objs[subj.id] = sess

        db.session.commit()

        # 8. Clean up old grades for these students to have a fresh, consistent dataset
        db.session.query(Grade).filter(Grade.student_id.in_([s.id for s in students])).delete(synchronize_session=False)
        db.session.commit()
        print("Cleared previous grades for Greenwood students to seed clean real dataset.")

        # 9. Target Grade Submissions: ~1,842 grades matching screenshot
        # Target Histogram counts:
        # F (<50): 48
        # D (50-59): 92
        # C (60-69): 186
        # B (70-79): 243
        # A (80-89): 198
        # A+ (90-100): 121
        # Total base = 888. Multiply by ~2 to get ~1,842 total submissions across the academic year!
        
        # Monthly distribution across Jan 2026 to Dec 2026
        now = datetime(2026, 10, 16, 12, 0, 0)
        months = [
            datetime(2026, m, 15, 10, 0, 0) for m in range(1, 13)
        ]

        # Subject targets:
        # Top performing: Data Structures (245), Operating Systems (238), Computer Networks (226), Database Systems (198), Mathematics - II (276)
        # Needs attention: Engineering Physics (212), Engineering Chemistry (198), Mathematics - I (245), Basic Electrical (176), Environmental Science (189)
        subject_student_targets = {
            "Data Structures": 245,
            "Operating Systems": 238,
            "Computer Networks": 226,
            "Database Systems": 198,
            "Mathematics - II": 276,
            "Engineering Physics": 212,
            "Engineering Chemistry": 198,
            "Mathematics - I": 245,
            "Basic Electrical": 176,
            "Environmental Science": 189
        }

        created_count = 0
        all_grades_to_add = []

        random.seed(42)

        for s_info in TARGET_SUBJECTS:
            s_name = s_info['name']
            subj = subject_objs[s_name]
            exp = exp_objs[subj.id]
            sess = sess_objs[subj.id]
            target_gpa = s_info['target_gpa']
            pass_rate = s_info['pass_rate']
            num_grades = subject_student_targets.get(s_name, 200)

            # Target score mean (out of 100): GPA 3.82 -> ~92, GPA 2.11 -> ~56
            mean_score = (target_gpa / 4.0) * 100.0

            # Generate num_grades grades distributed among students
            sampled_students = random.choices(students, k=num_grades)
            for i, st in enumerate(sampled_students):
                # Determine if pass or fail based on subject's pass_rate
                is_pass = (random.random() * 100.0) < pass_rate
                if is_pass:
                    # Pass score 50 - 100 clustered around mean_score
                    raw_score = random.gauss(mean_score, 8.0)
                    score = max(52.0, min(99.0, raw_score))
                else:
                    # Fail score 15 - 49
                    score = random.uniform(22.0, 48.0)

                score = round(score, 1)

                # Month timestamp
                # Earlier months for Physics/Math I, later months for DS/OS
                month_dt = random.choice(months)
                graded_dt = month_dt + timedelta(days=random.randint(-10, 10), hours=random.randint(1, 8))
                if graded_dt > now:
                    graded_dt = now - timedelta(days=random.randint(1, 30))

                auto_g = round(score * random.uniform(0.92, 1.05), 1)
                manual_g = round(score * random.uniform(0.95, 1.02), 1)
                viva_g = round(score * random.uniform(0.90, 1.0), 1)

                g = Grade(
                    id=str(uuid.uuid4()),
                    student_id=st.id,
                    experiment_id=exp.id,
                    session_id=sess.id,
                    auto_grade=auto_g,
                    manual_grade=manual_g,
                    viva_grade=viva_g,
                    final_grade=score,
                    hint_deduction=round(random.choice([0.0, 0.0, 2.0, 5.0]), 1),
                    graded_at=graded_dt,
                    created_at=graded_dt
                )
                all_grades_to_add.append(g)

        db.session.bulk_save_objects(all_grades_to_add)
        db.session.commit()
        print(f"Successfully seeded {len(all_grades_to_add)} real Grade records into database!")

        # Verification
        total = Grade.query.filter(Grade.student_id.in_([s.id for s in students])).count()
        print(f"Total Grade records now in DB for Greenwood students: {total}")

if __name__ == '__main__':
    seed_grades_data()
