import os
from datetime import timedelta


def _get_db_url():
    db_url = os.environ.get('DATABASE_URL')
    if db_url and db_url.startswith('postgresql'):
        try:
            import socket
            from urllib.parse import urlparse
            parsed = urlparse(db_url)
            host = parsed.hostname or 'localhost'
            port = parsed.port or 5432
            s = socket.create_connection((host, port), timeout=1)
            s.close()
            return db_url
        except Exception:
            base_dir = os.path.dirname(os.path.dirname(__file__))
            dev_db = os.path.join(base_dir, 'dev.db').replace('\\', '/')
            return f'sqlite:///{dev_db}'
    if not db_url:
        base_dir = os.path.dirname(os.path.dirname(__file__))
        dev_db = os.path.join(base_dir, 'dev.db').replace('\\', '/')
        return f'sqlite:///{dev_db}'
    return db_url


class Config:
    # ── Flask Core ────────────────────────────────────────────────────────
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DEBUG = False
    TESTING = False

    # ── Database ──────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = _get_db_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    if SQLALCHEMY_DATABASE_URI.startswith('sqlite'):
        SQLALCHEMY_ENGINE_OPTIONS = {}
    else:
        # Sized to cover waitress' default 16 threads with burst headroom so a
        # page fan-out (dashboard = 6 concurrent queries) never queues on the
        # pool. pool_pre_ping keeps recycled-after-idle connections from
        # 500-ing when Postgres has closed them server-side.
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_size': 10,
            'max_overflow': 20,
            'pool_recycle': 300,
            'pool_pre_ping': True,
            'pool_timeout': 20,
        }



    # ── JWT ───────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES', 86400)))
    JWT_TOKEN_LOCATION = ['headers']
    JWT_HEADER_NAME = 'Authorization'
    JWT_HEADER_TYPE = 'Bearer'

    # ── CORS ──────────────────────────────────────────────────────────────
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # ── Groq API ──────────────────────────────────────────────────────────
    GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
    OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')
    GROQ_DAILY_LIMIT_PER_INSTITUTION = int(os.environ.get('GROQ_DAILY_LIMIT_PER_INSTITUTION', 500))

    # ── Gemini API (fallback when all Groq models are rate-limited) ───────
    GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

    # ── Cloudinary ────────────────────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY', '')
    CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET', '')

    # ── Brevo (transactional email — OTP verification only) ────────────────
    BREVO_API_KEY      = os.environ.get('BREVO_API_KEY', '')
    BREVO_SENDER_EMAIL = os.environ.get('BREVO_SENDER_EMAIL', 'no-reply@nexlab.app')
    BREVO_SENDER_NAME  = os.environ.get('BREVO_SENDER_NAME', 'NexLab')

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    USE_REDIS = os.environ.get('USE_REDIS', 'false').lower() == 'true'

    # ── ML Models ─────────────────────────────────────────────────────────
    ML_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml_models')
    FOCUS_MODEL_PATH = os.path.join(ML_MODELS_DIR, 'focus_rf.pkl')

    # ── Misc ──────────────────────────────────────────────────────────────
    BASE_URL = os.environ.get('BASE_URL', 'http://localhost:5000')
    JITSI_DOMAIN = os.environ.get('JITSI_DOMAIN', 'meet.jit.si')  # kept for backward compat

    # ── LiveKit Cloud (replaces Jitsi for live session video) ─────────────
    LIVEKIT_URL        = os.environ.get('LIVEKIT_URL', '')
    LIVEKIT_API_KEY    = os.environ.get('LIVEKIT_API_KEY', '')
    LIVEKIT_API_SECRET = os.environ.get('LIVEKIT_API_SECRET', '')

    # Plagiarism threshold
    PLAGIARISM_THRESHOLD = 0.85      # 85% similarity → flag

    # Code quality
    COMPLEXITY_WARN_THRESHOLD = 10   # Cyclomatic complexity > 10 = warning

    # ── Execution Engine (Docker runner) ──────────────────────────────────
    # Master switch for code execution. When false, /run and /playground return
    # 503 — Docker is the only execution path (Judge0 was removed).
    DOCKER_RUNNER_ENABLED = os.environ.get('DOCKER_RUNNER_ENABLED', 'false').lower() == 'true'
    # Path to the docker binary (override for unusual installs)
    DOCKER_BIN = os.environ.get('DOCKER_BIN', 'docker')
    # Concurrency / queue knobs (§13.2)
    EXEC_MAX_CONCURRENT_RUNS = int(os.environ.get('EXEC_MAX_CONCURRENT_RUNS', 4))
    EXEC_RUN_QUEUE_MAX       = int(os.environ.get('EXEC_RUN_QUEUE_MAX', 12))
    EXEC_PER_USER_CONCURRENT = int(os.environ.get('EXEC_PER_USER_CONCURRENT', 2))
    EXEC_QUEUE_WAIT_TIMEOUT  = int(os.environ.get('EXEC_QUEUE_WAIT_TIMEOUT', 20))
    # Timeout (seconds) for each phase
    EXEC_COMPILE_TIMEOUT_SEC = int(os.environ.get('EXEC_COMPILE_TIMEOUT_SEC', 10))
    EXEC_RUN_TIMEOUT_SEC     = int(os.environ.get('EXEC_RUN_TIMEOUT_SEC', 5))
    # Memory cap for containers (MB)
    EXEC_MEMORY_MB           = int(os.environ.get('EXEC_MEMORY_MB', 256))
    # Per-stream output truncation (KB)
    EXEC_OUTPUT_CAP_KB       = int(os.environ.get('EXEC_OUTPUT_CAP_KB', 256))
    # Orphan-container reaper interval (seconds)
    EXEC_REAPER_INTERVAL_SEC = int(os.environ.get('EXEC_REAPER_INTERVAL_SEC', 300))
    # Per-language engine overrides, e.g. "html=browser" (docker|browser only)
    EXEC_ENGINE_OVERRIDES    = os.environ.get('EXEC_ENGINE_OVERRIDES', '')


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 20,
        'max_overflow': 30,
        'pool_recycle': 300,
        'pool_pre_ping': True,
        'pool_timeout': 20,
    }


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('TEST_DATABASE_URL', 'sqlite:///:memory:')
    SQLALCHEMY_ENGINE_OPTIONS = {}


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
