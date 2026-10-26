"""Pinpoint the '<path> d: M ' console error source on the student analytics page."""
import re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True)
    page = br.new_page(viewport={"width": 1600, "height": 1000})
    errs = []
    page.on("console", lambda m: errs.append((m.type, m.text, m.location))
            if m.type in ("error", "warning") else None)
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.wait_for_timeout(2000)
    inp = page.locator("input")
    inp.nth(0).fill("rahul.sharma@skit.edu.in"); inp.nth(1).fill("Student@2026")
    page.get_by_role("button", name=re.compile("sign in", re.I)).first.click()
    page.wait_for_timeout(5000)
    if "/login" in page.url:
        inp = page.locator("input")
        inp.nth(0).fill("rahul.sharma@skit.edu.in"); inp.nth(1).fill("Student@2026")
        page.get_by_role("button", name=re.compile("sign in", re.I)).first.click()
        page.wait_for_timeout(5000)
    page.goto(f"{BASE}/student/analytics", wait_until="domcontentloaded")
    page.wait_for_timeout(6000)

    # Which SVGs have a malformed path?
    bad = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('path').forEach(p => {
            const d = p.getAttribute('d') || '';
            if (d.trim().length <= 2 || /NaN|undefined/.test(d)) {
                const card = p.closest('[class]');
                out.push({d: d.slice(0, 40), cls: card ? card.className.toString().slice(0, 80) : '',
                          parentText: (p.parentElement && p.parentElement.parentElement
                                       ? p.parentElement.parentElement.innerText : '').slice(0, 80)});
            }
        });
        return out;
    }""")
    print("bad paths:", bad)
    for e in errs:
        print(e)
    br.close()
