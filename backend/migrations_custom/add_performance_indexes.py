import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'dev.db')

INDEXES = [
    # Core User filters & lookups
    ("idx_users_inst_role_active", "users", "(institution_id, role, is_active)"),
    ("idx_users_inst_dept", "users", "(institution_id, department_id)"),
    ("idx_users_inst_name", "users", "(institution_id, full_name)"),
    
    # Lab Sessions lookups & schedule range queries
    ("idx_sessions_inst_status_sched", "lab_sessions", "(institution_id, status, scheduled_at)"),
    ("idx_sessions_sec_subj", "lab_sessions", "(section_subject_id)"),
    
    # Academic structure lookups
    ("idx_sections_inst_batch", "sections", "(institution_id, batch_id)"),
    ("idx_batches_inst_year", "batches", "(institution_id, year_id)"),
    ("idx_subjects_inst_dept", "subjects", "(institution_id, department_id)"),
    ("idx_departments_inst", "departments", "(institution_id)"),
    ("idx_years_inst", "academic_years", "(institution_id)"),
    
    # Section Subject assignments
    ("idx_sec_subj_inst", "section_subjects", "(institution_id)"),
    ("idx_sec_subj_lookup", "section_subjects", "(section_id, subject_id, instructor_id)"),
    
    # Student Section enrollments
    ("idx_sec_students_sec", "section_students", "(section_id)"),
    ("idx_sec_students_student", "section_students", "(student_id)"),
    
    # Audit Logs
    ("idx_audit_inst_created", "audit_logs", "(institution_id, created_at DESC)"),
    
    # Session Attendance (online counts & roster)
    ("idx_attendance_session_student", "session_attendance", "(session_id, student_id)"),
    ("idx_attendance_online", "session_attendance", "(session_id, joined_at, left_at)"),
]

def apply_indexes():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Apply WAL mode immediately to the DB file
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")
    cur.execute("PRAGMA cache_size = -64000;")
    print("WAL mode and PRAGMAs configured on database file.")

    applied = 0
    for idx_name, table_name, cols in INDEXES:
        try:
            sql = f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table_name}{cols};"
            cur.execute(sql)
            applied += 1
            print(f"[OK] Index created: {idx_name} ON {table_name}{cols}")
        except Exception as e:
            print(f"[WARN] Skipping {idx_name} ON {table_name}: {e}")

    conn.commit()
    conn.close()
    print(f"\nSuccessfully applied {applied} performance indexes!")

if __name__ == '__main__':
    apply_indexes()
