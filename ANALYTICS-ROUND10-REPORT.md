# Analytics Round 10 — Hardcoded Values Removed, Everything Computed From The Database

**Date:** 2026-10-23
**Scope:** all three roles (student, instructor, institution admin) plus the platform admin surface
**Companion plan:** `ANALYTICS-ARCHITECTURE.md` (§8 “As built” describes what actually shipped)

---

## 0. How this round was verified (and why that matters)

The database was rebuilt from models with **no demo data** — the only rows that exist were created
by real user actions. Everything below was produced by:

1. `walkthrough.py` — superadmin onboards the institution, then the admin builds year → department →
   batch → section → subject, creates the instructor and the student, assigns the class.
2. **`make_activity.py`** (new) — the instructor creates 3 experiments (with rubric weights summing to
   100), schedules 3 lab sessions, marks attendance overrides (`present`, `late`, `absent`) and saves 3
   rubric grades through the grading endpoint. *No row is inserted with raw SQL.*
3. **`sweep_endpoints.py`** (new) — 40 analytics endpoints × 4 roles, asserting HTTP 200.
4. `analytics_audit.py` / `analytics_audit2.py` — Playwright walk of 25 screens, capturing console
   errors, failed XHRs and screenshots into `ui-checks/analytics/`.

Result after the fixes: **40/40 endpoints 200 · 0 failed API calls · 0 console errors** on all 25 screens.

The point of building data this way: a fabricated number and a real number look identical when the
database is empty, so the pages were audited against activity that genuinely exists.

---

## 1. Endpoint crashes found and fixed

| Endpoint | Crash | Root cause |
|---|---|---|
| `GET /student/analytics/overview` | `NoneType / float` | platform rank derived from a percentile that is now `None` for small cohorts |
| `GET /student/dashboard` | `round(None)` | `StudentRanking.to_dict()` rounded nullable component scores |
| `GET /institution/analytics/overview` | `float(None)` / `None - None` | a student with no measurable risk reached the cohort mean; week-over-week deltas subtracted two nulls |
| `GET /institution/analytics/benchmark` | `'>' not supported` (×4) | zero-student sections and unmeasured grades flowed into percentile/z-score arithmetic |
| `GET /institution/analytics/instructors` | `NameError: t` | a rename left `turnaround_samples[t.id]` pointing at a loop variable that no longer existed |
| `GET /instructor/analytics/cohort-matrix` | `int + None` | “Engagement” component averaged attendance with an unmeasured focus score |

These were *all* the same class of bug: a metric that correctly became “unknown” was still being
treated as a number downstream.

---

## 2. Numbers that were invented, and what replaced them

### 2.1 Instructor analytics

| Where | Was | Now |
|---|---|---|
| Students tab — Risk Breakdown | missing factor rendered a **full-width bar** at `%` | no bar, em dash |
| Overview — Needs Attention | fell back to “top 5 students by score” ranked *descending* (the healthiest students, labelled as needing attention) | empty state: nobody is at risk |
| Overview — risk bands | students with no grade counted as 0 → banded “high”; `ok` counted as the string `low`, so On-Track always showed 0 | unmeasured students excluded from banding and reported separately; bands match the student card’s engine |
| Overview — class avg / focus / attendance | `0.0` floor, `'0%'` static deltas | `null` + `is_available`; delta `null` unless a real previous window exists |
| Cohort matrix — attendance | `late` treated as fully present | credit-weighted (`late` 0.8, `partial` 0.6) via the shared map |
| Cohort matrix — mastery KPI | literal `"None%"` string in the payload | `value: null, is_available: false` |
| Struggles quadrant | ungraded student plotted at outcome 0 in “disengaged” | excluded from the quadrant (no outcome axis position) |
| Instructor trend sparkline | current average repeated 5× | five real time buckets, empty buckets stay empty |

### 2.2 Student analytics

| Where | Was | Now |
|---|---|---|
| Overall Academic Score | `0` when nothing graded | `null` → em dash |
| Score delta | hardcoded `+0.0%` | latest grade vs mean of prior grades; `null` with a single grade |
| Academic Rank | `#1 / 1` even unranked; “Top 100% in Cohort” | `Not ranked yet`; “Only student in cohort” / “Cohort too small for a percentile” under cohort 5 |
| Subject sparkline | first grade repeated until 6 points | real graded points only; gaps break the line instead of being drawn at 0 |
| Subject trend % | equalled the average grade (`82%` shown as *+82% trend*) | latest vs mean of earlier grades in that subject |
| 12-week chart | weeks with no work filled with today’s average | `null` gaps (visible discontinuity, no false “stable” line) |
| Rank badge | always `↑ +0%` | removed; rank delta renders only when a previous snapshot exists |
| Two-track hero | `?? 1` rank, `?? 95` percentile, `?? 100%` attendance, `?? 0%` mastery, fabricated XP curve | em dashes; percentile only with a cohort ≥ 5 |

### 2.3 Institution analytics

| Where | Was | Now |
|---|---|---|
| Overview deltas | previous period **forced equal to the current one** when empty → a permanent `0%` | `null`; the card shows `—` |
| Overview — campus avg grade | `0.0` when nothing graded; included grades with `experiment_id NULL` | `null`; grade-scope rule applied |
| Cohort Benchmark — z-score | `0.00σ` for a single section (“exactly average”) | `null` → “not benchmarkable”; the distribution donut says so explicitly |
| Cohort Benchmark — distribution | hardcoded 27/9/11/5/2 fallback inside the component | real counts, `unmeasured` bucket |
| Cohort Benchmark — department bars | unmeasured department at `0.0` | `null`, no bar |
| Instructors — avg student performance | `0.0` (grades attach to experiments, not sessions) | grades attributed **through the experiment → subject → instructor**, 82.1 |
| Instructors — engagement | `attendance × 0.9` when focus ML is off | `null` (only real FocusScore telemetry counts) |
| Instructors — KPI deltas | `0.0` constants | computed across the 7 real time buckets, `null` when there is no earlier bucket |
| Instructors — feedback card | `0 / 5` with “from 1,245 responses” (invented) | `—`, “No feedback submitted yet” |
| Grades tab | 7 identical sparkline points (current value repeated) | 7 equal **time** buckets over the window |
| Section comparison | zero-student sections at `avg_grade 0.0`, `focus 50.0` | `null` + `has_data: false` |

### 2.4 Platform analytics

| Where | Was | Now |
|---|---|---|
| Sessions (30d) / Active institutions | `0` on a platform with 3 scheduled labs | activity timestamp is `COALESCE(started_at, scheduled_at)` → 3 sessions, 1 institution |
| Sessions trend | “No sessions recorded in this window” | 3 real daily bars |
| Peak hours | endpoint 500’d on NULL `started_at` | coalesced; hour-of-day demand reported |

---

## 3. Persist vs compute — the decision, as implemented

The round-10 brief asked which computed fields should be **stored** rather than recalculated on every
read. The rule applied:

* **Persist (L1)** — anything that must be read as a *series*: per-student atomic metrics per day
  (`student_metric_snapshots`) and campus rollups (`institution_daily_kpis`). Recomputing 30 days of
  history on each chart open was the single biggest source of latency.
  Written by `POST /institution/analytics/snapshots/run` (0.02 s) and by the daily job.
  **Unmeasured averages are persisted as `NULL`** — storing `0.0` / `50.0` would have manufactured
  history that later trends would confidently plot.
* **Persist write-through (L2)** — `student_rankings` (holistic score + position). Invalidated by the
  same write hooks that invalidate the cache.
* **Cache, don’t persist (L3)** — KPI payloads, 45–60 s, flushed by `bump(institution_id)` on grade,
  attendance, mastery, attempt and session writes.
* **Never persist** — current-window counts, work queues, availability, and anything that must be exact
  at the moment of reading (an at-risk count that is 60 s stale is a wrong count).

---

## 4. Performance

Warm cache: every analytics endpoint answers in **2 ms**; coldest first call 140 ms
(`student/analytics/overview`). Full table in `ANALYTICS-ARCHITECTURE.md` §8.4.
Page-level (production build): instructor analytics 1.7 s, institution overview 1.6 s, student
analytics 1.5 s — including a 1.2 s artificial settle wait in the measurement, so ≈0.3–0.5 s real.

No visual redesign was done: the same cards, charts, tables and colours; only the values and their
`—` states changed.

---

## 5. Files touched

**Backend** — `app/models/knowledge.py`, `app/student/routes.py`,
`app/student_analytics/academic_dashboard_builder.py`, `app/instructor/analytics.py`,
`app/analytics/{completion,risk,benchmark,snapshots}.py`, `app/institution/{routes,extended}.py`,
`app/admin/platform.py`.

**Frontend** — `components/analytics/{KpiCard,SectionDistributionDonut,BenchmarkComparisonCards,
InstructorsTab,GradesMarksTab,AttendanceMatrixTab,AIUsageTelemetryTab,EngagementSignalsTab,
IntegrityViolationsTab,CurriculumRollupTable,StudentFunnelTab}.tsx`,
`components/student-analytics/{AcademicTab,PlatformTab,TwoTrackHero,KnowledgeMapTab}.tsx`,
`app/instructor/analytics/{StudentsTab,TrendsTab,ExperimentsTab,EngagementTab,MasteryTab,IntegrityTab,OverviewTab}.tsx`,
`app/institution/analytics/page.tsx`, `app/admin/analytics/page.tsx`, `app/student/rankings/page.tsx`.

**New tools** — `make_activity.py` (creates real activity through the API), `sweep_endpoints.py`
(4-role endpoint sweep).

---

## 6. Known limits (honest list)

1. `app/institution/extended.py` benchmark/section trend curves are now real time buckets, but with a
   single section the bar chart necessarily has one bar — that is the data, not a bug.
2. Percentiles and z-scores require a cohort ≥ 5 / non-zero dispersion; on this seeded institution they
   are `null` by design, so those cards read “not benchmarkable” rather than showing a number.
3. `grep` still finds numeric `?? 0` guards inside table/sort helpers (e.g. `(item.avg_grade ?? 0)` used
   only as a comparator for ordering). Those affect ordering, not displayed values.
4. Snapshots only accumulate from now on; historical trend lines need
   `POST /api/institution/analytics/snapshots/run?backfill=true&days=N` (or the cron) to fill.
