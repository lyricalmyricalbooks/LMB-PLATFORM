// The Square provider (code plan 2.2b): Square shops pay on Square's own page and every call goes through the
// platform's payment service. A pretend service answers the `square.*` calls in the service's shapes; the provider
// must answer the shop's callers in the interface's (Stripe-shaped) words. Nothing reaches Square.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { createPayments } = require("./index.js");
const ids = require("./ids.js");

const URL_ = "https://payments.platform.example";
const SHOP = "moth-press";
const KEY = "service-key-moth-press-0123456789abcdef0123";

// A pretend payment service for a Square shop connected in the Sandbox ("test"): live calls are refused as test-only.
function fakeService({ live = false } = {}) {
  const calls = [];
  const world = {
    checkouts: new Map(), payments: new Map(), refunds: new Map(), disputes: [],
    pay(linkId, fields = {}) {
      const link = world.checkouts.get(linkId);
      const payment = { id: `PAY${world.payments.size + 1}`, status: "COMPLETED", amountMinor: link.totalMinor, totalMinor: link.totalMinor, currency: "CAD", refundedMinor: 0, appFeeMinor: 0, orderId: `ORD-${linkId}`, referenceId: link.referenceId, refundIds: [], ...fields };
      world.payments.set(payment.id, payment);
      link.paymentIds = [payment.id];
      link.state = "COMPLETED";
      return payment;
    },
  };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const missing = () => reply(404, { error: { type: "square_error", code: "NOT_FOUND", message: "not found" } });
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (init.headers.Authorization !== `Bearer ${KEY}`) return reply(401, { error: { code: "unknown_shop" } });
    const connected = live ? "live" : "test";
    if (body.mode !== connected) return reply(body.mode === "live" ? 403 : 409, { error: { type: "platform_error", code: body.mode === "live" ? "test_only" : "not_connected", message: "elsewhere" } });
    const { op, args } = body;
    if (op === "square.checkout.create") {
      const totalMinor = args.params.lineItems.reduce((sum, line) => sum + line.unitAmountMinor * line.quantity, 0);
      const link = { id: `LNK${world.checkouts.size + 1}`, url: `https://square.link/u/${world.checkouts.size + 1}`, referenceId: args.params.referenceId, state: "OPEN", totalMinor, currency: args.params.currency.toUpperCase(), paymentIds: [], params: args.params, idempotencyKey: args.idempotencyKey };
      world.checkouts.set(link.id, link);
      return reply(200, { id: link.id, url: link.url, squareOrderId: `ORD-${link.id}` });
    }
    if (op === "square.checkout.retrieve") return world.checkouts.has(args.id) ? reply(200, { ...world.checkouts.get(args.id) }) : missing();
    if (op === "square.checkout.delete") {
      const link = world.checkouts.get(args.id);
      if (!link) return missing();
      link.state = "CANCELED";
      return reply(200, { id: args.id });
    }
    if (op === "square.payments.retrieve") return world.payments.has(args.id) ? reply(200, { ...world.payments.get(args.id) }) : missing();
    if (op === "square.refunds.create") {
      const payment = world.payments.get(args.params.paymentId);
      if (!payment) return missing();
      const refund = { id: `RFD${world.refunds.size + 1}`, status: args.params.reason === "reject me" ? "REJECTED" : "PENDING", amountMinor: args.params.amountMinor ?? payment.totalMinor - payment.refundedMinor, currency: "CAD", paymentId: payment.id, idempotencyKey: args.idempotencyKey };
      world.refunds.set(refund.id, refund);
      payment.refundIds = [...payment.refundIds, refund.id];
      return reply(200, refund);
    }
    if (op === "square.refunds.retrieve") return world.refunds.has(args.id) ? reply(200, { ...world.refunds.get(args.id) }) : missing();
    if (op === "square.refunds.forPayment") return reply(200, { data: [...world.refunds.values()].filter((r) => r.paymentId === args.paymentId) });
    if (op === "square.disputes.forPayment") return reply(200, { data: world.disputes.filter((d) => d.paymentId === args.paymentId) });
    if (op === "square.payouts.retrieve") return args.id === "po_1" ? reply(200, { id: "po_1", status: world.payoutStatus || "PAID", arrivalDate: "2026-10-31", amountMinor: 3814, currency: "CAD" }) : missing();
    return reply(400, { error: { code: "bad_request", message: `unknown call ${op}` } });
  };
  return { fetch, calls, world };
}

function fakeDb({ website = {}, orders = {} } = {}) {
  const docs = { "settings/website": website, ...Object.fromEntries(Object.entries(orders).map(([id, data]) => [`orders/${id}`, data])) };
  return {
    collection: (name) => ({ doc: (id) => ({ async get() {
      const data = docs[`${name}/${id}`];
      return { exists: data != null, data: () => data };
    } }) }),
  };
}

function make({ testMode = true, live = false, orders = {} } = {}) {
  const service = fakeService({ live });
  const db = fakeDb({ website: { payments: { testMode } }, orders });
  const payments = createPayments({
    provider: "square", mode: "platform", service: { url: URL_, shopId: SHOP, fetch: service.fetch, serviceKey: () => KEY },
    db, readAdminSecret: async () => ({}),
  });
  return { payments, service, db };
}

// What checkoutPayment.js hands createCheckoutSession (hosted path), trimmed to the fields that matter.
const sessionParams = (orderId = "order1") => ({
  line_items: [
    { price_data: { currency: "cad", product_data: { name: "Moth Book (Paperback)", images: [] }, unit_amount: 2000 }, quantity: 2 },
    { price_data: { currency: "cad", product_data: { name: "Shipping & Handling" }, unit_amount: 1000 }, quantity: 1 },
  ],
  mode: "payment",
  client_reference_id: orderId,
  customer_email: "reader@example.com",
  payment_intent_data: { metadata: { order_id: orderId } },
  expires_at: 1900000000,
  success_url: `https://${SHOP}.web.app/checkout?success=true&order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `https://${SHOP}.web.app/checkout?canceled=true`,
});

describe("saved ids", () => {
  test("Stripe's and Square's payments and checkouts are told apart by prefix", () => {
    expect(ids.isPaymentId("pi_1")).toBe(true);
    expect(ids.isPaymentId("sqpay_PAY1")).toBe(true);
    expect(ids.isPaymentId("sqpay_")).toBe(false);
    expect(ids.isPaymentId("PAY1")).toBe(false);
    expect(ids.isCheckoutId("cs_1")).toBe(true);
    expect(ids.isCheckoutId("sqlink_LNK1")).toBe(true);
    expect(ids.isCheckoutId(undefined)).toBe(false);
    expect(ids.squareIdOf("sqpay_PAY1")).toBe("PAY1");
    expect(ids.squareIdOf("sqlink_LNK1")).toBe("LNK1");
  });

  test("the guards, sweeps and safety net see Square orders as card orders", () => {
    const { refundProviderOf } = require("../paymentGuards.js");
    const { suspectOrders } = require("../paymentSweep.js");
    const { reversalWatched } = require("../stripeRecovery.js");
    expect(refundProviderOf({ stripePaymentIntentId: "sqpay_PAY1" })).toBe("stripe");
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(suspectOrders([{ paymentStatus: "unpaid", stripeCheckoutSessionId: "sqlink_LNK1", createdAt: "2026-10-28T11:00:00Z" }], now)).toHaveLength(1);
    expect(reversalWatched({ paymentStatus: "paid", stripePaymentIntentId: "sqpay_PAY1", paidAt: "2026-10-27T12:00:00Z" }, now)).toBe(true);
  });
});

describe("Square checkout", () => {
  test("the hosted checkout is a Square payment link with the shop's own priced lines", async () => {
    const { payments, service } = make();
    const card = await payments.forCheckout({ payments: { testMode: true } });
    const session = await card.createCheckoutSession(sessionParams(), { idempotencyKey: "cs-order1-cad-5000-h-1" });
    expect(session).toEqual({ id: "sqlink_LNK1", object: "checkout.session", url: "https://square.link/u/1", client_secret: null, status: "open", expires_at: 1900000000 });
    const [call] = service.calls;
    expect(call.op).toBe("square.checkout.create");
    expect(call.mode).toBe("test");
    expect(call.args).toEqual({
      params: {
        referenceId: "order1", currency: "cad", buyerEmail: "reader@example.com", note: "Order order1",
        lineItems: [{ name: "Moth Book (Paperback)", quantity: 2, unitAmountMinor: 2000 }, { name: "Shipping & Handling", quantity: 1, unitAmountMinor: 1000 }],
        redirectUrl: `https://${SHOP}.web.app/checkout?success=true&order_id=order1&square=1`,
      },
      idempotencyKey: "cs-order1-cad-5000-h-1",
    });
  });

  test("there is no card form on the shop's page and no embedded checkout", async () => {
    const { payments, service } = make();
    const card = await payments.forCheckout({ payments: { testMode: true } });
    await expect(card.createCardIntent({ amount: 100, currency: "cad", orderId: "o", idempotencyKey: "k" })).rejects.toMatchObject({ code: "card_form_unavailable" });
    await expect(card.createCheckoutSession({ ...sessionParams(), ui_mode: "embedded" }, { idempotencyKey: "k" })).rejects.toMatchObject({ code: "card_form_unavailable" });
    expect(service.calls).toHaveLength(0);
  });

  test("a live checkout on a Sandbox shop is refused, not sent to the Sandbox", async () => {
    const { payments } = make({ testMode: false });
    const card = await payments.forCheckout({ payments: { testMode: false } });
    await expect(card.createCheckoutSession(sessionParams(), { idempotencyKey: "k" })).rejects.toMatchObject({ code: "test_only" });
  });
});

describe("Square lookups", () => {
  test("the order's saved link reads as a session: open, then paid with its payment", async () => {
    const { payments, service } = make();
    const card = await payments.forCheckout({ payments: { testMode: true } });
    await card.createCheckoutSession(sessionParams(), { idempotencyKey: "k" });
    const order = { stripeMode: "test", stripeCheckoutSessionId: "sqlink_LNK1" };
    const open = await payments.findOrderPayment("order1", order, { sessionId: "sqlink_LNK1" });
    expect(open.session).toMatchObject({ id: "sqlink_LNK1", status: "open", payment_status: "unpaid", client_reference_id: "order1", amount_total: 5000, currency: "cad" });
    service.world.pay("LNK1");
    const paid = await payments.findOrderPayment("order1", order, { sessionId: "sqlink_LNK1" });
    expect(paid).toMatchObject({ mode: "test", session: { status: "complete", payment_status: "paid", payment_intent: "sqpay_PAY1", amount_total: 5000, livemode: false } });
    // Another order's link counts for nothing.
    expect(await payments.findOrderPayment("order2", order, { sessionId: "sqlink_LNK1" })).toBeNull();
    // A Stripe id is never sent to Square.
    expect(await payments.findOrderPayment("order1", order, { paymentIntentId: "pi_1" })).toBeNull();
  });

  test("a payment reads as an intent, with Square's states in Stripe's words", async () => {
    const { payments, service } = make();
    const card = await payments.forCheckout({ payments: { testMode: true } });
    await card.createCheckoutSession(sessionParams(), { idempotencyKey: "k" });
    service.world.pay("LNK1", { status: "PENDING" });
    const found = await payments.findOrderPayment("order1", { stripeMode: "test" }, { paymentIntentId: "sqpay_PAY1" });
    expect(found.intent).toEqual({ id: "sqpay_PAY1", object: "payment_intent", status: "processing", amount: 5000, amount_received: 0, currency: "cad", metadata: { order_id: "order1" }, livemode: false });
    expect(await card.settlePreviousIntent("sqpay_PAY1")).toBe("in_progress");
    service.world.payments.get("PAY1").status = "FAILED";
    expect(await card.settlePreviousIntent("sqpay_PAY1")).toBe("cleared");
  });

  test("cancelling an unpaid order deletes its open payment link", async () => {
    const { payments, service } = make();
    const card = await payments.forCheckout({ payments: { testMode: true } });
    await card.createCheckoutSession(sessionParams(), { idempotencyKey: "k" });
    const account = await payments.clientForMode("test");
    const found = await payments.readAttempt(account, { intentId: "", sessionId: "sqlink_LNK1" });
    expect(found.session.status).toBe("open");
    expect(await payments.stopAttempt(account, found)).toEqual(["checkout"]);
    expect(service.world.checkouts.get("LNK1").state).toBe("CANCELED");
    const again = await payments.readAttempt(account, { sessionId: "sqlink_LNK1" });
    expect(again.session.status).toBe("expired");
  });
});

describe("Square refunds and reversals", () => {
  async function paidOrder() {
    const app = make();
    const card = await app.payments.forCheckout({ payments: { testMode: true } });
    await card.createCheckoutSession(sessionParams(), { idempotencyKey: "k" });
    app.service.world.pay("LNK1");
    return { ...app, order: { stripeMode: "test", paymentStatus: "paid", stripePaymentIntentId: "sqpay_PAY1", stripeCheckoutSessionId: "sqlink_LNK1" } };
  }

  test("a refund goes to Square on the order's payment and comes back in the interface's words", async () => {
    const { payments, service } = await paidOrder();
    let called = false;
    const made = await payments.refund({ mode: "test", paymentIntentId: "sqpay_PAY1", amountMinor: 1500, metadata: { order_id: "order1", reason: "damaged" }, idempotencyKey: "order-refund-order1-partial", onCalling: () => { called = true; } });
    expect(called).toBe(true);
    expect(made).toEqual({ refundId: "RFD1", amountMinor: 1500, currency: "cad", status: "pending" });
    expect(service.calls.at(-1)).toMatchObject({ op: "square.refunds.create", mode: "test", args: { params: { paymentId: "PAY1", amountMinor: 1500, reason: "damaged" }, idempotencyKey: "order-refund-order1-partial" } });
    await expect(payments.refund({ mode: "test", paymentIntentId: "sqpay_PAY1", metadata: { reason: "reject me" }, idempotencyKey: "k2" })).rejects.toThrow(/Square refund was not accepted \(status: REJECTED\)/);
    await expect(payments.refund({ mode: "test", paymentIntentId: "pi_1", idempotencyKey: "k3" })).rejects.toThrow(/no Square payment/);
  });

  test("the safety net reads refunds and disputes as a charge", async () => {
    const { payments, service, order } = await paidOrder();
    await payments.refund({ mode: "test", paymentIntentId: "sqpay_PAY1", amountMinor: 1000, idempotencyKey: "a" });
    service.world.disputes.push({ id: "DSP1", state: "ACCEPTED", reason: "NO_KNOWLEDGE", amountMinor: 5000, currency: "CAD", paymentId: "PAY1", createdAt: "2026-10-28T12:00:00Z" });
    const seen = await payments.checkReversal("order1", order, {}, async (found) => ({ ...found, refunds: await found.listRefunds() }));
    expect(seen.charge).toEqual({ id: "sqpay_PAY1", object: "charge", amount: 5000, amount_refunded: 1000, refunded: false, disputed: true, currency: "cad", payment_intent: "sqpay_PAY1" });
    expect(seen.dispute).toEqual({ id: "DSP1", object: "dispute", status: "lost", amount: 5000, currency: "cad", reason: "no_knowledge", payment_intent: "sqpay_PAY1" });
    expect(seen.refunds).toEqual([{ id: "RFD1", object: "refund", amount: 1000, currency: "cad", status: "pending", payment_intent: "sqpay_PAY1" }]);
    // A refund Square rejected moved no money.
    service.world.refunds.get("RFD1").status = "REJECTED";
    const after = await payments.checkReversal("order1", order, {}, async (found) => ({ ...found, refunds: await found.listRefunds() }));
    expect(after.charge.amount_refunded).toBe(0);
    expect(after.refunds[0]).toMatchObject({ status: "canceled", failure_reason: "rejected by Square" });
    expect(await payments.checkReversal("order9", order, {}, async () => "applied")).toBeNull();
    expect(await payments.checkReversal("order1", { ...order, stripePaymentIntentId: "pi_1" }, {}, async () => "applied")).toBeNull();
  });
});

describe("Square webhook deliveries", () => {
  const delivery = (fields = {}) => JSON.stringify({ merchant_id: "MERCHANT1", type: "payment.updated", event_id: "6a8f5f28-54a1-4eb0-a98a-3111513fd4fc", data: { type: "payment", id: "PAY1", object: { payment: { id: "PAY1", status: "COMPLETED", amount_money: { amount: 1 } } } }, ...fields });

  async function paidShop() {
    const app = make({ orders: { order1: { stripeCheckoutSessionId: "sqlink_LNK1" } } });
    const card = await app.payments.forCheckout({ payments: { testMode: true } });
    await card.createCheckoutSession(sessionParams(), { idempotencyKey: "k" });
    return app;
  }

  test("a completed payment becomes the paid checkout the webhook knows, from Square's own record", async () => {
    const { payments, service } = await paidShop();
    service.world.pay("LNK1");
    const { event } = await payments.verifyWebhookEvent(await payments.webhookClient(), Buffer.from(delivery()), undefined, []);
    expect(event).toEqual({
      id: "sq_6a8f5f28-54a1-4eb0-a98a-3111513fd4fc", type: "checkout.session.completed", livemode: false,
      // The amount is Square's (5000), not the delivery's (1), and the order keeps its saved link.
      data: { object: { id: "sqlink_LNK1", client_reference_id: "order1", status: "complete", payment_status: "paid", payment_intent: "sqpay_PAY1", livemode: false, amount_total: 5000, currency: "cad", paid_at: null } },
    });
  });

  test("a delivery about a payment Square doesn't have, or no event at all, changes nothing", async () => {
    const { payments } = await paidShop();
    expect((await payments.verifyWebhookEvent(null, delivery())).event).toBeNull();
    expect((await payments.verifyWebhookEvent(null, "{}")).event).toBeNull();
    expect((await payments.verifyWebhookEvent(null, "not json")).event).toBeNull();
    expect((await payments.verifyWebhookEvent(null, delivery({ data: { type: "payment", id: "../x" } }))).event).toBeNull();
    expect((await payments.verifyWebhookEvent(null, delivery({ data: { type: "invoice", id: "INV1" } }))).event).toBeNull();
  });

  test("a payment not yet complete is recorded but marks nothing paid", async () => {
    const { payments, service } = await paidShop();
    service.world.pay("LNK1", { status: "APPROVED" });
    const { event } = await payments.verifyWebhookEvent(null, delivery());
    expect(event.type).toBe("square.payment.updated");
    expect(event.data.object.status).toBe("requires_capture");
  });

  test("refunds: a rejected one undoes the pending refund; any other updates the charge", async () => {
    const { payments, service } = await paidShop();
    service.world.pay("LNK1");
    await payments.refund({ mode: "test", paymentIntentId: "sqpay_PAY1", amountMinor: 5000, idempotencyKey: "r" });
    const refunded = await payments.verifyWebhookEvent(null, delivery({ type: "refund.updated", data: { type: "refund", id: "RFD1" } }));
    expect(refunded.event).toMatchObject({ type: "charge.refunded", data: { object: { payment_intent: "sqpay_PAY1", amount_refunded: 5000, refunded: true } } });
    service.world.refunds.get("RFD1").status = "FAILED";
    const failed = await payments.verifyWebhookEvent(null, delivery({ type: "refund.updated", data: { type: "refund", id: "RFD1" } }));
    expect(failed.event).toMatchObject({ type: "charge.refund.updated", data: { object: { id: "RFD1", status: "failed", payment_intent: "sqpay_PAY1" } } });
  });

  test("a paid payout is fetched from Square again and becomes payout.paid; any other payout state changes nothing (7.10)", async () => {
    const { payments, service } = await paidShop();
    const payoutDelivery = (type = "payout.paid", id = "po_1") => delivery({ type, data: { type: "payout", id, object: { payout: { id, status: "PAID" } } } });
    expect((await payments.verifyWebhookEvent(null, payoutDelivery())).event).toMatchObject({
      type: "payout.paid", livemode: false, data: { object: { id: "po_1", object: "payout", status: "paid", arrival_date: "2026-10-31" } },
    });
    service.world.payoutStatus = "SENT";
    expect((await payments.verifyWebhookEvent(null, payoutDelivery())).event.type).toBe("square.payout.updated");
    expect((await payments.verifyWebhookEvent(null, payoutDelivery("payout.paid", "po_nobody"))).event).toBeNull();
  });

  test("disputes: only one Square lists for that payment counts; closed states close it", async () => {
    const { payments, service } = await paidShop();
    service.world.pay("LNK1");
    service.world.disputes.push({ id: "DSP1", state: "EVIDENCE_REQUIRED", reason: "NOT_AS_DESCRIBED", amountMinor: 5000, currency: "CAD", paymentId: "PAY1" });
    const disputeDelivery = (type, id = "DSP1", paymentId = "PAY1") => delivery({ type, data: { type: "dispute", id, object: { dispute: { id, disputed_payment: { payment_id: paymentId } } } } });
    expect((await payments.verifyWebhookEvent(null, disputeDelivery("dispute.created"))).event).toMatchObject({ type: "charge.dispute.created", data: { object: { status: "needs_response", payment_intent: "sqpay_PAY1" } } });
    service.world.disputes[0].state = "LOST";
    expect((await payments.verifyWebhookEvent(null, disputeDelivery("dispute.state.updated"))).event).toMatchObject({ type: "charge.dispute.closed", data: { object: { status: "lost", amount: 5000 } } });
    expect((await payments.verifyWebhookEvent(null, disputeDelivery("dispute.created", "DSP9"))).event).toBeNull();
    expect((await payments.verifyWebhookEvent(null, disputeDelivery("dispute.created", "DSP1", "PAY9"))).event).toBeNull();
  });
});

describe("Square shop admin", () => {
  test("no key to check, no webhook endpoints of its own, no payment domains", async () => {
    const { payments } = make();
    expect(payments.provider).toBe("square");
    expect(payments.deployedLiveKey()).toBe("");
    expect((await payments.checkKey("sk_test_x")).ok).toBe(false);
    expect(await payments.webhookEndpoints()).toEqual({ mode: "test", endpoints: null });
    await expect(payments.registerPaymentDomain("shop.example")).rejects.toThrow(/Square's own address/);
    expect(await payments.readKeys()).toMatchObject({ testMode: true });
  });

  test("the functions load for a Square shop on the platform", () => {
    const { execFileSync } = require("node:child_process");
    const dir = fileURLToPath(new URL("..", import.meta.url));
    const out = execFileSync(process.execPath, ["-e", "const f = require('./index.js'); process.stdout.write(String(Object.keys(f).length))"], {
      cwd: dir, env: { ...process.env, SHOP_PAYMENT_PROVIDER: "square", SHOP_PAYMENT_MODE: "platform", SHOP_PAYMENTS_SERVICE_URL: URL_ }, stdio: ["ignore", "pipe", "pipe"],
    });
    expect(Number(String(out))).toBeGreaterThan(20);
  }, 30000);
});
