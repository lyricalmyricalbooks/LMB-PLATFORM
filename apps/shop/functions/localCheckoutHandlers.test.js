import { test, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const realRequire = createRequire(import.meta.url);
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const config = { enabled: true, pickupLocations: [{ id: 'shop', enabled: true, name: 'Shop', price: 2, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' }, instructions: 'Call', hours: '10-5', estimate: 'Tomorrow' }], deliveryZones: [] };
function harness({ method = 'pickup', optionId = 'pickup:shop', paymentStatus = 'unpaid', address = null, billingAddress = { country: 'Canada', state: 'ON' } } = {}) {
  const updates = [], stripeCalls = [], paypalCalls = [];
  const order = { items: [{ id: 'book', quantity: 1, price: 0, format: 'E-book' }], trackingKey: 'a'.repeat(64), customer: { email: 'reader@example.com', name: 'Reader', address, billingAddress }, paymentStatus, status: 'pending_payment', shipping: 0, fulfillmentSelection: { method, optionId }, fulfillment: { name: 'Forged', price: 0 } };
  const docs = {
    books: { book: { status: 'published', format: 'Paperback', retailPrice: 30, stockLevel: 9 } },
    settings: { website: { localFulfillment: config, taxes: { rates: [{ country: 'Canada', region: 'ON', rate: 13 }, { country: 'Canada', region: 'QC', rate: 5 }] }, payments: { stripe: { secretKey: 'sk_test_fake' }, manualMethods: [{ id: 'cash', enabled: true, name: 'Cash', instructions: 'Pay at pickup' }] } } },
    'private-integrations': { shippo: { dynamicRatesEnabled: true, dynamicRateCountries: ['CA'] } },
  };
  const db = {
    collection(name) { return {
      doc(id) { return { _name: name, _id: id, async get() { const data = name === 'orders' ? (id === 'order1' ? order : docs.orders?.[id]) : docs[name]?.[id]; return { exists: !!data, data: () => data }; }, async update(change) { updates.push(change); if (name === 'orders' && id === 'order1') Object.assign(order, change); else { docs[name] ||= {}; Object.assign(docs[name][id] ||= {}, change); } }, async create(data) { docs.orders ||= {}; docs.orders[id] = data; } }; },
      async get() { return { docs: Object.entries(docs[name] || {}).map(([id, data]) => ({ id, data: () => data })) }; },
      where(field, op, value) { const query = { where: (f2, o2, v2) => { const prev = query.get; query.get = async () => { const r = await prev(); const kept = r.docs.filter(d => d.data()[f2] === v2); return { empty: !kept.length, docs: kept }; }; return query; }, limit: () => query, async get() { const kept = Object.entries(docs[name] || {}).filter(([, data]) => data[field] === value).map(([id, data]) => ({ id, data: () => data })); return { empty: !kept.length, docs: kept }; } }; return query; },
    }; },
    async runTransaction(fn) { return fn({ get: async ref => { const data = ref._name === 'orders' ? (ref._id === 'order1' ? order : docs.orders?.[ref._id]) : docs[ref._name]?.[ref._id]; return { exists: !!data, data: () => data }; }, set: (ref, data) => { docs[ref._name] ||= {}; docs[ref._name][ref._id] = data; } }); },
  };
  const admin = { initializeApp() {}, firestore: () => db };
  const wrap = (...args) => args.at(-1);
  const Stripe = class { constructor() { this.checkout = { sessions: { create: async payload => { stripeCalls.push(payload); return { id: 'cs_test', url: 'https://stripe.example/test' }; } } }; this.paymentIntents = { create: async payload => { stripeCalls.push(payload); return { id: 'pi_test', client_secret: 'secret' }; } }; } };
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
    if (String(url).includes('paypal')) {
      paypalCalls.push({ url, options });
      return { ok: true, json: async () => String(url).includes('oauth2') ? { access_token: 'token' } : { id: 'PAYPAL-1', links: [] } };
    }
    throw new Error(`Unexpected network: ${url}`);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: mockFetch }, { filename: 'index.js' });
  async function call(handler, body = {}) { const response = { code: 200, value: null, set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } }; await module.exports[handler]({ method: 'POST', body: { orderId: 'order1', currency: 'cad', ...body }, headers: { origin: 'http://localhost:5173', 'x-order-key': 'a'.repeat(64) }, socket: { remoteAddress: '127.0.0.1' } }, response); return response; }
  return { call, order, updates, stripeCalls, paypalCalls, docs };
}
test.each([{}, { paymentElement: true }, { embedded: true }])('Stripe checkout charges current pickup fee and persists server snapshot %j', async body => {
  const app = harness(); const response = await app.call('createStripeCheckoutSession', body);
  expect(response.code).toBe(200);
  expect(app.order.shipping).toBe(2);
  expect(app.order.fulfillment).toMatchObject({ method: 'pickup', name: 'Shop', price: 2 });
  expect(app.stripeCalls).toHaveLength(1);
});
test('PayPal checkout uses validated local fee', async () => {
  const app = harness(); const response = await app.call('createPayPalOrder');
  expect(response.code).toBe(200);
  expect(app.order.fulfillment).toMatchObject({ method: 'pickup', price: 2 });
  expect(app.paypalCalls.some(call => String(call.options?.body).includes('"value":"35.90"'))).toBe(true);
});
test('unavailable local choice fails before live Shippo rates or payment', async () => {
  const app = harness({ optionId: 'pickup:gone' }); const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(400);
  expect(app.stripeCalls).toHaveLength(0);
});
test('PayPal rejects unavailable local choice before provider request', async () => {
  const app = harness({ optionId: 'pickup:gone' });
  const response = await app.call('createPayPalOrder');
  expect(response.code).toBe(400);
  expect(app.paypalCalls).toHaveLength(0);
});
test('digital-only order has no local charge or shipping call', async () => {
  const app = harness({ method: 'shipping', optionId: '' });
  app.docs.books.book.format = 'E-book';
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(200);
  expect(app.order.shipping).toBe(0);
  expect(app.order.fulfillment).toBeNull();
});
test('catalog digital variant cannot qualify for pickup using spoofed order format', async () => {
  const app = harness();
  app.docs.books.book.variants = [{ id: 'ebook', name: 'E-book', price: 10, stock: 9 }];
  app.order.items[0].variantId = 'ebook';
  app.order.items[0].format = 'Paperback';
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(400);
  expect(app.stripeCalls).toHaveLength(0);
});
test('forged isDigital flag cannot remove a physical book from local eligibility', async () => {
  const app = harness();
  app.order.items[0].isDigital = true;
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(200);
  expect(app.order.fulfillment).toMatchObject({ method: 'pickup', price: 2 });
  expect(app.order.items[0].isDigital).toBe(false);
});
test('legacy profile pickup rate cannot be purchased as shipping without configured location', async () => {
  const app = harness({ method: 'shipping', optionId: 'legacy-pickup', address: { street: '2 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } });
  app.docs['private-integrations'].shippo.dynamicRatesEnabled = false;
  app.docs['shipping-profiles'] = { general: { zones: [{ countries: ['CA'], rates: [{ id: 'legacy-pickup', name: 'Pickup', type: 'pickup', enabled: true }] }] } };
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(400);
  expect(app.stripeCalls).toHaveLength(0);
});
test('manual local action creates a new trusted unpaid order without opening provider', async () => {
  const app = harness(); const response = await app.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: { customer: app.order.customer, items: app.order.items, fulfillmentSelection: app.order.fulfillmentSelection, total: 0, fulfillment: { name: 'Forged' }, paymentStatus: 'paid' } });
  expect(response.code).toBe(200);
  const saved = app.docs.orders[response.value.orderId];
  expect(saved).toMatchObject({ paymentStatus: 'pending', total: 35.9, fulfillment: { method: 'pickup', name: 'Shop', price: 2 } });
  expect(app.stripeCalls).toHaveLength(0);
});
test('mixed pickup taxes physical merchandise at pickup and digital at billing province', async () => {
  const app = harness({ billingAddress: { country: 'Canada', state: 'QC' } });
  app.docs.books.ebook = { status: 'published', format: 'E-book', retailPrice: 10 };
  app.order.items.push({ id: 'ebook', quantity: 1, price: 0, format: 'Paperback' });
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(200);
  expect(app.order.tax).toBeCloseTo(4.4);
  expect(app.order.total).toBeCloseTo(46.4);
  expect(app.order.items[1].format).toBe('E-book');
});
test('pickup rejects missing billing province before opening payment', async () => {
  const app = harness({ billingAddress: null });
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(400);
  expect(app.stripeCalls).toHaveLength(0);
});
test('manual local creation rejects disabled method and ignores paid, price and snapshot fields', async () => {
  const app = harness();
  const draft = { customer: app.order.customer, items: app.order.items, fulfillmentSelection: app.order.fulfillmentSelection, total: 0, discount: 999, shipping: 0, fulfillment: { name: 'Forged' }, paymentStatus: 'paid', downloadToken: 'forged' };
  expect((await app.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'missing', orderDraft: draft })).code).toBe(400);
  const result = await app.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: draft });
  expect(result.code).toBe(200);
  const saved = app.docs.orders[result.value.orderId];
  expect(saved.total).toBe(35.9);
  expect(saved.paymentStatus).toBe('pending');
  expect(saved.downloadToken).toBeUndefined();
  expect(saved.fulfillment.name).toBe('Shop');
});
test('manual local creation rejects invalid catalog price before storing an order', async () => {
  const app = harness();
  app.docs.books.book.retailPrice = 'invalid';
  const result = await app.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: { customer: app.order.customer, items: app.order.items, fulfillmentSelection: app.order.fulfillmentSelection } });
  expect(result.code).toBe(400);
  expect(app.docs.orders).toBeUndefined();
});
test('unknown variant IDs are rejected before Stripe, PayPal or manual order creation', async () => {
  const stripe = harness();
  stripe.order.items[0].variantId = 'missing';
  expect((await stripe.call('createStripeCheckoutSession')).code).toBe(400);
  expect(stripe.stripeCalls).toHaveLength(0);
  const paypal = harness();
  paypal.order.items[0].variantId = 'missing';
  expect((await paypal.call('createPayPalOrder')).code).toBe(400);
  expect(paypal.paypalCalls).toHaveLength(0);
  const manual = harness();
  manual.order.items[0].variantId = 'missing';
  const result = await manual.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: { customer: manual.order.customer, items: manual.order.items, fulfillmentSelection: manual.order.fulfillmentSelection } });
  expect(result.code).toBe(400);
  expect(manual.docs.orders).toBeUndefined();
});
test('explicit stale shipping choice fails even with legacy no-zone profiles', async () => {
  const app = harness({ method: 'shipping', optionId: 'stale-rate', address: { street: '2 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } });
  app.docs['private-integrations'].shippo.dynamicRatesEnabled = false;
  const result = await app.call('createStripeCheckoutSession');
  expect(result.code).toBe(400);
  expect(app.stripeCalls).toHaveLength(0);
});
test('explicit no-zone rate charges the current displayed quote including zero-base rates', async () => {
  const app = harness({ method: 'shipping', optionId: 'legacy', address: { street: '2 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } });
  app.docs['private-integrations'].shippo.dynamicRatesEnabled = false;
  app.docs['shipping-profiles'] = { general: { base: 0, additional: 0, serviceName: 'Free local mail' } };
  const result = await app.call('createStripeCheckoutSession');
  expect(result.code).toBe(200);
  expect(app.order.shipping).toBe(0);
  expect(app.order.shippingMethod).toBe('Free local mail');
});
test('pre-order lines are stamped from the catalog, and a forged flag never sticks', async () => {
  const app = harness();
  app.docs.books.book = { ...app.docs.books.book, preorder: true, publishDate: '2999-01-15' };
  const response = await app.call('createStripeCheckoutSession');
  expect(response.code).toBe(200);
  expect(app.order.items[0]).toMatchObject({ preorder: true, releaseDate: '2999-01-15' });

  const plain = harness();
  plain.order.items[0].preorder = true;
  plain.order.items[0].releaseDate = '2999-01-15';
  expect((await plain.call('createStripeCheckoutSession')).code).toBe(200);
  expect(plain.order.items[0]).toMatchObject({ preorder: false, releaseDate: null });
});
test('a released pre-order (publication date passed) checks out as an ordinary book', async () => {
  const app = harness();
  app.docs.books.book = { ...app.docs.books.book, preorder: true, publishDate: '2001-01-01' };
  expect((await app.call('createStripeCheckoutSession')).code).toBe(200);
  expect(app.order.items[0]).toMatchObject({ preorder: false, releaseDate: null });
});
