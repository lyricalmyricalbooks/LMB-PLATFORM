import { test } from "node:test";
import assert from "node:assert/strict";
import { changeWords, createShopApps, shopAppsRoutes } from "./shopApps.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeAppAlertStores, fakeAppInstallStores } from "../services/apps/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" });

async function world() {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live" });
  const { installs } = fakeAppInstallStores();
  const put = (row) => installs.put(row.installId, row);
  await put({ installId: "moth-press~app_a", appId: "app_a", appName: "Stock Counter", shopId: "moth-press", scopes: ["write_inventory"], status: "active", installedAt: "2026-11-01T00:00:00Z", keyHash: "secret-key-hash" });
  await put({ installId: "moth-press~app_b", appId: "app_b", appName: "Parcel Pal", shopId: "moth-press", scopes: ["read_orders"], status: "active", installedAt: "2026-11-10T00:00:00Z" });
  await put({ installId: "moth-press~app_c", appId: "app_c", appName: "Gone App", shopId: "moth-press", scopes: [], status: "removed", installedAt: "2026-10-01T00:00:00Z" });
  const { outbox } = fakeAppAlertStores();
  await outbox.put("al1", { id: "al1", installId: "moth-press~app_b", appId: "app_b", status: "failed", failedAt: "2026-11-19T00:00:00Z", lastError: "answered 500" });
  await outbox.put("al2", { id: "al2", installId: "moth-press~app_b", appId: "app_b", status: "failed", failedAt: "2026-11-20T00:00:00Z", lastError: "answered 404" });
  await outbox.put("al3", { id: "al3", installId: "moth-press~app_b", appId: "app_b", status: "failed", failedAt: "2026-11-01T00:00:00Z", lastError: "old" });
  const docs = [
    { id: "r1", data: { op: "inventory.adjust", appName: "Stock Counter", input: { productId: "moth-book", change: 3 }, status: "done", createdAt: "2026-11-19T10:00:00Z" } },
    { id: "r2", data: { op: "inventory.adjust", appName: "Stock Counter", input: { productId: "moth-book", change: -2, expected: 9 }, status: "refused", reason: "The stock is now 8, not 9.", createdAt: "2026-11-20T10:00:00Z" } },
    { id: "r3", data: { op: "order.dispatch", appId: "app_b", input: { orderId: "o1", trackingCarrier: "Canada Post", trackingNumber: "123" }, createdAt: "2026-11-20T11:00:00Z" } },
  ];
  const shopData = { list: async (shopId, path) => (shopId === "moth-press" && path === "appRequests" ? structuredClone(docs) : []) };
  return createShopApps({ admins, registry, installs, outbox, shopData, now: () => NOW });
}

test("a change in plain words", () => {
  assert.equal(changeWords({ op: "inventory.adjust", input: { productId: "p1", variantId: "large", change: -1 } }), "Took away 1 of p1 (large)");
  assert.equal(changeWords({ op: "order.dispatch", input: { orderId: "o1", shipped: false } }), "Added tracking to order o1");
  assert.equal(changeWords({ op: "something.else" }), "Asked for a change the shop doesn't know");
});

test("one shop: its apps newest first with alerts failing this week, and the changes apps asked for, newest first", async () => {
  const found = await (await world()).forShop(ADMIN, { shopId: "moth-press" });
  assert.deepEqual(found.apps.map((a) => [a.name, a.failedAlerts, a.lastError]), [["Parcel Pal", 2, "answered 404"], ["Stock Counter", 0, null]]);
  assert.equal(found.removed, 1);
  assert.deepEqual(found.changes.map((c) => [c.app, c.what, c.state]), [
    ["app_b", "Marked order o1 sent (Canada Post 123)", "waiting"],
    ["Stock Counter", "Took away 2 of moth-book", "refused"],
    ["Stock Counter", "Added 3 of moth-book", "done"],
  ]);
  assert.equal(found.changes[1].reason, "The stock is now 8, not 9.");
  assert.deepEqual([found.changeCount, found.refused], [3, 1]);
  assert.ok(!JSON.stringify(found).includes("secret-key-hash"), "never an app's key");
});

test("the door: platform admins only; an unknown shop is a 404", async () => {
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: shopAppsRoutes(await world()), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/shop-apps", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS, { shopId: "moth-press" })).status, 403);
  assert.equal((await ask(ADMIN, { shopId: "nope" })).status, 404);
  assert.equal((await ask(ADMIN, { shopId: "moth-press" })).status, 200);
});
