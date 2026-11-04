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
  return { registry, shopData, watch, sent, at: (ms) => (at = ms) };
}

test("the sweep keeps each paying shop's score on its row and emails the drifting one once", async () => {
  const w = await world();
  const run = await w.watch.sweep();
  assert.equal(run.summary, "1 drifting, 0 to watch, 1 fine, 1 emailed, 0 moves stuck, 0 newsletters stopped");
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

test("a drifting press the platform closes leaves Today and the Shops list's risk, keeping when it was emailed", async () => {
  const w = await world();
  await w.watch.sweep();
  const emailed = (await w.registry.getShop("moth")).drift.checkedInAt;
  await w.registry.updateShop("moth", { closure: { by: "admin@example.com", reason: "selling stolen goods", at: ago(0) } });
  w.at(NOW + DAY);
  await w.watch.sweep();
  const drift = (await w.registry.getShop("moth")).drift;
  assert.equal(drift.level, undefined);
  assert.equal(drift.checkedInAt, emailed);
  const { needs } = todaySummary({ rows: await w.registry.listShops(), settings, now: new Date(NOW + DAY) });
  assert.deepEqual(needs.filter((n) => n.kind === "drift"), []);
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

test("a snoozed press leaves Today and gets no check-in email until the snooze ends", async () => {
  const { createDriftDesk } = await import("./driftWatch.js");
  const { controlRoomAdmins } = await import("./controlRoom.js");
  const w = await world();
  const log = [];
  const desk = createDriftDesk({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry: w.registry, settings, activity: { record: async (e) => void log.push(e) }, now: () => new Date(NOW) });
  const admin = { uid: "a", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
  await assert.rejects(desk.snooze(admin, { shopId: "moth", reason: "x" }), /at least 10/);
  await assert.rejects(desk.snooze(admin, { shopId: "moth", reason: "spoke to Lou on the phone" }), /hasn't looked/);
  await w.watch.sweep();
  assert.equal(w.sent.length, 1);
  // Snoozed before the next 60-day check-in would go.
  const { snoozedUntil } = await desk.snooze(admin, { shopId: "moth", reason: "spoke to Lou on the phone" });
  assert.equal(snoozedUntil, new Date(NOW + 30 * DAY).toISOString());
  assert.deepEqual(log.map((e) => [e.what, e.shopId, e.detail.days]), [["drift-snoozed", "moth", 30]]);
  const today = () => w.registry.listShops().then((rows) => todaySummary({ rows, settings, now: new Date(NOW) }).needs.filter((n) => n.kind === "drift"));
  assert.deepEqual(await today(), []);
  // The sweep keeps the snooze and sends nothing, even past the 60 days.
  const row = await w.registry.getShop("moth");
  await w.registry.updateShop("moth", { drift: { ...row.drift, checkedInAt: ago(CHECK_IN_EVERY_DAYS + 1) } });
  await w.watch.sweep();
  assert.equal((await w.registry.getShop("moth")).drift.snoozedUntil, snoozedUntil);
  assert.equal(w.sent.length, 1);
  // Woken again: back on Today.
  await desk.snooze(admin, { shopId: "moth", days: 0, reason: "they went quiet again" });
  assert.equal((await w.registry.getShop("moth")).drift.snoozedUntil, undefined);
  assert.equal((await today()).length, 1);
});

test("presses at risk: drifting and to watch, with the monthly income they bring in", async () => {
  const { atRiskSummary } = await import("./driftWatch.js");
  const w = await world();
  await w.watch.sweep();
  await w.registry.updateShop("wasp", { drift: { level: "watch", score: 1, reasons: ["orders down from 8 to 3 over 4 weeks"] } });
  const risk = atRiskSummary(await w.registry.listShops(), { ...settings, prices: { both: 3900 } }, NOW);
  assert.deepEqual(risk.presses.map((p) => [p.shopId, p.level]), [["moth", "drifting"], ["wasp", "watch"]]);
  assert.deepEqual([risk.drifting, risk.watch], [{ count: 1, monthlyCents: 0 }, { count: 1, monthlyCents: 0 }], "no plan on these rows: no price");
  await w.registry.updateShop("moth", { plan: "both" });
  assert.equal(atRiskSummary(await w.registry.listShops(), { ...settings, prices: { both: 3900 } }, NOW).drifting.monthlyCents, 3900);
});

test("a move left part-way for a week shows on Today, and clears when it's finished", async () => {
  const { moveStuck } = await import("./driftWatch.js");
  const start = (done, extra = {}) => ({ bring: { from: "online" }, done, ...extra });
  const day = (days) => ago(days).slice(0, 10);
  assert.equal(moveStuck(start({ "move-customers": day(3) }), NOW), null, "ticked three days ago: still going");
  assert.equal(moveStuck(start({}), NOW), null, "nothing ticked yet");
  assert.equal(moveStuck(start({ "move-customers": day(9), "move-list": day(8) }), NOW), null, "list put away");
  assert.equal(moveStuck({ bring: { skipped: true }, done: { "move-customers": day(9) } }, NOW), null);
  assert.deepEqual(moveStuck(start({ "move-customers": day(12), "move-orders": day(9) }), NOW), { done: 3, of: 5, left: ["Gift cards", "Pages and old links"], lastDay: day(9), days: 9 });

  const w = await world();
  const shopData = w.shopData;
  await shopData.set("trial", "firstWeek/start", start({ "move-customers": day(12), "move-orders": day(9) }));
  const run = await w.watch.sweep();
  assert.match(run.summary, /1 move stuck/);
  const words = () => w.registry.listShops().then((rows) => todaySummary({ rows, settings, now: new Date(NOW) }).needs.filter((n) => n.kind === "move").map((n) => n.words));
  assert.deepEqual(await words(), ["Trial Press is part-way through moving from their old shop: 3 of 5 parts done, still to do gift cards, pages and old links (last part done 9 days ago)"]);
  await shopData.set("trial", "firstWeek/start", start({ "move-customers": day(12), "move-orders": day(9), "move-giftcards": day(0), "move-links": day(0) }));
  await w.watch.sweep();
  assert.deepEqual(await words(), []);
  assert.equal((await w.registry.getShop("trial")).moveStuck, null);
});

test("the Shops list carries each press's drift and snooze, for the Risk filter and the record", async () => {
  const { createControlRoom, controlRoomAdmins } = await import("./controlRoom.js");
  const w = await world();
  await w.watch.sweep();
  await w.registry.updateShop("wasp", { drift: { level: "watch", score: 1, reasons: ["r"], snoozedUntil: ago(-5), snoozedBy: "admin@example.com" } });
  await w.registry.updateShop("trial", { drift: { level: "drifting", score: 3, reasons: ["r"], snoozedUntil: ago(1) } });
  const room = createControlRoom({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry: w.registry, now: () => new Date(NOW) });
  const admin = { uid: "a", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
  const { shops } = await room.shops(admin);
  const by = Object.fromEntries(shops.map((s) => [s.shopId, s.drift]));
  assert.equal(by.moth.level, "drifting");
  assert.equal(by.wasp.snoozedUntil, ago(-5));
  assert.equal(by.trial.snoozedUntil, null, "a snooze that has ended isn't shown");
});

test("fair till checkouts count as sales, so a press selling at fairs isn't drifting", async () => {
  const { fakeStockroomData } = await import("../services/billing/closingFakes.js");
  const registry = fakeRegistry();
  const shopData = fakeShopData();
  const stockroomData = fakeStockroomData();
  await registry.createShop("fair", { shopId: "fair", pressName: "Fair Press", ownerEmail: "f@example.com", plan: "both", status: "live", billing: { status: "active" }, liveAt: ago(120) });
  // Five website orders five weeks ago and none since, but three fair checkouts last week (one over two books, one voided).
  for (const days of [33, 34, 35, 36, 37]) await shopData.set("fair", `orders/o${days}`, { paymentStatus: "paid", createdAt: ago(days) });
  await stockroomData.set("fair", "settings/catalog", { data: JSON.stringify({ a: {}, b: {} }), ts: 1 });
  const day = (d) => ago(d).slice(0, 10);
  await stockroomData.set("fair", "books/a/data/hist", { data: JSON.stringify([{ num: "P1", chan: "Book Fair", qty: 1, date: day(6) }, { num: "P2", chan: "Book Fair", qty: 1, date: day(6) }, { num: "P9", chan: "Book Fair", qty: 1, date: day(6), voided: true }]), ts: 1 });
  await stockroomData.set("fair", "books/b/data/hist", { data: JSON.stringify([{ num: "P1", chan: "Book Fair", qty: 1, date: day(6) }, { num: "P3", chan: "Book Fair", qty: 2, date: day(5) }]), ts: 1 });
  const shopAccess = fakeShopAccess();
  shopAccess.lastSignIn.set("fair f@example.com", ago(1));
  const watch = createDriftWatch({ registry, shopData, stockroomData, shopAccess, email: { sendPlatform: async () => {} }, settings: {}, now: () => new Date(NOW) });
  await watch.sweep();
  const drift = (await registry.getShop("fair")).drift;
  assert.deepEqual(drift.orders, { recent: 3, before: 5, fair: { recent: 3, before: 0 } });
  assert.equal(drift.level, "fine", "3 of 5 isn't half or less");
  // A shop-only plan never reads a stockroom.
  await registry.updateShop("fair", { plan: "shop" });
  await watch.sweep();
  assert.deepEqual((await registry.getShop("fair")).drift.orders, { recent: 0, before: 5 });
});

test("a stalled move shows when the shop's own reminder email went", async () => {
  const w = await world();
  const day = (d) => ago(d).slice(0, 10);
  await w.shopData.set("trial", "firstWeek/start", { bring: { from: "online" }, done: { "move-customers": day(12), "move-orders": day(9) } });
  await w.shopData.set("trial", "systemStatus/moveReminder", { forLastMoved: `${day(9)}T00:00:00.000Z`, sentAt: ago(2) });
  await w.watch.sweep();
  assert.equal((await w.registry.getShop("trial")).moveStuck.remindedAt, ago(2));
  const { needs } = todaySummary({ rows: await w.registry.listShops(), settings, now: new Date(NOW) });
  assert.match(needs.find((n) => n.kind === "move").words, new RegExp(`the shop emailed them a reminder ${ago(2).slice(0, 10)}`));
});

test("a newsletter stopped part-way is kept on the shop's row for Today, and cleared once it's sorted", async () => {
  const w = await world();
  await w.shopData.set("wasp", "newsletterIssues/n1", { subject: "Spring list", status: "paused", lastError: "Too many emails bounced." });
  await w.shopData.set("wasp", "newsletterIssues/n0", { subject: "Winter", status: "sent" });
  const run = await w.watch.sweep();
  assert.match(run.summary, /1 newsletter stopped/);
  assert.deepEqual((await w.registry.getShop("wasp")).newsletterPaused, { count: 1, subject: "Spring list", lastError: "Too many emails bounced." });
  assert.equal((await w.registry.getShop("moth")).newsletterPaused, undefined, "nothing written when nothing changed");
  const { needs } = todaySummary({ rows: await w.registry.listShops(), settings, now: new Date(NOW) });
  assert.equal(needs.find((n) => n.kind === "newsletter").words, `Wasp Press's newsletter "Spring list" stopped part-way: Too many emails bounced.`);
  await w.shopData.set("wasp", "newsletterIssues/n1", { subject: "Spring list", status: "sent" });
  await w.watch.sweep();
  assert.equal((await w.registry.getShop("wasp")).newsletterPaused, null);
});
