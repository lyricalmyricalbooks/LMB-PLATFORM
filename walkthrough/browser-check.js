// The walkthrough in a real browser (plan 9.11): starts it on a free port, opens the start page, then every walkthrough
// link on it, as the person that link signs in as, and fails on a page error, a console error, a failed call to the
// web door or a page that never shows its signed-in view. The demo's links (the shop and the stockroom) are left out: they need `npm run demo`, which
// has its own checks. Nothing leaves this computer: requests to any other address are refused (the fonts fall back).
//
//   node walkthrough/browser-check.js        (needs Playwright; CHROMIUM_PATH to use an installed Chromium,
//                                             WALKTHROUGH_SHOTS=<folder> to keep a screenshot of each page)
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SETUP_ADMIN_FOLDER, startWalkthrough } from "./server.js";
import { START_SECTIONS } from "./startPage.js";

/** What each page shows once it has loaded as its person: a selector that must become visible. */
export const SIGNED_IN_VIEW = Object.freeze({
  "/control/": "#view-shops",
  "/account/": "#view-shops #shops > *",
  "/account/billing": "main",
  "/signup/": "#details-form",
  "/join/": "#view-start",
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const viewFor = (path) => SIGNED_IN_VIEW[Object.keys(SIGNED_IN_VIEW).filter((key) => path.startsWith(key)).sort((a, b) => b.length - a.length)[0]] ?? "body";

/**
 * The front door end to end (code plan 18.4; design handoff "Colophon platform"), as a new person on a phone with
 * nobody signed in: email, a wrong code then the right one (read from the practice inbox), the three questions and the
 * terms, then "Setting up your store…" until the shop maker has made the store with a trial of both apps. Setup mode is
 * checked for a press still in setup. Returns the problems found.
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
      await visible("#view-start");
    });
    await step("three questions, the terms, and the store made at once", async () => {
      await page.fill("#start-form input[name=pressName]", "Front Door Press");
      if ((await page.locator("#new-name").textContent()) !== "Front Door Press") throw new Error("Your new store doesn't show the brand's name");
      if (!/^front-door-[a-z]+\.web\.app$/.test(await page.locator("#new-address").textContent())) throw new Error("Your new store doesn't show its address");
      await page.click("#sells-choices label.choice:has-text('Clothing & accessories')");
      await page.click("#today-choices label.choice:has(input[value=online])");
      await page.selectOption("#country", "CA");
      // Without the terms ticked, nothing is made.
      await page.click("#start-form button[type=submit]");
      await visible("#terms-error");
      if (await page.locator("#making").isVisible()) throw new Error("the store started without the terms");
      await page.check("#start-form input[name=termsAccepted]");
      if (process.env.WALKTHROUGH_SHOTS) {
        await page.screenshot({ path: join(process.env.WALKTHROUGH_SHOTS, "join-start-phone.png"), fullPage: true });
        const phone = page.viewportSize();
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({ path: join(process.env.WALKTHROUGH_SHOTS, "join-start.png"), fullPage: true });
        if (phone) await page.setViewportSize(phone);
      }
      await page.click("#start-form button[type=submit]");
      await visible("#making");
      if (process.env.WALKTHROUGH_SHOTS) await page.screenshot({ path: join(process.env.WALKTHROUGH_SHOTS, "join-making-phone.png") });
      // The shop maker runs in the walkthrough, so the store gets made and the way in opens.
      await page.locator("#making-go:not([aria-disabled])").waitFor({ state: "visible", timeout: 20_000 });
      if ((await page.locator("#making-rows .pill", { hasText: "Done" }).count()) !== 3) throw new Error("not every row says Done");
      if (process.env.WALKTHROUGH_SHOTS) {
        await page.screenshot({ path: join(process.env.WALKTHROUGH_SHOTS, "join-ready-phone.png") });
        const phone = page.viewportSize();
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({ path: join(process.env.WALKTHROUGH_SHOTS, "join-ready.png") });
        if (phone) await page.setViewportSize(phone);
      }
      const [saved] = await walk.world.frontDoorStores.presses.listByOwner(`uid-${address}`);
      if (saved?.status !== "open" || saved?.plan !== "both" || saved?.pressName !== "Front Door Press" || saved?.sells !== "clothing" || saved?.sellingToday !== "online" || saved?.country !== "CA") throw new Error(`saved ${JSON.stringify(saved)}`);
      const row = await walk.world.stores.signups.get(saved.shopId);
      if (!row?.trialStartedAt || row?.plan !== "both") throw new Error(`the trial didn't start with both apps: ${JSON.stringify(row)}`);
    });
    await step("setup mode, for a press that set up before stores were made at sign-up (code plan 18.6)", async () => {
      const built = existsSync(join(ROOT, SETUP_ADMIN_FOLDER, "setup.html"));
      if (!built) {
        if (process.env.SETUP_ADMIN_REQUIRED) throw new Error("setup mode isn't built (cd apps/shop && pnpm run build:setup)");
        log("  (setup mode isn't built here, so its part of the front door check is left out)");
        return;
      }
      const presses = walk.world.frontDoorStores.presses;
      const [first] = await presses.listByOwner(`uid-${address}`);
      const pressId = "press-in-setup";
      await presses.create(pressId, { ...first, pressId, status: "setup", pressName: "Front Door Press", plan: "shop", country: "", shopId: "", shopStatus: "", openUrl: "", createdAt: "2099-01-01T00:00:00.000Z" });
      const record = () => presses.get(pressId);
      await page.goto(`${walk.url}/app/?press=${pressId}`);
      await visible(".rp-page-title");
      const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      if (!(await page.locator(".rp-page-title").textContent())?.includes("Front Door Press")) throw new Error("the setup guide doesn't greet the press by name");
      if (!(await fits())) throw new Error("the setup guide scrolls sideways on a phone");
      // A page that needs the shop is an empty page offering Create my shop.
      await page.evaluate(() => { location.hash = "orders"; });
      await page.locator("text=Nothing here yet").first().waitFor({ state: "visible", timeout: 10_000 });
      // Settings › General saves to the setup record.
      await page.evaluate(() => { location.hash = "settings/general"; });
      await page.locator("form select").nth(1).selectOption("CA");
      await page.click("form button[type=submit]");
      for (let i = 0; i < 50; i += 1) {
        if ((await record())?.country === "CA") break;
        if (i === 49) throw new Error("General didn't save the country");
        await page.waitForTimeout(100);
      }
      // Your web address: a domain the press already has is kept, with where it was bought.
      await page.locator("[role=radio]", { hasText: "I already have a domain" }).click();
      await page.fill("input[placeholder='yourpress.com']", "mothpress.example");
      await page.locator("button", { hasText: "Use this domain" }).click();
      await page.locator("text=you press Allow there once").waitFor({ state: "visible", timeout: 10_000 });
      const kept = await record();
      if (kept?.domain !== "mothpress.example" || kept?.domainSeller !== "GoDaddy") throw new Error(`the domain wasn't kept: ${JSON.stringify([kept?.domain, kept?.domainSeller])}`);
      if (!(await fits())) throw new Error("Your web address scrolls sideways on a phone");
      // Design shows the look gallery, and picking a look saves it.
      await page.evaluate(() => { location.hash = "settings/designer"; });
      await page.locator("ul[aria-label='Suggested looks'] button", { hasText: "Use this look" }).first().click();
      await page.locator("text=Choose another look").waitFor({ state: "visible", timeout: 10_000 });
      if (!(await record())?.look) throw new Error("the chosen look wasn't saved");
      if (!(await fits())) throw new Error("Design scrolls sideways on a phone");
      // Settings › Payments picks Stripe or Square for the website's cards, and saves the pick.
      await page.evaluate(() => { location.hash = "settings/payments"; });
      await page.locator("[role='radiogroup'][aria-label='Card payments'] [role='radio']").nth(1).click();
      for (let i = 0; i < 50; i += 1) {
        if ((await record())?.cardProvider === "square") break;
        if (i === 49) throw new Error("Payments didn't save Square");
        await page.waitForTimeout(100);
      }
      if (!(await fits())) throw new Error("Payments scrolls sideways on a phone");
      // Books previews a product file and keeps it for the shop, sent through the upload link (18.7).
      await page.evaluate(() => { location.hash = "catalog"; });
      await page.locator("input[type=file]").setInputFiles({ name: "my-zines.csv", mimeType: "text/csv", buffer: Buffer.from("Title,Price,Stock\nMoth Zine,8,20\nNight Zine,6,12\n") });
      await page.locator("ol[aria-label='Import preview'] li").nth(1).waitFor({ state: "visible", timeout: 10_000 });
      if (!(await fits())) throw new Error("the Books preview scrolls sideways on a phone");
      await page.locator("button", { hasText: /^Keep 2 .* for my shop$/ }).click();
      await page.locator("text=Kept for your shop").waitFor({ state: "visible", timeout: 10_000 });
      const withFile = await record();
      if (withFile?.stagedImport?.rows !== 2 || !walk.world.stagedFiles.files.has(withFile.stagedImportPath)) throw new Error("the product file wasn't kept");
    });
    await step("the picker for two presses: one in setup gets the questions again", async () => {
      const presses = walk.world.frontDoorStores.presses;
      const [first] = await presses.listByOwner(`uid-${address}`);
      await presses.create("press-second-one", { ...first, pressId: "press-second-one", status: "setup", pressName: "", sells: "", shopId: "", openUrl: "", createdAt: "2099-02-01T00:00:00.000Z" });
      await page.goto(`${walk.url}/join/`);
      await visible("#view-pick");
      await page.locator("#pick-list button", { hasText: "Brand not named yet" }).click();
      await visible("#view-start");
    });
    await step("Create my shop starts the plan and queues the shop (code plan 18.8)", async () => {
      if (!existsSync(join(ROOT, SETUP_ADMIN_FOLDER, "setup.html"))) return;
      const presses = walk.world.frontDoorStores.presses;
      const [first] = await presses.listByOwner(`uid-${address}`);
      await presses.create("press-opens-now", { ...first, pressId: "press-opens-now", status: "setup", pressName: "Opening Press", plan: "shop", country: "CA", shopId: "", openUrl: "", stagedImport: null, stagedImportPath: "" });
      await page.goto(`${walk.url}/app/?press=press-opens-now#settings/plan`);
      const open = page.locator("main button", { hasText: /^Create my shop$/ });
      await open.waitFor({ state: "visible", timeout: 10_000 });
      if (!(await open.isDisabled())) throw new Error("Create my shop works before the terms are ticked");
      await page.locator("main input[type=checkbox]").check();
      await open.click();
      await page.locator("text=Your shop is being made").waitFor({ state: "visible", timeout: 10_000 });
      const opened = await presses.get("press-opens-now");
      const queued = opened?.shopId ? await walk.world.stores.signups.get(opened.shopId) : null;
      if (opened?.status !== "opening" || queued?.pressId !== "press-opens-now") throw new Error(`the shop wasn't queued: ${JSON.stringify({ opened, queued })}`);
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
