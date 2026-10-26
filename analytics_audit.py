"""
analytics_audit.py — walk the analytics of all three roles in a real browser.

For every tab: screenshot, console errors, failed API calls, and the visible
numbers, so we can tell real data from invented data.
"""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/analytics")
SHOTS.mkdir(parents=True, exist_ok=True)

ACCOUNTS = {
    "instructor": ("anitha.rao@skit.edu.in", "Instructor@2026"),
    "student": ("rahul.sharma@skit.edu.in", "Student@2026"),
    "admin": ("admin@skit.edu.in", "SkitAdmin@2026"),
}

INSTRUCTOR_TABS = ["Overview", "Students", "Experiments", "Trends", "Mastery",
                   "Engagement", "Integrity", "Rankings", "AI Usage"]

R = {"pages": [], "console": [], "failed": []}


def login(page, email, pw):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(2200)
    i = page.locator("input")
    i.nth(0).fill(email)
    i.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
    page.wait_for_timeout(5000)
    if "/login" in page.url:
        page.wait_for_timeout(2500)
        i = page.locator("input"); i.nth(0).fill(email); i.nth(1).fill(pw)
        page.get_by_role("button", name=re.compile("sign in", re.I)).first.click()
        page.wait_for_timeout(5000)
    return page.url


def text_of(page, n=2600):
    try:
        return re.sub(r"\n{2,}", "\n", page.locator("body").inner_text())[:n]
    except Exception:
        return "<none>"


def snap(page, name, role):
    path = SHOTS / f"{role}-{name}.png"
    page.screenshot(path=str(path))
    return path.name


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)

        for role, (email, pw) in ACCOUNTS.items():
            ctx = br.new_context(viewport={"width": 1600, "height": 1000})
            page = ctx.new_page()
            tag = role

            def on_console(m, tag=tag):
                if m.type == "error":
                    R["console"].append(f"{tag}: {m.text[:180]}")

            def on_response(r, tag=tag):
                if r.status >= 400 and "/api/" in r.url:
                    R["failed"].append(
                        f"{tag}: {r.status} {r.request.method} "
                        f"{r.url.split('/api')[1][:110]}")

            page.on("console", on_console)
            page.on("response", on_response)
            page.on("pageerror", lambda e, tag=tag: R["console"].append(f"{tag}: PAGEERROR {str(e)[:180]}"))

            landed = login(page, email, pw)
            R.setdefault("landed", {})[role] = landed
            print(f"[{role}] logged in -> {landed}", flush=True)

            if role == "instructor":
                page.goto(f"{BASE}/instructor/analytics", wait_until="domcontentloaded")
                page.wait_for_timeout(6000)
                for tab in INSTRUCTOR_TABS:
                    try:
                        page.get_by_role("button", name=re.compile(tab, re.I)).first.click(timeout=6000)
                    except Exception:
                        try:
                            page.get_by_text(tab, exact=True).first.click(timeout=4000)
                        except Exception:
                            R["pages"].append({"role": role, "tab": tab, "error": "tab not clickable"})
                            continue
                    page.wait_for_timeout(5000)
                    shot = snap(page, tab.lower().replace(" ", "-"), role)
                    body = text_of(page)
                    R["pages"].append({
                        "role": role, "tab": tab, "screenshot": shot,
                        "text": body[:1400],
                    })
                    print(f"[{role}] {tab}: {shot}", flush=True)

            elif role == "student":
                for path, name in [("/student/analytics", "analytics"),
                                   ("/student/rankings", "rankings"),
                                   ("/student/submissions", "submissions")]:
                    page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
                    page.wait_for_timeout(6000)
                    shot = snap(page, name, role)
                    R["pages"].append({"role": role, "tab": name, "screenshot": shot,
                                       "text": text_of(page)[:1400]})
                    print(f"[{role}] {name}: {shot}", flush=True)

            else:  # admin
                for path, name in [("/admin/analytics", "analytics"),
                                   ("/admin/monitoring", "monitoring")]:
                    page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
                    page.wait_for_timeout(6000)
                    shot = snap(page, name, role)
                    R["pages"].append({"role": role, "tab": name, "screenshot": shot,
                                       "text": text_of(page)[:1400]})
                    print(f"[{role}] {name}: {shot}", flush=True)

            ctx.close()

        (SHOTS / "audit.json").write_text(json.dumps(R, indent=2))
        print("\n=== FAILED API CALLS ===")
        for f in sorted(set(R["failed"])):
            print(" ", f)
        print("\n=== CONSOLE ERRORS ===")
        for c in sorted(set(R["console"]))[:30]:
            print(" ", c)
        br.close()


if __name__ == "__main__":
    main()
