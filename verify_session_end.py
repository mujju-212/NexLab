"""
verify_session_end.py — the last two things that mattered:
  * the permissions step is reachable and states the screen-share requirement;
  * ending the session through the in-app modal actually lands on the student:
    ENDED state, capture released, sharing pill gone, no "LIVE" lie.
"""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/proctor")
SID = Path("/tmp/live_sid.txt").read_text().strip()

ARGS = [
    "--auto-select-desktop-capture-source=Entire screen",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--enable-usermedia-screen-capturing",
    "--allow-http-screen-capture",
    "--disable-features=WebRtcHideLocalIpsWithMdns,DesktopCaptureMacV2",
]
R = {}
def rec(k, v):
    R[k] = v
    print(f"{k}: {str(v)[:260]}", flush=True)


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
        page.get_by_role("button", name=re.compile("sign in", re.I)).first.click()
        page.wait_for_timeout(5000)


def body(page, n=2500):
    return re.sub(r"\n{2,}", "\n", page.locator("body").inner_text())[:n]


def main():
    dialogs = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=False, args=ARGS)
        sc = br.new_context(viewport={"width": 1440, "height": 900},
                            permissions=["camera", "microphone"])
        sc.grant_permissions(["camera", "microphone"])
        sp = sc.new_page()
        sp.on("dialog", lambda d: (dialogs.append(d.type), d.dismiss()))
        login(sp, "rahul.sharma@skit.edu.in", "Student@2026")
        sp.goto(f"{BASE}/student/live-lab/{SID}", wait_until="domcontentloaded")
        sp.wait_for_timeout(26000)   # allow the status poll (20s) to catch up too

        rec("step_1_attendance", "I am present" in body(sp, 1500))
        sp.get_by_role("button", name=re.compile("I am present", re.I)).first.click()
        sp.wait_for_timeout(4000)
        rec("step_2_permissions", "Device Permissions" in body(sp, 2500))
        rec("perm_states_screen_required", "Share your screen" in body(sp, 3000))
        sp.screenshot(path=str(SHOTS / "30-permissions-step.png"))
        sp.get_by_role("button", name=re.compile("^Continue$", re.I)).first.click()
        sp.wait_for_timeout(26000)   # allow the status poll (20s) to catch up too
        rec("step_3_room", "Instructor's Presentation" in body(sp, 3000))

        if sp.get_by_text("Screen sharing is required").count():
            sp.get_by_role("button", name=re.compile("Share my screen", re.I)).first.click()
            sp.wait_for_timeout(7000)
        rec("sharing", sp.get_by_text("Screen sharing is required").count() == 0)
        rec("pill_before_end", "your screen is being shared" in body(sp, 3000).lower())

        ic = br.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        ip.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
        login(ip, "anitha.rao@skit.edu.in", "Instructor@2026")
        ip.goto(f"{BASE}/instructor/sessions/{SID}/live", wait_until="domcontentloaded")
        ip.wait_for_selector("text=SPARK Monitoring Grid", timeout=30000)
        ip.wait_for_timeout(3000)

        # End the session through the in-app dialog
        ip.get_by_role("button", name=re.compile("^End$", re.I)).first.click()
        ip.wait_for_timeout(1500)
        rec("end_modal_shown", "End this session?" in body(ip, 2500))
        ip.screenshot(path=str(SHOTS / "31-end-modal.png"))
        ip.get_by_role("button", name=re.compile("^End session$", re.I)).first.click()
        ip.wait_for_timeout(9000)
        rec("instructor_after_end", ip.url)

        sp.wait_for_timeout(26000)   # allow the status poll (20s) to catch up too
        st = body(sp, 3000)
        rec("student_sees_ended", "ENDED" in st)
        rec("student_live_pill_gone", "LIVE" not in st[:600])
        rec("student_sees_reason", "Session ended" in st or "ended by instructor" in st.lower())
        rec("pill_after_end", "your screen is being shared" in st.lower())
        sp.screenshot(path=str(SHOTS / "32-student-after-end.png"))

        rec("native_dialogs", dialogs)
        (SHOTS / "verify-end.json").write_text(json.dumps(R, indent=2))
        br.close()


if __name__ == "__main__":
    main()
