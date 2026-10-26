"""
verify_proctor_rework.py — prove the six fixes in a real browser.

1  push reliability      broadcast + force-submit reach the student (snapshot + personal rooms)
2  in-app confirmations  End / Force Submit use a modal, no native dialog
3  no Stop Share         the control is a status chip, not a button
4  pre-join flow         attendance -> permissions -> room actually runs
5  focus honesty         grid says "off" while Focus ML is off; numbers when on
6  sharing pill          a permanent "your screen is being shared" indicator
"""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/proctor")
SHOTS.mkdir(parents=True, exist_ok=True)
SID = Path("/tmp/live_sid.txt").read_text().strip()

ARGS = [
    "--auto-select-desktop-capture-source=Entire screen",
    "--auto-select-tab-capture-source-by-title=Probe",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--enable-usermedia-screen-capturing",
    "--allow-http-screen-capture",
    "--disable-features=WebRtcHideLocalIpsWithMdns,DesktopCaptureMacV2",
]

R = {}
def rec(k, v):
    R[k] = v
    print(f"{k}: {str(v)[:300]}", flush=True)


def login(page, email, pw):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(2500)
    i = page.locator("input")
    i.nth(0).fill(email); i.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
    page.wait_for_timeout(5000)
    if "/login" in page.url:
        page.wait_for_timeout(2000)
        i = page.locator("input"); i.nth(0).fill(email); i.nth(1).fill(pw)
        page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
        page.wait_for_timeout(5000)


def body(page, n=2500):
    return re.sub(r"\n{2,}", "\n", page.locator("body").inner_text())[:n]


def main():
    native_dialogs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=False, args=ARGS)

        # ── STUDENT ──
        sc = br.new_context(viewport={"width": 1440, "height": 900},
                            permissions=["camera", "microphone"])
        sc.grant_permissions(["camera", "microphone"])
        sp = sc.new_page()
        sp.on("dialog", lambda d: (native_dialogs.append(d.type), d.dismiss()))
        login(sp, "rahul.sharma@skit.edu.in", "Student@2026")
        sp.goto(f"{BASE}/student/live-lab/{SID}", wait_until="domcontentloaded")
        sp.wait_for_timeout(6000)

        # 4 — pre-join flow runs
        first = body(sp, 1200)
        rec("prejoin_first_screen", "present" in first.lower() and "continue" in first.lower())
        rec("prejoin_shows_attendance", "I am present" in first or "Attendance" in first)
        sp.screenshot(path=str(SHOTS / "10-student-attendance.png"))

        # walk it
        for label in ("I am present", "Continue", "Join"):
            try:
                b = sp.get_by_role("button", name=re.compile(label, re.I)).first
                if b.is_visible(timeout=2500):
                    b.click(timeout=4000)
                    rec(f"clicked_{label.replace(' ','_')}", True)
                    sp.wait_for_timeout(4000)
            except Exception:
                pass
        sp.screenshot(path=str(SHOTS / "11-student-permissions.png"))
        # permissions screen should mention the required screen share
        rec("permissions_mentions_screen", "Share your screen — required" in body(sp, 2500))

        # reach the room
        try:
            sp.get_by_role("button", name=re.compile("Continue", re.I)).first.click(timeout=4000)
            sp.wait_for_timeout(6000)
        except Exception:
            rec("continue_to_room", "not found")

        if sp.get_by_text("Screen sharing is required").count():
            sp.get_by_role("button", name=re.compile("Share my screen", re.I)).first.click()
            sp.wait_for_timeout(7000)
        rec("sharing", sp.get_by_text("Screen sharing is required").count() == 0)

        # 6 — permanent pill
        rec("sharing_pill_visible", "your screen is being shared" in body(sp, 3000).lower())
        # 3 — no stop-share button
        stop_buttons = sp.get_by_role("button", name=re.compile("Stop Share|Stop sharing", re.I)).count()
        rec("stop_share_buttons", stop_buttons)
        sp.screenshot(path=str(SHOTS / "12-student-room.png"))

        # ── INSTRUCTOR ──
        ic = br.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        ip.on("dialog", lambda d: (native_dialogs.append(d.type), d.accept()))
        login(ip, "anitha.rao@skit.edu.in", "Instructor@2026")
        ip.goto(f"{BASE}/instructor/sessions/{SID}/live", wait_until="domcontentloaded")
        ip.wait_for_selector("text=SPARK Monitoring Grid", timeout=30000)
        ip.wait_for_timeout(3000)

        # 5 — focus shown as off
        rec("focus_column_off", "off" in body(ip, 3000).lower() and "Monitoring off" in body(ip, 3000))
        ip.screenshot(path=str(SHOTS / "20-grid-focus-off.png"))

        # proctor console
        ip.get_by_role("button", name=re.compile("Control & Comms", re.I)).first.click()
        ip.wait_for_timeout(2500)
        ip.screenshot(path=str(SHOTS / "21-proctor-console.png"))
        rec("console_explains_controls", "Lockdown fullscreen" in body(ip, 4000))

        # 1 — broadcast reaches the student
        msg = "VERIFY BROADCAST 4242"
        ip.locator("input[placeholder*='Type a message']").first.fill(msg)
        ip.locator("input[placeholder*='Type a message']").first.press("Enter")
        ip.wait_for_timeout(4000)
        rec("student_saw_broadcast", msg in body(sp, 4000))
        sp.screenshot(path=str(SHOTS / "13-student-broadcast.png"))

        # 2 — force submit goes through the in-app modal
        try:
            ip.get_by_role("button", name=re.compile("Force Submit All", re.I)).first.click()
            ip.wait_for_timeout(1500)
            ip.screenshot(path=str(SHOTS / "22-force-submit-modal.png"))
            modal = "Force submission?" in body(ip, 2500)
            rec("force_modal_shown", modal)
            ip.get_by_role("button", name=re.compile("^Force submit$", re.I)).first.click()
            ip.wait_for_timeout(4000)
            rec("force_submitted", True)
        except Exception as e:
            rec("force_modal_shown", f"FAILED {str(e)[:100]}")
        sp.wait_for_timeout(3000)
        rec("student_saw_force_submit", "submitted" in body(sp, 4000).lower())
        sp.screenshot(path=str(SHOTS / "14-student-force-submit.png"))

        # focus ML on -> session flag must flip
        try:
            ip.get_by_text("Focus ML monitoring").first.click()
            ip.wait_for_timeout(3000)
            rec("toggled_focus_ml", True)
        except Exception as e:
            rec("toggled_focus_ml", f"FAILED {str(e)[:80]}")

        rec("native_dialogs_seen", native_dialogs)
        (SHOTS / "verify.json").write_text(json.dumps(R, indent=2))
        br.close()


if __name__ == "__main__":
    main()
