import { test } from "node:test";
import assert from "node:assert/strict";
import { chitChatsDeskRoutes, createChitChatsDesk } from "./chitChats.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { fakeChitChatsStores } from "../services/apps/fakes.js";
import { fakeRegistry } from "../setup/fakes.js";
import { createApi } from "../signup/api.js";
import { fakeVerifyIdToken } from "../signup/fakes.js";
import { platformSettings } from "../services/settings.js";

const NOW = new Date("2026-11-20T12:00:00Z");
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
const PRESS = { uid: "uid-owner", email: "owner@example.com", email_verified: true };
const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" });

async function world(ready = true) {
  const registry = fakeRegistry();
  await registry.createShop("moth-press", { shopId: "moth-press", pressName: "Moth Press", status: "live" });
  await registry.createShop("kestrel", { shopId: "kestrel", pressName: "Kestrel Books", status: "live" });
  const stores = fakeChitChatsStores();
  const sealed = { iv: "x", data: "secret-chitchats-token" };
  await stores.connections.put("moth-press", { shopId: "moth-press", sealed, clientId: "c1", connectedAt: "2026-11-01T00:00:00Z", lastProblem: null });
  await stores.connections.put("kestrel", { shopId: "kestrel", sealed, clientId: "c2", connectedAt: "2026-11-02T00:00:00Z", lastProblem: null });
  const ship = (id, shopId, status, createdAt, more = {}) => stores.shipments.put(id, { id, shopId, orderId: id, orderNumber: id, status, createdAt, ...more });
  await ship("m1", "moth-press", "open", "2026-11-19T00:00:00Z");
  await ship("k1", "kestrel", "open", "2026-11-15T00:00:00Z");
  await ship("k2", "kestrel", "open", "2026-11-20T00:00:00Z");
  await ship("k3", "kestrel", "problem", "2026-11-18T00:00:00Z", { problem: "The order has no full shipping address." });
  await ship("k4", "kestrel", "sent", "2026-11-10T00:00:00Z");
  return createChitChatsDesk({ admins, chitchats: { ready: () => ready }, stores, registry, now: () => NOW });
}

test("each connected shop: orders waiting for tracking, the oldest flagged after three days, and its problems; worst first", async () => {
  const { ready, shops } = await (await world()).overview(ADMIN);
  assert.equal(ready, true);
  assert.deepEqual(shops.map((s) => [s.pressName, s.waiting, s.late, s.problems]), [["Kestrel Books", 2, true, 1], ["Moth Press", 1, false, 0]]);
  assert.equal(shops[0].problemOrders[0].words, "The order has no full shipping address.");
  assert.ok(!JSON.stringify(shops).includes("secret-chitchats-token"), "never the press's Chit Chats details");
});

test("the door: platform admins only; switched off says so", async () => {
  assert.equal((await (await world(false)).overview(ADMIN)).ready, false);
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: chitChatsDeskRoutes(await world()), log: () => {} });
  const ask = (claims) => api({ method: "POST", path: "/api/control/chitchats", body: {}, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS)).status, 403);
  assert.equal((await ask(ADMIN)).status, 200);
});
