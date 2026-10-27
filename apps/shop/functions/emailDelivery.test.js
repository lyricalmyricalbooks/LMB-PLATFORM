// Order emails go out once each even when Firestore re-runs the trigger; a failed send can be
// retried. The Stripe "webhook missed" alert is stamped only after it was really sent. A Gmail miss
// that Resend then delivers is logged as "fallback", not "failed".
import { expect, test } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js"), "utf8");

function harness({ patch = "", docs: extraDocs = {}, gmailFails = false, resendFails = false } = {}) {
  const sent = [];
  const docs = { settings: { website: { payments: {} }, notifications: {} }, ...extraDocs };
  const logs = [];
  const ref = (name, id) => ({
    id,
    path: `${name}/${id}`,
    async get() { const data = docs[name]?.[id]; return { id, exists: !!data, data: () => data }; },
    async set(data, opts) { docs[name] = docs[name] || {}; docs[name][id] = opts?.merge ? { ...(docs[name][id] || {}), ...data } : { ...data }; },
    async update(data) { docs[name][id] = { ...(docs[name][id] || {}), ...data }; },
    async delete() { if (docs[name]) delete docs[name][id]; },
  });
  const query = (name, filters = []) => ({
    where: (field, op, value) => query(name, [...filters, { field, op, value }]),
    orderBy: () => query(name, filters),
    limit: () => query(name, filters),
    async get() {
      const all = Object.entries(docs[name] || {}).map(([id, data]) => ({ id, data: () => data }));
      const rows = all.filter(d => filters.every(f => f.op === "==" ? d.data()[f.field] === f.value
        : f.op === "in" ? f.value.includes(d.data()[f.field])
        : f.op === ">=" ? String(d.data()[f.field] || "") >= f.value : true));
      return { empty: rows.length === 0, docs: rows, size: rows.length };
    },
  });
  const db = {
    collection: name => ({
      doc: id => ref(name, id),
      add: async data => { if (name === "emailLog") logs.push(data); },
      ...query(name),
    }),
    async runTransaction(fn) {
      return fn({ get: r => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: r => r.delete() });
    },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: n => n, arrayUnion: (...x) => x } }) };
  const wrap = (...args) => args.at(-1);
  const nodemailer = { createTransport: () => ({ sendMail: async () => { if (gmailFails) throw new Error("Invalid login"); return { messageId: "gmail-1" }; } }) };
  const Resend = class { constructor() { this.emails = { send: async () => resendFails ? { data: null, error: { message: "boom" } } : { data: { id: "re-1" }, error: null } }; } };
  const mockRequire = name => {
    if (name === "firebase-admin") return admin;
    if (name === "stripe") return class {};
    if (name === "resend") return { Resend };
    if (name === "nodemailer") return nodemailer;
    if (name.startsWith("firebase-functions/v2/")) return new Proxy({}, { get: () => wrap });
    if (name === "firebase-functions/params") return { defineSecret: () => ({ value: () => "fake" }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  vm.runInNewContext(`${source}\nautoApproveShippingAddress = async () => {};\nmodule.exports.__sendEmail = (m) => sendEmail(m);\n${patch}`,
    { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error("no network"); } },
    { filename: "index.js" });
  return { sent, docs, logs, exports: module.exports };
}

const order = (extra = {}) => ({ orderId: "AB-1", customer: { name: "Reader", email: "reader@example.com", address: {} }, items: [{ id: "b", title: "Book", quantity: 1, price: 3 }], total: 3.39, subtotal: 3, shipping: 0, paymentMethod: "Stripe", ...extra });
const updated = (before, after) => ({ data: { before: { data: () => before }, after: { data: () => after } }, params: { orderId: "o1" } });
const capture = "sendEmail = async (m) => { __sent.push(m); return { ok: true }; };";

test("a re-delivered paid trigger does not email the customer or the shop twice", async () => {
  const app = harness({ patch: capture });
  const event = updated(order({ paymentStatus: "unpaid" }), order({ paymentStatus: "paid" }));
  await app.exports.onOrderUpdated(event);
  await app.exports.onOrderUpdated(event);
  expect(app.sent.filter(m => m.to === "reader@example.com")).toHaveLength(1);
  expect(app.sent.filter(m => m.to === "lyricalmyricalbooks@gmail.com")).toHaveLength(1);
  // The claims live in a server-only collection, not on the guest-readable order.
  expect(Object.keys(app.docs["email-claims"]).sort()).toEqual(["o1_orderConfirmed", "o1_shopNewOrder"]);
});

test("shipped and refunded emails are sent once each, while a requested resend still goes out", async () => {
  const app = harness({ patch: capture });
  const shipped = updated(order({ paymentStatus: "paid", fulfillmentStatus: "processing" }), order({ paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "T1", trackingCarrier: "Canada Post" }));
  await app.exports.onOrderUpdated(shipped);
  await app.exports.onOrderUpdated(shipped);
  expect(app.sent.filter(m => m.to === "reader@example.com")).toHaveLength(1);
  const resend = updated(order({ paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "T1" }), order({ paymentStatus: "paid", fulfillmentStatus: "shipped", trackingNumber: "T1", shippingEmailRequestedAt: "2026-10-09T10:00:00.000Z" }));
  await app.exports.onOrderUpdated(resend);
  await app.exports.onOrderUpdated(resend);
  expect(app.sent.filter(m => m.to === "reader@example.com")).toHaveLength(2);
  const refunded = updated(order({ paymentStatus: "paid" }), order({ paymentStatus: "refunded", refund: { provider: "stripe" } }));
  await app.exports.onOrderUpdated(refunded);
  await app.exports.onOrderUpdated(refunded);
  expect(app.sent.filter(m => m.to === "reader@example.com")).toHaveLength(3);
});

test("a failed send releases its claim so a retry can deliver it", async () => {
  const app = harness({ patch: "let __fail = true; sendEmail = async (m) => { if (__fail && m.to === 'reader@example.com') throw new Error('rejected'); __sent.push(m); return { ok: true }; }; module.exports.__ok = () => { __fail = false; };" });
  const event = updated(order({ paymentStatus: "unpaid" }), order({ paymentStatus: "paid" }));
  await app.exports.onOrderUpdated(event);
  expect(app.sent.filter(m => m.to === "reader@example.com")).toHaveLength(0);
  expect(app.docs["email-claims"]?.o1_orderConfirmed).toBeUndefined();
  app.exports.__ok();
  await app.exports.onOrderUpdated(event);
  expect(app.sent.filter(m => m.to === "reader@example.com")).toHaveLength(1);
  expect(app.sent.filter(m => m.to === "lyricalmyricalbooks@gmail.com")).toHaveLength(1);
});

const sweepPatch = (sendFails) => `
retrieveOrderPayment = async () => ({ intent: { status: "succeeded", amount: 1000, currency: "cad", id: "pi_1" } });
recordStripeReconciliation = async () => true;
checkStripeReversal = async () => {};
sendEmail = async (m) => { if (${sendFails}) throw new Error("smtp down"); __sent.push(m); return { ok: true }; };`;
const unpaid = () => ({ orders: { o1: { paymentStatus: "unpaid", stripePaymentIntentId: "pi_1", createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), customer: { email: "reader@example.com" } } } });

test("the webhook-missed alert is stamped only after it was really sent", async () => {
  const failing = harness({ patch: sweepPatch(true), docs: unpaid() });
  await failing.exports.unpaidPaymentSweep();
  expect(failing.docs.orders.o1.paymentAlertSentAt).toBeUndefined();
  const working = harness({ patch: sweepPatch(false), docs: unpaid() });
  await working.exports.unpaidPaymentSweep();
  expect(working.sent).toHaveLength(1);
  expect(working.docs.orders.o1.paymentAlertSentAt).toBeTruthy();
});

test("a Gmail miss that Resend delivers is logged as fallback, not failed", async () => {
  const app = harness({ gmailFails: true, docs: { adminSecrets: { gmail: { appPassword: "abcd efgh" }, resend: { apiKey: "re_live_key" } } } });
  await app.exports.__sendEmail({ to: "reader@example.com", subject: "Hi", html: "<p>Hi</p>" });
  expect(app.logs.map(l => l.status)).toEqual(["fallback", "sent"]);
  expect(app.logs[0].error).toMatch(/Gmail SMTP rejected/);
});

test("when the backup sender also fails, the failure names the Gmail problem too", async () => {
  const app = harness({ gmailFails: true, resendFails: true, docs: { adminSecrets: { gmail: { appPassword: "abcd" }, resend: { apiKey: "re_live_key" } } } });
  await expect(app.exports.__sendEmail({ to: "reader@example.com", subject: "Hi", html: "<p>Hi</p>" })).rejects.toThrow();
  expect(app.logs.map(l => l.status)).toEqual(["fallback", "failed"]);
  expect(app.logs[1].error).toMatch(/Gmail SMTP rejected/);
});
