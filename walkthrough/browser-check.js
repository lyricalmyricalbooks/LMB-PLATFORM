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
  "/join/": "#view-plan",
  "/waitlist/": "form",
  "/help/": "main",
  "/terms/": "main",
  "/trust/": "main",
  "/status/": "#status .parts",
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

/**
 * The front door end to end (code plan 18.4), as a new person on a phone with nobody signed in: email, a wrong code
 * then the right one (read from the practice inbox), the four questions (one skipped), the saved summary, and the
 * same summary again after a reload. Returns the problems found.
 */
async function checkFrontDoor(browser, walk, log) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.route("**/*", (route) => (route.request().url().startsWith(walk.url) ? route.continue() : route.abort()));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`page error: ${error.message}`));
  const address = "front-door@example.com";
  const step = async (what, work) => {
    if (errors.length) return;
    try { await work(); } catch (error) { errors.push(`${what}: ${error.message.split("\n")[0]}`); }
  };
  const visible = (selector) => page.locator(selector).waitFor({ state: "visible", timeout: 10_000 });
  try {
    await step("the email screen", async () => {
      await page.goto(`${walk.url}/join/`);
      await visible("#email-form");
      await page.fill("#email-form input[name=email]", address);
      await page.click("#email-form button[type=submit]");
      await visible("#view-code");
    });
    await step("a wrong code", async () => {
      // "Send a new code" waits half a minute after a send, with the wait shown.
      await visible("#code-wait");
      if (await page.locator("#code-again").isVisible()) throw new Error("Send a new code shows before the wait is over");
      await page.fill("#code", "000000");
      await visible("#code-error");
    });
    await step("the right code", async () => {
      const code = walk.world.email.list().filter((m) => m.kind === "sign-in-code" && m.to === address).at(-1)?.data?.code;
      if (!code) throw new Error("no code email in the practice inbox");
      await page.fill("#code", code);
      await visible("#view-plan");
    });
    await step("the four questions", async () => {
      // Both is picked to start with, and each plan shows its price from the platform.
      if (!(await page.locator("#plan-choices input[value=both]").isChecked())) throw new Error("both isn't picked to start with");
      if ((await page.locator("#plan-choices .fd-price").count()) !== 3) throw new Error("the plans show no prices");
      await page.click("#plan-choices label.choice:has(input[value=shop])");
      await page.click("#view-plan button[type=submit]");
      await visible("#view-name");
      await page.fill("#view-name input[name=pressName]", "Front Door Press");
      await page.click("#view-name button[type=submit]");
      await visible("#view-sells");
      await page.click("#view-sells label.choice:has-text('Zines')");
      await page.click("#view-sells button[type=submit]");
      await visible("#view-country");
      await page.click("#view-country [data-skip]");
      await visible("#view-done");
    });
    await step("coming back", async () => {
      await page.reload();
      await visible("#view-done");
      const saved = (await walk.world.frontDoorStores.presses.listByOwner(`uid-${address}`))[0];
      if (saved?.plan !== "shop" || saved?.pressName !== "Front Door Press" || saved?.sells !== "zines" || saved?.country !== "") throw new Error(`saved ${JSON.stringify(saved)}`);
    });
    await step("the picker for a second press, and an open shop going to the account page", async () => {
      const presses = walk.world.frontDoorStores.presses;
      const [first] = await presses.listByOwner(`uid-${address}`);
      await presses.create("press-second-one", { ...first, pressId: "press-second-one", pressName: "", sells: "", createdAt: "2099-01-01T00:00:00.000Z" });
      await page.reload();
      await visible("#view-pick");
      if ((await page.locator("#pick-list button").count()) !== 2) throw new Error("the picker doesn't show both presses");
      await page.locator("#pick-list button", { hasText: "Press not named yet" }).click();
      await visible("#view-plan");
      await presses.update(first.pressId, (row) => ({ row: { ...row, status: "open" }, result: null }));
      await page.reload();
      await visible("#view-pick");
      await page.locator("#pick-list button", { hasText: "Front Door Press" }).click();
      await page.waitForURL(/\/account\/$/, { timeout: 10_000 });
    });
  } finally {
    await context.close();
  }
  log(`${errors.length ? "✗" : "✓"} The front door, end to end on a phone (/join/)${errors.length ? `\n    ${errors.join("\n    ")}` : ""}`);
  return errors.map((error) => `/join/ flow: ${error}`);
}

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
    problems.push(...(await checkFrontDoor(browser, walk, log)));
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
