// Bookings (beta) in a live shop's record: admins only; off until turned on; turning it on writes platform/features and
// the registry row and logs it once (a repeat writes nothing); off keeps everything else in the features doc; a shop not
// live or without a website can't have it; the use counts services and bookings either side of now, held ones left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingsBetaRoutes, bookingsUse, createBookingsBeta, FEATURES_DOC, BOOKING_SETTINGS_DOC, keptMinor, monthUse } from "./bookingsBeta.js";
import { createRequire } from "node:module";
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

async function world({ texts = null } = {}) {
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
  const desk = createBookingsBeta({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, auditLog, shopData, activity, texts, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: bookingsBetaRoutes(desk), log: () => {} });
  const ask = (claims, path, body) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  const get = (claims, path) => api({ method: "GET", path, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask, get, registry, shopData, activity };
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
  assert.equal(bookings.texts, null, "no text line while texts aren't open");
  const texts = { available: true, forShop: async (shopId) => ({ available: true, month: "2026-11", texts: 12, parts: 14, cents: 22, currency: "CAD", shopId }) };
  const withTexts = (await (await world({ texts })).desk.forShop(ADMIN, { shopId: SHOP })).bookings.texts;
  assert.deepEqual([withTexts.texts, withTexts.cents, withTexts.shopId], [12, 22, SHOP]);
  assert.deepEqual(bookingsUse([], [], NOW), { services: 0, hiddenServices: 0, lastDays: 0, nextDays: 0, cancelled: 0, paid: 0, fromWebsite: 0 });
});

test("the overview lists every live shop with a website, with this month's bookings for those that have it on", async () => {
  const w = await world();
  await w.registry.createShop("test-press", { shopId: "test-press", status: "live", plan: "both", pressName: "Test Press", testShop: true });
  await w.registry.createShop("test-goods", { shopId: "test-goods", status: "live", plan: "shop", pressName: "Test Goods", testShop: true });
  await w.desk.set(ADMIN, { shopId: SHOP, on: true });
  await w.shopData.set(SHOP, BOOKING_SETTINGS_DOC, { live: true, googleCalendar: true });
  await w.shopData.set(SHOP, "bookings/paid", { start: at(-2), status: "confirmed", payment: "card", priceMinor: 4500, paid: true, currency: "CAD" });
  await w.shopData.set(SHOP, "bookings/missed", { start: at(-1), status: "confirmed", payment: "deposit", priceMinor: 6000, depositMinor: 2000, depositPaid: true, noShow: true, currency: "CAD" });
  assert.equal((await w.get(PRESS, "/api/control/bookings/overview")).status, 403);
  const answer = await w.get(ADMIN, "/api/control/bookings/overview");
  assert.equal(answer.status, 200);
  const view = await w.desk.overview(ADMIN);
  assert.equal(view.month, "2026-11");
  assert.deepEqual(view.shops.map((s) => [s.shopId, s.on]), [[SHOP, true], ["test-goods", false], ["test-press", false]], "on first, then by name; no stockroom-only or unfinished shop");
  const moth = view.shops[0];
  assert.deepEqual([moth.live, moth.google], [true, true]);
  // a (paid, no price), c (coming) and the two above are confirmed this month; b is cancelled; d is held; "old" is September.
  assert.deepEqual(moth.month, { bookings: 4, noShows: 1, cancelled: 1, money: { CAD: 6500 } });
  assert.deepEqual(view.totals, { on: 1, shops: 3, bookings: 4, noShows: 1, money: { CAD: 6500 } });
  assert.deepEqual(view.needsLook, []);
  assert.deepEqual(view.testShops, { total: 2, off: 2 });
  await w.shopData.set(SHOP, BOOKING_SETTINGS_DOC, { live: false });
  assert.match((await w.desk.overview(ADMIN)).needsLook[0].why, /isn't open yet/);
});

test("turning it on for every test shop changes only the test shops, and a repeat changes nothing", async () => {
  const w = await world();
  await w.registry.createShop("test-press", { shopId: "test-press", status: "live", plan: "both", pressName: "Test Press", testShop: true });
  await w.registry.createShop("test-stock", { shopId: "test-stock", status: "live", plan: "stockroom", testShop: true });
  assert.equal((await w.ask(PRESS, "/api/control/bookings/test-shops", { on: true })).status, 403);
  assert.equal((await w.ask(ADMIN, "/api/control/bookings/test-shops", {})).status, 400);
  const first = await w.desk.setTestShops(ADMIN, { on: true });
  assert.deepEqual(first.shops.map((r) => [r.shopId, r.changed]), [["test-press", true]]);
  assert.equal((await w.shopData.get("test-press", FEATURES_DOC)).bookings, true);
  assert.equal(await w.shopData.get(SHOP, FEATURES_DOC), null, "a real shop is left alone");
  assert.equal((await w.desk.setTestShops(ADMIN, { on: true })).changed, 0);
});

test("money kept follows the shop's own rule", () => {
  const { moneyKept } = createRequire(import.meta.url)("../apps/shop/functions/shared/bookingTimes.js");
  const cases = [
    { payment: "card", priceMinor: 4500, paid: true },
    { payment: "card", priceMinor: 4500, paid: true, refund: { amountMinor: 4500 } },
    { payment: "deposit", priceMinor: 12000, depositMinor: 3000, depositPaid: true },
    { payment: "deposit", priceMinor: 12000, depositMinor: 3000, depositPaid: true, rest: { amountMinor: 9000 } },
    { payment: "card", priceMinor: 6000, paid: true, giftCard: { amountMinor: 2500 } },
    { payment: "card", priceMinor: 6000, paid: true, status: "cancelled", giftCard: { amountMinor: 2500, returned: true }, refund: { amountMinor: 3500 } },
    { payment: "free", priceMinor: 0, fee: { amountMinor: 2000 } },
    { payment: "atShop", priceMinor: 5000, paid: true },
    { payment: "atShop", priceMinor: 5000 },
    { payment: "pack", priceMinor: 0, paid: true },
    {},
  ];
  for (const b of cases) assert.equal(keptMinor(b), moneyKept(b), JSON.stringify(b));
  assert.deepEqual(monthUse([], "USD"), { bookings: 0, noShows: 0, cancelled: 0, money: {} });
});
