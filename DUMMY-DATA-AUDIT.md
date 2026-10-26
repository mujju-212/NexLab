# Dummy / Fake Data Audit

**Date:** 2026-10-22
**Method:** Logged into the real UI in a headless Chromium (typed into the actual login form, clicked "Sign In"), walked every instructor page plus the institution and student analytics/dashboard/sessions pages, screenshotted each, captured every API call, then traced each fake value back to its source line in `frontend/` or `backend/`.

**Database state during the audit:** 1 institution, 1 department, 1 batch, 2 sections, 1 subject, 1 experiment (published), 2 students-worth of content, 1 instructor, 1 student, **0 sessions, 0 submissions, 0 grades, 0 feedback**.

So anything showing a non-zero number that isn't 1 is suspect.

Screenshots are in `screenshots/` — `07_analytics.png`, `inst_sessions.png`, `03_subjects.png` are the damning ones.

---

## 🔴 CRITICAL — fake data you can see on screen

### 1. Institution → Sessions → "Recent Activity" is invented by the BACKEND
Screenshot `inst_sessions.png` shows students joining sessions that never happened.

```
12:03 PM  Student Joined       DSA Lab 1               Rahul Sharma (NDU2024012) joined the session
12:02 PM  Student Left         DBMS Lab 3              Aditi Mehta (GW26-CS235) left the session
12:01 PM  Instructor Joined    Computer Networks Lab   Prof. Sneha Patil joined the session
11:59 AM  Student Joined       DSA Lab 1               Karan Gupta (NDU2024018) joined the session
```

**Source:** `backend/app/institution/extended.py:752`

```python
# Fallback to realistic live recent activity if none in DB yet
if not recent_activity:
    now = datetime.utcnow()
    recent_activity = [
        {..., 'details': 'Rahul Sharma (NDU2024012) joined the session'},
        {..., 'details': 'Aditi Mehta (GW26-CS235) left the session'},
        {..., 'details': 'Prof. Sneha Patil joined the session'},
        {..., 'details': 'Karan Gupta (NDU2024018) joined the session'},
    ]
```

Three of those people don't exist. The fourth, "Rahul Sharma", collides with the real student I created, which makes it look even more legitimate. The frontend *does* have an empty state (`"No recent live activity logged yet."` at `page.tsx:2737`) — the backend just never lets it show.

### 2. Institution → Sessions → "4.5 hrs Total Live Duration"
`frontend/app/institution/sessions/page.tsx:2217`
```tsx
{liveSummary?.total_duration_today_hours != null ? `...` : '4.5 hrs'}
```
Backed by `extended.py:708`: `sum(...) or 270` minutes. Zero sessions → claims 4.5 hrs.

### 3. Instructor → Experiments → "4.7 Average Rating" ★★★★★ 4.7/5
Screenshot `03_subjects.png`. There is no rating API at all — it is pure literal:
- `app/instructor/experiments/page.tsx:445` → `avgRating: 4.7,`
- `page.tsx:541` → `<span className={styles.metricVal}>4.7</span>`
- `page.tsx:545` → `<span>4.7/5</span>`

### 4. Instructor → Experiments → "120 Enrolled Students"
`selectedSubject?.student_count || 120` in **three** places: `page.tsx:439`, `:1275`, `:1338`. The real count is 1. `student_count` isn't even returned by `/instructor/experiments`, so it always falls back to 120.

### 5. Instructor → Analytics → Overview → fake charts + KPIs
Screenshot `07_analytics.png`. `app/instructor/analytics/OverviewTab.tsx`:
| Line | What | Fake value |
|---|---|---|
| 196-200 | `kpis` fallback | `active_students 24 of 28`, `class_avg_grade 68%`, `focus_engagement 78%`, `needs_attention 2 of 5` |
| 258-263 | `riskDistBands` | Critical 1 / High 3 / Watch 6 / On Track 18 (**28 students**) |
| 269, 274 | donut centre | `total_students \|\| 28` |
| 282-288 | `riskTrendData` | 5 fake points `Oct 1 … Oct 30` |
| 291-296 | `qualityBreakdown` | A 35 / B 44 / C 31 / D 16 |
| 297 | `totalSubmissions` | **`\|\| 126`** ← the "126 Submissions" on screen |

### 6. Instructor → Analytics → header shows "36 Students" and "2024-2025"
`app/instructor/analytics/page.tsx`:
- `:123` → `useState<string>('2024-2025')`
- `:339-341` → `sectionACount … || 24`, `sectionBCount … || 12`, `totalSectionCount … || 36`
- `:811` → `<option value="2024-2025">2024–2025 (CSE 2nd Year)</option>`
- `:880` → `All My Sections (36 Students)`
- `:985` → `` `All Sections (36 Students)` ``

Visible in the screenshot as "All My Sections (36 Stu…" and "13 Students" chips. Real values: 1 section, 1 student, academic year 2026-2027.

### 7. Student → Analytics → Academic → 5 subjects that don't exist
Screenshot `stud_analytics.png`: the trend legend lists **Overall, DSA, DBMS, CN, OS, SE**.

**Backend root cause** — `app/student_analytics/academic_dashboard_builder.py:272`:
```python
trend_subjects = []
for s_code in ['DSA', 'DBMS', 'CN', 'OS', 'SE']:   # ← hardcoded 5 subjects, always
```
This runs even when the student is enrolled in a single subject (CS301), and it runs for **every** student regardless of institution.

**Frontend duplicate** — `components/student-analytics/AcademicTab.tsx:133-143` has the same five hardcoded series (with invented grade curves 58→85 etc.) as the fallback.

### 8. Student → Analytics → fake grades / concepts / badges
Same file, `AcademicTab.tsx`, all shown whenever the API legitimately returns `[]` (which it does — `concept_mastery: []`, `recent_grades: []`):
- `:145-151` `subjectPerformance` → DSA 82%, DBMS 78%, CN 72%, OS 76%, SE 69%
- `:153-162` `conceptMastery` → "Arrays & Lists 92", "SQL & Relational Algebra 78", …
- `:184-190` `recentGrades` → "Exp 8: Trees 87%", "Exp 7: SQL Queries 78%", …
- `:168-175` `attendanceDonut` → **92% present, 22 present / 1 absent**
- `:177-183` `riskGuidance` → "Good progress in DSA", "Improve Software Engineering"
- `PlatformTab.tsx:178-183` → 4 fake badges ("100 Solves", "7-Day Streak", …)
- `PlatformTab.tsx:430` → `const totalSolved = difficultyDist.total || 142;`

Note the API returns `concept_mastery: []` and `recent_grades: []`, and the UI **still** paints 5 fake rows in each panel.

---

## 🟠 HIGH — hardcoded server-side, or literal series in the frontend

### 9. Institution → Dashboard → "System Status" is hardcoded all-green (BACKEND)
`backend/app/institution/routes.py:1798`
```python
system_status = [
    {"name": "Platform Services", "status": "Operational", "healthy": True},
    {"name": "Database",         "status": "Operational", "healthy": True},
    {"name": "Live Session Servers", "status": "Operational", "healthy": True},
    {"name": "Code Execution",   "status": "Operational", "healthy": True},   # ← Docker is OFF
    {"name": "AI Services",      "status": "Operational", "healthy": True},
]
```
Nothing is probed. **"Code Execution: Operational" is actively false** in this install — `/run` and `/playground` return 503 because `DOCKER_RUNNER_ENABLED=false`. Verified: the API returns this exact static list.

### 10. Institution → Dashboard → growth / session-activity charts
`app/institution/dashboard/DashboardCharts.tsx:59` (students 110→245 across Apr–Sep) and `:121` (scheduled 12/9/13/16/10/11/11 per weekday). Used whenever the API series is empty. The institution dashboard's own API *does* return a real (all-zero) series, so these only bite when the key is missing — which is the fresh-install case.

`app/institution/dashboard/page.tsx:254` has the same shape of fake for `system_status`.

### 11. Institution → Analytics → Integrity Violations → severity chart
`components/analytics/IntegrityViolationsTab.tsx:164-167`
```tsx
const highVal = (rawBySev['high'] || 0) + (rawBySev['critical'] || 0) || 68;
const medVal  = rawBySev['medium'] || 36;
const lowVal  = rawBySev['low']    || 18;
const infoVal = rawBySev['info']   || 6;
```
A brand-new institution with zero proctor events shows a 68/36/18/6 severity split.

### 12. Institution → Sessions → KPI fallbacks
`app/institution/sessions/page.tsx`
- `:1175` `… || s.student_count || 38`
- `:1198` `totalStudents || 152`
- `:1342` `data.total || 128`
- `:1344` `data.pages || 18`
- `:1372` `attendance_total || 30`

### 13. Attendance Matrix — fake averages
`components/analytics/AttendanceMatrixTab.tsx:249-250` → `morningAvg: amAvg || 76`, `afternoonAvg: pmAvg || 64`

### 14. Instructors tab — fake per-instructor stats
`components/analytics/InstructorsTab.tsx:2113` `{viewInstructor.students_count || 90}`, `:2120` `{viewInstructor.sessions_run || 10}`

### 15. Practice → Profile — fake rank
`app/practice/profile/page.tsx:817` → `#{analytics?.standing?.global_rank || 42}`

### 16. Backend student analytics score fallbacks
`backend/app/student_analytics/routes.py:119-120`
```python
avg_grade  = academic_360.get('grades', {}).get('avg_grade', 78.0) or 78.0
rating_val = platform_standing.get('rating', 1540.0) or 1540.0
```
A student with no grades is reported as 78.0, and no rating as 1540.0.

### 17. Experiments → utilization rate
`app/instructor/experiments/page.tsx:438` → `… : 75` when there are no experiments.

### 18. Institution academic/users — fake roll number
`app/institution/academic/page.tsx:2402`, `app/institution/users/page.tsx:1178` → `roll_number || 'NDU2024012'`

---

## 🟡 LOW / cosmetic — demo-era leftovers

| File | Issue |
|---|---|
| `components/layout/InstructorShell.tsx:110` | name falls back to `'Dr. Priya Sharma'` |
| `app/instructor/settings/page.tsx:188` | same |
| `app/student/live-lab/[sessionId]/page.tsx:2073,2569,3389` | instructor falls back to `'Dr. Priya Sharma'` |
| `app/student/live-lab/[sessionId]/page.tsx:1101` | avatar colour keyed on the literal `'Priya Sharma'`, returns hardcoded initials `'DP'` |
| `app/instructor/analytics/OverviewTab.tsx:46,48` | avatar colours keyed to fake rolls `NDU2024012`, `NDU2024004` ("Ananya") |
| `app/instructor/analytics/StudentsTab.tsx:49` | same, keys off `'aadhya'` |
| `backend/app/models/free.py:102` | `solves_count or 1000` |
| `backend/app/instructor/analytics.py:3726` | hardcoded name→colour map including `'Ananya Iyer'` |
| `backend/app/ai/role_tools.py:3390` | `inst.max_students or 200` |
| `backend/seed_help_demo.py:51` | sqlite3-only, fails on Postgres (already known) |

---

## 🔧 Broken endpoint found along the way

`GET /api/instructor/analytics/at-risk?days=30` → **404** on the Instructor Analytics page (twice per load, console error).

The frontend calls it at `app/instructor/analytics/page.tsx:481` via `experienceService.analyticsAtRisk()` → `services/experience.service.ts:420`. The backend has **no such route** — `app/instructor/analytics.py` defines `overview`, `trends`, `engagement`, `integrity`, `ai-usage`, `roster`, `cohort-matrix`, `mastery-overview`, etc., but nothing at `/at-risk`. So the "risk worklist" on the Overview/Today tab silently receives nothing.

Also called but missing: `/instructor/analytics/concept-heatmap` (declared in `experience.service.ts:434`, no backend route) — not currently reached by any page, so no visible error yet.

---

## ✅ What is genuinely correct (verified live, not guessed)

| Page | Evidence |
|---|---|
| Instructor Dashboard | 1 student, 1 experiment, 0 active sessions, 0 pending grading, "1 section assigned" |
| Instructor → Students + Student 360 drawer | Rahul Sharma / SKIT2026001, risk 92, mastery 0%, completion 0/1 |
| Instructor → Grading | 1 student, 1 experiment, 0.0/100, "Not Submitted" |
| Instructor → Reports | real roster, `0.0 (0%)`, "No batch workbooks generated yet" |
| Instructor → Sessions / Exams / Feedback / Management | all empty states, no invented rows |
| Instructor → Experiments list | 1 subject, 1 experiment, 1 published, "1 Actual dataset" |
| Institution → Dashboard KPIs | 1 / 1 / 1 / 1 / 0 — correct |
| Institution → Dashboard Recent Activity | real audit-log entries (Dr. Ramesh Kumar, Prof. Anitha Rao logins) |
| Institution → Analytics KPIs | 1 / 1 / 0 / 0.0 / 0%, batch "2028 (B.Tech)" derived from real data |
| Student → Analytics KPI cards | 0% academic, 1 subject, 0/1 experiments, #1/1 rank |
| Student → Subject Performance table | CS301, 0%, 0/1 — correct |

**Honest summary:** the *data plumbing* is correct almost everywhere — dashboards, roster, grading, reports, KPIs all read real rows. The fakes live in (a) chart/KPI **fallbacks** that fire when a series is empty, (b) a handful of pure-literal tiles (4.7 rating, 120 students, 36 students, 2024-2025), (c) two backend generators (fake session activity, hardcoded system status), and (d) the student academic trend builder's hardcoded 5-subject list.

---

## Suggested fix order

1. **Delete** `extended.py:752-800` (fake recent activity) — the empty state already exists.
2. **Delete** the `system_status` literal in `institution/routes.py:1798` and probe for real (or mark Code Execution as disabled when `DOCKER_RUNNER_ENABLED` is false).
3. **Delete** `avgRating: 4.7` and the `4.7/5` literal; hide the tile if there's no rating source.
4. Replace `student_count || 120` with `student_count ?? 0` + an "—" display when unknown.
5. Strip every `|| <non-zero>` in `OverviewTab`, `StudentsTab`, `IntegrityViolationsTab`, `AttendanceMatrixTab`, `InstructorsTab`, `DashboardCharts`, and the student `AcademicTab`/`PlatformTab` — render empty states instead.
6. Remove `'2024-2025'` default and `36 Students` copy from `instructor/analytics/page.tsx`.
7. Fix `academic_dashboard_builder.py:272` to iterate the student's *actual* enrolled subjects.
8. Add the missing `GET /instructor/analytics/at-risk` route (or repoint the frontend call).
