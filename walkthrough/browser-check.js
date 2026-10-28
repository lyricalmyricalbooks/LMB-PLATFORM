// The walkthrough in a real browser (plan 9.11): starts it on a free port, opens the start page, then every walkthrough
// link on it, as the person that link signs in as, and fails on a page error, a console error, a failed call to the
// web door or a page that never shows its signed-in view. The demo's links (the shop and the stockroom) are left out: they need `npm run demo`, which
// has its own checks. Nothing leaves this computer: requests to any other address are refused (the fonts fall back).
//
//   node walkthrough/browser-check.js        (needs Playwright; CHROMIUM_PATH to use an installed Chromium,
//                                             WALKTHROUGH_SHOTS=<folder> to keep a screenshot of each page)
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { startWalkthrough } from "./server.js";
import { START_SECTIONS } from "./startPage.js";

/** What each page shows once it has loaded as its person: a selector that must become visible. */
export const SIGNED_IN_VIEW = Object.freeze({
  "/control/": "#view-shops",
  "/account/": "#view-shops #shops > *",
  "/account/billing": "main",
  "/signup/": "#details-form",
  "/waitlist/": "form",
  "/help/": "main",
  "/terms/": "main",
});

async function loadPlaywright() {
  for (const from of [import.meta.url, pathToFileURL(`${process.cwd()}/`).href]) {
    try {
      return createRequire(from)("playwright");
    } catch {
      // Try the next place.
    }
  }
  throw new Error("Playwright isn't installed. Run: npm install --no-save playwright");
}

const viewFor = (path) => SIGNED_IN_VIEW[Object.keys(SIGNED_IN_VIEW).filter((key) => path.startsWith(key)).sort((a, b) => b.length - a.length)[0]] ?? "body";

export async function checkWalkthrough({ log = console.log, shots = process.env.WALKTHROUGH_SHOTS } = {}) {
  const { chromium } = await loadPlaywright();
  const walk = await startWalkthrough({ sweepEveryMs: 50 });
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const problems = [];
  try {
    const context = await browser.newContext();
    await context.route("**/*", (route) => (route.request().url().startsWith(walk.url) ? route.continue() : route.abort()));
    const links = [{ name: "Start page", href: "/" }, ...START_SECTIONS.flatMap((section) => section.links).filter((item) => !item.demo)];
    const seen = new Set();
    for (const item of links) {
      const path = item.href.replace(/#.*/, "");
      if (seen.has(path)) continue;
      seen.add(path);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
      page.on("console", (message) => {
        // A refused outside address (fonts, the QR code library) is expected here.
        if (message.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(message.text())) errors.push(`console: ${message.text()}`);
      });
      // Every call to the platform's web door must succeed: a page can hide a failed panel behind a quiet message.
      page.on("response", (answer) => {
        if (answer.url().startsWith(`${walk.url}/api/`) && answer.status() >= 400) errors.push(`${answer.request().method()} ${answer.url().slice(walk.url.length)} answered ${answer.status()} as ${(answer.request().headers().authorization ?? "").slice(7, 90)}`);
      });
      const response = await page.goto(`${walk.url}${path}`, { waitUntil: "load" });
      if (!response || response.status() !== 200) errors.push(`answered ${response?.status()}`);
      // Pages still showing a sign-in button once they've settled sign in as their person.
      await page.waitForTimeout(500);
      const signIn = page.locator("button", { hasText: /Continue with Google|Sign in with Google/ }).first();
      if (await signIn.isVisible().catch(() => false)) await signIn.click({ timeout: 2000 }).catch(() => {});
      try {
        await page.locator(viewFor(path)).first().waitFor({ state: "visible", timeout: 10_000 });
      } catch {
        errors.push(`never showed ${viewFor(path)}`);
      }
      if (path === "/control/") {
        const said = (await page.locator("#status").textContent())?.trim();
        if (said) errors.push(`the control room said: ${said}`);
        if (!(await page.locator("#test-shop a").count())) errors.push("the test shop card has no links");
      }
      await page.waitForTimeout(300);
      if (shots) await page.screenshot({ path: `${shots}/${path.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "start"}.png`, fullPage: true });
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
  const problems = await checkWalkthrough();
  if (problems.length) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? "" : "s"} on the walkthrough.`);
    process.exit(1);
  }
  console.log("\nEvery walkthrough page opened as its person with no error.");
}
