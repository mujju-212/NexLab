# Proctoring Rework — the six open issues, fixed and verified

**Date:** 22 Oct 2026 · **Method:** every claim below was re-run in Chromium against the live stack (Postgres :5433, Flask :5000, Next :3000). No claim is based on reading code alone.

---

## 1. Server→student push was unreliable — fixed

**Root causes found (there were three, not one):**

1. **Lost events.** Broadcast and force-submit were emitted into `session_{id}_students` and nowhere else. If the student's socket was not in that room at that instant — joining, reconnecting, backgrounded tab — the event was gone. No ack, no retry, no catch-up.
2. **`session_ended` was never emitted on the path the End button uses.** `routes.py` emits it in the `/end` route, but the conductor's End button calls `set_mode('ended')`, which only emitted `session_mode_changed`. So the student was never told the lab had ended: the LIVE badge stayed, the timer kept running, **and the screen kept being captured**.
3. **No recovery path.** Nothing re-asked for state, so a client that missed a push stayed wrong until a manual reload.

**What now happens**

- On every join/reconnect the server sends a **`session_state` snapshot**: status, ended flag, mode + rules, proctor policy, focus-ML flag, any pending force-submit, and the last 25 chat messages. Whatever was pushed while the student was away is recovered on arrival.
- Broadcast, force-submit and mode changes are emitted to the **session room *and* each student's personal `user_<id>` room** (joined at connect, so it survives a missed session-room join).
- `set_mode('ended')` now emits `session_ended`, exactly like the end route.
- Force-submit is **persisted** as a `ProctorEvent` (`force_submit`, zero integrity cost) so it can be replayed, and now returns `delivered_to: N`.
- The student page **polls the authoritative session status every 20 s** as a last line of defence — even a socket that dies at the wrong moment cannot leave a student believing the lab is live.
- A **`Reconnecting…`** pill appears in the student header whenever the socket drops.

**Verified**

```
student_saw_broadcast:        True       (banner + chat entry)
student force-submit modal:   True       (banner reads "The instructor submitted your work")
student_sees_ended:           True
student_live_pill_gone:       True       (header shows ENDED)
pill_after_end:               False      → capture released
native_dialogs:               []         (none used anywhere)
```

Screenshots: `ui-checks/proctor/14-student-force-submit.png`, `32-student-after-end.png`.

## 2. Native `confirm()` on End / Force Submit — replaced

Both actions now open a styled in-app dialog that states the consequence before you commit:

- **End this session?** — "Attendance is finalised and grades are computed for every student… Students lose access to the workbench, and anyone still sharing stops being recorded." Primary button is red, labelled **End session**.
- **Force submission?** — names the student (or "ALL students"), explains that the current code becomes the final attempt and that a record is kept. Primary button **Force submit**.

Nothing in the conductor calls `window.confirm()` any more. Verified: `native_dialogs: []`, `end_modal_shown: True`, and the session really does end through it.

Screenshots: `ui-checks/proctor/22-force-submit-modal.png`, `31-end-modal.png`.

## 3. "Stop Share" in a lab where stopping is not allowed — removed

The control is now a **status chip**, not a button: `Sharing` (monitor icon) or `Not sharing`, with a tooltip explaining that sharing lasts for the session. Measured `stop_share_buttons: 0`.

The only way a student can stop is the browser's own Stop-sharing bar — which now immediately trips the gate, raises a **high** severity event, and blocks the room.

## 4. The pre-join flow now actually runs

Joining a session goes **Attendance → Device Permissions → Room** again. The permissions screen is the one that states the policy ("camera, microphone — and your screen, which is required and stays on for the whole proctored session"), so it matters that students see it.

It is skipped on reload only if that tab has already completed the flow for that session (`sessionStorage`), so a reconnect does not punish the student.

**Verified:** `step_1_attendance: True`, `step_2_permissions: True`, `perm_states_screen_required: True`, `step_3_room: True`. Screenshot: `ui-checks/proctor/30-permissions-step.png`.

## 5. "Focus ML monitoring" now really controls the pipeline

The switch was writing to `ProctorPolicy` only; the session's own `focus_ml_enabled` — the flag the socket handler and the student both read — was never updated, so scores kept being produced and displayed for monitoring the instructor had switched off.

- Toggling now writes **both** the policy and the session flag (same for Lockdown fullscreen → `lockdown_enabled`).
- The socket handler **returns early** when the session has focus ML off, so nothing is scored.
- The conductor stops inventing numbers: the Focus column reads **`off`**, the "Low Focus" KPI shows `—` / "Monitoring off", and the Proctoring panel warns "no attention scores are being collected or shown for this session".

**Verified:** `focus_column_off: True` while off; after the toggle, `lab_sessions.focus_ml_enabled = t` and `proctor_policies.focus_ml = t` for that session.

Screenshot: `ui-checks/proctor/20-grid-focus-off.png`.

## 6. Permanent confirmation that the screen is shared — added

A fixed pill sits at the bottom-left of the student's room for as long as capture is running:

> ● **Your screen is being shared** · instructor only

Verified `pill_before_end: True`, and it disappears the instant the session ends.

---

# The proctoring model, designed rather than patched

The controls are now a console that tells the instructor what each switch *does to the student*, and shows what has actually happened.

**Policy — stated, not implied.** At the top of the Proctoring panel: *"Screen sharing is compulsory. Every student shares from the moment they join until the session ends. Stopping it raises a high severity violation and re-blocks their room. No student screen is shown to you unless you open it."*

**Every switch carries its effect and severity:**

| Switch | What the student experiences | Recorded as |
|---|---|---|
| Lockdown fullscreen | forced fullscreen, re-entered if escaped | medium violation |
| Block copy/paste | Ctrl+C/V and right-click blocked in the workbench | medium violation |
| Block tab switch | tab blur / switch detected | medium violation |
| Plagiarism scan | submissions compared across the class | high — flags in integrity |
| Focus ML monitoring | attention scored every 30 s from typing, idle, tab switches | off = nothing collected |
| Webcam required | must publish camera to stay in the room | enforced at join |

**Consequences are arithmetic, not vibes.** Integrity is `100 − Σ(count × severity)` with high 6.0, medium 2.5, low 1.0 — the same scorer drives the integrity analytics endpoint, so the number an instructor sees during the session matches the one in the report afterwards. Instructor actions (`force_submit`, `broadcast`, `mode_change`) are stored in the same table for replay but cost the student **nothing**, and are excluded from the feed.

**A live proctor feed.** The Control & Comms tab now shows the last 25 events, newest first — student, event, time, and a severity chip — with the penalty scale stated above it. It refreshes every 20 s while the session is live. Confirmed against real data: the older session returns 9 events (7 × `screen_share_stop` high, 2 × `tab_switch` medium).

**Both sides see the same truth.** The student sees a permanent "sharing" pill plus a blocking gate the moment capture stops; the instructor sees a live/stalled/no-track badge on the one student they chose to watch, and the 30-second frames underneath. Nobody is watched by default; nothing is claimed live that is not.

---

## Files changed

**Backend**
- `app/sockets/events.py` — `session_state` snapshot on join; focus-ML gate in `behavioral_signals`; debug instrumentation removed.
- `app/instructor/conductor.py` — snapshot data (`proctor_feed`, `focus_ml_enabled`) on `/live`; policy→session flag sync; `session_ended` on `set_mode('ended')`; redundant per-student delivery for broadcast / force-submit / mode change; force-submit persisted with a correct reason; `delivered_to` in the response.
- `app/analytics/integrity_score.py` — `NON_PENALISED_EVENT_TYPES` so instructor records cannot damage a student's integrity.

**Frontend**
- `app/student/live-lab/[sessionId]/page.tsx` — pre-join flow restored; `session_state` hydration; status poll; `Reconnecting…` pill; "your screen is being shared" pill; Stop-Share → status chip; end-of-session banner, ENDED badge, capture release, stage copy.
- `hooks/use-socket.ts` — `onSessionState`; `screenshare_request` / `reshare_screen_request` listeners (previously dead).
- `app/instructor/sessions/[sessionId]/live/page.tsx` — in-app End / Force-submit modals; redesigned Proctoring panel; live proctor feed; honest focus display; 20 s refresh.
- `services/experience.service.ts` — `LiveState` carries `proctor_feed` and `focus_ml_enabled`.

**Verification scripts:** `verify_proctor_rework.py`, `verify_session_end.py` (run with `xvfb-run -a python3 …`).

## Still open (minor, cosmetic)

- After the session ends, the student's own tile keeps a frozen last frame of their screen even though the control correctly reads "Not sharing". The capture itself *is* released — only the stale preview image lingers until the page is left.
- The `student_sees_reason` line in my check is a string mismatch in the test, not a product issue: the banner reads "The instructor ended this session."

## Stack state

Postgres :5433, Flask :5000, Next :3000 all up. A live session **`74d8e249-13ee-480f-9d7a-5b4f7187a604`** ("CS301 Live Lab — Binary Search", mode `working`, focus ML **off**) is running and ready to explore — log in as `anitha.rao@skit.edu.in` / `Instructor@2026` and `rahul.sharma@skit.edu.in` / `Student@2026`.
