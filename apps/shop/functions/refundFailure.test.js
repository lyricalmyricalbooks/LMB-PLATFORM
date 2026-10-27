// A Stripe refund can be accepted (order → refund_pending, stock back, discount use and revenue
// reversed) and then fail at the bank. The customer still paid, so the order must go back to paid
// and every reversal must be undone — once.
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
import { REQUIRED_WEBHOOK_EVENTS, failedRefundId } from './stripeRecovery.js';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

function harness(order, { refunds = [], intent = null } = {}) {
  const docs = {
    orders: { o1: order },
    books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
    discounts: { d1: { code: 'TEN', usageCount: 3 } },
    giftCards: {},
    settings: { website: { payments: { stripe: { secretKey: 'sk_live_fake' } } } },
    analytics: {},
    'stripe-events': {},
    adminSecrets: {},
  };
  const ref = (name, id) => ({ name, id,
    async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
    async set(data, opts) { docs[name] ||= {}; docs[name][id] = opts?.merge ? { ...(docs[name][id] || {}), ...data } : data; },
    async update(data) { Object.assign(docs[name][id], data); },
  });
  const db = {
    collection(name) { return {
      doc: (id) => ref(name, id),
      where: (field, op, value) => ({ limit: () => ({ get: async () => { const hits = Object.entries(docs[name] || {}).filter(([, d]) => d[field] === value); return { empty: !hits.length, docs: hits.map(([id, d]) => ({ id, data: () => d })) }; } }) }),
    }; },
    async runTransaction(fn) {
      return fn({ get: (r) => r.get(), update: (r, data) => { Object.assign(docs[r.name][r.id], data); }, set: (r, data) => { docs[r.name] ||= {}; docs[r.name][r.id] = data; } });
    },
  };
  const increments = [];
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => { increments.push(n); return { inc: n }; } } }) };
  const wrap = (...args) => args.at(-1);
  const Stripe = class { constructor() {
    this.paymentIntents = { retrieve: async () => intent };
    this.refunds = { list: async () => ({ data: refunds }) };
    this.webhooks = { constructEvent: (body) => JSON.parse(body) };
  } };
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'whsec_fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const exposed = `${source}\nmodule.exports.__test = { applyOrderRefund, revertFailedRefund, checkStripeReversal };`;
  vm.runInNewContext(exposed, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { docs, increments, ...module.exports.__test, webhook: module.exports.stripeWebhook };
}

const paidOrder = () => ({
  paymentStatus: 'paid', status: 'open', stripeMode: 'live', stripePaymentIntentId: 'pi_1', total: 30, paidAt: '2026-10-01T10:00:00Z',
  items: [{ id: 'book', quantity: 2, price: 15 }], appliedDiscount: { id: 'd1', code: 'TEN' }, activity: [],
  refundRequest: { restock: true, reason: 'Customer asked', at: 't' },
});

async function pendingRefund() {
  const app = harness(paidOrder());
  await app.applyOrderRefund('o1', { provider: 'stripe', refundId: 're_1', amountMinor: 3000, currency: 'cad', status: 'pending', actor: 'admin' });
  expect(app.docs.orders.o1.paymentStatus).toBe('refund_pending');
  expect(app.docs.books.book.stockLevel).toBe(7);
  expect(app.docs.discounts.d1.usageCount).toBe(2);
  return app;
}

test('the webhook list includes failed-refund updates', () => {
  expect(REQUIRED_WEBHOOK_EVENTS).toContain('charge.refund.updated');
});

test('a failed refund puts the order back to paid and re-takes stock, discount use and revenue, once', async () => {
  const app = await pendingRefund();
  app.increments.length = 0;
  expect((await app.revertFailedRefund('o1', { refundId: 're_1', source: 'test' })).reverted).toBe(true);
  const order = app.docs.orders.o1;
  expect(order.paymentStatus).toBe('paid');
  expect(order.status).toBe('open');
  expect(order.refundRequest).toBeNull();
  expect(order.refund).toMatchObject({ id: 're_1', status: 'failed' });
  expect(order.inventoryRestockedAt).toBeNull();
  expect(order.discountUsageReversedAt).toBeNull();
  expect(order.activity.at(-1).message).toMatch(/refund failed/i);
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.docs.discounts.d1.usageCount).toBe(3);
  expect(app.increments).toEqual([1, 30, -1, -30]);
  // Twice (webhook retried, then the sweep): nothing more moves.
  expect((await app.revertFailedRefund('o1', { refundId: 're_1' })).reverted).toBe(false);
  expect(app.docs.books.book.stockLevel).toBe(5);
  expect(app.docs.discounts.d1.usageCount).toBe(3);
  // A later refund that succeeds restocks and reverses again.
  await app.applyOrderRefund('o1', { provider: 'stripe', refundId: 're_2', amountMinor: 3000, currency: 'cad', status: 'succeeded' });
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
  expect(app.docs.books.book.stockLevel).toBe(7);
});

test('a failure of a different refund than the one the order waits for changes nothing', async () => {
  const app = await pendingRefund();
  expect((await app.revertFailedRefund('o1', { refundId: 're_other' })).reverted).toBe(false);
  expect(app.docs.orders.o1.paymentStatus).toBe('refund_pending');
});

test('the charge.refund.updated webhook reverts a failed refund', async () => {
  const app = await pendingRefund();
  const event = { id: 'evt_1', type: 'charge.refund.updated', livemode: true, data: { object: { id: 're_1', object: 'refund', status: 'failed', failure_reason: 'expired_or_canceled_card', payment_intent: 'pi_1' } } };
  const res = { code: 200, status(c) { this.code = c; return this; }, send() { return this; }, json() { return this; } };
  await app.webhook({ method: 'POST', headers: { 'stripe-signature': 'sig' }, rawBody: Buffer.from(JSON.stringify(event)), body: event }, res);
  expect(res.code).toBe(200);
  expect(app.docs.orders.o1.paymentStatus).toBe('paid');
  expect(app.docs.books.book.stockLevel).toBe(5);
});

test('the reversal sweep treats a refund_pending order with nothing refunded and a failed refund as failed', async () => {
  const app = await pendingRefund();
  const intent = { metadata: { order_id: 'o1' }, latest_charge: { amount: 3000, amount_refunded: 0, refunded: false, currency: 'cad' } };
  const swept = harness(app.docs.orders.o1, { refunds: [{ id: 're_1', status: 'failed' }], intent });
  swept.docs.books.book.stockLevel = 7;
  swept.docs.discounts.d1.usageCount = 2;
  await swept.checkStripeReversal('o1', swept.docs.orders.o1, 'automatic check');
  expect(swept.docs.orders.o1.paymentStatus).toBe('paid');
  expect(swept.docs.books.book.stockLevel).toBe(5);
  expect(swept.docs.discounts.d1.usageCount).toBe(3);
});

test('failedRefundId waits while any refund is still pending or succeeded', () => {
  const order = { paymentStatus: 'refund_pending', refund: { id: 're_1' } };
  const charge = { amount_refunded: 0 };
  expect(failedRefundId(order, charge, [{ id: 're_1', status: 'failed' }])).toBe('re_1');
  expect(failedRefundId(order, charge, [{ id: 're_1', status: 'canceled' }])).toBe('re_1');
  expect(failedRefundId(order, charge, [{ id: 're_1', status: 'pending' }])).toBeNull();
  expect(failedRefundId(order, charge, [{ id: 're_1', status: 'failed' }, { id: 're_2', status: 'succeeded' }])).toBeNull();
  expect(failedRefundId(order, { amount_refunded: 3000 }, [{ id: 're_1', status: 'failed' }])).toBeNull();
  expect(failedRefundId({ ...order, paymentStatus: 'paid' }, charge, [{ id: 're_1', status: 'failed' }])).toBeNull();
  expect(failedRefundId(order, charge, [])).toBeNull();
});
