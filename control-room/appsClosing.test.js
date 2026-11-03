// Apps closing in the control room: shops with an app their plan dropped, soonest first, with the reminder's date; and
// how many apps dropped in the last six months were kept after all. The test shop left out; admins only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { appsClosing } from "./appsClosing.js";
import { businessRoutes, createBusinessRoom } from "./business.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const DAY = 86_400_000;
const on = (days) => new Date(NOW.getTime() + days * DAY).toISOString();
const shop = (shopId, billing, extra = {}) => ({ shopId, pressName: shopId, ownerEmail: `${shopId}@example.com`, billing, ...extra });

const rows = [
  shop("later", { appsClosing: { apps: ["shop"], at: on(20) } }),
  shop("soon", { appsClosing: { apps: ["stockroom"], at: on(3), reminded: on(-3) }, appDrops: [{ app: "stockroom", at: on(-10), keptAt: null, closedAt: null }] }),
  shop("kept", { appsClosing: null, appDrops: [{ app: "shop", at: on(-40), keptAt: on(-35), closedAt: null }, { app: "stockroom", at: on(-300), keptAt: on(-290), closedAt: null }] }),
  shop("closed", { appDrops: [{ app: "stockroom", at: on(-60), keptAt: null, closedAt: on(-30) }] }),
  shop("none", { status: "active" }),
  shop("platform-test", { appsClosing: { apps: ["stockroom"], at: on(1) }, appDrops: [{ app: "stockroom", at: on(-5) }] }, { testShop: true }),
];

test("soonest first, with the apps in words and whether the reminder went out; drops counted over six months", () => {
  const { shops, drops } = appsClosing(rows, NOW);
  assert.deepEqual(shops.map((s) => [s.shopId, s.apps, s.daysLeft, s.reminded]), [["soon", "Stockroom", 3, on(-3)], ["later", "Website", 20, null]]);
  assert.deepEqual(drops, { dropped: 3, kept: 1, closed: 1, waiting: 1, reasons: {} }, "the drop 300 days ago and the test shop's don't count");
  const empty = appsClosing([], NOW);
  assert.deepEqual([empty.shops, empty.closed, empty.drops], [[], [], { dropped: 0, kept: 0, closed: 0, waiting: 0, reasons: {} }]);
});

test("GET /api/control/apps-closing is for platform admins only, and the page has its place", async () => {
  const registry = fakeRegistry();
  for (const row of rows) await registry.createShop(row.shopId, row);
  const room = createBusinessRoom({ registry, admins: ["admin@example.com"], now: () => NOW });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: businessRoutes(room) });
  const ask = (claims) => api({ method: "GET", path: "/api/control/apps-closing", headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });
  assert.equal((await ask(null)).status, 401);
  assert.equal((await ask({ uid: "p", email: "owner@example.com", email_verified: true })).status, 403);
  const admin = { uid: "a", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
  const answer = await ask(admin);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.shops.map((s) => s.shopId), ["soon", "later"]);
  const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
  assert.match(page, /id="apps-closing"/);
});

test("closed apps still holding records, stuck deletions first; why presses dropped apps; a bounced closing email", () => {
  const list = appsClosing([
    shop("downloading", { appDrops: [{ app: "stockroom", at: on(-40), closedAt: on(-30), reason: "price" }, { app: "shop", at: on(-20), keptAt: on(-19), reason: "price" }] }, { plan: "shop", closedApps: { stockroom: { closedAt: on(-30), downloadUntil: on(60) } } }),
    shop("stuck", { appDrops: [{ app: "shop", at: on(-130), closedAt: on(-100), reason: "not-using" }] }, { plan: "stockroom", closedApps: { shop: { closedAt: on(-100), downloadUntil: on(-10), warnedAt: on(-13), problem: "Deleting a closed app's records isn't switched on yet." } }, closingEmailBounce: { kind: "app-closed", at: on(-5) } }),
    shop("deleted", {}, { plan: "shop", closedApps: { stockroom: { downloadUntil: on(-40), deletedAt: on(-37) } } }),
    shop("added-back", {}, { plan: "both", closedApps: { stockroom: { downloadUntil: on(30) } } }),
    shop("old-bounce", { appsClosing: { apps: ["shop"], at: on(4) } }, { closingEmailBounce: { kind: "app-closing-soon", at: on(-60) } }),
  ], NOW);
  assert.deepEqual(list.closed.map((c) => [c.shopId, c.app, c.overdue, c.daysLeft]), [["stuck", "Website", true, 0], ["downloading", "Stockroom", false, 60]]);
  assert.match(list.closed[0].problem, /isn't switched on yet/);
  assert.deepEqual(list.closed[0].bounced, { kind: "app-closed", at: on(-5) });
  assert.equal(list.shops[0].bounced, null, "a bounce from two months ago is old news");
  assert.deepEqual(list.drops.reasons, { price: 2, "not-using": 1 });
  assert.equal(list.reasonWords.price, "To pay less");
});
