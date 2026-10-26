"""
live_screen_proof.py — the requirement, proved or disproved.

1. Student joins the live lab and screen sharing must be ON (it is compulsory).
2. Instructor opens the conductor: no student screens shown by default.
3. Instructor clicks one student -> that student's live screen appears.
4. Two captures 10s apart must differ, i.e. it is genuinely live video,
   not a still frame.
5. The 30-second screenshot frames keep arriving at the same time.
"""
import hashlib
import json
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/roleplay")
SHOTS.mkdir(parents=True, exist_ok=True)
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
    print(f"{k}: {v}", flush=True)


def login(page, email, pw):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(2200)
    i = page.locator("input")
    i.nth(0).fill(email)
    i.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
    page.wait_for_timeout(4000)


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=False, args=ARGS)

        # ── student ──────────────────────────────────────────────
        sc = br.new_context(viewport={"width": 1440, "height": 900},
                            permissions=["camera", "microphone"])
        sc.grant_permissions(["camera", "microphone"])
        sp = sc.new_page()
        errs = []
        sp.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        login(sp, "rahul.sharma@skit.edu.in", "Student@2026")
        sp.goto(f"{BASE}/student/live-lab/{SESSION_ID}", wait_until="domcontentloaded")
        sp.wait_for_timeout(9000)

        def share_state():
            return sp.evaluate("""() => {
              const overlay = !!document.body.innerText.match(/Screen sharing is required/i);
              const vids = [...document.querySelectorAll('video')];
              return { overlay, videos: vids.length,
                       playing: vids.filter(v => v.readyState > 2 && !v.paused).length };
            }""")

        st = share_state()
        rec("student_overlay_after_auto_attempt", st["overlay"])
        sp.screenshot(path=str(SHOTS / "20-student-autoshare-attempt.png"))

        if st["overlay"]:
            # A click is a user gesture; the overlay button is the retry path.
            try:
                sp.get_by_role("button", name=re.compile("Share my screen", re.I)).first.click(timeout=5000)
                rec("clicked_share_button", True)
            except Exception as e:
                rec("clicked_share_button", f"FAILED {e}")
            sp.wait_for_timeout(9000)

        st2 = share_state()
        rec("student_overlay_after_button", st2["overlay"])
        sp.screenshot(path=str(SHOTS / "21-student-after-share.png"))

        # Did LiveKit actually publish a screen track?
        pub = sp.evaluate("""() => {
          const vids = [...document.querySelectorAll('video')];
          return vids.map(v => ({w: v.videoWidth, h: v.videoHeight, paused: v.paused, rs: v.readyState}));
        }""")
        rec("student_video_elements", json.dumps(pub))

        # ── instructor ───────────────────────────────────────────
        ic = br.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        ierrs = []
        ip.on("console", lambda m: ierrs.append(m.text[:200]) if m.type == "error" else None)
        login(ip, "anitha.rao@skit.edu.in", "Instructor@2026")
        ip.goto(f"{BASE}/instructor/sessions/{SESSION_ID}/live", wait_until="domcontentloaded")
        ip.wait_for_timeout(11000)
        ip.screenshot(path=str(SHOTS / "22-instructor-default-view.png"))

        default = ip.evaluate("""() => {
          const vids = [...document.querySelectorAll('video')];
          return { panel_open: !!document.body.innerText.match(/Live screen|No live track/i),
                   big_videos: vids.filter(v => v.clientWidth > 500).length,
                   text_has_grid: !!document.body.innerText.match(/SPARK Monitoring Grid/i) };
        }""")
        rec("instructor_default", json.dumps(default))

        # click the student row
        try:
            ip.locator("tbody tr").first.click(timeout=6000)
            rec("clicked_row", True)
        except Exception as e:
            rec("clicked_row", f"FAILED {e}")
        ip.wait_for_timeout(7000)
        ip.screenshot(path=str(SHOTS / "23-instructor-panel-open.png"))

        panel = ip.evaluate("""() => {
          const txt = document.body.innerText;
          const vids = [...document.querySelectorAll('video')];
          const big = vids.filter(v => v.clientWidth > 500);
          return {
            banner: (txt.match(/Live screen[^\\n]*|No live track[^\\n]*|Not sharing[^\\n]*/) || [null])[0],
            big_videos: big.length,
            big_playing: big.filter(v => v.readyState > 2 && !v.paused && v.videoWidth > 0).length,
            big_dims: big.map(v => `${v.videoWidth}x${v.videoHeight}`),
            has_strip: /screenshot/i.test(txt),
          };
        }""")
        rec("panel_after_click", json.dumps(panel))

        h1 = hashlib.md5((SHOTS / "23-instructor-panel-open.png").read_bytes()).hexdigest()
        ip.wait_for_timeout(10000)
        ip.screenshot(path=str(SHOTS / "24-instructor-panel-10s-later.png"))
        h2 = hashlib.md5((SHOTS / "24-instructor-panel-10s-later.png").read_bytes()).hexdigest()
        rec("live_video_changes", h1 != h2)

        panel2 = ip.evaluate("""() => {
          const big = [...document.querySelectorAll('video')].filter(v => v.clientWidth > 500);
          return { big_playing: big.filter(v => v.readyState > 2 && !v.paused).length };
        }""")
        rec("panel_still_playing_after_10s", json.dumps(panel2))

        rec("student_console_errors", json.dumps(sorted(set(errs))[:6]))
        rec("instructor_console_errors", json.dumps(sorted(set(ierrs))[:6]))

        (SHOTS / "live-screen-proof.json").write_text(json.dumps(R, indent=2))
        br.close()


if __name__ == "__main__":
    main()
