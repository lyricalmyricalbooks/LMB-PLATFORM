// Round-2 security fixes in the Cloud Functions: escaped admin-email links (#32), TTL on server-only bookkeeping
// (#72), rate-limited and bounded public actions (#106, #107, #110), no upstream error text (#108), the
// connecting address for the location signal (#109) and a cap on instances (#147).
import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'index.js'), 'utf8');
const { clientIpOf, serverGeoCountry, LIMITS } = realRequire('./rateLimit');
const { publicErrorMessage } = realRequire('./publicErrors');

function harness({ docs: initial = {}, stripeError = null, discountError = null } = {}) {
  const docs = structuredClone(initial);
  const counts = { retrieve: [], bookReads: 0, discountQueries: 0 };
  const globalOptions = [];
  const sent = [];
  const refOf = (name, id) => ({
    path: `${name}/${id}`, id,
    async get() {
      if (name === 'books') counts.bookReads++;
      const value = docs[name]?.[id];
      return { id, exists: value !== undefined, data: () => (value === undefined ? undefined : structuredClone(value)) };
    },
    async set(value, options) { docs[name] ||= {}; docs[name][id] = options?.merge ? { ...(docs[name][id] || {}), ...value } : value; },
    async update(change) { Object.assign(docs[name][id], change); },
    async delete() { delete docs[name]?.[id]; },
  });
  const query = (name, filters) => ({
    where(field, _op, value) { return query(name, [...filters, [field, value]]); },
    limit() { return query(name, filters); },
    async get() {
      if (name === 'discounts') { counts.discountQueries++; if (discountError) throw discountError; }
      const rows = Object.entries(docs[name] || {}).filter(([, v]) => filters.every(([f, val]) => v[f] === val));
      return { empty: !rows.length, docs: rows.map(([id, v]) => ({ id, data: () => structuredClone(v) })) };
    },
  });
  const db = {
    collection: (name) => ({ doc: (id) => refOf(name, id), ...query(name, []), add: async () => ({}) }),
    async runTransaction(fn) { return fn({ get: (ref) => ref.get(), set: (ref, v) => ref.set(v), update: (ref, v) => ref.update(v) }); },
  };
  const firestore = Object.assign(() => db, { FieldValue: { increment: (n) => n, serverTimestamp: () => 'now', delete: () => undefined } });
  const admin = { initializeApp() {}, firestore, auth: () => ({ verifyIdToken: async () => ({}) }), appCheck: () => ({}) };
  class Stripe {
    constructor() {
      this.paymentIntents = { retrieve: async (id) => { counts.retrieve.push(id); if (stripeError) throw stripeError; return { id, status: 'requires_payment_method', metadata: { order_id: 'A' } }; } };
    }
  }
  const wrap = (...args) => args.at(-1);
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name === 'firebase-functions/v2/options') return { setGlobalOptions: (o) => globalOptions.push(o) };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const patched = `${source}\nsendEmail = async (m) => { __sent.push(m); return { ok: true }; };\nautoApproveShippingAddress = async () => {};`;
  vm.runInNewContext(patched, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: 'off' } }, Buffer, console, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  const call = async (handler, body, headers = {}) => {
    const response = { code: 200, body: null, set() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
    await module.exports[handler]({ method: 'POST', headers, body }, response);
    return response;
  };
  return { docs, counts, globalOptions, sent, call, exports: module.exports };
}

const KEY = 'k'.repeat(64);
const unpaid = (extra = {}) => ({ orders: { A: { paymentStatus: 'unpaid', paymentMethod: 'Stripe', trackingKey: KEY, customer: { email: 'reader@example.com' }, ...extra } }, settings: { website: {} } });

describe('#147 instance cap', () => {
  test('every function is capped by a global maxInstances', () => {
    const app = harness();
    expect(app.globalOptions).toHaveLength(1);
    expect(app.globalOptions[0].maxInstances).toBeGreaterThan(0);
    expect(app.globalOptions[0].maxInstances).toBeLessThanOrEqual(20);
  });
});

describe('#32 admin email links', () => {
  const hostile = 'x"><a href="https://evil.example">Fulfil</a><b "';
  const order = (extra = {}) => ({ orderId: 'AB-1', customer: { name: 'Reader', email: 'reader@example.com', address: {} }, items: [{ id: 'b', title: 'Book', quantity: 1, price: 3 }], total: 3.39, subtotal: 3, shipping: 0, paymentMethod: 'Stripe', ...extra });
  test('a guest-chosen order id cannot add markup to the "Fulfil this order" email', async () => {
    const app = harness();
    await app.exports.onOrderUpdated({ data: { before: { data: () => order({ paymentStatus: 'unpaid' }) }, after: { data: () => order({ paymentStatus: 'paid' }) } }, params: { orderId: hostile } });
    const toShop = app.sent.filter((m) => m.to === 'lyricalmyricalbooks@gmail.com');
    expect(toShop.length).toBe(1);
    expect(toShop[0].html).not.toContain('href="https://evil.example"');
    expect(toShop[0].html).not.toContain(hostile);
    expect(toShop[0].html).toContain(encodeURIComponent(hostile));
  });
  test('every admin link built from an order id encodes it', () => {
    const raw = source.match(/admin#orders\/\$\{[^}]*\}/g) || [];
    expect(raw.length).toBeGreaterThan(0);
    for (const link of raw) expect(link).toMatch(/encodeURIComponent/);
  });
});

describe('#106 payment status check', () => {
  test('an unrelated payment id in the request never reaches Stripe', async () => {
    const app = harness({ docs: unpaid() });
    const res = await app.call('createStripeCheckoutSession', { action: 'status', orderId: 'A', key: KEY, paymentIntentId: 'pi_random' });
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ status: 'open', paymentStatus: 'unpaid' });
    expect(app.counts.retrieve).toEqual([]);
  });
  test('only the id saved on the order is looked up', async () => {
    const app = harness({ docs: unpaid({ stripePaymentIntentId: 'pi_saved' }) });
    await app.call('createStripeCheckoutSession', { action: 'status', orderId: 'A', key: KEY, paymentIntentId: 'pi_random' });
    expect(app.counts.retrieve).toEqual(['pi_saved']);
  });
  test('the action is rate limited per visitor', async () => {
    const app = harness({ docs: unpaid() });
    const codes = [];
    for (let i = 0; i < LIMITS.status.max + 5; i++) codes.push((await app.call('createStripeCheckoutSession', { action: 'status', orderId: 'A', key: KEY }, { 'x-forwarded-for': '203.0.113.7' })).code);
    expect(codes.filter((c) => c === 429).length).toBe(5);
  });
});

describe('#107 live shipping rates', () => {
  const address = { country: 'CA', city: 'Toronto', state: 'ON', zip: 'M5V1A1', street: '1 Main' };
  test('an unbounded item list is refused before any book is read', async () => {
    const app = harness();
    const res = await app.call('getShippoRates', { address, items: Array.from({ length: 51 }, (_, i) => ({ id: `b${i}`, quantity: 1 })) });
    expect(res.code).toBe(400);
    expect(app.counts.bookReads).toBe(0);
  });
  test('ids that are not plain document ids are refused', async () => {
    const app = harness();
    for (const items of [[{ id: 'a/b/c' }], [{ id: 5 }], [null], [{ id: '' }], [{ id: 'x'.repeat(200) }]]) {
      expect((await app.call('getShippoRates', { address, items })).code).toBe(400);
    }
    expect(app.counts.bookReads).toBe(0);
  });
});

describe('#108 errors for anonymous callers', () => {
  test('a database failure behind a discount code check is not echoed', async () => {
    const app = harness({ discountError: new Error('9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/x') });
    const res = await app.call('validateDiscountCode', { code: 'SUMMER' });
    expect(res.code).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/index|FAILED_PRECONDITION|console\.firebase/i);
    expect(res.body.error).toMatch(/could not be checked/i);
  });
  test('a shopper-facing refusal still reaches the shopper', async () => {
    const app = harness({ docs: { discounts: {} } });
    const res = await app.call('validateDiscountCode', { code: 'NOPE' });
    expect(res.body.error).toBe('Invalid or expired discount code');
  });
  test('publicErrorMessage keeps our own text and hides upstream text', () => {
    expect(publicErrorMessage(new Error('Choose between 1 and 50 books.'), 'fallback')).toBe('Choose between 1 and 50 books.');
    expect(publicErrorMessage(new Error('Shippo API error: 400 - {"detail":"bad"}'), 'fallback')).toBe('fallback');
    expect(publicErrorMessage(Object.assign(new Error('Invalid API Key provided: sk_****abcd'), { type: 'StripeAuthenticationError' }), 'fallback')).toBe('fallback');
    expect(publicErrorMessage(Object.assign(new Error('boom'), { code: 7 }), 'fallback')).toBe('fallback');
    expect(publicErrorMessage(Object.assign(new Error('nope'), { code: 'permission-denied' }), 'fallback')).toBe('fallback');
    expect(publicErrorMessage(new Error('x'.repeat(400)), 'fallback')).toBe('fallback');
  });
  test('no anonymous handler returns a raw err.message any more', () => {
    const betweenIn = (text, from, to) => { const i = text.indexOf(from); const j = text.indexOf(to, i + from.length); expect(i, from).toBeGreaterThan(-1); expect(j, to).toBeGreaterThan(i); return text.slice(i, j); };
    const between = (from, to) => betweenIn(source, from, to);
    const shippoSource = fs.readFileSync(path.join(here, 'shippoEndpoints.js'), 'utf8');
    const regions = {
      createPayPalOrder: between('exports.createPayPalOrder =', 'exports.capturePayPalOrder ='),
      capturePayPalOrder: between('exports.capturePayPalOrder =', 'exports.paypalWebhook ='),
      // Its payment steps live in checkoutPayment.js (moved out of index.js as is).
      createStripeCheckoutSession: between('exports.createStripeCheckoutSession =', 'function looksLikeStripeSignature') + fs.readFileSync(path.join(here, 'checkoutPayment.js'), 'utf8'),
      // handleCheckoutStatus lives in orderRequests.js (moved out of index.js as is).
      handleCheckoutStatus: (() => { const text = fs.readFileSync(path.join(here, 'orderRequests.js'), 'utf8'); const i = text.indexOf('async function handleCheckoutStatus'); const j = text.indexOf('async function handleTrackingLink', i); expect(i).toBeGreaterThan(-1); expect(j).toBeGreaterThan(i); return text.slice(i, j); })(),
      // The Shippo endpoints live in shippoEndpoints.js (moved out of index.js as is).
      getShippoRates: betweenIn(shippoSource, 'const getShippoRates =', 'const saveShippoConfig ='),
      validateAddress: betweenIn(shippoSource, 'const validateAddress =', 'const shippoWebhook ='),
      validateDiscountCode: between('exports.validateDiscountCode =', 'exports.onOrderCreated ='),
    };
    for (const [name, text] of Object.entries(regions)) expect(text, name).not.toMatch(/error: (?:err|pricingErr)\.message(?!\s*,\s*\.\.\.\(pricingErr)/);
  });
});

describe('#109 location signal', () => {
  test('uses the connecting address, not the client-typed first hop', () => {
    expect(clientIpOf({ headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9, 35.191.0.1' } })).toBe('203.0.113.9');
  });
  test('takes the country only from the platform header', () => {
    expect(serverGeoCountry({ headers: { 'x-appengine-country': 'ca' } })).toBe('CA');
    expect(serverGeoCountry({ headers: { 'x-appengine-country': 'ZZ' } })).toBe('');
    expect(serverGeoCountry({ headers: { 'x-appengine-country': '<script>' } })).toBe('');
    expect(serverGeoCountry({ headers: {} })).toBe('');
  });
  test('the storefront currency asks the platform header, never a database or a lookup', async () => {
    const app = harness();
    expect((await app.call('validateDiscountCode', { action: 'visitorCountry' }, { 'x-appengine-country': 'us' })).body).toEqual({ country: 'US' });
    expect((await app.call('validateDiscountCode', { action: 'visitorCountry' })).body).toEqual({ country: null });
    expect(app.counts.discountQueries || 0).toBe(0);
  });
  test('no shopper address is sent to a third-party lookup', () => {
    expect(source).not.toMatch(/ip-api\.com/);
    expect(source).not.toMatch(/req\.headers\["x-forwarded-for"\]/);
  });
});

describe('#110 automatic discounts', () => {
  const offers = { discounts: { d1: { method: 'automatic', title: 'Autumn', type: 'percentage', value: 10, status: 'active' } } };
  test('is rate limited', async () => {
    const app = harness({ docs: offers });
    const codes = [];
    for (let i = 0; i < LIMITS.autoDiscount.max + 3; i++) codes.push((await app.call('validateDiscountCode', { action: 'automaticDiscounts' }, { 'x-forwarded-for': '198.51.100.4' })).code);
    expect(codes.filter((c) => c === 429).length).toBe(3);
  });
  test('a loop of calls is one read of the discounts, not one per call', async () => {
    const app = harness({ docs: offers });
    for (let i = 0; i < 10; i++) await app.call('validateDiscountCode', { action: 'automaticDiscounts' });
    expect(app.counts.discountQueries).toBe(1);
  });
});

describe('#72 retention of server-only bookkeeping', () => {
  const indexes = JSON.parse(fs.readFileSync(path.join(here, '..', 'firestore.indexes.json'), 'utf8'));
  test('every throttle and event collection has a TTL on expiresAt', () => {
    const ttl = indexes.fieldOverrides.filter((o) => o.ttl === true && o.fieldPath === 'expiresAt').map((o) => o.collectionGroup).sort();
    expect(ttl).toEqual(['abandoned-cart-throttle', 'clientErrors', 'contact-email-throttle', 'email-claims', 'payment-webhook-events', 'rate-limits']);
  });
  test('the writers stamp expiresAt', () => {
    expect(fs.readFileSync(path.join(here, 'rateLimit.js'), 'utf8')).toMatch(/expiresAt: new Date/);
    expect(fs.readFileSync(path.join(here, 'emailThrottle.js'), 'utf8')).toMatch(/expiresAt: new Date/);
    expect(source).toMatch(/stripeEventId: event\.id,\s*processedAt: new Date\(\)\.toISOString\(\),\s*expiresAt: retainFor\(90\)/);
    expect(source).toMatch(/claimedAt: new Date\(\)\.toISOString\(\), expiresAt: retainFor\(400\)/);
    // Abandoned-cart reminders: one per address ever, so that record is kept (no expiresAt).
    expect(fs.readFileSync(path.join(here, 'scheduledJobs.js'), 'utf8')).toMatch(/tx\.set\(throttleRef, \{ lastSentAt: new Date\(\)\.toISOString\(\) \}\)/);
  });
});
