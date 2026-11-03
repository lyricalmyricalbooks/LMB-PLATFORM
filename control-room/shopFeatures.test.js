// Newsletters, the morning emails and changed orders in a live shop's record: admins only; newest newsletters first with
// any stopped part-way; the shop's alert switches (on unless switched off) with what is low now; orders of the last 90
// days shipped in parts or with items added; a plan without the website shows words only; read only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { alertsSummary, createShopFeatures, newslettersSummary, ordersSummary, shopFeaturesRoutes } from "./shopFeatures.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { eventLine } from "./timeline.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-03T12:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const SHOP = "moth-press";

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, status: "live", plan: "both" });
  await registry.createShop("stock-only", { shopId: "stock-only", status: "live", plan: "stockroom" });
  await registry.createShop("new-press", { shopId: "new-press", status: "making", plan: "both" });
  const shopData = fakeShopData();
  await shopData.set(SHOP, "newsletterIssues/a", { subject: "Old news", status: "sent", createdAt: ago(40), finishedAt: ago(40), sent: 100, skipped: 2 });
  await shopData.set(SHOP, "newsletterIssues/b", { subject: "New books", status: "sent", createdAt: ago(10), finishedAt: ago(10), sent: 120 });
  await shopData.set(SHOP, "newsletterIssues/c", { subject: "Fair", status: "paused", createdAt: ago(1), sent: 30, failed: 25, lastError: "Too many failures." });
  await shopData.set(SHOP, "settings/notifications", { shopAlerts: { dailyOrderDigest: false } });
  await shopData.set(SHOP, "systemStatus/lowStockAlerts", { items: { b1: "low", b2: "out", b3: "low" } });
  await shopData.set(SHOP, "orders/o1", { createdAt: ago(5), paymentStatus: "paid", partShipments: [{}, {}] });
  await shopData.set(SHOP, "orders/o2", { createdAt: ago(4), paymentStatus: "paid", shipsWith: "o1" });
  await shopData.set(SHOP, "orders/o3", { createdAt: ago(3), paymentStatus: "unpaid", shipsWith: "o1" });
  await shopData.set(SHOP, "orders/old", { createdAt: ago(200), paymentStatus: "paid", partShipments: [{}] });
  const desk = createShopFeatures({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: shopFeaturesRoutes(desk), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/shop-features", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask };
}

test("only platform admins see a shop's newsletters and morning emails", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(ADMIN, { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, { shopId: SHOP })).status, 200);
});

test("newsletters newest first, the stopped one named; alerts on unless switched off; orders of the last 90 days", async () => {
  const { features } = await (await world()).desk.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual([features.newsletters.issues, features.newsletters.sentIssues, features.newsletters.people, features.newsletters.lastSentAt], [3, 2, 220, ago(10)]);
  assert.deepEqual(features.newsletters.latest.map((i) => i.id), ["c", "b", "a"]);
  assert.deepEqual(features.newsletters.paused.map((i) => [i.subject, i.lastError]), [["Fair", "Too many failures."]]);
  assert.deepEqual(features.alerts, { ordersDigest: false, lowStock: true, low: 2, out: 1 });
  assert.deepEqual(features.orders, { partShipped: 1, parts: 2, itemsAdded: 2, paidAdded: 1 });
});

test("a shop not live, a plan without the website, and nothing used yet", async () => {
  const w = await world();
  assert.equal((await w.desk.forShop(ADMIN, { shopId: "new-press" })).features, null);
  assert.match((await w.desk.forShop(ADMIN, { shopId: "stock-only" })).words, /no website/);
  assert.equal(newslettersSummary([]), null);
  assert.deepEqual(alertsSummary(null, null), { ordersDigest: true, lowStock: true, low: 0, out: 0 });
  assert.deepEqual(ordersSummary([]), { partShipped: 0, parts: 0, itemsAdded: 0, paidAdded: 0 });
});

test("a team member deleting their own account shows on the timeline", () => {
  assert.match(eventLine({ at: ago(1), source: "accounts", what: "member-deleted-account", email: "sam@example.com", role: "staff" }).words, /sam@example\.com \(staff\) deleted their own Colophon account/);
});

test("the shop drawer shows the section, and both web doors serve the route", () => {
  const app = readFileSync(new URL("./app.js", import.meta.url), "utf8");
  assert.match(app, /"\/control\/shop-features"/);
  assert.match(app, /"Newsletters, morning emails and changed orders"/);
  for (const door of ["../server/world.js", "../walkthrough/world.js"]) assert.match(readFileSync(new URL(door, import.meta.url), "utf8"), /shopFeaturesRoutes\(shopFeatures\)/, door);
});
