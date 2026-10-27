// Every payment path (Stripe webhook, PayPal capture, manual/free) goes through settlePayment:
// these check each path's own refusals and that a repeat never takes stock or counts a discount twice.
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
  const exposed = `${source}\nmodule.exports.__test = { markStripeOrderPaid: (id, session, options) => markStripeOrderPaid(id, session, { ...options, authority: STRIPE_WEBHOOK_AUTHORITY }), markOrderPaidFromPayPal, completeOrderWithoutCard };`;
  vm.runInNewContext(exposed, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { docs, analyticsWrites, ...module.exports.__test };
}


const baseOrder = (extra = {}) => ({
  paymentStatus: 'unpaid', status: 'pending_payment', total: 15.2, items: [{ id: 'book', quantity: 2, price: 3 }],
  appliedDiscount: { id: 'd1' }, expectedAmountMinor: 1520, expectedCurrency: 'cad', activity: [], ...extra,
});
const capture = (value = '15.20') => ({ paypalOrderId: 'pp1', captureId: 'cap1', capture: { amount: { value, currency_code: 'CAD' } } });
const session = (extra = {}) => ({ id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', livemode: true, amount_total: 1520, currency: 'cad', ...extra });

test('PayPal: a verified capture marks the order paid once', async () => {
  const app = harness(baseOrder({ paypalOrderId: 'pp1', paypalMode: 'test' }));
  expect(await app.markOrderPaidFromPayPal('o1', capture())).toBe(true);
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', paypalCaptureId: 'cap1', isTest: true });
  expect(await app.markOrderPaidFromPayPal('o1', capture())).toBe(true);
  expect(app.analyticsWrites).toEqual([]);
});

test('PayPal: a live capture takes stock and counts the discount once, even when repeated', async () => {
  const app = harness(baseOrder({ paypalOrderId: 'pp1', paypalMode: 'live' }));
  await app.markOrderPaidFromPayPal('o1', capture());
  await app.markOrderPaidFromPayPal('o1', capture());
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(1);
  expect(app.analyticsWrites.length).toBe(1);
  expect(app.docs.orders.o1.inventoryDecrementedAt).toBeTruthy();
});

test('PayPal: a cancelled order or a wrong amount is recorded, not paid', async () => {
  const cancelled = harness(baseOrder({ paypalOrderId: 'pp1', paypalMode: 'test', status: 'cancelled' }));
  expect(await cancelled.markOrderPaidFromPayPal('o1', capture())).toBe(false);
  expect(cancelled.docs.orders.o1).toMatchObject({ paymentStatus: 'unpaid', paymentMismatch: { paidAfterCancel: true } });

  const short = harness(baseOrder({ paypalOrderId: 'pp1', paypalMode: 'test' }));
  expect(await short.markOrderPaidFromPayPal('o1', capture('1.00'))).toBe(false);
  expect(short.docs.orders.o1.paymentStatus).toBe('unpaid');
  expect(short.docs.orders.o1.paymentMismatch).toBeTruthy();
});

test('PayPal: a capture for a different PayPal order is refused', async () => {
  const app = harness(baseOrder({ paypalOrderId: 'other', paypalMode: 'test' }));
  await expect(app.markOrderPaidFromPayPal('o1', capture())).rejects.toThrow(/does not match/);
});

test('manual payment: marked paid once with stock and discount counted once', async () => {
  const app = harness(baseOrder({ paymentMethod: 'e-Transfer' }));
  expect(await app.completeOrderWithoutCard('o1', 'Payment confirmed manually', { reserve: false })).toBe(true);
  expect(await app.completeOrderWithoutCard('o1', 'Payment confirmed manually', { reserve: false })).toBe(true);
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', status: 'open' });
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(1);
  expect(app.analyticsWrites.length).toBe(1);
});

test('Stripe: a second, different payment on a paid order is flagged, not counted', async () => {
  const app = harness(baseOrder());
  expect(await app.markStripeOrderPaid('o1', session(), { message: 'paid' })).toBe(true);
  expect(await app.markStripeOrderPaid('o1', session({ payment_intent: 'pi_2' }), { message: 'paid' })).toBe(false);
  expect(app.docs.orders.o1.duplicatePayments).toEqual([expect.objectContaining({ paymentIntentId: 'pi_2' })]);
  expect(app.docs.orders.o1.stripePaymentIntentId).toBe('pi_1');
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(1);
});

test('Stripe: money for a cancelled order is recorded, not paid', async () => {
  const app = harness(baseOrder({ status: 'cancelled' }));
  expect(await app.markStripeOrderPaid('o1', session(), { message: 'paid' })).toBe(false);
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'unpaid', stripePaymentIntentId: 'pi_1', paymentMismatch: { paidAfterCancel: true } });
  expect(app.docs.books.book.stockLevel).toBe(5);
});
