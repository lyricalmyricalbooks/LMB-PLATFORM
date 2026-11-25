// The sign-up funnel: admins only; each new shop counted at the furthest stage it reached, earlier stages included;
// test shops, stockroom-only plans, closed shops and shops older than the window left out; a shop still being made
// counts as signed up; a shop that can't be read is named, not fatal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_STAGES, createSignupFunnel, funnelStage, funnelTally, signupFunnelRoutes } from "./signupFunnel.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeShopData } from "../accounts/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const recent = "2026-11-20T10:00:00Z";

test("a shop's furthest stage", () => {
  assert.equal(funnelStage(null, null), "signedUp");
  assert.equal(funnelStage({ welcome: { theme: "aurel" } }, {}), "reachedHome");
  assert.equal(funnelStage({ welcome: {}, bring: { at: recent } }, {}), "firstProduct");
  assert.equal(funnelStage({ welcome: {}, bring: {}, payments: {} }, { design: { showUnderConstruction: true } }), "paid");
  assert.equal(funnelStage({ welcome: {}, bring: {}, finalCheck: {} }, { design: { showUnderConstruction: false } }), "open");
  assert.equal(funnelStage({ done: { firstSale: recent } }, {}), "firstOrder");
});

test("a later stage counts every earlier one", () => {
  const rows = funnelTally(["signedUp", "reachedHome", "firstOrder", "open"]);
  assert.deepEqual(rows.map((r) => r.count), [4, 3, 2, 2, 2, 1]);
  assert.equal(rows[0].percent, 100);
  assert.equal(rows[5].percent, 25);
  assert.deepEqual(rows.map((r) => r.id), FUNNEL_STAGES.map((s) => s.id));
  assert.deepEqual(funnelTally([]).map((r) => r.percent), [0, 0, 0, 0, 0, 0]);
});

async function world() {
  const registry = fakeRegistry();
  await registry.createShop("moth", { shopId: "moth", status: "live", plan: "both", createdAt: recent });
  await registry.createShop("wasp", { shopId: "wasp", status: "live", plan: "shop", createdAt: recent });
  await registry.createShop("newt", { shopId: "newt", status: "making", plan: "shop", createdAt: recent });
  await registry.createShop("old", { shopId: "old", status: "live", plan: "shop", createdAt: "2026-01-01T00:00:00Z" });
  await registry.createShop("stock", { shopId: "stock", status: "live", plan: "stockroom", createdAt: recent });
  await registry.createShop("lmb-test-shop", { shopId: "lmb-test-shop", status: "live", plan: "both", testShop: true, createdAt: recent });
  const shopData = fakeShopData();
  await shopData.set("moth", "firstWeek/start", { welcome: {}, bring: {}, payments: {}, done: { firstSale: recent } });
  await shopData.set("moth", "settings/website", { design: { showUnderConstruction: false } });
  await shopData.set("wasp", "firstWeek/start", { welcome: {} });
  const desk = createSignupFunnel({ admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), registry, shopData, now: () => new Date(NOW) });
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: signupFunnelRoutes(desk), log: () => {} });
  const ask = (claims, method, path) => api({ method, path, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  return { ask, shopData };
}

test("across new shops, admins only", async () => {
  const { ask } = await world();
  const refused = await ask(PRESS, "GET", "/api/control/signup-funnel");
  assert.equal(refused.status, 403);
  const { status, body } = await ask(ADMIN, "GET", "/api/control/signup-funnel");
  assert.equal(status, 200);
  assert.equal(body.days, 90);
  assert.equal(body.shops, 3);
  assert.deepEqual(body.stages.map((s) => s.count), [3, 2, 1, 1, 1, 1]);
  assert.deepEqual(body.unread, []);
});

test("a shop that can't be read is named, not fatal", async () => {
  const { ask, shopData } = await world();
  const get = shopData.get;
  shopData.get = async (shopId, path) => { if (shopId === "wasp") throw new Error("offline"); return get(shopId, path); };
  const { body } = await ask(ADMIN, "GET", "/api/control/signup-funnel");
  assert.equal(body.shops, 2);
  assert.deepEqual(body.unread.map((u) => u.shopId), ["wasp"]);
});
