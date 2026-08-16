import os, sys, traceback

os.environ['FLASK_ENV'] = 'development'
dev_sqlite_db = 'sqlite:///' + os.path.join(os.path.dirname(__file__), 'dev.db').replace('\\', '/')
os.environ.setdefault('DATABASE_URL', os.environ.get('DATABASE_URL', dev_sqlite_db))
os.environ['SECRET_KEY'] = 'vlab-dev-secret'
os.environ['JWT_SECRET_KEY'] = 'vlab-jwt-secret'

# Suppress warnings
import warnings
warnings.filterwarnings('ignore')

try:
    from app import create_app
    app = create_app()
    print("[SUCCESS] App created successfully")

    with app.app_context():
        from flask_migrate import upgrade
        print("Running db upgrade...")
        upgrade()
        print("[SUCCESS] Database upgrade complete!")

        # Verify tables exist
        from app.extensions import db
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        tables = sorted(inspector.get_table_names())
        print(f"\n[SUCCESS] {len(tables)} tables created:")
        for t in tables:
            print(f"   * {t}")

except Exception as e:
    print(f"\n[ERROR] {type(e).__name__}: {e}")
    traceback.print_exc()
    sys.exit(1)

