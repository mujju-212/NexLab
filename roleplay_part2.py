"""
roleplay_part2.py — continue the walk as a real instructor and a real student.

Instructor: Present & Teach, Video tab tiles, Control & Comms (broadcast,
message, media controls, force-submit), session End.
Student   : workspace loads, chat, raise hand, code run/submit, and the
            compulsory-share enforcement (stop sharing -> gate + proctor event,
            reshare -> back to normal).
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

R = {"instructor": [], "student": []}
def rec(who, k, v):
    R[who].append({k: v})
    print(f"[{who}] {k}: {str(v)[:400]}", flush=True)


def login(page, email, pw):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(2200)
    i = page.locator("input")
    i.nth(0).fill(email)
    i.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
    page.wait_for_timeout(4000)


def txt(page, n=1400):
    try:
        return re.sub(r"\n{2,}", "\n", page.locator("body").inner_text())[:n]
    except Exception:
        return "<none>"


def click_first(page, labels, who, tag):
    for lab in labels:
        try:
            b = page.get_by_role("button", name=re.compile(lab, re.I)).first
            if b.is_visible(timeout=1000):
                b.click(timeout=3500)
                rec(who, f"clicked_{tag}", lab)
                return lab
        except Exception:
            continue
    rec(who, f"clicked_{tag}", "NONE FOUND")
    return None


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=False, args=ARGS)

        # ─── STUDENT ───
        sc = br.new_context(viewport={"width": 1440, "height": 900},
                            permissions=["camera", "microphone"])
        sc.grant_permissions(["camera", "microphone"])
        sp = sc.new_page()
        serrs = []
        sp.on("console", lambda m: serrs.append(m.text[:160]) if m.type == "error" else None)
        login(sp, "rahul.sharma@skit.edu.in", "Student@2026")
        sp.goto(f"{BASE}/student/live-lab/{SESSION_ID}", wait_until="domcontentloaded")
        sp.wait_for_timeout(8000)
        if sp.get_by_text("Screen sharing is required").count():
            click_first(sp, ["Share my screen"], "student", "share")
            sp.wait_for_timeout(6000)
        rec("student", "overlay_gone", sp.get_by_text("Screen sharing is required").count() == 0)

        # workspace tab
        click_first(sp, ["^Experiment$", "Experiment"], "student", "experiment_tab")
        sp.wait_for_timeout(4000)
        sp.screenshot(path=str(SHOTS / "30-student-workspace.png"))
        rec("student", "workspace_text", txt(sp, 1200))
        rec("student", "editor_present", sp.locator("textarea, .monaco-editor, [contenteditable='true']").count())

        # run code
        click_first(sp, ["Run", "Execute"], "student", "run")
        sp.wait_for_timeout(5000)
        rec("student", "after_run_text", txt(sp, 600))
        sp.screenshot(path=str(SHOTS / "31-student-run.png"))

        # chat
        try:
            inp = sp.locator("input[placeholder*='essage'], textarea[placeholder*='essage']").first
            if inp.is_visible(timeout=2000):
                inp.fill("Sir, I have a doubt at the midpoint calculation.")
                inp.press("Enter")
                rec("student", "chat_sent", True)
        except Exception as e:
            rec("student", "chat_sent", f"FAILED {str(e)[:80]}")
        sp.wait_for_timeout(2500)
        sp.screenshot(path=str(SHOTS / "32-student-chat.png"))

        # raise hand
        click_first(sp, ["Raise Hand", "Hand"], "student", "raise_hand")
        sp.wait_for_timeout(1200)

        # ── compulsory enforcement: stop sharing ──
        stopped = sp.evaluate("""async () => {
          try {
            const vids = [...document.querySelectorAll('video')];
            return {videos: vids.length};
          } catch(e) { return {err: String(e)}; }
        }""")
        # Use the in-app control if visible, otherwise stop the raw track
        stoppedVia = click_first(sp, ["Stop sharing", "Stop Sharing", "Stop"], "student", "stop_share")
        if stoppedVia == "NONE FOUND":
            sp.evaluate("""() => {
              const t = window.__lkScreenTrack;
              return !!(t && t.stop && (t.stop(), true));
            }""")
        sp.wait_for_timeout(6000)
        rec("student", "overlay_after_stop", sp.get_by_text("Screen sharing is required").count() > 0)
        sp.screenshot(path=str(SHOTS / "33-student-share-stopped.png"))
        # resume
        if sp.get_by_text("Screen sharing is required").count():
            click_first(sp, ["Share my screen"], "student", "reshare")
            sp.wait_for_timeout(6000)
        rec("student", "overlay_after_reshare", sp.get_by_text("Screen sharing is required").count() > 0)

        # ─── INSTRUCTOR ───
        ic = br.new_context(viewport={"width": 1600, "height": 950})
        ip = ic.new_page()
        ierrs = []
        ip.on("console", lambda m: ierrs.append(m.text[:160]) if m.type == "error" else None)
        login(ip, "anitha.rao@skit.edu.in", "Instructor@2026")
        ip.goto(f"{BASE}/instructor/sessions/{SESSION_ID}/live", wait_until="domcontentloaded")
        ip.wait_for_timeout(10000)

        for tabname, tag in [("Present & Teach", "present"), ("Video", "video"), ("Control & Comms", "control")]:
            try:
                ip.get_by_role("button", name=re.compile(tabname.replace("&", r"\&"), re.I)).first.click(timeout=5000)
                ip.wait_for_timeout(4500)
                ip.screenshot(path=str(SHOTS / f"40-instructor-{tag}.png"))
                rec("instructor", f"tab_{tag}_text", txt(ip, 1100))
            except Exception as e:
                rec("instructor", f"tab_{tag}", f"FAILED {str(e)[:80]}")

        # video tab: does a tile carry the 30s screenshot / can I click it?
        ip.get_by_role("button", name=re.compile("Video", re.I)).first.click()
        ip.wait_for_timeout(4000)
        tiles = ip.evaluate("""() => {
          const imgs=[...document.querySelectorAll('img')];
          return { dataUrlImgs: imgs.filter(i=>(i.src||'').startsWith('data:')).length,
                   total: imgs.length };
        }""")
        rec("instructor", "video_tab_images", json.dumps(tiles))
        ip.screenshot(path=str(SHOTS / "41-instructor-video-tiles.png"))

        # back to SPARK, then control tab: broadcast
        ip.get_by_role("button", name=re.compile("Control & Comms", re.I)).first.click()
        ip.wait_for_timeout(3000)
        rec("instructor", "control_buttons", ip.evaluate("""() => {
          return [...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean).slice(0,60);
        }"""))

        # broadcast
        try:
            ta = ip.locator("textarea, input[placeholder*='roadcast'], input[placeholder*='essage']").first
            if ta.is_visible(timeout=2500):
                ta.fill("Wrap up your binary search in 5 minutes.")
                click_first(ip, ["Send", "Broadcast"], "instructor", "broadcast")
                ip.wait_for_timeout(2500)
                rec("instructor", "broadcast_sent", True)
        except Exception as e:
            rec("instructor", "broadcast_sent", f"FAILED {str(e)[:100]}")
        ip.screenshot(path=str(SHOTS / "42-instructor-controls.png"))
        sp.wait_for_timeout(1500)
        rec("student", "sees_broadcast", "Wrap up your binary search" in txt(sp, 2500))
        sp.screenshot(path=str(SHOTS / "34-student-received-broadcast.png"))

        # mode switch
        click_first(ip, ["Paused"], "instructor", "mode_paused")
        ip.wait_for_timeout(3000)
        rec("student", "sees_pause", "Paused" in txt(sp, 2500) or "paused" in txt(sp, 2500))
        click_first(ip, ["^Working$", "Working"], "instructor", "mode_working")

        rec("instructor", "console_errors", json.dumps(sorted(set(ierrs))[:8]))
        rec("student", "console_errors", json.dumps(sorted(set(serrs))[:8]))

        (SHOTS / "roleplay-part2.json").write_text(json.dumps(R, indent=2))
        br.close()


if __name__ == "__main__":
    main()
