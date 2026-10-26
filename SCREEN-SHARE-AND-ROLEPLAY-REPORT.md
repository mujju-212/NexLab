# Screen Sharing Rework + Instructor Role-Play Report

**Date:** 22 Oct 2026
**Scope:** (1) make screen sharing compulsory at join, hide everyone's screens by default, and let the instructor click any student to watch that one student live — with the 30-second screenshot frames still flowing; (2) play the real instructor and a real student through a complete live session and report what breaks.
**Method:** every claim below comes from running the actual app in Chromium (Playwright, real login forms, real LiveKit rooms, real `getDisplayMedia` capture) — not from reading code.

---

## 1. Verdict summary

| Requirement | Status |
|---|---|
| Screen sharing compulsory at join | **Done** — blocking gate; the student cannot use the lab without sharing |
| Instructor does not see all screens by default | **Done** — default view is the SPARK table, zero video elements |
| Click a student → see that student's live screen | **Done** — row click / **Screen** button opens a live viewer (1920×1080, still playing 10 s later) |
| No mid-session request to the student | **Done** — the track is always published; the instructor subscribes silently |
| 30-second screenshot frames keep flowing | **Done** — they kept arriving while the live viewer was open |
| Could a real instructor run a session end to end? | **Almost** — see §7. Two blockers were found and fixed; one delivery bug remains open (§6) |

---

## 2. What the student now experiences

1. Joins the session from **Live Coding Lab → Join Live Room**.
2. The room opens behind a modal: *"Screen sharing is required — This is a proctored live lab… Only your instructor can see it, and only while this session is live."* with one button, **Share my screen**. There is deliberately no "continue anyway".
3. Pressing the button (a real user gesture, which is what browsers require) starts capture; the modal disappears.
4. If the capture ever stops — browser "Stop sharing" bar, tab killed, laptop lid — the modal comes back within ~2 s: *"Your screen share stopped. A proctored lab needs it on for the whole session."*
5. When the instructor ends the session the page releases the capture, so nothing is being watched after the lab is over.

The pre-join permission screen also now lists **"Share your screen — required"** next to camera and mic.

## 3. What the instructor now experiences

- Opens **Sessions → Open Conductor**. The grid is the **SPARK Monitoring Grid** table: focus %, checkpoints, proctor count, status. **No student video is shown by default** — measured `big_videos: 0` on load.
- The KPI that used to read *"0 sharing screen"* (it was counting frames, not shares — misleading) now reads **"N sending frames"**.
- The footer hint used to tell the instructor to *"click Show screen"* — a button that does not exist. It now reads: *"No screens are shown by default. Click a student's row (or Screen) to watch that one student live — screen sharing is compulsory at join, so nothing is asked of them mid-session. Screenshots keep recording every 30s in the background."*
- **Clicking a row** opens a viewer: header with the student's name and roll number, green **"Live screen — updating in real time"**, the live screen, and a footer counting the 30 s frames ("2 screenshots captured this session"). **Full dossier** opens the deep-dive page; **Esc** or the backdrop closes it.
- Each row now has two explicit actions: **Screen** (live view, in place) and **Dossier** (the separate page).

## 4. Proof it is actually live (not a still)

Measured in a real browser, two captures 10 s apart:

```
instructor_default          {"big_videos": 0}                        ← nothing shown by default
panel_after_click           banner "Live screen — updating in real time",
                            big_videos 1, big_playing 1, dims 1920x1080
panel_still_playing_after_10s  {"big_playing": 1}                    ← still live
live_video_changes          True                                     ← frames differ
student_console_errors      []      instructor_console_errors []     ← no errors either side
```

Enforcement, with the student's capture genuinely ended mid-session:

```
instructor_sees_live_before_stop  {"playing": 1}
stop_result                       stopped 1 track(s)
overlay_back                      True
overlay_message                   "Your screen share stopped. A proctored lab needs it on…"
instructor_after_stop             {"playing": 0, banner "No live track · showing latest 30s frame"}
sharing_restored                  True
instructor_after_reshare          {"playing": 1}
```

Screenshots: `ui-checks/roleplay/` — `22-instructor-default-view.png`, `23-instructor-panel-open.png`, `24-instructor-panel-10s-later.png`, `50-instructor-before-stop.png`, `51-student-after-stop.png`, `52-instructor-after-stop.png`, `53-instructor-after-reshare.png`.

## 5. Bugs found and fixed during the role-play

| # | Bug | Impact | Fix |
|---|---|---|---|
| 18 | **The student page never told the backend that sharing stopped.** `emitScreenShareStopped` existed in the socket hook but was never called anywhere. The earlier audit's "screen_share_stop recorded" was produced by calling the API directly, not by the UI. | A student could kill the share and the instructor would never get the high-severity proctor event or the reshare prompt. Integrity score also stayed untouched. | Watcher on the published capture track (event + 1.5 s poll of `readyState`); on loss → gate + `screen_share_stopped` → proctor event, instructor alert, integrity penalty. |
| 19 | **The instructor's viewer claimed a dead feed was live.** When a student stopped sharing, the publication stayed "alive" and every subscriber kept a frozen last frame — the panel still said "Live screen — updating in real time". | An instructor would sit watching a frozen picture believing the student was working. | On loss the student now unpublishes (`setScreenShareEnabled(false)`), so subscribers get a real track end; plus stall detection (video `currentTime` not advancing → **"FEED STALLED"** chip and fall back to the last 30 s frame). |
| — | `screenshare_request` / `reshare_screen_request` were emitted by the server but **nothing in the frontend listened** — an instructor asking to see a screen produced no prompt at all. | Dead feature. | Both events are now handled and surface the correct gate message. |
| — | Login form had no `method`, so a click before hydration did a native **GET submit and put the password in the URL/history** (`/login?email=…&password=…`). | Credential leak in browser history/server logs. | `method="post"` as a hard fallback. |
| — | Ending the session left the student capturing their screen, still showing a red **LIVE** pill and running timer. | Privacy + confusion. | `session_ended` handler releases capture, drops the gate, and flips the pill to **ENDED**. *(Implemented; could not be confirmed end-to-end — see Bug 20.)* |
| — | Ended-session banner printed the same sentence twice: *"Session ended by instructor. Session ended by instructor — your code was auto-submitted."* | Sloppy. | Renders the backend reason once. |
| — | Term "0 sharing screen" and the non-existent "Show screen" button in the grid footer. | Instructor confusion. | Copy corrected. |

Also fixed earlier in this round: **Bug 17 (integrity severity)** — re-verified live after restart: 1 `tab_switch` (medium 2.5) + 2 `screen_share_stop` (high 6.0 each) → penalty **14.5** → score **85.5** where the old code returned 99.5; `proctor_events.total` now equals the sum of the categories and `proctor_severity` is exposed.

## 6. Open issues (found, not fixed)

1. **Server→student push is unreliable (Bug 20, blocker for the end-of-session behaviour).**
   Broadcast and force-submit calls return **HTTP 200** and the message is persisted, but the student's screen often does not update. Across automated runs the broadcast banner appeared **2 times out of 5**; force-submit similarly. When it does arrive it works perfectly. There is no acknowledgement or catch-up: if the client is not in `session_{id}_students` at that instant, the event is lost silently. The chat *history* always has it (REST), which is why the failure is easy to miss.
   *Recommendation:* make these events acknowledged (client emits, server retries / client refetches state on `joined` and on reconnect), and add a visible connection indicator on the student page.
2. **Native `confirm()` for End session and Force Submit.** Both `window.confirm()` calls block the UI thread and cannot be styled; in kiosk/embedded browsers they can be suppressed entirely (Playwright dismisses them by default, which silently cancels the action — this is how I discovered it). Should be an in-app modal.
3. **The student still has a "Stop Share" button** in the control bar of a session where stopping is not allowed. It now immediately trips the gate (so it is safe), but the control contradicts the policy. Recommend replacing it with a non-interactive **"Sharing"** indicator.
4. **The pre-join steps (attendance → permissions → video) never run.** Clicking "Join Live Room" goes straight into the room, so the permissions screen where we now explain compulsory sharing is never seen. The gate covers the requirement, but the flow is dead weight or should be reconnected.
5. **"Focus ML monitoring" is OFF in Proctoring Controls, yet focus scores are still computed and shown** (62 % on the grid, sparkline, rankings). Either the toggle should gate the pipeline or the toggle is misleading.
6. The student has no persistent confirmation that their screen is being shared (only the tile badge inside the room). Worth a small always-visible pill for trust.

## 7. Role-play scorecard — could a real person do this?

**As the instructor**

| Step | Result |
|---|---|
| Log in | ✅ (with the GET-submit fallback fixed) |
| See today's session and open the conductor | ✅ |
| Default monitoring view without screen noise | ✅ table only |
| Watch one student's screen on demand | ✅ one click, no request to the student |
| Broadcast to the class | ⚠️ works, but delivery is flaky (Bug 20) |
| Pause / resume the session | ✅ modes switch and persist |
| Force submit | ⚠️ same delivery problem as broadcast |
| End session | ✅ session → `ended`, `ended_at` set, grades finalised, attendance `present` |
| Anything blocking a competent instructor | Only Bug 20 |

**As the student**

| Step | Result |
|---|---|
| Log in, find the live session, join | ✅ |
| Understand that sharing is compulsory | ✅ explicit modal, no escape route |
| Share the screen | ✅ one click (browser requires the gesture) |
| Keep working with the gate gone | ✅ editor/tabs/chat usable |
| Survive a dropped share | ✅ gate returns, reshare reconnects, instructor sees it live again |
| Ask a question in chat | ✅ instructor received it |
| Hear the instructor | ⚠️ same delivery issue for broadcasts |
| Leave without sharing | ❌ impossible by design — correct for a proctored lab |
| Know the session has ended | ⚠️ implemented, unverified (Bug 20) |

## 8. Files touched

**Frontend**
- `app/student/live-lab/[sessionId]/page.tsx` — compulsory gate, share watcher, unpublish on loss, session-end release, ENDED pill, banner dedupe, permission copy.
- `hooks/use-socket.ts` — `onScreenShareRequest`, `onReshareRequest` (previously dead), `onSessionEnded` wiring.
- `components/instructor/StudentScreenViewer.tsx` — **new**; live screen viewer with stall detection and frame fallback (rendered through a portal so it is visible from any conductor tab).
- `app/instructor/sessions/[sessionId]/live/page.tsx` — clickable rows, Screen/Dossier actions, viewer mount, corrected copy, frame-based KPI.
- `app/(auth)/login/page.tsx` — `method="post"` fallback.

**Backend** (from the Bug 17 fix in this same round)
- `app/analytics/integrity_score.py` (**new** severity-weighted scorer), `app/instructor/analytics.py` `/integrity`, `app/analytics/integrity.py`.

**Reproduction scripts** (kept): `roleplay_audit.py`, `roleplay_part2.py`, `roleplay_part3.py`, `roleplay_part4.py`, `live_screen_proof.py`. Run with `xvfb-run -a python3 <script>.py`; Chromium needs `--auto-select-desktop-capture-source=Entire screen` for capture to resolve without a human clicking the picker.

**Stack state at hand-off:** Postgres :5433, Flask :5000, Next :3000 all up. The last live session was left **ended** by the role-play — create and start a new one from *Sessions → Schedule Session* to demo again.
