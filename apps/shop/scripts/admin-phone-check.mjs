// The shop admin at phone width in a real browser (plan 13.11): the busiest pages must not scroll sideways and must
// open without a page crash. Runs the real admin through admin-fixture.html with sample orders and books and no shop data
// (src/adminFixture/main.ts). CI job `shop-admin-phone` runs it on every pull request.
//
//   node scripts/admin-phone-check.mjs
//   CHROMIUM_PATH=/path/to/chrome node scripts/admin-phone-check.mjs
import { chromium } from "playwright";
import { createServer } from "vite";

const PAGES = (process.env.ADMIN_PAGES || "overview,orders,orders/o1,customers,inventory,catalog,discounts,giftCards,reviews,messages,settings/general,settings/shipping,settings/payments,settings/google,channels,social-posts").split(",");
const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const origin = new URL(base).origin;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = false;
const check = (ok, what, detail = "") => { console.log(`  ${ok ? "✓" : "✗"} ${what}${ok || !detail ? "" : ` — ${detail}`}`); if (!ok) failed = true; };

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  console.log(`\n▸ ${PAGES.length} admin pages at 390 pixels wide`);
  for (const hash of PAGES) {
    const page = await context.newPage();
    const crashes = [];
    page.on("pageerror", (e) => crashes.push(e.message));
    await page.route("**/*", (route) => (new URL(route.request().url()).origin === origin || route.request().url().startsWith("data:") ? route.continue() : route.abort()));
    await page.goto(`${base}/admin-fixture.html?page=${encodeURIComponent(hash)}`);
    await page.waitForSelector("main, [data-admin-theme], .admin-reso", { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const m = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText.length }));
    check(m.text > 50, `${hash}: opens with content`, `${m.text} characters`);
    check(m.scroll <= m.width + 1, `${hash}: does not scroll sideways`, `${m.scroll}px of content in ${m.width}px`);
    check(crashes.length === 0, `${hash}: no page crash`, crashes.join(" | "));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
