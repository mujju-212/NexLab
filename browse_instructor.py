"""
browse_instructor.py — drive the real UI in a browser as the instructor.

Logs in through the actual login form (typing into the inputs, clicking
"Sign In"), then walks every instructor page, screenshotting each one and
recording console errors + failed API calls.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/screenshots")
SHOTS.mkdir(exist_ok=True)

EMAIL = "anitha.rao@skit.edu.in"
PASSWORD = "Instructor@2026"

PAGES = [
    ("dashboard",   "/instructor/dashboard"),
    ("subjects",    "/instructor/experiments"),
    ("experiments_new", "/instructor/experiments/new"),
    ("students",    "/instructor/students"),
    ("content",     "/instructor/content"),
    ("analytics",   "/instructor/analytics"),
    ("exams",       "/instructor/exams"),
    ("sessions",    "/instructor/sessions"),
    ("grading",     "/instructor/grading"),
    ("reports",     "/instructor/reports"),
    ("management",  "/instructor/management"),
    ("viva",        "/instructor/viva"),
    ("live-lab",    "/instructor/live-lab"),
    ("settings",    "/instructor/settings"),
]


def main():
    console_errors = []
    failed_requests = []
    api_calls = []

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1600, "height": 1200})
        page = ctx.new_page()

        page.on("console", lambda m: console_errors.append((page.url, m.type, m.text))
                if m.type in ("error",) else None)
        page.on("requestfailed",
                lambda r: failed_requests.append((r.url, r.failure)))

        def on_response(resp):
            if "/api/" in resp.url:
                api_calls.append((resp.status, resp.url.replace(BASE, "")))
        page.on("response", on_response)

        # ── log in through the real form ─────────────────────────────────────
        print("→ opening /login")
        page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60000)
        page.fill('input[type="email"]', EMAIL)
        page.fill('input[type="password"]', PASSWORD)
        page.screenshot(path=str(SHOTS / "00_login_filled.png"))
        print("→ clicking Sign In")
        page.click('button:has-text("Sign In")')
        page.wait_for_url("**/instructor/**", timeout=60000)
        page.wait_for_timeout(2500)
        print(f"   landed on {page.url}")
        page.screenshot(path=str(SHOTS / "01_after_login.png"), full_page=True)

        # ── walk every page ──────────────────────────────────────────────────
        for i, (name, path) in enumerate(PAGES, start=2):
            before = len(api_calls)
            try:
                page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=90000)
                page.wait_for_timeout(2500)
                title = page.title()
                # visible text length — flags blank pages
                body_text = page.inner_text("body")
                text_len = len(body_text.strip())
                shot = SHOTS / f"{i:02d}_{name}.png"
                page.screenshot(path=str(shot), full_page=True)
                new_calls = api_calls[before:]
                bad = [c for c in new_calls if c[0] >= 400]
                print(f"  ✓ {path:<34} text={text_len:5}  api={len(new_calls):2}  "
                      f"failing={len(bad)}")
                if bad:
                    for c in bad:
                        print(f"       ✗ {c[0]} {c[1]}")
            except Exception as e:
                print(f"  ✗ {path:<34} ERROR {type(e).__name__}: {str(e)[:120]}")

        browser.close()

    print("\n" + "=" * 70)
    print(f"console errors : {len(console_errors)}")
    seen = set()
    for url, typ, msg in console_errors:
        key = msg[:120]
        if key in seen:
            continue
        seen.add(key)
        print(f"  · [{typ}] {msg[:220]}")
    print(f"\nfailed requests: {len(failed_requests)}")
    for url, fail in failed_requests[:15]:
        print(f"  · {url[:110]}  ({fail})")
    print(f"\nAPI calls total: {len(api_calls)}")
    from collections import Counter
    c = Counter(code for code, _ in api_calls)
    print("  status breakdown:", dict(c))
    print("\nAPI calls returning >=400:")
    for code, url in sorted({(c2, u) for c2, u in api_calls if c2 >= 400}):
        print(f"  ✗ {code} {url}")


if __name__ == "__main__":
    main()
