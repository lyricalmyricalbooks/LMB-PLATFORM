// Square payment pages close when their stock hold ends, and a payment made after that is refunded in full (code plan
// 5.1, paymentPages.js). A pretend platform payment service answers the Square calls; nothing reaches Square.
import { describe, expect, test } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createPayments } = require("./payments/index.js");
const { createPaymentPages, openedPage, paidAfterHold, LATE_REASON, GIVE_UP_MS } = require("./paymentPages.js");

const SHOP = "moth-press";
const KEY = "service-key-moth-press-0123456789abcdef0123";
const T0 = Date.parse("2026-10-28T12:00:00Z");
const MIN = 60 * 1000;

// The platform's payment service for a Square shop connected in the Sandbox.
function fakeService() {
  const calls = [];
  const world = {
    links: new Map(), payments: new Map(), refunds: new Map(), refuseRefunds: false,
    pay(linkId, createdAt) {
      const link = world.links.get(linkId);
      const payment = { id: `PAY${world.payments.size + 1}`, status: "COMPLETED", amountMinor: link.totalMinor, totalMinor: link.totalMinor, currency: "CAD", refundedMinor: 0, appFeeMinor: 0, referenceId: link.referenceId, refundIds: [], createdAt: new Date(createdAt).toISOString() };
      world.payments.set(payment.id, payment);
      link.paymentIds = [payment.id];
      link.state = "COMPLETED";
      return payment;
    },
  };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const missing = () => reply(404, { error: { type: "square_error", code: "NOT_FOUND", message: "not found" } });
  const fetch = async (_url, init) => {
    const { op, mode, args } = JSON.parse(init.body);
    calls.push({ op, mode, args });
    if (mode !== "test") return reply(403, { error: { type: "platform_error", code: "test_only", message: "test only" } });
    if (op === "square.checkout.create") {
      const totalMinor = args.params.lineItems.reduce((sum, l) => sum + l.unitAmountMinor * l.quantity, 0);
      const link = { id: `LNK${world.links.size + 1}`, url: "https://square.link/u/1", referenceId: args.params.referenceId, state: "OPEN", totalMinor, currency: "CAD", paymentIds: [] };
      world.links.set(link.id, link);
      return reply(200, { id: link.id, url: link.url });
    }
    if (op === "square.checkout.retrieve") return world.links.has(args.id) ? reply(200, { ...world.links.get(args.id) }) : missing();
    if (op === "square.checkout.delete") {
      if (!world.links.has(args.id)) return missing();
      if (world.failDeletes) return reply(502, { error: { type: "square_error", code: "SERVICE_UNAVAILABLE", message: "Square is busy" } });
      world.links.get(args.id).state = "CANCELED";
      return reply(200, { id: args.id });
    }
    if (op === "square.payments.retrieve") return world.payments.has(args.id) ? reply(200, { ...world.payments.get(args.id) }) : missing();
    if (op === "square.refunds.create") {
      if (world.refuseRefunds) return reply(502, { error: { type: "square_error", code: "SERVICE_UNAVAILABLE", message: "Square is busy" } });
      const payment = world.payments.get(args.params.paymentId);
      if (!payment) return missing();
      const existing = [...world.refunds.values()].find((r) => r.idempotencyKey === args.idempotencyKey);
      if (existing) return reply(200, existing);
      const amountMinor = args.params.amountMinor ?? payment.totalMinor - payment.refundedMinor;
      const refund = { id: `RFD${world.refunds.size + 1}`, status: "PENDING", amountMinor, currency: "CAD", paymentId: payment.id, idempotencyKey: args.idempotencyKey, reason: args.params.reason };
      world.refunds.set(refund.id, refund);
      payment.refundedMinor += amountMinor;
      return reply(200, refund);
    }
    return reply(400, { error: { code: "bad_request", message: `unknown call ${op}` } });
  };
  return { fetch, calls, world };
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Firestore enough for the module: docs, dotted-path updates, one-field queries and transactions.
function fakeDb(seed) {
  const docs = clone(seed);
  const setPath = (target, path, value) => {
    const parts = path.split(".");
    let at = target;
    for (const part of parts.slice(0, -1)) at = at[part] ||= {};
    at[parts.at(-1)] = value;
  };
  const apply = (name, id, data) => { for (const [k, v] of Object.entries(data)) setPath(docs[name][id], k, v); };
  const ref = (name, id) => ({ name, id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, id, data: () => clone(data) }; },
    async update(data) { apply(name, id, data); },
  });
  const matches = (data, field, op, value) => {
    const v = data[field];
    if (op === "==") return v === value;
    if (op === "<=") return typeof v === "string" && v <= value;
    throw new Error(`unsupported ${op}`);
  };
  const db = {
    docs,
    collection: (name) => ({
      doc: (id) => ref(name, id),
      where: (field, op, value) => ({ limit: () => ({ async get() {
        const found = Object.entries(docs[name] || {}).filter(([, data]) => matches(data, field, op, value));
        return { docs: found.map(([id, data]) => ({ id, data: () => clone(data) })) };
      } }) }),
    }),
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), update: (r, data) => apply(r.name, r.id, data) });
    },
  };
  return db;
}

const ITEMS = [{ id: "moth-book", quantity: 1, price: 40 }];

function make({ order = {} } = {}) {
  const service = fakeService();
  const db = fakeDb({
    settings: { website: { payments: { testMode: true } } },
    orders: { order1: { paymentStatus: "unpaid", status: "pending_payment", stripeMode: "test", items: ITEMS, activity: [], customer: { email: "reader@example.com", name: "Reader" }, ...order } },
    books: { "moth-book": { stockLevel: 1, trackInventory: true } },
  });
  const payments = createPayments({
    provider: "square", mode: "platform", service: { url: "https://payments.platform.example", shopId: SHOP, fetch: service.fetch, serviceKey: () => KEY },
    db, readAdminSecret: async () => ({}),
  });
  const released = [];
  const emails = [];
  let nowMs = T0;
  const pages = createPaymentPages({
    db, payments,
    releaseStock: async (_db, orderId, items) => { released.push({ orderId, items }); },
    sendLateRefundEmail: async (orderId, current, refund) => { emails.push({ orderId, to: current.customer.email, ...refund }); },
    now: () => nowMs,
  });
  return { service, db, payments, pages, released, emails, at: (ms) => { nowMs = ms; } };
}

// Opens a Square page for order1 the way checkoutPayment.js does, at T0 (closing 31 minutes later, like Stripe's).
async function openPage(app) {
  const card = await app.payments.forCheckout({ payments: { testMode: true } });
  const session = await card.createCheckoutSession({
    line_items: [{ price_data: { currency: "cad", product_data: { name: "Moth Book" }, unit_amount: 4000 }, quantity: 1 }],
    mode: "payment", client_reference_id: "order1", customer_email: "reader@example.com",
    expires_at: Math.floor(T0 / 1000) + 31 * 60,
    success_url: `https://${SHOP}.web.app/checkout?success=true&order_id=order1&session_id={CHECKOUT_SESSION_ID}`,
  }, { idempotencyKey: "cs-order1" });
  const order = (await app.db.collection("orders").doc("order1").get()).data();
  await app.db.collection("orders").doc("order1").update({ stripeCheckoutSessionId: session.id, ...openedPage(order, session, T0) });
  return session;
}

// The paid checkout the webhook gets for Square's payment (payments/square.js, from Square's own record).
async function paidEvent(app, paymentId) {
  const delivery = JSON.stringify({ merchant_id: "M1", type: "payment.updated", event_id: `evt-${paymentId}`, data: { type: "payment", id: paymentId } });
  const { event } = await app.payments.verifyWebhookEvent(await app.payments.webhookClient(), Buffer.from(delivery));
  return event.data.object;
}

const order = (app) => app.db.docs.orders.order1;

describe("a Square page closes when its stock hold ends", () => {
  test("a Square page records when it closes; a Stripe session records nothing", async () => {
    const app = make();
    const session = await openPage(app);
    expect(session.expires_at).toBe(Math.floor(T0 / 1000) + 31 * 60);
    expect(order(app)).toMatchObject({
      paymentPages: [{ id: "sqlink_LNK1", closesAt: "2026-10-28T12:31:00.000Z" }],
      paymentPageClosesAt: "2026-10-28T12:31:00.000Z",
      paymentPageCloseDue: "2026-10-28T12:31:00.000Z",
    });
    expect(openedPage({}, { id: "cs_test_1", expires_at: 1 })).toBeNull();
  });

  test("before the hold ends nothing is closed; after it, the link is cancelled and the hold released", async () => {
    const app = make();
    await openPage(app);
    app.at(T0 + 20 * MIN);
    expect(await app.pages.closeDuePages()).toMatchObject({ checked: 0, closed: 0 });
    expect(app.service.calls.some((c) => c.op === "square.checkout.delete")).toBe(false);

    app.at(T0 + 33 * MIN);
    expect(await app.pages.closeDuePages()).toMatchObject({ checked: 1, closed: 1 });
    expect(app.service.calls.filter((c) => c.op === "square.checkout.delete")).toEqual([{ op: "square.checkout.delete", mode: "test", args: { id: "LNK1" } }]);
    expect(app.service.world.links.get("LNK1").state).toBe("CANCELED");
    expect(order(app).paymentPages[0]).toMatchObject({ closed: "closed", closedAt: "2026-10-28T12:33:00.000Z" });
    expect(order(app).paymentPageCloseDue).toBeNull();
    expect(order(app).activity.at(-1).message).toMatch(/payment page closed because the 30-minute hold on the books ended/);
    expect(app.released).toEqual([{ orderId: "order1", items: ITEMS }]);
    // The order is still unpaid and its stock untouched.
    expect(order(app).paymentStatus).toBe("unpaid");
    expect(app.db.docs.books["moth-book"].stockLevel).toBe(1);

    // A second run finds nothing left to close.
    app.at(T0 + 40 * MIN);
    expect(await app.pages.closeDuePages()).toMatchObject({ checked: 0, closed: 0 });
  });

  test("a page someone already paid on is left for the payment's event, and keeps its hold", async () => {
    const app = make();
    await openPage(app);
    app.service.world.pay("LNK1", T0 + 10 * MIN);
    app.at(T0 + 33 * MIN);
    expect(await app.pages.closeDuePages()).toMatchObject({ checked: 1, closed: 0 });
    expect(app.service.calls.some((c) => c.op === "square.checkout.delete")).toBe(false);
    expect(order(app).paymentPages[0].closed).toBe("paid");
    expect(app.released).toEqual([]);
  });

  test("a page that can't be closed is tried again, then left with a note after a day", async () => {
    const app = make();
    await openPage(app);
    app.service.world.failDeletes = true;
    app.at(T0 + 33 * MIN);
    expect(await app.pages.closeDuePages()).toMatchObject({ checked: 1, closed: 0 });
    expect(order(app).paymentPages[0].closedAt).toBeUndefined();
    expect(order(app).paymentPageCloseDue).toBe("2026-10-28T12:31:00.000Z");
    expect(app.released).toEqual([]);

    app.at(T0 + 38 * MIN);
    await app.pages.closeDuePages();
    expect(app.service.calls.filter((c) => c.op === "square.checkout.delete")).toHaveLength(2);

    app.at(T0 + 31 * MIN + GIVE_UP_MS + MIN);
    await app.pages.closeDuePages();
    expect(order(app).paymentPages[0].closed).toBe("gave_up");
    expect(order(app).paymentPageCloseDue).toBeNull();
    expect(order(app).activity.at(-1).message).toMatch(/couldn't be closed[\s\S]*refunded in full automatically/);
  });
});

describe("a Square payment made after the hold ended", () => {
  test("is refunded in full, never marked paid, stock untouched, and the shopper told once", async () => {
    const app = make();
    await openPage(app);
    const payment = app.service.world.pay("LNK1", T0 + 34 * MIN);
    const session = await paidEvent(app, payment.id);
    expect(session.paid_at).toBe("2026-10-28T12:34:00.000Z");
    expect(paidAfterHold(order(app), session)).toBe(true);

    app.at(T0 + 35 * MIN);
    expect(await app.pages.refundLatePayment("order1", session)).toMatchObject({ refunded: true, refundId: "RFD1" });
    const refunds = app.service.calls.filter((c) => c.op === "square.refunds.create");
    expect(refunds).toEqual([{ op: "square.refunds.create", mode: "test", args: { params: { paymentId: payment.id, reason: LATE_REASON }, idempotencyKey: `late-order1-sqpay_${payment.id}` } }]);
    expect(app.service.world.refunds.get("RFD1").amountMinor).toBe(4000);

    const o = order(app);
    expect(o.paymentStatus).toBe("unpaid");
    expect(o.inventoryDecrementedAt).toBeUndefined();
    expect(app.db.docs.books["moth-book"].stockLevel).toBe(1);
    expect(o).toMatchObject({
      stripePaymentIntentId: `sqpay_${payment.id}`,
      paymentMismatch: { paidAfterHold: true, provider: "square", paymentIntentId: `sqpay_${payment.id}` },
      lateRefundPending: false,
    });
    expect(o.latePayments[`sqpay_${payment.id}`]).toMatchObject({ refundId: "RFD1", refundStatus: "pending", amountMinor: 4000, paidAt: "2026-10-28T12:34:00.000Z" });
    expect(o.activity.map((a) => a.message).join("\n")).toMatch(/arrived after the hold on the books had ended[\s\S]*refunded in full automatically \(40\.00 CAD\)/);
    expect(app.emails).toEqual([{ orderId: "order1", to: "reader@example.com", amountMinor: 4000, currency: "cad", paymentIntentId: `sqpay_${payment.id}` }]);

    // The same event again (a redelivery) refunds nothing more and emails nobody.
    expect(await app.pages.refundLatePayment("order1", session)).toMatchObject({ refunded: false, already: true });
    expect(app.service.calls.filter((c) => c.op === "square.refunds.create")).toHaveLength(1);
    expect(app.emails).toHaveLength(1);
  });

  test("a payment made in time is not late, even when its event arrives after the page closed", async () => {
    const app = make();
    await openPage(app);
    const payment = app.service.world.pay("LNK1", T0 + 29 * MIN);
    app.at(T0 + 3 * 60 * MIN);
    expect(paidAfterHold(order(app), await paidEvent(app, payment.id))).toBe(false);
    // Orders without a Square page, paid ones and cancelled ones are never "late" here.
    const late = { paid_at: "2030-01-01T00:00:00.000Z" };
    expect(paidAfterHold({ paymentStatus: "unpaid" }, late)).toBe(false);
    expect(paidAfterHold({ paymentStatus: "paid", paymentPageClosesAt: "2026-10-28T12:31:00.000Z" }, late)).toBe(false);
    expect(paidAfterHold({ status: "cancelled", paymentPageClosesAt: "2026-10-28T12:31:00.000Z" }, late)).toBe(false);
    expect(paidAfterHold({ paymentStatus: "unpaid", paymentPageClosesAt: "2026-10-28T12:31:00.000Z" }, {})).toBe(false);
  });

  test("a refund Square refuses is recorded, retried by the sweep, and made once", async () => {
    const app = make();
    await openPage(app);
    const payment = app.service.world.pay("LNK1", T0 + 34 * MIN);
    const session = await paidEvent(app, payment.id);
    app.service.world.refuseRefunds = true;
    await expect(app.pages.refundLatePayment("order1", session)).rejects.toThrow();
    const key = `sqpay_${payment.id}`;
    expect(order(app).lateRefundPending).toBe(true);
    expect(order(app).latePayments[key].refundError).toMatch(/busy/);
    expect(app.emails).toEqual([]);

    app.service.world.refuseRefunds = false;
    app.at(T0 + 40 * MIN);
    expect(await app.pages.closeDuePages()).toMatchObject({ refunded: 1 });
    expect(order(app).lateRefundPending).toBe(false);
    expect(order(app).latePayments[key]).toMatchObject({ refundId: "RFD1", refundError: null });
    expect(app.emails).toHaveLength(1);
    // The activity says once that it was late.
    expect(order(app).activity.filter((a) => /arrived after the hold/.test(a.message))).toHaveLength(1);
    expect(order(app).paymentStatus).toBe("unpaid");
    expect(GIVE_UP_MS).toBe(24 * 60 * MIN);
  });
});
