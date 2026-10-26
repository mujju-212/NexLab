# Instructor Workflow Audit — What Works, What Was Broken, What I Fixed

**Date:** 2026-10-22
**Scope:** the real-world instructor loop, exercised against the live app (Flask :5000 + Next.js :3000, PostgreSQL :5433), not by reading code.
**Tenant:** SKIT (hand-built, no seed data) — instructor *Anitha Rao*, student *Rahul Sharma*, subject CS301 *Data Structures and Algorithms*.

---

## 1. The workflow as tested

| # | Step | Result |
|---|------|--------|
| 1 | Instructor creates an experiment (rubric, weightage, test cases) | **Works** |
| 2 | Instructor adds pre-lab content (text / quiz modules) | **Works** (with a caveat, fixed) |
| 3 | Instructor publishes the experiment | **Works** |
| 4 | Instructor schedules a live session with a time window | **Works** |
| 5 | Instructor starts the session; student joins | **Works**, now time-boxed |
| 6 | Instructor creates a standalone timed exam + questions | **Works** |
| 7 | Instructor publishes the exam | **Works**, now guarded |
| 8 | Student starts the timed exam → clock starts | **Works** |
| 9 | Student saves/submits within the window | **Works** |
| 10 | Student is locked out after the window | **Works** (was broken) |
| 11 | Result is graded | **Works** |
| 12 | Result persists to the DB | **Works** (was broken — see Bug 1) |
| 13 | Instructor can see the student's answers and marks | **Works** (was broken — see Bugs 2, 4) |
| 14 | Marks roll up: experiment → subject | **Works** (was broken — see Bug 3) |
| 15 | Instructor manually grades a lab | **Works** |

---

## 2. Bugs found and fixed

### Bug 1 — Exam results were never written to the grade table *(critical)*
The student scored 100% and the attempt was recorded, but the `grades` table stayed empty and the student's gradebook showed 0. The cause was structural, not cosmetic:

- `Grade.experiment_id` was `NOT NULL` with a foreign key to `experiments`.
- A standalone `Exam` has no `Experiment` row, so the insert always failed.
- The failure was hidden by a bare `except Exception: pass` in `_finalize_attempt`.

**Fix**
- Added `Grade.exam_id` (nullable) and made `experiment_id` nullable, so a grade belongs to *either* a lab experiment *or* an exam.
- Rewrote the sync in `_finalize_attempt` to upsert on `(student, experiment)` or `(student, exam)`, and **removed the silent `except`**.
- Grade is kept as the best result across attempts (a worse retake can't overwrite a better score).
- Index `ix_grades_student_exam` added; verified **no schema drift** anywhere (scripted check over every model).

### Bug 2 — Instructor could not see student answers *(your explicit question)*
`GET /instructor/exams/{id}/attempts` returned only score/passed/timestamps. There was **no endpoint anywhere** that exposed per-question responses to the instructor.

**Fix**
- The attempts payload now includes a hydrated `answers[]` per attempt: question text, options, the student's answer (as text, not a raw index), the correct answer, correctness, and points earned.
- `correct_answer` is stored as a letter (`"A"`) but was being sent raw; normalised so the UI reads "O(log n)", not "0".
- Added an expandable **Answers** column to the exam Results tab so the instructor can read each response inline.

### Bug 3 — Student marks ignored standalone exams *(roll-up was wrong)*
`GET /student/grades` returned 0 rows and the student's subject summary showed `earned_score 0.0`, with the exam **entirely absent from the item list** — while the instructor's view of the same subject showed the exam worth 25 marks. Two separate code paths, only one of them aware of exams.

**Fix** — the student subject summary now includes exams as first-class items, weighted `grade_weight × subject.total_marks` (0.25 → 25 marks), matching the instructor formula. Both views now agree.

### Bug 4 — Answers could be changed after the clock ran out
`POST .../save` accepted answers after `expires_at`. Submit correctly finalised as `expired`, but the save path had no expiry check.

**Fix** — save now returns **403** with `expired: true` once `expires_at + grace` has passed. The exam-taking UI surfaces the message instead of silently discarding edits.

### Bug 5 — Resume bypassed a closed exam window
Starting an exam with a live attempt returned it even when the instructor had closed the exam (`due_at` in the past).

**Fix** — window state is evaluated *before* the resume branch; a closed exam finalises the live attempt and returns 403.

### Bug 6 — A live session handed out room access after it ended
`check-gate` returned `can_join_live: true` for a session that finished four hours earlier — it only checked `status == 'active'`, never the clock.

**Fix** — access requires the session to be active **and** inside `[scheduled_at, scheduled_at + duration]`. The response now carries `window_state` (`open` / `upcoming` / `closed`), the window bounds, server time, and a human message ("This session has ended — live access is closed."). Verified both directions.

### Bug 7 — Exams could be published with zero questions
A blank paper could be published, guaranteeing every student a 0.

**Fix** — publishing transitions now require ≥ 1 question (400 with a clear message). Unpublish/other edits unaffected.

### Bug 8 — Quiz questions were dropped silently
A quiz module accepted any payload and returned **201**, while quietly storing `question_count: 0` because the parser only accepted exactly 4 options.

**Fix** — the parser now accepts 2–6 options and any letter/index answer form, and **reports what it rejected** (`rejected_questions` + a `warning` string) instead of losing data quietly.

### Bug 9 — `finalize-grades` invented zeros
Students who never submitted were written a real `0.0` grade — recording a failing mark for absence.

**Fix** — grading only writes when there is evidence (code run, quiz, viva, or a manual grade). Students with nothing are returned in a separate `ungraded` list, never scored 0. The write is lazy: no blank grade rows.

### Bug 10 — A viewed grade could never be corrected
Any re-grade returned `409 Grade is locked (student has viewed it)`. Combined with Bug 11 this made a mis-graded student permanently stuck.

**Fix** — the lock still blocks silent drift, but an explicit `force: true` allows a correction (reported back as `was_overridden`). Invalid payloads now return 400, not 500.

### Bug 11 — Instructor submissions page crashed
`GET /instructor/submissions/{experiment_id}` threw `AttributeError: 'TestCase' object has no attribute 'points'` (the column is `points_weight`) → **500**. The page sweep never caught it because the Next.js page renders its shell regardless.

**Fix** — corrected the attribute. The endpoint now returns submissions + the real rubric.

### Bug 12 — Two experiments could share a number
`exp_number` had no uniqueness check, so a subject could contain two "#4" labs and the student grade sheet listed both ambiguously.

**Fix** — duplicate `exp_number` within a subject now returns **409**.

### Smaller fixes
- Rubric was stored but **never exposed** by `Experiment.to_dict()` — the instructor couldn't see the weights they had set. Now returned.
- Scheduling a session without `section_subject_id` returned a misleading `404`; now a `400` naming the missing field.
- Instructor grade summary gained `published_total_weightage` so its planning number reconciles with what students can actually earn.
- Student subject rows keyed on `experiment_id` (null for exams) → fixed, and the `#N` prefix no longer prints for exams.

---

## 3. What still doesn't work, and why

**1. Lab code execution is disabled in this deployment.**
`DOCKER_RUNNER_ENABLED=false` (by your no-Docker constraint), so `/execution/run` returns **503** and students cannot run or submit code. Consequence: the automatic test-case component of a lab grade can never populate here. Manual grading works fully; automatic grading needs Docker. This is a deployment limit, not a code defect.

**2. Automatic lab grading has never been exercised end-to-end.**
Because of (1), `auto_grade` stayed `null` in every lab test. I verified the *manual* path (instructor enters 75 → weighted contribution 15.0 → appears in the student subject grade). The test-case → `auto_grade` path remains unproven at runtime.

**3. Exam Results tab lists every attempt separately.**
After retakes, one student produces many rows (my testing produced 9). An instructor would rather see one row per student with the best score, expandable to attempts. I left the data as-is (it's truthful) but this is a **usability** problem, not a correctness one.

**4. Lab experiments don't appear in "My Exams", and exams don't appear in "My Subjects" list.**
The two lists are separate surfaces. A student sees the graded exam inside the *Grade Breakdown* dialog (correctly, worth +25 pts), but the subject's "Assessments & Labs" list only shows experiments. An instructor assigning an exam may reasonably expect students to see it alongside labs.

**5. Weightage numbers differ between roles by design.**
The instructor's `total_weightage` (32.0) counts unpublished items for planning; the student's (29.0) counts only published. I added `published_total_weightage` (29.0) to the instructor payload so the two can be reconciled, but the headline numbers still differ.

**6. A lab grade is a single number, not a rubric breakdown.**
`POST /instructor/grades` takes one `manual_grade` (0–100) and maps it to the `lab_report` component only. There is no way to enter the five rubric components separately, so a 75 entered by the instructor contributes 75 × 20% = 15, not 75% of the total. This surprised me and will surprise instructors; the rubric breakdown exists in the model but not in the API.

---

## 4. Evidence (live data)

```
grades table
  lab  #1 Implement Binary Search   final 17.6   (manual 88 × 20%)
  lab  #4 Insertion Sort Lab        final 15.0   (manual 75 × 20%)
  exam CS301 Quiz 1: Searching      final 100.0  (5/5 correct, auto)

student subject rollup   earned 25.48 / 29.0 weightage
  #1 lab   17.6/100  → +0.18
  #2 lab   pending
  #4 lab   15.0/100  → +0.30
  exam     100/100   → +25.00

instructor subject score 25.48  (agrees with student)
```

**Key IDs**
- Experiment #4 (created in this audit): `b49f6b29-f1e5-4c23-a9d2-67e7f4316963`, weightage 2, rubric 60/20/10/10/0
- Standalone exam: `dabf52c5-fbcf-4d25-9e7b-fc0c5c20f309`, 20 min, `max_attempts` 5+, grade_weight 0.25
- Session (time-window test): `394d7f3b-0543-4454-a4c1-f0b8515c4884`

**Screenshots** (`ui-checks/`)
- `instructor-exam-results.png` — instructor reading per-question answers
- `student-grade-breakdown.png` — student seeing the exam as a first-class mark

**Regression status:** `page_sweep.py` **51/51 pages 200**; `tsc --noEmit` clean; no schema drift across all models.

---

## 5. Files changed

Backend
- `app/models/grading.py` — `Grade.exam_id`, nullable `experiment_id`, index, `to_dict`
- `app/models/experiment.py` — rubric exposed in `to_dict`
- `app/student/exams.py` — grade upsert rewrite (no silent except), save expiry guard, resume window guard
- `app/student/routes.py` — `check_gate` time window, subject grade summary includes exams, `_iso_z`
- `app/instructor/exams.py` — answers in attempts payload, publish guard, duplicate guard
- `app/instructor/routes.py` — submissions 500 fix, grade force/validation, duplicate `exp_number`, `published_total_weightage`, session 400
- `app/instructor/content.py` — quiz option parsing + rejection reporting
- `app/instructor/conductor.py` — finalize reports ungraded instead of scoring 0
- `app/services/grading_service.py` — no fabricated zeros, lazy row creation, input validation

Frontend
- `services/exam.service.ts` — answer row types
- `services/student.service.ts` — item type widened for exams
- `app/instructor/exams/[examId]/edit/page.tsx` — expandable Answers column
- `app/student/subjects/page.tsx` — exam rows, keys
- `app/student/exams/[examId]/take/page.tsx` — surfaces the 403 "time is up"

**Schema note:** the live DB was altered in place. A fresh `./setup.sh` builds the table from the models, so new installs get `exam_id` automatically — no extra migration step needed.

---

# Round 2 — 2026-10-22 (later)

## What "auto-graded" actually means here

Two different things wear that label, and they behave differently:

**1. Exams — truly automatic.** When the student submits, the server grades every question immediately:
MCQ answers are compared to `correct_answer`; coding questions are run against the question's test cases
in the sandbox, earning `points × (weighted cases passed / total weight)`. The percentage is written to
`ExamAttempt.score` and to `Grade.final_grade`. No instructor action needed. **This is verified working.**

**2. Lab experiments — only half automatic.** `auto_grade` is computed from the student's best *final*
`CodeAttempt`: `test_cases_passed / test_cases_total × 100`. There's also `code_quality_grade` from radon
complexity. The other rubric components are *not* automatic:
- `manual_grade` — typed by the instructor (this is what the grading screen sends),
- `quiz_grade` — from pre-lab quiz modules the student completed,
- `viva_grade` — from a viva session.
With Docker off, no `CodeAttempt` can ever be created, so `auto_grade` stays `null` and the instructor's
manual number is the only input.

## Fixed in this round

### Exam Results: one row per student
The API now also returns a `students[]` grouping alongside the raw `attempts[]` (backward compatible).
Each student shows: attempts used / allowed, **best score**, pass/fail, total violations, last activity.
Expanding a student lists every attempt; expanding an attempt shows the answers and any violations.
Verified: 9 attempts → 1 row with best 100%.

### Exams now appear in the subject, and are attendable from there
`GET /student/experiments/<subject>` merges published standalone exams into the same "Assessments & Labs"
list with `kind: 'exam'`, window state, attempts used/remaining, `can_attend`, and a link. The student page
already had exam-aware rendering (violet border, ⏱ TIMED EXAM badge, "View Result" vs "Take Exam") — it was
simply never fed any exams. Verified in the browser.

### Proctoring for timed exams (new)
Previously focus/lockdown monitoring existed **only** for live sessions, via Socket.io; the exam-taking page
had no monitoring at all.

- `Exam` gained `proctor_focus_enabled`, `proctor_lockdown_enabled`, `max_violations`.
- `proctor_events` gained `exam_id` / `attempt_id`; `session_id` is now nullable (an event belongs to a
  session **or** an attempt).
- `POST /student/exams/<exam>/attempt/<attempt>/violation` records one event with a severity, and
  auto-submits the attempt when `max_violations` is reached. Rejects with 400 when proctoring is off.
- The start/resume payload tells the client exactly what is being watched.
- The exam page watches `visibilitychange`, `blur`, `fullscreenchange`, and (in lockdown) `copy`/`paste`/
  `contextmenu`, shows a persistent proctored banner and a live `N / max` counter, and respects auto-submit.
- The instructor sees per-attempt violation counts and a timestamped list on the Results tab.

Verified: 3 violations → auto-submit; 2 violations on a graded attempt → instructor sees both, score intact.

### Weightage disagreement — what it was, and the fix
The instructor's `total_weightage` summed **every** experiment in the subject, including unpublished
drafts; the student's summed only published ones. Same subject, two different denominators (32 vs 29), so
"you have 25 of 29" for the student vs "25 of 32" for the instructor.

Now both use **published items only** — the denominator a student can actually earn. The instructor still
gets the planning number, renamed `planned_total_weightage`. Verified: instructor 29.0 == student 29.0.

### Bonus bug found while testing in a real browser
**Every timed exam auto-submitted the instant it was opened.** The countdown hook initialised its remaining
time to 0 and reported `expired: true` for one render — before `expires_at` had arrived from the server —
and the auto-submit effect fired on that first render. API tests could never catch this; it only appears
when the page actually mounts.

Fixed in `lib/countdown.ts`: the hook now only reports `expired` once it has measured a real target
(`ready` flag), and the effect requires `cd.ready`. Verified: the page now stays open with a live countdown.

---

# Round 3 — grading by rubric component, not one number

## The rule, as you described it, and how it is now enforced

A mark in this app is no longer "a number for the experiment". It is a **score against a component's
weight**:

| Concept | Where it is set | Meaning |
|---|---|---|
| **Component weight** | Experiment create/edit → *4. Grading & Rubric Weights* | How much of this experiment's 100 marks each component is worth. Must sum to 100. |
| **Component score** | Instructor grading screen, one input per component | That component's result, always 0–100. |
| **Contribution** | Computed, shown live next to the input | `score × weight ÷ 100` — the marks this component adds to the experiment. |
| **Weight = 0** | Setting a weight to 0 at creation | The component is **not calculated at all**: it is not sent, not stored, and its contribution is printed as `not used (0%)`. |
| **Weightage to the subject** | Experiment create/edit → `weightage` | How many of the subject's marks this experiment's 100 is worth. Independent of the rubric. |
| **Final experiment mark** | Computed server-side | `Σ (score × weight ÷ 100)` over the components that have a score. |

The five components are `test_cases`, `lab_report`, `code_quality`, `viva`, `quiz`. Three of them
(`test_cases`, `code_quality`, `quiz`) are pre-filled by the server when real data exists; `lab_report` and
`viva` are the instructor's judgement. Any of the five can be typed over by the instructor — the auto value
is a starting point, not a cage.

## What changed in the code

**Backend**

- `grades` already had a column per component (`auto_grade`, `manual_grade`, `code_quality_grade`,
  `viva_grade`, `quiz_grade`), so the storage was right; the *calculation* was not. `Grade.calculate_final`
  used to multiply `code_quality_grade` by 10 whenever it was ≤ 10 — a leftover from when that column held
  a 0–10 radon score. A genuine low code-quality mark (say 7) was silently turned into 70. Removed; all five
  components are now plain 0–100 and the weights do all the scaling.
- `POST /api/instructor/grades` accepts `components: {test_cases|lab_report|code_quality|viva|quiz: 0–100}`,
  validates each one (non-numeric or out-of-range → `400` with the offending component named), and writes
  each to its own column. Blank or omitted components keep their auto-computed value.
- The response now returns `grade.rubric` plus `grade.breakdown`, where each entry is
  `{weight, score, contribution, used}`. `used: false` is what the screen reads to print `not used (0%)`.

**Frontend** (`app/instructor/grading/page.tsx`)

- The workbench's single "manual grade" box and its "blended score" table are gone. In their place, one row
  per rubric component: name, weight badge, a 0–100 input, and the live contribution.
- A zero-weight component renders as `Pre-Lab Quiz — not used (0%)` with no input, and it is never sent.
- The **Final Score** line recomputes as you type and notes any hint deduction, so the instructor sees the
  same number the server will store.

## Proof it computes correctly

Experiment #2 configured as 50 / 20 / 10 / 10 / 10, graded with 90 / 80 / 70 / 60 / 100:

| Component | Weight | Score | Contribution |
|---|---|---|---|
| Automated test cases | 50 | 90 | 45.0 |
| Lab report | 20 | 80 | 16.0 |
| Code quality | 10 | 70 | 7.0 |
| Oral viva | 10 | 60 | 6.0 |
| Pre-lab quiz | 10 | 100 | 10.0 |
| **Final** | **100** | | **84.0** |

Then the same five marks with the rubric changed to 50 / 30 / **0** / 10 / 10:

| Component | Weight | Score | Contribution |
|---|---|---|---|
| Automated test cases | 50 | 90 | 45.0 |
| Lab report | 30 | 80 | 24.0 |
| Code quality | **0** | 70 | **0.0 — `used: false`** |
| Oral viva | 10 | 60 | 6.0 |
| Pre-lab quiz | 10 | 100 | 10.0 |
| **Final** | **100** | | **85.0** |

The 70 disappeared from the calculation entirely rather than being rescaled — exactly the "set it to 0 and
it is not calculated" behaviour you asked for.

In the browser, experiment #2's workbench opened with the five weights above and the five saved scores
already hydrated into the inputs (`90, 80, 70, 60, 100`), and experiment #1 (60/20/10/10/**0**) showed
`Pre-Lab Quiz — not used (0%)` with no input box. Screenshots: `ui-checks/instructor-rubric-components.png`,
`ui-checks/grading-page.png`.

The rubric is also stored at creation: creating an experiment with `40/30/20/10/0` and `weightage: 3`
returned those exact weights, so the "weightage to the subject marks" and the "component weights out of
100" are two separate, independently stored numbers.

## Bug 13 — a locked grade could not be corrected from the screen *(blocking)*

Once a student opens their grades page the grade is locked against silent changes (the server returns `409`
telling the instructor to re-send with `force`). But **both** buttons in the workbench — *Save Grade* and
*Save & Next Student* — posted without `force`, so the instructor was told "Grade is locked" and had no way
forward. A typo became permanent unless someone touched the API by hand. The server always supported the
override; the screen never offered it.

Fixed: the lock notice now comes with **"Correct this mark anyway"** → a confirmation explaining that the
student will see the replaced mark → **"Confirm override & save"**, which sends `force: true`. Verified in
the browser: lab report 88 → 95 on a locked grade returned `200`, the toast read *"Corrected the locked
grade for Rahul Sharma. The student sees the new mark."*, `final_grade` moved 17.6 → **19.0** (95 × 20%),
and the student's own `/student/grades` immediately showed **19.0**.
While a grade is locked the two ordinary Save buttons are now disabled (hover text: *"Locked — use 'Correct
this mark anyway'"*), so the instructor is never sent down a path that can only fail; opting into the
override re-enables them. Verified in the browser: disabled `True` → after clicking the override link,
disabled `False`.
Screenshots: `ui-checks/instructor-rubric-components.png`, `ui-checks/instructor-override-lock.png`,
`ui-checks/instructor-override-saved.png`.

## Small things noticed while grading

- `graded_at` is not refreshed when a grade is overridden, so the "graded on" timestamp still shows the
  first grading. There is no separate audit row for an override (`was_overridden` is returned but not
  stored), so after a correction the history of the change exists only in this app's request logs.
- The student's grade list reports `is_locked: true` for every grade the moment the grades page is loaded —
  the lock is triggered by *viewing*, including a passive page load, not by an explicit acknowledgement.
  With the override in place this is no longer a trap, but "opened the page" is a low bar for "has seen and
  accepted the mark".

## Where this leaves Task 2

An instructor can now: create an experiment and declare its component weights and its weightage to the
subject → create an assessment and grade it component by component → see the arithmetic before saving →
correct a mark the student has already seen → watch the result roll into the subject total (29.0 earned-of-
possible agreeing across both roles) and into the student's own view (19.0 / 85.0 / 15.0 / 100.0 with the
exam at 40%). Page sweep: **51/51 routes render**, no console errors on the grading screen.

## Known gaps after Round 3 (not fixed, deliberately listed)

1. **The student sees the mark, not the arithmetic.** `GET /api/student/grades` returns every component
   score, but the student UI only ever shows a raw score and a weighted score. A student who scored 95 on
   the lab report sees `19 / 100` and has no way to see that the report was worth 20% and the code tests
   (which never ran) were worth 60%. The instructor now sees the full table; the student sees the result.
   Adding the same breakdown to the student's rollup modal is the obvious next step — the data is already
   in the payload.
2. **No audit trail for an override.** `was_overridden` is returned to the caller and then forgotten;
   `graded_at` is not refreshed. A corrected grade is indistinguishable from an original one a week later.
3. **`is_locked` is triggered by page load.** Merely opening "My Grades" locks every grade against silent
   change. That is the *reason* the override button was needed; a stricter trigger (student clicks
   "acknowledge") would be more honest.
4. **Nothing can be auto-graded without Docker.** `auto_grade`, `code_quality_grade` and the test-case
   component stay empty on every lab, so three of the five rubric components are always the instructor's
   manual entry. The rubric math is proven (84.0 / 85.0 above) but only with hand-entered numbers.

---

# Round 4 — public access, and a fresh sandbox re-proves the flow

## The app is now reachable at a public URL

`https://fonts-dates-vpn-knowledgestorm.trycloudflare.com` (Cloudflare quick tunnel →
`cloudflared tunnel --url http://127.0.0.1:3000`). Only the frontend port is tunnelled:
Next.js already proxies `/api/*` and `/socket.io/*` to Flask, so the browser talks to a single
origin and there is no CORS, no second tunnel and no `localhost` anywere in the page. Login as
instructor and as student was driven through the tunnel in a real browser before it was handed
over; `ui-checks/tunnel-instructor-grading.png` and `ui-checks/tunnel-student-subjects.png` are
from that run. `./tunnel.sh` restarts it; the hostname changes each restart.

## The sandbox reset, and what that proved

The environment was recycled between rounds: Postgres (it lives in `/var/lib/postgresql`, outside
`/home/user`), the pip packages and `node_modules` were all gone, and the database was empty.
Rather than restore a dump, everything was rebuilt from zero through the application's own API —
which is a stronger test of "no seeded demo data" than the original build:

- `./setup.sh` → schema only (the seed flag was **not** passed).
- `python3 bootstrap_superadmin.py` → the one account that cannot be created over HTTP by design.
- `python3 walkthrough.py` → **34/34 PASS**: institution → academic year → department → batch →
  sections → subject → instructor → student, every password changed through the forced
  change-password flow, every role's dashboard read back.
- `python3 restore_demo_data.py` → 4 experiments with explicit rubric weights, 1 published timed
  exam with questions, and component-level grades.

Fresh numbers from this rebuild (independent of anything quoted earlier):

| Experiment | Component scores | Rubric | Final |
|---|---|---|---|
| #1 Binary Search | 80 / 88 / 75 / 70 / — | 60/20/10/10/**0** | **80.1** |
| #2 Linear vs Binary | 90 / 80 / 70 / 60 / 100 | 50/20/10/10/10 | **84.0** |
| #4 Insertion Sort | 65 / 72 / 80 / 55 / — | 60/20/10/10/**0** | **66.9** |

The zero-weight quiz comes back `used: false, contribution: 0.0` on #1 and #4 and is simply absent
from the arithmetic, while the same component at 10% on #2 contributes its full 10 marks. Subject
weightage: 1 + 1 + 1 + 2 + 25 = **30 pts** of 100, shown identically to instructor and student.

## Bug 14 — an exam could silently claim 100% of the subject *(found while restoring data)*

`grade_weight` is a **fraction of the subject total** (0–1). Creating an exam with
`"grade_weight": 25` — a perfectly natural way to write "worth 25 marks" — was clamped:

```python
grade_weight=max(0.0, min(1.0, float(data.get('grade_weight') or 0)))   # 25 -> 1.0
```

The exam then claimed **all 100 subject marks**, produced a yellow "Over-allocation Notice: Total
assessment weightage (105 pts) exceeds Subject Total Marks (100 pts)" banner that looked like a
*data* problem, and still published happily. The instructor's intent was lost with no error.

Now `_grade_weight()` rejects anything outside 0–1 on both create and edit:

```
400 {"error": "grade_weight must be between 0 and 1 - it is a fraction of the subject
total (0.25 means 25%); got 25.0."}
```

and `0.25` sets a real 25-mark weight. Verified in the API and re-checked in the browser: the
over-allocation banner is gone and the card reads **Allocated Weightage 30 pts** with the exam
column labelled **EXAM (25 PTS)** — the marks the instructor actually intended.

## Still confusing, from a real instructor's seat

- Two different numbers both called "weight": the *rubric* weight of a component **out of 100
  within one experiment**, and the experiment's *weightage to the subject*. They are stored
  separately and both work, but the exam form asks for percentages while the exam API stores
  fractions — the single most likely place for the mistake above to happen again.
- A lab with no code submission still shows `Test Cases (0/0)` and empty auto-computed components.
  Correct, but it reads as a broken screen rather than "nothing to score yet".

## Round 4b — the 530, and why the login screen lied about it

The public URL returned **HTTP 530** on `POST /api/auth/login` and the login screen said
*"Login failed. Please verify your credentials and try again."* Both were misleading:

- **530 is not a credential error.** It is Cloudflare reporting that the tunnel to the origin is gone.
  The sandbox had stopped every background process (Postgres survived because `pg_ctlcluster` daemonises
  it), so `cloudflared`, Next.js and Flask were all dead. The password was fine all along.
- Two more things had also been wiped, because they live outside the saved workspace: `node_modules`
  and `.next`. A restart therefore needs `npm ci` and `next build` before the UI can serve at all.

**Fix 1 — the app now says what actually happened.** The login screen inspects the failure instead of
printing one catch-all sentence:

| Failure | Message |
|---|---|
| no HTTP response / network error | *Cannot reach the NexLab server. It may be restarting — wait a few seconds and try again.* |
| HTTP 5xx (530, 502, 503 …) | *The server is temporarily unavailable (HTTP 530). This is not a password problem — please retry shortly.* |
| HTTP 429 | the server's own throttle message |
| HTTP 401/403 | *Invalid credentials* (the server's message) |

Verified in the browser with a wrong password (`401` → *Invalid credentials*) and with a stubbed
`530` response (`→ The server is temporarily unavailable (HTTP 530). This is not a password problem`).
Screenshot: `ui-checks/login-530-message.png`.

**Fix 2 — `./up.sh` is a self-healing supervisor.** One process tree holds Postgres → Flask → Next.js →
`cloudflared`, re-launching any child that dies every 20 s, rebuilding `node_modules`/`.next` when they
are missing, and writing the current public URL to `.tunnel-url` so it can be read without scraping logs.
Because a quick tunnel gets a new hostname whenever cloudflared restarts, the URL is a moving target —
`cat .tunnel-url` is the source of truth.

This is a limitation of the environment, not of the app: an account-less Cloudflare quick tunnel has no
stable hostname, and the sandbox does not persist processes or build output between sessions.
