"""
Seed Billing & Plan Demo Data
Populates realistic invoices (INV-2026-005 through 009), default payment method (Visa 4242),
and billing contact details for the institution matching the executive UI mockup.
"""
import sqlite3
from datetime import datetime
import json
import uuid


def seed_billing():
    conn = sqlite3.connect('dev.db')
    c = conn.cursor()

    # 1. Ensure invoices table exists
    c.execute('''
    CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(36) PRIMARY KEY,
        institution_id VARCHAR(36) NOT NULL,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        amount FLOAT NOT NULL DEFAULT 4999.0,
        currency VARCHAR(10) DEFAULT '₹',
        plan VARCHAR(50) DEFAULT 'NexLab Pro',
        billing_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'paid',
        payment_method VARCHAR(50) DEFAULT 'VISA •••• 4242',
        items_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 2. Ensure payment_methods table exists
    c.execute('''
    CREATE TABLE IF NOT EXISTS payment_methods (
        id VARCHAR(36) PRIMARY KEY,
        institution_id VARCHAR(36) NOT NULL,
        card_brand VARCHAR(30) DEFAULT 'VISA',
        last4 VARCHAR(4) NOT NULL,
        exp_month INTEGER NOT NULL,
        exp_year INTEGER NOT NULL,
        cardholder_name VARCHAR(100) DEFAULT 'Institution Admin',
        is_default BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    ''')

    # 3. Add billing columns to institutions if missing
    columns_needed = [
        ('billing_cycle', 'VARCHAR(20) DEFAULT "monthly"'),
        ('auto_renewal', 'BOOLEAN DEFAULT 1'),
        ('next_billing_date', 'VARCHAR(30) DEFAULT "10 Oct 2026"'),
        ('billing_contact_person', 'VARCHAR(100) DEFAULT "Institution Admin"'),
    ]

    c.execute("PRAGMA table_info(institutions)")
    existing_cols = [r[1] for r in c.fetchall()]

    for col_name, col_def in columns_needed:
        if col_name not in existing_cols:
            c.execute(f"ALTER TABLE institutions ADD COLUMN {col_name} {col_def}")
            print(f"[OK] Added column {col_name} to institutions table.")

    # 4. Find the demo institution
    c.execute("SELECT id, name FROM institutions LIMIT 1")
    row = c.fetchone()
    if not row:
        print("[ERROR] No institution found in dev.db.")
        conn.close()
        return

    inst_id, inst_name = row[0], row[1]
    print(f"[INFO] Seeding billing data for institution '{inst_name}' ({inst_id})")

    # Update institution billing details
    c.execute('''
    UPDATE institutions
    SET plan = 'pro',
        billing_email = 'billing@greenwood.edu',
        billing_contact_person = 'Institution Admin',
        address = '123 Education Street, HSR Layout, Bengaluru, Karnataka 560102, India',
        phone = '+91 98765 43210',
        billing_cycle = 'monthly',
        auto_renewal = 1,
        next_billing_date = '10 Oct 2026'
    WHERE id = ?
    ''', (inst_id,))

    # 5. Seed Payment Method if none exists
    c.execute("SELECT id FROM payment_methods WHERE institution_id = ?", (inst_id,))
    existing_pm = c.fetchone()
    if not existing_pm:
        pm_id = str(uuid.uuid4())
        c.execute('''
        INSERT INTO payment_methods (id, institution_id, card_brand, last4, exp_month, exp_year, cardholder_name, is_default, created_at)
        VALUES (?, ?, 'VISA', '4242', 4, 2028, 'Institution Admin', 1, ?)
        ''', (pm_id, inst_id, datetime(2024, 4, 15, 10, 0, 0)))
        print("[OK] Seeded default VISA card ending in 4242.")
    else:
        print("[INFO] Payment method already exists.")

    # 6. Seed Invoices matching mockup
    # Mockup items:
    # INV-2026-009 | 10 Sep 2026 | NexLab Pro | ₹4,999 | Paid
    # INV-2026-008 | 10 Aug 2026 | NexLab Pro | ₹4,999 | Paid
    # INV-2026-007 | 10 Jul 2026 | NexLab Pro | ₹4,999 | Paid
    # INV-2026-006 | 10 Jun 2026 | NexLab Pro | ₹4,999 | Paid
    # INV-2026-005 | 10 May 2026 | NexLab Pro | ₹4,999 | Paid
    demo_invoices = [
        ('INV-2026-009', datetime(2026, 9, 10, 14, 30), 4999.0, 'paid'),
        ('INV-2026-008', datetime(2026, 8, 10, 14, 30), 4999.0, 'paid'),
        ('INV-2026-007', datetime(2026, 7, 10, 14, 30), 4999.0, 'paid'),
        ('INV-2026-006', datetime(2026, 6, 10, 14, 30), 4999.0, 'paid'),
        ('INV-2026-005', datetime(2026, 5, 10, 14, 30), 4999.0, 'paid'),
    ]

    for inv_num, b_date, amount, status in demo_invoices:
        c.execute("SELECT id FROM invoices WHERE invoice_number = ?", (inv_num,))
        if not c.fetchone():
            inv_id = str(uuid.uuid4())
            items = [
                {'description': 'NexLab Pro Subscription (Monthly)', 'quantity': 1, 'unit_price': 4236.44, 'total': 4236.44},
                {'description': 'GST (18%)', 'quantity': 1, 'unit_price': 762.56, 'total': 762.56},
            ]
            c.execute('''
            INSERT INTO invoices (id, institution_id, invoice_number, amount, currency, plan, billing_date, status, payment_method, items_json, created_at)
            VALUES (?, ?, ?, ?, '₹', 'NexLab Pro', ?, ?, 'VISA •••• 4242', ?, ?)
            ''', (inv_id, inst_id, inv_num, amount, b_date, status, json.dumps(items), b_date))
            print(f"[OK] Seeded invoice {inv_num} ({amount})")

    conn.commit()
    conn.close()
    print("=== Billing demo data seeding completed successfully! ===")


if __name__ == '__main__':
    seed_billing()
