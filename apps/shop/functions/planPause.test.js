// Pausing (code plan 6.7): while the shop's plan is paused or closed (the platform's public platform/status document),
// the checkout and order functions refuse new orders on the server, practice orders and manual orders included, and
// take them again once the plan is open. Same stand-in Firestore as localCheckoutHandlers.test.js.
import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { planPaused } from './shopSettings.js';

const realRequire = createRequire(import.meta.url);
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const pickup = { enabled: true, pickupLocations: [{ id: 'shop', enabled: true, name: 'Shop', price: 2, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' }, instructions: 'Call', hours: '10-5', estimate: 'Tomorrow' }], deliveryZones: [] };

function harness(status) {
  const stripeCalls = [], paypalCalls = [];
  const order = { items: [{ id: 'book', quantity: 1, price: 0 }], trackingKey: 'a'.repeat(64), customer: { email: 'reader@example.com', name: 'Reader', billingAddress: { country: 'Canada', state: 'ON' } }, paymentStatus: 'unpaid', status: 'pending_payment', shipping: 0, fulfillmentSelection: { method: 'pickup', optionId: 'pickup:shop' } };
  const docs = {
    books: { book: { status: 'published', format: 'Paperback', retailPrice: 30, stockLevel: 9 } },
    settings: { website: { localFulfillment: pickup, taxes: { rates: [{ country: 'Canada', region: 'ON', rate: 13 }] }, payments: { stripe: { secretKey: 'sk_test_fake' }, manualMethods: [{ id: 'cash', enabled: true, name: 'Cash', instructions: 'Pay at pickup' }] } } },
    platform: status ? { status } : {},
  };
  const read = (name, id) => (name === 'orders' ? (id === 'order1' ? order : docs.orders?.[id]) : docs[name]?.[id]);
  const db = {
    collection(name) { return {
      doc(id) { return { _name: name, _id: id, async get() { const data = read(name, id); return { exists: !!data, data: () => data }; }, async update(change) { if (name === 'orders' && id === 'order1') Object.assign(order, change); else Object.assign((docs[name] ||= {})[id] ||= {}, change); }, async create(data) { (docs.orders ||= {})[id] = data; } }; },
      async get() { return { docs: Object.entries(docs[name] || {}).map(([id, data]) => ({ id, data: () => data })) }; },
      where(field, op, value) { const query = { where: () => query, limit: () => query, async get() { const kept = Object.entries(docs[name] || {}).filter(([, data]) => data[field] === value).map(([id, data]) => ({ id, data: () => data })); return { empty: !kept.length, docs: kept }; } }; return query; },
    }; },
    async runTransaction(fn) { return fn({ get: async (ref) => { const data = read(ref._name, ref._id); return { exists: !!data, data: () => data }; }, set: (ref, data) => { (docs[ref._name] ||= {})[ref._id] = data; } }); },
  };
  const admin = { initializeApp() {}, firestore: () => db };
  const wrap = (...args) => args.at(-1);
  const Stripe = class { constructor() { this.checkout = { sessions: { create: async (payload) => { stripeCalls.push(payload); return { id: 'cs_test', url: 'https://stripe.example/test' }; } } }; this.paymentIntents = { create: async (payload) => { stripeCalls.push(payload); return { id: 'pi_test', client_secret: 'secret' }; } }; } };
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const fetch = async (url, options) => {
    if (String(url).includes('er-api')) return { ok: true, json: async () => ({ rates: { USD: 1, EUR: 1 } }) };
    if (String(url).includes('paypal')) {
      paypalCalls.push({ url, options });
      return { ok: true, json: async () => (String(url).includes('oauth2') ? { access_token: 'token' } : { id: 'PAYPAL-1', links: [] }) };
    }
    throw new Error(`Unexpected network: ${url}`);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch }, { filename: 'index.js' });
  async function call(handler, body = {}) {
    const response = { code: 200, value: null, set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } };
    await module.exports[handler]({ method: 'POST', body: { orderId: 'order1', currency: 'cad', ...body }, headers: { origin: 'http://localhost:5173', 'x-order-key': 'a'.repeat(64) }, socket: { remoteAddress: '127.0.0.1' } }, response);
    return response;
  }
  const manual = () => call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: { customer: order.customer, items: order.items, fulfillmentSelection: order.fulfillmentSelection } });
  return { call, manual, docs, stripeCalls, paypalCalls };
}

test.each(['paused', 'closed'])('a %s plan refuses card, PayPal and manual orders before any payment is opened', async (access) => {
  const app = harness({ access });
  const card = await app.call('createStripeCheckoutSession');
  expect(card.code).toBe(400);
  expect(card.value).toMatchObject({ code: 'shop_paused' });
  expect(card.value.error).toMatch(/short break/);
  expect((await app.call('createStripeCheckoutSession', { paymentElement: true })).code).toBe(400);
  expect((await app.call('createPayPalOrder')).code).toBe(400);
  expect((await app.manual()).code).toBe(400);
  expect(app.stripeCalls).toHaveLength(0);
  expect(app.paypalCalls.filter((c) => !String(c.url).includes('oauth2'))).toHaveLength(0);
  expect(Object.keys(app.docs.orders || {})).toHaveLength(0);
});

test('checkout is allowed again once the plan is open (a card was added)', async () => {
  const app = harness({ access: 'paused' });
  expect((await app.call('createStripeCheckoutSession')).code).toBe(400);
  app.docs.platform.status = { access: 'open', updatedAt: '2027-01-01T00:00:00.000Z' };
  const again = await app.call('createStripeCheckoutSession');
  expect(again.code).toBe(200);
  expect(app.stripeCalls).toHaveLength(1);
  expect((await app.manual()).code).toBe(200);
});

test('a shop with no plan document takes orders as before', async () => {
  const app = harness(null);
  expect((await app.call('createStripeCheckoutSession')).code).toBe(200);
});

test('only a plain "open" counts as open', () => {
  expect(planPaused(undefined)).toBe(false);
  expect(planPaused({})).toBe(false);
  expect(planPaused({ access: 'open' })).toBe(false);
  expect(planPaused({ access: 'paused' })).toBe(true);
  expect(planPaused({ access: 'closed' })).toBe(true);
  expect(planPaused({ access: 'OPEN' })).toBe(true);
  expect(planPaused({ access: null })).toBe(true);
});
