import asyncio, json
from playwright.async_api import async_playwright

BASE="http://localhost:3000"
OUT="/home/user/screenshots"

CREDS = [
 ("instructor","anitha.rao@skit.edu.in","Instructor@2026",
   [("/instructor/analytics","an_analytics_after.png")]),
 ("institution","admin@skit.edu.in","SkitAdmin@2026",
   [("/institution/dashboard","an_inst_dashboard_after.png"),
    ("/institution/sessions","an_inst_sessions_after.png")]),
 ("student","rahul.sharma@skit.edu.in","Student@2026",
   [("/student/analytics","an_stud_analytics_after.png")]),
]

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--no-sandbox"])
        for role,email,pw_s, pages in CREDS:
            ctx = await b.new_context(viewport={"width":1600,"height":1100})
            pg = await ctx.new_page()
            await pg.goto(f"{BASE}/login", wait_until="domcontentloaded")
            await pg.fill('input[type="email"]', email)
            await pg.fill('input[type="password"]', pw_s)
            await pg.click('button[type="submit"]')
            await pg.wait_for_timeout(4000)
            await ctx.storage_state(path=f"/tmp/{role}_state.json")
            for path, fname in pages:
                try:
                    await pg.goto(f"{BASE}{path}", wait_until="domcontentloaded")
                    await pg.wait_for_timeout(6000)
                    await pg.screenshot(path=f"{OUT}/{fname}", full_page=True)
                    print("shot", fname)
                except Exception as e:
                    print("ERR", path, e)
            await ctx.close()
        await b.close()

asyncio.run(main())
