import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { formEncode, createStripeApi, StripeApiError } from "./stripeApi.js";
import { signatureHeader, verifySignature } from "./stripeSignature.js";
import { feeFor, feeForShop, readFeeSettings } from "./fees.js";
import { readServiceConfig } from "./config.js";
import { createPaymentService, shopWebhookUrl, SHOP_OP_NAMES } from "./service.js";
import { handlePayments } from "./http.js";
import { createPaymentsFromEnv, setupClient } from "./index.js";
import { fakeAccounts, fakeDeliver, fakeStripeFetch } from "./fakes.js";
import { fakeAuditLog, fakeProfileFiles, fakeRegistry } from "../../setup/fakes.js";
import { connectPaymentsStep } from "../../setup/payments.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const WHSEC_LIVE = "whsec_live_platform_test_only";
const WHSEC_TEST = "whsec_test_platform_test_only";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const ENV = {
  STRIPE_PLATFORM_LIVE_KEY: "sk_live_platform_fake",
  STRIPE_PLATFORM_TEST_KEY: "sk_test_platform_fake",
  STRIPE_CONNECT_WEBHOOK_SECRET_LIVE: WHSEC_LIVE,
  STRIPE_CONNECT_WEBHOOK_SECRET_TEST: `whsec_old_rolled, ${WHSEC_TEST}`,
};

function shopRow(fields = {}) {
  return {
    shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", region: "northamerica-northeast1",
    status: "live", serviceKeyHash: hashServiceKey(KEY), payments: { provider: "stripe", accountId: "acct_moth", mode: "live", chargesEnabled: true }, ...fields,
  };
}

async function world({ env = {}, row = shopRow(), deliverStatus = 200 } = {}) {
  const stripe = fakeStripeFetch();
  const registry = fakeRegistry();
  if (row) await registry.createShop(row.shopId, row);
  const auditLog = fakeAuditLog();
  const accounts = fakeAccounts();
  const { deliver, delivered } = fakeDeliver(deliverStatus);
  const config = readServiceConfig({ ...ENV, ...env });
  const service = createPaymentService({ stripe: createStripeApi({ fetch: stripe.fetch, keys: config.keys }), registry, auditLog, accounts, deliver, config, now: () => NOW });
  const call = (op, args = {}, mode = "live", headers = { "X-Shop-Id": SHOP, Authorization: `Bearer ${KEY}` }) => service.shopCall({ headers, body: { op, mode, args } });
  return { stripe, registry, auditLog, accounts, delivered, service, call };
}

const intentArgs = (fields = {}) => ({ params: { amount: 4000, currency: "cad", metadata: { order_id: "order1" }, ...fields }, idempotencyKey: "order1-card" });

// ── Stripe's REST API ─────────────────────────────────────────────────────────────────────────────────────────────

test("parameters are form-encoded the way Stripe reads them", () => {
  const text = formEncode({ amount: 100, metadata: { order_id: "o 1" }, expand: ["latest_charge"], line_items: [{ quantity: 2, price_data: { unit_amount: 50 } }], skip: undefined });
  assert.equal(decodeURIComponent(text), "amount=100&metadata[order_id]=o 1&expand[]=latest_charge&line_items[0][quantity]=2&line_items[0][price_data][unit_amount]=50");
});

test("each Stripe call carries the mode's key, the press's account and the idempotency key", async () => {
  const { fetch, requests } = fakeStripeFetch();
  const api = createStripeApi({ fetch, keys: { live: "sk_live_x", test: "sk_test_x" } });
  await api.call("test", "POST", "/v1/payment_intents", { params: { amount: 5 }, account: "acct_a", idempotencyKey: "k1" });
  await api.call("live", "GET", "/v1/accounts/acct_fake1", {}).catch(() => {});
  assert.deepEqual(requests[0].headers, { Authorization: "Bearer sk_test_x", "Stripe-Account": "acct_a", "Idempotency-Key": "k1", "Content-Type": "application/x-www-form-urlencoded" });
  assert.equal(requests[1].headers.Authorization, "Bearer sk_live_x");
  assert.equal(requests[1].headers["Stripe-Account"], undefined);
});

test("Stripe's refusals keep their type, code and status; a missing key or a dropped line is a plain refusal", async () => {
  const { fetch } = fakeStripeFetch([{ status: 402, body: { error: { type: "card_error", code: "card_declined", message: "Declined" } } }, "network"]);
  const api = createStripeApi({ fetch, keys: { live: "sk_live_x" } });
  await assert.rejects(api.call("live", "POST", "/v1/refunds", {}), (err) => err instanceof StripeApiError && err.code === "card_declined" && err.statusCode === 402);
  await assert.rejects(api.call("live", "GET", "/v1/refunds", {}), (err) => err.type === "api_connection_error");
  await assert.rejects(api.call("test", "GET", "/v1/refunds", {}), (err) => err.code === "platform_key_missing" && err.statusCode === 503);
});

test("Stripe's webhook signature is checked like Stripe does: right secret, unchanged body, recent time", () => {
  const body = '{"id":"evt_1"}';
  const t = Math.floor(NOW / 1000);
  const header = signatureHeader("whsec_a", body, t);
  assert.equal(verifySignature("whsec_a", body, header, { now: NOW }), true);
  assert.equal(verifySignature("whsec_b", body, header, { now: NOW }), false);
  assert.equal(verifySignature("whsec_a", body.replace("1", "2"), header, { now: NOW }), false);
  assert.equal(verifySignature("whsec_a", body, header, { now: NOW + 301_000 }), false);
  assert.equal(verifySignature("whsec_a", body, `t=${t},v1=bad,${header.split(",")[1]}`, { now: NOW }), true, "any v1 may match");
  assert.equal(verifySignature("whsec_a", body, undefined, { now: NOW }), false);
});

// ── Settings and the fee ──────────────────────────────────────────────────────────────────────────────────────────

test("the platform fee is 0% by default and refunded with refunds", () => {
  assert.deepEqual(readFeeSettings({}), { basisPoints: 0, refunded: true });
  assert.deepEqual(readFeeSettings({ PLATFORM_FEE_BASIS_POINTS: "250", PLATFORM_FEE_REFUNDED: "false" }), { basisPoints: 250, refunded: false });
  for (const bad of [{ PLATFORM_FEE_BASIS_POINTS: "2.5" }, { PLATFORM_FEE_BASIS_POINTS: "-1" }, { PLATFORM_FEE_BASIS_POINTS: "10001" }, { PLATFORM_FEE_REFUNDED: "yes" }]) {
    assert.throws(() => readFeeSettings(bad), /must be/);
  }
});

test("a shop's own fee setting replaces the platform default, value by value", () => {
  const defaults = { basisPoints: 200, refunded: true };
  assert.deepEqual(feeForShop({}, defaults), defaults);
  assert.deepEqual(feeForShop({ platformFee: { basisPoints: 0 } }, defaults), { basisPoints: 0, refunded: true });
  assert.deepEqual(feeForShop({ platformFee: { refunded: false } }, defaults), { basisPoints: 200, refunded: false });
  assert.throws(() => feeForShop({ platformFee: { basisPoints: "lots" } }, defaults), /platformFee.basisPoints/);
});

test("the fee rounds down to the cent and never exceeds the payment", () => {
  assert.equal(feeFor(4000, { basisPoints: 250 }), 100);
  assert.equal(feeFor(999, { basisPoints: 250 }), 24);
  assert.equal(feeFor(100, { basisPoints: 10000 }), 100);
  assert.equal(feeFor(0, { basisPoints: 250 }), 0);
  assert.equal(feeFor(4000, { basisPoints: 0 }), 0);
});

test("a platform key in the wrong slot stops the service", () => {
  assert.throws(() => readServiceConfig({ STRIPE_PLATFORM_LIVE_KEY: "sk_test_x" }), /not a live secret key/);
  assert.throws(() => readServiceConfig({ STRIPE_PLATFORM_TEST_KEY: "sk_live_x" }), /not a test secret key/);
  assert.deepEqual(readServiceConfig(ENV).webhookSecrets.test, ["whsec_old_rolled", WHSEC_TEST]);
});

// ── Shop calls: who is asking ─────────────────────────────────────────────────────────────────────────────────────

test("only a shop with its own service key gets in, with one answer for every refusal", async () => {
  const { call, stripe } = await world();
  const answers = [
    await call("paymentIntents.create", intentArgs(), "live", { "X-Shop-Id": SHOP, Authorization: "Bearer wrong-key-wrong-key-wrong-key-wrong" }),
    await call("paymentIntents.create", intentArgs(), "live", { "X-Shop-Id": "other-press", Authorization: `Bearer ${KEY}` }),
    await call("paymentIntents.create", intentArgs(), "live", { Authorization: `Bearer ${KEY}` }),
    await call("paymentIntents.create", intentArgs(), "live", { "X-Shop-Id": SHOP }),
  ];
  for (const answer of answers) assert.deepEqual([answer.status, answer.body.error.code], [401, "unknown_shop"]);
  assert.equal(stripe.requests.length, 0);
});

test("a closed shop, one without a Stripe account, or a Square shop without the platform's Square app, is refused before Stripe is asked", async () => {
  const closure = { by: "admin@example.com", reason: "sold stolen cards", at: "2026-10-28T12:00:00Z" };
  for (const [row, status, code] of [[shopRow({ status: "abandoned" }), 403, "shop_closed"], [shopRow({ closure }), 403, "shop_closed"], [shopRow({ payments: undefined }), 409, "no_account"], [shopRow({ payments: { provider: "square", accountId: "L1" } }), 503, "square_not_ready"]]) {
    const { call, stripe } = await world({ row });
    const answer = await call("paymentIntents.create", intentArgs());
    assert.deepEqual([answer.status, answer.body.error.code], [status, code]);
    assert.equal(stripe.requests.length, 0);
  }
});

test("a new press takes no real money until Stripe has checked them; test payments and lookups still work", async () => {
  const fresh = { provider: "stripe", accountId: "acct_moth", mode: "live" };
  const { call, stripe, registry } = await world({ row: shopRow({ payments: fresh }) });
  stripe.world.accounts.set("acct_moth", { id: "acct_moth", charges_enabled: false, payouts_enabled: false, details_submitted: true });
  for (const op of ["paymentIntents.create", "checkout.sessions.create"]) {
    const answer = await call(op, op === "paymentIntents.create" ? intentArgs() : { params: { mode: "payment" }, idempotencyKey: "order1-session" });
    assert.deepEqual([answer.status, answer.body.error.code], [403, "not_checked"], op);
  }
  assert.ok(!stripe.requests.some((r) => r.method === "POST"), "nothing was created at Stripe");
  assert.equal((await call("paymentIntents.create", intentArgs(), "test")).status, 200, "a test payment needs no check");

  // Stripe says yes (here without the account.updated event ever arriving): the next payment goes through, and the
  // answer is kept so Stripe isn't asked again.
  stripe.world.accounts.get("acct_moth").charges_enabled = true;
  assert.equal((await call("paymentIntents.create", intentArgs())).status, 200);
  assert.equal((await registry.getShop(SHOP)).payments.chargesEnabled, true);
  const asked = stripe.requests.filter((r) => r.method === "GET").length;
  assert.equal((await call("paymentIntents.create", intentArgs({ metadata: { order_id: "order2" } }))).status, 200);
  assert.equal(stripe.requests.filter((r) => r.method === "GET").length, asked);
});

// ── Shop calls: checkout ──────────────────────────────────────────────────────────────────────────────────────────

test("a card payment is made on the press's own account, with no fee by default and a shop-scoped idempotency key", async () => {
  const { call, stripe } = await world();
  const answer = await call("paymentIntents.create", intentArgs());
  assert.equal(answer.status, 200);
  assert.match(answer.body.id, /^pi_/);
  const [request] = stripe.requests;
  assert.equal(request.headers["Stripe-Account"], "acct_moth");
  assert.equal(request.headers["Idempotency-Key"], `${SHOP}/order1-card`);
  assert.equal(request.headers.Authorization, "Bearer sk_live_platform_fake");
  assert.equal(request.params.application_fee_amount, undefined);
});

test("with a fee set, the platform adds it to card payments and Checkout Sessions", async () => {
  const { call, stripe } = await world({ env: { PLATFORM_FEE_BASIS_POINTS: "250" } });
  await call("paymentIntents.create", intentArgs());
  await call("checkout.sessions.create", {
    params: { mode: "payment", client_reference_id: "order2", line_items: [{ quantity: 2, price_data: { currency: "cad", unit_amount: 1500, product_data: { name: "Book" } } }, { quantity: 1, price_data: { currency: "cad", unit_amount: 1000, product_data: { name: "Shipping" } } }] },
    idempotencyKey: "order2-session",
  });
  assert.equal(stripe.requests[0].params.application_fee_amount, "100");
  assert.equal(stripe.requests[1].params["payment_intent_data[application_fee_amount]"], "100");
});

test("a Checkout Session Stripe may discount later takes no fee, so the fee can never exceed what is charged", async () => {
  const { call, stripe } = await world({ env: { PLATFORM_FEE_BASIS_POINTS: "250" } });
  const line_items = [{ quantity: 1, price_data: { currency: "cad", unit_amount: 4000, product_data: { name: "Book" } } }];
  const coupon = await call("checkout.sessions.create", { params: { line_items, discounts: [{ coupon: "HALF" }] }, idempotencyKey: "a" });
  const codes = await call("checkout.sessions.create", { params: { line_items, allow_promotion_codes: true }, idempotencyKey: "b" });
  assert.deepEqual([coupon.status, codes.status], [200, 200]);
  assert.equal(stripe.requests[0].params["payment_intent_data[application_fee_amount]"], undefined);
  assert.equal(stripe.requests[1].params["payment_intent_data[application_fee_amount]"], undefined);
});

test("a shop's own fee setting wins over the platform default", async () => {
  const { call, stripe } = await world({ env: { PLATFORM_FEE_BASIS_POINTS: "250" }, row: shopRow({ platformFee: { basisPoints: 100 } }) });
  await call("paymentIntents.create", intentArgs());
  assert.equal(stripe.requests[0].params.application_fee_amount, "40");
});

test("a shop can never route money or set the fee itself", async () => {
  const { call, stripe } = await world();
  for (const params of [{ application_fee_amount: 1 }, { transfer_data: { destination: "acct_evil" } }, { on_behalf_of: "acct_evil" }, { payment_intent_data: { application_fee_amount: 0 } }]) {
    const answer = await call("checkout.sessions.create", { params: { ...params, line_items: [] }, idempotencyKey: "k" });
    assert.deepEqual([answer.status, answer.body.error.code], [400, "money_routing"], JSON.stringify(params));
  }
  assert.equal(stripe.requests.length, 0);
});

test("creates and refunds need an idempotency key", async () => {
  const { call } = await world();
  assert.equal((await call("paymentIntents.create", { params: intentArgs().params })).status, 400);
  assert.equal((await call("refunds.create", { params: { payment_intent: "pi_1" } })).status, 400);
});

test("an account made in test mode never takes a live payment", async () => {
  const { call, stripe } = await world({ row: shopRow({ payments: { provider: "stripe", accountId: "acct_moth", mode: "test" } }) });
  const live = await call("paymentIntents.create", intentArgs(), "live");
  assert.deepEqual([live.status, live.body.error.code], [403, "test_only"]);
  const test = await call("paymentIntents.create", intentArgs(), "test");
  assert.equal(test.status, 200);
  assert.equal(stripe.requests.length, 1);
  assert.equal(stripe.requests[0].headers.Authorization, "Bearer sk_test_platform_fake");
  // A registry row from before modes were kept counts as test only.
  const old = await world({ row: shopRow({ payments: { provider: "stripe", accountId: "acct_moth" } }) });
  assert.equal((await old.call("paymentIntents.create", intentArgs(), "live")).status, 403);
});

// ── Shop calls: lookups, stopping an attempt, refunds ─────────────────────────────────────────────────────────────

test("lookups and stops reach only the shop's own account, with checked ids and parameters", async () => {
  const { call } = await world();
  const intent = (await call("paymentIntents.create", intentArgs())).body;
  const read = await call("paymentIntents.retrieve", { id: intent.id, params: { expand: ["latest_charge"] } });
  assert.equal(read.body.id, intent.id);
  assert.equal((await call("paymentIntents.retrieve", { id: intent.id, params: { expand: ["customer"] } })).status, 400);
  assert.equal((await call("paymentIntents.retrieve", { id: "../accounts/acct_x" })).status, 400);
  assert.equal((await call("paymentIntents.cancel", { id: intent.id })).body.status, "canceled");
  const session = (await call("checkout.sessions.create", { params: { client_reference_id: "o", line_items: [] }, idempotencyKey: "s" })).body;
  assert.equal((await call("checkout.sessions.expire", { id: session.id })).body.status, "expired");
  assert.equal((await call("disputes.list", { params: { payment_intent: intent.id, limit: 1 } })).status, 200);
  assert.equal((await call("refunds.list", { params: { payment_intent: intent.id, limit: 500 } })).status, 400);
  assert.equal((await call("customers.list", {})).status, 400);
});

test("a refund gives back the platform's fee in proportion by default, and keeps it when the setting is off", async () => {
  const on = await world();
  await on.call("refunds.create", { params: { payment_intent: "pi_1", amount: 1000, reason: "requested_by_customer", metadata: { order_id: "o" } }, idempotencyKey: "r1" });
  assert.equal(on.stripe.requests[0].params.refund_application_fee, "true");
  assert.equal(on.stripe.requests[0].headers["Stripe-Account"], "acct_moth");
  const off = await world({ row: shopRow({ platformFee: { refunded: false } }) });
  await off.call("refunds.create", { params: { payment_intent: "pi_1" }, idempotencyKey: "r1" });
  assert.equal(off.stripe.requests[0].params.refund_application_fee, undefined);
  assert.equal((await off.call("refunds.create", { params: { payment_intent: "pi_1", charge: "ch_1" }, idempotencyKey: "r2" })).status, 400);
  assert.equal((await off.call("refunds.create", { params: { payment_intent: "pi_1", refund_application_fee: false }, idempotencyKey: "r3" })).status, 400);
});

test("the shop can fetch a Stripe event again, but only from its own account", async () => {
  const { call, stripe } = await world();
  stripe.world.events.set("evt_mine", { id: "evt_mine", account: "acct_moth", type: "payment_intent.succeeded" });
  stripe.world.events.set("evt_theirs", { id: "evt_theirs", account: "acct_other", type: "payment_intent.succeeded" });
  assert.equal((await call("events.retrieve", { id: "evt_mine" })).body.type, "payment_intent.succeeded");
  assert.equal((await call("events.retrieve", { id: "evt_theirs" })).status, 404);
});

// ── Shop calls: the press's account ───────────────────────────────────────────────────────────────────────────────

test("account status tells the press what Stripe still needs, and the platform fee", async () => {
  const { call, stripe } = await world({ env: { PLATFORM_FEE_BASIS_POINTS: "150" } });
  stripe.world.accounts.set("acct_moth", { id: "acct_moth", charges_enabled: true, payouts_enabled: false, details_submitted: true, requirements: { currently_due: ["external_account"] } });
  const answer = await call("account.status");
  assert.deepEqual(answer.body, { accountId: "acct_moth", mode: "live", chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true, requirementsDue: 1, platformFee: { percent: 1.5, refundedWithRefunds: true } });
});

test("Stripe's sign-up link only sends the press back to the shop's own addresses", async () => {
  const { call } = await world({ row: shopRow({ domains: [{ name: "shop.mothpress.example" }] }) });
  const ok = await call("account.onboardingLink", { returnUrl: `https://${SHOP}.web.app/admin/settings`, refreshUrl: "https://shop.mothpress.example/admin/settings?again=1" });
  assert.equal(ok.status, 200);
  assert.match(ok.body.url, /acct_moth/);
  for (const returnUrl of ["https://evil.example/admin", `http://${SHOP}.web.app/admin`, "not an address"]) {
    assert.equal((await call("account.onboardingLink", { returnUrl, refreshUrl: returnUrl })).status, 400, returnUrl);
  }
});

test("every call a shop can make is listed", () => {
  assert.deepEqual([...SHOP_OP_NAMES].sort(), [
    "account.onboardingLink", "account.paymentDomain", "account.status", "checkout.sessions.create", "checkout.sessions.expire", "checkout.sessions.retrieve", "disputes.list",
    "events.retrieve", "paymentIntents.cancel", "paymentIntents.create", "paymentIntents.retrieve", "refunds.create", "refunds.list",
    // Square shops (square.js, plan 2.2b)
    "account.connectLink", "square.checkout.create", "square.checkout.delete", "square.checkout.retrieve", "square.disputes.forPayment",
    "square.payments.cancel", "square.payments.retrieve", "square.refunds.create", "square.refunds.forPayment", "square.refunds.retrieve",
  ].sort());
});

test("a shop's own address is registered for Apple Pay and Google Pay on its account, once; any other is refused", async () => {
  const { stripe, call, service, registry } = await world({ row: shopRow({ domains: [{ name: "shop.mothpress.example" }] }) });
  const first = await call("account.paymentDomain", { domain: "Shop.MothPress.example" });
  assert.equal(first.status, 200);
  assert.equal(first.body.apple_pay.status, "active");
  const again = await service.registerPaymentDomain(SHOP, "shop.mothpress.example");
  assert.equal(again.id, first.body.id);
  assert.equal(stripe.world.paymentDomains.length, 1, "never added twice");
  assert.equal(stripe.world.paymentDomains[0].validated, 1, "the second time checks it again");
  assert.equal(stripe.world.paymentDomains[0].account, "acct_moth");
  assert.ok([...registry.events.get(SHOP).values()].some((e) => e.kind === "payments.payment-domain"));
  for (const domain of ["evil.example", "", 42]) assert.equal((await call("account.paymentDomain", { domain })).status, 400, String(domain));
  assert.equal((await call("account.paymentDomain", { domain: `${SHOP}.web.app` })).status, 200, "the shop's own Firebase address counts");
  await assert.rejects(service.registerPaymentDomain("nobody", "shop.mothpress.example"), /isn't in the registry/);
});

// ── The one Stripe events address ─────────────────────────────────────────────────────────────────────────────────

const signed = (event, secret = WHSEC_LIVE) => {
  const raw = JSON.stringify(event);
  return { headers: { "stripe-signature": signatureHeader(secret, raw, Math.floor(NOW / 1000)) }, raw };
};

test("a signed event for a press's account is passed on, untouched, to that shop", async () => {
  const { service, delivered } = await world();
  const { headers, raw } = signed({ id: "evt_1", livemode: true, account: "acct_moth", type: "checkout.session.completed", data: { object: {} } });
  assert.deepEqual(await service.stripeEvent(headers, raw), { status: 200, body: { forwarded: SHOP } });
  assert.deepEqual(delivered, [{ shopId: SHOP, rawBody: raw }]);
});

test("unsigned, mis-signed and wrong-mode events are refused; others are answered and dropped", async () => {
  const { service, delivered } = await world({ row: shopRow({ payments: { provider: "stripe", accountId: "acct_moth", mode: "test" } }) });
  const event = { id: "evt_2", livemode: true, account: "acct_moth", type: "payment_intent.succeeded" };
  assert.equal((await service.stripeEvent({}, JSON.stringify(event))).status, 400);
  assert.equal((await service.stripeEvent(signed(event, "whsec_someone_else").headers, signed(event).raw)).status, 400);
  assert.equal((await service.stripeEvent(signed({ ...event, livemode: false }).headers, signed({ ...event, livemode: false }).raw)).status, 400, "live secret, test event");
  assert.deepEqual((await service.stripeEvent(signed({ ...event, account: undefined }).headers, signed({ ...event, account: undefined }).raw)).body, { ignored: "not a connected account" });
  assert.deepEqual((await service.stripeEvent(signed({ ...event, account: "acct_nobody" }).headers, signed({ ...event, account: "acct_nobody" }).raw)).body, { ignored: "no shop has this account" });
  assert.deepEqual((await service.stripeEvent(signed(event).headers, signed(event).raw)).body, { ignored: "live event for a test-only shop" });
  const testEvent = { ...event, livemode: false };
  assert.equal((await service.stripeEvent(signed(testEvent, WHSEC_TEST).headers, signed(testEvent, WHSEC_TEST).raw)).status, 200);
  assert.equal(delivered.length, 1, "only the test event reached the test-only shop");
});

test("when the shop doesn't take an event, Stripe is told to send it again", async () => {
  const { service } = await world({ deliverStatus: 500 });
  const { headers, raw } = signed({ id: "evt_3", livemode: true, account: "acct_moth", type: "payment_intent.succeeded" });
  assert.equal((await service.stripeEvent(headers, raw)).status, 502);
});

test("the account's state is kept in the registry and logged once, in the registry and the shop's audit log", async () => {
  const { service, registry, auditLog } = await world();
  const event = { id: "evt_4", livemode: true, account: "acct_moth", type: "account.updated", data: { object: { id: "acct_moth", charges_enabled: true, payouts_enabled: true, details_submitted: true } } };
  await service.stripeEvent(signed(event).headers, signed(event).raw);
  await service.stripeEvent(signed({ ...event, id: "evt_5" }).headers, signed({ ...event, id: "evt_5" }).raw);
  const payments = (await registry.getShop(SHOP)).payments;
  assert.deepEqual({ ...payments, stateAt: undefined }, { provider: "stripe", accountId: "acct_moth", mode: "live", chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, stateAt: undefined });
  assert.deepEqual([...registry.events.get(SHOP).keys()], ["payments-account-evt_4"], "an unchanged state is not logged again");
  assert.equal(auditLog.entries.get(SHOP).get("payments-account-evt_4").kind, "payments.account-updated");
});

test("a press disconnecting their Stripe account is recorded", async () => {
  const { service, registry } = await world();
  const event = { id: "evt_6", livemode: true, account: "acct_moth", type: "account.application.deauthorized", data: { object: {} } };
  await service.stripeEvent(signed(event).headers, signed(event).raw);
  assert.equal((await registry.getShop(SHOP)).payments.disconnectedAt, new Date(NOW).toISOString());
});

test("events go to the shop's own webhook address", () => {
  assert.equal(shopWebhookUrl(shopRow()), `https://northamerica-northeast1-${SHOP}.cloudfunctions.net/stripeWebhook`);
  assert.equal(shopWebhookUrl({ projectId: "x" }), null);
});

// ── The shop maker's step 13 ──────────────────────────────────────────────────────────────────────────────────────

test("setup's step 13 makes one Standard account through the service, saved with its mode and logged", async () => {
  const { service, registry, auditLog, stripe, accounts } = await world({ row: shopRow({ payments: undefined }) });
  const shop = { shopId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", country: "CA", currency: "CAD", testMode: false, plan: "shop" };
  const profileFiles = fakeProfileFiles();
  await registry.saveProfile(SHOP, { ...JSON.parse(readFileSync("profile/examples/test-shop.json", "utf8")), shopId: SHOP });
  const step = connectPaymentsStep({ registry, providers: { stripe: setupClient(service) }, profileFiles, config: { stripePublishableKeys: { live: "pk_live_platformExample" } } });
  assert.equal(await step.check({ shop }), false);
  await step.act({ shop });
  assert.equal(await step.check({ shop }), true);
  const { payments } = await registry.getShop(SHOP);
  assert.deepEqual(payments, { provider: "stripe", accountId: "acct_fake1", mode: "live" });
  assert.deepEqual((await registry.getProfile(SHOP)).payments, { provider: "stripe", mode: "platform", stripe: { accountId: "acct_fake1", publishableKey: "pk_live_platformExample" } });
  const create = stripe.requests.find((r) => r.path === "/v1/accounts");
  assert.equal(create.params.type, "standard");
  assert.equal(create.params.default_currency, "cad");
  assert.equal(create.params["metadata[lmb_shop_id]"], SHOP);
  assert.equal(create.headers["Idempotency-Key"], `lmb-account-${SHOP}-live`);
  assert.equal(create.headers["Stripe-Account"], undefined);
  assert.ok(auditLog.entries.get(SHOP).has("payments-account-created-acct_fake1"));
  // A lost answer and a retry: the same idempotency key gets the same account back.
  accounts.rows.clear();
  assert.equal((await service.createAccount(SHOP, shop)).accountId, "acct_fake1");
});

test("an account is only made for a shop in the registry, for its own owner; test mode makes a test account", async () => {
  const { service } = await world({ row: shopRow({ payments: undefined }) });
  await assert.rejects(service.createAccount("other-press", { ownerEmail: "owner@example.com" }), /isn't in the registry/);
  await assert.rejects(service.createAccount(SHOP, { ownerEmail: "someone@example.com" }), /another owner/);
  assert.equal((await service.createAccount(SHOP, { pressName: "M", ownerEmail: "OWNER@example.com", country: "CA", currency: "CAD", testMode: true })).mode, "test");
});

test("an account Stripe no longer has is not found, so setup stops for a person", async () => {
  const { service, accounts } = await world();
  await accounts.set(SHOP, { provider: "stripe", accountId: "acct_gone", mode: "live" });
  assert.equal(await service.findAccount(SHOP), null);
});

// ── The web doors ─────────────────────────────────────────────────────────────────────────────────────────────────

test("the web doors route shop calls and Stripe events", async () => {
  const stripe = fakeStripeFetch();
  const registry = fakeRegistry();
  await registry.createShop(SHOP, shopRow());
  const service = createPaymentsFromEnv({ env: ENV, fetch: stripe.fetch, registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(), now: () => NOW });
  const headers = { "x-shop-id": SHOP, authorization: `Bearer ${KEY}` };
  assert.equal((await handlePayments({ method: "GET", path: "/shop" }, { service })).status, 405);
  assert.equal((await handlePayments({ method: "POST", path: "/nope" }, { service })).status, 404);
  assert.equal((await handlePayments({ method: "POST", path: "/shop", headers, body: { op: "paymentIntents.create", mode: "live", args: intentArgs() } }, { service })).status, 200);
  assert.equal((await handlePayments({ method: "POST", path: "/stripe/events", headers: {} }, { service })).status, 400);
  const { headers: eventHeaders, raw } = signed({ id: "evt_7", livemode: true, account: "acct_nobody", type: "x" });
  assert.equal((await handlePayments({ method: "POST", path: "/stripe/events/", headers: eventHeaders, rawBody: Buffer.from(raw) }, { service })).status, 200);
});

// ── The platform key stays here ───────────────────────────────────────────────────────────────────────────────────

test("no code outside services/payments reads the Stripe platform key", () => {
  const hits = [];
  const skip = new Set(["node_modules", ".git", "dist", "payments"]);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name) && !(name === "payments" && !dir.endsWith("services"))) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(c|m)?(j|t)sx?$/.test(name) && readFileSync(path, "utf8").includes("STRIPE_PLATFORM_")) hits.push(path);
    }
  };
  walk(".");
  assert.deepEqual(hits, []);
});
