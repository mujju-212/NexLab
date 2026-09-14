"""
Seed script for AI Usage, Governance, Quotas, Features, and Security & Compliance.
Correlates with the 5 reference mockups for Greenwood Institute / NexLab Demo.
"""
import uuid
import random
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.academic import Department
from app.models.ai_usage import AIUsageLog, AIPolicy, _estimate_cost
from app.models.ai_governance import AIUserQuota, AIFeatureConfig, SecurityEvent, ComplianceSetting

app = create_app()

FEATURE_DEFINITIONS = [
    {
        'feature_id': 'chat_assistant',
        'name': 'Chat Assistant',
        'category': 'Learning',
        'description': 'AI tutor for doubt solving and concept clarity. Allows users to ask questions related to experiments, concepts, code, and theory.',
        'enabled': True,
        'roles': ['Student', 'Instructor', 'TA'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 100,
        'cost': 0.002,
        'supported': 'Text, Code, Images',
        'weight': 0.42,
    },
    {
        'feature_id': 'code_help',
        'name': 'Code Help',
        'category': 'Development',
        'description': 'AI assistance for coding, error explanation, and automated debugging during lab programming sessions.',
        'enabled': True,
        'roles': ['Student', 'Instructor', 'TA'],
        'model': 'Claude 3.5 Sonnet',
        'rate_limit': 80,
        'cost': 0.003,
        'supported': 'Code, Text',
        'weight': 0.24,
    },
    {
        'feature_id': 'answer_evaluation',
        'name': 'Answer Evaluation',
        'category': 'Assessment',
        'description': 'AI automated evaluation for subjective, numeric, and code-based student experiment submissions.',
        'enabled': True,
        'roles': ['Instructor', 'TA'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 150,
        'cost': 0.002,
        'supported': 'Text, Rubrics',
        'weight': 0.15,
    },
    {
        'feature_id': 'content_generation',
        'name': 'Content Generation',
        'category': 'Content',
        'description': 'Generate quizzes, interactive lab manuals, practice exercises, and curriculum materials automatically.',
        'enabled': True,
        'roles': ['Instructor', 'Admin'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 50,
        'cost': 0.004,
        'supported': 'Text, Markdown',
        'weight': 0.10,
    },
    {
        'feature_id': 'data_analysis',
        'name': 'Data Analysis',
        'category': 'Analytics',
        'description': 'AI-powered data analysis, charting suggestions, and performance correlation across sections.',
        'enabled': True,
        'roles': ['Instructor', 'TA', 'Admin'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 60,
        'cost': 0.003,
        'supported': 'CSV, Python, Data',
        'weight': 0.06,
    },
    {
        'feature_id': 'viva_questions',
        'name': 'Viva Question Generation',
        'category': 'Assessment',
        'description': 'Auto-generate oral viva questions and scoring criteria adapted to student lab results.',
        'enabled': True,
        'roles': ['Instructor', 'TA'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 120,
        'cost': 0.002,
        'supported': 'Text',
        'weight': 0.015,
    },
    {
        'feature_id': 'hint_system',
        'name': 'Hint System',
        'category': 'Learning',
        'description': 'Contextual adaptive progressive hints provided to students during virtual experiments.',
        'enabled': True,
        'roles': ['Student'],
        'model': 'Llama 3.3',
        'rate_limit': 200,
        'cost': 0.001,
        'supported': 'Text, Code',
        'weight': 0.01,
    },
    {
        'feature_id': 'plagiarism_detection',
        'name': 'Plagiarism Detection',
        'category': 'Integrity',
        'description': 'Check source code and lab report similarity across peer submissions and external web repositories.',
        'enabled': False,
        'roles': ['Instructor', 'Admin'],
        'model': 'Embedding Similarity',
        'rate_limit': 40,
        'cost': 0.005,
        'supported': 'Text, Code',
        'weight': 0.00,
    },
    {
        'feature_id': 'report_summarization',
        'name': 'Report Summarization',
        'category': 'Productivity',
        'description': 'Summarize long lab reports, scientific write-ups, and student submission logs.',
        'enabled': True,
        'roles': ['Student', 'Instructor', 'TA'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 80,
        'cost': 0.002,
        'supported': 'PDF, Text',
        'weight': 0.003,
    },
    {
        'feature_id': 'voice_input',
        'name': 'Voice Input (Beta)',
        'category': 'Accessibility',
        'description': 'Speak and interact with AI laboratory assistant using natural voice commands.',
        'enabled': False,
        'roles': ['Student', 'Instructor'],
        'model': 'Whisper Large v3',
        'rate_limit': 50,
        'cost': 0.006,
        'supported': 'Audio',
        'weight': 0.00,
    },
    {
        'feature_id': 'image_analysis',
        'name': 'Image Analysis',
        'category': 'Vision',
        'description': 'Analyze diagrams, circuit schematics, microscopy captures, and graphical outputs.',
        'enabled': True,
        'roles': ['Student', 'Instructor', 'TA'],
        'model': 'GPT-4o Vision',
        'rate_limit': 60,
        'cost': 0.005,
        'supported': 'Images, Schematics',
        'weight': 0.001,
    },
    {
        'feature_id': 'experimental_feedback',
        'name': 'Experimental Feedback',
        'category': 'Assessment',
        'description': 'Real-time AI diagnostic feedback on virtual lab apparatus tuning and measurement tolerances.',
        'enabled': True,
        'roles': ['Student', 'Instructor'],
        'model': 'GPT-4o (Institution)',
        'rate_limit': 100,
        'cost': 0.002,
        'supported': 'Telemetry, Text',
        'weight': 0.001,
    },
]

SECURITY_EVENTS_DATA = [
    {
        'event_type': 'successful_login',
        'title': 'Successful login',
        'user_name': 'Aryan Mehta',
        'ip_address': '223.176.12.34',
        'location': 'Bengaluru, IN',
        'severity': 'low',
        'details': 'Web session authenticated via institutional SSO credentials.',
        'minutes_ago': 2,
    },
    {
        'event_type': 'failed_login',
        'title': 'Failed login attempt',
        'user_name': 'Unknown',
        'ip_address': '45.67.89.10',
        'location': 'Moscow, RU',
        'severity': 'high',
        'details': 'Multiple incorrect password attempts recorded from untrusted subnet.',
        'minutes_ago': 12,
    },
    {
        'event_type': 'password_changed',
        'title': 'Password changed',
        'user_name': 'Sneha Patil',
        'ip_address': '117.203.45.23',
        'location': 'Pune, IN',
        'severity': 'medium',
        'details': 'User updated security credentials through self-service profile page.',
        'minutes_ago': 60,
    },
    {
        'event_type': '2fa_enabled',
        'title': '2FA enabled',
        'user_name': 'Dr. Neha Iyer',
        'ip_address': '49.205.11.76',
        'location': 'Chennai, IN',
        'severity': 'low',
        'details': 'Time-based OTP authenticator registered and verified successfully.',
        'minutes_ago': 120,
    },
    {
        'event_type': 'policy_violation',
        'title': 'Policy violation',
        'user_name': 'Rohan Kulkarni',
        'ip_address': '103.21.54.88',
        'location': 'Mumbai, IN',
        'severity': 'medium',
        'details': 'Prompt triggered institutional content safety filter keyword block.',
        'minutes_ago': 180,
    },
    {
        'event_type': 'suspicious_activity',
        'title': 'Suspicious activity',
        'user_name': 'Unknown',
        'ip_address': '185.220.101.5',
        'location': 'Frankfurt, DE',
        'severity': 'high',
        'details': 'High frequency automated token extraction attempts intercepted and blocked.',
        'minutes_ago': 240,
    },
    {
        'event_type': 'account_deactivated',
        'title': 'Account deactivated',
        'user_name': 'Pooja Krishna',
        'ip_address': '117.203.45.23',
        'location': 'Delhi, IN',
        'severity': 'low',
        'details': 'Administrative deactivation of graduated student profile.',
        'minutes_ago': 360,
    },
    {
        'event_type': 'bulk_data_export',
        'title': 'Bulk data export',
        'user_name': 'Amit Sharma',
        'ip_address': '203.122.67.91',
        'location': 'Hyderabad, IN',
        'severity': 'medium',
        'details': 'CSV export of academic grades and AI session telemetry.',
        'minutes_ago': 480,
    },
]

def seed_ai():
    with app.app_context():
        # Ensure tables exist
        db.create_all()

        inst = Institution.query.first()
        if not inst:
            print("No institution found! Aborting.")
            return

        iid = inst.id
        print(f"Seeding AI data for institution: {inst.name} ({iid})")

        # 1. Seed AIFeatureConfig
        for f in FEATURE_DEFINITIONS:
            cfg = AIFeatureConfig.query.filter_by(institution_id=iid, feature_id=f['feature_id']).first()
            if not cfg:
                import json
                cfg = AIFeatureConfig(
                    institution_id=iid,
                    feature_id=f['feature_id'],
                    name=f['name'],
                    category=f['category'],
                    description=f['description'],
                    enabled=f['enabled'],
                    available_roles=json.dumps(f['roles']),
                    default_model=f['model'],
                    rate_limit_per_hour=f['rate_limit'],
                    cost_per_1k=f['cost'],
                    supported_content=f['supported'],
                    enabled_since='12 Aug 2026',
                )
                db.session.add(cfg)
            else:
                cfg.name = f['name']
                cfg.category = f['category']
                cfg.description = f['description']
                cfg.enabled = f['enabled']
                cfg.default_model = f['model']

        # 2. Seed AIPolicy
        policy = AIPolicy.get_or_create(iid)
        policy.ai_enabled_global = True
        policy.ai_enabled_students = True
        policy.ai_enabled_instructors = True
        policy.daily_token_quota = 200000
        policy.monthly_token_quota = 5000000  # 5,000,000 monthly
        policy.per_student_daily_quota = 50000
        policy.hard_stop = True

        # 3. Seed AIUserQuota for users
        users = User.query.filter_by(institution_id=iid).all()
        print(f"Found {len(users)} users in institution.")

        # Specific prominent demo quotas matching mockups:
        # Aryan Mehta (Student, CS, 1248 calls, 520K tokens, 500K quota, 82%)
        # Dr. Neha Iyer (Instructor, Electronics, 892 calls, 410K tokens, 400K quota, 78%)
        # Rohan Kulkarni (Student, Mechanical, 776 calls, 312K tokens, 200K quota, 60%)
        # Sneha Patil (TA, Applied Science, 642 calls, 280K tokens, 150K quota, 63%)
        # Amit Sharma (Student, Civil, 590 calls, 210K tokens, 200K quota, 99% Warning!)
        # Pooja Krishna (Admin, Administration, 421 calls, 180K tokens, 300K quota, 15%)
        # Vikram Rao (Instructor, CS, 380 calls, 150K tokens, 400K quota, 55%)
        # Nidhi Desai (Student, Electronics, 312 calls, 120K tokens, 500K quota, 76%)

        named_configs = {
            'Aryan Mehta':   {'role': 'student',    'quota': 500000, 'used': 412000, 'dept': 'Computer Science'},
            'Dr. Neha Iyer': {'role': 'instructor', 'quota': 400000, 'used': 310000, 'dept': 'Electronics'},
            'Rohan Kulkarni':{'role': 'student',    'quota': 200000, 'used': 120000, 'dept': 'Mechanical'},
            'Sneha Patil':   {'role': 'instructor', 'quota': 150000, 'used': 95000,  'dept': 'Applied Science'},
            'Amit Sharma':   {'role': 'student',    'quota': 200000, 'used': 198000, 'dept': 'Civil'},
            'Pooja Krishna': {'role': 'institution_admin', 'quota': 300000, 'used': 45000, 'dept': 'Administration'},
            'Vikram Rao':    {'role': 'instructor', 'quota': 400000, 'used': 220000, 'dept': 'Computer Science'},
            'Nidhi Desai':   {'role': 'student',    'quota': 500000, 'used': 380000, 'dept': 'Electronics'},
        }

        from werkzeug.security import generate_password_hash
        pw_hash = generate_password_hash('Admin@123')

        # Check or create named users if not present to ensure 100% fidelity
        for name, cfg in named_configs.items():
            u = User.query.filter_by(institution_id=iid, full_name=name).first()
            if not u:
                email = name.lower().replace('dr. ', '').replace('prof. ', '').replace(' ', '.') + '@greenwood.edu'
                u = User(
                    institution_id=iid,
                    full_name=name,
                    email=email,
                    role=cfg['role'],
                    password_hash=pw_hash,
                    is_active=True,
                )
                db.session.add(u)
                db.session.flush()

            # Set user quota
            uq = AIUserQuota.query.filter_by(institution_id=iid, user_id=u.id).first()
            if not uq:
                uq = AIUserQuota(
                    institution_id=iid,
                    user_id=u.id,
                    monthly_token_quota=cfg['quota'],
                    current_month_tokens=cfg['used'],
                    reset_date='01 Oct 2026',
                    status='warning' if (cfg['used'] / cfg['quota']) >= 0.9 else 'active',
                )
                db.session.add(uq)
            else:
                uq.monthly_token_quota = cfg['quota']
                uq.current_month_tokens = cfg['used']
                uq.reset_date = '01 Oct 2026'
                uq.status = 'warning' if (cfg['used'] / cfg['quota']) >= 0.9 else 'active'

        # Set default quotas for any remaining users in institution
        all_inst_users = User.query.filter_by(institution_id=iid).all()
        for u in all_inst_users:
            if not AIUserQuota.query.filter_by(institution_id=iid, user_id=u.id).first():
                q_val = 50000 if u.role == 'student' else 200000
                used_val = random.randint(5000, int(q_val * 0.7))
                uq = AIUserQuota(
                    institution_id=iid,
                    user_id=u.id,
                    monthly_token_quota=q_val,
                    current_month_tokens=used_val,
                    reset_date='01 Oct 2026',
                    status='active',
                )
                db.session.add(uq)

        # 4. Seed AIUsageLog across 30 days
        existing_logs_count = AIUsageLog.query.filter_by(institution_id=iid).count()
        now = datetime.utcnow()
        if existing_logs_count < 300:
            print("Populating realistic daily AIUsageLog records...")
            features_pool = ['chat', 'code_assist', 'viva_evaluate', 'hint', 'viva_generate', 'agent']
            models_pool = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'gemini-flash-latest']
            
            # Generate logs distributed over past 30 days
            user_list = [u for u in all_inst_users if u.role in ('student', 'instructor')]
            for day_offset in range(30, -1, -1):
                day_date = now - timedelta(days=day_offset)
                calls_today = random.randint(250, 480)
                for _ in range(calls_today):
                    u = random.choice(user_list) if user_list else all_inst_users[0]
                    feat = random.choice(features_pool)
                    model = random.choice(models_pool)
                    p_tok = random.randint(100, 600)
                    c_tok = random.randint(50, 400)
                    t_tok = p_tok + c_tok
                    cost = _estimate_cost(model, t_tok)
                    is_success = random.random() > 0.003  # 99.7% success

                    call_time = day_date.replace(
                        hour=random.randint(8, 22),
                        minute=random.randint(0, 59),
                        second=random.randint(0, 59),
                    )

                    log = AIUsageLog(
                        institution_id=iid,
                        user_id=u.id,
                        role=u.role,
                        feature=feat,
                        model=model,
                        provider='groq' if 'llama' in model or 'oss' in model else 'gemini',
                        prompt_tokens=p_tok,
                        completion_tokens=c_tok,
                        total_tokens=t_tok,
                        estimated_cost_usd=cost,
                        latency_ms=random.randint(180, 850),
                        success=is_success,
                        created_at=call_time,
                    )
                    db.session.add(log)

        # 5. Seed SecurityEvent
        SecurityEvent.query.filter_by(institution_id=iid).delete()
        for ev in SECURITY_EVENTS_DATA:
            sec_ev = SecurityEvent(
                institution_id=iid,
                user_name=ev['user_name'],
                event_type=ev['event_type'],
                title=ev['title'],
                ip_address=ev['ip_address'],
                location=ev['location'],
                severity=ev['severity'],
                details=ev['details'],
                created_at=now - timedelta(minutes=ev['minutes_ago']),
            )
            db.session.add(sec_ev)

        # 6. Seed ComplianceSetting
        comp = ComplianceSetting.query.filter_by(institution_id=iid).first()
        if not comp:
            comp = ComplianceSetting(
                institution_id=iid,
                security_score=96,
                compliance_status='Compliant',
                last_assessed='01 Oct 2026',
            )
            db.session.add(comp)
        else:
            comp.security_score = 96
            comp.compliance_status = 'Compliant'
            comp.last_assessed = '01 Oct 2026'

        db.session.commit()
        print("Successfully seeded AI Usage, Governance, Quotas, Features, and Security data!")

if __name__ == '__main__':
    seed_ai()
