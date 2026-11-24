import { chromium } from "playwright";
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [w,h,n] of [[1440,900,"desktop"],[390,844,"phone"]]) {
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto("http://localhost:5199/studio-fixture.html#designer?tab=themes");
await page.locator('[data-look-filter="websites"]').click({ timeout: 240000 });
const card = page.locator('[data-theme-card="preset:aurel-editorial"]');
await card.scrollIntoViewIfNeeded(); await card.hover();
await card.getByRole("button", { name: /^Preview$/ }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${out}/aurel-new-${n}.png` }); console.log("shot",n);
const f = page.frameLocator("iframe").first();
await f.locator('[data-studio-label="Product grid"]').first().scrollIntoViewIfNeeded().catch(()=>{});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${out}/aurel-new-${n}-grid.png` });
await page.close();
}
await browser.close();
