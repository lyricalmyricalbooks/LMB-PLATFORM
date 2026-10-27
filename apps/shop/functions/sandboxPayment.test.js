// Sandbox (test-mode) payments are a rehearsal: the order becomes a test order and
// real stock, discount usage and revenue are never touched — on payment or refund.
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

function harness(order) {
  const docs = {
    orders: { o1: order },
    books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
    discounts: { d1: { usageCount: 0 } },
    settings: { website: { payments: {} } },
    analytics: {},
  };
  const analyticsWrites = [];
  const ref = (name, id) => ({ name, id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
    async set(data) { if (name === 'analytics') analyticsWrites.push(data); docs[name] ||= {}; docs[name][id] = { ...(docs[name][id] || {}), ...data }; },
    async update(data) { Object.assign(docs[name][id], data); },
  });
  const db = {
    collection(name) { return { doc: (id) => ref(name, id), where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }; },
    async runTransaction(fn) {
      return fn({
        get: (r) => r.get(),
        update: (r, data) => { Object.assign(docs[r.name][r.id], data); },
        set: (r, data) => { docs[r.name] ||= {}; docs[r.name][r.id] = data; },
      });
    },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => ({ inc: n }) } }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return class {};
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  // Expose the internal helpers under test.
  const exposed = `${source}\nmodule.exports.__test = { markStripeOrderPaid: (id, session, options) => markStripeOrderPaid(id, session, { ...options, authority: STRIPE_WEBHOOK_AUTHORITY }), syncStripeReversal };`;
  vm.runInNewContext(exposed, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { docs, analyticsWrites, ...module.exports.__test };
}

const baseOrder = () => ({
  paymentStatus: 'unpaid', status: 'pending_payment', total: 15.2, items: [{ id: 'book', quantity: 2, price: 3 }],
  appliedDiscount: { id: 'd1' }, expectedAmountMinor: 1520, expectedCurrency: 'cad', activity: [],
});
const session = (livemode) => ({ id: null, client_reference_id: 'o1', payment_status: 'paid', payment_intent: 'pi_1', livemode, amount_total: 1520, currency: 'cad' });

test('a sandbox payment marks the order paid as a test order without touching stock, discounts or revenue', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'test' });
  expect(await app.markStripeOrderPaid('o1', session(false), { message: 'paid' })).toBe(true);
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', isTest: true, sandboxPayment: true });
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.docs.discounts.d1.usageCount).toBe(0);
  expect(app.analyticsWrites).toEqual([]);
});

test('a live payment still takes stock, counts the discount and records revenue', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'live' });
  await app.markStripeOrderPaid('o1', session(true), { message: 'paid' });
  expect(app.docs.orders.o1.isTest).toBeUndefined();
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(1);
  expect(app.analyticsWrites.length).toBe(1);
});

test('refunding a sandbox order neither restocks nor reverses revenue; an older (pre-flag) order still restocks', async () => {
  const sandbox = harness({ ...baseOrder(), paymentStatus: 'paid', sandboxPayment: true, isTest: true });
  await sandbox.syncStripeReversal('o1', { charge: { amount: 1520, amount_refunded: 1520, refunded: true, currency: 'cad' }, source: 'test' });
  expect(sandbox.docs.orders.o1.paymentStatus).toBe('refunded');
  expect(sandbox.docs.books.book.stockLevel).toBe(5);
  expect(sandbox.analyticsWrites).toEqual([]);

  const older = harness({ ...baseOrder(), paymentStatus: 'paid' });
  await older.syncStripeReversal('o1', { charge: { amount: 1520, amount_refunded: 1520, refunded: true, currency: 'cad' }, source: 'test' });
  expect(older.docs.books.book.stockLevel).toBe(7);
  expect(older.analyticsWrites.length).toBe(1);
});
