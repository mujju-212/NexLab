import sqlite3

conn = sqlite3.connect('dev.db')
cursor = conn.cursor()
pragma = [r[1] for r in cursor.execute('PRAGMA table_info(audit_logs)').fetchall()]
print('Existing columns:', pragma)

if 'module' not in pragma:
    cursor.execute("ALTER TABLE audit_logs ADD COLUMN module VARCHAR(50)")
    print('Added module column')

if 'ip_address' not in pragma:
    cursor.execute("ALTER TABLE audit_logs ADD COLUMN ip_address VARCHAR(45)")
    print('Added ip_address column')

if 'severity' not in pragma:
    cursor.execute("ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(20) DEFAULT 'low'")
    print('Added severity column')

conn.commit()
conn.close()
print('Migration complete!')
