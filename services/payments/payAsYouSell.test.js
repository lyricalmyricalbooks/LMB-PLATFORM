// Pay as you sell (code plan 6.19) in the payment service, against a pretend Stripe and a pretend Square: a share of the
// books in each sale, never more in a billing month than the plan's price, counted once however often a checkout or
// event comes again, and given back with refunds in the month it was taken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { activeTerms, billingMonth, intentBooksMinor, monthTotals, sessionBooksMinor, squareBooksMinor } from "./payAsYouSell.js";
import { readServiceConfig } from "./config.js";
import { createPaymentService } from "./service.js";
import { createStripeApi } from "./stripeApi.js";
import { createSquareApi } from "./squareApi.js";
import { signatureHeader } from "./stripeSignature.js";
import { squareSignature } from "./squareSignature.js";
import { fakeAccounts, fakeDeliver, fakeStripeFetch } from "./fakes.js";
import { fakeSquareFetch, fakeSquareStates, fakeSquareTokens } from "./squareFakes.js";
import { fakeFeeLedgerStore } from "./feeLedgerFakes.js";
import { fakeAuditLog, fakeRegistry } from "../../setup/fakes.js";
import { hashServiceKey } from "../email/http.js";

const SHOP = "moth-press";
const KEY = "shop-service-key-moth-press-0123456789abcdef";
const WHSEC = "whsec_live_platform_test_only";
const NOW = Date.parse("2026-10-28T12:00:00Z");
const HOUR = 3600_000;
const DAY = 24 * HOUR;
// 2% of the books, never more than $29 in a billing month; months start on the 1st (the end of the trial).
const TERMS = { basisPoints: 200, capMinor: 2900, currency: "CAD", from: "2026-10-01T00:00:00.000Z", until: null };
const ENV = { STRIPE_PLATFORM_LIVE_KEY: "sk_live_platform_fake", STRIPE_PLATFORM_TEST_KEY: "sk_test_platform_fake", STRIPE_CONNECT_WEBHOOK_SECRET_LIVE: WHSEC };

const shopRow = (fields = {}) => ({
  shopId: SHOP, projectId: SHOP, pressName: "Moth Press", ownerEmail: "owner@example.com", region: "northamerica-northeast1", plan: "shop",
  status: "live", serviceKeyHash: hashServiceKey(KEY), payments: { provider: "stripe", accountId: "acct_moth", mode: "live", chargesEnabled: true },
  payAsYouSell: TERMS, ...fields,
});

async function world({ row = shopRow(), env = {}, ledger = true } = {}) {
  const stripe = fakeStripeFetch();
  const registry = fakeRegistry();
  await registry.createShop(row.shopId, row);
  const store = fakeFeeLedgerStore();
  const { deliver, delivered } = fakeDeliver();
  const config = readServiceConfig({ ...ENV, ...env });
  let clock = NOW;
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: stripe.fetch, keys: config.keys }), registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(), deliver, config,
    ...(ledger ? { feeLedger: store } : {}), now: () => clock,
  });
  const call = (op, args) => service.shopCall({ headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${KEY}` }, body: { op, mode: "live", args } });
  const event = (type, object, id = `evt_${randomBytes(4).toString("hex")}`) => {
    const raw = JSON.stringify({ id, type, livemode: true, account: "acct_moth", data: { object } });
    return service.stripeEvent({ "stripe-signature": signatureHeader(WHSEC, raw, Math.floor(clock / 1000)) }, raw);
  };
  const month = async (key = "2026-10-01") => monthTotals(await store.get(SHOP, key), clock);
  return { stripe, registry, store, delivered, service, call, event, month, tick: (ms) => { clock += ms; } };
}

// A card payment for an order of `books` (in cents) plus shipping and tax.
const card = (order, books, { extra = 2000, currency = "cad" } = {}) => ({
  params: { amount: books + extra, currency, metadata: { order_id: order, lmb_books_minor: String(books) } },
  idempotencyKey: `${order}-card`,
});
const feeSent = (w) => w.stripe.requests.filter((r) => r.path === "/v1/payment_intents" && r.method === "POST").at(-1).params.application_fee_amount;

// Pays a card payment the way Stripe tells the service: payment_intent.succeeded with the fee it took.
async function pay(w, order, books, options) {
  const made = await w.call("paymentIntents.create", card(order, books, options));
  assert.equal(made.status, 200, JSON.stringify(made.body));
  const fee = feeSent(w);
  await w.event("payment_intent.succeeded", { id: made.body.id, object: "payment_intent", amount: books + 2000, application_fee_amount: fee === undefined ? null : Number(fee) });
  return { id: made.body.id, fee: fee === undefined ? 0 : Number(fee) };
}

// ── What counts ──────────────────────────────────────────────────────────────────────────────────────────────────

test("only the books count: shipping and tax lines are left out, discounts already lower the lines", () => {
  const line = (name, unit, quantity = 1, metadata) => ({ price_data: { currency: "cad", unit_amount: unit, product_data: { name, ...(metadata ? { metadata } : {}) } }, quantity });
  assert.equal(sessionBooksMinor({ line_items: [line("Moth Book", 2000, 2), line("Shipping & Handling", 1500), line("Estimated Sales Tax", 520)] }), 4000);
  assert.equal(sessionBooksMinor({ line_items: [line("Moth Book", 2000), line("Courier", 900, 1, { lmb_line: "shipping" })] }), 2000);
  assert.equal(sessionBooksMinor({ line_items: [line("Moth Book", 2000)], allow_promotion_codes: true }), null);
  assert.equal(intentBooksMinor({ amount: 6500, metadata: { lmb_books_minor: "5000" } }), 5000);
  assert.equal(intentBooksMinor({ amount: 3000, metadata: { lmb_books_minor: "5000" } }), 3000, "never more than the payment (a gift card paid part)");
  assert.equal(intentBooksMinor({ amount: 6500, metadata: {} }), null);
  assert.equal(squareBooksMinor([{ name: "Moth Book", quantity: 2, unitAmountMinor: 2000 }, { name: "Shipping & Handling", quantity: 1, unitAmountMinor: 1000 }]), 4000);
});

test("billing months run from the start date, the same day each month (the last day of a shorter one)", () => {
  assert.deepEqual(billingMonth("2026-10-01T00:00:00.000Z", NOW), { key: "2026-10-01", start: "2026-10-01T00:00:00.000Z", end: "2026-11-01T00:00:00.000Z" });
  assert.equal(billingMonth("2026-01-31T09:00:00.000Z", Date.parse("2026-03-01T00:00:00Z")).key, "2026-02-28");
  assert.equal(billingMonth("2026-01-31T09:00:00.000Z", Date.parse("2026-03-31T10:00:00Z")).key, "2026-03-31");
  assert.equal(billingMonth("2026-10-14T00:00:00.000Z", Date.parse("2027-02-13T23:00:00Z")).key, "2027-01-14");
});

test("the terms apply from their start to their end, only on plans with the shop; a broken record is refused", () => {
  assert.equal(activeTerms(shopRow(), NOW).basisPoints, 200);
  assert.equal(activeTerms(shopRow({ payAsYouSell: { ...TERMS, from: "2026-11-11T00:00:00.000Z" } }), NOW), null, "the trial is fee-free");
  assert.equal(activeTerms(shopRow({ payAsYouSell: { ...TERMS, until: "2026-10-20T00:00:00.000Z" } }), NOW), null, "back on monthly");
  assert.equal(activeTerms(shopRow({ plan: "stockroom" }), NOW), null, "the stockroom alone stays monthly");
  assert.equal(activeTerms(shopRow({ payAsYouSell: undefined }), NOW), null);
  assert.throws(() => activeTerms(shopRow({ payAsYouSell: { ...TERMS, basisPoints: "2%" } }), NOW), /basisPoints/);
});

// ── The cap ──────────────────────────────────────────────────────────────────────────────────────────────────────

test("the cap stops fees mid-order: the order that crosses it pays only up to the cap, then nothing", async () => {
  const w = await world();
  assert.equal((await pay(w, "o1", 100_000)).fee, 2000, "2% of $1,000 of books, not of the shipping");
  assert.equal((await pay(w, "o2", 100_000)).fee, 900, "only the $9 left under $29");
  assert.equal((await pay(w, "o3", 100_000)).fee, 0, "the rest of the month is free");
  assert.equal(feeSent(w), undefined, "no fee at all on the order after the cap");
  assert.deepEqual(await w.month(), { takenMinor: 2900, refundedMinor: 0, heldMinor: 0, countedMinor: 2900, capMinor: 2900 });
});

test("a new month starts at zero", async () => {
  const w = await world();
  await pay(w, "o1", 200_000);
  assert.equal((await pay(w, "o2", 10_000)).fee, 0);
  w.tick(5 * DAY); // 2 November: the next billing month
  assert.equal((await pay(w, "o3", 10_000)).fee, 200);
  assert.equal((await w.month("2026-11-01")).takenMinor, 200);
  assert.equal((await w.month("2026-10-01")).takenMinor, 2900);
});

test("a checkout not paid yet holds its fee for two hours, so two at once can't both take the last of the cap", async () => {
  const w = await world();
  await pay(w, "o1", 100_000);
  await w.call("paymentIntents.create", card("o2", 100_000));
  assert.equal(feeSent(w), "900");
  await w.call("paymentIntents.create", card("o3", 100_000));
  assert.equal(feeSent(w), undefined, "o2's $9 is held");
  w.tick(3 * HOUR);
  await w.call("paymentIntents.create", card("o4", 100_000));
  assert.equal(feeSent(w), "900", "o2 was never paid, so its hold lapsed");
  assert.equal((await w.month()).heldMinor, 900, "o4 holds the rest");

  // A Checkout page that closes unpaid gives its hold back at once.
  const fresh = await world();
  const session = await fresh.call("checkout.sessions.create", { params: { line_items: [{ price_data: { currency: "cad", unit_amount: 5000, product_data: { name: "Moth Book" } }, quantity: 1 }] }, idempotencyKey: "o5-session" });
  assert.equal((await fresh.month()).heldMinor, 100);
  await fresh.event("checkout.session.expired", { id: session.body.id, object: "checkout.session" });
  assert.equal((await fresh.month()).heldMinor, 0);
});

test("refunds lower the month's total, and a refund in a later month gives back from the month the fee was taken", async () => {
  const w = await world();
  const first = await pay(w, "o1", 100_000);
  await pay(w, "o2", 100_000);
  // Half of o1 refunded: Stripe gives back half its fee (refund_application_fee), and the month's total drops by it.
  const refund = await w.call("refunds.create", { params: { payment_intent: first.id, amount: 51_000 }, idempotencyKey: "o1-refund-1" });
  assert.equal(w.stripe.requests.at(-1).params.refund_application_fee, "true");
  assert.equal(refund.status, 200);
  await w.event("charge.refunded", { id: "ch_o1", object: "charge", payment_intent: first.id, amount: 102_000, amount_refunded: 51_000 });
  assert.equal((await w.month()).countedMinor, 1900);
  assert.equal((await pay(w, "o3", 100_000)).fee, 1000, "the room the refund made");

  // In November, the rest of o1 is refunded: October's total drops, November's doesn't move.
  w.tick(5 * DAY);
  const nov = await pay(w, "o4", 10_000);
  assert.equal(nov.fee, 200);
  await w.event("charge.refunded", { id: "ch_o1", object: "charge", payment_intent: first.id, amount: 102_000, amount_refunded: 102_000 });
  assert.equal((await w.month("2026-10-01")).refundedMinor, 2000);
  assert.equal((await w.month("2026-11-01")).countedMinor, 200);
});

test("re-runs never count twice: the same checkout, the same payment event and the same refund event", async () => {
  const w = await world();
  const once = await w.call("paymentIntents.create", card("o1", 100_000));
  const twice = await w.call("paymentIntents.create", card("o1", 100_000));
  assert.equal(twice.body.id, once.body.id);
  assert.equal((await w.month()).heldMinor, 2000, "one hold for one checkout");
  for (let i = 0; i < 2; i += 1) await w.event("payment_intent.succeeded", { id: once.body.id, object: "payment_intent", application_fee_amount: 2000 }, "evt_same");
  for (let i = 0; i < 2; i += 1) await w.event("charge.refunded", { id: "ch_1", object: "charge", payment_intent: once.body.id, amount: 102_000, amount_refunded: 51_000 });
  assert.deepEqual(await w.month(), { takenMinor: 2000, refundedMinor: 1000, heldMinor: 0, countedMinor: 1000, capMinor: 2900 });
  // Every event still reaches the shop.
  assert.equal(w.delivered.length, 4);
});

test("a Checkout Session's fee counts once it is paid, and its payment's refunds find it", async () => {
  const w = await world();
  const lines = [
    { price_data: { currency: "cad", unit_amount: 40_000, product_data: { name: "Moth Book" } }, quantity: 2 },
    { price_data: { currency: "cad", unit_amount: 1500, product_data: { name: "Shipping & Handling" } }, quantity: 1 },
  ];
  const session = await w.call("checkout.sessions.create", { params: { line_items: lines, payment_intent_data: { metadata: { order_id: "o1" } } }, idempotencyKey: "o1-session" });
  assert.equal(w.stripe.requests.at(-1).params["payment_intent_data[application_fee_amount]"], "1600");
  await w.event("checkout.session.completed", { id: session.body.id, object: "checkout.session", payment_status: "paid", payment_intent: "pi_from_session" });
  assert.equal((await w.month()).takenMinor, 1600);
  await w.event("charge.refunded", { id: "ch_s", object: "charge", payment_intent: "pi_from_session", amount: 81_500, amount_refunded: 81_500 });
  assert.equal((await w.month()).countedMinor, 0);
});

test("no fee when it can't be counted safely: during the trial, in another currency, without a book total or a ledger", async () => {
  const trial = await world({ row: shopRow({ payAsYouSell: { ...TERMS, from: "2026-11-11T00:00:00.000Z" } }) });
  await trial.call("paymentIntents.create", card("o1", 100_000));
  assert.equal(feeSent(trial), undefined, "the 14-day trial is fee-free");

  const w = await world();
  await w.call("paymentIntents.create", card("o1", 100_000, { currency: "usd" }));
  assert.equal(feeSent(w), undefined);
  await w.call("paymentIntents.create", { params: { amount: 5000, currency: "cad" }, idempotencyKey: "o2-card" });
  assert.equal(feeSent(w), undefined);

  const noLedger = await world({ ledger: false });
  await noLedger.call("paymentIntents.create", card("o1", 100_000));
  assert.equal(feeSent(noLedger), undefined);

  // Pay as you sell replaces the usual per-order fee rather than adding to it.
  const both = await world({ env: { PLATFORM_FEE_BASIS_POINTS: "500" } });
  await both.call("paymentIntents.create", card("o1", 100_000));
  assert.equal(feeSent(both), "2000");
});

test("stockroom-only shops take no pay-as-you-sell fee, and a monthly shop keeps its usual fee", async () => {
  const stockroom = await world({ row: shopRow({ plan: "stockroom" }), env: { PLATFORM_FEE_BASIS_POINTS: "100" } });
  await stockroom.call("paymentIntents.create", card("o1", 100_000));
  assert.equal(feeSent(stockroom), "1020", "the usual 1% of the whole payment, as before");
  const monthly = await world({ row: shopRow({ payAsYouSell: null }) });
  await monthly.call("paymentIntents.create", card("o1", 100_000));
  assert.equal(feeSent(monthly), undefined);
});

// ── Square ───────────────────────────────────────────────────────────────────────────────────────────────────────

test("Square: the fee rides on the payment link within the cap, and the payment's events count and refund it", async () => {
  const SQUARE_HOOK = "https://payments.platform.example/square/events/test";
  const config = readServiceConfig({
    ...ENV, SQUARE_APPLICATION_ID_TEST: "sandbox-sq0idb-fakeTestApp", SQUARE_APPLICATION_SECRET_TEST: "sandbox-sq0csb-fakeTestSecret",
    SQUARE_WEBHOOK_URL_TEST: SQUARE_HOOK, SQUARE_WEBHOOK_SIGNATURE_KEY_TEST: "test-signature-key", SQUARE_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  });
  const sq = fakeSquareFetch({ apps: config.square.apps });
  const registry = fakeRegistry();
  await registry.createShop(SHOP, shopRow({ payments: { provider: "square", mode: "test" }, payAsYouSell: { ...TERMS, capMinor: 1000 } }));
  const store = fakeFeeLedgerStore();
  const service = createPaymentService({
    stripe: createStripeApi({ fetch: fakeStripeFetch().fetch, keys: config.keys }), registry, auditLog: fakeAuditLog(), accounts: fakeAccounts(), deliver: fakeDeliver().deliver, config,
    squareApi: createSquareApi({ fetch: sq.fetch, apps: config.square.apps }), tokens: fakeSquareTokens(), states: fakeSquareStates(), feeLedger: store, now: () => NOW,
  });
  const call = (op, args) => service.shopCall({ headers: { "X-Shop-Id": SHOP, Authorization: `Bearer ${KEY}` }, body: { op, mode: "test", args } });
  sq.world.addMerchant("MERCHANT1", "test");
  const link = await call("account.connectLink", { returnUrl: `https://${SHOP}.web.app/admin/settings/payments` });
  const code = "code-MERCHANT1";
  sq.world.codes.set(code, "MERCHANT1");
  await service.squareOAuth({ code, state: new URL(link.body.url).searchParams.get("state"), response_type: "code" });

  const checkout = (order, books) => call("square.checkout.create", {
    params: {
      referenceId: order, currency: "cad", redirectUrl: `https://${SHOP}.web.app/checkout?order_id=${order}`,
      lineItems: [{ name: "Moth Book", quantity: 1, unitAmountMinor: books }, { name: "Shipping & Handling", quantity: 1, unitAmountMinor: 1000 }],
    },
    idempotencyKey: `${order}-square`,
  });
  const appFee = () => sq.requests.filter((r) => r.path === "/v2/online-checkout/payment-links").at(-1).body.checkout_options.app_fee_money;
  const signedEvent = async (object, type, id) => {
    const body = JSON.stringify({ merchant_id: "MERCHANT1", type: `${type}.updated`, event_id: id, data: { type, id: object.id, object: { [type]: object } } });
    return service.squareEvent("test", { "X-Square-HmacSha256-Signature": squareSignature("test-signature-key", SQUARE_HOOK, body) }, body);
  };

  const made = await checkout("o1", 40_000);
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.deepEqual(appFee(), { amount: 800, currency: "CAD" }, "2% of the book, not the shipping");
  const payment = sq.world.pay(made.body.id);
  for (let i = 0; i < 2; i += 1) assert.equal((await signedEvent(payment, "payment", "e-pay")).status, 200);
  assert.equal(monthTotals(await store.get(SHOP, "2026-10-01"), NOW).takenMinor, 800);

  await checkout("o2", 40_000);
  assert.deepEqual(appFee(), { amount: 200, currency: "CAD" }, "only the $2 left under a $10 cap");

  await signedEvent({ id: "REF1", payment_id: payment.id, status: "COMPLETED", app_fee_money: { amount: 400, currency: "CAD" } }, "refund", "e-ref");
  await signedEvent({ id: "REF1", payment_id: payment.id, status: "COMPLETED", app_fee_money: { amount: 400, currency: "CAD" } }, "refund", "e-ref");
  assert.equal(monthTotals(await store.get(SHOP, "2026-10-01"), NOW).refundedMinor, 400);
});
