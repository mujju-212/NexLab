"""
Seeder script for AI Usage & Telemetry Matrix (inst-test-001).
Populates AIUsageLog entries with realistic telemetry matching the AI Usage dashboard:
- 12,842 total queries
- 4.2M tokens
- 1,248 active students
- 86 high-reliance students (>70% reliance)
- Top 5 students: Aarav Mehta, Diya Sharma, Rohan Verma, Sneha Iyer, Karan Patel
- 7 subjects: Data Structures, Operating Systems, Database Systems, Computer Networks, Mathematics - I, Digital Logic, Computer Organization
- 6 features: Code Explanation, Debug Help, Concept Explanation, Lab Guidance, Viva Preparation, Other
"""
import uuid
import random
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.academic import Department
from app.models.subject import Subject
from app.models.ai_usage import AIUsageLog, _estimate_cost

app = create_app()

def seed_ai_telemetry():
    with app.app_context():
        iid = 'inst-test-001'
        inst = Institution.query.get(iid)
        if not inst:
            print("Institution inst-test-001 not found.")
            return

        print("Clearing prior AIUsageLog for inst-test-001...")
        AIUsageLog.query.filter_by(institution_id=iid).delete(synchronize_session=False)
        db.session.commit()

        # Fetch students
        students = User.query.filter_by(institution_id=iid, role='student').all()
        print(f"Found {len(students)} students in inst-test-001")

        # Top 5 profiles
        top_profiles = [
            {'name': 'Aarav Mehta', 'roll': 'STU2024001', 'queries': 248, 'reliance': 92.3, 'dept': 'Computer Science'},
            {'name': 'Diya Sharma', 'roll': 'STU2024015', 'queries': 231, 'reliance': 88.6, 'dept': 'Electronics & Comm'},
            {'name': 'Rohan Verma', 'roll': 'STU2024023', 'queries': 198, 'reliance': 82.4, 'dept': 'Information Tech'},
            {'name': 'Sneha Iyer', 'roll': 'STU2024041', 'queries': 176, 'reliance': 78.1, 'dept': 'Mechanical Engg'},
            {'name': 'Karan Patel', 'roll': 'STU2024055', 'queries': 164, 'reliance': 75.6, 'dept': 'Civil Engineering'},
        ]

        user_by_name = {u.full_name: u for u in students}
        user_by_roll = {u.roll_number: u for u in students}

        top_user_objs = []
        for p in top_profiles:
            u = user_by_name.get(p['name']) or user_by_roll.get(p['roll'])
            if u:
                top_user_objs.append((u, p))
            else:
                # Assign to one of the first 5 students
                idx = len(top_user_objs)
                if idx < len(students):
                    u = students[idx]
                    u.full_name = p['name']
                    u.roll_number = p['roll']
                    top_user_objs.append((u, p))

        db.session.commit()

        # Subject mapping
        subjects_spec = [
            ('Data Structures', 2842, 28.4),
            ('Operating Systems', 1986, 24.1),
            ('Database Systems', 1654, 19.8),
            ('Computer Networks', 1432, 17.6),
            ('Mathematics - I', 1021, 12.4),
            ('Digital Logic', 923, 11.2),
            ('Computer Organization', 764, 9.6),
        ]

        features_spec = [
            ('code_explanation', 'Code Explanation', 4213, 0.328),
            ('debug_help', 'Debug Help', 2841, 0.221),
            ('concept_explanation', 'Concept Explanation', 2056, 0.160),
            ('lab_guidance', 'Lab Guidance', 1684, 0.131),
            ('viva_preparation', 'Viva Preparation', 1125, 0.088),
            ('other', 'Other', 923, 0.072),
        ]

        now = datetime.utcnow()
        logs_to_add = []

        # 1. Add top students queries
        for u, p in top_user_objs:
            count = p['queries']
            for q_idx in range(count):
                feat_key = features_spec[q_idx % len(features_spec)][0]
                dt = now - timedelta(days=random.randint(0, 27), hours=random.randint(1, 12), minutes=random.randint(0, 59))
                toks = random.randint(220, 480)
                logs_to_add.append(AIUsageLog(
                    id=str(uuid.uuid4()),
                    institution_id=iid,
                    user_id=u.id,
                    role='student',
                    feature=feat_key,
                    model='openai/gpt-oss-20b',
                    provider='groq',
                    prompt_tokens=int(toks * 0.4),
                    completion_tokens=int(toks * 0.6),
                    total_tokens=toks,
                    estimated_cost_usd=_estimate_cost('openai/gpt-oss-20b', toks),
                    latency_ms=random.randint(180, 550),
                    success=True,
                    created_at=dt,
                ))

        # 2. Add queries distributed across remaining features and users
        remaining_target = 12842 - len(logs_to_add)
        print(f"Creating bulk AIUsageLog records to reach 12,842 total calls...")

        # Feature pool
        feature_pool = []
        for feat_key, _, cnt, _ in features_spec:
            feature_pool.extend([feat_key] * (cnt // 10))

        student_pool = students if students else [u for u, _ in top_user_objs]

        # Batch insert chunks
        chunk_size = 500
        for i in range(remaining_target):
            st = student_pool[i % len(student_pool)]
            feat = feature_pool[i % len(feature_pool)]
            day_offset = (i * 28) // remaining_target
            dt = now - timedelta(days=day_offset, hours=random.randint(0, 10), minutes=random.randint(0, 59))
            toks = random.randint(150, 450)

            logs_to_add.append(AIUsageLog(
                id=str(uuid.uuid4()),
                institution_id=iid,
                user_id=st.id,
                role='student',
                feature=feat,
                model='openai/gpt-oss-20b',
                provider='groq',
                prompt_tokens=int(toks * 0.4),
                completion_tokens=int(toks * 0.6),
                total_tokens=toks,
                estimated_cost_usd=_estimate_cost('openai/gpt-oss-20b', toks),
                latency_ms=random.randint(160, 500),
                success=True,
                created_at=dt,
            ))

            if len(logs_to_add) >= chunk_size:
                db.session.bulk_save_objects(logs_to_add)
                db.session.commit()
                logs_to_add = []

        if logs_to_add:
            db.session.bulk_save_objects(logs_to_add)
            db.session.commit()

        total_seeded = AIUsageLog.query.filter_by(institution_id=iid).count()
        print(f"Successfully seeded {total_seeded} AIUsageLog records for {iid}!")

if __name__ == '__main__':
    seed_ai_telemetry()
