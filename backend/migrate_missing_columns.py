"""
Database Schema Migration Helper:
Ensures all new tables and columns defined in models are synchronized in the active database
(supporting both PostgreSQL and SQLite).
"""
import sys
from sqlalchemy import inspect, text
from app import create_app
from app.extensions import db

def migrate():
    app = create_app()
    with app.app_context():
        engine = db.engine
        dialect = engine.dialect.name
        print(f"Connected to database dialect: {dialect}")

        # 1. Create all missing tables
        db.create_all()
        print("db.create_all() completed.")

        inspector = inspect(engine)

        # 2. Check and add missing columns to experiments
        exp_cols = {c['name']: c for c in inspector.get_columns('experiments')}
        exp_needed = [
            ("delivery_mode", "VARCHAR(10) DEFAULT 'lab'"),
            ("experiment_type", "VARCHAR(20) DEFAULT 'coding'"),
            ("available_from", "TIMESTAMP" if dialect == 'postgresql' else "DATETIME"),
            ("due_at", "TIMESTAMP" if dialect == 'postgresql' else "DATETIME"),
            ("max_attempts", "INTEGER DEFAULT 1"),
            ("pass_threshold", "INTEGER DEFAULT 40"),
            ("shuffle_questions", "BOOLEAN DEFAULT FALSE"),
            ("proctor_defaults", "JSON DEFAULT '{}'" if dialect == 'postgresql' else "JSON"),
            ("weightage", "INTEGER DEFAULT 1"),
            ("grade_scale", "INTEGER DEFAULT 100"),
            ("published_content", "JSON"),
            ("content_dirty", "BOOLEAN DEFAULT FALSE"),
            ("content_published_at", "TIMESTAMP" if dialect == 'postgresql' else "DATETIME"),
        ]

        with engine.connect() as conn:
            for col_name, col_type in exp_needed:
                if col_name not in exp_cols:
                    print(f"Adding missing column to experiments: {col_name}")
                    if dialect == 'postgresql':
                        conn.execute(text(f"ALTER TABLE experiments ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                    else:
                        conn.execute(text(f"ALTER TABLE experiments ADD COLUMN {col_name} {col_type};"))
                    conn.commit()

            # 3. Check and add missing columns to interventions
            if inspector.has_table('interventions'):
                int_cols = {c['name']: c for c in inspector.get_columns('interventions')}
                int_needed = [
                    ("risk_score_before", "FLOAT"),
                    ("risk_score_after", "FLOAT"),
                    ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP" if dialect == 'postgresql' else "DATETIME DEFAULT CURRENT_TIMESTAMP"),
                    ("updated_at", "TIMESTAMP" if dialect == 'postgresql' else "DATETIME"),
                    ("notes", "TEXT"),
                ]
                for col_name, col_type in int_needed:
                    if col_name not in int_cols:
                        print(f"Adding missing column to interventions: {col_name}")
                        if dialect == 'postgresql':
                            conn.execute(text(f"ALTER TABLE interventions ADD COLUMN IF NOT EXISTS {col_name} {col_type};"))
                        else:
                            conn.execute(text(f"ALTER TABLE interventions ADD COLUMN {col_name} {col_type};"))
                        conn.commit()

            # 4. Check and add department_id to batches
            if inspector.has_table('batches'):
                batch_cols = {c['name']: c for c in inspector.get_columns('batches')}
                if 'department_id' not in batch_cols:
                    print("Adding missing column to batches: department_id")
                    if dialect == 'postgresql':
                        conn.execute(text("ALTER TABLE batches ADD COLUMN IF NOT EXISTS department_id VARCHAR(36) REFERENCES departments(id);"))
                    else:
                        conn.execute(text("ALTER TABLE batches ADD COLUMN department_id VARCHAR(36) REFERENCES departments(id);"))
                    conn.commit()

        print("Migration completed successfully.")

if __name__ == '__main__':
    migrate()
