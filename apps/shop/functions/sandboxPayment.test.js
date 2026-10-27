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

function harness(order, { testShop = false } = {}) {
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
    // The platform's test-shop mark (SHOP_TEST_SHOP, shopConfig.testShop), off unless a test turns it on.
    if (name === './shopConfig') { const real = realRequire(name); return { ...real, shopConfig: { ...real.shopConfig, testShop } }; }
    return realRequire(name);
  };
  const module = { exports: {} };
  // Expose the internal helpers under test.
  const exposed = `${source}\nmodule.exports.__test = { markStripeOrderPaid: (id, session, options) => markStripeOrderPaid(id, session, { ...options, authority: STRIPE_WEBHOOK_AUTHORITY }), syncStripeReversal, applyPartialRefund, restockRefunded: (id) => restockRefundedOrder(db, id, { testShop: shopConfig.testShop }) };`;
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

// Plan 1.31b: on the platform's test shop (SHOP_TEST_SHOP="true") a sandbox payment takes stock and its refund puts it
// back, exactly as a live one, so the release check (docs/test-shop.md checks 4 and 7) can prove both. Discount use and
// revenue stay untouched there too. Every other shop keeps the rehearsal above.
const fullRefund = { charge: { amount: 1520, amount_refunded: 1520, refunded: true, currency: 'cad' }, source: 'test' };

test('on the test shop a sandbox payment takes stock, and its refund puts it back', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'test' }, { testShop: true });
  expect(await app.markStripeOrderPaid('o1', session(false), { message: 'paid' })).toBe(true);
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', isTest: true, sandboxPayment: true });
  expect(app.docs.orders.o1.inventoryDecrementedAt).toEqual(expect.any(String));
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(0);
  expect(app.analyticsWrites).toEqual([]);

  await app.syncStripeReversal('o1', fullRefund);
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
  expect(app.docs.orders.o1.inventoryRestockedAt).toEqual(expect.any(String));
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.analyticsWrites).toEqual([]);
});

test('a repeated sandbox payment event on the test shop takes the stock only once', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'test' }, { testShop: true });
  await app.markStripeOrderPaid('o1', session(false), { message: 'paid' });
  await app.markStripeOrderPaid('o1', session(false), { message: 'paid' });
  expect(app.docs.books.book.stockLevel).toBe(3);
});

test('on the test shop a sandbox partial refund puts the ticked copies back', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'test' }, { testShop: true });
  await app.markStripeOrderPaid('o1', session(false), { message: 'paid' });
  await app.applyPartialRefund('o1', { provider: 'stripe', refundId: 're_1', amountMinor: 300, restockLines: [{ index: 0, id: 'book', quantity: 1 }] });
  expect(app.docs.books.book.stockLevel).toBe(4);
});

test('on the test shop a sandbox refund that left the books out can put them back later', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'test' }, { testShop: true });
  await app.markStripeOrderPaid('o1', session(false), { message: 'paid' });
  app.docs.orders.o1.fulfillmentStatus = 'shipped'; // books that left the shop aren't restocked by default
  await app.syncStripeReversal('o1', fullRefund);
  expect(app.docs.books.book.stockLevel).toBe(3);
  await app.restockRefunded('o1');
  expect(app.docs.books.book.stockLevel).toBe(5);
});

test('every other shop: a sandbox payment, refund and partial refund never touch stock', async () => {
  const app = harness({ ...baseOrder(), stripeMode: 'test' }, { testShop: false });
  await app.markStripeOrderPaid('o1', session(false), { message: 'paid' });
  expect(app.docs.orders.o1.inventoryDecrementedAt).toBeUndefined();
  await app.applyPartialRefund('o1', { provider: 'stripe', refundId: 're_1', amountMinor: 300, restockLines: [{ index: 0, id: 'book', quantity: 1 }] });
  await app.syncStripeReversal('o1', fullRefund);
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
  expect(app.docs.books.book.stockLevel).toBe(5);
  await expect(app.restockRefunded('o1')).rejects.toThrow(/test payment never took the books/);
  expect(app.docs.books.book.stockLevel).toBe(5);
});

test('a sandbox order paid before the test-shop mark (no stock stamp) is not restocked on the test shop', async () => {
  const app = harness({ ...baseOrder(), paymentStatus: 'paid', sandboxPayment: true, isTest: true }, { testShop: true });
  await app.syncStripeReversal('o1', fullRefund);
  expect(app.docs.books.book.stockLevel).toBe(5);
});
