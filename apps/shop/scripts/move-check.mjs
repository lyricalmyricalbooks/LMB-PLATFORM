// A whole move from an old shop, clicked through on screen in a real browser (plan 23.22): the real admin through
// admin-fixture.html?move=1 (src/adminFixture/main.ts), the demo's sample files (demo/sampleFiles.js), and the shop's
// server answered here (exchangeRates, importPastOrders, removePastOrders, readOldLinks). Nothing reaches Firestore.
//
//   node scripts/move-check.mjs
//   CHROMIUM_PATH=/path/to/chrome MOVE_SHOTS=dir node scripts/move-check.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { SAMPLE_FILES } from "../../../demo/sampleFiles.js";

const files = join(tmpdir(), `move-check-${process.pid}`);
mkdirSync(files, { recursive: true });
const sample = (name) => { const path = join(files, name); writeFileSync(path, SAMPLE_FILES[name].body()); return path; };
const shots = process.env.MOVE_SHOTS || "";
if (shots) mkdirSync(shots, { recursive: true });

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: "error" });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const origin = new URL(base).origin;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = false;
const check = (ok, what, detail = "") => { console.log(`  ${ok ? "✓" : "✗"} ${what}${ok || !detail ? "" : ` — ${detail}`}`); if (!ok) failed = true; };

// The shop's server, as the admin's old-shop actions reach it.
const server_ = { imported: [], removed: 0, rated: [] };
const answer = (body) => {
  switch (body.action) {
    case "exchangeRates": return { rates: Object.fromEntries(body.currencies.map((c) => [c, 1.3712])), from: body.from, to: body.to };
    case "importPastOrders": server_.imported.push(...body.orders.map((o) => ({ ...o, batch: body.batch }))); return { added: body.orders.length, skipped: [] };
    case "removePastOrders": { const n = server_.imported.filter((o) => o.batch === body.batch).length; server_.imported = server_.imported.filter((o) => o.batch !== body.batch); server_.removed += n; return { removed: n, more: false }; }
    case "ratePastOrder": server_.rated.push([body.orderId, body.rate]); return { changed: true, total: Math.round(14.6 * body.rate * 100) / 100 };
    case "readOldLinks": return { host: "oldshop.example", paths: ["/", "/products/moth-hoodie", "/pages/about"], notes: [] };
    default: return { error: `not in this check: ${body.action}` };
  }
};

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const crashes = [];
  page.on("pageerror", (e) => crashes.push(e.message));
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/createStripeCheckoutSession/.test(url)) {
      const body = JSON.parse(route.request().postData() || "{}");
      const data = answer(body);
      return route.fulfill({ status: data.error ? 400 : 200, contentType: "application/json", body: JSON.stringify(data) });
    }
    return new URL(url).origin === origin || url.startsWith("data:") ? route.continue() : route.abort();
  });
  const open = async (hash) => {
    await page.goto(`${base}/admin-fixture.html?move=1&page=${encodeURIComponent(hash)}`);
    await page.waitForSelector("main, [data-admin-theme], .admin-reso", { timeout: 30000 });
    await page.waitForTimeout(1200);
  };
  // The fixture's firstWeek lives in the page, so the move carries on within one page: go between screens by hash.
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(1200); };
  const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true }); };
  const ticked = () => page.evaluate(() => Object.keys(window.__adminFixture.firstWeek.done || {}).sort());
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Your move so far" }) });

  console.log("\n▸ A whole move, on screen");
  await open("overview");
  check(await card.count() > 0, "Overview shows Your move so far");
  check(/1 of 5 done/.test(await card.innerText().catch(() => "")), "books already ticked from Get started (1 of 5)");
  await shot("1-overview-start");

  // Customers.
  await go("customers");
  await page.getByRole("button", { name: "Bring customers over" }).first().click();
  await page.setInputFiles('input[aria-label="Customer list file"]', sample("old-shop-customers.csv"));
  await page.getByRole("button", { name: /^Bring over 4 customers$/ }).click();
  await page.getByRole("button", { name: "Done" }).waitFor({ timeout: 10000 });
  const notes = await page.evaluate(() => window.__adminFixture.calls.filter((c) => c[0] === "saveCustomerNote").length);
  check(notes === 4, "4 customers saved", `${notes}`);
  await shot("2-customers");
  await page.getByRole("button", { name: "Done" }).click();

  // Gift cards.
  await go("giftCards");
  await page.getByRole("button", { name: "Bring gift cards over" }).first().click();
  await page.setInputFiles('input[aria-label="Gift card file"]', sample("old-shop-gift-cards.csv"));
  await page.getByRole("button", { name: /^Bring 2 gift cards over$/ }).click();
  await page.waitForTimeout(800);
  const cards = await page.evaluate(() => window.__adminFixture.calls.find((c) => c[0] === "giftCardAdmin")?.[2]?.cards?.length || 0);
  check(cards === 2, "2 gift cards sent, the used-up one left out", `${cards}`);
  await shot("3-gift-cards");
  await page.keyboard.press("Escape");

  // Past orders: the suggested rate, bring, take back, bring again.
  await go("orders");
  await page.getByRole("button", { name: "Bring past orders over" }).first().click();
  await page.setInputFiles('input[aria-label="Order file"]', sample("old-shop-orders.csv"));
  const rate = page.locator('input[inputmode="decimal"]');
  await rate.waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check(await rate.inputValue() === "1.3712", "US-dollar rate suggested", await rate.inputValue());
  check(/Bank of Canada average/.test(await page.locator("body").innerText()), "the suggestion says where it came from");
  const shown = await page.locator('[role="dialog"]').textContent();
  check(/pending/.test(shown) && /#1007: it was cancelled/.test(shown), "the pending and cancelled orders are listed as left out");
  await shot("4-orders-preview");
  await page.getByRole("button", { name: /^Bring 5 past orders over$/ }).click();
  await page.getByRole("button", { name: "Wrong file? Take this import back" }).waitFor({ timeout: 10000 });
  check(server_.imported.length === 5, "5 past orders reached the server", `${server_.imported.length}`);
  check(server_.imported.find((o) => o.number === "#1003")?.paidIn?.rate === 1.3712, "#1003 sent with its US-dollar rate");
  // Refunds come over as what was paid back (plan 23.31): the server marks a whole refund as refunded.
  check(server_.imported.find((o) => o.number === "#1005")?.refunded === 42 && server_.imported.find((o) => o.number === "#1006")?.refunded === 10,
    "the refund and the part refund are sent with what was paid back");
  check(server_.imported.every((o) => o.file === "old-shop-orders.csv"), "each order says which file it came from");
  await page.getByRole("button", { name: "Wrong file? Take this import back" }).click();
  await page.getByRole("button", { name: "Yes, remove them" }).click();
  await page.getByText(/5 past orders removed/).waitFor({ timeout: 10000 });
  check(server_.imported.length === 0 && server_.removed === 5, "taking it back removed all 5");
  await shot("5-orders-taken-back");
  // The next file comes over in the same window (plan 23.32), as a run of its own.
  const firstRun = server_.removed;
  await page.getByRole("button", { name: "Bring another file" }).click();
  await page.setInputFiles('input[aria-label="Order file"]', sample("old-shop-orders.csv"));
  await page.getByRole("button", { name: /^Bring 5 past orders over$/ }).click();
  await page.getByRole("button", { name: "Wrong file? Take this import back" }).waitFor({ timeout: 10000 });
  check(server_.imported.length === 5 && server_.removed === firstRun && new Set(server_.imported.map((o) => o.batch)).size === 1,
    "Bring another file brought the next file over in the same window", `${server_.imported.length}`);
  await page.keyboard.press("Escape");

  // A brought-over order's page says which file it came from (plan 23.33).
  await go("orders/past-1004");
  await page.getByText("Came from the file").waitFor({ timeout: 10000 });
  check(/Came from the file old-shop-orders\.csv/.test(await page.locator("body").innerText()), "the order's page names its file");
  await shot("5b-past-order");
  // Its rate can change for that order alone (plan 23.34).
  check(/Sold for 14\.60 USD, brought over at 1 USD = 1\.3712 Canadian dollars/.test(await page.locator("body").innerText()), "the order's page shows what it sold for and its rate");
  await page.getByRole("button", { name: "Change the rate" }).click();
  await page.getByLabel("1 USD in Canadian dollars").fill("1.4");
  await page.getByText("This order becomes CA$20.44.").waitFor({ timeout: 5000 });
  await shot("5c-past-order-rate");
  await page.getByRole("button", { name: "Use this rate" }).click();
  await page.getByRole("button", { name: "Change the rate" }).waitFor({ timeout: 10000 });
  check(JSON.stringify(server_.rated) === JSON.stringify([["PAST-1004", 1.4]]), "the new rate reached the server for that one order", JSON.stringify(server_.rated));

  // Old links.
  // From the Overview's own button, which must land on the tab that holds the old-links check.
  await go("overview");
  await card.getByRole("button", { name: "Check your old links" }).click();
  await page.waitForTimeout(2000);
  check(await page.locator("#gs-redirects").evaluate((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }),
    "Check your old links opens Settings with the old-links card in view");
  await page.getByLabel("Your old shop's address").fill("oldshop.example");
  await page.getByRole("button", { name: "Check old links" }).click();
  await page.getByText(/old addresses on oldshop\.example/).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await shot("6-old-links");

  check(JSON.stringify(await ticked()) === JSON.stringify(["move-customers", "move-giftcards", "move-links", "move-orders"]),
    "each window ticked its part", JSON.stringify(await ticked()));

  // Back on the Overview every part is done: it says so once, until closed. Hide and show is checked on a fresh visit.
  await go("overview");
  const movedIn = page.locator("section", { has: page.getByRole("heading", { name: "You're all moved in" }) });
  check(await card.count() === 0 && await movedIn.count() > 0, "Overview: You're all moved in, in place of the list");
  await movedIn.getByText(/came over/).waitFor({ timeout: 5000 });
  check(/4 customers and 2 gift cards came over/.test(await movedIn.innerText()), "it says what came over", await movedIn.innerText());
  if (shots) await movedIn.screenshot({ path: join(shots, "7-overview-moved-in.png") });
  await movedIn.getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(500);
  check(await movedIn.count() === 0 && (await ticked()).includes("move-list"), "Close puts it away for good");

  await open("overview");
  await card.getByRole("button", { name: "We had none" }).first().click();
  await card.getByRole("button", { name: "Hide this list" }).click();
  await page.getByText("Your move so far is hidden.").waitFor({ timeout: 5000 });
  check(true, "Hide this list leaves one line");
  await page.getByRole("button", { name: "Show it again" }).click();
  await card.waitFor({ timeout: 5000 });
  check(/2 of 5 done/.test(await card.innerText()), "Show it again brings it back, with We had none counted (2 of 5)");
  await shot("8-overview-shown-again");

  check(crashes.length === 0, "no page crash", crashes.join(" | "));
} catch (err) {
  check(false, "the move ran to the end", err?.message || String(err));
  const pages = browser.contexts().flatMap((c) => c.pages());
  if (pages.length && shots) await pages[0].screenshot({ path: join(shots, "failed.png") }).catch(() => {});
  const shown = pages.length ? await pages[0].locator('[role="dialog"], main').first().innerText().catch(() => "") : "";
  console.log(`\n  What the screen showed:\n${shown.slice(0, 1500)}`);
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
