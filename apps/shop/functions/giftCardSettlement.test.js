// Gift-card money moves only with a confirmed payment: debited once when the Stripe webhook
// settles the order, never when a card can no longer cover its part, and put back once on refund.
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

function harness(order, card) {
  const docs = {
    orders: { o1: order },
    books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
    giftCards: { gc1: card, sold1: { balanceMinor: 2500, enabled: true, history: [] } },
    settings: { website: { payments: {} } },
    analytics: {},
  };
  const ref = (name, id) => ({ name, id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
    async set(data) { docs[name] ||= {}; docs[name][id] = { ...(docs[name][id] || {}), ...data }; },
    async update(data) { Object.assign(docs[name][id], data); },
  });
  // Firestore update() treats "a.b" as a nested field.
  const apply = (target, data) => { for (const [k, v] of Object.entries(data)) { if (k.includes('.')) { const [a, b] = k.split('.'); target[a] = { ...(target[a] || {}), [b]: v }; } else target[k] = v; } };
  const db = {
    collection(name) { return { doc: (id) => ref(name, id), where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }; },
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), update: (r, data) => { apply(docs[r.name][r.id], data); }, set: (r, data) => { docs[r.name] ||= {}; docs[r.name][r.id] = data; } });
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
  const exposed = `${source}\nmodule.exports.__test = { markStripeOrderPaid: (id, session, options) => markStripeOrderPaid(id, session, { ...options, authority: STRIPE_WEBHOOK_AUTHORITY }), syncStripeReversal };`;
  vm.runInNewContext(exposed, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { docs, ...module.exports.__test };
}

const order = () => ({
  paymentStatus: 'unpaid', status: 'pending_payment', stripeMode: 'live', total: 15, items: [{ id: 'book', quantity: 1, price: 20 }],
  giftCardAmount: 5, giftCardRedemptions: [{ id: 'gc1', minor: 500, last4: 'PQRS' }], giftCardsIssued: [{ id: 'sold1', minor: 2500 }],
  expectedAmountMinor: 1500, expectedCurrency: 'cad', activity: [],
});
const card = (balanceMinor) => ({ balanceMinor, enabled: true, holds: { o1: { minor: 500, expiresAt: Date.now() + 60000 } }, history: [] });
const session = { id: null, payment_status: 'paid', payment_intent: 'pi_1', livemode: true, amount_total: 1500, currency: 'cad' };

test('a confirmed card payment takes the gift-card part once and clears the hold', async () => {
  const app = harness(order(), card(800));
  expect(await app.markStripeOrderPaid('o1', session, { message: 'paid' })).toBe(true);
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(300);
  expect(app.docs.giftCards.gc1.holds).toEqual({});
  expect(app.docs.giftCards.gc1.history.at(-1)).toMatchObject({ type: 'redeemed', minor: 500, orderId: 'o1' });
  await app.markStripeOrderPaid('o1', session, { message: 'again' });
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(300);
});

test('a card that no longer covers its part leaves the order unpaid for the shop to reconcile', async () => {
  const app = harness(order(), card(100));
  expect(await app.markStripeOrderPaid('o1', session, { message: 'paid' })).toBe(false);
  expect(app.docs.orders.o1.paymentStatus).toBe('unpaid');
  expect(app.docs.orders.o1.giftCardConflict).toMatchObject({ provider: 'Stripe', cardId: 'gc1' });
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(100);
  expect(app.docs.books.book.stockLevel).toBe(5);
});

test('a full refund puts the gift-card money back once and stops cards the order bought', async () => {
  const app = harness(order(), card(800));
  await app.markStripeOrderPaid('o1', session, { message: 'paid' });
  const refund = { charge: { amount: 1500, amount_refunded: 1500, refunded: true, currency: 'cad' }, source: 'test' };
  await app.syncStripeReversal('o1', refund);
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(800);
  expect(app.docs.giftCards.sold1.enabled).toBe(false);
  await app.syncStripeReversal('o1', refund);
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(800);
});

test('settles the gift-card amounts the live payment was created for, not a later re-pricing', async () => {
  // A retry re-priced the order to CA$1 of gift card, but the payment in flight was made for CA$5.
  const app = harness({ ...order(), giftCardRedemptions: [{ id: 'gc1', minor: 100 }], chargedGiftCards: [{ id: 'gc1', minor: 500 }] }, card(800));
  expect(await app.markStripeOrderPaid('o1', session, { message: 'paid' })).toBe(true);
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(300);
});

test('a full Stripe refund of an order whose gift card fell short clears the alert', async () => {
  const app = harness({ ...order(), giftCardConflict: { provider: 'Stripe', at: 't' } }, card(100));
  await app.syncStripeReversal('o1', { charge: { amount: 1500, amount_refunded: 1500, refunded: true, currency: 'cad' }, source: 'test' });
  expect(app.docs.orders.o1.giftCardConflict.resolvedAt).toBeTruthy();
  expect(app.docs.orders.o1.paymentStatus).toBe('unpaid');
});

test('reads the cards the live payment was charged with, even when a re-pricing listed other cards', async () => {
  // The payment in flight was made with gc2; a later re-pricing left only gc1 on giftCardRedemptions.
  const app = harness({ ...order(), giftCardRedemptions: [{ id: 'gc1', minor: 500 }], chargedGiftCards: [{ id: 'gc2', minor: 500 }] }, card(800));
  app.docs.giftCards.gc2 = { balanceMinor: 900, enabled: true, holds: {}, history: [] };
  expect(await app.markStripeOrderPaid('o1', session, { message: 'paid' })).toBe(true);
  expect(app.docs.orders.o1.giftCardConflict).toBeUndefined();
  expect(app.docs.giftCards.gc2.balanceMinor).toBe(400);
  expect(app.docs.giftCards.gc1.balanceMinor).toBe(800);
});
