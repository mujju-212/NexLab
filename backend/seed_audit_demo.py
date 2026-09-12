"""
Seed script for AuditLog matching the exact numbers and layout from the executive UI mockup:
- Total Events: 248
- Active Users: 18
- Modules Affected: 6+
- Critical Events: 5
- Events by Module:
  * User Management: 78
  * Sessions: 52
  * Academic: 46
  * Announcements: 28
  * Settings: 24
  * Billing & Plan: 12
  * Others (System/Analytics): 8
- Realistic timeline across September 2026 (matching simulated date Sep 8-10, 2026)
"""
import os
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.academic import AuditLog

app = create_app()

with app.app_context():
    print("Seeding Audit Log demo data...")

    admin = User.query.filter_by(role='institution_admin').first()
    if not admin:
        print("No institution admin found! Aborting.")
        sys.exit(1)

    iid = admin.institution_id

    # Fetch real instructors and students to distribute actions across ~18 active users
    instructors = User.query.filter_by(institution_id=iid, role='instructor').all()
    students = User.query.filter_by(institution_id=iid, role='student').limit(12).all()

    active_user_pool = [admin] + instructors + students
    print(f"User pool for audit events: {len(active_user_pool)} users")

    # Clear existing audit logs for this institution for a clean seed
    AuditLog.query.filter_by(institution_id=iid).delete()
    db.session.commit()

    now = datetime.utcnow()

    # 5 Specific Critical Events (High Severity) matching the mockup "Recent Critical Events" widget
    critical_defs = [
        {
            'actor': instructors[0] if instructors else admin,
            'action': 'Deleted',
            'module': 'User Management',
            'detail': 'Deleted student account (ID: STU2026-145)',
            'time': now - timedelta(hours=1, minutes=15),
            'ip': '192.168.1.78',
            'severity': 'high',
        },
        {
            'actor': admin,
            'action': 'Failed Login',
            'module': 'System',
            'detail': 'Multiple failed login attempts detected from unrecognized client',
            'time': now - timedelta(days=2, hours=3),
            'ip': '198.51.100.42',
            'severity': 'high',
        },
        {
            'actor': admin,
            'action': 'Updated',
            'module': 'Settings',
            'detail': 'Institution security settings changed (Enforced 2FA and Session Timeout)',
            'time': now - timedelta(days=3, hours=5),
            'ip': '192.168.1.24',
            'severity': 'high',
        },
        {
            'actor': instructors[1] if len(instructors) > 1 else admin,
            'action': 'Exported',
            'module': 'User Management',
            'detail': 'Bulk data export of all student academic records performed',
            'time': now - timedelta(days=5, hours=2),
            'ip': '192.168.1.45',
            'severity': 'high',
        },
        {
            'actor': admin,
            'action': 'Force Logout',
            'module': 'System',
            'detail': 'Revoked all active login tokens for department staff due to credential reset',
            'time': now - timedelta(days=6, hours=4),
            'ip': '192.168.1.24',
            'severity': 'high',
        },
    ]

    for c in critical_defs:
        log = AuditLog(
            institution_id=iid,
            actor_id=c['actor'].id,
            action=c['action'],
            module=c['module'],
            target_type='user' if 'user' in c['module'].lower() else 'system',
            target_id=c['actor'].id,
            detail=c['detail'],
            ip_address=c['ip'],
            severity=c['severity'],
            created_at=c['time'],
        )
        db.session.add(log)

    # Specific rows matching the mockup's top table rows:
    top_table_rows = [
        {
            'actor': admin,
            'action': 'Created',
            'module': 'Sessions',
            'detail': 'Created lab session "Data Structures Lab"',
            'time': now - timedelta(minutes=15),
            'ip': '192.168.1.24',
            'severity': 'low',
        },
        {
            'actor': instructors[1] if len(instructors) > 1 else admin,
            'action': 'Updated',
            'module': 'Academic',
            'detail': 'Updated subject details "CS102"',
            'time': now - timedelta(minutes=45),
            'ip': '192.168.1.45',
            'severity': 'low',
        },
        {
            'actor': students[0] if students else admin,
            'action': 'Login',
            'module': 'System',
            'detail': 'User logged in',
            'time': now - timedelta(hours=2, minutes=10),
            'ip': '192.168.1.52',
            'severity': 'low',
        },
        {
            'actor': admin,
            'action': 'Updated',
            'module': 'Settings',
            'detail': 'Updated institution settings',
            'time': now - timedelta(hours=4, minutes=20),
            'ip': '192.168.1.24',
            'severity': 'medium',
        },
        {
            'actor': instructors[2] if len(instructors) > 2 else admin,
            'action': 'Created',
            'module': 'Announcements',
            'detail': 'Created announcement "Exam Schedule"',
            'time': now - timedelta(hours=7, minutes=5),
            'ip': '192.168.1.36',
            'severity': 'low',
        },
        {
            'actor': instructors[1] if len(instructors) > 1 else admin,
            'action': 'Updated',
            'module': 'Sessions',
            'detail': 'Rescheduled session "OOP Lab"',
            'time': now - timedelta(hours=14, minutes=30),
            'ip': '192.168.1.45',
            'severity': 'medium',
        },
        {
            'actor': instructors[0] if instructors else admin,
            'action': 'Exported',
            'module': 'Analytics',
            'detail': 'Exported student report',
            'time': now - timedelta(hours=22, minutes=15),
            'ip': '192.168.1.78',
            'severity': 'low',
        },
    ]

    for t in top_table_rows:
        log = AuditLog(
            institution_id=iid,
            actor_id=t['actor'].id,
            action=t['action'],
            module=t['module'],
            target_type='session' if t['module'] == 'Sessions' else 'system',
            target_id=t['actor'].id,
            detail=t['detail'],
            ip_address=t['ip'],
            severity=t['severity'],
            created_at=t['time'],
        )
        db.session.add(log)

    # Remaining counts to reach exact module targets:
    # User Management: 78 (seeded: 2 -> need 76)
    # Sessions: 52 (seeded: 2 -> need 50)
    # Academic: 46 (seeded: 1 -> need 45)
    # Announcements: 28 (seeded: 1 -> need 27)
    # Settings: 24 (seeded: 2 -> need 22)
    # Billing & Plan: 12 (seeded: 0 -> need 12)
    # System / Analytics: 8 (seeded: 4 -> need 4)
    # Total so far: 12 seeded. Target remaining: 236 -> Total = 248!

    module_specs = [
        {
            'module': 'User Management',
            'count': 76,
            'templates': [
                ('Created', 'low', 'Created student account "{name}" ({email})'),
                ('Updated', 'low', 'Updated profile credentials for user "{name}"'),
                ('Updated', 'medium', 'Changed user permissions for "{name}"'),
                ('Created', 'low', 'Enrolled student "{name}" into Section A'),
                ('Updated', 'medium', 'Transferred student "{name}" to Section B'),
                ('Login', 'low', 'User "{name}" logged into student portal'),
            ],
        },
        {
            'module': 'Sessions',
            'count': 50,
            'templates': [
                ('Created', 'low', 'Scheduled lab session "{session}" for Section {sec}'),
                ('Updated', 'medium', 'Rescheduled session "{session}" start time'),
                ('Updated', 'low', 'Instructor started virtual lab runtime for "{session}"'),
                ('Created', 'low', 'Generated 14 weekly sessions from Recurring Plan'),
                ('Updated', 'low', 'Graded report submissions for session "{session}"'),
                ('Updated', 'medium', 'Updated attendance record for session "{session}"'),
            ],
        },
        {
            'module': 'Academic',
            'count': 45,
            'templates': [
                ('Created', 'low', 'Added curriculum syllabus for {subj}'),
                ('Updated', 'low', 'Updated environment profile for {subj} (LLVM 18 container)'),
                ('Created', 'low', 'Created Section {sec} under Computer Science batch'),
                ('Updated', 'low', 'Assigned {inst} to {subj} for Section {sec}'),
                ('Updated', 'low', 'Synced academic calendar dates for Semester 1'),
            ],
        },
        {
            'module': 'Announcements',
            'count': 27,
            'templates': [
                ('Created', 'low', 'Dispatched urgent announcement "{ann}" to students'),
                ('Created', 'low', 'Scheduled institutional broadcast "{ann}"'),
                ('Updated', 'low', 'Updated announcement attachments for "{ann}"'),
                ('Created', 'low', 'Published campus event circular "{ann}"'),
            ],
        },
        {
            'module': 'Settings',
            'count': 22,
            'templates': [
                ('Updated', 'low', 'Saved institution branding and portal header logo'),
                ('Updated', 'medium', 'Modified default lab session duration to 90 minutes'),
                ('Updated', 'medium', 'Updated SMTP email relay server configurations'),
                ('Updated', 'low', 'Refreshed timezone settings to Asia/Kolkata (IST)'),
                ('Updated', 'medium', 'Adjusted automated plagiarism checking sensitivity threshold'),
            ],
        },
        {
            'module': 'Billing & Plan',
            'count': 12,
            'templates': [
                ('Updated', 'low', 'Reviewed NexLab Pro subscription plan quota utilization'),
                ('Exported', 'low', 'Generated monthly usage invoice and tax receipt for September 2026'),
                ('Updated', 'medium', 'Increased student license seats limit to 500'),
                ('Updated', 'low', 'Updated billing contact email and GSTIN compliance details'),
            ],
        },
        {
            'module': 'System',
            'count': 4,
            'templates': [
                ('Login', 'low', 'Administrator session authenticated via SSO'),
                ('Exported', 'low', 'Completed automated database snapshot backup to secondary vault'),
                ('Updated', 'low', 'System health check completed with 0 errors detected'),
                ('Login', 'low', 'Instructor portal session renewed'),
            ],
        },
    ]

    sample_names = ['Aarav Sharma', 'Diya Patel', 'Vivaan Reddy', 'Ananya Iyer', 'Aditya Nair', 'Ishita Gupta', 'Arjun Menon', 'Saanvi Rao', 'Krishna Verma', 'Myra Joshi']
    sample_subjs = ['Data Structures', 'Python Programming', 'Database Systems', 'Computer Networks', 'Operating Systems']
    sample_sessions = ['Binary Search Trees', 'SQL Query Tuning', 'Socket Programming', 'Thread Synchronization', 'Pointers in C++']
    sample_anns = ['Lab Maintenance Notice', 'Mid-Term Exam Schedule', 'Hackathon Registrations Open', 'Guest Keynote on Quantum AI']
    sample_ips = ['192.168.1.24', '192.168.1.45', '192.168.1.78', '192.168.1.52', '192.168.1.36', '192.168.1.18', '192.168.1.88', '10.0.1.15', '10.0.2.40']

    for spec in module_specs:
        mod = spec['module']
        count = spec['count']
        templates = spec['templates']

        for k in range(count):
            act, sev, tpl = random.choice(templates)
            user = random.choice(active_user_pool)
            ip = random.choice(sample_ips)

            # Distribute dates across 1 Sep to 10 Sep 2026
            days_ago = random.uniform(0.05, 9.8)
            log_time = now - timedelta(days=days_ago)

            detail = tpl.format(
                name=random.choice(sample_names),
                email=f"{random.choice(sample_names).lower().replace(' ', '.')}@nexlab.demo",
                subj=random.choice(sample_subjs),
                session=random.choice(sample_sessions),
                sec=random.choice(['A', 'B']),
                inst=instructors[0].full_name if instructors else 'Dr. Rajesh Kumar',
                ann=random.choice(sample_anns),
            )

            log = AuditLog(
                institution_id=iid,
                actor_id=user.id,
                action=act,
                module=mod,
                target_type=mod.lower().replace(' ', '_'),
                target_id=user.id,
                detail=detail,
                ip_address=ip,
                severity=sev,
                created_at=log_time,
            )
            db.session.add(log)

    db.session.commit()

    total_seeded = AuditLog.query.filter_by(institution_id=iid).count()
    crit_seeded = AuditLog.query.filter_by(institution_id=iid, severity='high').count()
    modules_seeded = db.session.query(AuditLog.module).filter_by(institution_id=iid).distinct().count()
    actors_seeded = db.session.query(AuditLog.actor_id).filter_by(institution_id=iid).distinct().count()

    print("--- Audit Log Seeding Complete ---")
    print(f"Total Events: {total_seeded}")
    print(f"Critical Events: {crit_seeded}")
    print(f"Active Users: {actors_seeded}")
    print(f"Modules Affected: {modules_seeded}")
