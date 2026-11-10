// Who took their data with them: admins only; the press's own browser download (an audit-log line) and the emailed
// copies (dataExports rows) both show; the emailed link is never in the answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTookData, downloadOf, emailedOf, tookDataRoutes } from "./tookData.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { fakeExportStore } from "../services/export/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const SHOP = "moth-press";
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };

async function world() {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, { shopId: SHOP, pressName: "Moth Press", status: "live" });
  await registry.createShop("quiet-press", { shopId: "quiet-press", status: "live" });
  const shopData = fakeShopData();
  await shopData.set(SHOP, "audit-log/a", { type: "export", message: "Downloaded the whole shop: 12 products, 40 orders, 30 of 30 photos", createdAt: "2026-11-09T10:00:00Z" });
  await shopData.set(SHOP, "audit-log/b", { type: "orders", message: "Refunded order #12", createdAt: "2026-11-09T11:00:00Z" });
  await shopData.set(SHOP, "audit-log/c", { type: "export", message: "Downloaded the whole shop: 12 products, 41 orders", createdAt: "2026-11-10T10:00:00Z" });
  const exports = fakeExportStore();
  await exports.set("e1", { id: "e1", shopId: SHOP, asked: "owner", by: "owner@example.com", status: "ready", at: "2026-11-08T09:00:00Z", emailedTo: "owner@example.com", expiresAt: "2026-11-15T09:00:00Z", zip: "exports/x.zip" });
  await exports.set("e2", { id: "e2", shopId: SHOP, asked: "platform", by: "admin@example.com", status: "failed", problem: "email: down", at: "2026-11-07T09:00:00Z" });
  await exports.set("e3", { id: "e3", shopId: SHOP, asked: "platform", by: "the platform", status: "ready", at: "2026-11-06T09:00:00Z", emailedTo: "owner@example.com" });
  await exports.set(`owner-lock-${SHOP}`, { id: `owner-lock-${SHOP}`, kind: "owner-lock", lockFor: SHOP, asked: "owner", status: "ready", at: "2026-11-08T09:00:00Z" });
  await exports.set("o", { id: "o", shopId: "other", asked: "owner", status: "ready", at: "2026-11-08T09:00:00Z" });
  const desk = createTookData({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, exports, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: tookDataRoutes(desk), log: () => {} });
  const ask = (claims, body) => api({ method: "POST", path: "/api/control/took-data", body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { desk, ask };
}

test("only platform admins see it", async () => {
  const w = await world();
  assert.equal((await w.ask(PRESS, { shopId: SHOP })).status, 403);
  assert.equal((await w.ask(ADMIN, { shopId: "nope" })).status, 404);
  assert.equal((await w.ask(ADMIN, { shopId: SHOP })).status, 200);
});

test("the press's own downloads and the emailed copies, newest first, no links", async () => {
  const r = await (await world()).desk.forShop(ADMIN, { shopId: SHOP });
  assert.deepEqual(r.downloads.map((d) => d.words), ["12 products, 41 orders", "12 products, 40 orders, 30 of 30 photos"]);
  assert.deepEqual(r.emailed.map((e) => [e.status, e.asked, e.emailedTo]), [["ready", "the press", "owner@example.com"], ["failed", "the platform", null], ["ready", "closing", "owner@example.com"]]);
  assert.equal(r.emailed[1].problem, "email: down");
  assert.equal(r.took, true);
  assert.doesNotMatch(JSON.stringify(r), /zip|https?:/);
});

test("a shop that never took its data says so", async () => {
  const r = await (await world()).desk.forShop(ADMIN, { shopId: "quiet-press" });
  assert.deepEqual([r.downloads, r.emailed, r.took], [[], [], false]);
});

test("other audit lines are not downloads", () => {
  assert.equal(downloadOf({ type: "orders", message: "Downloaded the whole shop" }), null);
  assert.equal(emailedOf({ kind: "owner-lock", shopId: "x" }), null);
});
