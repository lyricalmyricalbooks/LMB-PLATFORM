// Paying presses drifting away (plan 24.4): the score from orders (four weeks against the four before) and sign-ins;
// only paying live shops; a new shop's empty "before" is no drop; a sign-in that can't be read is left out; the score is
// kept on the registry row for Today; one gentle email per 60 days to a drifting press, in both languages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECK_IN_EVERY_DAYS, createDriftWatch, driftOf, watched } from "./driftWatch.js";
import { todaySummary } from "./today.js";
import { fakeShopAccess } from "./fakes.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { platformSettings } from "../services/settings.js";
import { TEMPLATES } from "../services/email/templates.js";
import { TEMPLATES_FR } from "../services/email/templatesFr.js";
import { NOT_CONNECTED, notConnectedClient } from "../server/notConnected.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const settings = platformSettings({});

test("the score: orders stopping or halving, and nobody signing in", () => {
  const long = { sellingWeeks: 20 };
  assert.deepEqual(driftOf({ ...long, recent: 6, before: 7, lastSignInAt: ago(2) }, NOW), { level: "fine", score: 0, reasons: [] });
  assert.equal(driftOf({ ...long, recent: 3, before: 8, lastSignInAt: ago(2) }, NOW).level, "watch");
  assert.equal(driftOf({ ...long, recent: 0, before: 5, lastSignInAt: ago(20) }, NOW).level, "drifting");
  assert.deepEqual(driftOf({ ...long, recent: 0, before: 5, lastSignInAt: ago(40) }, NOW).reasons, ["no orders in the last 4 weeks (5 the 4 before)", "no one signed in for 40 days"]);
  assert.equal(driftOf({ ...long, recent: 0, before: 0, lastSignInAt: null }, NOW).reasons[0], "no one has signed in to the shop admin");
  assert.equal(driftOf({ sellingWeeks: 3, recent: 0, before: 0, lastSignInAt: ago(1) }, NOW).level, "fine", "a new shop's quiet start is no drop");
  assert.equal(driftOf({ ...long, recent: 0, before: 5, lastSignInAt: undefined }, NOW).score, 2, "sign-ins not known: the orders alone");
});

test("only paying live shops are watched", () => {
  assert.ok(watched({ status: "live", billing: { status: "active" } }));
  assert.ok(watched({ status: "live", billing: { status: "past_due" } }));
  assert.ok(!watched({ status: "live", billing: { status: "trialing" } }));
  assert.ok(!watched({ status: "live", billing: { status: "active" }, testShop: true }));
  assert.ok(!watched({ status: "live", billing: { status: "active" }, closure: { by: "a" } }));
});

async function world({ shopAccess = fakeShopAccess() } = {}) {
  const registry = fakeRegistry();
  const shopData = fakeShopData();
  const live = { status: "live", billing: { status: "active" }, liveAt: ago(120) };
  await registry.createShop("moth", { shopId: "moth", pressName: "Moth Press", ownerEmail: "moth@example.com", ...live });
  await registry.createShop("wasp", { shopId: "wasp", pressName: "Wasp Press", ownerEmail: "wasp@example.com", ...live });
  await registry.createShop("trial", { shopId: "trial", pressName: "Trial Press", ownerEmail: "t@example.com", status: "live", billing: { status: "trialing" } });
  let n = 0;
  const order = async (shopId, days, extra = {}) => shopData.set(shopId, `orders/o${++n}`, { paymentStatus: "paid", createdAt: ago(days), ...extra });
  // Moth: five paid orders five weeks ago, none since (plus ones that don't count), and nobody in for 40 days.
  for (const days of [33, 34, 35, 36, 37]) await order("moth", days);
  await order("moth", 3, { isTest: true });
  await order("moth", 4, { source: "import" });
  await order("moth", 5, { paymentStatus: "pending" });
  await order("moth", 80);
  shopAccess.lastSignIn?.set("moth moth@example.com", ago(40));
  // Wasp: selling steadily, signed in yesterday.
  for (const days of [2, 9, 16, 30, 40, 50]) await order("wasp", days);
  shopAccess.lastSignIn?.set("wasp wasp@example.com", ago(1));
  const sent = [];
  let at = NOW;
  const watch = createDriftWatch({ registry, shopData, shopAccess, email: { sendPlatform: async (m) => void sent.push(m) }, settings: { platformUrl: "https://platform.example" }, now: () => new Date(at) });
  return { registry, watch, sent, at: (ms) => (at = ms) };
}

test("the sweep keeps each paying shop's score on its row and emails the drifting one once", async () => {
  const w = await world();
  const run = await w.watch.sweep();
  assert.equal(run.summary, "1 drifting, 0 to watch, 1 fine, 1 emailed");
  const moth = (await w.registry.getShop("moth")).drift;
  assert.equal(moth.level, "drifting");
  assert.deepEqual(moth.orders, { recent: 0, before: 5 }, "practice, brought-over, unpaid and older orders don't count");
  assert.ok(moth.checkedInAt);
  assert.equal((await w.registry.getShop("wasp")).drift.level, "fine");
  assert.equal((await w.registry.getShop("trial")).drift, undefined, "a trial isn't watched");
  assert.equal(w.sent.length, 1);
  assert.equal(w.sent[0].kind, "quiet-shop");
  assert.equal(w.sent[0].data.helpLink, "https://platform.example/help/");
  // The next day: still drifting, no second email until 60 days have passed.
  w.at(NOW + DAY);
  await w.watch.sweep();
  assert.equal(w.sent.length, 1);
  // 60 days after the last check-in, still drifting: one more.
  w.at(NOW);
  const row = await w.registry.getShop("moth");
  await w.registry.updateShop("moth", { drift: { ...row.drift, checkedInAt: ago(CHECK_IN_EVERY_DAYS + 1) } });
  await w.watch.sweep();
  assert.equal(w.sent.length, 2);
});

test("hosted, where the shop's sign-in can't be read yet, the orders decide alone", async () => {
  const w = await world({ shopAccess: notConnectedClient(NOT_CONNECTED.signInSafety, ["signInSafety"]) });
  await w.watch.sweep();
  const moth = (await w.registry.getShop("moth")).drift;
  assert.deepEqual([moth.level, moth.score, moth.lastSignInAt], ["watch", 2, null]);
  assert.equal(w.sent.length, 0);
});

test("Today lists the drifting presses with their reasons", async () => {
  const w = await world();
  await w.watch.sweep();
  const { needs } = todaySummary({ rows: await w.registry.listShops(), settings, now: new Date(NOW) });
  assert.deepEqual(needs.filter((n) => n.kind === "drift").map((n) => n.words), [
    "Moth Press may be drifting away: no orders in the last 4 weeks (5 the 4 before); no one signed in for 40 days (check-in email sent)",
  ]);
});

test("the check-in email exists in English and French", () => {
  const data = { pressName: "Moth Press", link: "https://moth.example/admin#overview", helpLink: "https://platform.example/help/" };
  assert.match(TEMPLATES["quiet-shop"](data, { settings }).subject, /How is Moth Press getting on/);
  assert.match(TEMPLATES_FR["quiet-shop"](data, { settings }).subject, /Comment ça va pour Moth Press/);
});
