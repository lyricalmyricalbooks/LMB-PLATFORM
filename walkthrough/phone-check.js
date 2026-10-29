// The walkthrough pages on a phone (plan 13.12): starts the walkthrough, opens every page on it at 390 pixels wide as a
// touch screen, and fails when a page scrolls sideways or has something you press that is shorter than 44 pixels or narrower than 24 (a
// link inside a line of text is left out; so is a tick box, whose label is what you press). Nothing leaves this computer.
//
//   node walkthrough/phone-check.js          (needs Playwright; CHROMIUM_PATH to use an installed Chromium)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { startWalkthrough } from "./server.js";
import { START_SECTIONS } from "./startPage.js";

export const PHONE = Object.freeze({ width: 390, height: 844 });
export const MIN_TAP = 44;

/** Runs in the page: sideways overflow and the pressable things under MIN_TAP. */
function measure(min) {
  const out = { overflow: document.documentElement.scrollWidth - innerWidth, small: [] };
  const pressable = "a[href], button, select, textarea, summary, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), [role=button], [role=tab]";
  for (const el of document.querySelectorAll(pressable)) {
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (!box.width || !box.height || style.visibility === "hidden" || el.closest("[hidden], [aria-hidden=true]")) continue;
    // A link that is part of a line of text, the skip link (only seen from the keyboard) and hidden traps are left out.
    if ((el.tagName === "A" && style.display === "inline") || /skip/i.test(el.className)) continue;
    // Tall enough to press (the phone guideline is 44px); wide enough to hit (the web guideline's minimum is 24px).
    if (box.height < min - 0.5 || box.width < 24) {
      const name = (el.textContent || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 28);
      out.small.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${name}" is ${Math.round(box.width)}x${Math.round(box.height)}`);
    }
  }
  return out;
}

async function loadPlaywright() {
  for (const from of [import.meta.url, pathToFileURL(`${process.cwd()}/`).href]) {
    try { return createRequire(from)("playwright"); } catch { /* try the next place */ }
  }
  throw new Error("Playwright isn't installed. Run: npm install --no-save playwright");
}

export async function checkPhone({ log = console.log } = {}) {
  const { chromium } = await loadPlaywright();
  const walk = await startWalkthrough({ sweepEveryMs: 50 });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problems = [];
  try {
    const context = await browser.newContext({ viewport: { width: PHONE.width, height: PHONE.height }, hasTouch: true, isMobile: true });
    await context.route("**/*", (route) => (route.request().url().startsWith(walk.url) ? route.continue() : route.abort()));
    const links = [{ name: "Start page", href: "/" }, ...START_SECTIONS.flatMap((section) => section.links).filter((item) => !item.demo)];
    const seen = new Set();
    for (const item of links) {
      const path = item.href.replace(/#.*/, "");
      if (seen.has(path)) continue;
      seen.add(path);
      const page = await context.newPage();
      await page.goto(`${walk.url}${path}`, { waitUntil: "load" });
      await page.waitForTimeout(500);
      const signIn = page.locator("button", { hasText: /Continue with Google|Sign in with Google/ }).first();
      if (await signIn.isVisible().catch(() => false)) await signIn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(1200);
      // The control room is one page with a panel for each job: look at each panel, not only the first.
      const panels = path === "/control/" ? await page.$$eval("[data-page]", (els) => els.map((el) => el.dataset.page)) : [""];
      const errors = [];
      for (const panel of panels) {
        if (panel) { await page.evaluate((name) => { location.hash = name; }, panel); await page.waitForTimeout(400); }
        const found = await page.evaluate(measure, MIN_TAP);
        const where = panel ? ` [${panel}]` : "";
        if (found.overflow > 1) errors.push(`${where} scrolls sideways by ${found.overflow}px`.trim());
        errors.push(...found.small.map((line) => `${where} ${line}`.trim()));
      }
      log(`${errors.length ? "✗" : "✓"} ${item.name} (${path})${errors.length ? `\n    ${errors.join("\n    ")}` : ""}`);
      problems.push(...errors.map((error) => `${path}: ${error}`));
      await page.close();
    }
  } finally {
    await browser.close();
    await walk.close();
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = await checkPhone();
  if (problems.length) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} on a phone.`);
    process.exit(1);
  }
  console.log("\nEvery walkthrough page fits a phone, and everything you press is at least 44px.");
}
