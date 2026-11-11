import test from "node:test";
import assert from "node:assert/strict";
import { createNotSelling, notSellingRoutes } from "./notSelling.js";
import { TEMPLATES } from "../services/email/templates.js";

const NOW = new Date("2026-11-11T12:00:00Z");
const claims = { uid: "u", email: "owner@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW.getTime() / 1000) };
const rows = [
  { shopId: "quiet", pressName: "Quiet Press", ownerEmail: "q@example.com", status: "live", createdAt: "2026-10-01T00:00:00Z" },
  { shopId: "sold", pressName: "Sold", ownerEmail: "s@example.com", status: "live", createdAt: "2026-10-01T00:00:00Z" },
  { shopId: "practice", pressName: "Practice only", ownerEmail: "p@example.com", status: "live", createdAt: "2026-10-01T00:00:00Z" },
  { shopId: "new", pressName: "New", ownerEmail: "n@example.com", status: "live", createdAt: "2026-11-05T00:00:00Z" },
  { shopId: "room", pressName: "Stockroom", status: "live", plan: "stockroom", createdAt: "2026-10-01T00:00:00Z" },
  { shopId: "t", testShop: true, status: "live", createdAt: "2026-10-01T00:00:00Z" },
];
const orders = { sold: [{ data: { paymentStatus: "paid" } }], practice: [{ data: { paymentStatus: "paid", isTest: true } }] };

function world() {
  const sent = [];
  const updates = [];
  const logged = [];
  const registry = { listShops: async () => rows, getShop: async (id) => rows.find((r) => r.shopId === id) ?? null, updateShop: async (id, patch) => updates.push([id, patch]) };
  const shopData = { find: async (id) => orders[id] ?? [] };
  const desk = createNotSelling({ admins: ["owner@example.com"], registry, shopData, email: { sendPlatform: async (m) => sent.push(m) }, activity: { record: async (e) => logged.push(e) }, now: () => NOW });
  return { desk, sent, updates, logged };
}

test("lists live shops over two weeks old with no real sale, skipping practice orders, new shops, stockrooms and the test shop", async () => {
  const { desk } = world();
  const { shops } = await desk.list(claims);
  assert.deepEqual(shops.map((s) => s.shopId).sort(), ["practice", "quiet"]);
});

test("Send tips emails the owner once a day, marks the row and logs it", async () => {
  const { desk, sent, updates, logged } = world();
  const result = await desk.sendTips(claims, { shopId: "quiet" });
  assert.equal(result.to, "q@example.com");
  assert.equal(sent[0].kind, "first-sale-tips");
  assert.equal(sent[0].idempotencyKey, "quiet/first-sale-tips/2026-11-11");
  assert.deepEqual(updates[0], ["quiet", { firstSaleTipsAt: NOW.toISOString() }]);
  assert.equal(logged[0].what, "first-sale-tips");
});

test("the tips email reads plainly and the routes exist", () => {
  const out = TEMPLATES["first-sale-tips"]({}, { settings: { platformName: "Colophon" }, pressName: "Quiet Press" });
  assert.match(JSON.stringify(out), /first order/);
  const routes = notSellingRoutes({ list: () => 1, sendTips: () => 2 });
  assert.ok(routes["POST /api/control/not-selling"] && routes["POST /api/control/first-sale-tips"]);
});

test("a shop sent tips in the last week rests off the list, and comes back after", async () => {
  const { notSellingShops } = await import("./notSelling.js");
  const row = (at) => ({ shopId: "q", pressName: "Q", status: "live", createdAt: "2026-10-01T00:00:00Z", firstSaleTipsAt: at });
  const shopData = { find: async () => [] };
  const nowMs = NOW.getTime();
  assert.equal((await notSellingShops({ rows: [row("2026-11-08T00:00:00Z")], shopData, nowMs, restDays: 7 })).shops.length, 0);
  assert.equal((await notSellingShops({ rows: [row("2026-11-01T00:00:00Z")], shopData, nowMs, restDays: 7 })).shops.length, 1);
  assert.equal((await notSellingShops({ rows: [row("2026-11-08T00:00:00Z")], shopData, nowMs })).shops.length, 1);
});
