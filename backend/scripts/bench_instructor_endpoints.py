"""Instructor-endpoint latency + query-count benchmark (read-only).

Drives the real Flask app in-process (same technique as verify_live_scenario.py)
against Postgres:5433 and reports, per endpoint: median latency, and — when
SQLALCHEMY_ECHO_BENCH=1 is set — the number of SQL statements a single request
issues. The query counts are the before/after proof for the N+1 kills:
dashboard/sessions should drop from hundreds of statements to ~7-20.

Run from backend/ with the venv:
    venv/Scripts/python.exe scripts/bench_instructor_endpoints.py
"""
import os
import statistics
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('FLASK_ENV', 'development')

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from sqlalchemy import event  # noqa: E402

RUNS = int(os.environ.get('BENCH_RUNS', '5'))
EMAIL = os.environ.get('BENCH_EMAIL', 'instructor@nexlab.demo')
PASSWORD = os.environ.get('BENCH_PASSWORD', 'Instructor@123')

app = create_app('development')

# ── statement counter ────────────────────────────────────────────────────────
_stmt_count = 0

from sqlalchemy.engine import Engine  # noqa: E402


@event.listens_for(Engine, 'before_cursor_execute')
def _count_stmts(conn, cursor, statement, parameters, context, executemany):
    global _stmt_count
    _stmt_count += 1


def bench(label, method, path, headers, json_body=None):
    client = app.test_client()
    latencies, counts = [], []
    for _ in range(RUNS):
        global _stmt_count
        _stmt_count = 0
        t = time.perf_counter()
        r = getattr(client, method)(path, headers=headers, json=json_body)
        dt = (time.perf_counter() - t) * 1000
        latencies.append(dt)
        counts.append(_stmt_count)
        if r.status_code != 200:
            print(f'  {label:<38} HTTP {r.status_code}  <-- FAILED: '
                  f'{str(r.get_json())[:100]}')
            return
    print(f'  {label:<38} p50 {statistics.median(latencies):7.1f}ms  '
          f'max {max(latencies):7.1f}ms  stmts/req {max(counts)}')


def main():
    from app.config import config
    uri = config['development'].SQLALCHEMY_DATABASE_URI
    print(f'DB: {uri.split("@")[-1] if "@" in uri else uri}')
    if not uri.startswith('postgresql'):
        print('!! NOT on Postgres — start Docker Desktop first '
              '(silent sqlite fallback would skew numbers). Aborting.')
        return 1

    client = app.test_client()
    r = client.post('/api/auth/login', json={'email': EMAIL, 'password': PASSWORD})
    if r.status_code != 200:
        print(f'login failed: {r.status_code}')
        return 1
    token = r.get_json().get('token')
    H = {'Authorization': f'Bearer {token}'}
    print(f'logged in as {EMAIL}\n')

    bench('GET /instructor/dashboard', 'get', '/api/instructor/dashboard', H)
    bench('GET /instructor/dashboard/attention', 'get',
          '/api/instructor/dashboard/attention', H)
    bench('GET /instructor/sessions', 'get', '/api/instructor/sessions', H)
    bench('GET /instructor/section-subjects', 'get', '/api/instructor/section-subjects', H)
    bench('GET /instructor/experiments', 'get', '/api/instructor/experiments', H)

    # experiment + session ids for the parameterized endpoints
    from app.models.experiment import Experiment
    from app.models.session import LabSession
    with app.app_context():
        exp = (Experiment.query.filter_by(institution_id='inst-test-001')
               .first())
        sess = (LabSession.query.filter_by(institution_id='inst-test-001')
                .order_by(LabSession.scheduled_at.desc()).first())
        att_exp_id = exp.id if exp else None
        sess_id = sess.id if sess else None

    if att_exp_id:
        bench(f'GET /instructor/submissions/<exp>', 'get',
              f'/api/instructor/submissions/{att_exp_id}', H)
    if sess_id:
        bench('GET /instructor/sessions/<id>/dashboard', 'get',
              f'/api/instructor/sessions/{sess_id}/dashboard', H)
    bench('GET /instructor/announcements', 'get', '/api/instructor/announcements', H)
    bench('GET /instructor/reports', 'get', '/api/instructor/reports', H)
    bench('GET /instructor/vivas', 'get', '/api/instructor/vivas', H)
    bench('GET /instructor/catchups', 'get', '/api/instructor/catchups', H)
    print('\ndone')
    return 0


if __name__ == '__main__':
    sys.exit(main())
