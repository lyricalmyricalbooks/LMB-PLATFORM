// Spending limits per shop (code plan 8.9) with fake budget alerts: past its budget a shop's costly jobs slow down,
// far past it they wait, and checkout is never slowed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { TEMPLATES } from "../email/templates.js";
import { DEFAULT_SETTINGS } from "../settings.js";
import { shopHealth } from "../../control-room/controlRoom.js";
import { COSTLY_JOBS, NEVER_SLOWED, jobPace, readBudgetNotice, recordBudgetNotice, spendLevel } from "./spending.js";

/** A fake budget alert, shaped like Google's Pub/Sub push. */
const alert = ({ name = "shop:moth-press", budgetId = "budget-1", cost, budget = 50, start = "2026-10-01T07:00:00Z" }) => ({
  message: {
    attributes: { billingAccountId: "000000-000000-000000", budgetId, schemaVersion: "1.0" },
    data: Buffer.from(JSON.stringify({
      budgetDisplayName: name, costAmount: cost, costIntervalStart: start, budgetAmount: budget,
      budgetAmountType: "SPECIFIED_AMOUNT", currencyCode: "CAD", ...(cost >= budget ? { alertThresholdExceeded: 1.0 } : {}),
    })).toString("base64"),
  },
});

async function world() {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live" });
  await registry.createShop("owl-books", { shopId: "owl-books", pressName: "Owl Books", status: "live", spending: { budgetId: "budget-owl" } });
  const sent = [];
  const notify = { sendPlatform: async (message) => { sent.push(message); return { id: `e${sent.length}` }; } };
  let clock = Date.parse("2026-10-28T12:00:00Z");
  const run = (body) => recordBudgetNotice(body, { registry, notify, config: { alertTo: "alerts@platform.example" }, now: () => new Date((clock += 1000)) });
  return { registry, sent, run };
}

test("the level: normal under the budget, slow past it, held at twice it; no budget means no limit", () => {
  assert.equal(spendLevel(49.99, 50), "normal");
  assert.equal(spendLevel(50, 50), "slow");
  assert.equal(spendLevel(99.99, 50), "slow");
  assert.equal(spendLevel(100, 50), "held");
  assert.equal(spendLevel(500, 0), "normal");
  assert.equal(spendLevel("x", 50), "normal");
});

test("costly jobs slow down before they stop; checkout and every other job are never slowed", () => {
  for (const job of Object.keys(COSTLY_JOBS)) {
    assert.deepEqual(jobPace("normal", job), { run: true, perHour: null }, job);
    const slow = jobPace("slow", job);
    assert.equal(slow.run, true, `${job} still runs when slow`);
    assert.ok(slow.perHour > 0, job);
    assert.equal(jobPace("held", job).run, false, `${job} waits when held`);
  }
  for (const level of ["normal", "slow", "held"]) {
    for (const job of [...NEVER_SLOWED, "stock-sync", "backup"]) assert.deepEqual(jobPace(level, job), { run: true, perHour: null }, `${job} at ${level}`);
  }
  assert.ok(NEVER_SLOWED.includes("checkout"));
  assert.match(jobPace("slow", "ai-writing").words, /Checkout works as normal/);
  assert.doesNotMatch(jobPace("held", "import").words, /budget|billing|quota/i);
});

test("a fake budget alert past the budget slows the shop's costly jobs, once, with one alert to the platform", async () => {
  const w = await world();
  assert.deepEqual(await w.run(alert({ cost: 20 })), { shopId: "moth-press", level: "normal", changed: false });
  assert.equal(w.sent.length, 0);
  assert.deepEqual(await w.run(alert({ cost: 51 })), { shopId: "moth-press", level: "slow", changed: true });
  const row = await w.registry.getShop("moth-press");
  assert.equal(row.spending.level, "slow");
  assert.equal(row.spending.currency, "CAD");
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].to, "alerts@platform.example");
  // Google sends the same state several times a day: no second alert.
  assert.equal((await w.run(alert({ cost: 60 }))).changed, false);
  assert.equal(w.sent.length, 1);
  assert.deepEqual(await w.run(alert({ cost: 101 })), { shopId: "moth-press", level: "held", changed: true });
  // A new budget month: back to normal, and the alert says so.
  assert.deepEqual(await w.run(alert({ cost: 1, start: "2026-11-01T07:00:00Z" })), { shopId: "moth-press", level: "normal", changed: true });
  assert.equal(w.sent.length, 3);
  const words = TEMPLATES["health-alert"](w.sent[1].data, { settings: DEFAULT_SETTINGS, pressName: "Moth Press" });
  assert.match(words.subject, /Moth Press \(moth-press\): spending failing/);
  assert.match(words.text, /checkout is never slowed/);
  const events = [...(w.registry.events.get("moth-press")?.values() ?? [])].filter((e) => e.kind === "spending");
  assert.deepEqual(events.map((e) => e.to), ["slow", "held", "normal"]);
  // Another shop is untouched.
  assert.equal((await w.registry.getShop("owl-books")).spending.level, undefined);
});

test("a budget is matched by its id on the row or by its name; anything else is left alone", async () => {
  const w = await world();
  assert.equal((await w.run(alert({ name: "Owl's budget", budgetId: "budget-owl", cost: 80 }))).shopId, "owl-books");
  assert.equal((await w.registry.getShop("owl-books")).spending.budgetId, "budget-owl", "the budget id is kept");
  assert.equal(await w.run(alert({ name: "shop:no-such-shop", budgetId: "x", cost: 80 })), null);
  assert.equal(await w.run({ message: { attributes: {}, data: "not base64 json" } }), null);
  assert.equal(readBudgetNotice({ message: { data: Buffer.from("{}").toString("base64") } }), null);
});

test("the control room shows a shop past its budget as one to watch, never as broken", () => {
  const live = { status: "live" };
  assert.equal(shopHealth({ row: live, profile: {} }).level, "ok");
  const slow = shopHealth({ row: { ...live, spending: { level: "slow" } }, profile: {} });
  assert.equal(slow.level, "watch");
  assert.match(slow.reasons[0], /run slowly/);
  assert.match(shopHealth({ row: { ...live, spending: { level: "held" } }, profile: {} }).reasons[0], /wait until next month/);
});
