import asyncio, json, re
from playwright.async_api import async_playwright

BASE="http://localhost:3000"
TABS=["Overview","Students","Experiments","Trends","Mastery","Engagement","Integrity","Rankings","AI Usage"]

async def main():
    out={}
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=["--no-sandbox"])
        ctx=await b.new_context(viewport={"width":1700,"height":1200})
        pg=await ctx.new_page()
        api=[]
        pg.on("response", lambda r: api.append((r.status, r.url.split("/api/")[-1])) if "/api/" in r.url and "analytics" in r.url else None)
        await pg.goto(f"{BASE}/login", wait_until="domcontentloaded")
        await pg.fill('input[type="email"]',"anitha.rao@skit.edu.in")
        await pg.fill('input[type="password"]',"Instructor@2026")
        await pg.click('button[type="submit"]'); await pg.wait_for_timeout(5000)
        await pg.goto(f"{BASE}/instructor/analytics", wait_until="domcontentloaded")
        await pg.wait_for_timeout(5000)
        for tab in TABS:
            try:
                btn = pg.locator(f"button:has-text('{tab}')").first
                await btn.click(timeout=8000)
                await pg.wait_for_timeout(4500)
                txt = await pg.inner_text("body")
                txt = re.sub(r"\s+"," ",txt)
                out[tab]=txt[:1400]
                await pg.screenshot(path=f"/home/user/screenshots/tab_{tab.replace(' ','_').lower()}.png", full_page=True)
                print(f"=== {tab} OK ({len(txt)} chars)")
            except Exception as e:
                print(f"=== {tab} FAILED: {e}")
                out[tab]=f"ERROR {e}"
        print("\nAPI calls seen:")
        for s,u in api: print(" ",s,u[:80])
        await b.close()
    json.dump(out, open("/home/user/tab_text.json","w"), indent=1)
asyncio.run(main())
