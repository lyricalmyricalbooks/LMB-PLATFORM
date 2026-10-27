// A label purchase claims a lock (order-operations.labelPurchasePending) so a retry can't buy
// two labels. A definite Shippo refusal (status ERROR) must release it and show Shippo's reasons;
// an uncertain failure keeps it until the owner checks Shippo and clears it (admin-only, logged).
import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const { addressKey, packingKey, shippoTransactionOutcome } = require("./fulfillmentGuard.js");

const ADMIN = { email: "lyricalmyricalbooks@gmail.com", email_verified: true };

function harness({ transaction, identity = ADMIN, pending = false, shippoOrder, refuseLinked = false, orderPatch = {}, opsPatch = {}, shippo } = {}) {
  const order = { orderId: "AB-1", paymentStatus: "paid", status: "processing", customer: { name: "Reader", email: "reader@example.com", address: { street: "1 Main", city: "Toronto", state: "ON", zip: "M1M1M1", country: "CA" } }, items: [{ id: "b", title: "Book", quantity: 1, format: "Paperback" }] };
  const ops = { addressReviewed: addressKey(order), packed: packingKey(order), quotedShipmentId: "sh_1", quotedAddress: JSON.stringify(order.customer.address), ...(pending ? { labelPurchasePending: true, labelPurchaseStartedAt: "2026-10-01T00:00:00.000Z" } : {}) };
  Object.assign(order, orderPatch);
  Object.assign(ops, opsPatch);
  const docs = { orders: { A: order }, "order-operations": { A: ops }, settings: { website: {} } };
  const merge = (target, data) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && v.__arrayUnion) target[k] = [...(target[k] || []), ...v.__arrayUnion];
      else target[k] = v;
    }
  };
  const ref = (name, id) => ({
    path: `${name}/${id}`,
    async get() { const value = docs[name]?.[id]; return { id, exists: !!value, data: () => value }; },
    async set(data, opts) { docs[name] = docs[name] || {}; if (opts?.merge && docs[name][id]) merge(docs[name][id], data); else { docs[name][id] = {}; merge(docs[name][id], data); } },
    async update(data) { merge(docs[name][id], data); },
  });
  const db = {
    collection: name => ({ doc: id => ref(name, id), add: async () => {} }),
    async runTransaction(fn) { return fn({ get: r => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d) }); },
  };
  const FieldValue = { arrayUnion: (...items) => ({ __arrayUnion: items }), increment: n => n, serverTimestamp: () => "now", delete: () => undefined };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue }), auth: () => ({ verifyIdToken: async () => identity }), appCheck: () => ({ verifyToken: async () => ({}) }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = name => name === "firebase-admin" ? admin
    : name === "stripe" ? class {}
    : name.startsWith("firebase-functions/v2/") ? new Proxy({}, { get: () => wrap })
    : name === "firebase-functions/params" ? { defineSecret: () => ({ value: () => "shippo_live_token" }) }
    : require(name);
  const shippoCalls = [];
  const fetch = async (url, init = {}) => {
    shippoCalls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    if (shippo) { const answer = shippo(String(url), init); if (answer) return answer; }
    if (String(url).endsWith("/orders/") && shippoOrder) return { ok: true, json: async () => shippoOrder };
    if (String(url).includes("shipments/sh_1")) return { ok: true, json: async () => ({ rates: [{ object_id: "r1", provider: "Canada Post", amount: "12.00" }] }) };
    if (String(url).includes("transactions/")) {
      if (transaction instanceof Error) throw transaction;
      if (refuseLinked && JSON.parse(init.body).order) return { ok: false, status: 400, text: async () => "order is invalid" };
      return { ok: true, json: async () => transaction };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: "off" } }, Buffer, console, URL, setTimeout, clearTimeout, AbortController, fetch }, { filename: "index.js" });
  const call = async body => {
    const res = { code: 200, body: null, set() {}, status(code) { this.code = code; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
    await module.exports.createShippingLabel({ method: "POST", headers: { authorization: "Bearer t" }, body: { orderId: "A", ...body } }, res);
    return res;
  };
  return { call, docs, ops: () => docs["order-operations"].A, shippoCalls };
}

test("a definite Shippo refusal releases the purchase lock and reports Shippo's reasons", async () => {
  const app = harness({ transaction: { status: "ERROR", messages: [{ text: "Address could not be validated" }, { text: "Parcel too heavy" }] } });
  const res = await app.call({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(500);
  expect(res.body.error).toContain("Address could not be validated");
  expect(res.body.error).toContain("Parcel too heavy");
  expect(app.ops().labelPurchasePending).toBe(false);
  expect(app.ops().activity.at(-1).message).toMatch(/Shippo refused the label purchase/);
});

test("a network failure while buying keeps the lock (the label may have been bought)", async () => {
  const app = harness({ transaction: new Error("socket hang up") });
  const res = await app.call({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(500);
  expect(app.ops().labelPurchasePending).toBe(true);
});

test("a queued (unconfirmed) Shippo transaction keeps the lock", async () => {
  const app = harness({ transaction: { status: "QUEUED", messages: [] } });
  await app.call({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(app.ops().labelPurchasePending).toBe(true);
});

test("the owner can clear a stuck lock after checking Shippo, and it is recorded", async () => {
  const app = harness({ pending: true });
  const res = await app.call({ mode: "clearPurchaseLock" });
  expect(res.code).toBe(200);
  expect(app.ops().labelPurchasePending).toBe(false);
  expect(app.ops().labelPurchaseClearedBy).toBe(ADMIN.email);
  expect(app.ops().activity.at(-1).message).toMatch(/checked Shippo and allowed a new label purchase/);
  expect(app.shippoCalls).toEqual([]);
});

test("clearing the lock is admin-only and refuses when nothing is pending", async () => {
  const stranger = harness({ pending: true, identity: { email: "someone@example.com", email_verified: true } });
  expect((await stranger.call({ mode: "clearPurchaseLock" })).code).toBe(403);
  expect(stranger.ops().labelPurchasePending).toBe(true);
  const idle = harness();
  expect((await idle.call({ mode: "clearPurchaseLock" })).code).toBe(409);
});

test("shippoTransactionOutcome treats only ERROR as definite", () => {
  expect(shippoTransactionOutcome({ status: "ERROR", messages: [{ text: "bad" }] })).toMatchObject({ definiteFailure: true, reasons: "bad" });
  expect(shippoTransactionOutcome({ status: "WAITING" }).definiteFailure).toBe(false);
  expect(shippoTransactionOutcome(undefined).definiteFailure).toBe(false);
});

// Labels bought without a Shippo Order show an empty Order column in Shippo and can't be refunded
// from its dashboard (October 2026, order G7PB-597756-LOSE), so each purchase is linked to one.
const transactionBodies = app => app.shippoCalls.filter(c => String(c.url).includes("transactions/")).map(c => c.body);

test("a bought label is linked to a Shippo Order, saved on the order for the next purchase", async () => {
  const app = harness({ transaction: { status: "SUCCESS", object_id: "tx1", label_url: "https://l", tracking_number: "T1" }, shippoOrder: { object_id: "so_1" } });
  const res = await app.call({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(200);
  expect(transactionBodies(app)).toEqual([expect.objectContaining({ rate: "r1", order: "so_1" })]);
  const orderCall = app.shippoCalls.find(c => String(c.url).endsWith("/orders/"));
  expect(orderCall.body).toMatchObject({ order_number: "AB-1", order_status: "PAID", to_address: expect.objectContaining({ city: "Toronto" }) });
  expect(app.docs.orders.A.shippoOrderId).toBe("so_1");
  expect(app.ops()).toMatchObject({ shippoOrderId: "so_1", shippoOrderAddress: JSON.stringify(app.docs.orders.A.customer.address) });
});

test("if Shippo won't create the Order, the label is still bought (unlinked)", async () => {
  const app = harness({ transaction: { status: "SUCCESS", object_id: "tx1", label_url: "https://l", tracking_number: "T1" } });
  const res = await app.call({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(200);
  expect(transactionBodies(app)).toEqual([expect.not.objectContaining({ order: expect.anything() })]);
});

test("a refusal of the linked purchase is retried once without the link (nothing was bought)", async () => {
  const app = harness({ transaction: { status: "SUCCESS", object_id: "tx1", label_url: "https://l", tracking_number: "T1" }, shippoOrder: { object_id: "so_1" }, refuseLinked: true });
  const res = await app.call({ mode: "purchase", shipmentId: "sh_1", rateId: "r1" });
  expect(res.code).toBe(200);
  expect(transactionBodies(app).map(b => b.order)).toEqual(["so_1", undefined]);
  expect(app.ops().labelPurchasePending).toBe(false);
});

// Voiding a label for a refund (mode "voidLabel", functions/labelVoid.js).
const ok = body => ({ ok: true, json: async () => body });
const LABELLED = { labelUrl: "https://label", trackingNumber: "1028972402334300", trackingCarrier: "Canada Post" };
const fakeShippo = ({ tx = { object_id: "tx9", tracking_number: "1028972402334300", status: "SUCCESS" }, list = [], refund = { object_id: "rf1", status: "QUEUED" } } = {}) => (url, init) => {
  if (url.includes("/transactions/?")) return ok({ results: list, next: null });
  if (url.includes("/transactions/tx")) return ok(tx);
  if (url.endsWith("/refunds/") && init.method === "POST") return ok(refund);
  return null;
};
const calls = (app, part) => app.shippoCalls.filter(c => String(c.url).includes(part));

test("a refunded order's unused label can be voided, and the refund is followed", async () => {
  const app = harness({ orderPatch: { ...LABELLED, status: "refunded", paymentStatus: "refunded" }, opsPatch: { shippoTransactionId: "tx9" }, shippo: fakeShippo() });
  const res = await app.call({ mode: "voidLabel" });
  expect(res.code).toBe(200);
  expect(res.body).toMatchObject({ voided: true, refundState: "pending" });
  expect(calls(app, "/refunds/")[0].body).toEqual({ transaction: "tx9", async: false });
  expect(app.docs.orders.A.labelUrl).toBeUndefined();
  expect(app.ops().labelRefundOpen).toBe(true);
  expect(app.ops().labelRefunds).toEqual([expect.objectContaining({ transactionId: "tx9", refundId: "rf1", state: "pending", trackingNumber: "1028972402334300" })]);
});

test("a label bought before its transaction number was saved is found in Shippo by tracking number", async () => {
  const app = harness({ orderPatch: LABELLED, shippo: fakeShippo({ list: [{ object_id: "txOther", tracking_number: "999", status: "SUCCESS" }, { object_id: "tx9", tracking_number: "1028972402334300", status: "SUCCESS" }] }) });
  const res = await app.call({ mode: "voidLabel" });
  expect(res.code).toBe(200);
  expect(calls(app, "/refunds/")[0].body.transaction).toBe("tx9");
});

test("a label Shippo is already refunding is not asked for twice", async () => {
  const app = harness({ orderPatch: LABELLED, opsPatch: { shippoTransactionId: "tx9" }, shippo: fakeShippo({ tx: { object_id: "tx9", tracking_number: "1028972402334300", status: "REFUNDPENDING" } }) });
  const res = await app.call({ mode: "voidLabel" });
  expect(res.code).toBe(200);
  expect(calls(app, "/refunds/")).toEqual([]);
  expect(app.ops().labelRefunds[0]).toMatchObject({ state: "pending", shippoStatus: "REFUNDPENDING" });
});

test("a refund Shippo already rejected, or a saved label for another parcel, is refused", async () => {
  const rejected = harness({ orderPatch: LABELLED, opsPatch: { shippoTransactionId: "tx9" }, shippo: fakeShippo({ tx: { object_id: "tx9", tracking_number: "1028972402334300", status: "REFUNDREJECTED" } }) });
  expect((await rejected.call({ mode: "voidLabel" })).code).toBe(409);
  expect(rejected.docs.orders.A.labelUrl).toBe("https://label");
  const mismatch = harness({ orderPatch: LABELLED, opsPatch: { shippoTransactionId: "tx9" }, shippo: fakeShippo({ tx: { object_id: "tx9", tracking_number: "555", status: "SUCCESS" } }) });
  const res = await mismatch.call({ mode: "voidLabel" });
  expect(res.code).toBe(409);
  expect(calls(mismatch, "/refunds/")).toEqual([]);
});

test("a parcel that was handed over keeps its label, even after the order is refunded", async () => {
  const app = harness({ orderPatch: { ...LABELLED, fulfillmentStatus: "shipped", shippedAt: "2026-10-01T00:00:00Z", status: "refunded" }, opsPatch: { shippoTransactionId: "tx9" }, shippo: fakeShippo() });
  expect((await app.call({ mode: "voidLabel" })).code).toBe(409);
  expect(app.shippoCalls).toEqual([]);
});

test("'I already voided it in Shippo' removes the label without calling Shippo or following a refund", async () => {
  const app = harness({ orderPatch: LABELLED, shippo: fakeShippo() });
  const res = await app.call({ mode: "voidLabel", confirmedElsewhere: true });
  expect(res.code).toBe(200);
  expect(app.shippoCalls).toEqual([]);
  expect(app.ops().labelRefundOpen).toBeUndefined();
});
