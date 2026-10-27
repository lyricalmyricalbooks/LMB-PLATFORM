// Storefront click-through: serves the built `dist/` (vite preview) and walks a shopper's path in Chromium against the
// live published catalog (public reads only). Fails when a page throws or a step can't be done, so a dependency update
// that crashes the shop is caught before merge. CI job `storefront-smoke` runs it after `vite build`.
//
//   pnpm exec vite build && node scripts/storefront-smoke.mjs
//   CHROMIUM_PATH=/path/to/chrome …   (use an installed Chromium)
//   SMOKE_URL=https://…               (check a running site instead of serving dist/)
//
// It writes nothing: the cookie banner is answered "Reject" (no analytics, no saved cart), automated browsers are never
// counted (trackingGuard), no email is typed at checkout and no payment is attempted. Checkout is filled in up to the
// Pay button (name and a Toronto address, then a delivery choice) and left there.
import { chromium } from "playwright";
import { preview } from "vite";

let server = null;
let base = process.env.SMOKE_URL;
if (!base) {
  server = await preview({ preview: { port: 0, strictPort: false }, logLevel: "error" });
  base = server.resolvedUrls.local[0].replace(/\/$/, "");
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const crashes = [];
const failures = [];
const consoleErrors = [];
const watch = (page, label) => {
  page.on("pageerror", (e) => crashes.push(`${label} ${page.url()}: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = `${label} ${page.url()}: ${m.text().slice(0, 300)}`;
    // Error boundaries catch a component that throws, so it never reaches "pageerror": a section renders nothing and
    // logs "Section … failed to render", a page shows the recovery panel and React logs the caught error.
    if (/failed to render|Storefront render error|error occurred in the <|Uncaught/i.test(m.text())) crashes.push(text);
    else consoleErrors.push(text);
  });
};
const noErrorPanel = async (p) => {
  if (await p.locator("[data-store-region='errorPanel']").count()) throw new Error(`the page shows its error panel (${p.url()})`);
};
const step = async (name, fn, on = page) => {
  const started = Date.now();
  try { await fn(); await noErrorPanel(on); console.log(`✓ ${name} (${Math.round((Date.now() - started) / 1000)}s)`); }
  catch (e) { failures.push(`${name}: ${String(e.message).split("\n")[0]}`); console.log(`✗ ${name} — ${String(e.message).split("\n")[0]}`); }
};

// en-CA: checkout's country guess (from the browser's language) is Canada, so the Toronto address below fits.
const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });
const page = await desktop.newPage();
watch(page, "[desktop]");
const settle = () => page.waitForTimeout(1500);

await step("home shows the catalog", async () => {
  await page.goto(`${base}/`);
  await page.waitForSelector(".fm-card-title", { timeout: 30000 });
});
await step("cookie banner answers Reject", async () => {
  const dialog = page.locator("[role=dialog][aria-label='Cookie consent']");
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator("button").filter({ hasText: /reject/i }).first().click();
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
});
await step("header and footer", async () => {
  await page.waitForSelector("header", { timeout: 5000 });
  await page.waitForSelector("footer", { timeout: 5000 });
});

// Some books are sold out, coming soon or sold in editions: try the first few until one goes in the bag.
const bookLinks = await page.locator("a[href*='/books/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))].slice(0, 8));
let added = false;
await step("a book page opens and a copy goes in the bag", async () => {
  if (!bookLinks.length) throw new Error("no book links on the home page");
  for (const href of bookLinks) {
    await page.goto(new URL(href, base).href);
    await page.waitForSelector(".fm-pdp-title", { timeout: 20000 });
    await settle();
    const edition = page.locator(".fm-pdp-card select").first();
    if (await edition.count()) {
      const values = await edition.locator("option").evaluateAll((os) => os.filter((o) => o.value && !o.disabled).map((o) => o.value));
      if (!values.length) continue;
      await edition.selectOption(values[0]);
    }
    const add = page.locator(".fm-pdp-card button", { hasText: /ADD TO BAG|PRE-ORDER/i }).first();
    if (!(await add.count()) || await add.isDisabled()) continue;
    // The button keeps a hover/press animation running, so Playwright never sees it "stable".
    await add.click({ force: true });
    try { await page.waitForSelector(".fm-bag", { timeout: 8000 }); added = true; break; } catch { /* try the next book */ }
  }
  if (!added) throw new Error(`none of ${bookLinks.length} books could be added to the bag`);
});
await step("the bag leads to checkout", async () => {
  if (!added) throw new Error("skipped: nothing in the bag");
  // The button's words are editable in Studio (Text & labels › Cart); any visible bag button or link naming checkout.
  const go = page.locator(".fm-bag button, .fm-bag a").filter({ hasText: /checkout/i, visible: true }).last();
  await go.scrollIntoViewIfNeeded();
  await go.click({ force: true });
  await page.waitForURL(/\/checkout/, { timeout: 20000 });
  await page.waitForSelector("form input[type=email]", { timeout: 20000 });
  await page.waitForTimeout(4000); // card form and shipping quotes load
});
await step("checkout fills in up to Pay (nothing is sent)", async () => {
  if (!added) throw new Error("skipped: nothing in the bag");
  // Live carrier quotes (Shippo) and the Google address finder cost money per call and count against the shop's daily
  // budgets, so they are cut off here: checkout falls back to the shop's own rates and the free map finder, also when
  // SMOKE_URL points at the live shop.
  await page.route(/\/(getShippoRates|validateAddress)\b/, (route) => route.abort());
  // Field ids come from checkoutDetails.ts (detailInputId); the words on the page are editable in Studio, so none are matched.
  const country = await page.inputValue("#co-field-country");
  if (!/canada/i.test(country)) throw new Error(`country guessed as "${country}", expected Canada`);
  await page.fill("#co-field-name", "Storefront Smoke");
  const ships = await page.locator("#co-field-street").count();
  if (ships) {
    await page.fill("#co-field-street", "100 Queen St W");
    await page.fill("#co-field-city", "Toronto");
    await page.selectOption("#co-field-state", "ON");
    await page.fill("#co-field-zip", "M5H 2N2");
    await page.locator("#co-field-zip").blur();
    // Delivery choices for the address: carrier quotes, the shop's own rates or local pickup.
    const choice = page.locator("input[name=fulfillment-option]").first();
    await choice.waitFor({ timeout: 30000 });
    await choice.check({ force: true });
  }
  // The Pay button is on the page from the start; what proves the steps worked is the payment total: a delivery choice
  // turns its "chosen at the next step" words into an amount. (Pay is never pressed.)
  await page.locator("button[type=submit].fm-co-paybtn-main").waitFor({ timeout: 10000 });
  const total = page.locator("[data-studio-label='Payment total'] strong");
  if (!(await total.count())) throw new Error("no payment total on checkout");
  await page.waitForFunction(() => /\d/.test(document.querySelector("[data-studio-label='Payment total'] strong")?.textContent || ""), null, { timeout: 15000 });
  await settle();
});
for (const [name, path, selector] of [
  ["collection page", "/collections/publications", ".fm-card-title"],
  ["wishlist", "/wishlist", "header"],
  ["order tracking", "/track", "form input"],
  ["account", "/account", "header"],
  ["admin sign-in", "/admin", "button"],
  ["missing page", "/this-page-does-not-exist", "header"],
]) await step(name, async () => { await page.goto(`${base}${path}`); await page.waitForSelector(selector, { timeout: 20000 }); await settle(); });
await step("search opens with Ctrl+K", async () => {
  await page.goto(`${base}/`);
  await page.waitForSelector(".fm-card-title", { timeout: 20000 });
  await page.keyboard.press("Control+k");
  await page.waitForSelector("[data-studio-label='Search overlay']", { timeout: 10000 });
  await page.keyboard.type("the");
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
});
await desktop.close();

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p2 = await phone.newPage();
watch(p2, "[phone]");
await step("phone: home and a book page", async () => {
  await p2.goto(`${base}/`);
  await p2.waitForSelector(".fm-card-title", { timeout: 30000 });
  await p2.goto(new URL(bookLinks[0] || "/", base).href);
  await p2.waitForSelector(".fm-pdp-title", { timeout: 20000 });
}, p2);
await browser.close();
await server?.close();

// Console errors from blocked or slow third parties (fonts, Stripe, analytics) aren't the shop crashing: listed only.
if (consoleErrors.length) console.log(`\n${consoleErrors.length} console error(s), not failing the run:\n${consoleErrors.slice(0, 15).map((e) => `  ${e}`).join("\n")}`);
if (crashes.length) console.log(`\nPage errors:\n${crashes.map((e) => `  ${e}`).join("\n")}`);
const failed = crashes.length + failures.length;
console.log(`\n${failed ? "FAILED" : "OK"}: ${failures.length} step(s) failed, ${crashes.length} page error(s).`);
process.exit(failed ? 1 : 0);
