"""
backfill_cloudinary.py — one-time mirror of EXISTING local files to Cloudinary.

Covers: certificates/, uploads/ (generated docs etc.), lab_records/.
Skips:  simulations/ (multi-file HTML sites served by the app's own static
        route — individual files on Cloudinary wouldn't preserve the site),
        exports/ (GDPR bundles are private, expiring, and user-specific).

Idempotent: Cloudinary overwrites by public_id, so re-running is safe.
Run:  cd backend && ./venv/Scripts/python.exe backfill_cloudinary.py
"""
import os
import sys

os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')
os.environ.setdefault('STORAGE_BACKEND', 'cloudinary')

from app import create_app
from app.services.storage import store_file

BACKFILL_ROOTS = ['certificates', 'uploads', 'lab_records']
SKIP_DIRS = {'test'}
MAX_SIZE_MB = 25

app = create_app('development')
ok = fail = skipped = 0
failures = []

with app.app_context():
    for root in BACKFILL_ROOTS:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for fn in filenames:
                local = os.path.join(dirpath, fn)
                if os.path.getsize(local) > MAX_SIZE_MB * 1024 * 1024:
                    skipped += 1
                    continue
                rel = os.path.relpath(local).replace('\\', '/')
                try:
                    res = store_file(local, rel)
                    if res.get('url'):
                        ok += 1
                        print(f"  ↑ {rel} -> {res['url'][:80]}")
                    else:
                        fail += 1
                        failures.append(rel)
                except Exception as exc:
                    fail += 1
                    failures.append(f'{rel}: {exc}')

    print('\n' + '=' * 70)
    print(f'BACKFILL RESULT: {ok} uploaded, {fail} failed, {skipped} skipped')
    if failures:
        for f in failures[:10]:
            print(f'  FAILED: {f}')
sys.exit(1 if fail else 0)
