# Manual End-to-End Test Report

**Date:** 2026-10-22
**Method:** Wiped the database, then built the entire hierarchy by hand through the real HTTP API (via the Next.js proxy — the same path the browser takes). No seed scripts, no pre-made accounts.

---

## Result: the core product works

**34/34 API steps passed · 51/51 pages rendered 200**

---

## Logins (all created during this test)

| Role | Email | Password |
|---|---|---|
| Platform super admin | `superadmin@nexlab.io` | `SuperAdmin@2026` |
| Institution admin | `admin@skit.edu.in` | `SkitAdmin@2026` |
| Instructor | `anitha.rao@skit.edu.in` | `Instructor@2026` |
| Student | `rahul.sharma@skit.edu.in` | `Student@2026` |

Temp passwords used along the way (already replaced): `Welcome@2026` → institution admin, `TempInst@2026` → instructor, `TempStud@2026` → student.

---

## What was built, step by step

| # | Action | Endpoint | Result |
|---|---|---|---|
| 1 | Platform admin login | `POST /api/auth/login` | 200 |
| 2 | Onboard institution "Sri Krishna Institute of Technology" (code `SKIT`, plan `pro`) + its first admin | `POST /api/admin/institutions` | 201 |
| 3 | Institution admin first login — correctly flagged `must_change_password: true` | `POST /api/auth/login` | 200 |
| 4 | Replace the temp password | `POST /api/auth/change-password` | 200 |
| 5 | Academic year `2026-2027` | `POST /institution/academic-years` | 201 |
| 6 | Department `Computer Science and Engineering` (`CSE`) | `POST /institution/departments` | 201 |
| 7 | Batch `CSE 2026 Batch` with 2 sections auto-created | `POST /institution/batches` | 201 |
| 8 | Subject `Data Structures and Algorithms` (`CS301`) | `POST /institution/subjects` | 201 |
| 9 | Instructor `Prof. Anitha Rao` | `POST /institution/users` | 201 |
| 10 | Student `Rahul Sharma`, enrolled into section A | `POST /institution/users` | 201 |
| 11 | Assign subject + lead instructor to section A | `POST /institution/section-subjects` | 201 |
| 12 | Instructor login → forced password change → re-login | | 200 |
| 13 | Student login → forced password change → re-login | | 200 |
| 14 | Instructor creates experiment "Binary Search", adds a theory content module, publishes it | `POST /instructor/experiments`, `POST .../content`, `PATCH ...` | 201/201/200 |
| 15 | Student now sees the subject, the published experiment, and the pre-lab content | `GET /student/subjects`, `/student/experiments/<id>`, `/student/prelab/<id>` | 200 |

Dashboard numbers correctly reflect reality: **1 student, 1 instructor, 1 subject, 1 batch**.

Draft→publish behaves correctly: before publishing, the student saw **0** experiments; after `is_published: true`, the student saw **1** with status `not_started`. That staging is intentional.

---

## Pages verified (51/51 = HTTP 200)

- **Platform admin (13):** dashboard, institutions, academic/departments, academic/academic-years, users, users/students, users/instructors, analytics, assignments, reports, settings, security, monitoring/server-health
- **Institution admin (12):** dashboard, academic, users, analytics, announcements, audit-log, billing, sessions, ai-usage, settings, profile, security
- **Instructor (13):** dashboard, experiments, experiments/new, students, analytics, content, exams, sessions, grading, reports, management, live-lab, settings
- **Student (13):** dashboard, subjects, courses, analytics, exams, practice, rankings, submissions, pre-lab, compiler, live-lab, announcements, profile

Role guards work — `/admin/*` is platform-admin only, `/institution/*` is institution-admin only, and each role lands on its own dashboard after login.

---

## Issues found

### 1. `next build` fails — Next 15 async params (FIXED)
`app/instructor/exams/[examId]/page.tsx` typed `params` synchronously. Next 15 requires a Promise:
```
Type error: Type '{ params: { examId: string } }' does not satisfy the constraint 'PageProps'
```
This breaks every production build (and therefore the Docker image). Fixed with `async` + `await params`.

### 2. No API can create an `EnvironmentProfile` (OPEN — backend gap)
`has_environment` is one of the five onboarding criteria, but there is **no POST endpoint** for environment profiles anywhere:
- `GET /api/institution/environments` (read only)
- `GET /api/admin/environments/pending` (read only)
- `POST /api/admin/environments/<id>/approve|reject`

Only the seed scripts insert rows. So a fresh institution **can never satisfy `has_environment` through the UI**.

### 3. Onboarding "complete" contradicts itself (OPEN — backend bug)
`POST /api/platform/institutions/<id>/onboarding/complete` sets `onboarding_status = 'active'`, but the GET checklist recomputes `complete = all(checklist.values())`. Because `has_environment` is still false, you get:

```
status   = active
complete = false
```

The two fields disagree, so the UI shows an active institution as still incomplete. Combined with issue 2 there's no way out of it except touching the DB.

### 4. Docker code execution is disabled (EXPECTED — no Docker here)
`DOCKER_RUNNER_ENABLED=false`. `/api/run` and `/api/playground` return 503. Not a bug, just a hard dependency on Docker that this environment doesn't have.

### 5. Sandbox-specific: `output: standalone` vs `next start`
`next.config.ts` produced a standalone bundle whenever `NODE_ENV=production`, which `next start` explicitly doesn't support (all pages 500'd). Added a `NEXT_LOCAL_START=1` opt-out so local prod builds work. **Docker behaviour is unchanged** — standalone is still the default in production.

### 6. Sandbox-specific: dev server memory
`next dev` gets killed / auto-restarts on this 1.9 GB box when compiling the big analytics routes. Solved by using a production build (~10 ms responses, ~500 MB). Not an issue on a normal machine.

### 7. Minor: login rate limit
`POST /api/auth/login` is limited to **10/minute**. Rapid scripted testing hits 429s. Fine for humans, worth knowing for automation.

---

## Two smaller observations (not bugs)

- `POST /institution/users` with `section_id` **does** enroll the student (`section_students` row confirmed), but the returned `user.to_dict()` has no `section_id` field, so the create response looks like `section_id: null`. Cosmetic API-shape issue.
- `seed_help_demo.py` from the original seed set opens a hardcoded **sqlite3** connection and fails on Postgres. Irrelevant now that seeding is opt-in.

---

## How to re-run any of this

```bash
./setup.sh                 # fresh bootstrap, schema only (no demo data)
python3 backend/bootstrap_superadmin.py    # recreate the platform super-admin
./start-all.sh             # postgres + backend + frontend
python3 walkthrough.py     # the full manual hierarchy from scratch
python3 page_sweep.py      # render every page for every role
```

`./setup.sh --seed` still loads the original demo data if you ever want it back.
