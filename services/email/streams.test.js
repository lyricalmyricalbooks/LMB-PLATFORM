// Email reputation (code plan 8.3) with a pretend Resend and fake complaint events: two streams, each shop's own
// sub-address behind a setting, the newsletter pausing itself at the limit, receipts still going, and only signed
// events counting.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "./index.js";
import { shopSenderAddress, streamOf, streamSettings } from "./streams.js";
import { LIMITS, PAUSE_CHECK, createReputationGuard, overLimit } from "./reputation.js";
import { handleResendEvent, signEvent, verifyEvent } from "./webhook.js";
import { handleShopEmail, hashServiceKey } from "./http.js";
import { TEMPLATES } from "./templates.js";
import { fakeReputationStore, fakeResendFetch, fakeSentLog } from "./fakes.js";
import { fakeRegistry } from "../../setup/fakes.js";
import { platformSettings } from "../settings.js";

const KEY = "re_test_not_a_real_key";
const SHOP_KEY = "shop-service-key-0123456789abcdef0123456789";
const SECRET = `whsec_${Buffer.from("a pretend signing secret, 32 bytes").toString("base64")}`;
const NOW = Date.parse("2026-10-28T12:00:00Z");

async function make({ env = {} } = {}) {
  let clock = NOW;
  const now = () => new Date(clock);
  const registry = fakeRegistry();
  for (const [shopId, pressName] of [["moth-press", "Moth Press"], ["owl-books", "Owl Books"]]) {
    await registry.createShop(shopId, { shopId, pressName, ownerEmail: `${shopId}@example.com`, status: "live", serviceKeyHash: hashServiceKey(SHOP_KEY) });
  }
  const resend = fakeResendFetch();
  const sentLog = fakeSentLog();
  const store = fakeReputationStore();
  const reported = [];
  const repairs = { report: async (item) => void reported.push(item) };
  let service;
  const email = { sendPlatform: (message) => service.sendPlatform(message) };
  const guard = createReputationGuard({ store, sentLog, registry, email, repairs, now });
  service = createEmailService({ env: { RESEND_API_KEY: KEY, ...env }, fetch: resend.fetch, registry, sentLog, reputation: guard, now, sleep: async () => {} });
  return { registry, resend, sentLog, store, reported, guard, service, tick: (ms) => (clock += ms), now };
}

const newsletter = (n, shopId = "moth-press") => ({ kind: "newsletter", to: `reader${n}@example.com`, subject: "Autumn books", html: "<p>New books</p>", custom: true, idempotencyKey: `${shopId}/news/${n}` });
const receipt = (n) => ({ kind: "order-confirmed", to: `buyer${n}@example.com`, subject: "Your order", html: "<p>Thanks</p>", custom: true, idempotencyKey: `moth-press/order/${n}` });

/** A fake Resend event for one email, tagged the way the service tags it. */
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

test("each shop's own sub-address, per stream, only when the setting is on", async () => {
  const settings = platformSettings({ PLATFORM_DOMAIN: "colophon.example" });
  const off = streamSettings({}, settings);
  assert.equal(off.shopSenders, false);
  assert.deepEqual(off.domains, { orders: "mail.colophon.example", newsletter: "news.colophon.example" });
  assert.equal(shopSenderAddress({ shopId: "moth-press", stream: "newsletter", streams: off, settings }), "notifications@colophon.example");
  const on = streamSettings({ SHOP_SENDER_ADDRESSES: "on" }, settings);
  assert.equal(shopSenderAddress({ shopId: "moth-press", stream: "orders", streams: on, settings }), "moth-press@mail.colophon.example");
  assert.equal(shopSenderAddress({ shopId: "moth-press", stream: "newsletter", streams: on, settings }), "moth-press@news.colophon.example");
  assert.throws(() => streamSettings({ SHOP_SENDER_ADDRESSES: "yes" }, settings), /on or off/);
  assert.throws(() => streamSettings({ PLATFORM_ORDERS_EMAIL_DOMAIN: "same.example", PLATFORM_NEWSLETTER_EMAIL_DOMAIN: "same.example" }, settings), /two different/);
  assert.throws(() => shopSenderAddress({ shopId: "Bad Id", stream: "orders", streams: on, settings }), /can't be an email address/);

  const w = await make({ env: { SHOP_SENDER_ADDRESSES: "on" } });
  await w.service.send("moth-press", receipt(1));
  await w.service.send("moth-press", newsletter(1));
  await w.service.sendPlatform({ kind: "sign-in-link", to: "someone@example.com", data: { link: "https://platform.example/signup/?finish=1" }, idempotencyKey: "p1" });
  const [order, news, platform] = w.resend.requests.map((r) => r.body);
  assert.equal(order.from, '"Moth Press" <moth-press@mail.platform.example>');
  assert.deepEqual(order.tags.at(-1), { name: "stream", value: "orders" });
  assert.equal(news.from, '"Moth Press" <moth-press@news.platform.example>');
  assert.deepEqual(news.tags.at(-1), { name: "stream", value: "newsletter" });
  assert.equal(platform.from, '"Colophon" <notifications@platform.example>', "the platform's own email keeps its address");
  assert.equal((await w.service.send("moth-press", newsletter(2))).alreadySent, false);
  assert.equal(await w.sentLog.countSince("moth-press", new Date(0).toISOString(), "newsletter"), 2);
  assert.equal(await w.sentLog.countSince("moth-press", new Date(0).toISOString(), "orders"), 1);
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
  const before = w.resend.delivered.length;
  await w.service.send("moth-press", receipt(1));
  assert.equal(w.resend.delivered.length, before + 1, "the receipt still went");
  assert.equal(w.resend.delivered.at(-1).to[0], "buyer1@example.com");
  // Another shop's newsletter is untouched.
  await w.service.send("owl-books", newsletter(1, "owl-books"));

  assert.equal(w.reported.length, 1);
  assert.equal(w.reported[0].check, PAUSE_CHECK);
  assert.equal(w.reported[0].shopId, "moth-press");
  assert.match(w.reported[0].detail, /2 people marked it as spam \(0\.4%\)/);
  const note = w.resend.delivered.find((d) => d.to[0] === "moth-press@example.com");
  assert.match(note.subject, /Moth Press's newsletter is paused for now/);
  assert.match(note.text, /receipts, order emails and shipping notices still go out/);
  assert.match(note.text, /2 people marked it as spam/);
  assert.ok([...(w.registry.events.get("moth-press")?.values() ?? [])].some((e) => e.what === "newsletter-paused"));

  // More complaints while paused don't send the owner a second note.
  await w.guard.record(event("email.complained", 3));
  assert.equal(w.resend.delivered.filter((d) => d.to[0] === "moth-press@example.com").length, 1);
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

test("only events signed by Resend, within five minutes, are counted", async () => {
  const w = await make();
  for (let n = 1; n <= 10; n += 1) await w.service.send("moth-press", newsletter(n));
  const body = JSON.stringify(event("email.complained", 1));
  const timestamp = String(Math.floor(NOW / 1000));
  const headers = { "svix-id": "msg_1", "svix-timestamp": timestamp, "svix-signature": `v1,bm90IGl0 ${signEvent({ secret: SECRET, id: "msg_1", timestamp, body })}` };
  const call = (request) => handleResendEvent({ method: "POST", ...request }, { secret: SECRET, guard: w.guard, now: w.now });

  assert.equal((await call({ headers, rawBody: body })).status, 200);
  assert.equal((await call({ headers, rawBody: body.replace("reader1", "reader2") })).status, 401, "a changed body");
  assert.equal((await call({ headers: { ...headers, "svix-signature": "v1,AAAA" }, rawBody: body })).status, 401);
  assert.equal((await call({ headers: {}, rawBody: body })).status, 401);
  const old = String(Math.floor(NOW / 1000) - 301);
  assert.equal((await call({ headers: { ...headers, "svix-timestamp": old, "svix-signature": signEvent({ secret: SECRET, id: "msg_1", timestamp: old, body }) }, rawBody: body })).status, 401);
  assert.equal((await handleResendEvent({ method: "GET" }, { secret: SECRET, guard: w.guard })).status, 405);
  assert.equal(verifyEvent({ secret: "not-a-secret", headers, rawBody: body, now: w.now }), false);
  // The same event delivered twice counts once (Svix retries until it gets a 2xx).
  assert.equal((await call({ headers, rawBody: body })).body.counted, false);
});

test("the owner's note is in plain words and names no rival", () => {
  const parts = TEMPLATES["newsletter-paused"]({ problems: ["3 people marked it as spam (0.5%)"], days: 7 }, { settings: platformSettings({}), pressName: "Moth Press" });
  assert.doesNotMatch(parts.text, /resend|webhook|api|bounce rate|complaint rate|shopify|big cartel/i);
  assert.match(parts.text, /reply to this email and we'll turn it back on/);
});
