"""
Flask extensions — initialized here, wired to app in create_app()
Import from here everywhere else to avoid circular imports
"""
import os

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
socketio = SocketIO()

# Rate-limiter storage: memory:// locally, redis:// in multi-worker prod so
# counters are shared. Set RATELIMIT_STORAGE_URI in the environment (.env is
# loaded before this module is imported).
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.environ.get('RATELIMIT_STORAGE_URI', 'memory://'),
)
