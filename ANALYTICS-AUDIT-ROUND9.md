# Analytics Audit — Round 9

**Scope:** every analytics surface reachable by the three roles (instructor, student, institution admin) plus platform admin.
**Method:** logged in as each role in a real (headed→headless under Xvfb) Chromium, clicked every tab, captured screenshots, console errors, failed API calls and page text; then traced each suspicious number back through the API to the SQL rows and the Python/TS line that produced it.

**Coverage:** 25 screens — 9 instructor tabs, 3 student pages, 11 institution tabs, 1 platform page, plus API calls.
**Artifacts:** `ui-checks/analytics/` — 14 screenshots + `audit.json` (first walk), 11 institution screenshots + `platform-analytics.png` + `audit2.json` (second walk).

**Overall:** no failed API calls anywhere (0 × 4xx/5xx across all 25 screens). The plumbing is sound. The problem is **what the plumbing is asked to display**: there are ~15 places where a number, trend or benchmark is invented rather than measured, and ~8 places where two screens report different values for the same student in the same period.

---

## 1. Summary

| # | Finding | Severity | Where |
|---|---|---|---|
| A1 | Ranking score shown twice on one page with two different values (34.2 vs 38.31) | **High** | Student Leaderboard; Instructor Rankings |
| A2 | One student's grade average is 77% on 4 screens and 83% on 3 others (orphan grade row) | **High** | Instructor Overview/Students; Student Academic/Submissions; Institution |
| A3 | "Concept Mastery Rate 100%" is really a pass-rate in disguise; student mastery is 0% | **High** | Institution → Learning Outcomes |
| A4 | Funnel deltas computed against invented baselines (50/40/30/20) | **High** | Institution → Student Funnel |
| A5 | Curriculum-completion "trend" is a synthetic linear ramp | **High** | Institution → Learning Outcomes |
| A6 | 12-week performance trend is a flat line faked by forward-filling the current score | **High** | Student → Academic |
| A7 | Hardcoded delta badges (`↑3%`, `↑2`, `↓1`, `↓3`) that contradict the API | **High** | Instructor → Integrity |
| A8 | Whole KPI cards have invented fallbacks (72%, 142 problems, 18/26 concepts…) | **High** | Student → Overview cards |
| A9 | Risk score fed hardcoded constants (consistency 80, recency 2 days) | **Medium** | Backend risk model |
| B1 | Integrity: 96.0% / 60 / 70.0 — three formulas, one label | **Medium** | Instructor Integrity, roster, Institution |
| B2 | Attendance 81.8% vs 91% for the same 11 records | **Medium** | Student/Institution vs Instructor |
| B3 | "Review Recommended 0" above a queue listing 1 student under review | **Medium** | Instructor → Integrity |
| B4 | "100% submitted" beside "0 total executions logged" | **Medium** | Instructor → Experiments |
| C1 | Console crash `<path> d: "M "` ×5 (empty sparkline, no guard) | **Medium** | Instructor Overview ×4, Student Dashboard ×1 |
| C2 | Sessions-trend chart with one data point renders as a solid 140px purple block | **Low** | Platform Analytics |
| C3 | A 0-height bar in "Academic Performance vs Campus Mean" | **Low** | Institution Overview |
| D1 | "#1 of 1 students", "Top 1%", "100th percentile", all percentile bars pinned at 50 | **Low** | Student rankings, Instructor Students |
| E1–E9 | Copy/consistency confusion (see §7) | **Low** | various |

---

## 2. The two headline bugs, explained

### 2.1 One student, two ranking scores (A1)

`/student/rankings` renders its subject card from `GET /api/student/rankings` and its leaderboard/sticky bar from `GET /api/analytics/rankings/scope`. Those are two different engines reading two different stores:

| Component | Subject card (StudentRanking snapshot) | Leaderboard row (live engine) |
|---|---|---|
| Mastery | 0.0 | 0.0 |
| Engagement | 68.5 | 70.4 |
| Effort | 0.0 | 0.4 |
| Efficiency | 50.0 | 70.0 |
| Consistency | 86.4 | 91.0 |
| **Composite** | **34.2** | **38.31** |

The snapshot row was last written `2026-10-22T17:41` and is never recomputed. Note `Efficiency 50.0` — exactly the fabricated default in `app/analytics/ranking.py:118` (`… or 50.0`), i.e. the stored snapshot contains a placeholder value baked in at write time. The instructor **Rankings** tab reads the same stale table and shows **34 / 100**, so the instructor sees a different score for the student than the student sees for themselves.

**Fix:** one engine. Either recompute `StudentRanking` on read (or on every grading/attendance write) and have the student card read the live scope endpoint too, or delete the snapshot path and serve both surfaces from `compute_rank_for_scope`.

### 2.2 One student, five grade averages (A2)

There is a stray `grades` row — `885b8d88-3c1e-4da2-b90a-ad2b3afd0097`, `student_id = Rahul`, **`experiment_id = NULL`**, `final_grade = 100`, created `2026-10-22 17:03`. Some queries join it to the section's experiments (and so drop it), others take every grade for the student (and so include it):

| Screen | Value | Source |
|---|---|---|
| Instructor → Overview / Trends ("Class Avg Grade", "Average Final Score") | **77%** | `analytics.py:210` filters `Grade.experiment_id.in_(my_exp_ids)` → 3 grades |
| Instructor → Students ("Avg Grade") | **83 / 100** | `analytics.py:2116` only applies the section filter when an experiment is selected → 4 grades (82.75) |
| Student → Academic ("Overall Academic Score") | **83%** | `academic_dashboard_builder.py:148` → 4 grades |
| Student → Submissions ("Average Grade") | **77%** | 3 experiments with a real experiment_id |
| Institution → Overview ("Avg. Academic Score") | **82.8 / 100** | `routes.py:4235` no experiment filter → 4 grades |

The student therefore sees 83% on the *Analytics* page and 77% on the *Submissions* page for the same three graded labs, and the 100 that produces the difference is invisible on every screen. The orphan row's title also surfaces as the literal string **"Exp 4"** in the student trends API.

**Fix (needs your call, two parts):**
1. Data: decide whether that row is legitimate. If a grade can legitimately exist without an experiment (exam/ad-hoc grading), then every analytics query must *include* it consistently; if it cannot, add a NOT NULL / cleanup and delete this row.
2. Code: make all five surfaces use one shared "grades for this student in this scope" helper so the filter can't drift again.

I can also just delete the orphan row — but that hides the divergence rather than fixing it, so I'd rather fix both.

---

## 3. Invented numbers (violates the "real data only" rule)

These are places where, with no data, the code **manufactures** a plausible-looking series instead of showing an empty state. All confirmed by reading the value the API actually returns.

| # | What the user sees | Code |
|---|---|---|
| A4 | Funnel deltas **+50%, −60%, +70%, +-20%** | `app/analytics/funnel.py:441-465` — `delta = stage_pct − 50.0 / 40.0 / 30.0 / 20.0`. Those baselines are not previous-period data; they are literals. Correct output here is `0` / `—`. |
| A5 | "Curriculum Completion 0%" with a straight-line trend and `+85 pts` delta | `app/institution/routes.py:4290` — `b_comp = completion_rate * ((idx+1)/7.0)` ramps 0→100 across the 7 sparkline buckets by construction. |
| A6 | Student "Academic Performance Trend" — flat line at 83% across W1–W12 | `academic_dashboard_builder.py:266-272` — `last_known` is seeded with the student's *current* average *before* iterating, so every empty week repeats today's number. Should be `None` (gap) until the first real bucket. |
| A7 | Integrity KPI badges `↑ 3%`, `↑ 2`, `↓ 1`, `↓ 3` | `IntegrityTab.tsx:276,315,354,393` — literal strings. The API already returns `delta: "0%"` and `direction: "flat"` for exactly this reason (backend comment: *"No synthetic history: deltas are 0/neutral until real trend data exists"*) and the frontend throws that away. |
| A8 | KPI fallbacks: 72%, +12%, 18/26 concepts, 18/24 experiments, 75%, 142 problems, +28 | `components/student-analytics/MetricSummaryCards.tsx:24-45`. If any key is absent the student sees a *different* imaginary student's stats. |
| — | Rank sparkline `[rank_pos]*7`, attendance "mini bars" `[attendance_rate]*9` (the 9 identical green bars under Attendance) | `academic_dashboard_builder.py:240,446` |
| — | `overall_progress.sparkline = [val−10, val−5, val]`, `delta = f'{val}%'` | `app/student_analytics/overview_builder.py:417-421` — identical for every student by construction. This is also why "83%" is paired with a "0%" delta pill. |
| — | Hardcoded sparkline fallbacks `[62,65,68]`, `[74,76,78]`, `[1,2,2]` | `OverviewTab.tsx:396,421,448` |
| — | Hardcoded sparkline fallbacks `[88,89,90,92,91,93,94.2]`, `[2,3,3,4,3,4,5]`, `[4,4,3,3,2,3,2]`, `[18,16,17,15,14,13,12]` | `IntegrityTab.tsx:286,325,364,403` |
| — | Empty-cohort defaults **76 / 72 / 89 / 76 / 96** | `app/instructor/analytics.py:2279-2283` (`… if raw_list else 72`) |
| — | Empty-cohort default **70.0** campus average | `app/institution/routes.py:4237` |
| — | Focus / effort / efficiency / consistency default to **50.0** | `app/analytics/ranking.py:110-118` |
| A9 | Every student's risk score includes a fixed `consistency: 80.0` and `submission_recency_days: 2.0` | `app/instructor/analytics.py:2173-2176` — two of the five risk inputs are constants, so the score is partly fabricated. |

**Integrity floors worth knowing about** (not fake data, but they hide real data):

- `app/instructor/analytics.py:2263` → `integrity_confidence = max(60, 100 − violations×8)` — cannot fall below 60.
- `app/instructor/analytics.py:2283` → `mean_integrity = max(70, 100 − mean_violations×5)` — this floor is exactly why the campus shows **70.0 / 100** while the same student has 10 proctor events (7 high).

With 10 events the honest number would be ~50 (or simply "see the 10 events").

---

## 4. Numbers that disagree with each other

| # | Contradiction | Evidence |
|---|---|---|
| A2 | Grade average 77% vs 83% vs 82.8 vs 77% | §2.2 |
| A1 | Composite 34.2 vs 38.31 | §2.1 |
| A3 | **Mastery**: student 0, instructor "Cohort Avg Mastery 0%", institution "Concept Mastery Rate **100%**" | `concept_mastery` table has **0 rows**. `routes.py:4257-4262`: when the table is empty it silently substitutes *"% of grades ≥ 60"* — a pass rate — and labels it concept mastery. |
| B2 | **Attendance**: 81.8% (student, institution) vs 91% (instructor) | DB: `present 9, absent 1, partial 1` (11 records). Student/institution → 9/11 = 81.8%. Instructor → `analytics.py:2160` counts `partial` as present → 10/11 = 90.9%. One definition must win; `partial` should be labelled. |
| B1 | **Integrity**: 96.0% (Integrity tab) vs 60 (same student in roster) vs 70.0/100 (institution) | Three unrelated formulas: mean review-queue confidence; `max(60, 100−8×violations)`; `max(70, 100−5×mean_violations)`. |
| B3 | "Review Recommended **0**" directly above a queue showing **1** student "Under review" / "All (1)" | Counts only `review_status_type == 'needs_review'`; the row is `under_review`. |
| B4 | "Completion Rate **100%** — 1 of 1 students submitted" beside "Avg Attempts to Pass **0.0** — 0 total executions logged" | `code_attempts` has **0 rows** while 3 grades exist. Honest individually, absurd together. |
| — | Student "Best test run: —" next to grades 67 / 84 / 80 | No `CodeAttempt` rows; should read "No code runs recorded" rather than an em dash that looks like a loading failure. |
| — | Instructor Overview "Focus Engagement 59%", Student "Focus 59%" ✅ (these agree — 21 `focus_scores` rows) | Good example of correct wiring. |

---

## 5. Broken rendering

1. **C1 — malformed SVG path, 5×.** `<path> attribute d: Unexpected end of attribute. Expected number, "M "`. Cause: a sparkline array is `[]`, so `` `M ${[].join(' L ')}` `` emits a bare `M `. Four of them are the four Overview KPI cards (`OverviewTab.tsx:93` `KpiSparkline` has no guard, and the API returns `sparkline: []` for all four); the fifth is on the **student dashboard**. Every other sparkline in the codebase guards (`if (!points || points.length < 2) return null`) — this one doesn't. Fix = one shared `<Sparkline>` component with the guard, used everywhere, which also removes the 9 duplicate path builders.
2. **C2 — Sessions Trend (Platform Analytics).** With a single day of data, `app/admin/analytics/page.tsx:128-138` renders one bar with `flex: 1` → a solid purple rectangle filling the whole 140px card, and both axis labels read `2026-10-22`. Needs `maxWidth` on the bar plus a "1 day of data" state.
3. **C3 — Institution Overview, "Academic Performance vs Campus Mean".** Section B's campus-mean bar renders at height 0 while its label reads 83. A missing series value for a group that has section data.
4. **C4 — Institution → Attendance Matrix**: "Average Attendance 81.8%" has no ↑/↓ chip while "Present Records" and "Absent Records" do — inconsistent card anatomy.

---

## 6. Degenerate but technically true (n = 1 cohort)

Only one student is seeded, and several surfaces report the arithmetic consequence as if it were an achievement:

- **"#1 of 1 students"**, **"Top 1% in Cohort"**, **"100th percentile"**, **"Top 100%"** — and on the *same card*, "Top 1%" (badge) next to "Top 100%" (Active in Leaderboard).
- Percentile bars in the Student-360 radar are **all pinned at exactly 50** (`analytics.py:2232-2234`: percentile of a single sample = 50), so the student looks uniformly "average" on every dimension.
- **"Mastered Concepts 0 / 0"** — a zero-denominator fraction.
- Institution funnel: "Started 1 · 100% of enrolled … Achieved Mastery 0 · 0% of enrolled".

None of this is wrong arithmetic; all of it is misleading presentation. With one student, rank/percentile should be suppressed with "Only student in this cohort", and zero-denominator fractions should read "—".

---

## 7. Confusing copy (reported, not necessarily changed)

1. **Movement indicators with no movement**: `↑ 0.0%`, `— 0%`, `↑ 3%` litter the institution tabs and instructor Students tab. Deltas need a real previous period or nothing at all.
2. **Institution "Session Completion ↑ 66.7%"** with the subtext "0.0% in previous period" — growth measured against zero.
3. **`+-20%`** — the funnel renders a hardcoded `+`/`-` prefix *around* an already-signed delta (`StudentFunnelTab.tsx:442` + `funnel.py:465`).
4. Instructor Overview cards show `—` for deltas while every other tab shows `0%` — inconsistent policy for "no data".
5. "1 students" pluralisation in institution cards ("Across 1 students · 2 sessions").
6. **Integrity "Review Recommended" uses a red ↑ arrow** for a metric where up is bad.
7. "Campus Integrity Index 70.0 / 100 · Lower is better" vs instructor "Integrity Confidence 96%" — two opposite-facing integrity numbers in one product.
8. Section names in the institution chart render as bare `A` / `B` while the benchmark table renders `COMP - A` (`routes.py:3598` truncates the department to 4 chars). Also "COMP - A" reads like a typo for "CSE".
9. Institution benchmark says "Total Sections 1" but the Overview chart plots two sections (A and B) for the same single student — sections vs section-subjects are conflated.

---

## 8. What is genuinely real (don't touch)

Worth recording so a cleanup pass doesn't over-correct:

- **Proctoring/integrity event counts**: instructor shows "Proctor Events 10", "2 sessions", 7 high / 2 medium / 1 low — matches `proctor_events` exactly. The review queue, evidence mix and violation timeline are all derived from those rows.
- **Focus**: 59% instructor, 59.1 institution, 59 student, 21 `focus_scores` rows — consistent and real.
- **AI usage**: all zeros with "No usage in selected period" / "No AI calls recorded yet" — correct, honest empty states.
- **Attendance record counts** (9 present / 1 absent / 11 scheduled) — real; only the percentage *definition* differs (B2).
- **Platform Analytics totals**: 4 users, 12 sessions, 1 active institution, 0 AI calls — all match the DB.
- **No failed API calls** across 25 screens.
- Institution **AI & Telemetry**, **Instructors**, **Risk Early Warning** tabs are computed from real rows (risk uses the constant-contaminated model above, but the inputs otherwise exist).

---

## 9. One correction to the previous round's notes

The earlier observation that "`/admin/analytics` redirects an institution admin to `/institution/dashboard`" is **not a defect** — an institution admin has no platform route, and its own analytics lives at `/institution/analytics?tab=…` (all 11 tabs load fine). I re-ran platform analytics as `superadmin@nexlab.io` and it loads at `/admin/analytics`. That item should be closed as "wrong account for the surface", not as a bug.

---

## 10. Suggested fix order (on your go-ahead)

1. **Stop the fabrication** (low risk, high value): delete every hardcoded delta badge, sparkline fallback, KPI fallback and the funnel/ramp/forward-fill generators; return `null`/empty and let the UI render empty states. ~10 files, mostly deletions.
2. **One shared `Sparkline` component** with the empty guard → clears all 5 console crashes and removes 9 duplicate implementations.
3. **One grade-scope helper** + decide the orphan `experiment_id = NULL` row → makes 77/83/82.8 converge.
4. **One ranking engine** (retire the stale `student_rankings` snapshot or recompute it on write) → makes 34.2/38.31 converge.
5. **Make mastery mean mastery** (drop the pass-rate substitution in institution outcomes), and label pass rate as pass rate.
6. **Integrity**: one formula, remove the `max(60,…)`/`max(70,…)` floors, and reconcile "Review Recommended" with the queue.
7. **Attendance**: pick one definition of `partial` and apply it in student, instructor and institution.
8. **Risk model**: replace the constant `consistency`/`recency` inputs with real ones (or mark those factors "not measured" and remove them from the score).
9. **n=1 presentation**: suppress rank/percentile, fix zero-denominator fractions and plurals.
10. **Chart polish**: single-point series (C2), missing campus-mean bar (C3), delta chips consistency (C4).

I have not changed any code yet — this is the report you asked for. Tell me which of items 1–10 to proceed with (I'd suggest 1→2→3 first, since they cover the whole "dummy/static data" class you're worried about) and I'll implement + re-run the same 25-screen harness to prove each number changed.
