import os
from datetime import timedelta


class Config:
    # ── Flask Core ────────────────────────────────────────────────────────
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-prod')
    DEBUG = False
    TESTING = False

    # ── Database ──────────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/virtuallab')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_recycle': 300,
        'pool_pre_ping': True,   # reconnect on stale connections
    }

    # ── JWT ───────────────────────────────────────────────────────────────
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=int(os.environ.get('JWT_ACCESS_TOKEN_EXPIRES', 86400)))
    JWT_TOKEN_LOCATION = ['headers']
    JWT_HEADER_NAME = 'Authorization'
    JWT_HEADER_TYPE = 'Bearer'

    # ── CORS ──────────────────────────────────────────────────────────────
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # ── Judge0 (code execution) ────────────────────────────────────────────
    JUDGE0_URL = os.environ.get('JUDGE0_URL', 'http://localhost:2358')
    JUDGE0_API_KEY = os.environ.get('JUDGE0_API_KEY', '')
    JUDGE0_MODE = os.environ.get('JUDGE0_MODE', 'polling')   # polling | webhook
    JUDGE0_WEBHOOK_SECRET = os.environ.get('JUDGE0_WEBHOOK_SECRET', '')

    # ── Groq API ──────────────────────────────────────────────────────────
    GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
    GROQ_DAILY_LIMIT_PER_INSTITUTION = int(os.environ.get('GROQ_DAILY_LIMIT_PER_INSTITUTION', 500))

    # ── Cloudinary ────────────────────────────────────────────────────────
    CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY', '')
    CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET', '')

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    USE_REDIS = os.environ.get('USE_REDIS', 'false').lower() == 'true'

    # ── ML Models ─────────────────────────────────────────────────────────
    ML_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'ml_models')
    FOCUS_MODEL_PATH = os.path.join(ML_MODELS_DIR, 'focus_rf.pkl')

    # ── Misc ──────────────────────────────────────────────────────────────
    BASE_URL = os.environ.get('BASE_URL', 'http://localhost:5000')
    JITSI_DOMAIN = os.environ.get('JITSI_DOMAIN', 'meet.jit.si')

    # Code execution limits (applied to all Docker containers)
    CODE_TIME_LIMIT_SEC = 10
    CODE_MEMORY_LIMIT_KB = 262144    # 256 MB

    # Plagiarism threshold
    PLAGIARISM_THRESHOLD = 0.85      # 85% similarity → flag

    # Code quality
    COMPLEXITY_WARN_THRESHOLD = 10   # Cyclomatic complexity > 10 = warning


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 20,
        'pool_recycle': 300,
        'pool_pre_ping': True,
    }


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'postgresql://postgres:password@localhost:5432/virtuallab_test'


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
