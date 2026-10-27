// A shopper whose earlier checkout attempt already took their money (card paid but the page never
// showed it, PayPal captured, webhook still on its way) must not be charged again on a new order.
import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { previousAttemptPaid } from './paymentGuards.js';

const realRequire = createRequire(import.meta.url);
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const config = { enabled: true, pickupLocations: [{ id: 'shop', enabled: true, name: 'Shop', price: 2, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } }], deliveryZones: [] };

function harness({ prev = null, intents = {}, order: orderExtra = {} } = {}) {
  const updates = [], stripeCalls = [], paypalCalls = [], cancelled = [];
  const order = { items: [{ id: 'book', quantity: 1, price: 0 }], trackingKey: 'a'.repeat(64), customer: { email: 'reader@example.com', name: 'Reader', address: null, billingAddress: { country: 'Canada', state: 'ON' } }, paymentStatus: 'unpaid', status: 'pending_payment', shipping: 0, fulfillmentSelection: { method: 'pickup', optionId: 'pickup:shop' }, ...orderExtra };
  const docs = {
    books: { book: { status: 'published', format: 'Paperback', retailPrice: 30, stockLevel: 9 } },
    settings: { website: { localFulfillment: config, taxes: { rates: [{ country: 'Canada', region: 'ON', rate: 13 }] }, payments: { stripe: { secretKey: 'sk_test_fake' }, manualMethods: [{ id: 'cash', enabled: true, name: 'Cash', instructions: 'Pay at pickup' }] } } },
    orders: prev ? { prev } : {},
  };
  const read = (name, id) => (name === 'orders' && id === 'order1' ? order : docs[name]?.[id]);
  const db = {
    collection(name) { return {
      doc(id) { return { _name: name, _id: id, async get() { const data = read(name, id); return { exists: !!data, data: () => data }; }, async update(change) { updates.push({ name, id, change }); if (name === 'orders' && id === 'order1') Object.assign(order, change); else { docs[name] ||= {}; Object.assign(docs[name][id] ||= {}, change); } }, async set(data) { docs[name] ||= {}; docs[name][id] = data; }, async delete() {}, async create(data) { docs[name] ||= {}; docs[name][id] = data; } }; },
      async get() { return { docs: Object.entries(docs[name] || {}).map(([id, data]) => ({ id, data: () => data })) }; },
      where() { const query = { where: () => query, limit: () => query, orderBy: () => query, async get() { return { empty: true, docs: [] }; } }; return query; },
    }; },
    async runTransaction(fn) { return fn({ get: async ref => { const data = read(ref._name, ref._id); return { exists: !!data, data: () => data }; }, set: (ref, data) => { docs[ref._name] ||= {}; docs[ref._name][ref._id] = data; }, update: (ref, data) => { Object.assign(read(ref._name, ref._id), data); }, delete: () => {} }); },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: n => ({ inc: n }), delete: () => undefined } }) };
  const wrap = (...args) => args.at(-1);
  const Stripe = class { constructor() {
    this.checkout = { sessions: { create: async payload => { stripeCalls.push(payload); return { id: 'cs_new', url: 'https://stripe.example/test' }; }, retrieve: async id => ({ id, status: 'open', payment_status: 'unpaid' }) } };
    this.paymentIntents = {
      create: async payload => { stripeCalls.push(payload); return { id: 'pi_new', client_secret: 'pi_new_secret_x' }; },
      retrieve: async id => ({ id, status: 'requires_payment_method', ...(intents[id] || {}) }),
      cancel: async id => { cancelled.push(id); return { id, status: 'canceled' }; },
    };
  } };
  const mockRequire = name => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const mockFetch = async (url, options) => {
    if (String(url).includes('er-api')) return { ok: true, json: async () => ({ rates: { USD: 1, EUR: 1 } }) };
    if (String(url).includes('paypal')) { paypalCalls.push({ url, options }); return { ok: true, json: async () => String(url).includes('oauth2') ? { access_token: 'token' } : { id: 'PAYPAL-1', links: [] } }; }
    throw new Error(`Unexpected network: ${url}`);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: mockFetch }, { filename: 'index.js' });
  async function call(handler, body = {}) {
    const response = { code: 200, value: null, set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } };
    await module.exports[handler]({ method: 'POST', body: { orderId: 'order1', currency: 'cad', previousOrderId: 'prev', ...body }, headers: { origin: 'http://localhost:5173', 'x-order-key': 'a'.repeat(64) }, socket: { remoteAddress: '127.0.0.1' } }, response);
    return response;
  }
  return { call, order, docs, updates, stripeCalls, paypalCalls, cancelled };
}

const prevOrder = (extra = {}) => ({ customer: { email: 'Reader@Example.com' }, paymentStatus: 'unpaid', status: 'pending_payment', items: [{ id: 'book', quantity: 1 }], stripeMode: 'live', ...extra });
const refusedFor = (response) => {
  expect(response.code).toBe(409);
  expect(response.value).toMatchObject({ code: 'previous_attempt_paid', previousOrderId: 'prev' });
};

test('pure rule: paid, captured, reconciling or Stripe-taken earlier attempts count as paid', () => {
  expect(previousAttemptPaid(prevOrder({ paymentStatus: 'paid' }))).toBe(true);
  expect(previousAttemptPaid(prevOrder({ paypalCaptureId: 'CAP' }))).toBe(true);
  expect(previousAttemptPaid(prevOrder({ reconciliationPending: { at: 't' } }))).toBe(true);
  expect(previousAttemptPaid(prevOrder(), { status: 'processing' }, null)).toBe(true);
  expect(previousAttemptPaid(prevOrder(), null, { payment_status: 'paid' })).toBe(true);
  expect(previousAttemptPaid(prevOrder(), { status: 'requires_payment_method' }, null)).toBe(false);
  expect(previousAttemptPaid(prevOrder({ status: 'cancelled', paypalCaptureId: 'CAP' }))).toBe(false);
  expect(previousAttemptPaid(prevOrder({ paymentStatus: 'pending' }))).toBe(false);
});

test('card form refuses a retry when the earlier attempt\'s Stripe payment went through, before touching this order', async () => {
  const app = harness({ prev: prevOrder({ stripePaymentIntentId: 'pi_prev' }), intents: { pi_prev: { status: 'succeeded' } } });
  const response = await app.call('createStripeCheckoutSession', { paymentElement: true });
  refusedFor(response);
  expect(app.stripeCalls).toHaveLength(0);
  expect(app.updates.filter(u => u.id === 'order1')).toHaveLength(0);
});

test('hosted Stripe checkout refuses when PayPal already captured the earlier attempt', async () => {
  const app = harness({ prev: prevOrder({ paypalCaptureId: 'CAP-1' }) });
  refusedFor(await app.call('createStripeCheckoutSession', {}));
  expect(app.stripeCalls).toHaveLength(0);
});

test('PayPal refuses when the earlier attempt is awaiting Stripe reconciliation', async () => {
  const app = harness({ prev: prevOrder({ reconciliationPending: { provider: 'stripe' } }) });
  refusedFor(await app.call('createPayPalOrder'));
  expect(app.paypalCalls).toHaveLength(0);
});

test('a free order and a manual-payment order refuse when the earlier attempt is already paid', async () => {
  const free = harness({ prev: prevOrder({ paymentStatus: 'paid' }), order: { paymentMethod: 'Free' } });
  refusedFor(await free.call('createStripeCheckoutSession', { action: 'completeFreeOrder' }));
  expect(free.order.paymentStatus).toBe('unpaid');
  const manual = harness({ prev: prevOrder({ paymentStatus: 'paid' }) });
  const response = await manual.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: { customer: { name: 'Reader', email: 'reader@example.com', billingAddress: { country: 'Canada', state: 'ON' } }, items: [{ id: 'book', quantity: 1 }], fulfillmentSelection: { method: 'pickup', optionId: 'pickup:shop' } } });
  refusedFor(response);
  expect(Object.keys(manual.docs.orders)).toEqual(['prev']);
});

test('an unpaid earlier attempt, or someone else\'s order, does not block the retry', async () => {
  const unpaid = harness({ prev: prevOrder({ stripePaymentIntentId: 'pi_prev' }) });
  expect((await unpaid.call('createStripeCheckoutSession', { paymentElement: true })).code).toBe(200);
  const other = harness({ prev: prevOrder({ paymentStatus: 'paid', customer: { email: 'someone@else.com' } }) });
  expect((await other.call('createStripeCheckoutSession', { paymentElement: true })).code).toBe(200);
});

test('a retry refused because this order\'s own payment is in progress leaves its pricing and gift cards untouched', async () => {
  const charged = [{ id: 'gc1', minor: 500, last4: 'PQRS' }];
  const app = harness({ order: { stripePaymentIntentId: 'pi_live', giftCardRedemptions: charged, chargedGiftCards: charged, giftCardAmount: 5 }, intents: { pi_live: { status: 'processing' } } });
  const response = await app.call('createStripeCheckoutSession', { paymentElement: true, previousOrderId: undefined });
  expect(response.code).toBe(409);
  expect(response.value.code).toBe('payment_in_progress');
  expect(app.updates.filter(u => u.id === 'order1')).toHaveLength(0);
  expect(app.order.giftCardRedemptions).toBe(charged);
  expect(app.stripeCalls).toHaveLength(0);
});
