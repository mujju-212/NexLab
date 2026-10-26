# Analytics Pipeline Report — NexLab Virtual Lab

**Date:** 22 Oct 2026
**Scope:** Every analytics page, tab, visualisation and table across the three analytics surfaces (Instructor, Institution, Student), plus the platform dashboard widgets.
**Question answered:** does each element have a real pipeline to a real data source, and does it actually compute what it displays?

---

## 1. Verdict

All three analytics surfaces now render **only real data**. Every value on screen traces to a database query. Where the database has nothing, the UI shows a real zero or an explicit empty state — never an invented number.

| Measure | Before | After |
|---|---|---|
| Analytics endpoints returning 200 | 50 / 51 (`/at-risk` 500) | **51 / 51** |
| Hardcoded/dummy numeric sites in analytics | 40 non-zero + 24 literal arrays | **0** |
| Fabricated sparklines / deltas | 22 | **0** |
| Pages rendering honest empty states | 0 | all |

Verified against the live tenant **SKIT** (`ec9ca5a0…`), which contains exactly **1 institution, 1 department, 1 batch, 2 sections, 1 subject, 1 experiment, 1 instructor, 1 student, and 0 sessions / submissions / grades / feedback**. That makes it a perfect honesty test: any non-zero figure on a page would have been fake.

---

## 2. Method

1. Enumerated every analytics route from the Flask URL map → 51 endpoints.
2. Authenticated as all three roles and probed every endpoint, recording status + payload.
3. Drove the real UI with Playwright, clicking every tab on every analytics page, capturing the rendered text and every `/api/...analytics...` network call.
4. Diffed the rendered numbers against the payloads, and each payload against the SQL source.
5. Anything not traceable to a query was classified fake and fixed at the source (backend first, then removed the frontend fallback that was masking it).

Harnesses are in the workspace: `sweep_analytics_tabs.py`, `/tmp/sweep_inst2.py`, `/tmp/sweep_stud.py`, `page_sweep.py`, `audit_dummy_data.py`.

---

## 3. Instructor Analytics — `/instructor/analytics`

Common source: the cascading filter (Academic Year → Department → Section → Subject → Experiment) is resolved server-side by `_resolve_active_scope()`, and every tab receives the scoped `section_subject_id` list. **The filter itself is now data-driven** — year/department/section dropdowns are built from the instructor's real `SectionSubject` rows (it previously hardcoded "Section A/B", 24/12/36 students and "2024-2025").

| Tab | Endpoint(s) | Pipeline | What is actually computed |
|---|---|---|---|
| **Overview** | `/overview` | ✅ Real | 4 KPI cards from `Grade`/`SessionAttendance`/`FocusScore`; risk distribution from `compute_student_risk`; risk trend from `StudentMetricSnapshot`; struggle quadrant from effort vs outcome; class quality distribution from graded submissions |
| **Students** | `/cohort-matrix` | ✅ Real (fixed) | 5 KPIs from grades/attendance/mastery/focus; risk bands; risk breakdown per dimension; roster + Student-360 drawer. Insights are now generated from the computed metrics, not a fixed sentence |
| **Experiments** | `/experiments` , `/experiments-overview` | ✅ Real (fixed) | Per-experiment scores, completion, attempt counts from `CodeAttempt` + `Grade` |
| **Trends** | `/trends` , `/trends-overview` | ✅ Real (fixed) | Longitudinal grades/attendance/focus series from grades & focus tables; attendance and focus KPIs previously defaulted to 82% / 75% when empty — now 0% |
| **Mastery** | `/mastery-overview` | ✅ Real (rewritten) | Heatmap columns now derived from the concepts the cohort actually has `ConceptMastery` rows for (was a fixed 12-concept curriculum × 6 fixed categories that rendered even with zero data). Cells with no row render `—`, not a fabricated baseline |
| **Engagement** | `/engagement` , `/engagement-overview` | ✅ Real (fixed) | Active/dormant counts, time-on-task, focus averages, distraction switches from `FocusScore`/`CodeAttempt` |
| **Integrity** | `/integrity` , `/integrity-overview` , `/analytics/integrity/review-queue` | ✅ Real (fixed) | Confidence from real proctor/plagiarism signals; review queue. Confidence defaulted to 94% when empty — now 0% |
| **Rankings** | `/rankings-overview` , `/analytics/rankings/scope` | ✅ Real | Weighted score from `AnalyticsConfig` weights (weights now show `—`/0 if absent instead of 30/20/20/15/15) |
| **AI Usage** | `/ai-usage` , `/ai-usage-overview` | ✅ Real | Query counts, tokens, per-feature and per-subject breakdown from `AIUsageLog` |

**New this round:** `GET /instructor/analytics/at-risk` did not exist (404 for the Students tab, 500 once stubbed). It is now a real endpoint: batched grades, attendance, mastery, focus and attempt-recency → `compute_student_risk` → ranked list with per-student reasons, band summary and scope. Live result:

```
1 student · critical 1 · reasons ['Average grade 0%','Concept mastery 0%',
'No graded submissions','Inactive 30 days']
```

---

## 4. Institution Analytics — `/institution/analytics`

| Tab | Endpoint | Pipeline | Notes |
|---|---|---|---|
| **Overview** | `/overview` | ✅ Real | Totals, at-risk count, avg score, completion + previous-period comparison |
| **Learning Outcomes** | `/outcomes` | ✅ Real | Outcome attainment per section/subject |
| **Student Funnel** | `/funnel` | ✅ Real | Enrolled → active → attempted → graded stages |
| **Cohort Benchmark** | `/benchmark` | ✅ Real | Section vs campus mean |
| **Attendance** | `/attendance` | ✅ Real (fixed) | Heatmap matrix + peak/lowest slot. Previously fell back to invented "Tue 10AM 88%" / "Sat 4PM 18%" / AM 76% / PM 64% |
| **Grades & Marks** | `/grades` | ✅ Real | Grade distribution, bands, per-section averages |
| **Integrity Violations** | `/integrity` | ✅ Real (fixed) | Severity split. Previously backfilled to 68/36/18/6 when empty |
| **Engagement Signals** | `/engagement` | ✅ Real | Active vs dormant, activity heatmap |
| **Risk Early Warning** | `/risk/overview` , `/risk/trends` , `/students-at-risk` | ✅ Real | Risk bands + 8-week trend from snapshots |
| **AI Usage** | `/ai-usage` | ✅ Real | Queries, tokens, reliance buckets, high-reliance table |
| **Instructors** | `/instructors` | ✅ Real (fixed) | Per-instructor sections/students/sessions. Previously defaulted to 2 / 90 / 10 |

### Institution dashboard widgets — `/institution/dashboard`

| Widget | Pipeline | Notes |
|---|---|---|
| KPI row (students/instructors/batches/subjects/active sessions) | ✅ Real | Counted from the tenant's own tables |
| Student & Instructor Growth | ✅ Real | 6-month series from `User.created_at`; the literal Apr–Sep array was removed |
| Session Activity | ✅ Real | Per-day scheduled/completed/live from `LabSession` |
| **System Status** | ✅ Real (rewritten) | Was five hardcoded "Operational" rows. Now `_probe_system_status()` really probes: DB (`SELECT 1`), LiveKit credentials, `DOCKER_RUNNER_ENABLED` + docker binary, AI provider keys. Live: *Code Execution = Disabled, healthy=false* — which is the truth on this box |
| Recent Activity | ✅ Real (rewritten) | Sourced from the tenant audit log (logins, enrolments). No synthetic event generator remains |
| Upcoming Sessions | ✅ Real | Empty when there are none |

### Live Lab Sessions — `/institution/sessions`

| Element | Pipeline | Notes |
|---|---|---|
| Live/online/instructor KPIs | ✅ Real | From `SessionAttendance` + `LabSession` |
| **Total Live Duration** | ✅ Real (fixed) | Previously `today_mins or 270` → a permanent "4.5 hrs". Now sums real `started_at`→`ended_at`; shows **0 hrs** with no sessions |
| Recent Activity feed | ✅ Real (rewritten) | Built from `SessionAttendance.joined_at/left_at` and `LabSession.started_at/ended_at`, batched name lookup. Returns `[]` when nothing happened, and the table renders "No recent live activity logged yet." |
| Today's summary tiles | ✅ Real (fixed) | Removed `|| 4`, `|| 3`, `|| 152`, `|| 38` |
| History totals/pagination | ✅ Real (fixed) | Removed `data.total || 128`, `data.pages || 18` |
| CSV export rows | ✅ Real (fixed) | `duration_minutes || 120`, `attendance_total || 30` → real values |

---

## 5. Student Analytics — `/student/analytics`

| Tab | Endpoint | Pipeline | Notes |
|---|---|---|---|
| **Overview** | `/overview` | ✅ Real | Study activity, streaks, submission summary |
| **Academic** | `/academic-dashboard` | ✅ Real (rewritten) | All seven blocks previously carried a full fake dataset (5 subjects with grades 82/78/72/76/69, 8 concepts, 92% attendance donut, 5 fake grades, rank #42/480, "Top 9% in Institute"). Now all derive from the student's own enrolments/grades/attendance. Live: 0% score, 1 subject, 0/1 experiments, 0% attendance, rank #1/1, CS301 0% |
| **Platform** | `/platform-dashboard` | ✅ Real (rewritten) | Rating/level/streak/badges/submissions/unlocks from practice tables. Fake leaderboard (Aryan Mehta, Riya Sharma, "You (Aditi Rao)"), fake profile ("Aditi Rao"), fake 142 solves and 4.7 rating removed. Badges now come from the backend catalogue with locked/unlocked state |
| **Knowledge Map** | `/knowledge-map-dashboard` | ✅ Real (fixed) | Strengths / focus-next / unlocks lists were three hardcoded arrays — now the API's real ranked lists, empty when unknown |

---

## 6. What was fixed in this pass

### Backend
| File | Change |
|---|---|
| `app/instructor/analytics.py` | Added missing module-level `defaultdict` + `StudentMetricSnapshot` imports; renamed a `g` loop variable that shadowed Flask's `g` (UnboundLocalError); new `/at-risk` endpoint; `risk_trend` from real snapshots; mastery-overview rewritten (real concept columns, `None` for no-data cells, no 68%/86/2.1 defaults); new `_snapshot_series()` / `_delta_from_series()` / `_cohort_insights()` helpers; removed all 22 fabricated sparklines and deltas; `attendance 82%` / `focus 75%` defaults removed; quadrant no longer labels unassessed students "Thriving" |
| `app/analytics/advanced.py` | Same quadrant tie-break fix (`assessed` flag) |
| `app/institution/routes.py` | `_probe_system_status()` — real health probes |
| `app/institution/extended.py` | Fake activity generator deleted → real attendance/session-derived feed; `today_mins or 270` removed |
| `app/student_analytics/routes.py` | `avg_grade`/`rating` defaults → 0; new `GET /api/platform/public-stats` |
| `app/student_analytics/academic_dashboard_builder.py` | `trend_subjects` from real enrolments (was `['DSA','DBMS','CN','OS','SE']`) |
| `app/models/free.py`, `app/ai/role_tools.py` | `or 1000` → 0, `or 200` → 0 |

### Frontend
| File | Change |
|---|---|
| `app/instructor/analytics/OverviewTab.tsx` | KPI/risk/quality fallbacks → zeros; trend → `[]` with empty state + data-derived Y axis; delta badges now render the real delta (neutral `—` when flat) |
| `app/instructor/analytics/page.tsx` | Cascading filters fully data-driven (no "Section A/B", 24/12/36, "2024-2025") |
| `app/instructor/analytics/StudentsTab.tsx` | KPI/risk/insight/filter fallbacks removed; 6 hardcoded `NDU2024…` avatar rules deleted; `integrity_confidence || 97` → `?? 0` |
| `app/instructor/analytics/MasteryTab.tsx` | `null` cells render `—`; empty-state for no mastery data |
| `app/instructor/analytics/RankingsTab.tsx` | `|| 30/20/15` weights → `?? 0` |
| `app/instructor/analytics/IntegrityTab.tsx` | Donut fallback array removed; `total_students ?? 9` → 0 |
| `app/instructor/experiments/page.tsx` | `4.7` rating → real `feedback-overview` average with star fill + response count; `utilizationRate : 75` → 0; `student_count || 120` → 0 |
| `app/instructor/sessions/page.tsx` | `student_count || 12/10` → real |
| `components/student-analytics/AcademicTab.tsx` | Seven large fake datasets → honest zeros/empty |
| `components/student-analytics/PlatformTab.tsx` | Standing/KPIs/trend/difficulty/badges/submissions/unlocks/leaderboard/profile → real or empty |
| `components/student-analytics/KnowledgeMapTab.tsx` | Three hardcoded ranked lists removed |
| `components/student-analytics/GentleStandingCard.tsx` | Fake "On Track & Thriving" + 2 canned suggestions → real or neutral |
| `components/analytics/AttendanceMatrixTab.tsx` | Invented peak/lowest/AM/PM defaults removed; peak/lowest seeded from the first real cell |
| `components/analytics/IntegrityViolationsTab.tsx` | `|| 68/36/18/6` → real buckets |
| `components/analytics/InstructorsTab.tsx` | `|| 2/90/10` → real |
| `app/institution/dashboard/DashboardCharts.tsx` + `page.tsx` | Literal growth/session arrays and hardcoded "Operational" system status removed |
| `app/institution/sessions/page.tsx` | `'4.5 hrs'`, `|| 152/128/18/38/120/30` removed |
| `app/institution/users/page.tsx`, `app/institution/academic/page.tsx` | `roll_number || 'NDU2024012'` → `—` |
| `app/practice/profile/page.tsx` | `rank || 42`, `streak || 6` → real |
| `components/layout/InstructorShell.tsx`, `app/instructor/settings/page.tsx`, `app/student/live-lab/[sessionId]/page.tsx` | `'Dr. Priya Sharma'` fallback ×4 removed |
| `components/courses/CourseDetailPage.tsx` | `acceptance_rate || 70`, `solves || 1200` → real |
| `app/(auth)/login|register/page.tsx` | "10K+ / 200+ / 50+" marketing stats → live counts from `/platform/public-stats` |
| `services/experience.service.ts` | Dead `analyticsConceptHeatmap()` (route never existed) removed |

---

## 7. How empty data is presented

The tenant genuinely has almost no activity, so this is the normal state right now. The design rule applied everywhere:

- **A real zero is shown as 0**, not hidden and not replaced.
- **"No measurement exists"** is shown as `—` (em dash), a neutral badge, or an explicit sentence ("No concept mastery recorded for this cohort yet.", "No recent live activity logged yet.", "No risk snapshots recorded yet. Trend appears after the nightly snapshot job runs.").
- **Trend lines are not drawn** unless there are ≥2 real points.
- **Averages over an empty set are 0**, never a plausible-looking constant.
- **Unassessed students are not classified** — a student with no effort and no outcome is `disengaged` with `assessed: false`, rather than "Thriving" purely because they tie a zero median.

---

## 8. Remaining known gaps (not fake data — missing/absent data)

| Item | Status |
|---|---|
| `StudentMetricSnapshot` history | Table empty because the nightly job has never run. Trend charts stay in their empty state until `POST /api/institution/analytics/snapshots/run` or the scheduler runs. This is correct behaviour, not a bug |
| Onboarding `complete=false` | `POST /platform/institutions/<id>/onboarding/complete` returns 200 but never persists, because nothing creates an `EnvironmentProfile` row. Separate product bug — does not affect analytics |
| Login page hero illustration | Contains a decorative mocked screenshot ("Passed 100/100 +40 XP"); it is an illustration of the product, not a statistic |
| Risk "Integrity 100%" | The risk engine treats *no violations* as full integrity. Defensible, but worth revisiting if you want "unmeasured" distinguished from "clean" |
| Docker / code execution | `DOCKER_RUNNER_ENABLED=false`, so `/api/run` and `/api/playground` return 503 by design and System Status correctly reports *Code Execution — Disabled* |

---

## 9. Reproduce this verification

```bash
# services
cd /home/user/backend && PORT=5000 HOST=0.0.0.0 FLASK_ENV=development python3 run.py
cd /home/user/frontend && NODE_OPTIONS="--max-old-space-size=1500" npx next start -H 0.0.0.0 -p 3000

# page health (51 pages, 4 roles)
python3 /home/user/page_sweep.py

# render every instructor analytics tab + capture API calls & text
python3 /home/user/sweep_analytics_tabs.py     # -> tab_text.json

# raw static-value scan
python3 /home/user/audit_dummy_data.py
```

Screenshots: `screenshots/an_analytics_after.png`, `inst_analytics_after.png`, `inst_tab_*.png`, `stud_tab_*.png`, `an_inst_dashboard_after.png`, `an_inst_sessions_after.png`, `an_stud_analytics_after.png`.
