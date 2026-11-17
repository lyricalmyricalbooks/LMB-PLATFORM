// Ways to sell (beta) in the control room: admins only; every way off until turned on; a way that isn't built can't be
// turned on; on writes the shop's `platform/features` › `ways` beside Bookings' switch and the registry row, logged
// once (a repeat writes nothing); off keeps the rest; the overview counts shops per way.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWaysBeta, waysBetaRoutes, START_DOC } from "./waysBeta.js";
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

test("today nothing is built, so nothing can be turned on", async () => {
  const w = await world({ ways: WAYS });
  for (const way of WAYS) {
    await assert.rejects(w.desk.set(ADMIN, { shopId: SHOP, way: way.id, on: true }), (e) => e.status === 409 && /isn't built yet/.test(e.message), way.id);
  }
  assert.equal(await w.shopData.get(SHOP, FEATURES_DOC), null);
  assert.ok((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.every((way) => !way.built && !way.on));
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
  await w.shopData.set(SHOP, START_DOC, { publishes: "books", ways: { events: true, digital: true } });
  const rows = Object.fromEntries((await w.desk.forShop(ADMIN, { shopId: SHOP })).ways.map((way) => [way.id, way]));
  assert.deepEqual([rows.events.on, rows.events.ownerOn, rows.events.changedBy], [true, true, "admin@example.com"]);
  assert.deepEqual([rows.rentals.on, rows.rentals.ownerOn], [true, false]);
  assert.deepEqual([rows.digital.built, rows.digital.on, rows.digital.ownerOn], [false, false, false]);
  assert.deepEqual(waysOn(await w.shopData.get(SHOP, FEATURES_DOC), await w.shopData.get(SHOP, START_DOC)), ["events"]);
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
  const view = await w.desk.overview(ADMIN);
  assert.deepEqual(view.shops.map((s) => [s.shopId, s.ways, s.testShop]), [["test-goods", ["events"], true], [SHOP, [], false]]);
  assert.deepEqual(view.totals, { shops: 2, withAny: 1 });
  assert.deepEqual(view.ways.map((way) => [way.id, way.built, way.shops]).slice(0, 2), [["events", true, 1], ["classes", false, 0]]);
});
