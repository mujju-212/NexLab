"""
Import test — runs all app imports without starting server or needing DB.
Catches syntax errors, missing imports, wrong field names.
"""
import sys
import os

# Set env vars before loading app
os.environ.setdefault('FLASK_ENV', 'development')
os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@localhost:5433/virtuallab')
os.environ.setdefault('SECRET_KEY', 'test-key')
os.environ.setdefault('JWT_SECRET_KEY', 'test-jwt-key')

errors = []
tests = []

def try_import(label, fn):
    try:
        fn()
        tests.append(('✅', label))
    except Exception as e:
        tests.append(('❌', f"{label}: {type(e).__name__}: {e}"))
        errors.append(label)

# 1. Extensions
try_import('extensions', lambda: __import__('app.extensions', fromlist=['db']))

# 2. Config
try_import('config', lambda: __import__('app.config', fromlist=['config']))

# 3. Models — each individually
try_import('model: Institution',    lambda: __import__('app.models.institution', fromlist=['Institution']))
try_import('model: User',           lambda: __import__('app.models.user', fromlist=['User']))
try_import('model: Academic',       lambda: __import__('app.models.academic', fromlist=['AcademicYear']))
try_import('model: Subject',        lambda: __import__('app.models.subject', fromlist=['Subject']))
try_import('model: Experiment',     lambda: __import__('app.models.experiment', fromlist=['Experiment']))
try_import('model: Session',        lambda: __import__('app.models.session', fromlist=['LabSession']))
try_import('model: Submission',     lambda: __import__('app.models.submission', fromlist=['CodeAttempt']))
try_import('model: Grading',        lambda: __import__('app.models.grading', fromlist=['Grade']))
try_import('model: Knowledge',      lambda: __import__('app.models.knowledge', fromlist=['ConceptMastery']))
try_import('model: Feedback',       lambda: __import__('app.models.feedback', fromlist=['SessionFeedback']))

# 4. Auth
try_import('auth.utils',   lambda: __import__('app.auth.utils', fromlist=['require_role']))
try_import('auth.routes',  lambda: __import__('app.auth.routes', fromlist=['auth_bp']))

# 5. Blueprints
try_import('admin.routes',       lambda: __import__('app.admin.routes', fromlist=['admin_bp']))
try_import('institution.routes', lambda: __import__('app.institution.routes', fromlist=['institution_bp']))
try_import('instructor.routes',  lambda: __import__('app.instructor.routes', fromlist=['instructor_bp']))
try_import('student.routes',     lambda: __import__('app.student.routes', fromlist=['student_bp']))
try_import('execution.routes',   lambda: __import__('app.execution.routes', fromlist=['execution_bp']))
try_import('ai.routes',          lambda: __import__('app.ai.routes', fromlist=['ai_bp']))
try_import('ml.routes',          lambda: __import__('app.ml.routes', fromlist=['ml_bp']))

# 6. Sockets
try_import('sockets.events', lambda: __import__('app.sockets.events'))

# 7. Jobs
try_import('jobs', lambda: __import__('app.jobs', fromlist=['scheduler']))

# ── Print results ─────────────────────────────────────────────────────────────
print("\n" + "="*60)
print("IMPORT TEST RESULTS")
print("="*60)
for icon, msg in tests:
    print(f"  {icon}  {msg}")

print("="*60)
if errors:
    print(f"\n❌ {len(errors)} import(s) failed — fix before running flask db migrate")
    sys.exit(1)
else:
    print(f"\n✅ All {len(tests)} imports passed — safe to run migrations")
