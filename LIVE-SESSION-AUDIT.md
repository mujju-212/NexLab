# Live Session & Rubric Audit

Everything below was produced by running the app — real API calls, real Socket.IO clients, real
Postgres rows — not by reading code alone. Two silent data bugs were found and fixed.

---

# Part 1 — The rubric fix you asked for ("tick the marks")

## What changed

Your idea was right, and it is now implemented as **a tick per component**:

- Each rubric row has a checkbox: **ticked = included in the mark, unticked = excluded entirely.**
- The mark is renormalised over the weight that was actually assessed:
  `final = Σ(score × weight) ÷ Σ(weight of ticked components)`.
- A ticked-but-empty component contributes nothing and does not divide in.
- Nothing ticked → `final_grade = null`. The system no longer invents a zero.
- A **`PROVISIONAL · N% assessed`** badge appears until all 100% of the weight is ticked.
- Unticked rows grey out, their input is disabled, and they show **EXCLUDED**.

## Proof — the exact case that was broken

Rubric 50/20/10/10/10. Only the lab report scored 88:

| | Before (unticked → zero) | After (tick = include) |
|---|---|---|
| Test cases 50% | counted as 0 | excluded |
| Lab report 20% | 88 | 88 |
| Code quality 10% | counted as 0 | excluded |
| Viva 10% | counted as 0 | excluded |
| Quiz 10% | counted as 0 | excluded |
| **Final** | **17.6** ❌ | **88.0** ✅ *provisional, 20% assessed* |

Four cases run against the live API:

| Case | Ticked | Result |
|---|---|---|
| A — test cases (0) + lab report (88) | those two | **25.14**, 70% assessed, provisional |
| B — lab report only | one | **88.0**, 20% assessed, provisional |
| C — all five (90/80/70/60/100) | all | **84.0**, 100% assessed, final ✓ *(identical to the old maths — the formula is unchanged when everything is graded)* |
| D — nothing ticked | none | **`null`**, 0% assessed — no invented zero |

Saved through the browser: experiment #1's stored mark moved 80.1 → **80.25** when the 60%
test-case row was unticked, and `grades.assessed_components` persisted
`{"test_cases": false, "lab_report": true, ...}`. Then it was restored to 80.1 with its real marks
ticked, so the demo data is unchanged.

**Files:** `app/models/grading.py` (`assessed_components` column, `calculate_final` rewrites),
`app/services/grading_service.py` (`assessed` params), `app/instructor/routes.py`
(`assessed` + breakdown with `assessed`/`contribution`/`contribution_pct`/`assessed_weight`/`provisional`),
`app/instructor/grading/page.tsx` (checkboxes, renormalised live preview, provisional badge),
`services/submission.service.ts`. Migration: `ALTER TABLE grades ADD COLUMN assessed_components JSON`.

---

# Part 2 — Code review of the lab submit path (Docker left alone)

You asked me to just check whether the code is correct. **Yes — the logic is sound and self-consistent.**
It cannot run here only because `DOCKER_RUNNER_ENABLED` is empty, which is a config gate, not a bug.

Reading `POST /execution/run` end to end:

| Step | Verdict |
|---|---|
| Language resolve + reject browser-only engines | correct |
| Config gate `DOCKER_RUNNER_ENABLED` → 503 | correct, and it fails loudly rather than pretending |
| Live-session rules (enrollment, mode matrix, pre-lab gate) enforced server-side | correct — a modified client cannot bypass |
| Run each `TestCase` against the sandbox, compare normalised stdout | correct |
| Store **every** run as a `CodeAttempt` (not just finals) | correct, matches the paper's design |
| `is_final_submission=is_submit` | correct — this is the flag the Grading Hub queries |
| `TestCaseResult` rows + auto-verify checkpoints + emit to both rooms | correct |
| `CodeVersion` saved on every run | correct |
| On final submit → `sync_student_experiment_grade()` | correct |

**One piece of dead code:** `grade_val` is computed (test-case percentage) and then never passed
anywhere — `sync_student_experiment_grade()` is called without it. Harmless, because the service
recomputes `auto_grade` itself from the best final `CodeAttempt`. No wrong data results, but the
variable should be deleted or passed explicitly to avoid a future reader assuming it is used.

**Conclusion:** enable the runner and this path works as written. Nothing else needs changing.

---

# Part 3 — Live session audit: instructor → student, in full

I created a session, started it, and drove both sides with real Socket.IO clients plus HTTP.

## What works ✅

| Capability | Evidence |
|---|---|
| Create → start session | `status: active`, `started_at` set, live page state row created, LiveKit room created |
| Instructor video token | `200`, real JWT minted against `wss://nexlab-ecxxi65i.livekit.cloud` |
| **Student gate + join** | `check-gate → gate_passed: true, can_join_live: true, window: open`, student LiveKit token + URL returned |
| Attendance | student row → `present`, `joined_at` stamped on gate check |
| Rooms | instructor joins, student joins, instructor gets `student_joined` |
| **Instructor screen share → student sees it** | instructor token has `can_publish`; the student page subscribes to `Track.Source.ScreenShare` from the instructor participant and renders it |
| **Student can stop sharing** | `screen_share_stopped` → high-severity `proctor_alert` to instructor + event persisted + `reshare_screen_request` pushed back to the student |
| Screen-share consent (proctoring direction) | request → **only that student** gets the prompt (private room) → accept relayed to instructor → stop handled. Verified all three legs |
| Broadcast | instructor message → student receives `{message, from: "Prof. Anitha Rao"}` |
| Force-submit | instructor → student receives `force_submission {reason: "Session ended by instructor"}` |
| **Launch the experiment live** | `launch-page` with `page_id` + `timer_sec` → student receives `student_page_launched` with the page title, mode and timer; `live_page_state` persisted |
| Proctoring alerts | `tab_switch` → `proctor_alert` with severity **medium**, persisted |
| Focus score (ML) | `behavioral_signals` → server-side ML score, relayed **and** alerts: `low_focus_score`, `tab_switch_high`, `idle_detected`, `window_focus_low` |
| Security design | `focus_score_update` is **instructor-only**; a student cannot inject focus scores for themselves or classmates — students go through the server-scored `behavioral_signals` path. Good call |
| Violations saved for the record | `proctor_events` rows with `session_id`, `student_id`, `severity`, timestamp |
| Violations feed analytics | `/instructor/analytics/integrity` returns per-student counts + an integrity score |
| Focus feeds analytics | `focus_timeline` sparkline, `spark_grid`, and the **engagement component of rankings** |

## Bug 15 — every focus score was silently thrown away *(fixed, high impact)*

The ML model returns a **`numpy.float64`**. `round(np.float64, 1)` is still `np.float64`, and
psycopg2 renders it as `np.float64(...)`, which Postgres rejects:

```
InvalidSchemaName: schema "np" does not exist
LINE 1: ...'::JSON, np.float64(20.1) ...
```

That failure sat inside a bare `except Exception: rollback()`, so it was invisible. **`focus_scores`
was permanently empty** even though the instructor's screen showed a live number.

What that broke, silently:
- `spark_grid` focus score → always `null`
- the focus **sparkline** (`focus_timeline`) → always empty
- the ranking **engagement score** (20% of a student's rank) → stuck on its `50.0` default forever
- the AI role tools' per-session focus summaries → empty

Fixed by coercing to a builtin `float` and **logging** the failure instead of swallowing it:

```python
focus_score=round(float(focus_score), 1),
...
except Exception as exc:
    current_app.logger.warning('focus score not persisted (...): %s', exc)
```

Verified: three signals (0/5/0.98, 3/150/0.42, 6/400/0.15) → scores **76.7, 19.2, 32.6** stored,
`spark_grid` reads the latest **32.6**, `focus_timeline` returns all four points, integrity alerts
fire correctly, and the ranking engagement component now computes **68.5** from real data instead
of the default 50.

## Bug 16 — `livekit-api` was missing from `setup.sh` *(fixed)*

On a fresh machine the video token returned **503 "Video server misconfigured"**, because
`LIVEKIT_API_KEY/SECRET` are set but the `livekit-api` package is never installed by `setup.sh`.
Installed it (`pip install livekit-api`); `video-token` now returns `200` with a real JWT.
**`setup.sh` should install it** — otherwise the whole video/screen-share half of a live session
fails on any new deployment with an error that blames configuration.

## Bug 17 — the integrity score ignores severity and most event types *(found, not fixed)*

`/instructor/analytics/integrity` scores integrity as:

```python
integrity_score = 100 - (tab_switch*0.5 + fullscreen_exit*1 + copy_paste*3 + lockdown_violation*5)
```

Two problems:
1. **`severity` is never used.** A student who stops sharing their screen mid-proctored-exam
   produces a `screen_share_stop` at severity **high** — the single most suspicious signal there is —
   and it contributes **0.0**. Their integrity score stayed **99.5**.
2. **Only 4 event types are counted**, but every type is counted in `total`. Live data showed
   `total: 2` next to categories summing to `1`, which reads like a data bug to an instructor.
   Missing: `screen_share_stop`, `paste`, `devtools`, `focus_lost`, `context_menu`.

Fix: weight by severity (high/medium/low) and surface every distinct event type in the breakdown.

---

# Scorecard for the live-session flow

| Your question | Answer |
|---|---|
| Does the instructor→student flow work? | **Yes** — join, video tokens, attendance, broadcast, force-submit, page launch with timer all verified |
| Can the student see the instructor's screen? | **Yes** — LiveKit `ScreenShare` track is subscribed and rendered; both tokens mint correctly |
| Can the student turn sharing off? | **Yes** — and it is *supposed* to be caught: high-severity alert, persisted event, reshare prompt sent back |
| Can the experiment be launched live from there? | **Yes** — page + timer pushed to every student's screen, state persisted |
| Is the spark/focus monitoring working? | **It was displaying fake-fresh data and storing nothing.** Now it stores and drives the sparkline, grid and rankings (Bug 15) |
| Is there an option to save violations for the record? | **Yes** — `proctor_events` rows with severity, timestamp, session and student |
| Is that data used for analytics? | **Yes** for proctoring counts; **badly** for integrity scoring (Bug 17); **yes** for focus → engagement ranking, now that Bug 15 is fixed |

**Remaining work, in order:** (1) fix the integrity score to use severity + all event types,
(2) add `livekit-api` to `setup.sh`, (3) delete the dead `grade_val`, (4) a live-session proctoring
event list on the conductor UI so these rows are visible without the analytics page.
