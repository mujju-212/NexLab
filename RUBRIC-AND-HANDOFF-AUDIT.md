# Rubric & Student→Instructor Handoff — audit verdict

Everything below was exercised against the running app (API + real browser), not read off the code.
Probe experiments were created, graded and deleted so the tenant is left as it was.

---

## Part 1 — Is the rubric I defined implemented correctly?

### What you defined
1. The rubric shows the components defined for the experiment.
2. You set how much each contributes **out of the 100 marks of one experiment**.
3. A component you don't want is set to **0 and is then not calculated**.
4. The contribution is **auto-calculated and shown** to you.
5. The experiment's **weightage to the total subject marks** is set at creation.

### Verdict: 1, 3, 4, 5 are correct. 2 is correct in formula but **wrong in what happens to a component you haven't scored yet.**

#### ✅ The formula is exactly what you asked for
```
final = Σ (component_score × component_weight ÷ 100)   − hint_deduction
```
Every component is 0–100; the weight does all the scaling.

| Component | Weight | Score | Contribution |
|---|---|---|---|
| Test cases | 50 | 90 | 45.0 |
| Lab report | 20 | 80 | 16.0 |
| Code quality | 10 | 70 | 7.0 |
| Viva | 10 | 60 | 6.0 |
| Quiz | 10 | 100 | 10.0 |
| **Final** | | | **84.0** ✓ |

#### ✅ Zero means "not calculated"
Rubric changed to 50/30/**0**/10/10 with the same five marks → **85.0**, and the code-quality row
returns `used: false, contribution: 0.0`. In the UI it renders as `Pre-Lab Quiz — not used (0%)`
with no input box, and the save call never sends that key. Exactly your rule.

#### ✅ Weights must sum to 100 — enforced, not just displayed
Real API calls: 50/20/10/10/0 (sums to 90) → **400**, 60/30/20/20/0 (sums to 130) → **400**,
`-10/60/20/10/0` → **400**. The form also shows a live `Sum: 100% ✓ Valid` badge.

#### ✅ Weightage to the subject is a separate, independently stored number
Creating an experiment with weights `40/30/20/10/0` **and** `weightage: 3` stores them as two
unrelated facts. Subject total = Σ weightage (1+1+1+2+25 = 30) and both roles agree on it.

---

### ❌ The one thing that is wrong: **an unscored component is counted as a zero**

This is the flaw that matters, and it is not cosmetic.

Rubric 50/20/10/10/10, experiment with **only** the lab report scored (88):

```
test_cases    w=50  score=None  contribution=0.0
lab_report    w=20  score=88    contribution=17.6
code_quality  w=10  score=None  contribution=0.0
viva          w=10  score=None  contribution=0.0
quiz          w=10  score=None  contribution=0.0
final = 17.6 / 100
```

The student got 88% on the only thing that was marked and receives 17.6%. The instructor is not
"deducting" those marks — they simply haven't been entered — but the system treats *not yet assessed*
identically to *scored zero*.

**Why this is not a rare corner case here:** with Docker off, `auto_grade` (test cases, the 50–60%
component) and `code_quality_grade` can never be computed. So on any lab where the student submits
no code, the maximum achievable mark under a 60/20/10/10 rubric is **30**, even if the report is
perfect. The rubric is mathematically right but its two biggest inputs are unreachable (see Part 2).

**Also invisible in the UI:** blank inputs render as `—` and silently contribute 0. The live
"Final Score" preview shows `17.6 / 100` with no warning that three weighted components have no
score. The instructor has no way to tell "this student failed" from "I haven't finished grading".

#### Recommended fix (either one)
- **Renormalise over scored components only:** divide by the weight actually assessed, and show
  `provisional` until 100% of the weight has a score. Correct while grading, but it must be explicit
  that the mark is provisional.
- **Or block the save** until every weighted component has a value (with an explicit "score as 0"
  action for genuine zeros). Safer for a final grade, and keeps the arithmetic you defined.

A blend is probably best: allow partial saves marked *provisional*, and only publish a final mark
when the assessed weight reaches 100.

### Smaller rubric inaccuracies
- **`hint_deduction` is subtracted after weighting**, in raw marks. A 5-mark deduction on an
  experiment worth 1 subject mark is disproportionate — it should be scaled by the same weight.
- **Exam marks bypass the rubric** (correctly) and use `grade_weight` as a fraction of the subject.
  But `grade_weight` is a 0–1 fraction while every other weight in the product is "out of 100".
  That inconsistency is what caused the silent clamp I fixed in Round 4 (sending `25` became `1.0`).

---

## Part 2 — Student submits → does the instructor actually receive it?

### Exams: ✅ fully working, verified end-to-end in the browser

| Step | Result |
|---|---|
| Student starts the timed exam | attempt opened, 3 questions delivered |
| Student answers and submits | auto-scored per question: 2/2, 1/1, 2/2 → **100%**, Passed |
| Instructor → Experiments & Exams → Results | **one row per student**: `Rahul Sharma · 1/5 attempts · 100% · Passed · violations none · last activity` |
| Expand student → attempt → **Answers (3)** | every question with the prompt, **"Student answered: True / Sorted / O(n)"**, and marks earned |
| Proctoring | violations recorded per attempt and shown in the same row (Round 2) |
| Student side | sees their own result and score |

`GET /instructor/exams/<id>/attempts` returns both the grouped rows and a hydratable `answers[]`
per attempt (prompt, options, `student_answer`, `correct_answer`, `is_correct`, `earned`, `points`).
So the interaction loop is complete for exams: student answer → instant grade → instructor review.

### Labs (code submissions): ❌ there is no working path at all

| Step | Result |
|---|---|
| Student hits Run/Submit in the lab editor | `POST /api/execution/run` → **503** `"Code execution engine is not enabled on this server."` (`DOCKER_RUNNER_ENABLED` is off) |
| Instructor opens the Grading Hub for a lab the student "submitted" | **0 submission rows** — the student does not appear at all |
| Student autosave | `POST /api/execution/save` → **200** `{"status":"saved"}` — but it writes a `CodeVersion` row, and the Grading Hub enumerates `CodeAttempt` rows with `is_final_submission=True`, which only `/execution/run` creates |

Consequences:
- The instructor **cannot see any student code, test-case results, or code-quality analysis** for a
  lab — those components of the rubric can never be filled by real student work.
- Every lab mark in this system is therefore **typed in by the instructor**, not derived.
- The autosave returning 200 for work the instructor will never see is the worst kind of success
  message: the student believes their work is in.

Note on my own earlier screenshots: the lab marks 80.1 / 84.0 / 66.9 were produced by calling the
grading API directly. They prove the rubric arithmetic and the instructor UI, **not** that a student's
own submission flowed into them. That flow does not exist while Docker is off.

### Verdict in one line
**Exams: the student→instructor interaction is real and works.**
**Labs: it does not exist — the execution engine is disabled, so a student's code never becomes a
submission the instructor can see, and two of the five rubric components are structurally unfillable.**

---

## What I would fix first, in order
1. Make the lab submission path real (enable the runner, or introduce a Docker-free "submit for
   grading" that records a `CodeAttempt` with `is_final_submission=True` even if it can't execute).
2. Stop treating an unscored rubric component as a zero — renormalise or block the save.
3. Surface "N of 5 weighted components have no score — this mark is provisional" in the grading panel.
4. Scale `hint_deduction` by the experiment's weightage.
5. Bring the student's own view up to the instructor's: show the component breakdown, not just `19/100`.
