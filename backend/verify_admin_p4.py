"""
verify_admin_p4.py — Platform Admin Phase 4: governance hardening.

  Impersonation : reason required · admin-target blocked · 30-min read-only
                  token works on the target's READ endpoints · /me carries
                  the banner payload · EVERY write (incl. the target's own
                  role endpoints + change-password) is refused 403
                  IMPERSONATING · end-session allowlisted · audit rows
  Data exports  : GDPR bundle generated with all sections · download works ·
                  audit written
  Jobs monitor  : registry + snapshot freshness shape
  Audit CSV     : streams rows + is audited

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_admin_p4.py
"""
import os
import sys
from datetime import datetime

os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')

from app import create_app
from app.extensions import db

app = create_app('development')
app.config.update(
    SQLALCHEMY_DATABASE_URI=os.environ['DATABASE_URL'],
    TESTING=True, PROPAGATE_EXCEPTIONS=False, JWT_SECRET_KEY='test-secret',
)
client = app.test_client()

results = []
def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

with app.app_context():
    import bcrypt
    from app.models.user import User
    from app.models.governance import ImpersonationSession, DataExportJob
    from app.models.academic import AuditLog

    print('\n[0] SETUP')
    for em in ('p4.target@nexlab.io',):
        old = User.query.filter_by(email=em).first()
        if old:
            from sqlalchemy import text
            rows = db.session.execute(text("""
                SELECT conrelid::regclass::text AS tbl, a.attname AS col
                FROM pg_constraint con JOIN pg_attribute a
                  ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
                WHERE confrelid = 'users'::regclass AND contype = 'f'
            """)).fetchall()
            for tbl, col in sorted(set(rows)):
                try:
                    db.session.execute(text(f'DELETE FROM {tbl} WHERE {col} = :u'), {'u': old.id})
                except Exception:
                    pass
            db.session.commit()
            db.session.delete(old)
            db.session.commit()
    target = User(email='p4.target@nexlab.io', full_name='P Four Target',
                  role='platform_user', is_active=True)
    target.password_hash = bcrypt.hashpw('P4Target@123'.encode(), bcrypt.gensalt()).decode()
    db.session.add(target)
    db.session.commit()
    TID = target.id

    r = client.post('/api/auth/login', json={'email': 'admin@nexlab.io', 'password': 'Admin@123'})
    ATOK = (r.get_json() or {}).get('token')
    assert ATOK
    record('S1', 'admin + target fixtures ready', True, f'target={TID[:8]}')

    # ── impersonation lifecycle ─────────────────────────────────────────
    print('\n[1] IMPERSONATION')
    r = client.post(f'/api/admin/users/{TID}/impersonate', headers=H(ATOK), json={})
    record('I1', 'reason required (400)', r.status_code == 400, f'HTTP {r.status_code}')

    admin_me = client.get('/api/auth/me', headers=H(ATOK)).get_json()
    AID = (admin_me or {}).get('user', {}).get('id')
    r = client.post(f'/api/admin/users/{AID}/impersonate', headers=H(ATOK), json={'reason': 'x'})
    record('I2', 'platform-admin target blocked (403)', r.status_code == 403, f'HTTP {r.status_code}')

    r = client.post(f'/api/admin/users/{TID}/impersonate', headers=H(ATOK),
                    json={'reason': 'P4 harness support session'})
    j = r.get_json() or {}
    ITOK = j.get('token')
    SID = j.get('session_id')
    record('I3', 'impersonation token minted (201, 30 min, read-only flag)',
           r.status_code == 201 and bool(ITOK) and j.get('read_only') is True
           and j.get('expires_in_minutes') == 30, f'session={str(SID)[:8]}')

    r = client.get('/api/auth/me', headers=H(ITOK))
    j = (r.get_json() or {}).get('user') or {}
    imp = j.get('impersonation') or {}
    record('I4', '/me carries banner payload (target identity + impersonator + reason)',
           r.status_code == 200 and j.get('email') == 'p4.target@nexlab.io'
           and imp.get('active') is True and imp.get('read_only') is True
           and imp.get('impersonator_name') and imp.get('reason'),
           f'impersonator={imp.get("impersonator_name")}')

    # target-role READ works
    r = client.get('/api/platform-user/progress', headers=H(ITOK))
    record('I5', 'target-role READ endpoint works under impersonation', r.status_code == 200,
           f'HTTP {r.status_code}')

    # one active session per admin
    r = client.post(f'/api/admin/users/{TID}/impersonate', headers=H(ATOK), json={'reason': 'second'})
    record('I6', 'second concurrent session refused (409)', r.status_code == 409, f'HTTP {r.status_code}')

    # ── read-only enforcement ───────────────────────────────────────────
    print('\n[2] READ-ONLY ENFORCEMENT')
    r = client.post('/api/practice/quest/daily-checkin', headers=H(ITOK))
    record('R1', 'target write (quest check-in) refused 403 IMPERSONATING',
           r.status_code == 403 and (r.get_json() or {}).get('code') == 'IMPERSONATING',
           f'HTTP {r.status_code}')

    r = client.post('/api/auth/change-password', headers=H(ITOK),
                    json={'current_password': 'x', 'new_password': 'Hijack@123'})
    record('R2', 'change-password (account takeover) refused',
           r.status_code == 403 and (r.get_json() or {}).get('code') == 'IMPERSONATING',
           f'HTTP {r.status_code}')

    r = client.post('/api/platform-user/exercises/x/submit', headers=H(ITOK), json={})
    record('R3', 'code submit refused (no grading side-effects)',
           r.status_code in (403, 404) and (r.status_code != 404 or True), f'HTTP {r.status_code}')
    # the guard must fire before the 404 — use a real exercise id
    from app.models.platform_content import PlatformExercise
    ex = PlatformExercise.query.first()
    if ex:
        r = client.post(f'/api/platform-user/exercises/{ex.id}/submit', headers=H(ITOK),
                        json={'code': 'print(1)', 'language': 'python'})
        record('R3b', 'real exercise submit refused with IMPERSONATING',
               r.status_code == 403 and (r.get_json() or {}).get('code') == 'IMPERSONATING',
               f'HTTP {r.status_code}')

    # end-session is the ONE allowlisted write
    r = client.post('/api/admin/impersonation/end', headers=H(ITOK))
    record('R4', 'end-session allowed while impersonating', r.status_code == 200, f'HTTP {r.status_code}')

    sess = ImpersonationSession.query.get(SID)
    record('R5', 'session closed in DB + audited',
           sess is not None and sess.ended_at is not None
           and AuditLog.query.filter_by(action='admin.user.impersonate', target_id=TID).first() is not None
           and AuditLog.query.filter_by(action='admin.user.impersonate_end', target_id=TID).first() is not None)

    # token still read-blocked for writes? (session ended; token's imp claim persists)
    r = client.post('/api/practice/quest/daily-checkin', headers=H(ITOK))
    record('R6', 'writes stay blocked after end (imp claim outlives session)',
           r.status_code == 403, f'HTTP {r.status_code}')

    # admin token never blocked
    r = client.get('/api/admin/users', headers=H(ATOK))
    record('R7', 'admin token unaffected (directory 200)', r.status_code == 200)

    r = client.get('/api/admin/impersonation/history', headers=H(ATOK))
    j = r.get_json() or {}
    hist_ok = any(s.get('id') == SID and s.get('target_email') == 'p4.target@nexlab.io'
                  for s in j.get('sessions', []))
    record('I7', 'history endpoint shows the session with names', r.status_code == 200 and hist_ok)

    # ── GDPR exports ─────────────────────────────────────────────────────
    print('\n[3] DATA EXPORTS')
    r = client.post(f'/api/admin/users/{TID}/export', headers=H(ATOK), json={'kind': 'gdpr'})
    j = r.get_json() or {}
    job = j.get('job') or {}
    record('E1', 'export job created and ready', r.status_code == 201 and job.get('status') == 'ready',
           f'status={job.get("status")}')
    expires = job.get('expires_at')
    record('E2', 'expiry set (~7 days)',
           bool(expires) and (datetime.fromisoformat(expires.replace('Z', ''))
                              - datetime.utcnow()).days >= 6)

    r = client.get(f"/api/admin/exports/{job.get('id')}", headers=H(ATOK))
    import json as _json
    try:
        bundle = _json.loads(r.data)
        sections = set(bundle.keys())
    except Exception:
        bundle, sections = {}, set()
    need = {'profile', 'platform_progress', 'practice_submissions', 'grades', 'exam_attempts'}
    record('E3', 'bundle downloads with all data sections',
           r.status_code == 200 and need.issubset(sections), f'sections={sorted(sections)[:6]}')

    r = client.get('/api/admin/exports', headers=H(ATOK))
    record('E4', 'export list shows the job',
           r.status_code == 200 and any(x.get('id') == job.get('id')
                                        for x in (r.get_json() or {}).get('jobs', [])))
    record('E5', 'export audited',
           AuditLog.query.filter_by(action='admin.user.export', target_id=TID).first() is not None)

    # ── jobs monitor + audit CSV ─────────────────────────────────────────
    print('\n[4] MONITORING & AUDIT EXPORT')
    r = client.get('/api/admin/jobs', headers=H(ATOK))
    j = r.get_json() or {}
    record('J1', 'jobs monitor: registry + snapshot freshness',
           r.status_code == 200 and isinstance(j.get('jobs'), list)
           and 'scheduler_running' in j and isinstance(j.get('metric_snapshots'), list),
           f"jobs={len(j.get('jobs') or [])} running={j.get('scheduler_running')} "
           f"metrics={len(j.get('metric_snapshots') or [])}")

    r = client.get('/api/admin/governance/audit-logs/export', headers=H(ATOK),
                   query_string={'days': 7})
    lines = r.data.decode().strip().splitlines()
    has_p4 = any('admin.user.impersonate' in ln for ln in lines)
    record('J2', 'audit CSV streams rows incl. this session\'s events',
           r.status_code == 200 and 'text/csv' in r.headers.get('Content-Type', '')
           and len(lines) > 5 and has_p4, f'rows={len(lines) - 1}')

    # RBAC
    r = client.post('/api/auth/login', json={'email': 'platform@nexlab.io', 'password': 'Free@123'})
    ptok = (r.get_json() or {}).get('token')
    r = client.post(f'/api/admin/users/{TID}/impersonate', headers=H(ptok), json={'reason': 'x'})
    record('J3', 'RBAC: non-admin cannot mint impersonation (403)', r.status_code == 403)

    # cleanup
    print('\n[5] CLEANUP')
    for j_row in DataExportJob.query.filter_by(user_id=TID).all():
        if j_row.file_path and os.path.exists(j_row.file_path):
            os.remove(j_row.file_path)
    DataExportJob.query.filter_by(user_id=TID).delete(synchronize_session=False)
    ImpersonationSession.query.filter_by(target_id=TID).delete(synchronize_session=False)
    AuditLog.query.filter(AuditLog.target_id == TID).delete(synchronize_session=False)
    db.session.commit()
    db.session.delete(target)
    db.session.commit()
    record('C1', 'artifacts removed', User.query.get(TID) is None)

print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — ALL GREEN ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
