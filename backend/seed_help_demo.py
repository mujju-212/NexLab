"""
Seed Help & FAQ Demo Data
Creates tables for FAQ articles and support tickets in dev.db,
and populates rich questions and answers matching the executive UI mockup.
"""
import sqlite3
from datetime import datetime
import json
import uuid


def seed_help():
    conn = sqlite3.connect('dev.db')
    c = conn.cursor()

    # 1. Create faq_articles table
    c.execute('''
    CREATE TABLE IF NOT EXISTS faq_articles (
        id VARCHAR(36) PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        category_title VARCHAR(100) NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        helpful_count INTEGER DEFAULT 0,
        unhelpful_count INTEGER DEFAULT 0,
        is_published BOOLEAN DEFAULT 1,
        "order" INTEGER DEFAULT 0,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 2. Create support_tickets table
    c.execute('''
    CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(36) PRIMARY KEY,
        ticket_number VARCHAR(50) NOT NULL UNIQUE,
        institution_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        priority VARCHAR(20) DEFAULT 'medium',
        message TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 3. Find demo institution and admin user
    c.execute("SELECT id FROM institutions LIMIT 1")
    inst_row = c.fetchone()
    inst_id = inst_row[0] if inst_row else 'inst-test-001'

    c.execute("SELECT id FROM users WHERE role='institution_admin' LIMIT 1")
    user_row = c.fetchone()
    user_id = user_row[0] if user_row else 'user-admin-001'

    # 4. Populate FAQ articles
    faqs = [
        # Match mockup 6 core questions directly:
        {
            'category': 'user_management',
            'category_title': 'User Management',
            'question': 'How do I add students in bulk?',
            'answer': 'Go to User Management -> Bulk Upload CSV. Download our standard CSV template with columns: full_name, email, role, and roll_number. Select your file and click "Import Users". All accounts will be created instantly and welcome credentials dispatched.',
            'order': 1,
            'helpful': 42,
            'tags': ['add students', 'bulk', 'csv', 'import', 'students'],
        },
        {
            'category': 'academic_sessions',
            'category_title': 'Academic & Sessions',
            'question': 'How do I create academic structure (subjects, batches, sections)?',
            'answer': 'Navigate to Academics from the sidebar. First, define an Academic Year (e.g., 2026-2027). Under that year, create Batches (e.g., Computer Science 2026). Then add Sections (Section A, B) and assign instructors and course subjects to each section.',
            'order': 2,
            'helpful': 38,
            'tags': ['academic', 'batches', 'sections', 'subjects', 'structure'],
        },
        {
            'category': 'academic_sessions',
            'category_title': 'Academic & Sessions',
            'question': 'Can I schedule sessions for different batches?',
            'answer': 'Yes. Go to Sessions -> Planner from the sidebar. Select your target batch and section, choose the experiment lab, set the start time and duration, and click "Schedule Session". Real-time alerts and calendar reminders are synced to all enrolled students.',
            'order': 3,
            'helpful': 29,
            'tags': ['schedule session', 'sessions', 'planner', 'batches'],
        },
        {
            'category': 'analytics_reports',
            'category_title': 'Analytics & Reports',
            'question': 'How do I track student performance?',
            'answer': 'The Analytics module provides real-time grade distributions, session attendance rates, concept mastery tracking, and an At-Risk Student indicator based on focus scores, test case pass rates, and session drop-offs.',
            'order': 4,
            'helpful': 35,
            'tags': ['student performance', 'analytics', 'grades', 'reports', 'tracking'],
        },
        {
            'category': 'account_security',
            'category_title': 'Account & Security',
            'question': "How to reset a user's password?",
            'answer': "Go to User Management, locate the student or instructor, click the action menu (...), and select 'Reset Password'. You can either auto-generate a temporary password or send a secure reset link directly to their registered email address.",
            'order': 5,
            'helpful': 24,
            'tags': ['reset password', 'password', 'security', 'account'],
        },
        {
            'category': 'getting_started',
            'category_title': 'Getting Started',
            'question': 'Who can I contact for support?',
            'answer': 'You can reach our dedicated NexLab support team anytime via Live Chat in the right panel, email us at support@nexlab.in, or click "Raise a Ticket" to submit complex technical inquiries with an average response time under 2 hours.',
            'order': 6,
            'helpful': 51,
            'tags': ['contact support', 'support', 'help', 'email', 'ticket'],
        },

        # Additional rich FAQs for each category
        {
            'category': 'getting_started',
            'category_title': 'Getting Started',
            'question': 'What are the system requirements for virtual lab experiments?',
            'answer': 'NexLab virtual labs run completely in modern web browsers (Chrome, Edge, Firefox, Safari) using web-based IDEs and terminal emulators. No local compiler or software installation is required on student laptops.',
            'order': 7,
            'helpful': 19,
            'tags': ['getting started', 'requirements', 'browser', 'virtual lab'],
        },
        {
            'category': 'user_management',
            'category_title': 'User Management',
            'question': 'How do I deactivate or archive graduated students?',
            'answer': 'In User Management, select the graduated student or filter by batch, then click "Deactivate". Their past grades, session logs, and lab submission history remain safely archived for institutional records.',
            'order': 8,
            'helpful': 14,
            'tags': ['deactivate', 'archive', 'alumni', 'graduated'],
        },
        {
            'category': 'analytics_reports',
            'category_title': 'Analytics & Reports',
            'question': 'How do I download attendance and grading reports in CSV / Excel?',
            'answer': 'Navigate to Analytics -> Reports or Sessions -> History. Click the "Export Report" button on the top right to download comprehensive CSV attendance sheets and grade rosters.',
            'order': 9,
            'helpful': 31,
            'tags': ['download report', 'export', 'attendance', 'csv', 'excel'],
        },
        {
            'category': 'billing_subscription',
            'category_title': 'Billing & Subscription',
            'question': 'How do I upgrade our institution plan or add more student seats?',
            'answer': 'Go to Billing & Plan from the sidebar management menu. You can switch between Starter, Pro, and Enterprise tiers or contact sales for custom seat allocations with annual discounts.',
            'order': 10,
            'helpful': 22,
            'tags': ['billing issues', 'upgrade plan', 'subscription', 'seats', 'pricing'],
        },
        {
            'category': 'billing_subscription',
            'category_title': 'Billing & Subscription',
            'question': 'Where can I download monthly GST tax invoices?',
            'answer': 'Under Billing & Plan -> Recent Invoices, every monthly or annual renewal invoice is stored with official invoice numbers (INV-2026-XXX) and downloadable with itemized tax breakdowns.',
            'order': 11,
            'helpful': 18,
            'tags': ['invoices', 'gst', 'tax', 'receipts', 'billing'],
        },
        {
            'category': 'account_security',
            'category_title': 'Account & Security',
            'question': 'How do I enable Two-Factor Authentication (2FA) for administrators?',
            'answer': 'Navigate to Profile & Security from the user menu or Settings. In the Two-Factor Authentication card, click "Enable 2FA" and link your authenticator app (Google Authenticator, Microsoft Authenticator) via the QR code.',
            'order': 12,
            'helpful': 27,
            'tags': ['2fa', 'two-factor', 'security', 'authenticator', 'login'],
        },
    ]

    c.execute("DELETE FROM faq_articles")
    for f in faqs:
        f_id = str(uuid.uuid4())
        c.execute('''
        INSERT INTO faq_articles (id, category, category_title, question, answer, helpful_count, unhelpful_count, is_published, "order", tags, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
        ''', (f_id, f['category'], f['category_title'], f['question'], f['answer'], f['helpful'], f['order'], json.dumps(f['tags']), datetime.utcnow()))

    print(f"[OK] Seeded {len(faqs)} FAQ articles.")

    # 5. Populate initial support tickets
    c.execute("SELECT COUNT(*) FROM support_tickets WHERE institution_id = ?", (inst_id,))
    ticket_count = c.fetchone()[0]
    if ticket_count == 0:
        demo_tickets = [
            ('TICK-2026-104', 'Inquiry regarding SSO / SAML integration', 'technical', 'high', 'open', 'We would like to connect NexLab with our university Azure Active Directory SSO.'),
            ('TICK-2026-089', 'Assistance with Bulk CSV Upload format', 'user_management', 'medium', 'resolved', 'Requested clarification on column header names for second year batch import.'),
        ]
        for t_num, subj, cat, prio, stat, msg in demo_tickets:
            t_id = str(uuid.uuid4())
            c.execute('''
            INSERT INTO support_tickets (id, ticket_number, institution_id, user_id, subject, category, priority, message, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (t_id, t_num, inst_id, user_id, subj, cat, prio, msg, stat, datetime.utcnow(), datetime.utcnow()))
        print("[OK] Seeded demo support tickets.")
    else:
        print("[INFO] Support tickets already present.")

    conn.commit()
    conn.close()
    print("=== Help & FAQ seeding completed successfully! ===")


if __name__ == '__main__':
    seed_help()
