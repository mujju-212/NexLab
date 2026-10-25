"""
migrate_free_to_platform.py — rename the 'free user' concept to 'platform user'
in the LIVE Postgres database (idempotent, data-preserving).

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          ./venv/Scripts/python.exe migrate_free_to_platform.py

Applies (each step checks current state first):
  1. users.role:  'free_user' -> 'platform_user'
  2. Tables:      free_courses -> platform_courses
                  free_exercises -> platform_exercises
                  free_progress -> platform_progress
  3. Constraints: free_*_pkey / uq_free_progress -> platform names
  4. Indexes:     ix_free_* -> ix_platform_*
  5. platform_config key: 'free_user_daily_ai_calls' -> 'platform_user_daily_ai_calls'
"""
import os
import sys

from sqlalchemy import create_engine, text

DB_URL = os.environ.get(
    'DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')

TABLE_RENAMES = [
    ('free_courses',    'platform_courses'),
    ('free_exercises',  'platform_exercises'),
    ('free_progress',   'platform_progress'),
]

CONSTRAINT_RENAMES = [                      # (table_after_rename, old, new)
    ('platform_courses',   'free_courses_pkey',           'platform_courses_pkey'),
    ('platform_courses',   'free_courses_slug_key',       'platform_courses_slug_key'),
    ('platform_exercises', 'free_exercises_pkey',         'platform_exercises_pkey'),
    ('platform_progress',  'free_progress_pkey',          'platform_progress_pkey'),
    ('platform_progress',  'uq_free_progress',            'uq_platform_progress'),
]

INDEX_RENAMES = [
    ('free_exercises', 'ix_free_exercises_course_order', 'ix_platform_exercises_course_order'),
    ('free_progress',  'ix_free_progress_user_course',   'ix_platform_progress_user_course'),
]

CONFIG_KEY_RENAME = ('free_user_daily_ai_calls', 'platform_user_daily_ai_calls')


def table_exists(c, name):
    return c.execute(text(
        "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=:n"
    ), {'n': name}).first() is not None


def constraint_exists(c, table, name):
    return c.execute(text(
        "SELECT 1 FROM pg_constraint WHERE conrelid=CAST(:t AS regclass) AND conname=:n"
    ), {'t': table, 'n': name}).first() is not None


def index_exists(c, name):
    return c.execute(text(
        "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=:n"
    ), {'n': name}).first() is not None


def config_key_exists(c, key):
    return c.execute(text(
        'SELECT 1 FROM platform_config WHERE key=:k'
    ), {'k': key}).first() is not None


def main():
    eng = create_engine(DB_URL)
    with eng.begin() as c:
        # 1. Role values
        n = c.execute(text(
            "UPDATE users SET role='platform_user' WHERE role='free_user'"
        )).rowcount
        print(f"[1] users.role free_user -> platform_user : {n} row(s) updated")

        # 2. Table renames
        for old, new in TABLE_RENAMES:
            if table_exists(c, old):
                c.execute(text(f'ALTER TABLE {old} RENAME TO {new}'))
                print(f"[2] table {old} -> {new}")
            else:
                print(f"[2] table {old} already migrated (or absent)")

        # 3. Constraint renames
        for table, old, new in CONSTRAINT_RENAMES:
            if table_exists(c, table) and constraint_exists(c, table, old):
                c.execute(text(f'ALTER TABLE {table} RENAME CONSTRAINT {old} TO {new}'))
                print(f"[3] constraint {old} -> {new} on {table}")

        # 4. Index renames
        for _table, old, new in INDEX_RENAMES:
            if index_exists(c, old):
                c.execute(text(f'ALTER INDEX {old} RENAME TO {new}'))
                print(f"[4] index {old} -> {new}")

        # 5. Config key
        old_key, new_key = CONFIG_KEY_RENAME
        if config_key_exists(c, old_key):
            if config_key_exists(c, new_key):
                c.execute(text('DELETE FROM platform_config WHERE key=:k'), {'k': old_key})
                print(f"[5] config key {old_key} dropped (new key already present)")
            else:
                c.execute(text(
                    'UPDATE platform_config SET key=:new WHERE key=:old'
                ), {'old': old_key, 'new': new_key})
                print(f"[5] config key {old_key} -> {new_key}")
        else:
            print(f"[5] config key {old_key} already migrated (or absent)")

        # 6. Demo fixtures: seeded platform-user login email + public showcase slug
        n = c.execute(text(
            "UPDATE users SET email='platform@nexlab.io' WHERE email='free@nexlab.io'"
        )).rowcount
        print(f"[6] demo email free@nexlab.io -> platform@nexlab.io : {n} row(s)")
        n = c.execute(text(
            "UPDATE practice_student_xp SET profile_slug='platform-learner'"
            " WHERE profile_slug='free-learner'"
        )).rowcount
        print(f"[6] showcase slug free-learner -> platform-learner : {n} row(s)")

        # Summary
        roles = c.execute(text(
            "SELECT role, COUNT(*) FROM users WHERE role IN ('free_user','platform_user')"
            " GROUP BY role"
        )).fetchall()
        tables = [t for t, _ in TABLE_RENAMES + [(n, o) for o, n in TABLE_RENAMES]]
        remaining = [t for t in ('free_courses', 'free_exercises', 'free_progress')
                     if table_exists(c, t)]
        print(f"\nSUMMARY: roles now {dict(roles)} | leftover free_* tables: {remaining or 'none'}")
        if remaining or any(r == 'free_user' for r, _ in roles):
            print('WARNING: leftovers detected — inspect manually.')
            sys.exit(1)
        print('MIGRATION OK')


if __name__ == '__main__':
    main()
