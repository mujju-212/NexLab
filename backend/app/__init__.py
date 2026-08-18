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
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={
        r"/api/*": {
            "origins": "*",
            "allow_headers": ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
        }
    })

    socketio.init_app(app, cors_allowed_origins='*', async_mode='threading')
    limiter.init_app(app)

    # ── Register blueprints ───────────────────────────────────────────────
    from app.auth.routes import auth_bp
    from app.admin.routes import admin_bp
    from app.admin.platform import platform_bp
    from app.institution.routes import institution_bp
    from app.institution.extended import institution_ext_bp
    from app.institution.departments import departments_bp
    from app.instructor.routes import instructor_bp
    from app.instructor.content import content_bp
    from app.instructor.simulation import simulation_bp
    from app.instructor.attendance import attendance_bp
    from app.student.routes import student_bp
    from app.execution.routes import execution_bp
    from app.ai.routes import ai_bp
    from app.ml.routes import ml_bp
    from app.free.routes import free_bp
    from app.practice.routes import practice_bp

    app.register_blueprint(auth_bp,            url_prefix='/api/auth')
    app.register_blueprint(admin_bp,           url_prefix='/api/admin')
    app.register_blueprint(platform_bp,        url_prefix='/api/platform')
    app.register_blueprint(institution_bp,     url_prefix='/api/institution')
    app.register_blueprint(institution_ext_bp, url_prefix='/api/institution')
    app.register_blueprint(departments_bp,     url_prefix='/api/institution')
    app.register_blueprint(instructor_bp,      url_prefix='/api/instructor')
    app.register_blueprint(content_bp,         url_prefix='/api/instructor')
    app.register_blueprint(simulation_bp,      url_prefix='/api/instructor')
    app.register_blueprint(attendance_bp,      url_prefix='/api/instructor')
    app.register_blueprint(student_bp,         url_prefix='/api/student')
    app.register_blueprint(execution_bp,       url_prefix='/api/execution')
    app.register_blueprint(ai_bp,              url_prefix='/api/ai')
    app.register_blueprint(ml_bp,              url_prefix='/api/ml')
    app.register_blueprint(free_bp,            url_prefix='/api/free')
    app.register_blueprint(practice_bp,        url_prefix='/api/practice')

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

    # ── Seed platform config defaults ─────────────────────────────────────
    with app.app_context():
        try:
            from app.models.institution import PlatformConfig
            PlatformConfig.seed_defaults()
        except Exception:
            pass  # Table may not exist yet (before first migration)

    # ── Health check route ─────────────────────────────────────────────────
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

    # ── Serve workspace (free courses) as static files ────────────────────
    @app.route('/workspace/')
    @app.route('/workspace/<path:filename>')
    def serve_workspace(filename='index.html'):
        from flask import send_from_directory
        ws_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'workspace')
        return send_from_directory(ws_dir, filename)

    # ── Local lab record PDF serving (dev mode — no Cloudinary) ──────────
    @app.route('/lab_records/<path:filename>')
    def serve_lab_record(filename):
        from flask import send_from_directory, abort
        lab_dir = _os.path.join(_os.path.dirname(_os.path.dirname(__file__)), 'lab_records')
        if not _os.path.exists(_os.path.join(lab_dir, filename)):
            abort(404)
        return send_from_directory(lab_dir, filename, mimetype='application/pdf')

    # ── Global error handlers ─────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return {'error': 'Not found'}, 404

    @app.errorhandler(422)
    def unprocessable(e):
        return {'error': 'Unprocessable entity'}, 422

    @app.errorhandler(500)
    def internal_error(e):
        return {'error': 'Internal server error'}, 500

    return app
