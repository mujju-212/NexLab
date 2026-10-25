import os, sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(__file__))

sqlite_db_path = os.path.join(os.path.dirname(__file__), 'dev.db')
if os.path.exists(sqlite_db_path):
    try:
        os.remove(sqlite_db_path)
        print("[SUCCESS] Removed old dev.db")
    except Exception as e:
        print(f"Warning removing dev.db: {e}")

from app import create_app
from app.extensions import db

app = create_app()
with app.app_context():
    db.create_all()
    print("[SUCCESS] Recreated all database tables successfully")

    # Seed test users
    try:
        from database.seed_test_users import seed_users
        seed_users()
        print("[SUCCESS] Seeded test users successfully")
    except Exception as e:
        print(f"Error seeding test users: {e}")

    # Seed platform courses
    try:
        from database.seed_platform_courses import seed_platform_courses
        seed_platform_courses()
        print("[SUCCESS] Seeded platform courses successfully")
    except Exception as e:
        print(f"Error seeding platform courses: {e}")

    # Seed simulation courses
    try:
        from database.seed_simulation_courses import seed_simulations
        seed_simulations()
        print("[SUCCESS] Seeded simulation courses successfully")
    except Exception as e:
        print(f"Error seeding simulation courses: {e}")

print("[COMPLETE] Database reset and initialization complete!")
