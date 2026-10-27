// The one step that turns a verified payment into a paid order (Stripe, PayPal, manual, free).
import { expect, test } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createSettlement } = require('./settlePayment.js');

function fakeDb(seed) {
  const docs = JSON.parse(JSON.stringify(seed));
  const analytics = [];
  const ref = (name, id) => ({ name, id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
    async set(data) { if (name === 'analytics') analytics.push(data); docs[name] ||= {}; docs[name][id] = { ...(docs[name][id] || {}), ...data }; },
    async update(data) { Object.assign(docs[name][id], data); },
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name, id) }),
    async runTransaction(fn) {
      return fn({
        get: (r) => r.get(),
        update: (r, data) => { Object.assign(docs[r.name][r.id], data); },
        set: (r, data) => { docs[r.name] ||= {}; docs[r.name][r.id] = data; },
      });
    },
  };
  const { settlePayment } = createSettlement({ db, increment: (n) => ({ inc: n }) });
  return { docs, analytics, settlePayment };
}

const order = (extra = {}) => ({
  paymentStatus: 'unpaid', status: 'pending_payment', total: 15.2, activity: [],
  items: [{ id: 'book', quantity: 2, price: 3 }], appliedDiscount: { id: 'd1' }, ...extra,
});
const shop = (o = order(), more = {}) => fakeDb({
  orders: { o1: o },
  books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
  discounts: { d1: { usageCount: 0 } },
  ...more,
});

test('marks the order paid once: stock, discount use, revenue, download token and stamps', async () => {
  const app = shop();
  expect(await app.settlePayment('o1', { provider: 'Checkout', message: 'Paid by e-Transfer' })).toMatchObject({ paid: true });
  const o = app.docs.orders.o1;
  expect(o).toMatchObject({ paymentStatus: 'paid', fulfillmentStatus: 'paid', status: 'open' });
  expect(o.downloadToken).toMatch(/^[0-9a-f]{64}$/);
  expect(o.inventoryDecrementedAt).toBeTruthy();
  expect(o.discountUsageCountedAt).toBeTruthy();
  expect(o.activity.at(-1).message).toBe('Paid by e-Transfer');
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(1);
  expect(app.analytics).toEqual([expect.objectContaining({ orders: { inc: 1 }, revenue: { inc: 15.2 } })]);
});

test('a second call changes nothing and reports already-paid', async () => {
  const app = shop();
  await app.settlePayment('o1', { provider: 'Stripe', message: 'paid' });
  expect(await app.settlePayment('o1', { provider: 'Stripe', message: 'paid' })).toEqual({ paid: false, reason: 'already-paid' });
  expect(app.docs.books.book.stockLevel).toBe(3);
  expect(app.docs.discounts.d1.usageCount).toBe(1);
  expect(app.analytics.length).toBe(1);
});

test('stock and discount already counted on the order are not counted again', async () => {
  const app = shop(order({ inventoryDecrementedAt: '2026-10-01T00:00:00Z', discountUsageCountedAt: '2026-10-01T00:00:00Z' }));
  await app.settlePayment('o1', { provider: 'PayPal', message: 'paid' });
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.docs.discounts.d1.usageCount).toBe(0);
  expect(app.docs.orders.o1.inventoryDecrementedAt).toBe('2026-10-01T00:00:00Z');
});

test('a sandbox payment is a paid test order and touches no stock, discount or revenue', async () => {
  const app = shop();
  expect(await app.settlePayment('o1', { provider: 'Stripe', sandbox: () => true, message: 'paid' })).toMatchObject({ paid: true });
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', isTest: true, sandboxPayment: true });
  expect(app.docs.orders.o1.inventoryDecrementedAt).toBeUndefined();
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.docs.discounts.d1.usageCount).toBe(0);
  expect(app.analytics).toEqual([]);
});

test("the provider's own check can stop it with its own update", async () => {
  const app = shop(order({ status: 'cancelled' }));
  const result = await app.settlePayment('o1', {
    provider: 'PayPal', message: 'paid',
    verify: (o) => (o.status === 'cancelled' ? { reason: 'cancelled', update: { paymentMismatch: { paidAfterCancel: true } } } : null),
  });
  expect(result).toEqual({ paid: false, reason: 'cancelled' });
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'unpaid', paymentMismatch: { paidAfterCancel: true } });
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.analytics).toEqual([]);
});

test('a gift card that can no longer pay its part keeps the order unpaid but records the receipt', async () => {
  const app = shop(order({ giftCardRedemptions: [{ id: 'g1', minor: 500 }] }), { giftCards: { g1: { balanceMinor: 100 } } });
  const result = await app.settlePayment('o1', { provider: 'PayPal', message: 'paid', receipt: { paypalCaptureId: 'cap_1' } });
  expect(result).toEqual({ paid: false, reason: 'gift-card-short' });
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'unpaid', paypalCaptureId: 'cap_1', giftCardConflict: { provider: 'PayPal', cardId: 'g1' } });
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.docs.giftCards.g1.balanceMinor).toBe(100);
});

test('gift cards are debited once with the payment', async () => {
  const app = shop(order({ giftCardRedemptions: [{ id: 'g1', minor: 500 }] }), { giftCards: { g1: { balanceMinor: 800 } } });
  await app.settlePayment('o1', { provider: 'Checkout', message: 'paid' });
  expect(app.docs.giftCards.g1.balanceMinor).toBe(300);
  expect(app.docs.orders.o1.giftCardsDebitedAt).toBeTruthy();
});

test('flags oversold books and a discount past its limit', async () => {
  const app = fakeDb({
    orders: { o1: order({ items: [{ id: 'book', quantity: 9, price: 3 }] }) },
    books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
    discounts: { d1: { usageCount: 3, usageLimit: 3 } },
  });
  await app.settlePayment('o1', { provider: 'Stripe', message: 'paid' });
  expect(app.docs.orders.o1).toMatchObject({ oversold: true, discountOverLimit: true });
});

test('receipt fields are written with the paid status', async () => {
  const app = shop();
  await app.settlePayment('o1', { provider: 'Stripe', message: 'paid', receipt: { stripePaymentIntentId: 'pi_1' } });
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', stripePaymentIntentId: 'pi_1' });
});

test('a missing order is reported, not created', async () => {
  const app = shop();
  expect(await app.settlePayment('nope', { provider: 'Stripe', message: 'paid' })).toEqual({ paid: false, reason: 'missing' });
  expect(app.docs.orders.nope).toBeUndefined();
});
