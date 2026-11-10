// Switching a shop between Stripe and Square after it opened (switch-plan.md S1–S3): the platform keeps the account the
// shop sold through before, sends each call to the account that took the order, and connects the new account
// alongside the old one, which keeps selling until the switch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readServiceConfig } from "./config.js";
import { createPaymentService } from "./service.js";
import { createStripeApi } from "./stripeApi.js";
import { createSquareApi } from "./squareApi.js";
import { signatureHeader } from "./stripeSignature.js";
import { squareSignature } from "./squareSignature.js";
import { accountFor, accountOnly, findSlot, replaceSlot, withNext, withOtherAccounts } from "./accountSlots.js";
import { fakeAccounts, fakeDeliver, fakeStripeFetch } from "./fakes.js";
import { fakeSquareFetch, fakeSquareStates, fakeSquareTokens } from "./squareFakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { fakeFirestore } from "../../clients/fake-firestore.js";
import { token } from "../../clients/fake-fetch.js";
import { firestoreClient } from "../../clients/firestore.js";
import { firestoreRegistry } from "../../clients/registry.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const OTHER = "lark-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const OTHER_KEY = "shop-service-key-lark-press-0123456789abcdef";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const WHSEC_TEST = "whsec_test_platform_test_only";
const HOOK_TEST = "https://payments.platform.example/square/events/test";
const ENV = {
  STRIPE_PLATFORM_TEST_KEY: "sk_test_platform_fake",
  STRIPE_CONNECT_WEBHOOK_SECRET_TEST: WHSEC_TEST,
  SQUARE_APPLICATION_ID_TEST: "sandbox-sq0idb-fakeTestApp",
  SQUARE_APPLICATION_SECRET_TEST: "sandbox-sq0csb-fakeTestSecret",
  SQUARE_WEBHOOK_URL_TEST: HOOK_TEST,
  SQUARE_WEBHOOK_SIGNATURE_KEY_TEST: "test-signature-key",
  SQUARE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
};

const row = (shopId, key, payments) => ({
  shopId, projectId: shopId, pressName: "Moth Press", ownerEmail: "owner@example.com", country: "CA", currency: "CAD",
  region: "northamerica-northeast1", status: "live", serviceKeyHash: hashServiceKey(key), payments,
});
const STRIPE_SHOP = { provider: "stripe", accountId: "acct_moth", mode: "test", chargesEnabled: true };
const SQUARE_SHOP = { provider: "square", mode: "test" };

async function world(start, { others = [] } = {}) {
  const config = readServiceConfig(ENV);
  const sq = fakeSquareFetch({ apps: config.square.apps });
  const stripe = fakeStripeFetch();
  stripe.world.accounts.set("acct_moth", { id: "acct_moth", charges_enabled: true, payouts_enabled: true, details_submitted: true });
  const registry = fakeRegistry();
  await registry.createShop(SHOP, row(SHOP, KEY, start));
  for (const other of others) await registry.createShop(other.shopId, other);
  const { deliver, delivered } = fakeDeliver();
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: config.keys }), registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(), deliver, config,
    squareApi: createSquareApi({ fetch: sq.fetch, apps: config.square.apps }), tokens: fakeSquareTokens(), states: fakeSquareStates(),
    now: () => NOW,
  });
  const call = (op, args = {}, shopId = SHOP, key = KEY) => service.shopCall({ headers: { "X-Shop-Id": shopId, Authorization: `Bearer ${key}` }, body: { op, mode: "test", args } });
  const connect = async (merchantId, shopId = SHOP, key = KEY) => {
    if (!sq.world.merchants.has(merchantId)) sq.world.addMerchant(merchantId, "test");
    const link = await call("account.connectLink", { returnUrl: `https://${shopId}.web.app/admin/settings/payments` }, shopId, key);
    assert.equal(link.status, 200, JSON.stringify(link.body));
    const code = `code-${merchantId}-${randomBytes(3).toString("hex")}`;
    sq.world.codes.set(code, merchantId);
    const back = await service.squareOAuth({ code, state: new URL(link.body.url).searchParams.get("state") });
    return new URL(back.headers.Location).searchParams.get("square");
  };
  const payments = async () => (await registry.getShop(SHOP)).payments;
  // What the switch itself will do (PR C): the next account takes sales, the current one moves to `earlier`.
  const switchNow = async () => {
    const before = await payments();
    await registry.updateShop(SHOP, { payments: withOtherAccounts({ ...before.next, earlier: [{ ...accountOnly(before), until: "2026-10-28T12:00:00Z" }] }) });
  };
  const stripeEvent = (event) => {
    const raw = JSON.stringify({ livemode: false, ...event });
    return service.stripeEvent({ "stripe-signature": signatureHeader(WHSEC_TEST, raw, Math.floor(NOW / 1000)) }, raw);
  };
  const squareEvent = (event) => {
    const raw = JSON.stringify({ event_id: `e-${randomBytes(3).toString("hex")}`, created_at: "2026-10-28T12:00:00Z", ...event });
    return service.squareEvent("test", { "X-Square-HmacSha256-Signature": squareSignature("test-signature-key", HOOK_TEST, raw) }, raw);
  };
  return { stripe, sq, registry, delivered, service, call, connect, payments, switchNow, stripeEvent, squareEvent };
}

const intent = (key) => ({ params: { amount: 5000, currency: "cad", metadata: { order_id: key } }, idempotencyKey: key });
const checkout = (key) => ({
  params: { referenceId: key, currency: "CAD", redirectUrl: `https://${SHOP}.web.app/checkout?order_id=${key}`, lineItems: [{ name: "Moth Book", quantity: 1, unitAmountMinor: 5000 }] },
  idempotencyKey: key,
});
const codeOf = (answer) => [answer.status, answer.body?.error?.code];

test("a shop's accounts: the current one, the next one and earlier ones, each found and replaced in its own place", () => {
  const payments = withOtherAccounts({ ...STRIPE_SHOP, next: { provider: "square", accountId: "M2", mode: "test" }, earlier: [{ provider: "square", accountId: "M1", mode: "test" }, { provider: "stripe", accountId: "acct_old", mode: "test" }] });
  assert.deepEqual(payments.otherAccounts, ["square:M2", "square:M1", "stripe:acct_old"]);
  assert.equal(findSlot(payments, "stripe", "acct_moth").slot, "current");
  assert.equal(findSlot(payments, "square", "M2").slot, "next");
  assert.deepEqual(findSlot(payments, "stripe", "acct_old"), { slot: "earlier", index: 1, account: { provider: "stripe", accountId: "acct_old", mode: "test" } });
  assert.equal(findSlot(payments, "square", "acct_moth"), null);
  // Stripe calls use the current account; Square calls the newest earlier Square account, never the next one.
  assert.equal(accountFor(payments, "stripe").slot, "current");
  assert.equal(accountFor(payments, "square").account.accountId, "M1");
  assert.equal(accountFor(withNext(STRIPE_SHOP, { provider: "square", accountId: "M2" }), "square"), null);
  // Replacing the current account keeps earlier and next, and drops a field the new state no longer has.
  const paused = replaceSlot({ ...payments, pastDueSince: "x" }, { slot: "current" }, { ...accountOnly(payments), chargesEnabled: false });
  assert.equal(paused.pastDueSince, undefined);
  assert.equal(paused.chargesEnabled, false);
  assert.deepEqual(paused.otherAccounts, payments.otherAccounts);
  const revoked = replaceSlot(payments, findSlot(payments, "square", "M1"), { ...findSlot(payments, "square", "M1").account, disconnectedAt: "t" });
  assert.equal(revoked.earlier[0].disconnectedAt, "t");
  assert.equal(revoked.accountId, "acct_moth");
  assert.equal(withNext(payments, null).next, undefined);
  assert.deepEqual(withNext(payments, null).otherAccounts, ["square:M1", "stripe:acct_old"]);
});

test("the Firestore registry finds a shop by an earlier or next account as well as its current one", async () => {
  const fs = fakeFirestore();
  const registry = firestoreRegistry(firestoreClient({ fetch: fs.fetch, token, projectId: "lmb-platform-prod" }));
  await registry.createShop(SHOP, row(SHOP, KEY, withOtherAccounts({ ...SQUARE_SHOP, accountId: "M1", earlier: [{ provider: "stripe", accountId: "acct_moth", mode: "test" }] })));
  await registry.createShop(OTHER, row(OTHER, OTHER_KEY, { provider: "stripe", accountId: "acct_lark", mode: "test" }));
  assert.equal((await registry.findShopByPaymentAccount("square", "M1"))?.shopId, SHOP);
  assert.equal((await registry.findShopByPaymentAccount("stripe", "acct_moth"))?.shopId, SHOP);
  assert.equal((await registry.findShopByPaymentAccount("stripe", "acct_lark"))?.shopId, OTHER);
  assert.equal(await registry.findShopByPaymentAccount("square", "acct_moth"), null);
});

test("a Stripe shop connects Square for a switch: kept as the next account while Stripe keeps selling", async () => {
  const w = await world(STRIPE_SHOP, { others: [row(OTHER, OTHER_KEY, { provider: "stripe", accountId: "acct_lark", mode: "test" })] });
  assert.equal(await w.connect("MERCHANT1"), "connected");
  const payments = await w.payments();
  assert.deepEqual([payments.provider, payments.accountId], ["stripe", "acct_moth"]);
  assert.deepEqual([payments.next.provider, payments.next.accountId, payments.next.locationId], ["square", "MERCHANT1", "LOCMERCHANT1"]);
  assert.deepEqual(payments.otherAccounts, ["square:MERCHANT1"]);
  // New sales still go to Stripe; Square takes none before the switch.
  assert.equal((await w.call("paymentIntents.create", intent("order1"))).status, 200);
  assert.equal(w.stripe.requests.at(-1).headers["Stripe-Account"], "acct_moth");
  assert.deepEqual(codeOf(await w.call("square.checkout.create", checkout("order2"))), [409, "not_connected"]);
  // The admin can see the next account is ready.
  const next = await w.call("account.status", { which: "next" });
  assert.deepEqual([next.body.provider, next.body.connected, next.body.chargesEnabled], ["square", true, true]);
  // One Square account per shop: another shop can't take it, and its events wait until the switch.
  assert.equal(await w.connect("MERCHANT1", OTHER, OTHER_KEY), "in_use");
  assert.deepEqual((await w.squareEvent({ merchant_id: "MERCHANT1", type: "payment.updated", data: { type: "payment", id: "P1", object: { payment: { id: "P1" } } } })).body, { ignored: "account not in use yet" });
  assert.deepEqual(w.delivered, []);
});

test("after moving from Stripe to Square, older Stripe orders still sync and refund, and only Square takes new sales", async () => {
  const w = await world(STRIPE_SHOP);
  const old = await w.call("paymentIntents.create", intent("order1"));
  await w.connect("MERCHANT1");
  await w.switchNow();
  assert.equal((await w.call("paymentIntents.retrieve", { id: old.body.id })).status, 200);
  const refund = await w.call("refunds.create", { params: { payment_intent: old.body.id, amount: 1500 }, idempotencyKey: "order1-refund" });
  assert.equal(refund.status, 200);
  assert.equal(w.stripe.requests.at(-1).headers["Stripe-Account"], "acct_moth");
  assert.deepEqual(codeOf(await w.call("paymentIntents.create", intent("order2"))), [409, "switched_provider"]);
  assert.equal((await w.call("square.checkout.create", checkout("order2"))).status, 200);
  // The old account's events still reach the shop.
  assert.deepEqual((await w.stripeEvent({ id: "evt_1", account: "acct_moth", type: "charge.refunded", data: { object: {} } })).body, { forwarded: SHOP });
  assert.equal((await w.registry.findShopByPaymentAccount("stripe", "acct_moth"))?.shopId, SHOP);
});

test("a Square shop moving to Stripe: the Stripe account is made once and waits as the next one; older Square orders still refund after", async () => {
  const w = await world(SQUARE_SHOP);
  assert.equal(await w.connect("MERCHANT1"), "connected");
  const link = await w.call("square.checkout.create", checkout("order1"));
  const paid = w.sq.world.pay(link.body.id);

  const urls = { returnUrl: `https://${SHOP}.web.app/admin/settings/payments`, refreshUrl: `https://${SHOP}.web.app/admin/settings/payments` };
  const first = await w.call("account.onboardingLink", urls);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const again = await w.call("account.onboardingLink", urls);
  assert.equal(again.body.url, first.body.url);
  assert.equal(w.stripe.requests.filter((r) => r.method === "POST" && r.path === "/v2/core/accounts").length, 1);
  let payments = await w.payments();
  assert.deepEqual([payments.provider, payments.accountId], ["square", "MERCHANT1"]);
  const stripeId = payments.next.accountId;
  assert.deepEqual([payments.next.provider, payments.next.mode], ["stripe", "test"]);
  assert.match(first.body.url, new RegExp(stripeId));

  // Stripe checks the new account: kept on the next account, not passed to the shop, and the admin sees it.
  w.stripe.world.accounts.set(stripeId, { id: stripeId, charges_enabled: true, payouts_enabled: true, details_submitted: true });
  await w.stripeEvent({ id: "evt_acct", account: stripeId, type: "account.updated", data: { object: { id: stripeId, charges_enabled: true, payouts_enabled: true, details_submitted: true } } });
  payments = await w.payments();
  assert.equal(payments.next.chargesEnabled, true);
  assert.equal(payments.chargesEnabled, undefined, "the current Square account is untouched");
  assert.deepEqual(w.delivered, []);
  assert.equal((await w.call("account.status", { which: "next" })).body.chargesEnabled, true);

  await w.switchNow();
  const refund = await w.call("square.refunds.create", { params: { paymentId: paid.id, amountMinor: 500 }, idempotencyKey: "order1-refund" });
  assert.equal(refund.status, 200, JSON.stringify(refund.body));
  assert.deepEqual(codeOf(await w.call("square.checkout.create", checkout("order2"))), [409, "switched_provider"]);
  assert.equal((await w.call("paymentIntents.create", intent("order2"))).status, 200);
  assert.equal(w.stripe.requests.at(-1).headers["Stripe-Account"], stripeId);
  const event = await w.squareEvent({ merchant_id: "MERCHANT1", type: "refund.updated", data: { type: "refund", id: "R1", object: { refund: { id: "R1" } } } });
  assert.deepEqual(event.body, { forwarded: SHOP });

  // Moving back to Square later: only the Square account that holds the older orders, so their refunds keep working.
  assert.equal(await w.connect("MERCHANT2"), "other_account");
  assert.equal(await w.connect("MERCHANT1"), "connected");
  assert.equal((await w.payments()).next.accountId, "MERCHANT1");
});

test("pressing Switch: refused until the new account can take payments; then both accounts sell until the switch is finished", async () => {
  const w = await world(STRIPE_SHOP);
  assert.deepEqual(codeOf(await w.call("account.switch")), [409, "no_next_account"]);
  w.sq.world.addMerchant("MERCHANT1", "test");
  assert.equal(await w.connect("MERCHANT1"), "connected");
  const started = await w.call("account.switch");
  assert.equal(started.status, 200);
  assert.deepEqual([started.body.switching.to, started.body.switching.accountId], ["square", "MERCHANT1"]);
  assert.deepEqual((await w.call("account.switch")).body, started.body, "pressing twice changes nothing");
  assert.equal((await w.call("account.status", { which: "next" })).body.switching.to, "square");

  // The shop's server may still run Stripe, or already run Square: either sale goes through.
  assert.equal((await w.call("paymentIntents.create", intent("order1"))).status, 200);
  assert.equal((await w.call("square.checkout.create", checkout("order2"))).status, 200);
  const event = await w.squareEvent({ merchant_id: "MERCHANT1", type: "payment.updated", data: { type: "payment", id: "P1", object: { payment: { id: "P1" } } } });
  assert.deepEqual(event.body, { forwarded: SHOP });
});

test("pressing Switch to a Stripe account Stripe hasn't checked yet is refused, and so is a shop the platform moved in an emergency", async () => {
  const w = await world(SQUARE_SHOP);
  assert.equal(await w.connect("MERCHANT1"), "connected");
  await w.call("account.onboardingLink", { returnUrl: `https://${SHOP}.web.app/admin`, refreshUrl: `https://${SHOP}.web.app/admin` });
  assert.deepEqual(codeOf(await w.call("account.switch")), [409, "next_not_ready"]);
  await w.registry.updateShop(SHOP, { paymentsEmergency: { to: "own" } });
  assert.deepEqual(codeOf(await w.call("account.switch")), [409, "emergency_move"]);
});

test("with no switch under way, the next account's status names the accounts the shop sold through before, without ids", async () => {
  const w = await world({ ...STRIPE_SHOP, earlier: [{ provider: "square", accountId: "MERCHANT0", until: "2026-10-01T12:00:00.000Z" }] });
  assert.deepEqual((await w.call("account.status", { which: "next" })).body, { next: null, earlier: [{ provider: "square", until: "2026-10-01T12:00:00.000Z" }] });
});
