// Speed budget as a release rule (plan 14.5): every theme's home page and a book page, opened at phone width, are
// measured (pieces drawn, pictures asked for) against scripts/speed-baseline.json. A page past its
// budget fails the build, and so the release. Same fixture and theme list as the accessibility check; no shop data read.
//
//   node scripts/speed-check.mjs             check every theme against the stored numbers
//   node scripts/speed-check.mjs --update    write the numbers (they only go down once written)
//   SPEED_THEMES=press-riso,…                only these themes (for a quick look)
//   CHROMIUM_PATH=/path/to/chrome …          use an installed Chromium
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "vite";
import { compare, lowered, describe } from "./speedBudget.mjs";

const BASELINE = new URL("./speed-baseline.json", import.meta.url);
const update = process.argv.includes("--update");
const only = (process.env.SPEED_THEMES || "").split(",").map((s) => s.trim()).filter(Boolean);
if (update && only.length) throw new Error("--update measures every theme: leave SPEED_THEMES unset");

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const origin = new URL(base).origin;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function measure(theme, path, ready) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-CA" });
  const page = await context.newPage();
  let images = 0;
  await page.route("**/*", (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin && !request.url().startsWith("data:")) return undefined;
    if (request.resourceType() === "image") images += 1;
    return route.continue();
  });
  await page.goto(`${base}/a11y-fixture.html?theme=${encodeURIComponent(theme)}&path=${encodeURIComponent(path)}`);
  await page.waitForSelector(ready, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const nodes = await page.evaluate(() => document.getElementsByTagName("*").length);
  await context.close();
  return { nodes, images };
}

// Warm the dependency cache once, so the first theme's request count isn't odd.
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/*", (route) => (new URL(route.request().url()).origin === origin ? route.continue() : undefined));
  await page.goto(`${base}/a11y-fixture.html`).catch(() => {});
  await page.waitForFunction(() => Array.isArray(window.__a11yThemes), null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  var all = await page.evaluate(() => window.__a11yThemes);
  await context.close();
}
const themes = only.length ? all.filter((id) => only.includes(id)) : all;
if (!themes.length) throw new Error("no themes to measure");

const found = {};
for (const theme of themes) {
  found[`${theme} home`] = await measure(theme, "/", ".fm-card-title");
  found[`${theme} book`] = await measure(theme, "/books/night-songs", ".fm-pdp-title");
  console.log(`${theme}: measured`);
}
await browser.close();
await server.close();

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
if (update) {
  const sorted = Object.fromEntries(Object.entries(lowered(found, baseline)).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Speed numbers written for ${Object.keys(sorted).length} pages.`);
  process.exit(0);
}
if (!baseline) throw new Error("scripts/speed-baseline.json is missing: run with --update once.");
const { over, missing, improved } = compare(found, baseline);
if (over.length || missing.length) {
  if (over.length) console.error(`\nThese pages are slower than their budget at phone width:\n- ${over.map(describe).join("\n- ")}`);
  if (missing.length) console.error(`\nNo stored numbers for: ${missing.join(", ")}. Run with --update.`);
  process.exit(1);
}
console.log(`Speed OK: ${themes.length} themes × home and book page at phone width, all inside budget.${improved.length ? " Some got lighter: run with --update to lower the numbers." : ""}`);
