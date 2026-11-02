// Payments and email delivery per shop (code plan 19.12): the shop's record shows the last 7 days of payment events and
// emails sent, bounced and marked as spam, and its health asks for a look past the bounce line or after too many failed
// payment events. The payment service's counting is proven in services/payments/deliveryStats.test.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOUNCE_MIN_SENT, deliveryCounts, deliveryReader, deliveryReasons } from "./delivery.js";
import { fakeDeliveryStats } from "./visibilityFakes.js";
import { controlRoomAdmins, createControlRoom, shopHealth } from "./controlRoom.js";
import { fakeReputationStore, fakeSentLog } from "../services/email/fakes.js";
import { fakeAuditLog, fakeRegistry } from "../setup/fakes.js";

const SHOP = "moth-press";
const NOW = Date.parse("2026-11-02T12:00:00Z");
const day = (n) => new Date(NOW - n * 86_400_000).toISOString();
const ADMIN = { uid: "uid-admin", email: "admin@example.com", email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(NOW / 1000) };
const ROW = { shopId: SHOP, pressName: "Moth Press", status: "live", plan: "shop", payments: { provider: "stripe", accountId: "acct_moth", mode: "live", chargesEnabled: true } };

test("the last 7 days' counts come from the payment counter, the sent log and the newsletter guard's events", async () => {
  const stats = fakeDeliveryStats();
  await stats.add(SHOP, "payment-event", day(1));
  await stats.add(SHOP, "payment-event", day(2));
  await stats.add(SHOP, "payment-event-failed", day(2));
  await stats.add(SHOP, "payment-event", day(9)); // too old
  await stats.add("other-press", "payment-event", day(1));
  const sentLog = fakeSentLog();
  for (let i = 0; i < 4; i += 1) await sentLog.put(`k${i}`, { shopId: SHOP, kind: "receipt", status: "sent", at: day(1) });
  await sentLog.put("old", { shopId: SHOP, kind: "receipt", status: "sent", at: day(10) });
  await sentLog.put("failed", { shopId: SHOP, kind: "receipt", status: "failed", at: day(1) });
  const reputation = fakeReputationStore();
  await reputation.addEvent(SHOP, { id: "bounces/e1", kind: "bounces", at: day(1) });
  await reputation.addEvent(SHOP, { id: "complaints/e2", kind: "complaints", at: day(3) });
  await reputation.addEvent(SHOP, { id: "bounces/e0", kind: "bounces", at: day(8) });
  const counts = await deliveryCounts({ shopId: SHOP, deliveryStats: stats, sentLog, reputation, now: () => new Date(NOW) });
  assert.deepEqual({ payments: counts.payments, email: counts.email }, { payments: { received: 2, failed: 1 }, email: { sent: 4, bounced: 1, complained: 1 } });
  // With nothing to read, every count is nought.
  assert.deepEqual((await deliveryCounts({ shopId: SHOP, now: () => new Date(NOW) })).email, { sent: 0, bounced: 0, complained: 0 });
});

test("over the bounce line, or past three failed payment events, the shop's health says to look", () => {
  const row = { shopId: SHOP, status: "live" };
  const profile = { siteUrl: "https://moth.example" };
  const fine = { payments: { received: 40, failed: 3 }, email: { sent: 100, bounced: 5, complained: 0 } };
  assert.deepEqual(shopHealth({ row, profile, delivery: fine }), { level: "ok", reasons: [] });
  assert.deepEqual(deliveryReasons(fine), []);

  const bouncing = { ...fine, email: { sent: 100, bounced: 6, complained: 0 } };
  const health = shopHealth({ row, profile, delivery: bouncing });
  assert.equal(health.level, "watch");
  assert.deepEqual(health.reasons, ["6 of 100 emails bounced in the last 7 days (6%)"]);
  // A small list needs at least 20 sent before its rate counts.
  assert.equal(shopHealth({ row, profile, delivery: { ...fine, email: { sent: BOUNCE_MIN_SENT - 1, bounced: 10, complained: 0 } } }).level, "ok");
  const failing = shopHealth({ row, profile, delivery: { ...fine, payments: { received: 40, failed: 4 } } });
  assert.equal(failing.level, "watch");
  assert.match(failing.reasons[0], /4 payment messages from Stripe couldn't be passed to the shop/);
  // Old callers, without delivery, see what they always saw.
  assert.deepEqual(shopHealth({ row, profile }), { level: "ok", reasons: [] });
});

test("the shop's record shows the counts, and its health includes them", async () => {
  const registry = fakeRegistry();
  await registry.createShop(SHOP, ROW);
  await registry.saveProfile(SHOP, { siteUrl: "https://moth.example", switches: {} });
  const sentLog = fakeSentLog();
  for (let i = 0; i < 30; i += 1) await sentLog.put(`k${i}`, { shopId: SHOP, kind: "newsletter", status: "sent", at: day(1) });
  const reputation = fakeReputationStore();
  for (let i = 0; i < 3; i += 1) await reputation.addEvent(SHOP, { id: `bounces/${i}`, kind: "bounces", at: day(1) });
  const stats = fakeDeliveryStats();
  await stats.add(SHOP, "payment-event", day(1));
  const room = createControlRoom({
    registry, auditLog: fakeAuditLog(), admins: controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: "admin@example.com" }), now: () => new Date(NOW),
    delivery: deliveryReader({ deliveryStats: stats, sentLog, reputation, now: () => new Date(NOW) }),
  });
  const record = await room.shop(ADMIN, { shopId: SHOP });
  assert.deepEqual(record.delivery, { payments: { received: 1, failed: 0 }, email: { sent: 30, bounced: 3, complained: 0 } });
  assert.equal(record.health.level, "watch");
  assert.match(record.health.reasons.join(" "), /3 of 30 emails bounced/);
  // A control room built without it: the record says nothing about delivery.
  const plain = createControlRoom({ registry, auditLog: fakeAuditLog(), admins: ["admin@example.com"], now: () => new Date(NOW) });
  assert.equal((await plain.shop(ADMIN, { shopId: SHOP })).delivery, null);
  // A count that can't be read leaves the rest of the record.
  const broken = createControlRoom({ registry, auditLog: fakeAuditLog(), admins: ["admin@example.com"], now: () => new Date(NOW), delivery: async () => { throw new Error("no answer"); } });
  assert.equal((await broken.shop(ADMIN, { shopId: SHOP })).delivery, null);
});
