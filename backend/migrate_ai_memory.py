"""migrate_ai_memory.py — create ai_learner_memory (idempotent)."""
import os
from sqlalchemy import create_engine, text

DB_URL = os.environ.get('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')

eng = create_engine(DB_URL)
with eng.begin() as c:
    if not c.execute(text("SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ai_learner_memory'")).first():
        c.execute(text("""
            CREATE TABLE ai_learner_memory (
                id                VARCHAR(36) PRIMARY KEY,
                user_id           VARCHAR(36) NOT NULL UNIQUE REFERENCES users(id),
                goal              TEXT,
                preferred_language VARCHAR(30),
                tutor_notes       TEXT,
                snapshot          TEXT,
                snapshot_at       TIMESTAMP,
                updated_at        TIMESTAMP DEFAULT now()
            )
        """))
        c.execute(text("CREATE INDEX ix_ailm_user ON ai_learner_memory (user_id)"))
        print('ai_learner_memory created')
    else:
        print('ai_learner_memory already present')
print('MIGRATION OK')
