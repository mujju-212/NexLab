"""
roleplay_audit.py — act as a real student and a real instructor, end to end.

Student  : logs in through the form, joins the live lab, walks every join step,
           gets screen sharing running (Chromium auto-accepts the picker).
Instructor: logs in through the form, opens the conductor from the sessions
           list, checks the default view, clicks a student tile, checks that the
           live screen appears, exercises the controls.

Everything is recorded: screenshots, console errors, failed API calls, and the
text that was actually on screen at each decision point.
"""
import json
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/roleplay")
SHOTS.mkdir(parents=True, exist_ok=True)

SESSION_ID = Path("/tmp/live_sid.txt").read_text().strip()
STUDENT = ("rahul.sharma@skit.edu.in", "Student@2026")
INSTRUCTOR = ("anitha.rao@skit.edu.in", "Instructor@2026")

# Chromium flags so getDisplayMedia resolves without a human clicking the picker.
CHROME_ARGS = [
    "--auto-select-desktop-capture-source=Entire screen",
    "--auto-select-tab-capture-source-by-title=Probe",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--enable-usermedia-screen-capturing",
    "--allow-http-screen-capture",
    "--disable-features=WebRtcHideLocalIpsWithMdns,DesktopCaptureMacV2",
]

log = {"student": [], "instructor": [], "console": [], "failed": []}


def note(who, msg):
    line = f"[{who}] {msg}"
    print(line, flush=True)
    log[who].append(msg)


def watch(page, who):
    def on_console(m):
        if m.type == "error":
            log["console"].append(f"{who}: {m.text[:200]}")

    def on_response(r):
        if r.status >= 400 and "/api/" in r.url:
            log["failed"].append(f"{who}: {r.status} {r.request.method} {r.url.replace(BASE,'')[:120]}")

    def on_pageerror(e):
        log["console"].append(f"{who}: PAGEERROR {str(e)[:200]}")

    page.on("console", on_console)
    page.on("response", on_response)
    page.on("pageerror", on_pageerror)


def login(page, email, pw, who):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    inputs = page.locator("input")
    inputs.nth(0).fill(email)
    inputs.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in|login", re.I)).first.click()
    page.wait_for_timeout(4000)
    note(who, f"after login landed on {page.url}")
    return page.url


def shot(page, name):
    p = SHOTS / f"{name}.png"
    page.screenshot(path=str(p), full_page=False)
    return p.name


def body_text(page):
    try:
        t = page.locator("body").inner_text()
        return re.sub(r"\n{2,}", "\n", t)[:1500]
    except Exception:
        return "<no text>"


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, args=CHROME_ARGS)

        # ───────────────────────── STUDENT ─────────────────────────
        sc = browser.new_context(
            viewport={"width": 1440, "height": 900},
            permissions=["camera", "microphone"],
        )
        sc.grant_permissions(["camera", "microphone"])
        sp = sc.new_page()
        watch(sp, "student")
        url = login(sp, *STUDENT, "student")
        note("student", f"login screenshot: {shot(sp, '00-student-login')}")

        sp.goto(f"{BASE}/student/live-lab", wait_until="domcontentloaded")
        sp.wait_for_timeout(4000)
        shot(sp, "01-student-live-lab-list")
        note("student", "live-lab list:\n" + body_text(sp)[:700])

        # Join the active session
        joined = False
        try:
            sp.get_by_text("Join Live Room").first.click(timeout=8000)
            joined = True
        except Exception as e:
            note("student", f"could not find 'Join Live Room': {e}")
        sp.wait_for_timeout(4000)
        note("student", f"after join click url={sp.url}")
        shot(sp, "02-student-prejoin")
        if joined:
            note("student", "prejoin screen:\n" + body_text(sp)[:900])

        # Walk the join steps: look for the primary advance button on each step
        for i in range(6):
            txt = body_text(sp)
            step = "?"
            for s in ("Device Permissions", "Attendance", "Video", "Workspace", "Pre-flight", "Permissions"):
                if s.lower() in txt.lower():
                    step = s
                    break
            note("student", f"join step {i}: looks like '{step}'")
            shot(sp, f"03-student-join-step-{i}-{step.replace(' ','_')[:18]}")

            advanced = False
            for label in ("Continue", "Next", "Join Session", "Join Room", "Join Now",
                          "Enter Room", "Enter Session", "Join Live", "Start Session",
                          "Allow & Continue", "Proceed"):
                try:
                    btn = sp.get_by_role("button", name=re.compile(label, re.I)).first
                    if btn.is_visible(timeout=1200):
                        btn.click(timeout=4000)
                        note("student", f"clicked '{label}'")
                        advanced = True
                        sp.wait_for_timeout(3500)
                        break
                except Exception:
                    continue
            if not advanced:
                note("student", f"no advance button found on step {i}; stopping walk")
                break

        sp.wait_for_timeout(4000)
        shot(sp, "04-student-room")
        note("student", "room screen:\n" + body_text(sp)[:1200])
        note("student", f"final url {sp.url}")

        # Is the screen actually being shared?
        share_state = sp.evaluate("""() => {
          const vids = [...document.querySelectorAll('video')];
          return { videos: vids.length,
                   playing: vids.filter(v => v.readyState > 2 && !v.paused).length,
                   overlay: !!document.body.innerText.match(/Screen sharing is required/i) };
        }""")
        note("student", f"share/overlay state: {json.dumps(share_state)}")

        # Let frames accumulate so the instructor has something to look at
        note("student", "holding in the room 35s so screenshots + signals accumulate")
        sp.wait_for_timeout(35000)
        shot(sp, "05-student-room-settled")

        # ─────────────────────── INSTRUCTOR ───────────────────────
        ic = browser.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        watch(ip, "instructor")
        login(ip, *INSTRUCTOR, "instructor")
        shot(ip, "10-instructor-dashboard")

        ip.goto(f"{BASE}/instructor/sessions", wait_until="domcontentloaded")
        ip.wait_for_timeout(4500)
        shot(ip, "11-instructor-sessions")
        note("instructor", "sessions list:\n" + body_text(ip)[:900])

        try:
            ip.get_by_text(re.compile("Open Conductor", re.I)).first.click(timeout=8000)
            note("instructor", "clicked 'Open Conductor'")
        except Exception as e:
            note("instructor", f"no Open Conductor button: {e}")
        ip.wait_for_timeout(6000)
        shot(ip, "12-instructor-conductor")
        note("instructor", f"conductor url={ip.url}")
        note("instructor", "conductor screen:\n" + body_text(ip)[:1500])

        # What does the default view show?
        tiles = ip.evaluate("""() => {
          const imgs = [...document.querySelectorAll('img')];
          const vids = [...document.querySelectorAll('video')];
          return { imgs: imgs.length, dataUrlImgs: imgs.filter(i => (i.src||'').startsWith('data:')).length,
                   videos: vids.length, playing: vids.filter(v => v.readyState > 2).length };
        }""")
        note("instructor", f"default view media: {json.dumps(tiles)}")

        # Click the student row -> live screen panel
        clicked = False
        for sel in ["text=Rahul", "text=SKIT2026001"]:
            try:
                el = ip.locator(sel).first
                if el.is_visible(timeout=2500):
                    el.click(timeout=4000)
                    clicked = True
                    note("instructor", f"clicked student row via {sel}")
                    break
            except Exception:
                continue
        ip.wait_for_timeout(6000)
        shot(ip, "13-instructor-clicked-student")
        after = ip.evaluate("""() => {
          const vids = [...document.querySelectorAll('video')];
          const panel = document.body.innerText.match(/Live screen[^\n]*|No live track[^\n]*|Not sharing a screen[^\n]*/);
          return { videos: vids.length,
                   playing: vids.filter(v=>v.readyState>2).length,
                   big: vids.filter(v=>v.clientWidth>500).map(v=>({w:v.clientWidth,h:v.clientHeight,rs:v.readyState})),
                   banner: panel ? panel[0] : null };
        }""")
        note("instructor", f"clicked={clicked} panel media: {json.dumps(after)}")
        note("instructor", "panel text:\n" + body_text(ip)[:1200])

        # Prove the panel is LIVE: two shots 9s apart must differ
        import hashlib
        ip.wait_for_timeout(9000)
        shot(ip, "13b-instructor-live-later")
        h1 = hashlib.md5((SHOTS / "13-instructor-clicked-student.png").read_bytes()).hexdigest()
        h2 = hashlib.md5((SHOTS / "13b-instructor-live-later.png").read_bytes()).hexdigest()
        note("instructor", f"frames differ across 9s => live={h1 != h2}")

        # Close and reopen via the Screen button
        try:
            ip.keyboard.press("Escape")
            ip.wait_for_timeout(1200)
            ip.get_by_role("button", name=re.compile("^Screen$", re.I)).first.click(timeout=4000)
            ip.wait_for_timeout(3000)
            note("instructor", "reopened via 'Screen' button")
            shot(ip, "13c-instructor-screen-button")
        except Exception as e:
            note("instructor", f"Screen button not usable: {e}")
        ip.wait_for_timeout(2000)
        shot(ip, "14-instructor-controls")

        (SHOTS / "roleplay-log.json").write_text(json.dumps(log, indent=2))
        print("\n=== FAILED API CALLS ===")
        for f in sorted(set(log["failed"])):
            print(" ", f)
        print("\n=== CONSOLE ERRORS ===")
        for c in sorted(set(log["console"]))[:40]:
            print(" ", c)

        sc.close()
        ic.close()
        browser.close()


if __name__ == "__main__":
    main()
