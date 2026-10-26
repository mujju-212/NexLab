# Grading & Assessment Hub — redesign + working cross-check

Round 11 deliverable. The page was rebuilt against an AI-generated design reference
(`ui-checks/grading/design-concept-hub.png`) and every number it shows was re-derived
from the API. Nothing on the page is a placeholder.

---

## 1. What the page was before

One route (`/instructor/grading`) rendered five different screens from component state:
subject rollup, single-assessment table, student dossier, submission table, and the
rubric workbench. Evidence: `ui-checks/grading/grading-current.png`,
`subject-rollup-full.png`, `dossier-modal.png`, `grade-panel.png`.

Concrete defects found while exercising the flow:

| # | Defect | Cause |
|---|--------|-------|
| 1 | `Subject Total` read **0.0 / 100** for a student whose three experiments read 85.89 / 70.7 / 89.7 | rollup sums `(score/scale)×weightage` over **published** experiments only. The three labs were drafts, so the sum was legitimately 0 — but it was printed against the 100-mark ceiling, which reads as "failed everything" |
| 2 | Footer "Class Rollup Average 0.0 pts" contradicted the per-column scores in the same table | same denominator problem |
| 3 | Header said "Allocated Weightage 0 pts — Across 3 assessments" while the cards underneath listed `TC 60% · Lab 20% · Qual 10% · Viva 10%` | draft weight silently dropped, never labelled |
| 4 | Experiment columns were labelled `1 PTS` while cells read `85.89 / 100` | scale (grade_scale) and weightage conflated in one column header |
| 5 | `+0.9 pts` chips under each score | weighted contribution, unlabelled |
| 6 | Six stacked dropdowns consumed ~100 px of every screen and remembered nothing | filter bar built as a form, not as scope |
| 7 | "Breakdown", "Inspect & Grade", "Open Submission" — three names for drill-down | three components, one intent |
| 8 | Grading dialog: cramped two-column modal, legend-less tick checkbox, disabled `Oral Viva — EXCLUDED —` row, no visible rubric weight, manual entry required for auto-computed values | workbench never redesigned |
| 9 | Sticky scope was absent; scrolling the gradebook removed all context | — |

## 2. Backend changes (`backend/app/instructor/routes.py`, `GET /subjects/<id>/grade-summary`)

All additive — no existing field changed shape, the student-facing
`/api/student/subjects/<id>/grade-summary` is untouched and still agrees with it.

```
subject.published_weightage   weight that actually counts
subject.draft_weightage       weight sitting in unpublished assessments
subject.published_count       published assessments (labs + exams)
subject.draft_count           draft assessments
subject.unallocated_marks     total_marks − total_weightage  (0 … total_marks)
experiments[].is_published    draft flag, so the UI can label rather than hide
experiments[].graded_count    how many students carry a mark
experiments[].submitted_count students who submitted
experiments[].class_average_percent   real class average on that assessment
students[].points_earned      weighted points earned  (= subject_score)
students[].points_allocated   weighted points available (= total_weightage)
students[].subject_percent    points_earned / points_allocated × 100, null when 0
students[].assessed_count     graded assessments for that student
students[].assessment_count   assessments in scope
```

`subject_percent` is the fix for defect #1: with 3 pts of weight allocated out of a
100-mark ceiling, a student scoring 85.89 / 70.7 / 89.7 has **82.1 %** of everything
they could be marked on. The UI shows that pro-rated figure **and** the raw
`2.46 / 3.00 pts`, plus a banner stating that only 3.00 of 100 marks are allocated.
When nothing is published, `subject_percent` is `null` and the hub prints "—" with
"awaiting published marks" — never a misleading 0.

Frontend types extended in `frontend/services/experiment.service.ts`.

## 3. The new page

`frontend/app/instructor/grading/page.tsx` + new `frontend/app/instructor/grading/hub.module.css`.

**Sticky scope bar** — department · year · batch · section · subject · view in one
compact rail, with Refresh and Export CSV. It pins flush to the scrollport
(`top: -16px`, compensating the shell's 16 px content padding) and shrinks its chips
under 1560 px so all six controls stay visible.

**KPI row (4 live cards, each with a real sparkline)**

| Card | Value | Trend |
|---|---|---|
| Class average | mean of `subject_percent` | per-assessment `class_average_percent` |
| Graded | graded cells / total cells + progress | — |
| Pending review | submitted-but-ungraded cells | per-assessment pending counts |
| Marks allocated | `total_weightage` / `total_marks` | published vs draft caption |

Sparklines suppress themselves when there is only one point or no variance and say
why ("publish to start the trend", "flat at 0") instead of drawing a false line.

**Gradebook** — grouped assessment columns with weight badges (`1 pt`) and a
per-column caption (`avg 70.2 % · 9/9 graded`); score cells carry a colour-coded bar
(≥75 green / 50–74 amber / <50 red), the score on the assessment scale, and its
weighted contribution; the right column is an SVG ring with the pro-rated percentage,
`2.82 / 3.00 pts` and `94.1 % of 100 marks`. Draft columns stay visible but their
contribution is not added. Search + All / Needs review / Graded / Not started chips
filter instantly, and the legend under the title explains the bar and `+x.xx`.

**Grade distribution** — histogram over the pro-rated subject total, with a second
metric (unweighted graded average) for subjects that have no published weight yet.
Empty state explains exactly why nothing is plotted.

**Assessment weightage health** — every assessment with its weight out of
`total_marks` and a Published / Draft-not-counted status, plus a footer that names the
problem ("97.00 of 100 marks unallocated", "3.00 pts sit in 3 draft assessments",
or "over-allocated by N marks").

**Assessment view** — context header (weight, scale, roster size, awaiting-review
count), the rubric weights as a bar strip with "0 % components are not part of the
mark", four KPI cards (graded / awaiting review / unweighted average / integrity),
status chips, and a table that says "No code — rubric only" instead of inventing a
language. Viva marks now come from the rubric (`viva_grade`) rather than only from AI
viva sessions.

**Grading workbench** — header states plainly when there is no code submission; the
rubric pane gets a column header (*Include · Component · Score · Adds*), a labelled
`Assessed / Skip` toggle instead of a legend-less checkbox, the weight badge on each
component, `+x.x` per component, an explicit `0 % — not part of this rubric` line for
weightless components, a final-score bar with a ring and a `PROVISIONAL · 90 %
assessed` badge, and a proper empty state for the code pane.

**Dossier modal** — three summary tiles (pro-rated total, published points,
assessments graded) replace the old `0.0 / 100 pts` line; draft rows are tagged
"draft, not counted" and their contribution reads `(excluded)`.

**CSV export** — `Points Earned`, `Points Allocated`, `Pro-rated Total (%)`,
`Assessments Graded` alongside the per-assessment columns.

## 4. Cross-check: is the working efficient / correct?

*Correct now:* the rollup, the per-assessment columns and the KPI cards all compute
from one payload in a single `useMemo`; no page-level refetch loops were added. The
payload is unchanged in size (three small aggregates added per assessment).

*Correct because it is explicit:* unpublished weight is never counted and never
hidden — it is labelled twice (banner + health table). A grade on a draft assessment
is visible but shows zero contribution, which is the truth.

*Still worth knowing (not changed, out of scope for a UI round):*
- `POST /instructor/grades` can mark an unpublished experiment. The API allows it;
  the UI now surfaces the consequence, but a server-side warning would be better.
- `Exam.grade_weight` is a fraction of `total_marks` while `Experiment.weightage` is
  absolute points. Both are handled correctly here, but the two units stay a trap.
- Plagiarism flags are only fetched per-assessment, so the rollup intentionally shows
  "marks allocated" as its fourth KPI instead of a subject-wide integrity count. When
  a per-subject integrity endpoint exists, that card can come back.

## 5. Verification

- `npx tsc --noEmit` clean · `npx next build` EXIT=0 · production `next start` serves
  `/login` and `/instructor/grading` 200.
- Functional pass (Playwright, 1440 px): row filtering 9 → 3 (needs review → empty
  state shown), search "kabir" → 1 row, column header click → assessment view,
  dossier opens/closes, CSV downloads as `CS301-gradebook-2026-10-23.csv` with the new
  columns, rubric save writes through and the rollup updates (Lab 2 36.89 → 38.22),
  zero console errors.
- Sticky check: scope bar top 167 → 25 px on a 500 px scroll, flush with the scrollport.
- Screenshots: `ui-checks/grading/hub-rollup.png`, `hub-assessment.png`,
  `hub-workbench.png`, `hub-dossier.png`, `hub-curve.png`, `hub-sticky.png`.

## 6. Data used

Real rows only. `make_cohort.py` (new, committed) widens the existing SKIT section to
nine students and marks their three experiments through
`POST /api/instructor/grades`; the three experiments were published through
`PUT /api/instructor/experiments/<id>` so the rollup has something real to compute.
The tenant, its students and their grades stay in the database.
