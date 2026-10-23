# Class Management & Student 360 — Data Correctness Audit

Every number below was read from the running API (Flask on `:5000`) and then compared
against the same value computed in raw SQL (`psql` → `virtuallab` on `:5433`).
Reusable script: `/tmp/verify_data.py` and `/tmp/verify_fixes.py`.

Dataset: 1 institution (SKIT), 1 department (CSE), 1 section_subject (CS301 / Section A),
9 students, 3 experiments, 27 grades, 3 lab sessions, 3 attendance rows (all one student).

---

## 1. Landing grid — VERDICT: correct

`GET /api/instructor/section-subjects`

| Field | API | SQL | |
|---|---|---|---|
| student count | 9 | `section_students` = 9 | ✅ |
| experiment count | 3 | `experiments` for CS301 = 3 | ✅ |
| department / year | CSE / 2026-2027 | batch + dept rows | ✅ |

Cards are computed from the DB, not hardcoded. The screenshot in `uploads/image-1.png`
("CS102 · GEN · 2024-2025 · 123 Students") comes from a **different dataset** than this
environment and cannot be reproduced here — nothing in this DB produces those numbers.

## 2. Class roster — VERDICT: correct

`GET /api/instructor/analytics/cohort-matrix`, all 9 students vs SQL:

- `grade_avg` == `avg(final_grade)` for all 9 (37.1 / 46.7 / 59.1 / 69.5 / 78.2 / 82.1 / 84.4 / 88.4 / 94.1) — **0 mismatches**
- `completion.completed` == number of graded rows == 3 for everyone ✅
- risk bands: Kabir 37 high, Siya 47 high, Rohan 59 watch, rest `ok` → 2 high-or-critical ✅
- attendance is `null` for 8 of 9 students, and that is the honest value: there are only
  3 `session_attendance` rows in the whole database, all belonging to Rahul.

## 3. Student 360 (Rahul Sharma) — VERDICT: correct, and now honest

| Block | API | SQL | |
|---|---|---|---|
| grades | 82.1 over 3 | `avg(final_grade)` 82.10 over 3 | ✅ |
| completion | 3 / 3 = 100% | 3 graded of 3 assigned | ✅ |
| attendance | present 2, late 1, absent 1 → 60.0% | 3 rows, same statuses | ✅ |
| forecast | 91.6 projected, CI [76.6, 100], slope 1.91 | 3-point regression | ✅ |
| risk | 27.9, band `ok`, coverage 0.55, factors_used [attendance, grade] | — | ✅ |
| mastery | `null`, 0 concepts, `is_sufficient: false` | `concept_mastery` = 0 rows | ✅ (after fix) |
| integrity | `null`, band `no_data` | no proctor events, no attempts, no flags | ✅ (after fix) |

---

## 4. What was wrong, and what changed

| # | Finding | Fix |
|---|---|---|
| 1 | **Authority leak (security).** Any instructor could read *any* student in the tenant by id — `_enforce_self_scope` only blocked role `student`, and `User.query.get` had no tenant filter. Verified by creating a student in Section B (a class Anitha does not teach) and reading `overview`/`forecast`/`integrity` → all **200**. | `_enforce_self_scope` now 404s a student from another institution and 403s a student not enrolled in any section the caller teaches (`instructor_id`/`co_instructor_id`). Same check applied to `POST /api/analytics/interventions`. Probed again → **403** on all three. |
| 2 | **Mastery rendered as 0%.** With zero `concept_mastery` rows, `scope_avg` was `0.0` and the drawer printed "0%" — a fake number, exactly the class of thing the no-dummy-numbers rule forbids. | `scope_avg` is `None` when `sample_size == 0`. Drawer prints `—`. |
| 3 | **Integrity was a green 100% by default.** No events and no attempts produced `100.0 / trustworthy` — absence of evidence shown as evidence of innocence. | `integrity_confidence` is `None` with band `no_data` when there are no events, attempts or flags; `review_recommended` is false. Drawer prints `—` in grey. |
| 4 | **Effort scored 0 for unmeasured time.** Attendance rows with `seconds = 0` summed to 0 hours → `effort 0.0`, which dragged every rank score down (Rahul's composite was 46.35 on 3 of 5 factors). | `effort_hours` is `None` when the measured total is 0. Composite renormalises over available factors → Rahul now 72.84, with `effort: null` instead of a false zero, matching `efficiency: null`. |
| 5 | **Cohort attendance "60%" was one student's rate.** A mean over available values is mathematically fine but was labelled as a class figure when only 1 of 9 students had any attendance row. | KPIs now carry `coverage: {sample_size, cohort_size, is_representative}`. The card subtitle reads "Only 1 of 9 students graded" / "Mean of 9 graded students" instead of a generic claim. |
| 6 | **Two intervention vocabularies.** The Student 360 drawer posts `1_on_1_review`, `counseling`, `practice_assignment`; `POST /api/analytics/interventions` stored them unvalidated while `POST /api/instructor/interventions` rejected them with **400** — same table, and rows the class tab could not name. | One `VALID_ACTIONS` list covering both surfaces, enforced on both POSTs. Unknown values → 400 on either endpoint. |
| 7 | **Drawer follow-up date silently dropped.** The drawer sends `target_date`; the API only read `follow_up_at`, so the picked date never persisted and the follow-up reminder never fired. | `follow_up_at` falls back to `target_date`. Verified: drawer POST now returns a row listing `follow_up_at: 2026-11-05`. |
| 8 | **KPI subtitles asserted things the data did not support** — "Weighted across completed labs" (it is an unweighted mean of student averages), "Mastery ≥ 80% or average ≥ 85%" (mastery does not exist). | Copy now states the real denominator and the real rule. |

## 5. Confusing, but not wrong — left as-is by design

- **Ranks are identical at every scope** (9 / 9, percentile 5.6, score 72.84 at section,
  department, institution and platform). That is arithmetically true: this institution
  contains exactly one section. It is uninformative, not incorrect — the UI already shows
  `cohort_size`, so the pill reads "9 of 9". Real seeds with more sections will diverge.
- **Risk coverage 0.55.** With no submissions and no mastery the risk score is effectively a
  grade + attendance blend. The API says so via `factors_missing: [focus, mastery, recency]`;
  the drawer's marketing copy ("derived from real-time mastery deficits, recent grade
  downward slope…") overstates it and is worth rewriting when the drawer is next touched.
- **`primary_component: null` with `primary_reason: "On track"`** — correct for a student with
  no dominant risk driver, but the pairing reads oddly in the UI.

## 6. Test data created during the audit

All removed. `scope.probe@skit.edu.in` (id `b959f71a…`), its Section B enrolment, and the
5 interventions written while testing the vocabulary have been deleted. Database is back to
13 users → 12 after cleanup, 9 enrolments, 0 interventions.
