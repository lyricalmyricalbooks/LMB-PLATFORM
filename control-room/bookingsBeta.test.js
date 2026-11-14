// Bookings (beta) in a live shop's record: admins only; off until turned on; turning it on writes platform/features and
// the registry row and logs it once (a repeat writes nothing); off keeps everything else in the features doc; a shop not
// live or without a website can't have it; the use counts services and bookings either side of now, held ones left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsBetaRoutes, bookingsUse, createBookingsBeta, FEATURES_DOC } from "./bookingsBeta.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { eventLine } from "./timeline.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-14T12:00:00Z");
const at = (days) => new Date(NOW + days * DAY).toISOString();
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const SHOP = "moth-press";

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, status: "live", plan: "both", pressName: "Moth Press" });
  await registry.createShop("stock-only", { shopId: "stock-only", status: "live", plan: "stockroom" });
  await registry.createShop("new-press", { shopId: "new-press", status: "making", plan: "both" });
  const shopData = fakeShopData();
  await shopData.set(SHOP, "bookingServices/visit", { name: "Studio visit", active: true });
  await shopData.set(SHOP, "bookingServices/old", { name: "Old class", active: false });
  await shopData.set(SHOP, "bookings/a", { start: at(-3), status: "confirmed", paid: true, source: "website" });
  await shopData.set(SHOP, "bookings/b", { start: at(-1), status: "cancelled", source: "website" });
  await shopData.set(SHOP, "bookings/c", { start: at(2), status: "confirmed", source: "admin" });
  await shopData.set(SHOP, "bookings/d", { start: at(2), status: "held", source: "website" });
  await shopData.set(SHOP, "bookings/old", { start: at(-90), status: "confirmed", source: "website" });
  const auditLog = fakeAuditLog();
  const activity = { rows: [], record: async (entry) => void activity.rows.push(entry) };
  const desk = createBookingsBeta({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, auditLog, shopData, activity, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: bookingsBetaRoutes(desk), log: () => {} });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, registry, shopData, activity };
}

test("only platform admins see or change a shop's Bookings", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, "/api/control/bookings", { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(PRESS, "/api/control/bookings/set", { shopId: SHOP, on: true })).status, 403);
  assert.equal((await w.ask(ADMIN, "/api/control/bookings", { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, "/api/control/bookings", { shopId: SHOP })).status, 200);
  assert.equal(await w.shopData.get(SHOP, FEATURES_DOC), null);
});

test("off until turned on; on writes the shop's switch and the registry, logged once; a repeat changes nothing", async () => {
  const w = await world();
  assert.equal((await w.desk.forShop(ADMIN, { shopId: SHOP })).bookings.on, false);
  await w.shopData.set(SHOP, FEATURES_DOC, { other: "kept" });
  assert.deepEqual(await w.desk.set(ADMIN, { shopId: SHOP, on: true }), { shopId: SHOP, on: true, changed: true });
  assert.deepEqual(await w.shopData.get(SHOP, FEATURES_DOC), { other: "kept", bookings: true, bookingsChangedAt: at(0), bookingsChangedBy: "admin@example.com" });
  assert.equal((await w.registry.getShop(SHOP)).bookingsBeta, true);
  assert.equal((await w.desk.set(ADMIN, { shopId: SHOP, on: true })).changed, false);
  assert.equal(w.activity.rows.length, 1);
  assert.equal(eventLine({ at: at(0), source: "control-room", what: "bookings-set", to: true }).words, "Turned Bookings (beta) on");
  const shown = (await w.desk.forShop(ADMIN, { shopId: SHOP })).bookings;
  assert.deepEqual([shown.on, shown.changedBy], [true, "admin@example.com"]);
  await w.desk.set(ADMIN, { shopId: SHOP, on: false });
  assert.equal((await w.shopData.get(SHOP, FEATURES_DOC)).bookings, false);
  assert.equal((await w.shopData.get(SHOP, FEATURES_DOC)).other, "kept");
  assert.ok(await w.shopData.get(SHOP, "bookings/a"), "turning it off keeps the bookings");
});

test("a shop not live, or without a website, can't have Bookings; a missing answer is refused", async () => {
  const w = await world();
  assert.equal((await w.desk.forShop(ADMIN, { shopId: "new-press" })).words, "Not live yet.");
  assert.match((await w.desk.forShop(ADMIN, { shopId: "stock-only" })).words, /no website/);
  assert.equal((await w.ask(ADMIN, "/api/control/bookings/set", { shopId: "stock-only", on: true })).status, 409);
  assert.equal((await w.ask(ADMIN, "/api/control/bookings/set", { shopId: SHOP })).status, 400);
});

test("use: services on offer, bookings either side of now, held ones left out", async () => {
  const { bookings } = await (await world()).desk.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual(bookings.use, { services: 1, hiddenServices: 1, lastDays: 1, nextDays: 1, cancelled: 1, paid: 1, fromWebsite: 1 });
  assert.deepEqual(bookingsUse([], [], NOW), { services: 0, hiddenServices: 0, lastDays: 0, nextDays: 0, cancelled: 0, paid: 0, fromWebsite: 0 });
});
