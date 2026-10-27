// The payment sweep's refund/dispute safety net, end to end against a fake Firestore and Stripe:
// it checks the paid orders, keeps the check times in systemStatus/stripeReversalChecks instead of
// writing to orders, reads the Stripe settings once per sweep, and the next sweep reads no orders when
// nothing is due. The admin's "Sync with Stripe" still stamps the order, and a reverted refund asks the
// next sweep to re-read every paid order, even when a later write in the revert fails.
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js"), "utf8");
const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR;

function harness(orders) {
  const docs = {
    orders: Object.fromEntries(orders.map((o) => [o.id, o])),
    settings: { website: { payments: { testMode: false, stripe: {} } }, notifications: {} },
    adminSecrets: { stripe: { secretKey: "sk_live_fake" } },
  };
  const reads = {};
  const queries = [];
  const orderWrites = [];
  const failNextSet = new Set(); // collection names whose next set() throws, like a Firestore timeout
  const count = (key, n = 1) => { reads[key] = (reads[key] || 0) + n; };
  const ref = (name, id) => ({
    id, path: `${name}/${id}`, name,
    async get() { count(`${name}/${id}`); const data = docs[name]?.[id]; return { id, exists: !!data, data: () => data && structuredClone(data) }; },
    async set(data, opts) { if (failNextSet.delete(name)) throw new Error("DEADLINE_EXCEEDED"); docs[name] ||= {}; docs[name][id] = opts?.merge ? { ...(docs[name][id] || {}), ...data } : structuredClone(data); if (name === "orders") orderWrites.push({ id, data }); },
    async update(data) { docs[name][id] = { ...(docs[name][id] || {}), ...data }; if (name === "orders") orderWrites.push({ id, data }); },
    async delete() { delete docs[name]?.[id]; },
  });
  const query = (name, state = { filters: [], fields: null, limit: Infinity, after: null, desc: null }) => ({
    where: (field, op, value) => query(name, { ...state, filters: [...state.filters, { field, op, value }] }),
    orderBy: (field, dir) => query(name, { ...state, desc: dir === "desc" ? field : null, asc: dir === "desc" ? null : field }),
    select: (...fields) => query(name, { ...state, fields }),
    limit: (n) => query(name, { ...state, limit: n }),
    startAfter: (snap) => query(name, { ...state, after: snap.id }),
    async get() {
      let rows = Object.entries(docs[name] || {}).filter(([, d]) => state.filters.every((f) => f.op === "==" ? d[f.field] === f.value
        : f.op === "in" ? f.value.includes(d[f.field]) : f.op === ">=" ? String(d[f.field] || "") >= f.value : true));
      if (state.desc) rows.sort((a, b) => String(b[1][state.desc]).localeCompare(String(a[1][state.desc])) || b[0].localeCompare(a[0]));
      if (state.after) rows = rows.slice(rows.findIndex(([id]) => id === state.after) + 1);
      rows = rows.slice(0, state.limit);
      count(`query:${name}`, Math.max(1, rows.length));
      queries.push({ name, filters: state.filters, rows: rows.length });
      const pick = (d) => (state.fields ? Object.fromEntries(Object.entries(d).filter(([k]) => state.fields.includes(k))) : d);
      const out = rows.map(([id, d]) => ({ id, data: () => structuredClone(pick(d)), get: (k) => d[k] }));
      return { empty: !out.length, docs: out, size: out.length };
    },
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name, id), add: async () => ({}), ...query(name) }),
    async getAll(...refs) {
      if (!refs.length) throw new Error('Function "Firestore.getAll()" requires at least 1 argument.');
      return Promise.all(refs.map((r) => r.get()));
    },
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: (r) => r.delete() });
    },
    batch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
  };
  const stripeCalls = [];
  const Stripe = class { constructor(key, opts) {
    this.paymentIntents = { retrieve: async (pi, params) => {
      stripeCalls.push({ pi, key, opts });
      const id = pi.replace(/^pi_/, "");
      const order = docs.orders[id];
      if (!order) { const e = new Error("No such payment_intent"); e.code = "resource_missing"; throw e; }
      if (order.paymentStatus === "unpaid") return { id: pi, status: "requires_payment_method", metadata: { order_id: id } };
      return { id: pi, status: "succeeded", metadata: { order_id: id }, latest_charge: params?.expand ? { amount: 3000, amount_refunded: 0, refunded: false, currency: "cad", disputed: false } : "ch_1" };
    } };
    this.disputes = { list: async () => ({ data: [] }) };
    this.refunds = { list: async () => ({ data: [] }) };
  } };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => n, arrayUnion: (...x) => x, serverTimestamp: () => "ts" } }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = (name) => {
    if (name === "firebase-admin") return admin;
    if (name === "stripe") return Stripe;
    if (name === "resend") return { Resend: class {} };
    if (name.startsWith("firebase-functions/v2/")) return new Proxy({}, { get: () => wrap });
    if (name === "firebase-functions/params") return { defineSecret: () => ({ value: () => "" }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const patch = "\nsendEmail = async () => ({ ok: true });\nmodule.exports.__test = { checkStripeReversal, handleCheckoutStatus, revertFailedRefund };";
  vm.runInNewContext(`${source}${patch}`, { module, exports: module.exports, require: mockRequire, process, Buffer, console: { ...console, log() {}, warn() {} }, setTimeout, clearTimeout, URL, AbortController, structuredClone, fetch: async () => { throw new Error("no network"); } }, { filename: "index.js" });
  return { docs, reads, queries, orderWrites, failNextSet, stripeCalls, sweep: module.exports.unpaidPaymentSweep, ...module.exports.__test };
}

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const paid = (id, paidMsAgo, extra = {}) => ({ id, paymentStatus: "paid", stripeMode: "live", stripePaymentIntentId: `pi_${id}`, paidAt: ago(paidMsAgo), createdAt: ago(paidMsAgo + 60000), total: 30, items: [], ...extra });

test("checks paid orders without writing to them, keeps one record and reads the Stripe settings once", async () => {
  const empty = harness([]);
  await empty.sweep();
  const baseline = empty.reads["settings/website"] || 0;

  const app = harness([
    paid("A", 2 * DAY), paid("B", 10 * DAY), paid("C", 40 * DAY),
    paid("T", DAY, { isTest: true }),
    { id: "U", paymentStatus: "unpaid", stripePaymentIntentId: "pi_U", createdAt: ago(HOUR), customer: { email: "r@example.com" } },
  ]);
  await app.sweep();
  expect(app.stripeCalls.map((c) => c.pi).sort()).toEqual(["pi_A", "pi_B", "pi_C", "pi_U"]);
  expect(app.stripeCalls.every((c) => c.key === "sk_live_fake" && c.opts?.timeout === 20000)).toBe(true);
  expect(app.reads["settings/website"]).toBe(baseline + 1);
  expect(app.reads["adminSecrets/stripe"]).toBe(1);
  expect(app.orderWrites).toEqual([]);
  const record = app.docs.systemStatus.stripeReversalChecks;
  expect(record.v).toBe(1);
  expect(Object.keys(record.orders).sort()).toEqual(["A", "B", "C"]);
  expect(Object.values(record.orders).every(([, checkedMs]) => Date.now() - checkedMs < 60000)).toBe(true);

  // The next sweep: nothing is due and nothing new was paid, so no order is read and Stripe isn't asked.
  app.stripeCalls.length = 0;
  app.queries.length = 0;
  for (const key of Object.keys(app.reads)) delete app.reads[key];
  app.docs.orders.U.paymentStatus = "cancelled";
  await app.sweep();
  expect(app.stripeCalls).toEqual([]);
  expect(Object.keys(app.reads).filter((k) => k.startsWith("orders/"))).toEqual([]);
  expect(app.reads["settings/website"] || 0).toBe(baseline);
  // Its paid-order scan starts just before the previous sweep (not 120 days back) and finds nothing.
  const scans = app.queries.filter((q) => q.name === "orders" && q.filters.some((f) => f.field === "paidAt"));
  expect(scans).toHaveLength(1);
  const since = scans[0].filters.find((f) => f.field === "paidAt");
  expect(since.op).toBe(">=");
  expect(Date.now() - Date.parse(since.value)).toBeLessThanOrEqual(31 * 60 * 1000);
  expect(scans[0].rows).toBe(0);

  // Six hours on (simulated by ageing the record), B is due again: read by id, then once more inside
  // the refund/dispute sync's own transaction. No other order is read.
  record.orders.B[1] -= 7 * HOUR;
  app.docs.systemStatus.stripeReversalChecks = record;
  for (const key of Object.keys(app.reads)) delete app.reads[key];
  await app.sweep();
  expect(app.stripeCalls.map((c) => c.pi)).toEqual(["pi_B"]);
  expect(Object.keys(app.reads).filter((k) => k.startsWith("orders/"))).toEqual(["orders/B"]);
  expect(app.reads["orders/B"]).toBe(2);
  expect(app.orderWrites).toEqual([]);
});

test("the admin's Sync with Stripe still stamps the order, and a second sync within a minute doesn't ask Stripe", async () => {
  const app = harness([paid("A", DAY, { trackingKey: "key-A" })]);
  const status = async () => {
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await app.handleCheckoutStatus({ body: { action: "status", orderId: "A", key: "key-A" }, headers: {} }, res);
    return res;
  };
  const first = await status();
  expect(first.code).toBe(200);
  expect(first.body).toEqual({ status: "complete", paymentStatus: "paid" });
  expect(app.stripeCalls.map((c) => c.pi)).toEqual(["pi_A"]);
  expect(app.orderWrites.map((w) => Object.keys(w.data))).toEqual([["stripeCheckedAt"]]);
  expect(Date.now() - Date.parse(app.docs.orders.A.stripeCheckedAt)).toBeLessThan(60000);
  const second = await status();
  expect(second.code).toBe(200);
  expect(app.stripeCalls).toHaveLength(1);
});

test("a refund reverted weeks later asks the next sweep to re-read every paid order", async () => {
  const app = harness([paid("R", 60 * DAY, {
    paymentStatus: "refunded", status: "cancelled", activity: [],
    refund: { provider: "stripe", id: "re_1", status: "succeeded" }, refundedAt: ago(50 * DAY),
  })]);
  await app.sweep(); // refunded 50 days ago: past the 45 days a refund is watched, so not on the record
  expect(app.stripeCalls).toEqual([]);
  expect(app.docs.systemStatus.stripeReversalChecks.orders).toEqual({});

  expect(await app.revertFailedRefund("R", { refundId: "re_1", source: "Stripe webhook" })).toEqual({ reverted: true });
  expect(app.docs.orders.R.paymentStatus).toBe("paid");
  const request = app.docs.systemStatus.stripeReversalRecheck;
  expect(request.orderId).toBe("R");

  // Without the request the short scan can't see it (its paidAt is old)…
  delete app.docs.systemStatus.stripeReversalRecheck;
  await app.sweep();
  expect(app.stripeCalls).toEqual([]);
  // …with it, the next sweep re-reads everything and checks it.
  app.docs.systemStatus.stripeReversalRecheck = request;
  await app.sweep();
  expect(app.stripeCalls.map((c) => c.pi)).toEqual(["pi_R"]);
  expect(Object.keys(app.docs.systemStatus.stripeReversalChecks.orders)).toEqual(["R"]);
});

test("the re-check request survives a revenue write that fails after the refund was reverted", async () => {
  const app = harness([paid("R", 60 * DAY, {
    paymentStatus: "refunded", status: "cancelled", activity: [],
    refund: { provider: "stripe", id: "re_1", status: "succeeded" }, refundedAt: ago(50 * DAY),
  })]);
  app.failNextSet.add("analytics");
  await expect(app.revertFailedRefund("R", { refundId: "re_1", source: "Stripe webhook" })).rejects.toThrow("DEADLINE_EXCEEDED");
  expect(app.docs.orders.R.paymentStatus).toBe("paid");
  expect(app.docs.systemStatus.stripeReversalRecheck.orderId).toBe("R");
  // Stripe retries the webhook: the order is already paid again, so nothing is reverted or asked twice…
  expect(await app.revertFailedRefund("R", { refundId: "re_1", source: "Stripe webhook" })).toEqual({ reverted: false });
  // …and the first request is enough for the next sweep to find and check it.
  await app.sweep();
  expect(app.stripeCalls.map((c) => c.pi)).toEqual(["pi_R"]);
});
