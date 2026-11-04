import { test } from "node:test";
import assert from "node:assert/strict";
import { createShopSocial, failedPosts, shopSocialRoutes } from "./shopSocial.js";
import { controlRoomAdmins } from "./controlRoom.js";
import { createSocialService } from "../services/social/social.js";
import { readSocialConfig } from "../services/social/config.js";
import { fakeConnections, fakeSent, fakeStates } from "../services/social/fakes.js";
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
  await registry.createShop("kestrel", { shopId: "kestrel", pressName: "Kestrel Books", status: "live" });
  await registry.createShop("gone", { shopId: "gone", pressName: "Gone Press", status: "closed" });
  const connections = fakeConnections();
  const sealed = { iv: "x", data: "secret-token-bytes" };
  await connections.set("moth-press", "meta", { sealed, accountName: "Moth Press", places: [{ id: "fb:1" }, { id: "ig:2" }], connectedAt: "2026-11-01T10:00:00Z", catalog: { feedId: "f1", sentAt: "2026-11-19T09:00:00Z", feedUrl: "https://moth.example/feed.csv" } });
  await connections.set("moth-press", "pinterest", { sealed, accountName: "mothpress", places: [{ id: "board:1" }], problem: "lost", lostAt: "2026-11-18T08:00:00Z", lostDetail: "token revoked" });
  await connections.set("kestrel", "tiktok", { sealed, accountName: "kestrelbooks", places: [{ id: "tt" }], problem: "lost", lostAt: "2026-11-19T08:00:00Z", lostDetail: "token revoked" });
  await connections.set("gone", "meta", { sealed, problem: "lost", lostAt: "2026-11-19T08:00:00Z" });
  await registry.recordEvent("moth-press", { id: "e1", kind: "social.failed", network: "meta", detail: "Meta said the photo is too small", at: "2026-11-19T10:00:00Z" });
  await registry.recordEvent("moth-press", { id: "e2", kind: "social.failed", network: "meta", detail: "old", at: "2026-10-01T10:00:00Z" });
  await registry.recordEvent("moth-press", { id: "e3", kind: "social.connected", network: "meta", at: "2026-11-01T10:00:00Z" });
  const social = createSocialService({ clients: {}, registry, auditLog: { write: async () => {} }, connections, states: fakeStates(), sent: fakeSent(), config: readSocialConfig({}), now: () => NOW.getTime() });
  return { registry, social };
}

test("failed posts: the last 30 days only, newest first", () => {
  assert.deepEqual(failedPosts([
    { kind: "social.failed", network: "meta", detail: "a", at: "2026-11-10T00:00:00Z" },
    { kind: "social.failed", network: "tiktok", detail: "b", at: "2026-11-19T00:00:00Z" },
    { kind: "social.failed", at: "2026-10-01T00:00:00Z" },
    { kind: "social.connected", at: "2026-11-19T00:00:00Z" },
  ], NOW).map((f) => f.detail), ["b", "a"]);
});

test("one shop: each network's state, account and catalog, no token; its recent failed posts", async () => {
  const { registry, social } = await world();
  const desk = createShopSocial({ admins, registry, social, now: () => NOW });
  const found = await desk.forShop(ADMIN, { shopId: "moth-press" });
  assert.deepEqual(found.networks.map((n) => [n.network, n.connected, n.problem, n.places]), [["meta", true, null, 2], ["pinterest", true, "lost", 1]]);
  assert.equal(found.networks[0].catalog.sentAt, "2026-11-19T09:00:00Z");
  assert.ok(!JSON.stringify(found).includes("secret-token-bytes"), "never a token");
  assert.deepEqual(found.failed.map((f) => f.detail), ["Meta said the photo is too small"]);
  assert.equal(found.failedCount, 1);
});

test("lost connections across the shops, newest first; a closed shop's left out", async () => {
  const { registry, social } = await world();
  const { lost } = await createShopSocial({ admins, registry, social, now: () => NOW }).lost(ADMIN);
  assert.deepEqual(lost.map((l) => [l.pressName, l.name]), [["Kestrel Books", "TikTok"], ["Moth Press", "Pinterest"]]);
});

test("before the social service has its home, the room says so; the door is for platform admins", async () => {
  const { registry, social } = await world();
  const off = createShopSocial({ admins, registry, now: () => NOW });
  assert.equal((await off.forShop(ADMIN, { shopId: "moth-press" })).networks, null);
  assert.equal((await off.lost(ADMIN)).lost, null);
  const api = createApi({ signup: {}, verifyIdToken: fakeVerifyIdToken, settings: platformSettings({}), routes: shopSocialRoutes(createShopSocial({ admins, registry, social, now: () => NOW })), log: () => {} });
  const ask = (claims, path, body = {}) => api({ method: "POST", path, body, headers: { Authorization: `Bearer ${JSON.stringify(claims)}` } });
  assert.equal((await ask(PRESS, "/api/control/shop-social", { shopId: "moth-press" })).status, 403);
  assert.equal((await ask(PRESS, "/api/control/social-lost")).status, 403);
  assert.equal((await ask(ADMIN, "/api/control/shop-social", { shopId: "nope" })).status, 404);
  assert.equal((await ask(ADMIN, "/api/control/social-lost")).status, 200);
});
