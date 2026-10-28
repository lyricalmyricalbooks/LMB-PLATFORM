// Accessibility as a release rule (plan 8.8): an automatic check (axe-core, WCAG 2.1 A and AA) of the shop under every
// theme in the library (themeLibrary.ts) and the starting look: the home page, a book page and checkout with a book in
// the bag. Runs the real storefront in Chromium through a11y-fixture.html, with sample books and no shop data read.
// CI job `shop-accessibility` runs it on every pull request; a failure blocks the merge, and so the release.
//
//   node scripts/a11y-check.mjs                 check every theme against scripts/a11y-baseline.json
//   node scripts/a11y-check.mjs --update        after fixing problems, lower the baseline (it never goes up)
//   A11Y_THEMES=press-riso,night-neon …         only these themes (for a quick look; --update needs them all)
//   CHROMIUM_PATH=/path/to/chrome …             use an installed Chromium
//
// The baseline holds the problems the themes had when the check started, as "<theme> <page> <rule>": nodes. It can
// only shrink: a new problem, or more of a known one, fails; fewer is fine and --update writes the lower count.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { createServer } from "vite";

const BASELINE = new URL("./a11y-baseline.json", import.meta.url);
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const update = process.argv.includes("--update");
const only = (process.env.A11Y_THEMES || "").split(",").map(s => s.trim()).filter(Boolean);
if (update && only.length) throw new Error("--update checks every theme: leave A11Y_THEMES unset");

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const origin = new URL(base).origin;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** A page that only reaches the local server: shop data, payments, fonts and anything else outside never answer. */
async function openPage(context) {
  const page = await context.newPage();
  await page.route("**/*", (route) => (new URL(route.request().url()).origin === origin || route.request().url().startsWith("data:") ? route.continue() : undefined));
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  return { page, crashes };
}

async function axe(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") || "", html: (v.nodes[0]?.html || "").slice(0, 200) }));
  }, TAGS);
}

const found = {};
const notes = [];
const failures = [];
const record = (theme, where, violations) => {
  for (const v of violations) {
    found[`${theme} ${where} ${v.id}`] = v.nodes;
    notes.push({ key: `${theme} ${where} ${v.id}`, line: `${v.impact || "?"}: ${v.help} (${v.nodes} × e.g. ${v.sample})\n      ${v.html}` });
  }
};

// Warm Vite's dependency cache once, so the first theme doesn't time out on it.
{
  const context = await browser.newContext();
  const { page } = await openPage(context);
  await page.goto(`${base}/a11y-fixture.html`).catch(() => {});
  await page.waitForTimeout(3000);
  await context.close();
}

const themes = await (async () => {
  const context = await browser.newContext();
  const { page } = await openPage(context);
  await page.goto(`${base}/a11y-fixture.html`);
  await page.waitForFunction(() => Array.isArray(window.__a11yThemes), null, { timeout: 60000 });
  const all = await page.evaluate(() => window.__a11yThemes);
  await context.close();
  return only.length ? all.filter((id) => only.includes(id)) : all;
})();
if (!themes.length) throw new Error("no themes to check");

for (const theme of themes) {
  // en-CA, desktop size; the cookie banner is part of the page and is checked too.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-CA" });
  const { page, crashes } = await openPage(context);
  const open = async (path, ready) => {
    await page.goto(`${base}/a11y-fixture.html?theme=${encodeURIComponent(theme)}&path=${encodeURIComponent(path)}`);
    await page.waitForSelector(ready, { timeout: 30000 });
    await page.waitForTimeout(800);
  };
  const check = async (where, fn) => {
    try {
      await fn();
      if (crashes.length) throw new Error(`the page threw: ${crashes[0]}`);
      if (await page.locator("[data-store-region='errorPanel']").count()) throw new Error("the page shows its error panel");
      record(theme, where, await axe(page));
    } catch (e) {
      failures.push(`${theme} ${where}: ${String(e.message).split("\n")[0]}`);
    }
  };

  await check("home", () => open("/", ".fm-card-title"));
  await check("book", () => open("/books/night-songs", ".fm-pdp-title"));
  await check("checkout", async () => {
    await open("/books/salt-hours", ".fm-pdp-title");
    await page.locator(".fm-pdp-card button", { hasText: /ADD TO BAG/i }).first().click();
    await page.waitForSelector(".fm-bag", { timeout: 10000 });
    await page.locator(".fm-bag button, .fm-bag a").filter({ hasText: /checkout/i, visible: true }).last().click();
    await page.waitForURL(/\/checkout/, { timeout: 20000 });
    await page.waitForSelector("#co-field-street, input[name=fulfillment-option]", { timeout: 20000 });
    await page.waitForTimeout(800);
  });
  console.log(`${theme}: checked`);
  await context.close();
}

await browser.close();
await server.close();

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
const inScope = (key) => !only.length || only.includes(key.split(" ")[0]);
const worse = Object.entries(found).filter(([key, n]) => n > (baseline?.[key] || 0));
const better = Object.entries(baseline || {}).filter(([key, n]) => inScope(key) && (found[key] || 0) < n);
const total = Object.values(found).reduce((sum, n) => sum + n, 0);

if (failures.length) {
  console.error(`\nPages that couldn't be checked:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (update) {
  if (baseline && worse.length) {
    console.error(`\nThe baseline only goes down. New problems:\n- ${worse.map(([key, n]) => `${key}: ${baseline[key] || 0} → ${n}`).join("\n- ")}`);
    process.exit(1);
  }
  const sorted = Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`Baseline written: ${total} known problem spots across ${themes.length} themes.`);
  process.exit(0);
}
if (worse.length) {
  console.error(`\nNew accessibility problems (axe-core, WCAG 2.1 AA):`);
  for (const [key, n] of worse) {
    console.error(`- ${key}: ${baseline?.[key] || 0} → ${n}`);
    for (const note of notes.filter((x) => x.key === key)) console.error(`    ${note.line}`);
  }
  console.error("\nFix them, or if a known problem simply moved, check the details above. The baseline never goes up.");
  process.exit(1);
}
console.log(`Accessibility OK: ${themes.length} themes × home, book page and checkout; ${total} known problem spots, none new.${better.length ? " Some improved: run with --update to lower the baseline." : ""}`);
