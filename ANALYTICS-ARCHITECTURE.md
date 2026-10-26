# Analytics Architecture Plan — 3 Roles, Real Data Only

**Goal:** every number on every analytics screen (instructor, student, institution admin, platform admin) is either read from the database or derived from it by one documented formula; nothing is invented, nothing is computed twice, nothing is stale after a write. UI stays exactly as it looks today.

---

## 1. Principles

| # | Rule | Consequence in code |
|---|---|---|
| P1 | **One metric, one definition, one implementation.** | A metric is defined once in `app/analytics/metrics.py` (or a sibling module) and every endpoint calls it. No endpoint re-derives an average with its own filter. |
| P2 | **Missing data is `null`, never a number.** | `null` + `is_available: false` travels to the UI, which renders `—` / an empty state. No `or 50.0`, no `?? 72`, no `[62, 65, 68]`. |
| P3 | **No trend without history.** | A series is only rendered from real points. `delta` is `null` unless a real, equal-length previous window exists. Buckets with no data are gaps, not forward-filled values. |
| P4 | **Composites renormalise, they never impute.** | A 5-factor score uses the factors that exist and rescales their weights; it reports `coverage` so the UI can say "3 of 5 factors". It never substitutes 50/70/80. |
| P5 | **Persist what is expensive or historical; compute what must be exact.** | Daily/historical series and O(n) cohort scores are materialised; current-window KPI cards are computed live behind a short-TTL cache. |
| P6 | **Writes invalidate.** | Any write that can change a metric bumps a freshness marker for the affected scope; readers recompute on demand if stale. No nightly-only cron dependency for correctness. |
| P7 | **One scope object.** | Everything is filtered through one resolver (`section → subject → experiment` ids + window), so the same student can't be counted twice or missed. |

---

## 2. Canonical metric registry

`app/analytics/metrics.py` is the single definition layer. Every metric returns a box:

```python
{'value': float|None, 'sample_size': int, 'is_available': bool, 'window_days': int}
```

| Metric | Definition (single source) | Source tables | Persisted? |
|---|---|---|---|
| `grade_avg` | mean(`final_grade`) over grades **joined to experiments that belong to the scope's section-subjects** and inside the window | `grades` ⨝ `experiments` ⨝ `section_subjects` | computed (cached 60 s) |
| `grade_trend` | OLS slope of `final_grade` vs weeks, ≥2 grades | `grades` | computed |
| `consistency` | `100 − stdev(grades)`, needs ≥2 grades | `grades` | computed |
| `mastery_avg` | recency-decayed mean of `ConceptMastery.mastery_score`, half-life 30 d | `concept_mastery` | **persisted** (written by grading/practice events) |
| `mastery_breadth` | count of distinct concepts ≥ threshold | `concept_mastery` | persisted |
| `attendance_rate` | Σ(weight(status)) / n records, weights present 1.0 / late 0.8 / partial 0.6 / absent 0 | `session_attendances` ⨝ `lab_sessions` | computed (cached) |
| `effort_hours` | Σ `total_time_seconds` / 3600 | `session_attendances` | computed |
| `focus_avg` | mean(`focus_score`) | `focus_scores` | computed (rows already persisted by the focus sampler) |
| `efficiency` | `100 − (avg_attempts − 1) × 15`, needs ≥1 `CodeAttempt` | `code_attempts` | computed |
| `submission_recency_days` | days since last `CodeAttempt.submitted_at` | `code_attempts` | computed |
| `integrity_score` | `100 − 10 × Σ severity_weight(high 3, medium 2, low 1)` floored at 0, **no artificial 60/70 floor** | `proctor_events` | computed |
| `ai_reliance` | hints per attempted experiment × 25, capped 100 | `hint_logs` | computed |
| `risk_score` | `0.30(100−G) + 0.25(100−A) + 0.20(100−M) + 0.15(100−F) + 0.10·recency`, **renormalised over available factors** | derived | **persisted daily** (`student_metric_snapshots`) + live for today |
| `holistic_rank_score` | `0.30·mastery + 0.20·engagement + 0.20·effort + 0.15·efficiency + 0.15·consistency`, renormalised, `engagement = 0.4·attendance + 0.6·focus` | derived from above | **persisted** (`student_rankings`) + live for today |
| `percentile` | share of cohort below the value; **only when cohort ≥ 5**, else `null` | derived | computed |

### 2.1 Scope rule (fixes the 77 / 83 / 82.8 split)

> **A grade that is not attached to an experiment in scope cannot be attributed to a subject, and is excluded from every subject-, section-, instructor- and campus-scoped average.**

Implemented once in `analytics/scope.py::grade_scope_filter()` and used by all five surfaces. The unattributable rows are reported separately as `unattributed_grades: n` in the student's own view so the data gap is visible instead of silently bending the average.

*(The seed database currently contains exactly one such row: `grades.id = 885b8d88…`, `experiment_id = NULL`, `final_grade = 100`. Today it is included by three endpoints and excluded by two — that is the entire 77 vs 83 story.)*

---

## 3. Persist vs compute — the decision

| Layer | What | Why | Refresh |
|---|---|---|---|
| **L0 raw** | `grades`, `session_attendances`, `proctor_events`, `code_attempts`, `concept_mastery`, `focus_scores`, `hint_logs` | source of truth | written by their own flows |
| **L1 daily snapshot** `student_metric_snapshots` | every atomic metric per student per day (+ `institution_daily_kpis` for campus) | gives O(1) historical series and trend lines; without it every chart recomputes 30 days | upserted for *today* on first read after a dirty mark; backfilled for past days |
| **L2 score cache** `student_rankings`, `rank_snapshots` | holistic score + rank position per student per section-subject | avoids recomputing cohort scores on every page view | recomputed when a grade / attendance / mastery write marks the scope dirty, plus a 5-minute ceiling |
| **L3 response cache** (in-process, keyed by `endpoint + scope + window`) | KPI payloads | instructor/institution dashboards issue 6–12 queries per tab | TTL 60 s, **flushed by the same dirty marks** |

**Does it update when something changes?** Yes — `app/analytics/freshness.py`:

```python
mark_dirty(institution_id, student_id=None, section_subject_id=None)   # called from writes
fresh(key, ttl, producer)  # returns cached payload, recomputing if dirty or older than ttl
```

Write hooks are added to: grade create/publish/override, attendance join/leave, proctor event ingest, code attempt submit, mastery update, session start/end. Reads never write snapshots for past dates (they only upsert *today*), so a page view can never be slow because of history.

**Never persisted:** anything that must be exact at request time — counts of records, queues, current-window KPIs, availability flags.

---

## 4. Page × component × data source matrix

Every component below is currently rendered; the table is the contract for what feeds it after the fix.

### 4.1 Instructor — `/instructor/analytics` (9 tabs)

| Tab | Component | Endpoint | Metrics | Mode |
|---|---|---|---|---|
| Overview | 4 KPI cards (Active students, Class avg grade, Focus engagement, Needs attention) | `/instructor/analytics/overview` | `COUNT(students)`, `grade_avg`, `focus_avg`, `COUNT(risk_band in critical/high)` | live + L3 60 s |
| Overview | Risk distribution donut | same | `risk_score` bands | live |
| Overview | Risk trend line | same | `student_metric_snapshots.risk` per day | L1 |
| Overview | Struggle quadrant | `/analytics/struggle-quadrant` | per-student `effort_hours` × `grade_avg` median split | live |
| Overview | Class quality distribution | `/instructor/analytics/overview` | grade bands | live |
| Students | 5 KPI cards | `/instructor/analytics/cohort-matrix` | `COUNT`, risk counts, `mastery_avg`, **`grade_avg` (same scope filter as Overview)**, `attendance_rate` | live + L3 |
| Students | Roster + health matrix | same | per-student boxes + `risk_score` + percentile (**null when n<5**) | live |
| Students | Student-360 drawer | `/analytics/student/{id}/*` | all atomic metrics | live |
| Experiments | Score cards + per-experiment table | `/instructor/analytics/experiments-overview` | `grade_avg` per experiment, `completion` from `experiment_submissions` | live |
| Trends | 4 KPI + trend chart | `/instructor/analytics/trends-overview` | daily buckets from **L1** (gaps, not fills) | L1 |
| Mastery | Mastery KPIs + heatmap | `/instructor/analytics/mastery-overview` | `concept_mastery` aggregates; **empty table ⇒ empty state** | live |
| Engagement | 5 KPI + quadrant | `/instructor/analytics/engagement-overview` | attendance/focus/time-on-task | live |
| Integrity | 4 KPI + queue + timeline + evidence mix | `/instructor/analytics/integrity-overview` | `proctor_events` (+ severity weights); deltas **from the API only**, no floors | live |
| Rankings | Multi-scope leaderboard | `/instructor/analytics/rankings-overview` → canonical engine | `holistic_rank_score` | L2 |
| AI Usage | Tokens/cost/tier | `/instructor/analytics/ai-usage-overview` | `hint_logs` + usage ledger; zeros are real zeros | live |

### 4.2 Student — `/student/analytics`, `/student/rankings`, `/student/submissions`

| Screen | Component | Endpoint | Mode |
|---|---|---|---|
| Analytics · header | 5 KPI cards (score, subjects, experiments, attendance, rank) | `/student/analytics/academic-dashboard` | live |
| Analytics · Academic | 12-week performance trend | same → `performance_trend` with **nulls for empty weeks** | L1 |
| Analytics · Academic | Subject performance table, concept mastery, attendance donut, risk & guidance, recent grades | same | live |
| Analytics · Overview | Growth KPIs + sparklines | `/student/analytics/overview` | live; sparkline **null** unless ≥2 real points |
| Analytics · Platform | Practice/contest stats | `/student/analytics/platform-standing` | live |
| Analytics · Knowledge Map | Concept graph mastery | `/student/analytics/knowledge-map` | persisted `concept_mastery` |
| Rankings | Subject card + cohort table | **one** endpoint for both halves (`/analytics/rankings/scope`) | L2 |
| Submissions | Attempts, grades, best run | `/student/submissions` | live (`code_attempts` empty ⇒ "no code runs recorded") |

### 4.3 Institution admin — `/institution/analytics` (11 tabs)

| Tab | Component | Endpoint | Fix applied |
|---|---|---|---|
| Overview | 5 KPI + 3 charts | `/institution/analytics/overview` | deltas only with a real previous window; campus-mean series always present |
| Learning Outcomes | 3 KPI + 3 trends | `/institution/analytics/outcomes` | `concept_mastery_rate` = real mastery (null if empty) and `pass_rate` reported separately; completion trend from real `content_progress` timestamps, not `rate×(i+1)/7` |
| Student Funnel | 5 stage KPIs + funnel | `/institution/analytics/funnel` | stage deltas from previous-period stage counts; `null` when there is no previous period |
| Cohort Benchmark | KPIs + section table | `/institution/analytics/benchmark` | real section names; z-score/percentile null when n<5 |
| Attendance | 4 KPI + matrix | `/institution/analytics/attendance` | delta chip for every card, one attendance definition |
| Grades & Marks | 4 KPI + histogram | `/institution/analytics/grades` | scoped `grade_avg` (same helper) |
| Integrity Violations | index + events | `/institution/analytics/integrity` | no 70-floor |
| Engagement | 4 KPI + sparklines | `/institution/analytics/engagement` | real series |
| Risk Early Warning | bands + list | `/institution/analytics/risk` | renormalised risk |
| AI & Telemetry | usage | `/institution/analytics/ai-usage` | real zeros |
| Instructors | KPI + table | `/institution/analytics/instructors` | remove `turnaround_days: 2.0` constant → real graded_at − submitted_at |

### 4.4 Platform admin — `/admin/analytics`

Users / sessions / AI calls / institution comparison / sessions trend — all direct `COUNT`s, plus the single-point chart fix.

---

## 5. Fix map for the audit findings

| Audit ID | Fix |
|---|---|
| A1 two ranking engines | `app/ml/ranking.py` and `/student/rankings` both delegate to `app/analytics/ranking.py::compute_rank_for_scope`; `student_rankings` becomes a write-through cache (L2). One number on every screen. |
| A2 five grade averages | `grade_scope_filter()` used by all five surfaces; unattributable grades surfaced as a count, not folded in. |
| A3 fake 100% mastery | `concept_mastery_rate` computed **only** from `concept_mastery`; `pass_rate` becomes its own KPI with its own label. Empty table ⇒ `—`. |
| A4 funnel deltas | `stage_delta = current − previous_window`, `null` when no previous window. Baselines 50/40/30/20 deleted. |
| A5 completion ramp | per-day buckets from `content_progress.completed_at`; empty ⇒ `null`, chart shows gaps. |
| A6 flat trend | forward-fill deleted; `last_known` starts as `None`. |
| A7 hardcoded integrity badges | badges render from `kpi.delta` + `kpi.direction` + `kpi.delta_available`; the four literals removed. |
| A8 invented student KPI defaults | `MetricSummaryCards` reads the payload and renders `—` when a key is absent; all defaults deleted. |
| A9 constant risk inputs | `consistency` and `submission_recency_days` computed by the metric layer; risk renormalises over available factors and reports `coverage`. |
| B1 integrity 96/60/70 | one `integrity_score` definition in the metric layer, floors removed, and the three surfaces read it. |
| B2 attendance 81.8 vs 91 | one weights table (`present 1, late .8, partial .6`); partial is no longer silently "present". Student, instructor and institution all report 87% from the same 11 records *(value changes, definitions match)*. |
| B3 review 0 vs queue 1 | "Review recommended" counts **all** rows with any signal (`needs_review` + `under_review`). |
| B4 100% submitted vs 0 executions | separate metrics: `completion` (submitted/assigned) and `attempts_logged` (code_attempts); when attempts are 0 the attempts KPI shows `—` with "no code runs recorded", not `0.0`. |
| C1 `M ` crash | new shared `<Sparkline>` with null/1-point guard; all 9 duplicate path builders replaced. |
| C2 single-point trend | bar `maxWidth` + "1 day of data" state. |
| C3 zero-height bar | series always emitted for every group (0 only when a real 0). |
| C4 missing delta chip | `DeltaPill` renders for every KPI, showing `—` when unavailable. |
| D1 n=1 artefacts | `percentile` null when cohort < 5 → UI prints "only student in cohort"; zero-denominator fractions print `—`; pluralisation via `pluralize()`. |
| E1–E9 copy | delta policy, `+-20%` sign fix, "1 students", inverted red ↑, section labels, benchmark section count. |

---

## 6. Performance

| Problem today | Fix |
|---|---|
| Each tab recomputes 6–12 aggregate queries; `overview` + `cohort-matrix` compute the same averages twice | L3 response cache (60 s) keyed by `endpoint:scope:window`, flushed by dirty marks |
| `/student/rankings` reads a stale table while `/analytics/rankings/scope` recomputes the whole cohort on every load (with a 300 s cache that is never invalidated) | cohort score cached in L2, invalidated on write; read path is a single indexed `SELECT` |
| N+1 per student in cohort loops | already batched in `batch_student_atomic_metrics`; remaining loops converted to bulk `IN (...)` queries |
| Missing indexes on hot filters | add `grades(student_id, created_at)`, `session_attendances(student_id, session_id)`, `proctor_events(institution_id, recorded_at)`, `code_attempts(student_id, submitted_at)`, `student_metric_snapshots(institution_id, snapshot_date)` |
| Trends recompute 30 days of history on every load | served from L1 snapshots |

**Targets:** every analytics endpoint < 250 ms warm on the seeded DB; no endpoint issues more than ~8 queries.

---

## 7. Rollout order (this round)

1. Metric layer: nulls instead of priors, scope filter, availability flags. *(backend)*
2. Risk + ranking: single engine, renormalised, persisted write-through. *(backend)*
3. Fabrication removals: funnel deltas, completion ramp, student sparkline/trend fills, instructor floors and constants. *(backend)*
4. Freshness module + cache + write hooks + indexes. *(backend)*
5. Frontend: shared `Sparkline` / `DeltaPill` / `EmptyValue`; delete all fallbacks; n=1 and copy fixes; chart polish. *(frontend, UI unchanged visually)*
6. Re-run the 25-screen harness, diff every number against SQL, and record before/after in the round-9 report.

---

## 8. As built (round 10) — what actually ships

### 8.1 Persist vs compute, as implemented

| Layer | Status | Detail |
|---|---|---|
| L0 raw | unchanged | grades / attendance / attempts / focus / mastery / hints are never duplicated |
| **L1 daily snapshot** | **live** | `app/analytics/snapshots.py` → `student_metric_snapshots` + `institution_daily_kpis`. `POST /api/institution/analytics/snapshots/run` writes today (0.02 s), `?backfill=true&days=N` fills history. Scheduled daily by `app/jobs.py`. **New rule:** an unmeasured average is stored as `NULL`, never `0.0` / `50.0` — a stored prior would become fake “history” for every trend read afterwards. |
| **L2 score cache** | **live** | `student_rankings` written write-through by `compute_section_subject_ranks(persist=True)`; `to_dict()` is now NULL-safe so a missing factor serialises as `null` instead of crashing the dashboard. |
| **L3 response cache** | **live** | `app/analytics/freshness.py` — 45–60 s HTTP cache for GET `/analytics` paths, invalidated by `bump(institution_id)` from write hooks. Measured: warm calls 2 ms. |

Deliberately **not** persisted: current-window counts, queues, availability flags, and anything a student can influence in the same second they look at it.

### 8.2 Single source of truth added this round

* `app/analytics/completion.py` → **`ATT_CREDIT_MAP`** (present 1.0 / late 0.8 / partial 0.6 / inactive_present 0.5 / absent 0.0). Imported by `analytics/metrics.py`, `instructor/analytics.py` and `institution/extended.py`; the three previously disagreed (one counted `late` as fully present, another excluded it).
* **Grade scope rule** (`Grade.experiment_id IS NOT NULL`) now applied on the student dashboard headline too, so `/student/dashboard`, `/student/analytics/academic-dashboard` and the instructor’s view of the same student agree.
* **Risk** — one engine (`app/analytics/risk.py`) for the student card, the instructor cohort and the institution overview. Unmeasured students are counted as `unmeasured_students`, excluded from `avg_risk_score`, and never banded.
* **Benchmarking** — `compute_z_score` returns `None` when the cohort has no dispersion, so a one-section institution reads “not benchmarkable” instead of `0.00σ`.

### 8.3 Rendering contract (frontend)

`Sparkline` needs ≥2 finite points, `DeltaPill` renders nothing without a numeric delta, `MetricValue` prints an em dash, `SectionDistributionDonut` shows “not benchmarkable yet” instead of a fabricated 27-section split, and every hand-rolled SVG path builder filters `null` before joining — a single null value used to produce `M 0,null C …` and throw inside the renderer.

### 8.4 Measured performance (seeded DB, warm cache)

| Endpoint | Cold | Warm |
|---|---|---|
| `student/analytics/overview` | 140 ms | 2 ms |
| `student/analytics/academic-dashboard` | 34 ms | 2 ms |
| `instructor/analytics/overview` | 28 ms | 2 ms |
| `instructor/analytics/cohort-matrix` | 21 ms | 2 ms |
| `institution/analytics/overview` | 19 ms | 2 ms |
| `institution/analytics/benchmark` | 21 ms | 2 ms |
| `institution/analytics/instructors` | 11 ms | 2 ms |

Page-level (production build, Playwright): instructor analytics 1.7 s, institution overview 1.6 s, student analytics 1.5 s **including a 1.2 s artificial settle wait** — i.e. ≈0.3–0.5 s of real render.
