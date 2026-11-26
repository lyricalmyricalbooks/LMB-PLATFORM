// Pictures of every starter in each of its colours, for the website cards on Online store and in the setup guide
// (admin/websitePicker). Real screenshots of the demo shop, never a drawing. Run after changing a starter:
//   npx vite --port 5199 --strictPort  (in another terminal), then  node scripts/starter-thumbs.mjs
// Writes public/starters/thumbs/<starter>-<style>.jpg (720×450). websitePicker.test.ts fails when one is missing.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
// The control room keeps every starter with its colours (its list is checked against the shop's in starterSites.test.js).
import { STARTERS } from "../../../control-room/starterSites.js";

const base = process.env.DEMO_URL || "http://localhost:5199";
const out = fileURLToPath(new URL("../public/starters/thumbs/", import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.5 });
const jobs = STARTERS.flatMap((s) => s.styles.map((style) => [s.id, style.id]));
for (let i = 0; i < jobs.length; i += 6) {
  await Promise.all(jobs.slice(i, i + 6).map(async ([starter, style]) => {
    const page = await context.newPage();
    await page.goto(`${base}/demo.html?starter=${starter}&style=${style}&frame=1`);
    await page.waitForTimeout(2500);
    // The demo's router reads the address it was opened at: send it home.
    await page.evaluate(() => { history.pushState(null, "", "/"); dispatchEvent(new PopStateEvent("popstate")); });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}${starter}-${style}.jpg`, type: "jpeg", quality: 72 });
    await page.close();
    console.log(starter, style);
  }));
}
await browser.close();
