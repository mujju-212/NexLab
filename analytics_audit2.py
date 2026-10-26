"""
analytics_audit2.py — institution-admin analytics (12 tabs) + platform admin analytics.
Captures screenshots, console errors, failed requests and full visible text.
"""
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
SHOTS = Path("/home/user/ui-checks/analytics")
SHOTS.mkdir(parents=True, exist_ok=True)

TABS = ["overview", "outcomes", "funnel", "benchmark", "attendance", "grades",
        "integrity", "engagement", "risk", "ai-usage", "instructors"]

R = {"pages": [], "console": [], "failed": []}


def login(page, email, pw):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(2200)
    i = page.locator("input")
    i.nth(0).fill(email); i.nth(1).fill(pw)
    page.get_by_role("button", name=re.compile("sign in|log in", re.I)).first.click()
    page.wait_for_timeout(5000)
    if "/login" in page.url:
        page.wait_for_timeout(2500)
        i = page.locator("input"); i.nth(0).fill(email); i.nth(1).fill(pw)
        page.get_by_role("button", name=re.compile("sign in", re.I)).first.click()
        page.wait_for_timeout(5000)
    return page.url


def text_of(page, n=6000):
    try:
        return re.sub(r"[ \t]{2,}", " ", re.sub(r"\n{2,}", "\n", page.locator("body").inner_text()))[:n]
    except Exception:
        return "<none>"


def main():
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True)

        # ── institution admin ──────────────────────────────────────────
        ctx = br.new_context(viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()
        page.on("console", lambda m: R["console"].append(f"inst: {m.text[:160]}") if m.type == "error" else None)
        page.on("response", lambda r: R["failed"].append(
            f"inst: {r.status} {r.request.method} {r.url.split('/api')[1][:100]}")
            if r.status >= 400 and "/api/" in r.url else None)
        page.on("pageerror", lambda e: R["console"].append(f"inst: PAGEERROR {str(e)[:160]}"))
        print("landed:", login(page, "admin@skit.edu.in", "SkitAdmin@2026"), flush=True)

        for tab in TABS:
            page.goto(f"{BASE}/institution/analytics?tab={tab}", wait_until="domcontentloaded")
            page.wait_for_timeout(5500)
            shot = SHOTS / f"institution-{tab}.png"
            page.screenshot(path=str(shot))
            R["pages"].append({"role": "institution", "tab": tab,
                               "screenshot": shot.name, "text": text_of(page)})
            print(f"[institution] {tab}: {shot.name}", flush=True)
        ctx.close()

        # ── platform admin ─────────────────────────────────────────────
        ctx2 = br.new_context(viewport={"width": 1600, "height": 1000})
        p2 = ctx2.new_page()
        p2.on("console", lambda m: R["console"].append(f"platform: {m.text[:160]}") if m.type == "error" else None)
        p2.on("response", lambda r: R["failed"].append(
            f"platform: {r.status} {r.request.method} {r.url.split('/api')[1][:100]}")
            if r.status >= 400 and "/api/" in r.url else None)
        landed = login(p2, "superadmin@nexlab.io", "SuperAdmin@2026")
        print("platform landed:", landed, flush=True)
        p2.goto(f"{BASE}/admin/analytics", wait_until="domcontentloaded")
        p2.wait_for_timeout(6000)
        p2.screenshot(path=str(SHOTS / "platform-analytics.png"))
        R["pages"].append({"role": "platform", "tab": "analytics",
                           "screenshot": "platform-analytics.png", "text": text_of(p2),
                           "landed": landed, "url": p2.url})
        print("[platform] analytics", p2.url, flush=True)
        ctx2.close()

        (SHOTS / "audit2.json").write_text(json.dumps(R, indent=2))
        print("\n=== FAILED API ===")
        for f in sorted(set(R["failed"])):
            print(" ", f)
        print("\n=== CONSOLE ===")
        for c in sorted(set(R["console"]))[:25]:
            print(" ", c)
        br.close()


if __name__ == "__main__":
    main()
