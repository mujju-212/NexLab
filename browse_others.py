"""browse_others.py — screenshot the pages where the audit flagged fake fallbacks."""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/screenshots")
SHOTS.mkdir(exist_ok=True)

RUNS = [
    ("institution", "admin@skit.edu.in", "SkitAdmin@2026", [
        ("inst_analytics", "/institution/analytics"),
        ("inst_sessions", "/institution/sessions"),
        ("inst_dashboard", "/institution/dashboard"),
    ]),
    ("student", "rahul.sharma@skit.edu.in", "Student@2026", [
        ("stud_analytics", "/student/analytics"),
        ("stud_dashboard", "/student/dashboard"),
    ]),
]


def run():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        for role, email, pw, pages in RUNS:
            ctx = b.new_context(viewport={"width": 1600, "height": 1150})
            pg = ctx.new_page()
            pg.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=30000)
            pg.fill('input[type="email"]', email)
            pg.fill('input[type="password"]', pw)
            pg.click('button:has-text("Sign In")')
            pg.wait_for_url("**/dashboard**", timeout=40000)
            print(f"\n== {role} ==  landed {pg.url}")
            time.sleep(2)
            for name, path in pages:
                pg.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=90000)
                pg.wait_for_timeout(4000)
                pg.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)
                print(f"  shot {name}  text={len(pg.inner_text('body'))}")
            ctx.close()
        b.close()


run()
