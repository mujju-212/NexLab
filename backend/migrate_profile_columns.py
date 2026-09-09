import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'dev.db')
print(f"Connecting to database at {db_path}...")
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Get existing columns of 'users' table
cursor.execute("PRAGMA table_info(users)")
columns = [row[1] for row in cursor.fetchall()]
print(f"Current columns in users: {columns}")

new_columns = [
    ("bio", "TEXT DEFAULT 'Empowering education through technology.'"),
    ("timezone", "VARCHAR(50) DEFAULT '(GMT+05:30) Asia/Kolkata'"),
    ("language", "VARCHAR(50) DEFAULT 'English (India)'"),
    ("two_factor_enabled", "BOOLEAN DEFAULT 0"),
]

for col_name, col_def in new_columns:
    if col_name not in columns:
        print(f"Adding column '{col_name}' to users...")
        cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
    else:
        print(f"Column '{col_name}' already exists.")

# Update the institution_admin user with realistic profile data matching mockup
cursor.execute("""
    UPDATE users
    SET phone = COALESCE(phone, '+91 98765 43210'),
        bio = COALESCE(bio, 'Empowering education through technology.'),
        timezone = COALESCE(timezone, '(GMT+05:30) Asia/Kolkata'),
        language = COALESCE(language, 'English (India)')
    WHERE role = 'institution_admin' AND email = 'inst.admin@nexlab.demo'
""")

conn.commit()
conn.close()
print("Profile migration completed successfully!")
