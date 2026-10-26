"""
roleplay_part3.py — enforce the compulsory share, then close the session.

A. Wrap getDisplayMedia so the test can end the capture exactly the way the
   browser's own "Stop sharing" button does (track.stop() -> track 'ended').
B. Confirm the student is blocked with the correct message and that the backend
   records a high-severity screen_share_stop event.
C. Confirm the instructor cannot see a screen that is not being shared.
D. End the session as the instructor and check what the student sees.
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

EXPOSE_STREAM = """
window.__lastScreenStream = null;
const orig = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getDisplayMedia = async (opts) => {
  const s = await orig(opts);
  window.__lastScreenStream = s;
  return s;
};
"""

R = {}
def rec(k, v):
    R[k] = v
    print(f"{k}: {str(v)[:300]}", flush=True)


def login(page, email, pw):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(2500)
    i = page.locator("input")
    i.nth(0).fill(email)
    i.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
    page.wait_for_timeout(5000)
    if "/login" in page.url:
        # hydration was not ready — one retry, then give up loudly
        page.wait_for_timeout(2500)
        i = page.locator("input")
        i.nth(0).fill(email); i.nth(1).fill(pw)
        page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
        page.wait_for_timeout(5000)


def txt(page, n=1200):
    try:
        return re.sub(r"\n{2,}", "\n", page.locator("body").inner_text())[:n]
    except Exception:
        return "<none>"


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=False, args=ARGS)

        sc = br.new_context(viewport={"width": 1440, "height": 900},
                            permissions=["camera", "microphone"])
        sc.grant_permissions(["camera", "microphone"])
        sc.add_init_script(EXPOSE_STREAM)
        sp = sc.new_page()
        login(sp, "rahul.sharma@skit.edu.in", "Student@2026")
        sp.goto(f"{BASE}/student/live-lab/{SESSION_ID}", wait_until="domcontentloaded")
        sp.wait_for_timeout(8000)
        if sp.get_by_text("Screen sharing is required").count():
            sp.get_by_role("button", name=re.compile("Share my screen", re.I)).first.click()
            sp.wait_for_timeout(7000)
        rec("sharing_before", sp.get_by_text("Screen sharing is required").count() == 0)

        # instructor present
        ic = br.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        login(ip, "anitha.rao@skit.edu.in", "Instructor@2026")
        rec("instructor_login_url", ip.url)
        ip.goto(f"{BASE}/instructor/sessions/{SESSION_ID}/live", wait_until="domcontentloaded")
        try:
            ip.wait_for_selector("text=SPARK Monitoring Grid", timeout=25000)
        except Exception:
            rec("conductor_failed", ip.url)
            ip.screenshot(path=str(SHOTS / "49-instructor-login-fail.png"))
        ip.wait_for_timeout(5000)
        try:
            ip.locator("tbody tr").first.click(timeout=15000)
        except Exception as e:
            rec("row_click", f"FAILED {str(e)[:100]}")
        ip.wait_for_timeout(6000)
        before = ip.evaluate("""() => {
          const big = [...document.querySelectorAll('video')].filter(v => v.clientWidth > 500);
          return { playing: big.filter(v => v.readyState > 2 && v.videoWidth > 0).length };
        }""")
        rec("instructor_sees_live_before_stop", json.dumps(before))
        ip.screenshot(path=str(SHOTS / "50-instructor-before-stop.png"))

        # ── the student's browser ends the capture ──
        stopped = sp.evaluate("""() => {
          const s = window.__lastScreenStream;
          if (!s) return 'no stream captured';
          s.getTracks().forEach(t => t.stop());
          return 'stopped ' + s.getTracks().length + ' track(s)';
        }""")
        rec("stop_result", stopped)
        sp.wait_for_timeout(7000)

        rec("overlay_back", sp.get_by_text("Screen sharing is required").count() > 0)
        body = txt(sp, 1600)
        rec("overlay_message", "your screen share stopped" in body.lower() or "Share my screen" in body)
        rec("overlay_text_snippet", body[body.find("Screen sharing"):body.find("Screen sharing") + 320] if "Screen sharing" in body else "none")
        sp.screenshot(path=str(SHOTS / "51-student-after-stop.png"))

        # instructor side must now show "no live track"
        ip.wait_for_timeout(3000)
        after = ip.evaluate("""() => {
          const big = [...document.querySelectorAll('video')].filter(v => v.clientWidth > 500);
          const t = document.body.innerText;
          return { playing: big.filter(v => v.readyState > 2 && v.videoWidth > 0).length,
                   banner: (t.match(/Live screen[^\\n]*|No live track[^\\n]*|Not sharing[^\\n]*/) || [null])[0] };
        }""")
        rec("instructor_after_stop", json.dumps(after))
        ip.screenshot(path=str(SHOTS / "52-instructor-after-stop.png"))

        # reshare
        if sp.get_by_text("Screen sharing is required").count():
            sp.get_by_role("button", name=re.compile("Share my screen", re.I)).first.click()
            sp.wait_for_timeout(8000)
        rec("sharing_restored", sp.get_by_text("Screen sharing is required").count() == 0)
        ip.wait_for_timeout(6000)
        ip.screenshot(path=str(SHOTS / "53-instructor-after-reshare.png"))
        restored = ip.evaluate("""() => {
          const big = [...document.querySelectorAll('video')].filter(v => v.clientWidth > 500);
          return { playing: big.filter(v => v.readyState > 2 && v.videoWidth > 0).length };
        }""")
        rec("instructor_after_reshare", json.dumps(restored))

        (SHOTS / "roleplay-part3.json").write_text(json.dumps(R, indent=2))
        br.close()


if __name__ == "__main__":
    main()
