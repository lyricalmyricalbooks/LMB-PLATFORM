// Ways to sell (beta) in the control room: admins only; every way off until turned on; a way that isn't built can't be
// turned on; on writes the shop's `platform/features` › `ways` beside Bookings' switch and the registry row, logged
// once (a repeat writes nothing); off keeps the rest; the overview counts shops per way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWaysBeta, eventsUse, givingUse, membershipsUse, waysBetaRoutes, START_DOC } from "./waysBeta.js";
import { FEATURES_DOC } from "./bookingsBeta.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { eventLine } from "./timeline.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";
import { WAYS, waysOn } from "../shared/ways/ways.js";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const STAMP = new Date(NOW).toISOString();
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const SHOP = "moth-press";
// Events and rentals built, the rest not: what the room looks like part-way through the build.
const PART_BUILT = WAYS.map((way) => ({ ...way, built: ["events", "rentals"].includes(way.id) }));

async function world({ ways = PART_BUILT } = {}) {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, status: "live", plan: "both", pressName: "Moth Press" });
  await registry.createShop("test-goods", { shopId: "test-goods", status: "live", plan: "both", pressName: "Test Goods", testShop: true });
  await registry.createShop("stock-only", { shopId: "stock-only", status: "live", plan: "stockroom" });
  await registry.createShop("new-press", { shopId: "new-press", status: "making", plan: "both" });
  const shopData = fakeShopData();
  const activity = { rows: [], record: async (entry) => void activity.rows.push(entry) };
  const desk = createWaysBeta({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, auditLog: fakeAuditLog(), shopData, activity, ways, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: waysBetaRoutes(desk), log: () => {} });
  const ask = (claims, path, body) => api({ method: body ? "POST" : "GET", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, registry, shopData, activity };
}

test("only platform admins see or change a shop's ways to sell", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "/api/control/ways", { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(PRESS, "/api/control/ways/set", { shopId: SHOP, way: "events", on: true })).status, 403);
  assert.equal((await w.ask(PRESS, "/api/control/ways/overview")).status, 403);
  assert.equal((await w.ask(ADMIN, "/api/control/ways", { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, "/api/control/ways", { shopId: SHOP })).status, 200);
  assert.equal((await w.ask(ADMIN, "/api/control/ways/overview")).status, 200);
  assert.equal(await w.shopData.get(SHOP, FEATURES_DOC), null);
});

test("today only Events, Classes, Digital goods, Donations and Memberships are built, so nothing else can be turned on", async () => {
  const w = await world({ ways: WAYS });
  assert.deepEqual(WAYS.filter((way) => way.built).map((way) => way.id), ["events", "classes", "digital", "giving", "memberships"]);
  for (const way of WAYS.filter((x) => !x.built)) {
    await assert.rejects(w.desk.set(ADMIN, { shopId: SHOP, way: way.id, on: true }), (e) => e.status === 409 && /isn't built yet/.test(e.message), way.id);
  }
  assert.equal(await w.shopData.get(SHOP, FEATURES_DOC), null);
  assert.ok((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.every((way) => way.built === ["events", "classes", "giving", "digital", "memberships"].includes(way.id) && !way.on));
});

test("off until turned on; on writes the shop's switch beside Bookings' and the registry, logged once", async () => {
  const w = await world();
  await w.shopData.set(SHOP, FEATURES_DOC, { bookings: true, bookingsChangedBy: "setup" });
  assert.deepEqual(await w.desk.set(ADMIN, { shopId: SHOP, way: "events", on: true }), { shopId: SHOP, way: "events", on: true, changed: true });
  assert.deepEqual(await w.shopData.get(SHOP, FEATURES_DOC), { bookings: true, bookingsChangedBy: "setup", ways: { events: true }, waysChanged: { events: { at: STAMP, by: "admin@example.com" } } });
  assert.deepEqual((await w.registry.getShop(SHOP)).waysBeta, ["events"]);
  assert.equal((await w.desk.set(ADMIN, { shopId: SHOP, way: "events", on: true })).changed, false);
  assert.equal(w.activity.rows.length, 1);
  assert.equal(eventLine({ at: STAMP, source: "control-room", what: "ways-set", way: "events", to: true }).words, "Turned Events & tickets (beta) on");

  await w.desk.set(ADMIN, { shopId: SHOP, way: "rentals", on: true });
  assert.deepEqual((await w.registry.getShop(SHOP)).waysBeta, ["events", "rentals"]);
  await w.desk.set(ADMIN, { shopId: SHOP, way: "events", on: false });
  const features = await w.shopData.get(SHOP, FEATURES_DOC);
  assert.deepEqual(features.ways, { rentals: true });
  assert.equal(features.bookings, true, "Bookings' switch is left alone");
  assert.deepEqual((await w.registry.getShop(SHOP)).waysBeta, ["rentals"]);
});

test("the shop's record shows each way, and whether the owner switched it on", async () => {
  const w = await world();
  await w.desk.set(ADMIN, { shopId: SHOP, way: "events", on: true });
  await w.desk.set(ADMIN, { shopId: SHOP, way: "rentals", on: true });
  // The owner's own switches: one way the platform allows, one it doesn't.
  await w.shopData.set(SHOP, START_DOC, { publishes: "books", ways: { events: true, digital: true }, alsoSells: ["rentals", "classes"] });
  const rows = Object.fromEntries((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.map((way) => [way.id, way]));
  assert.deepEqual([rows.events.on, rows.events.ownerOn, rows.events.changedBy], [true, true, "admin@example.com"]);
  assert.deepEqual([rows.rentals.on, rows.rentals.ownerOn], [true, false]);
  assert.deepEqual([rows.rentals.asked, rows.classes.asked, rows.events.asked], [true, true, false], "what the owner asked for at sign-up");
  assert.deepEqual([rows.digital.built, rows.digital.on, rows.digital.ownerOn], [false, false, false]);
  assert.deepEqual(waysOn(await w.shopData.get(SHOP, FEATURES_DOC), await w.shopData.get(SHOP, START_DOC)), ["events"]);
});

test("the shop's record shows how it uses Events: events, coming ones and tickets sold", async () => {
  const w = await world();
  await w.desk.set(ADMIN, { shopId: SHOP, way: "events", on: true });
  const soon = new Date(NOW + 86_400_000).toISOString();
  const past = new Date(NOW - 86_400_000).toISOString();
  await w.shopData.set(SHOP, "events/launch", { title: "Launch", status: "live", start: soon });
  await w.shopData.set(SHOP, "events/draft", { title: "Draft", status: "draft", start: soon });
  await w.shopData.set(SHOP, "events/old", { title: "Old", status: "live", start: past });
  await w.shopData.set(SHOP, "events/off", { title: "Off", status: "cancelled", start: soon });
  await w.shopData.set(SHOP, "eventPlaces/launch", { sold: { g: 4, s: 1 }, paidMinor: 9000 });
  await w.shopData.set(SHOP, "eventPlaces/old", { sold: { g: 7 }, paidMinor: 3500, held: { x: { until: soon } } });
  // Another shop's events never count here.
  await w.shopData.set("test-goods", "events/theirs", { title: "Theirs", status: "live", start: soon });
  await w.shopData.set("test-goods", "eventPlaces/theirs", { sold: { g: 50 } });
  const rows = Object.fromEntries((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.map((way) => [way.id, way]));
  assert.deepEqual(rows.events.use, { events: 4, coming: 2, onSale: 1, ticketsSold: 12, paidMinor: 12500 });
  assert.equal(rows.rentals.use, null);
  assert.deepEqual(eventsUse([], [], NOW), { events: 0, coming: 0, onSale: 0, ticketsSold: 0, paidMinor: 0 });
});

test("a shop not live, or without a website, can't have one; a wrong way or a missing answer is refused", async () => {
  const w = await world();
  assert.equal((await w.desk.forShop(ADMIN, { shopId: "new-press" })).words, "Not live yet.");
  assert.match((await w.desk.forShop(ADMIN, { shopId: "stock-only" })).words, /no website/);
  await assert.rejects(w.desk.set(ADMIN, { shopId: "new-press", way: "events", on: true }), (e) => e.status === 409);
  await assert.rejects(w.desk.set(ADMIN, { shopId: SHOP, way: "books", on: true }), (e) => e.status === 400);
  await assert.rejects(w.desk.set(ADMIN, { shopId: SHOP, way: "events" }), (e) => e.status === 400);
});

test("a way turned on before can always be turned off, even one no longer built", async () => {
  const w = await world();
  await w.shopData.set(SHOP, FEATURES_DOC, { ways: { classes: true } });
  assert.equal((await w.desk.set(ADMIN, { shopId: SHOP, way: "classes", on: false })).changed, true);
  assert.deepEqual((await w.shopData.get(SHOP, FEATURES_DOC)).ways, {});
});

test("the overview lists live shops with a website and counts shops per way", async () => {
  const w = await world();
  await w.desk.set(ADMIN, { shopId: "test-goods", way: "events", on: true });
  await w.registry.updateShop(SHOP, { alsoSells: ["classes", "events", "junk"] });
  const view = await w.desk.overview(ADMIN);
  assert.deepEqual(view.shops.map((s) => [s.shopId, s.ways, s.testShop]), [["test-goods", ["events"], true], [SHOP, [], false]]);
  assert.deepEqual(view.shops[1].asked, ["events", "classes"]);
  assert.deepEqual(view.ways.map((way) => way.asked), [1, 1, 0, 0, 0, 0]);
  assert.deepEqual(view.totals, { shops: 2, withAny: 1 });
  assert.deepEqual(view.ways.map((way) => [way.id, way.built, way.shops]).slice(0, 2), [["events", true, 1], ["classes", false, 0]]);
});

test("the shop's record shows how it uses Donations: gifts, what they came to and the tries the guard refused", async () => {
  const w = await world({ ways: WAYS });
  await w.desk.set(ADMIN, { shopId: SHOP, way: "giving", on: true });
  const day = (ago) => new Date(NOW - ago * 86_400_000).toISOString().slice(0, 10);
  await w.shopData.set(SHOP, "gifts/a", { status: "paid", chargedMinor: 2603, currency: "CAD" });
  await w.shopData.set(SHOP, "gifts/b", { status: "refunded", chargedMinor: 5000, currency: "CAD" });
  await w.shopData.set(SHOP, "gifts/c", { status: "paid", chargedMinor: 1000, currency: "CAD", mode: "test" });
  await w.shopData.set(SHOP, "gifts/d", { status: "held", chargedMinor: 1000, currency: "CAD" });
  await w.shopData.set(SHOP, "gifts/e", { status: "paid", chargedMinor: 0, currency: "CAD", receipt: { status: "issued", test: false } });
  await w.shopData.set(SHOP, "gifts/f", { status: "refunded", chargedMinor: 0, currency: "CAD", receipt: { status: "cancelled", test: false } });
  await w.shopData.set(SHOP, "fundraisers/f1", { status: "live", raisedMinor: 12000 });
  await w.shopData.set(SHOP, "fundraisers/f2", { status: "ended", raisedMinor: 3000 });
  await w.shopData.set(SHOP, `givingBlocked/${day(0)}`, { day: day(0), tooMany: 6, bot: 1, total: 7 });
  await w.shopData.set(SHOP, `givingBlocked/${day(29)}`, { day: day(29), tooSmall: 2, total: 2 });
  // Older than 30 days, and another shop's tries, never count here.
  await w.shopData.set(SHOP, `givingBlocked/${day(30)}`, { day: day(30), tooMany: 40, total: 40 });
  await w.shopData.set("test-goods", `givingBlocked/${day(0)}`, { day: day(0), bot: 9, total: 9 });
  const rows = Object.fromEntries((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.map((way) => [way.id, way]));
  assert.deepEqual(rows.giving.use, {
    gifts: 2, givenMinor: 2603, currency: "CAD", blocked: { tooSmall: 2, tooMany: 6, bot: 1, total: 9 },
    receipts: 1, fundraisers: { count: 2, live: 1, raisedMinor: 15000 },
  });
  assert.deepEqual(givingUse([], [], NOW), { gifts: 0, givenMinor: 0, currency: "CAD", blocked: { tooSmall: 0, tooMany: 0, bot: 0, total: 0 }, receipts: 0, fundraisers: { count: 0, live: 0, raisedMinor: 0 } });
});

test("the shop's record shows how it uses Memberships: members now, free trials, failed payments and a month's money", async () => {
  const w = await world({ ways: WAYS });
  await w.desk.set(ADMIN, { shopId: SHOP, way: "memberships", on: true });
  const friends = { priceMinor: 1500, interval: "month", currency: "CAD" };
  const patrons = { priceMinor: 24000, interval: "year", currency: "CAD" };
  await w.shopData.set(SHOP, "memberships/a", { state: "active", plan: friends, customer: { email: "a@example.com" } });
  await w.shopData.set(SHOP, "memberships/b", { state: "pastDue", plan: friends });
  await w.shopData.set(SHOP, "memberships/c", { state: "ending", plan: patrons });
  await w.shopData.set(SHOP, "memberships/d", { state: "trial", plan: friends });
  // Never started, ended, and a test member never count; nor another shop's.
  await w.shopData.set(SHOP, "memberships/e", { state: "pending", plan: friends });
  await w.shopData.set(SHOP, "memberships/f", { state: "ended", plan: friends });
  await w.shopData.set(SHOP, "memberships/g", { state: "active", plan: friends, mode: "test" });
  await w.shopData.set("test-goods", "memberships/h", { state: "active", plan: friends });
  const rows = Object.fromEntries((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.map((way) => [way.id, way]));
  assert.deepEqual(rows.memberships.use, { members: 4, trial: 1, pastDue: 1, monthlyMinor: 5000, currency: "CAD" });
  assert.equal(JSON.stringify(rows.memberships.use).includes("example.com"), false);
  assert.deepEqual(membershipsUse([]), { members: 0, trial: 0, pastDue: 0, monthlyMinor: 0, currency: "CAD" });
});
