# Backend Progress Update — Session 3 (2026-08-03/04)
> **Commit Range:** `d692edf` → `19b6c50`  
> **Branches:** All pushed to `main` on GitHub (mujju-212/NexLab)  
> **Test Results:** 48 + 51 = **99 tests, all passing**

---

## What Was Done This Session

This session extended the backend with two major feature sets:

1. **Platform Super Admin** — 5 new feature groups (17 new routes)
2. **Institution Admin** — 6 new feature groups (14 new routes)
3. **Supporting infra** — new models, migration, blueprints

---

## Part 1 — Platform Super Admin Features

### New Blueprint: `backend/app/admin/platform.py`
Registered at `/api/platform`. All routes require `platform_admin` JWT role.

---

### Feature Group 1: Billing & Plan Management

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/platform/institutions/<id>/billing` | GET | Full billing snapshot — plan, Groq limit, student count vs limit, headroom |
| `/api/platform/institutions/<id>/billing/plan` | PATCH | Upgrade/downgrade institution plan (free → pro → enterprise) |
| `/api/platform/institutions/<id>/billing/groq-limit` | PATCH | Override institution's daily Groq limit (null = reset to plan default) |
| `/api/platform/institutions/<id>/billing/notes` | PATCH | Update billing admin notes for an institution |

**Plan limits hardcoded:**
```python
PLAN_LIMITS = {
    'free':       {'groq': 50,  'students': 100},
    'pro':        {'groq': 200, 'students': 500},
    'enterprise': {'groq': 500, 'students': 99999},
}
```

**New DB columns added to `institutions` table:**
- `plan_updated_at` — when plan was last changed
- `groq_limit_override` — custom limit (NULL = use plan default)
- `billing_notes` — admin free-text notes
- `billing_email` — separate billing contact email

---

### Feature Group 2: Global Audit Log

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/platform/audit-logs` | GET | All audit logs across ALL institutions — paginated, filterable |
| `/api/platform/audit-logs/summary` | GET | Action frequency breakdown — last 30 days |

**Filters supported on `/audit-logs`:**
- `?institution_id=` — scope to one institution
- `?action=force_logout` — filter by action type
- `?actor_id=` — filter by who performed the action
- `?days=7` — how many days back (default 7)
- `?page=1&per_page=50` — pagination
- Each log enriched with `actor_name` (joined from Users table)

**Why this was needed:** The per-institution audit log in `institution/routes.py` only shows logs for one institution. The platform admin needs to see across all institutions (compliance, security, forensics).

---

### Feature Group 3: Institution Onboarding Workflow

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/platform/institutions/pending` | GET | Institutions with `onboarding_status='pending'` |
| `/api/platform/institutions/<id>/onboarding` | GET | Live checklist — auto-queries DB to check each criterion |
| `/api/platform/institutions/<id>/onboarding/complete` | POST | Mark institution as fully onboarded → sets `status='active'` |
| `/api/platform/institutions/<id>/onboarding/reset` | POST | Reset institution back to pending |

**Onboarding checklist (auto-detected from DB):**
```json
{
  "institution_created": true,
  "admin_account_exists": true/false,
  "has_users": true/false,
  "has_experiments": true/false,
  "has_environment": true/false
}
```

**New DB columns added to `institutions` table:**
- `onboarding_status` — `pending | active | suspended`
- `onboarding_completed_at` — timestamp when marked complete
- `has_users`, `has_experiments`, `has_environment` — cached checklist flags

---

### Feature Group 4: Global Analytics

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/platform/analytics/overview` | GET | Platform KPIs — total users, new users, sessions, active institutions |
| `/api/platform/analytics/groq-trend` | GET | Groq usage per day — last N days, all institutions |
| `/api/platform/analytics/sessions-trend` | GET | Daily session count — last N days |
| `/api/platform/analytics/peak-usage` | GET | Hour-of-day distribution (for infra capacity planning) |
| `/api/platform/analytics/cross-institution` | GET | Side-by-side institution comparison (users, sessions, sessions-per-user) |

All endpoints support `?days=N` filter. Graceful degradation if `groq_usage` table not yet created.

---

### Feature Group 5: Platform Configuration

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/platform/config` | GET | All platform config keys + values |
| `/api/platform/config` | PATCH | Update one or more config keys (body: `{"key": "value"}`) |
| `/api/platform/config/maintenance` | POST | Enable/disable maintenance mode + SocketIO broadcast |
| `/api/platform/config/features` | GET | All boolean feature flags |
| `/api/platform/config/features/<flag>` | PATCH | Toggle a feature flag on/off |

**New Model: `PlatformConfig` (in `institution.py`)**
```
Table: platform_config
  key          VARCHAR(100) PRIMARY KEY
  value        TEXT NOT NULL
  description  TEXT
  updated_at   DATETIME
  updated_by   FK → users.id
```

**Default config values seeded on app startup:**
| Key | Default | Meaning |
|-----|---------|---------|
| `groq_daily_limit` | 200 | Per-institution Groq calls/day |
| `maintenance_mode` | false | Platform-wide maintenance |
| `maintenance_message` | (default text) | Banner shown during maintenance |
| `ai_hints_enabled` | true | Enable AI hint feature globally |
| `code_execution_enabled` | true | Enable Judge0 globally |
| `max_students_free` | 100 | Student cap for free plan |
| `max_students_pro` | 500 | Student cap for pro plan |
| `max_students_enterprise` | 99999 | Student cap for enterprise |
| `allow_self_registration` | false | Institutions can self-register |

---

## Part 2 — Institution Admin Extended Features

### New Blueprint: `backend/app/institution/extended.py`
Registered at `/api/institution` (same prefix as existing `institution/routes.py`). All routes require `institution_admin` JWT role.

---

### Feature 1: Reset User Password

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/institution/users/<id>/reset-password` | POST | Reset any user's password within the institution |

**How it works:**
1. Verifies user belongs to admin's institution (security check)
2. Validates password length (minimum 6 characters)
3. Bcrypt hashes new password
4. Sets `user.force_logout_at = now()` — invalidates all existing JWT tokens
5. Returns confirmation with `force_logout_applied: true`

**Why `force_logout_at`:** If admin resets password (suspicious activity), old sessions must be invalidated immediately. The JWT middleware checks this timestamp against token issue time.

---

### Feature 2: Experiment Usage Report

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/institution/analytics/experiment-usage` | GET | Which experiments are most used — session counts per experiment |

**Query params:** `?days=30`  
**Returns:** List of experiments with `session_count`, `experiment_name` (enriched from experiments table), sorted by usage descending.

---

### Feature 3: CSV Export

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/institution/export/student-progress` | GET | Download CSV — all students with roll number, name, email, active status |
| `/api/institution/export/users` | GET | Download CSV — all users (filter: `?role=student`) |

**Response headers set:**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="student_progress_<id>.csv"
```

Students ordered alphabetically. Export respects institution boundary — can only see own institution's data.

---

### Feature 4: Institution Settings

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/institution/settings` | GET | Get own institution's settings |
| `/api/institution/settings` | PATCH | Update allowed settings |

**Institution admin CAN change:** `logo_url`, `address`, `contact_email`, `billing_email`, `email_domain`  
**Institution admin CANNOT change:** `name`, `code`, `plan` — these are platform-admin-only

**Security:** Editable fields whitelist enforced server-side. Even if `name` or `plan` is sent in the PATCH body, it's silently ignored.

---

### Feature 5: Session Management

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/institution/sessions/live` | GET | All currently active lab sessions for institution |
| `/api/institution/sessions/history` | GET | Paginated session history with filters |
| `/api/institution/sessions/<id>/terminate` | POST | Force-terminate an active session |

**Live sessions enriched with:**
- `duration_minutes` — how long session has been running
- `student_name` — (where available via join)

**Session history filters:** `?status=ended&days=30&page=1&per_page=50`

**Terminate flow:**
1. Validates session belongs to admin's institution
2. Rejects if session is not `active` (returns 400 with current status)
3. Sets `status='terminated'`, `ended_at=now()`
4. Emits `session_terminated` SocketIO event to the student's session room

---

### Feature 6: Groq Budget Tracking

| Endpoint | Method | What it does |
|----------|--------|-------------|
| `/api/institution/groq-budget` | GET | Today's Groq usage vs limit + 7-day trend |

**Response:**
```json
{
  "used": 47,
  "limit": 200,
  "remaining": 153,
  "exhausted": false,
  "limit_source": "plan_default",
  "plan": "pro",
  "trend_7d": [
    {"date": "2026-07-28", "count": 34},
    {"date": "2026-07-29", "count": 61},
    ...
  ]
}
```

**Limit resolution priority:** institution override → plan default → global config  
**Graceful degradation:** if `groq_usage` table not yet populated, returns `used=0` without crashing.

---

## Migration Written

**File:** `backend/migrations/versions/b2c3d4e5f6a7_super_admin_billing_onboarding_config.py`  
**Revises:** `a1b2c3d4e5f6` (previous audit log migration)

**Changes applied:**
```sql
-- institutions table: 9 new columns
ALTER TABLE institutions ADD COLUMN plan_updated_at DATETIME;
ALTER TABLE institutions ADD COLUMN groq_limit_override INTEGER;
ALTER TABLE institutions ADD COLUMN billing_notes TEXT;
ALTER TABLE institutions ADD COLUMN billing_email TEXT;
ALTER TABLE institutions ADD COLUMN onboarding_status VARCHAR(20) DEFAULT 'active';
ALTER TABLE institutions ADD COLUMN onboarding_completed_at DATETIME;
ALTER TABLE institutions ADD COLUMN has_users BOOLEAN DEFAULT false;
ALTER TABLE institutions ADD COLUMN has_experiments BOOLEAN DEFAULT false;
ALTER TABLE institutions ADD COLUMN has_environment BOOLEAN DEFAULT false;

-- New table
CREATE TABLE platform_config (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_at  DATETIME,
    updated_by  VARCHAR(36) REFERENCES users(id)
);

-- 9 default config rows seeded
INSERT INTO platform_config ...
```

Migration applied: `flask db upgrade` run successfully on local Docker PostgreSQL.

---

## Tests Written & Results

### Test File 1: `backend/test_platform_admin.py`
**What it tests:** All 5 platform super admin feature groups  
**How to run:** `python test_platform_admin.py` (Docker must be running)  
**Result: 48/48 PASSED ✅**

| Group | Tests | All Pass |
|-------|-------|----------|
| Login as platform_admin | 1 | ✅ |
| Billing & Plan Management | 9 | ✅ |
| Global Audit Log | 7 | ✅ |
| Institution Onboarding | 8 | ✅ |
| Global Analytics | 7 | ✅ |
| Platform Configuration | 11 | ✅ (+ maintenance mode + feature flags) |

**Notable test cases:**
- Reject invalid plan (400 for unknown plan name)
- Filter audit by institution, action, actor
- Onboarding checklist live-checks DB state
- Status changes persist across requests
- Platform config PATCH updates multiple keys atomically
- Feature flag toggle returns correct boolean

---

### Test File 2: `backend/test_institution_admin.py`
**What it tests:** All 6 institution admin extended features  
**How to run:** `python test_institution_admin.py` (Docker must be running)  
**Result: 51/51 PASSED ✅**

| Group | Tests | All Pass |
|-------|-------|----------|
| Login as institution_admin | 1 | ✅ |
| Reset User Password | 6 | ✅ |
| Experiment Usage Report | 5 | ✅ |
| CSV Export | 5 | ✅ |
| Institution Settings | 8 | ✅ |
| Session Management | 9 | ✅ |
| Groq Budget Tracking | 8 | ✅ |

**Notable test cases:**
- Password reset also invalidates existing sessions (`force_logout_at` set)
- Student can log in immediately with new password
- Short password (<6 chars) rejected with 400
- Cannot reset password of user from different institution (404)
- CSV export returns correct `Content-Type: text/csv`
- Institution settings PATCH ignores `name` and `plan` fields silently (read-only protection)
- Re-terminating an already-terminated session returns 400
- Groq remaining = limit - used (math verified)

---

### How Tests Work (Technical)

Tests use Flask's built-in `test_client()` — no external server needed, just Docker PostgreSQL.

**Setup pattern:**
1. Force `DATABASE_URL` env var before any import
2. `create_app('development')` + override `SQLALCHEMY_DATABASE_URI` directly
3. `db.create_all()` to ensure tables exist
4. Create test fixtures (institution, admin user, student, session)
5. Login via `/api/auth/login` → capture `token` from response
6. Make HTTP calls through `test_client()` with JWT header
7. Assert status codes + response body fields

**Key fixes encountered:**
- `localhost` resolves to IPv6 `::1` on Windows; Docker only binds IPv4 → fixed by using `127.0.0.1:5433`
- Login returns `token` key not `access_token` — updated test to match
- `LabSession` model has no `student_id`/`score` columns — routes/tests adjusted
- `groq_usage` table not yet seeded → wrapped in `try/except` + `db.session.rollback()`
- Section `name` is `VARCHAR(10)` → kept test names short

---

## Files Changed This Session

| File | Type | What Changed |
|------|------|-------------|
| `backend/app/admin/platform.py` | **NEW** | Platform super admin blueprint — 17 routes |
| `backend/app/institution/extended.py` | **NEW** | Institution admin extensions — 14 routes |
| `backend/app/models/institution.py` | Modified | +9 billing/onboarding columns + PlatformConfig model |
| `backend/app/__init__.py` | Modified | Registered `platform_bp` + `institution_ext_bp`, seeds PlatformConfig on startup |
| `backend/migrations/versions/b2c3d4e5f6a7_...py` | **NEW** | Migration for all new DB columns + platform_config table |
| `backend/test_platform_admin.py` | **NEW** | 48-test suite for platform admin |
| `backend/test_institution_admin.py` | **NEW** | 51-test suite for institution admin |

---

## Git Commits This Session

| Hash | Message |
|------|---------|
| `d692edf` | `feat: institution admin — announcements, force logout, audit log, per-institution analytics + AuditLog model, DB migration` |
| `15903a3` | `chore: remove frontend from repo, update .gitignore` |
| `19b6c50` | `feat: super admin (billing, audit log, onboarding, analytics, config) + institution admin extensions — 48+51 tests all passing` |

All pushed to `https://github.com/mujju-212/NexLab` on `main`.

---

## Complete Feature Inventory — Both Admin Roles

### Platform Super Admin (`platform_admin` role) — ALL DONE

| # | Feature | Endpoint | Status |
|---|---------|----------|--------|
| 1 | List all institutions | `GET /api/admin/institutions` | ✅ |
| 2 | Create institution + auto-create admin | `POST /api/admin/institutions` | ✅ |
| 3 | Update institution (plan, name) | `PATCH /api/admin/institutions/<id>` | ✅ |
| 4 | Get institution detail + stats | `GET /api/admin/institutions/<id>` | ✅ |
| 5 | Suspend institution | `POST /api/admin/institutions/<id>/suspend` | ✅ |
| 6 | Re-activate institution | `POST /api/admin/institutions/<id>/activate` | ✅ |
| 7 | Reset institution admin password | `POST /api/admin/institutions/<id>/reset-admin-password` | ✅ |
| 8 | Platform dashboard (counts) | `GET /api/admin/dashboard` | ✅ |
| 9 | System health check | `GET /api/admin/health` | ✅ |
| 10 | Groq usage per institution | `GET /api/admin/groq-usage` | ✅ |
| 11 | Search users across all institutions | `GET /api/admin/users/search` | ✅ |
| 12 | List pending Docker env requests | `GET /api/admin/environments/pending` | ✅ |
| 13 | Approve Docker environment | `POST /api/admin/environments/<id>/approve` | ✅ |
| 14 | Reject Docker environment | `POST /api/admin/environments/<id>/reject` | ✅ |
| 15 | Broadcast platform announcement | `POST /api/admin/announcements` | ✅ |
| 16 | Platform stats snapshot | `GET /api/admin/stats/snapshot` | ✅ |
| 17 | **Billing info** | `GET /api/platform/institutions/<id>/billing` | ✅ NEW |
| 18 | **Upgrade/downgrade plan** | `PATCH /api/platform/institutions/<id>/billing/plan` | ✅ NEW |
| 19 | **Set Groq limit override** | `PATCH /api/platform/institutions/<id>/billing/groq-limit` | ✅ NEW |
| 20 | **Global audit log** | `GET /api/platform/audit-logs` | ✅ NEW |
| 21 | **Audit log summary** | `GET /api/platform/audit-logs/summary` | ✅ NEW |
| 22 | **List pending institutions** | `GET /api/platform/institutions/pending` | ✅ NEW |
| 23 | **Onboarding checklist** | `GET /api/platform/institutions/<id>/onboarding` | ✅ NEW |
| 24 | **Mark onboarding complete** | `POST /api/platform/institutions/<id>/onboarding/complete` | ✅ NEW |
| 25 | **Platform analytics overview** | `GET /api/platform/analytics/overview` | ✅ NEW |
| 26 | **Groq usage trend** | `GET /api/platform/analytics/groq-trend` | ✅ NEW |
| 27 | **Sessions trend** | `GET /api/platform/analytics/sessions-trend` | ✅ NEW |
| 28 | **Peak usage hours** | `GET /api/platform/analytics/peak-usage` | ✅ NEW |
| 29 | **Cross-institution comparison** | `GET /api/platform/analytics/cross-institution` | ✅ NEW |
| 30 | **Get platform config** | `GET /api/platform/config` | ✅ NEW |
| 31 | **Update platform config** | `PATCH /api/platform/config` | ✅ NEW |
| 32 | **Maintenance mode** | `POST /api/platform/config/maintenance` | ✅ NEW |
| 33 | **Feature flags** | `GET/PATCH /api/platform/config/features` | ✅ NEW |

### Institution Admin (`institution_admin` role) — ALL DONE

| # | Feature | Endpoint | Status |
|---|---------|----------|--------|
| 1 | List users in institution | `GET /api/institution/users` | ✅ (existing) |
| 2 | Create user | `POST /api/institution/users` | ✅ (existing) |
| 3 | Bulk CSV user upload | `POST /api/institution/users/bulk-upload` | ✅ (existing) |
| 4 | Toggle user active/inactive | `PATCH /api/institution/users/<id>/toggle-active` | ✅ (existing) |
| 5 | Manage academic years/batches/sections | Various | ✅ (existing) |
| 6 | Manage subjects | Various | ✅ (existing) |
| 7 | Request custom Docker environment | `POST /api/institution/environments/request` | ✅ (existing) |
| 8 | Institution dashboard | `GET /api/institution/dashboard` | ✅ (existing) |
| 9 | Send announcements | `POST /api/institution/announcements` | ✅ (existing) |
| 10 | Force logout any user | `POST /api/institution/users/<id>/force-logout` | ✅ (existing) |
| 11 | Per-institution audit log | `GET /api/institution/audit-log` | ✅ (existing) |
| 12 | Analytics — overview | `GET /api/institution/analytics/overview` | ✅ (existing) |
| 13 | Analytics — students at risk | `GET /api/institution/analytics/students-at-risk` | ✅ (existing) |
| 14 | Analytics — section comparison | `GET /api/institution/analytics/section-comparison` | ✅ (existing) |
| 15 | **Reset user password** | `POST /api/institution/users/<id>/reset-password` | ✅ NEW |
| 16 | **Experiment usage report** | `GET /api/institution/analytics/experiment-usage` | ✅ NEW |
| 17 | **Export student progress CSV** | `GET /api/institution/export/student-progress` | ✅ NEW |
| 18 | **Export users CSV** | `GET /api/institution/export/users` | ✅ NEW |
| 19 | **Get institution settings** | `GET /api/institution/settings` | ✅ NEW |
| 20 | **Update institution settings** | `PATCH /api/institution/settings` | ✅ NEW |
| 21 | **View live sessions** | `GET /api/institution/sessions/live` | ✅ NEW |
| 22 | **Session history** | `GET /api/institution/sessions/history` | ✅ NEW |
| 23 | **Terminate session** | `POST /api/institution/sessions/<id>/terminate` | ✅ NEW |
| 24 | **Groq budget tracker** | `GET /api/institution/groq-budget` | ✅ NEW |

---

## How to Run Tests

```bash
# Start Docker PostgreSQL first
docker start vlab_postgres

# Run platform super admin tests (48 tests)
cd backend
.\venv\Scripts\Activate.ps1
python test_platform_admin.py

# Run institution admin tests (51 tests)
python test_institution_admin.py
```

Expected output:
```
Results: 48/48 passed
All tests passed!

Results: 51/51 passed
All institution admin tests passed!
```

---

## Current Backend Status

| Component | Status |
|-----------|--------|
| Auth (JWT login, register, refresh) | ✅ Done |
| Platform Super Admin — all 33 features | ✅ Done |
| Institution Admin — all 24 features | ✅ Done |
| Instructor module | ✅ Done (prev sessions) |
| Student module | ✅ Done (prev sessions) |
| ML Engine (5 models) | ✅ Done + tested |
| AI (Groq hints + viva) | ✅ Done |
| SocketIO (proctoring + session events) | ✅ Done |
| Judge0 code execution | ✅ Done |
| Docker (PostgreSQL + Judge0) | ✅ Running |
| DB Migrations | ✅ Up to date (`b2c3d4e5f6a7`) |
| Git | ✅ Clean, pushed to main |

---

## Next Steps

1. **Instructor module testing** — write `test_instructor.py` similar to the admin tests
2. **Student module testing** — write `test_student.py`
3. **Integration test** — end-to-end flow: create institution → add users → run session → get analytics
4. **JWT middleware check** — verify `force_logout_at` is being checked on every protected route
5. **`flask db upgrade`** — run on any fresh environment to apply all 3 migrations
