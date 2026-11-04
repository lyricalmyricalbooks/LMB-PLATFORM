// Gift cards are as good as cash: a paid order the owner asked to check ("Check big orders") or whose card payment looks
// risky keeps its cards back until the owner presses "It looks fine" (orderReview.js giftCardHold).
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');
const { giftCardHold } = realRequire('./orderReview');

function harness({ order, reviewAbove = 0, operations = null }) {
  const emailed = [];
  const docs = {
    settings: { website: { payments: { reviewAbove } }, notifications: {} },
    orders: { o1: order },
    'order-operations': operations ? { o1: operations } : {},
    giftCards: {},
  };
  const ref = (name, id) => ({
    _name: name, _id: id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
    async set(data) { (docs[name] ||= {})[id] = data; }, async update(change) { Object.assign((docs[name] ||= {})[id] ||= {}, change); },
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name, id), add: async () => {}, where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }),
    async runTransaction(fn) {
      return fn({
        get: (r) => r.get(),
        update: (r, change) => { Object.assign(docs[r._name][r._id], change); },
        create: (r, data) => { (docs[r._name] ||= {})[r._id] = data; },
        set: (r, data) => { (docs[r._name] ||= {})[r._id] = data; },
      });
    },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => n } }) };
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
  const patched = `${source}
sendEmail = async () => ({ ok: true });
emailGiftCard = async (id, card) => { __emailed.push(card.recipientEmail); };
autoApproveShippingAddress = async () => {};`;
  vm.runInNewContext(patched, { module, exports: module.exports, require: mockRequire, process, Buffer, console: { ...console, warn() {}, error() {}, log() {} }, setTimeout, clearTimeout, URL, AbortController, __emailed: emailed, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  const paid = () => module.exports.onOrderUpdated({ data: { before: { data: () => ({ ...docs.orders.o1, paymentStatus: 'unpaid' }) }, after: { data: () => docs.orders.o1 } }, params: { orderId: 'o1' } });
  const clear = async () => {
    const before = docs['order-operations'].o1 || null;
    docs['order-operations'].o1 = { ...(before || {}), reviewCleared: '2026-11-03T12:00:00Z' };
    await module.exports.onOrderReviewCleared({ data: { before: { data: () => before || undefined }, after: { data: () => docs['order-operations'].o1 } }, params: { orderId: 'o1' } });
  };
  return { docs, emailed, paid, clear };
}

const giftOrder = (extra = {}) => ({
  orderId: 'o1', paymentStatus: 'paid', paymentMethod: 'PayPal', total: 500, subtotal: 500, shipping: 0,
  customer: { name: 'Buyer', email: 'buyer@example.com', address: {} },
  items: [{ id: 'card', title: 'Gift card', quantity: 2, price: 250, giftCard: true, giftCardDetails: { recipientEmail: 'friend@example.com' } }],
  ...extra,
});

test('a big gift-card order the owner asked to check sends no codes until "It looks fine"', async () => {
  const app = harness({ order: giftOrder(), reviewAbove: 300 });
  await app.paid();
  expect(app.emailed).toEqual([]);
  expect(Object.keys(app.docs.giftCards)).toHaveLength(0);
  expect(app.docs.orders.o1.review).toMatchObject({ status: 'needs_review' });
  expect(app.docs.orders.o1.giftCardsIssuedAt).toBeUndefined();
  await app.clear();
  expect(app.emailed).toEqual(['friend@example.com', 'friend@example.com']);
  expect(Object.keys(app.docs.giftCards)).toHaveLength(2);
  // A second write of the cleared record issues nothing more.
  await app.clear();
  expect(Object.keys(app.docs.giftCards)).toHaveLength(2);
});

test('a risky card payment already under review holds its gift cards too; an ordinary order sends them at once', async () => {
  const risky = harness({ order: giftOrder({ paymentMethod: 'Stripe', review: { status: 'needs_review', reasons: ['x'] } }) });
  await risky.paid();
  expect(risky.emailed).toEqual([]);
  const plain = harness({ order: giftOrder(), reviewAbove: 1000 });
  await plain.paid();
  expect(plain.emailed).toHaveLength(2);
  expect(plain.docs.orders.o1.review).toBeUndefined();
});

test('the hold rule: cleared releases, a manual payment the owner confirmed is not held, no rule means no hold', () => {
  const own = { above: 100 };
  expect(giftCardHold(giftOrder(), {}, own)).toMatchObject({ hold: true });
  expect(giftCardHold(giftOrder(), { reviewCleared: 'x' }, own)).toEqual({ hold: false });
  expect(giftCardHold(giftOrder({ paymentMethod: 'e-Transfer' }), {}, own)).toEqual({ hold: false });
  expect(giftCardHold(giftOrder(), {}, {})).toEqual({ hold: false });
  expect(giftCardHold(giftOrder({ review: { status: 'needs_review' } }), {}, {})).toEqual({ hold: true });
});
