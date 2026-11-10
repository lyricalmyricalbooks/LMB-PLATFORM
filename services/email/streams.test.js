// Email reputation (code plan 8.3) with pretend Google and fake complaint events: two streams, the newsletter pausing
// itself at the limit and receipts still going.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "./index.js";
import { streamOf } from "./streams.js";
import { LIMITS, PAUSE_CHECK, createReputationGuard, overLimit } from "./reputation.js";
import { handleShopEmail, hashServiceKey } from "./http.js";
import { TEMPLATES } from "./templates.js";
import { fakeReputationStore, fakeGmailFetch, fakeSentLog , pretendEmailEnv } from "./fakes.js";
import { fakeRegistry } from "../../setup/fakes.js";
import { platformSettings } from "../settings.js";

const SHOP_KEY = "shop-service-key-0123456789abcdef0123456789";
const NOW = Date.parse("2026-10-28T12:00:00Z");

async function make({ env = {} } = {}) {
  let clock = NOW;
  const now = () => new Date(clock);
  const registry = fakeRegistry();
  for (const [shopId, pressName] of [["moth-press", "Moth Press"], ["owl-books", "Owl Books"]]) {
    await registry.createShop(shopId, { shopId, pressName, ownerEmail: `${shopId}@example.com`, status: "live", serviceKeyHash: hashServiceKey(SHOP_KEY) });
  }
  const mail = fakeGmailFetch();
  const sentLog = fakeSentLog();
  const store = fakeReputationStore();
  const reported = [];
  const repairs = { report: async (item) => void reported.push(item) };
  let service;
  const email = { sendPlatform: (message) => service.sendPlatform(message) };
  const guard = createReputationGuard({ store, sentLog, registry, email, repairs, now });
  service = createEmailService({ env: { ...pretendEmailEnv(), ...env }, fetch: mail.fetch, registry, sentLog, reputation: guard, now, sleep: async () => {} });
  return { registry, mail, sentLog, store, reported, guard, service, tick: (ms) => (clock += ms), now };
}

const newsletter = (n, shopId = "moth-press") => ({ kind: "newsletter", to: `reader${n}@example.com`, subject: "Autumn books", html: "<p>New books</p>", custom: true, idempotencyKey: `${shopId}/news/${n}` });
const receipt = (n) => ({ kind: "order-confirmed", to: `buyer${n}@example.com`, subject: "Your order", html: "<p>Thanks</p>", custom: true, idempotencyKey: `moth-press/order/${n}` });

/** A fake delivery-problem event for one email, tagged the way the service tags it. */
const event = (type, n, { shopId = "moth-press", stream = "newsletter", bounce = "Permanent" } = {}) => ({
  type,
  created_at: new Date(NOW).toISOString(),
  data: {
    email_id: `email-${shopId}-${type}-${n}`,
    to: [`reader${n}@example.com`],
    tags: { kind: stream === "newsletter" ? "newsletter" : "order-confirmed", shop: shopId, stream },
    ...(type === "email.bounced" ? { bounce: { type: bounce, subType: "General", message: "pretend" } } : {}),
  },
});

test("each email kind has a stream: newsletters apart from receipts and notices", () => {
  for (const kind of ["newsletter", "campaign-autumn", "back-in-stock", "review-request", "abandoned-cart", "marketing"]) assert.equal(streamOf(kind), "newsletter", kind);
  for (const kind of ["order-confirmed", "newsletter-confirm", "owner-welcome", "sign-in-link", "shop-email", "gift-card", undefined]) assert.equal(streamOf(kind), "orders", kind);
});

test("the limits: more than 0.3% complaints (at least 2), more than 4% hard bounces (at least 5)", () => {
  assert.deepEqual(overLimit({ sent: 1000, complaints: 3, bounces: 40 }), []);
  assert.deepEqual(overLimit({ sent: 1000, complaints: 4, bounces: 0 }), ["complaints"]);
  assert.deepEqual(overLimit({ sent: 1000, complaints: 0, bounces: 41 }), ["bounces"]);
  assert.deepEqual(overLimit({ sent: 20, complaints: 1, bounces: 4 }), [], "one complaint on a small list doesn't pause");
  assert.deepEqual(overLimit({ sent: 20, complaints: 2, bounces: 5 }), ["complaints", "bounces"]);
  assert.equal(LIMITS.complaints.rate, 0.003);
});

test("complaints past the limit pause the newsletter; receipts still go; the owner and the control room are told", async () => {
  const w = await make();
  for (let n = 1; n <= 500; n += 1) await w.service.send("moth-press", newsletter(n));
  // 1 complaint in 500 is 0.2%: under the limit.
  assert.deepEqual(await w.guard.record(event("email.complained", 1)), { counted: true, paused: false });
  // A repeat of the same event counts once.
  assert.deepEqual(await w.guard.record(event("email.complained", 1)), { counted: false, paused: false });
  assert.equal(await w.guard.isPaused("moth-press"), false);
  // The second makes 0.4%: paused.
  assert.deepEqual(await w.guard.record(event("email.complained", 2)), { counted: true, paused: true });
  assert.equal(await w.guard.isPaused("moth-press"), true);

  await assert.rejects(w.service.send("moth-press", newsletter(501)), { code: "newsletter-paused", retryable: false });
  const before = w.mail.delivered.length;
  await w.service.send("moth-press", receipt(1));
  assert.equal(w.mail.delivered.length, before + 1, "the receipt still went");
  assert.equal(w.mail.delivered.at(-1).to[0], "buyer1@example.com");
  // Another shop's newsletter is untouched.
  await w.service.send("owl-books", newsletter(1, "owl-books"));

  assert.equal(w.reported.length, 1);
  assert.equal(w.reported[0].check, PAUSE_CHECK);
  assert.equal(w.reported[0].shopId, "moth-press");
  assert.match(w.reported[0].detail, /2 people marked it as spam \(0\.4%\)/);
  const note = w.mail.delivered.find((d) => d.to[0] === "moth-press@example.com");
  assert.match(note.subject, /Moth Press's newsletter is paused for now/);
  assert.match(note.text, /receipts, order emails and shipping notices still go out/);
  assert.match(note.text, /2 people marked it as spam/);
  assert.ok([...(w.registry.events.get("moth-press")?.values() ?? [])].some((e) => e.what === "newsletter-paused"));

  // More complaints while paused don't send the owner a second note.
  await w.guard.record(event("email.complained", 3));
  assert.equal(w.mail.delivered.filter((d) => d.to[0] === "moth-press@example.com").length, 1);
});

test("hard bounces pause it too; a full inbox (a temporary bounce) and orders-stream problems never do", async () => {
  const w = await make();
  for (let n = 1; n <= 50; n += 1) await w.service.send("moth-press", newsletter(n));
  for (let n = 1; n <= 10; n += 1) await w.guard.record(event("email.bounced", n, { bounce: "Temporary" }));
  for (let n = 1; n <= 10; n += 1) await w.guard.record(event("email.complained", n, { stream: "orders" }));
  await w.guard.record({ ...event("email.complained", 99), data: { ...event("email.complained", 99).data, tags: { kind: "sign-in-link", stream: "orders" } } });
  await w.guard.record(event("email.delivered", 1));
  assert.equal(await w.guard.isPaused("moth-press"), false);
  for (let n = 1; n <= 4; n += 1) await w.guard.record(event("email.bounced", n));
  assert.equal(await w.guard.isPaused("moth-press"), false, "4 of 50 is 8% but under the minimum of 5");
  assert.equal((await w.guard.record(event("email.bounced", 5))).paused, true);
  assert.match(w.reported[0].detail, /5 addresses bounced \(10%\)/);
});

test("resumed by a person: it sends again, and only new problems count from then", async () => {
  const w = await make();
  for (let n = 1; n <= 100; n += 1) await w.service.send("moth-press", newsletter(n));
  await w.guard.record(event("email.complained", 1));
  await w.guard.record(event("email.complained", 2));
  assert.equal(await w.guard.isPaused("moth-press"), true);
  w.tick(60_000);
  assert.deepEqual(await w.guard.resume("moth-press", { by: "admin@example.com", reason: "the press cleaned its list" }), { resumed: true });
  assert.deepEqual(await w.guard.resume("moth-press", { by: "admin@example.com", reason: "again" }), { resumed: false });
  w.tick(60_000);
  await w.service.send("moth-press", newsletter(101));
  // The two old complaints and one new one don't pause it again.
  assert.equal((await w.guard.record({ ...event("email.complained", 3), created_at: new Date(NOW + 120_000).toISOString() })).paused, false);
  assert.ok([...(w.registry.events.get("moth-press")?.values() ?? [])].some((e) => e.what === "newsletter-resumed" && e.by === "admin@example.com"));
});

test("after a resume, late complaints about emails sent before it don't pause the newsletter again", async () => {
  const w = await make();
  const sentAt = new Date(NOW).toISOString();
  const late = (n, emailSentAt) => ({ ...event("email.complained", n), created_at: new Date(NOW + 240_000).toISOString(), data: { ...event("email.complained", n).data, created_at: emailSentAt } });
  for (let n = 1; n <= 100; n += 1) await w.service.send("moth-press", newsletter(n));
  await w.guard.record(event("email.complained", 1));
  await w.guard.record(event("email.complained", 2));
  w.tick(60_000);
  await w.guard.resume("moth-press", { by: "admin@example.com", reason: "the press cleaned its list" });
  w.tick(60_000);
  for (let n = 101; n <= 110; n += 1) await w.service.send("moth-press", newsletter(n));
  w.tick(60_000);
  // Two people get round to marking the old (pre-pause) email as spam: they don't count.
  assert.deepEqual(await w.guard.record(late(3, sentAt)), { counted: false, paused: false });
  assert.deepEqual(await w.guard.record(late(4, sentAt)), { counted: false, paused: false });
  assert.equal(await w.guard.isPaused("moth-press"), false);
  // Complaints about the new emails still do.
  const newSentAt = new Date(NOW + 120_000).toISOString();
  await w.guard.record(late(5, newSentAt));
  assert.equal((await w.guard.record(late(6, newSentAt))).paused, true);
});

test("the shop door answers a paused newsletter plainly, without a retry", async () => {
  const w = await make();
  await w.store.setState("moth-press", { paused: true, pausedAt: new Date(NOW).toISOString() });
  const ask = (body) => handleShopEmail({ method: "POST", headers: { "X-Shop-Id": "moth-press", Authorization: `Bearer ${SHOP_KEY}` }, body }, { service: w.service, registry: w.registry, sentLog: w.sentLog, now: w.now });
  const paused = await ask({ kind: "newsletter", to: "reader@example.com", subject: "News", html: "<p>x</p>", idempotencyKey: "n1" });
  assert.equal(paused.status, 422);
  assert.equal(paused.body.retryable, false);
  assert.match(paused.body.message, /Receipts and order emails still go/);
  assert.equal((await ask({ kind: "order-confirmed", to: "buyer@example.com", subject: "Your order", html: "<p>x</p>", idempotencyKey: "o1" })).status, 200);
});

test("the owner's note is in plain words and names no rival", () => {
  const parts = TEMPLATES["newsletter-paused"]({ problems: ["3 people marked it as spam (0.5%)"], days: 7 }, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.doesNotMatch(parts.text, /resend|webhook|api|bounce rate|complaint rate|shopify|big cartel/i);
  assert.match(parts.text, /reply to this email and we'll turn it back on/);
});

