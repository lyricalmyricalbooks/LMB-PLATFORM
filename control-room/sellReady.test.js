import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REQUIRED_POLICIES, createSellReady, sellReadyOf, sellReadyRoutes } from "./sellReady.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" });
const ALL = { shipping: "We post in 2 days.", returns: "30 days.", privacy: "We keep little.", terms: "Be kind." };

test("the policies match the shop's own readiness check", () => {
  const ts = readFileSync(new URL("../apps/shop/src/app/admin/launchReadiness.ts", import.meta.url), "utf8");
  const block = /REQUIRED_POLICIES[^=]*=\s*\[([\s\S]*?)\];/.exec(ts)?.[1] ?? "";
  assert.deepEqual(REQUIRED_POLICIES.map(([k, l]) => `${k}:${l}`), [...block.matchAll(/\["(\w+)", "([^"]+)"\]/g)].map((m) => `${m[1]}:${m[2]}`));
});

test("tax: rates set, switched off, or neither; policies with no words", () => {
  assert.deepEqual(sellReadyOf({ taxes: { rates: [{ rate: 13 }, { rate: 0 }] }, policies: ALL }), { tax: "rates", rates: 1, missingPolicies: [] });
  assert.equal(sellReadyOf({ taxes: { collect: false } }).tax, "off");
  assert.deepEqual(sellReadyOf({ policies: { ...ALL, returns: "  ", terms: "" } }), { tax: "none", rates: 0, missingPolicies: ["Returns", "Terms"] });
  assert.equal(sellReadyOf(null).missingPolicies.length, 4);
});

test("gaps across live shops with a website, missing policies first; the door is for platform admins", async () => {
  const registry = fakeRegistry();
  const make = (shopId, more) => registry.createShop(shopId, { shopId, pressName: shopId, status: "live", plan: "shop", ...more });
  await make("ready");
  await make("no-tax");
  await make("no-policies");
  await make("stock", { plan: "stockroom" });
  await make("making", { status: "making" });
  const docs = { ready: { taxes: { rates: [{ rate: 13 }] }, policies: ALL }, "no-tax": { policies: ALL }, "no-policies": { taxes: { collect: false } } };
  const shopData = { get: async (shopId) => docs[shopId] ?? null };
  const desk = createSellReady({ admins, registry, shopData, now: () => NOW });
  const { gaps, checked } = await desk.gaps(ADMIN);
  assert.equal(checked, 3);
  assert.deepEqual(gaps.map((g) => [g.shopId, g.tax, g.missingPolicies.length]), [["no-policies", "off", 4], ["no-tax", "none", 0]]);
  assert.equal((await desk.forShop(ADMIN, { shopId: "stock" })).ready, null);
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: sellReadyRoutes(desk), log: () => {} });
  const ask = (claims, path, body = {}) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS, "/api/control/sell-gaps")).status, 403);
  assert.equal((await ask(PRESS, "/api/control/sell-ready", { shopId: "ready" })).status, 403);
  assert.equal((await ask(ADMIN, "/api/control/sell-ready", { shopId: "nope" })).status, 404);
  assert.equal((await ask(ADMIN, "/api/control/sell-gaps")).status, 200);
});
