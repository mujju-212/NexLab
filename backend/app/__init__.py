import os
import warnings
from flask import Flask
from dotenv import load_dotenv

# Suppress eventlet deprecation noise
warnings.filterwarnings('ignore', category=DeprecationWarning, module='eventlet')

load_dotenv()

from app.config import config
from app.extensions import db, migrate, jwt, cors, socketio, limiter


def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(__name__, template_folder='../templates')
    app.config.from_object(config[config_name])

    # ── Initialize extensions ─────────────────────────────────────────────
    db.init_app(app)

    # Analytics caches are invalidated by the writes themselves (see
    # app/analytics/freshness.py) so no read can serve a pre-write number.
    try:
        from app.analytics.freshness import install_hooks, init_http_cache
        install_hooks()
        init_http_cache(app)
    except Exception:  # never block boot on the cache layer
        pass

    # ── High-Performance SQLite Connection Optimization ──────────────────
    with app.app_context():
        try:
            from sqlalchemy import event
            from sqlalchemy.engine import Engine
            import sqlite3

            @event.listens_for(Engine, "connect")
            def set_sqlite_pragma(dbapi_connection, connection_record):
                if isinstance(dbapi_connection, sqlite3.Connection):
                    cursor = dbapi_connection.cursor()
                    cursor.execute("PRAGMA journal_mode = WAL;")
                    cursor.execute("PRAGMA synchronous = NORMAL;")
                    cursor.execute("PRAGMA cache_size = -64000;")  # 64MB RAM page cache
                    cursor.execute("PRAGMA busy_timeout = 5000;")
                    cursor.execute("PRAGMA temp_store = MEMORY;")
                    cursor.execute("PRAGMA foreign_keys = ON;")
                    cursor.close()
        except Exception:
            pass

    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": "*",
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
        }
    })

    @app.after_request
    def add_cors_headers(response):
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
        return response

    # async_mode: 'threading' pairs with waitress (local dev on Windows/Linux);
    # 'eventlet' pairs with `gunicorn -k eventlet` in production. Selected via
    # env so the same code runs on both. When USE_REDIS=true, Socket.IO gets a
    # Redis message-broker so multi-worker fan-out keeps working
    # (single-worker setups don't need it).
    sio_kwargs = {
        'cors_allowed_origins': '*',
        'async_mode': os.environ.get('SOCKETIO_ASYNC_MODE', 'threading'),
    }
    if app.config.get('USE_REDIS'):
        sio_kwargs['client_manager'] = app.config['REDIS_URL']
    socketio.init_app(app, **sio_kwargs)
    limiter.init_app(app)

    # ── Register blueprints ───────────────────────────────────────────────
    from app.auth.routes import auth_bp
    from app.admin.routes import admin_bp
    from app.admin.platform import platform_bp
    from app.institution.routes import institution_bp
    from app.institution.extended import institution_ext_bp
    from app.institution.departments import departments_bp
    from app.institution.planner import planner_bp
    from app.institution.announcements import announcements_inst_bp
    from app.instructor.routes import instructor_bp
    from app.instructor.content import content_bp
    from app.instructor.simulation import simulation_bp
    from app.instructor.attendance import attendance_bp
    from app.instructor.analytics import analytics_bp
    from app.instructor.conductor import conductor_bp
    from app.instructor.features import features_bp
    from app.instructor.management import mgmt_bp
    from app.instructor.tier2 import tier2_bp
    from app.instructor.exams import exam_bp
    from app.student.routes import student_bp
    from app.student.exams import student_exam_bp
    from app.execution.routes import execution_bp
    from app.ai.routes import ai_bp
    from app.ml.routes import ml_bp
    from app.platform_user.routes import platform_user_bp
    from app.practice.routes import practice_bp
    from app.practice.extras import extra_bp
    from app.notifications import notif_bp
    from app.analytics.routes import student_analytics_bp
    from app.student_analytics.routes import student_facing_analytics_bp, platform_public_bp
    from app.platform_user_analytics.routes import platform_user_analytics_bp
    from app.admin.users import admin_users_bp
    from app.admin.tenant import admin_tenant_bp
    from app.admin.content import admin_content_bp
    from app.admin.growth import admin_growth_bp
    from app.admin.metrics import admin_metrics_bp
    from app.admin.governance import admin_governance_bp
    from app.ai.tutor_routes import tutor_bp

    app.register_blueprint(auth_bp,               url_prefix='/api/auth')
    app.register_blueprint(admin_bp,              url_prefix='/api/admin')
    app.register_blueprint(admin_users_bp,         url_prefix='/api/admin')
    app.register_blueprint(admin_tenant_bp,        url_prefix='/api/admin')
    app.register_blueprint(admin_content_bp,      url_prefix='/api/admin')
    app.register_blueprint(admin_growth_bp,       url_prefix='/api/admin')
    app.register_blueprint(admin_metrics_bp,      url_prefix='/api/admin')
    app.register_blueprint(admin_governance_bp,   url_prefix='/api/admin')
    app.register_blueprint(tutor_bp,             url_prefix='/api/ai')
    app.register_blueprint(platform_bp,           url_prefix='/api/platform')
    app.register_blueprint(platform_public_bp,    url_prefix='/api/platform')
    app.register_blueprint(announcements_inst_bp, url_prefix='/api/institution')
    app.register_blueprint(institution_bp,        url_prefix='/api/institution')
    app.register_blueprint(institution_ext_bp,    url_prefix='/api/institution')
    app.register_blueprint(departments_bp,        url_prefix='/api/institution')
    app.register_blueprint(planner_bp,            url_prefix='/api/institution')
    app.register_blueprint(instructor_bp,      url_prefix='/api/instructor')
    app.register_blueprint(content_bp,         url_prefix='/api/instructor')
    app.register_blueprint(simulation_bp,      url_prefix='/api/instructor')
    app.register_blueprint(attendance_bp,      url_prefix='/api/instructor')
    app.register_blueprint(analytics_bp,       url_prefix='/api/instructor/analytics')
    app.register_blueprint(conductor_bp,       url_prefix='/api/instructor')
    app.register_blueprint(features_bp,        url_prefix='/api/instructor')
    app.register_blueprint(mgmt_bp,            url_prefix='/api/instructor')
    app.register_blueprint(tier2_bp,           url_prefix='/api/instructor')
    app.register_blueprint(exam_bp,            url_prefix='/api/instructor')
    app.register_blueprint(student_bp,         url_prefix='/api/student')
    app.register_blueprint(student_exam_bp,    url_prefix='/api/student')
    app.register_blueprint(execution_bp,       url_prefix='/api/execution')
    app.register_blueprint(ai_bp,              url_prefix='/api/ai')
    app.register_blueprint(ml_bp,              url_prefix='/api/ml')
    app.register_blueprint(platform_user_bp,            url_prefix='/api/platform-user')
    app.register_blueprint(platform_user_analytics_bp,  url_prefix='/api/platform-user/analytics')
    app.register_blueprint(practice_bp,        url_prefix='/api/practice')
    app.register_blueprint(extra_bp,           url_prefix='/api/practice')
    app.register_blueprint(notif_bp,           url_prefix='/api')
    app.register_blueprint(student_analytics_bp, url_prefix='/api/analytics')
    app.register_blueprint(student_facing_analytics_bp, url_prefix='/api/student/analytics')


    # ── Execution Engine v2 (Docker runner) ─────────────────────────────
    # Registered unconditionally — all routes return 503 when the flag is off.
    from app.exec_engine.routes_v2 import exec_v2_bp
    app.register_blueprint(exec_v2_bp, url_prefix='/api/execution')

    # ── Register Socket.io event handlers ────────────────────────────────
    from app.sockets import events  # noqa — registers handlers on import

    # ── Register background jobs ──────────────────────────────────────────
    from app import jobs
    if not app.testing:
        jobs.init_app(app)
        jobs.start()

    # ── Execution Engine v2 — admission control + reaper ─────────────────
    # Only started when DOCKER_RUNNER_ENABLED=true (master flag off by default).
    if app.config.get('DOCKER_RUNNER_ENABLED', False) and not app.testing:
        from app.exec_engine import admission, reaper
        admission.init_app(app)
        reaper.init_app(app)

    # ── Seed platform config defaults & ensure hot-path DB indexes + AI Harness schema ──
    with app.app_context():
        try:
            from app.models.institution import PlatformConfig
            PlatformConfig.seed_defaults()
        except Exception:
            pass
        try:
            from app.models.admin_copilot import AIGeneratedDocument
            AIGeneratedDocument.__table__.create(bind=db.engine, checkfirst=True)
        except Exception:
            pass
        try:
            from app.models.feedback import SessionFeedbackReceipt
            SessionFeedbackReceipt.__table__.create(bind=db.engine, checkfirst=True)
        except Exception:
            pass
        try:
            from sqlalchemy import text as _sa_text
            _SCHEMA_AND_INDEX_DDL = [
                # AI Harness Phase 1 & 2 schema upgrades (safe idempotent column additions)
                "ALTER TABLE admin_chat_sessions ADD COLUMN role_scope VARCHAR(30) DEFAULT 'institution_admin'",
                "ALTER TABLE admin_chat_sessions ADD COLUMN compact_memory TEXT",
                "ALTER TABLE admin_chat_sessions ADD COLUMN page_context JSON",
                "ALTER TABLE admin_chat_messages ADD COLUMN generated_doc JSON",
                "ALTER TABLE admin_chat_messages ADD COLUMN socratic_filtered BOOLEAN DEFAULT FALSE",
                "ALTER TABLE institution_documents ADD COLUMN scope_type VARCHAR(30) DEFAULT 'institution'",
                "ALTER TABLE institution_documents ADD COLUMN scope_id VARCHAR(36)",
                "ALTER TABLE institution_documents ADD COLUMN doc_type VARCHAR(20) DEFAULT 'pdf'",
                "ALTER TABLE batches ADD COLUMN department_id VARCHAR(36) REFERENCES departments(id)",
                "CREATE INDEX IF NOT EXISTS ix_batches_department_id ON batches (department_id)",
                "ALTER TABLE session_attendance ADD COLUMN feedback_submitted BOOLEAN DEFAULT FALSE",
                # Hot-path indexes
                "CREATE INDEX IF NOT EXISTS ix_grades_student_exp ON grades (student_id, experiment_id)",
                "CREATE INDEX IF NOT EXISTS ix_grades_exp_final ON grades (experiment_id, final_grade)",
                "CREATE INDEX IF NOT EXISTS ix_grades_student_created ON grades (student_id, created_at)",
                "CREATE INDEX IF NOT EXISTS ix_code_attempts_student_exp_sub ON code_attempts (student_id, experiment_id, submitted_at)",
                "CREATE INDEX IF NOT EXISTS ix_code_attempts_student_sub ON code_attempts (student_id, submitted_at)",
                "CREATE INDEX IF NOT EXISTS ix_code_versions_student_exp_ver ON code_versions (student_id, experiment_id, version_number)",
                "CREATE INDEX IF NOT EXISTS ix_code_versions_session_student ON code_versions (session_id, student_id, saved_at)",
                "CREATE INDEX IF NOT EXISTS ix_session_attendance_student_status ON session_attendance (student_id, status)",
                "CREATE INDEX IF NOT EXISTS ix_concept_mastery_inst_student ON concept_mastery (institution_id, student_id)",
                "CREATE INDEX IF NOT EXISTS ix_concept_mastery_inst_concept ON concept_mastery (institution_id, concept)",
                "CREATE INDEX IF NOT EXISTS ix_notifications_user_unread ON notifications (user_id, is_read, created_at)",
                "CREATE INDEX IF NOT EXISTS ix_section_subjects_inst_instr ON section_subjects (institution_id, instructor_id)",
                "CREATE INDEX IF NOT EXISTS ix_section_subjects_sec_subj ON section_subjects (section_id, subject_id)",
                "CREATE INDEX IF NOT EXISTS ix_subjects_inst_dept ON subjects (institution_id, department_id)",
                "CREATE INDEX IF NOT EXISTS ix_experiments_inst_subj ON experiments (institution_id, subject_id)",
                "CREATE INDEX IF NOT EXISTS ix_experiments_instructor ON experiments (instructor_id)",
                "CREATE INDEX IF NOT EXISTS ix_test_cases_experiment ON test_cases (experiment_id)",
                "CREATE INDEX IF NOT EXISTS ix_content_modules_exp_order ON content_modules (experiment_id, display_order)",
                "CREATE INDEX IF NOT EXISTS ix_quiz_questions_module ON quiz_questions (module_id)",
                "CREATE INDEX IF NOT EXISTS ix_exams_inst_subj ON exams (institution_id, subject_id)",
                "CREATE INDEX IF NOT EXISTS ix_exam_questions_exam ON exam_questions (exam_id, display_order)",
                "CREATE INDEX IF NOT EXISTS ix_exam_questions_exp ON exam_questions (experiment_id, display_order)",
                "CREATE INDEX IF NOT EXISTS ix_exam_attempts_student_exam ON exam_attempts (student_id, exam_id)",
                "CREATE INDEX IF NOT EXISTS ix_exam_attempts_student_exp ON exam_attempts (student_id, experiment_id)",
                "CREATE INDEX IF NOT EXISTS ix_practice_subs_stu_run_status_dt ON practice_submissions (student_id, is_run, status, submitted_at)",
                "CREATE INDEX IF NOT EXISTS ix_platform_exercises_course_order ON platform_exercises (course_id, order_index)",
                "CREATE INDEX IF NOT EXISTS ix_platform_progress_user_course ON platform_progress (user_id, course_id, status)",
                "CREATE INDEX IF NOT EXISTS ix_admin_chat_sessions_user_role ON admin_chat_sessions (user_id, role_scope)",
                "CREATE INDEX IF NOT EXISTS ix_inst_docs_scope ON institution_documents (scope_type, scope_id)",
            ]
            for _ddl in _SCHEMA_AND_INDEX_DDL:
                try:
                    with db.engine.begin() as _conn:
                        _conn.execute(_sa_text(_ddl))
                except Exception:
                    pass
        except Exception:
            pass

    # ── Root & Health check routes ─────────────────────────────────────────
    @app.route('/')
    def root():
        return {
            'status': 'online',
            'service': 'NexLab Virtual Lab API',
            'version': '1.0.0',
            'health_check': '/health',
            'api_base': '/api',
            'frontend_url': 'http://localhost:3000'
        }, 200

    @app.route('/health')
    def health():
        return {'status': 'ok', 'service': 'virtual-lab-api'}, 200

    # ── Test UI route (dev only) ───────────────────────────────────────────
    import os as _os
    @app.route('/test')
    def test_ui():
        from flask import send_file
        ui_path = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'test_ui.html')
        return send_file(ui_path)

    @app.route('/student-test')
    def student_test():
        from flask import send_file
        p = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'test_live_student.html')
        return send_file(p)

    @app.route('/instructor-test')
    def instructor_test():
        from flask import send_file
        p = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'test_live_instructor.html')
        return send_file(p)

    # ── Serve workspace (platform courses) as static files ────────────────────
    @app.route('/workspace/')
    @app.route('/workspace/<path:filename>')
    def serve_workspace(filename='index.html'):
        from flask import send_from_directory
        ws_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), '..', 'workspace')
        return send_from_directory(_os.path.abspath(ws_dir), filename)

    @app.route('/courses/<slug>')
    @app.route('/courses/<slug>/<path:subpath>')
    def serve_course_frontend(slug, subpath=''):
        from flask import send_from_directory
        ws_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), '..', 'workspace')
        return send_from_directory(_os.path.abspath(ws_dir), 'course.html')

    # ── Local lab record PDF serving (dev mode — no Cloudinary) ──────────
    @app.route('/lab_records/<path:filename>')
    def serve_lab_record(filename):
        from flask import send_from_directory, abort
        lab_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'lab_records')
        if not _os.path.exists(_os.path.join(lab_dir, filename)):
            abort(404)
        return send_from_directory(lab_dir, filename, mimetype='application/pdf')

    # ── Global error handlers ──────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return {'error': 'Not found'}, 404

    @app.errorhandler(422)
    def unprocessable(e):
        return {'error': 'Unprocessable entity'}, 422

    @app.errorhandler(500)
    def internal_error(e):
        db.session.rollback()
        return {'error': 'Internal server error'}, 500

    return app
