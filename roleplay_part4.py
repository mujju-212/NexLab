"""
roleplay_part4.py — last leg of the instructor walk: broadcast, force submit, end.
A student stays in the room the whole time so we can see what they experience.
"""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/roleplay")
SESSION_ID = Path("/tmp/live_sid.txt").read_text().strip()

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
    print(f"{k}: {str(v)[:280]}", flush=True)


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


def body(page, n=2000):
    return re.sub(r"\n{2,}", "\n", page.locator("body").inner_text())[:n]


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=False, args=ARGS)

        sc = br.new_context(viewport={"width": 1440, "height": 900},
                            permissions=["camera", "microphone"])
        sc.grant_permissions(["camera", "microphone"])
        sp = sc.new_page()
        login(sp, "rahul.sharma@skit.edu.in", "Student@2026")
        sp.goto(f"{BASE}/student/live-lab/{SESSION_ID}", wait_until="domcontentloaded")
        sp.wait_for_timeout(8000)
        if sp.get_by_text("Screen sharing is required").count():
            sp.get_by_role("button", name=re.compile("Share my screen", re.I)).first.click()
            sp.wait_for_timeout(7000)
        rec("student_sharing", sp.get_by_text("Screen sharing is required").count() == 0)

        ic = br.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        # End / Force-Submit use native window.confirm(); Playwright dismisses
        # native dialogs by default, which silently cancels the action.
        ip.on("dialog", lambda d: d.accept())
        login(ip, "anitha.rao@skit.edu.in", "Instructor@2026")
        rec("instructor_url", ip.url)
        ip.goto(f"{BASE}/instructor/sessions/{SESSION_ID}/live", wait_until="domcontentloaded")
        ip.wait_for_selector("text=SPARK Monitoring Grid", timeout=30000)
        ip.wait_for_timeout(2000)
        ip.get_by_role("button", name=re.compile("Control & Comms", re.I)).first.click()
        ip.wait_for_timeout(2500)

        # ── broadcast to everyone ──
        msg = "Class, wrap up your binary search in 5 minutes."
        try:
            ta = ip.locator("input[placeholder*='Type a message']").first
            ta.fill(msg)
            # the send control is an icon button at the right of the input
            ip.locator("input[placeholder*='Type a message']").first.press("Enter")
            ip.wait_for_timeout(1200)
            btns = ip.locator("button")
            if not ta.input_value():
                rec("broadcast_via", "enter")
            else:
                # fall back: click the icon button next to the input
                ip.get_by_role("button").nth(0)
                ip.locator("button:has(svg)").last.click()
                rec("broadcast_via", "icon")
            ip.wait_for_timeout(3000)
        except Exception as e:
            rec("broadcast", f"FAILED {str(e)[:120]}")
        ip.screenshot(path=str(SHOTS / "60-instructor-broadcast.png"))
        sp.wait_for_timeout(2500)
        rec("student_saw_broadcast", msg[:30] in body(sp, 3000))
        sp.screenshot(path=str(SHOTS / "61-student-broadcast.png"))

        # ── force submit all ──
        try:
            ip.get_by_role("button", name=re.compile("Force Submit All", re.I)).first.click()
            ip.wait_for_timeout(1200)
            # confirm dialog, if any
            for lab in ["Confirm", "Yes", "Force Submit", "Submit"]:
                try:
                    b = ip.get_by_role("button", name=re.compile(lab, re.I)).last
                    if b.is_visible(timeout=800):
                        b.click(); break
                except Exception:
                    pass
            ip.wait_for_timeout(3500)
            rec("force_submit_clicked", True)
        except Exception as e:
            rec("force_submit_clicked", f"FAILED {str(e)[:100]}")
        sp.wait_for_timeout(2500)
        st = body(sp, 2500)
        rec("student_forced_modal", any(k in st for k in ("submitted", "Session ended", "forced", "Final submission")))
        sp.screenshot(path=str(SHOTS / "62-student-forced.png"))

        # ── end the session ──
        try:
            ip.get_by_role("button", name=re.compile("^End$", re.I)).first.click()
            ip.wait_for_timeout(1500)
            for lab in ["End Session", "Confirm", "Yes, End", "Yes"]:
                try:
                    b = ip.get_by_role("button", name=re.compile(lab, re.I)).last
                    if b.is_visible(timeout=900):
                        b.click(); break
                except Exception:
                    pass
            ip.wait_for_timeout(6000)
            rec("end_clicked", True)
        except Exception as e:
            rec("end_clicked", f"FAILED {str(e)[:120]}")
        ip.screenshot(path=str(SHOTS / "63-instructor-after-end.png"))
        rec("instructor_after_end", body(ip, 900))

        sp.wait_for_timeout(5000)
        sp.screenshot(path=str(SHOTS / "64-student-after-end.png"))
        rec("student_after_end", body(sp, 1200))

        (SHOTS / "roleplay-part4.json").write_text(json.dumps(R, indent=2))
        br.close()


if __name__ == "__main__":
    main()
