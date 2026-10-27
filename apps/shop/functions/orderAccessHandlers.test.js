import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const key = "a".repeat(64);
function harness(identity = null) {
  const order = { customer: { email: "reader@example.com", address: { street: "1 Main", unit: "12" } }, trackingKey: key, paymentStatus: "unpaid", status: "pending_payment", paymentMethod: "Stripe", stripePaymentIntentId: "pi_saved", expectedAmountMinor: 2000, expectedCurrency: "cad", items: [], futureSecret: "hidden" };
  const writes = [], sent = [];
  const docs = { orders: { A: order }, adminSecrets: { stripe: { secretKey: "sk_live_fake" } }, settings: { website: {} } };
  const db = { collection(name) { return { doc(id) { return { path: `${name}/${id}`, async get() { const value = docs[name]?.[id]; return { id, exists: !!value, data: () => value }; }, async update(change) { writes.push({ path: `${name}/${id}`, change }); Object.assign(docs[name]?.[id] || {}, change); } }; } }; }, async runTransaction(fn) { return fn({ get: ref => ref.get(), update: (ref, data) => ref.update(data), set() {} }); } };
  const admin = { initializeApp() {}, firestore: () => db, auth: () => ({ verifyIdToken: async () => identity }) };
  class Stripe { constructor() { this.paymentIntents = { retrieve: async () => ({ id: "pi_saved", metadata: { order_id: "A" }, status: "succeeded", amount_received: 2000, currency: "cad", livemode: true }) }; } }
  const wrap = (...args) => args.at(-1);
  const mockRequire = name => name === "firebase-admin" ? admin : name === "stripe" ? Stripe : name.startsWith("firebase-functions/v2/") ? new Proxy({}, { get: () => wrap }) : name === "firebase-functions/params" ? { defineSecret: () => ({ value: () => "fake" }) } : name === "./rateLimit" ? { ...require(name), hitLimit: async () => true } : require(name);
  const module = { exports: {} };
  vm.runInNewContext(source + '\nmodule.exports.__mark = markStripeOrderPaid; module.exports.__record = recordStripeReconciliation; sendEmail = async message => sent.push(message);', { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: "off" } }, Buffer, console, URL, setTimeout, clearTimeout, AbortController, sent }, { filename: "index.js" });
  const call = async (action, body = {}, headers = {}) => {
    const res = { code: 200, body: null, set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
    await module.exports.createStripeCheckoutSession({ method: "POST", headers, body: { action, orderId: "A", ...body } }, res);
    return res;
  };
  return { call, order, writes, sent, mark: module.exports.__mark, record: module.exports.__record };
}
test('knowing an order number and email never reveals its contents', async () => {
  const app = harness(); const res = await app.call("track", { email: "reader@example.com" });
  expect(res.code).toBe(403); expect(res.body.order).toBeUndefined();
});
test('private key reveals only shopper fields', async () => {
  const app = harness(); const res = await app.call("track", { key });
  expect(res.code).toBe(200); expect(res.body.order.customer.address.unit).toBe("12");
  expect(res.body.order).not.toHaveProperty("futureSecret"); expect(res.body.order).not.toHaveProperty("stripePaymentIntentId");
});
test('only the verified signed-in owner can use token-based lookup', async () => {
  expect((await harness({ email: "reader@example.com", email_verified: true }).call("track", {}, { authorization: "Bearer token" })).code).toBe(200);
  expect((await harness({ email: "reader@example.com", email_verified: false }).call("track", {}, { authorization: "Bearer token" })).code).toBe(403);
});
test('status does not expose a payment to someone who knows its ids', async () => {
  const app = harness(); const res = await app.call("status", { paymentIntentId: "pi_saved" });
  expect(res.code).toBe(403); expect(app.writes).toEqual([]);
});
test('a verified status check reports Stripe success without marking paid', async () => {
  const app = harness(); const res = await app.call("status", {}, { "x-order-key": key });
  expect(res.code).toBe(200); expect(res.body).toMatchObject({ paymentStatus: "unpaid", providerPaymentStatus: "succeeded", awaitingWebhook: true });
  expect(app.order.paymentStatus).toBe("unpaid"); expect(app.order.reconciliationPending.provider).toBe("stripe");
  expect(app.writes.every(w => !Object.hasOwn(w.change, "paymentStatus"))).toBe(true);
});
test('unverified callers cannot invoke Stripe paid-order authority', async () => {
  const app = harness(); await expect(app.mark("A", { payment_status: "paid" }, { authority: "verified" })).rejects.toThrow("verified webhook");
  expect(app.writes).toEqual([]);
});
test('reconciliation does not alter a paid order', async () => {
  const app = harness(); app.order.paymentStatus = "paid"; await app.record("A", { payment_status: "paid" });
  expect(app.writes).toEqual([]);
});
test('entered email cannot submit a customer cancellation request', async () => {
  const app = harness(); const res = await app.call("orderRequest", { email: "reader@example.com", type: "cancel" });
  expect(res.code).toBe(403); expect(app.writes).toEqual([]);
});
test('tracking email acknowledgement never reveals whether the order exists', async () => {
  const app = harness(); const missing = await app.call("trackingLink", { orderId: "missing", email: "reader@example.com" });
  const matching = await app.call("trackingLink", { email: "reader@example.com" });
  expect(missing.body).toEqual(matching.body); expect(app.sent).toHaveLength(1);
  expect(app.sent[0].to).toBe("reader@example.com"); expect(app.sent[0].html).toContain(key);
});
