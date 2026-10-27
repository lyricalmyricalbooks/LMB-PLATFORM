import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const { refundPlan, restockLinesFor, withoutRestocked, chargedOf } = require("./partialRefund");
const { returnTransition } = require("./returns");
const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");

const base = { paymentStatus: "paid", total: 60, items: [{ id: "a", quantity: 2, format: "Paperback", price: 20 }, { id: "b", quantity: 1, format: "Paperback", price: 20 }, { id: "e", quantity: 1, format: "E-book (EPUB)", price: 5 }] };

test("plans: partial below what is left, full at it, refused above it", () => {
  expect(refundPlan(base, null).kind).toBe("full");
  expect(refundPlan(base, 1000)).toMatchObject({ kind: "partial", amountMinor: 1000, already: 0, remaining: 6000 });
  expect(refundPlan({ ...base, refundedAmountMinor: 1000 }, 5000).kind).toBe("full");
  expect(() => refundPlan({ ...base, refundedAmountMinor: 1000 }, 5001)).toThrow("at most 50.00");
  for (const bad of [0, -5, 1.5, "x"]) expect(() => refundPlan(base, bad)).toThrow();
  expect(chargedOf({ ...base, expectedAmountMinor: 4400, expectedCurrency: "usd" })).toEqual({ minor: 4400, currency: "USD" });
});

test("restock lines: printed books only, never more copies than are left", () => {
  expect(restockLinesFor(base, [{ index: 0, quantity: 1 }])).toEqual([{ index: 0, id: "a", variantId: null, quantity: 1 }]);
  expect(() => restockLinesFor(base, [{ index: 2, quantity: 1 }])).toThrow("not a printed book");
  expect(() => restockLinesFor(base, [{ index: 0, quantity: 3 }])).toThrow("Only 2");
  expect(() => restockLinesFor({ ...base, partialRestockedItems: [{ index: 0, id: "a", quantity: 2 }] }, [{ index: 0, quantity: 1 }])).toThrow("Only 0");
  expect(() => restockLinesFor(base, [{ index: 9, quantity: 1 }])).toThrow();
  expect(withoutRestocked(base.items, { partialRestockedItems: [{ id: "a", variantId: null, quantity: 1 }] })[0].quantity).toBe(1);
});

test("partial returns: fewer copies than ordered, at least one back", () => {
  const order = { ...base, customerRequest: { type: "return", status: "open" } };
  const received = { state: "received" };
  const next = returnTransition(order, received, "inspected", { inspection: [{ index: 0, quantity: 1, condition: "resellable" }, { index: 1, quantity: 0 }] }, "now", "admin");
  expect(next.inspection[1]).toMatchObject({ quantity: 0, condition: "not_returned", restockQuantity: 0 });
  expect(() => returnTransition(order, received, "inspected", { inspection: [{ index: 0, quantity: 0 }, { index: 1, quantity: 0 }] }, "now", "admin")).toThrow("at least one");
  expect(() => returnTransition(order, received, "inspected", { inspection: [{ index: 0, quantity: 3, condition: "resellable" }, { index: 1, quantity: 0 }] }, "now", "admin")).toThrow();
});

function harness() {
  const docs = {
    orders: { A: { paymentStatus: "paid", paymentMethod: "Stripe", stripePaymentIntentId: "pi_saved", total: 60, expectedAmountMinor: 6000, expectedCurrency: "CAD", items: [{ id: "a", quantity: 2, format: "Paperback", price: 20 }, { id: "b", quantity: 1, format: "Paperback", price: 20 }] } },
    books: { a: { status: "published", trackInventory: true, stockLevel: 3 }, b: { status: "published", trackInventory: true, stockLevel: 3 } },
    settings: { website: {} }, adminSecrets: { stripe: { secretKey: "sk_live_fake" } },
  };
  const refunds = [];
  const db = { collection(name) { return {
    doc(id) { return { path: `${name}/${id}`, async get() { const value = docs[name]?.[id]; return { id, exists: !!value, data: () => value ? structuredClone(value) : undefined }; }, async update(change) { Object.assign(docs[name]?.[id] || {}, change); }, async set(value, options) { docs[name] ||= {}; docs[name][id] = options?.merge ? { ...(docs[name][id] || {}), ...value } : value; } }; },
    async get() { return { docs: [] }; },
  }; }, async runTransaction(fn) { const queued = []; const result = await fn({ get: ref => ref.get(), update: (ref, value) => queued.push(() => ref.update(value)), set: (ref, value) => queued.push(() => ref.set(value)) }); for (const apply of queued) await apply(); return result; } };
  const firestore = () => db; firestore.FieldValue = { increment: value => value };
  const admin = { initializeApp() {}, firestore, auth: () => ({ verifyIdToken: async () => ({ email: "lyricalmyricalbooks@gmail.com", email_verified: true }) }) };
  class Stripe { constructor() { this.refunds = { create: async (params, opts) => { refunds.push({ params, opts }); const left = 6000 - (docs.orders.A.refundedAmountMinor || 0); return { id: `re_${refunds.length}`, amount: params.amount ?? left, currency: "cad", status: "succeeded" }; } }; } }
  const wrap = (...args) => args.at(-1);
  const mockRequire = name => name === "firebase-admin" ? admin : name === "stripe" ? Stripe : name.startsWith("firebase-functions/v2/") ? new Proxy({}, { get: () => wrap }) : name === "firebase-functions/params" ? { defineSecret: () => ({ value: () => "fake" }) } : name === "./rateLimit" ? { ...require(name), hitLimit: async () => true } : require(name);
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: "off" } }, Buffer, console, URL, setTimeout, clearTimeout, AbortController }, { filename: "index.js" });
  const call = async body => { const response = { code: 200, body: null, set() {}, status(code) { this.code = code; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } }; await module.exports.refundOrder({ method: "POST", headers: { authorization: "Bearer t" }, body: { orderId: "A", ...body } }, response); return response; };
  return { docs, refunds, call };
}

test("a Stripe partial refund keeps the order paid, restocks only ticked lines, then a full refund finishes it", async () => {
  const app = harness();
  const first = await app.call({ amountMinor: 2000, restockLines: [{ index: 0, quantity: 1 }], reason: "Damaged" });
  expect(first.code).toBe(200);
  expect(app.refunds[0].params.amount).toBe(2000);
  expect(app.refunds[0].opts.idempotencyKey).toBe("order-refund-A-partial-0-2000");
  const o = app.docs.orders.A;
  expect(o).toMatchObject({ paymentStatus: "paid", partiallyRefunded: true, refundedAmountMinor: 2000, refundRequest: null });
  expect(app.docs.books.a.stockLevel).toBe(4);
  expect(app.docs.books.b.stockLevel).toBe(3);
  // Never more than what is left.
  expect((await app.call({ amountMinor: 4001 })).code).toBe(409);
  // The rest: today's full refund, without restocking the copy already back.
  const rest = await app.call({ restock: true });
  expect(rest.code).toBe(200);
  expect(app.refunds[1].params.amount).toBeUndefined();
  expect(app.docs.orders.A.paymentStatus).toBe("refunded");
  expect(app.docs.orders.A.refundedAmountMinor).toBe(6000);
  expect(app.docs.books.a.stockLevel).toBe(5);
  expect(app.docs.books.b.stockLevel).toBe(4);
});

test("a partial refund with nothing ticked never restocks; manual orders only record it", async () => {
  const app = harness();
  delete app.docs.orders.A.stripePaymentIntentId; app.docs.orders.A.paymentMethod = "e-Transfer"; delete app.docs.orders.A.expectedAmountMinor;
  expect((await app.call({ amountMinor: 500 })).code).toBe(200);
  expect(app.refunds).toEqual([]);
  expect(app.docs.orders.A).toMatchObject({ paymentStatus: "paid", refundedAmountMinor: 500 });
  expect(app.docs.books.a.stockLevel).toBe(3);
});

test("a refund request in the wrong shape is refused before anything is touched (src/shared/orderActions.ts)", async () => {
  const app = harness();
  for (const body of [{ amountMinor: "20" }, { restock: "yes" }, { restockLines: "all" }, { orderId: "orders/A" }, { amountMinor: 20.5 }]) {
    const res = await app.call(body);
    expect(res.code, JSON.stringify(body)).toBe(400);
    expect(res.body.code).toBe("bad_request");
  }
  expect(app.refunds).toEqual([]);
  expect(app.docs.orders.A.paymentStatus).toBe("paid");
  // What the admin sends today still works, extra keys included.
  expect((await app.call({ reason: "Damaged", restock: false, amountMinor: null, restockLines: null, extra: 1 })).code).toBe(200);
});
