// Practice checkout for platform shops (code plan 7.6): while the shop is private, the owner's own checkout pays through
// the press's test account for an hour. The flag is the server's; visitors, staff and an open shop never get it. A fake
// payment service stands in for the platform (Stripe and Square), so nothing reaches either.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { practiceCheckoutActions, practiceRefusal, PRACTICE_MS } = require('./practiceCheckout');
const { checkoutPaymentActions } = require('./checkoutPayment');
const { createPayments } = require('./payments/index.js');
const { createSettlement, sandboxStockTaken } = require('./settlePayment');
const { restockRefundedProblem } = require('./refundRestock');
const { countsAsSale } = require('./weeklySummary');
const { shopPrivate } = require('./shopSettings');

const NOW = Date.parse('2026-10-28T12:00:00Z');
const OWNER = { uid: 'owner-uid', email: 'owner@example.com', email_verified: true };
const STAFF = { uid: 'staff-uid', email: 'staff@example.com', email_verified: true, role: 'staff' };
const SHOPPER = { uid: 'shopper-uid', email: 'reader@example.com', email_verified: true };
const SUPPORT = { uid: 'support', firebase: { sign_in_provider: 'custom' }, support: { by: 'helper', reason: 'help', until: NOW / 1000 + 600, mode: 'edit' } };
const PRIVATE = { maintenance: { enabled: true, message: 'Back soon' }, payments: { testMode: false } };
const WALLED = { design: { showUnderConstruction: true }, payments: { testMode: false } };
const OPEN = { maintenance: { enabled: false }, payments: { testMode: false } };

function fakeDb({ website = PRIVATE, flag = null } = {}) {
  const docs = { 'settings/website': website, 'systemStatus/practiceCheckout': flag };
  const writes = [];
  return {
    docs, writes,
    collection: (name) => ({ doc: (id) => ({
      async get() { const data = docs[`${name}/${id}`]; return { exists: data != null, data: () => data }; },
      async set(data) { writes.push({ path: `${name}/${id}`, data }); docs[`${name}/${id}`] = data; },
    }) }),
  };
}

const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });
const reqAs = (token, body = {}) => ({ token, body, headers: token ? { authorization: 'Bearer t' } : {} });

function actions({ platform = true, ...dbOptions } = {}) {
  const db = fakeDb(dbOptions);
  const { handlePracticeCheckout, practiceFor } = practiceCheckoutActions({
    db, platform,
    // requireAdmin as index.js: owner and staff (and platform support) pass, everyone else gets 403.
    requireAdmin: async (req, out) => {
      if (req.token && (req.token === OWNER || req.token === STAFF || req.token === SUPPORT)) return req.token;
      out.status(403).json({ error: 'Admin access required' });
      return null;
    },
    orderRequestIdentity: async (req) => req.token || null,
    now: () => NOW,
  });
  const call = async (token, step) => { const out = res(); await handlePracticeCheckout(reqAs(token, { step }), out); return out; };
  return { db, call, practiceFor };
}

describe('who may start practice, and when', () => {
  test('the shop is private while checkout is paused or the wall is up', () => {
    expect(shopPrivate(PRIVATE)).toBe(true);
    expect(shopPrivate(WALLED)).toBe(true);
    expect(shopPrivate(OPEN)).toBe(false);
    expect(shopPrivate({})).toBe(false);
  });

  test('only the owner of a private platform shop', () => {
    expect(practiceRefusal({ platform: true, settings: PRIVATE, token: OWNER })).toBe(null);
    expect(practiceRefusal({ platform: true, settings: WALLED, token: OWNER })).toBe(null);
    expect(practiceRefusal({ platform: true, settings: OPEN, token: OWNER })).toBe('shop_open');
    expect(practiceRefusal({ platform: false, settings: PRIVATE, token: OWNER })).toBe('own_keys');
    for (const token of [STAFF, SHOPPER, SUPPORT, null, { ...OWNER, email_verified: false }]) {
      expect(practiceRefusal({ platform: true, settings: PRIVATE, token })).toBe('owner_only');
    }
  });

  test('the owner starts it for one hour; the flag records who', async () => {
    const shop = actions();
    const out = await shop.call(OWNER, 'start');
    expect(out.statusCode).toBe(200);
    expect(out.body).toEqual({ active: true, until: new Date(NOW + PRACTICE_MS).toISOString() });
    expect(PRACTICE_MS).toBe(60 * 60 * 1000);
    expect(shop.db.writes).toEqual([{ path: 'systemStatus/practiceCheckout', data: { uid: 'owner-uid', email: 'owner@example.com', startedAt: new Date(NOW).toISOString(), until: new Date(NOW + PRACTICE_MS).toISOString() } }]);
    expect((await shop.call(OWNER, 'status')).body).toEqual({ active: true, until: new Date(NOW + PRACTICE_MS).toISOString() });
  });

  test('refused when the shop is open, for staff, for platform support and for a shop with its own keys', async () => {
    const open = actions({ website: OPEN });
    expect(await open.call(OWNER, 'start')).toMatchObject({ statusCode: 409, body: { code: 'shop_open' } });
    const staff = actions();
    expect(await staff.call(STAFF, 'start')).toMatchObject({ statusCode: 403, body: { code: 'owner_only' } });
    expect(await staff.call(SUPPORT, 'start')).toMatchObject({ statusCode: 403, body: { code: 'owner_only' } });
    const ownKeys = actions({ platform: false });
    expect(await ownKeys.call(OWNER, 'start')).toMatchObject({ statusCode: 409, body: { code: 'own_keys' } });
    expect(await actions().call(SHOPPER, 'start')).toMatchObject({ statusCode: 403 });
    for (const shop of [open, staff, ownKeys]) expect(shop.db.writes).toEqual([]);
  });

  test('stop ends it at once; an expired or someone else\'s flag is off', async () => {
    const shop = actions();
    await shop.call(OWNER, 'start');
    expect((await shop.call(OWNER, 'stop')).body).toEqual({ active: false, until: '' });
    expect((await shop.call(OWNER, 'status')).body.active).toBe(false);
    const expired = actions({ flag: { uid: 'owner-uid', until: new Date(NOW - 1).toISOString() } });
    expect((await expired.call(OWNER, 'status')).body).toEqual({ active: false, until: '' });
    const opened = actions({ website: OPEN, flag: { uid: 'owner-uid', until: new Date(NOW + 1000).toISOString() } });
    expect((await opened.call(OWNER, 'status')).body).toEqual({ active: false, until: '', refusal: 'shop_open' });
  });
});

describe('practiceFor: the checkout\'s own check', () => {
  const running = { uid: 'owner-uid', until: new Date(NOW + 1000).toISOString() };

  test('the owner, while practice runs on a private shop: checkout open and test mode on, for this request only', async () => {
    const shop = actions({ flag: running });
    const practice = await shop.practiceFor(reqAs(OWNER));
    expect(practice.settings).toMatchObject({ maintenance: { enabled: false, message: 'Back soon' }, payments: { testMode: true } });
    expect(shop.db.docs['settings/website']).toEqual(PRIVATE);
    expect(shop.db.writes).toEqual([]);
  });

  test('a visitor, a signed-in shopper or staff never get it, even while it runs', async () => {
    const shop = actions({ flag: running });
    for (const token of [null, SHOPPER, STAFF, SUPPORT]) expect(await shop.practiceFor(reqAs(token))).toBe(null);
  });

  test('not once the shop opens, the hour ends, or on a shop with its own keys', async () => {
    expect(await actions({ website: OPEN, flag: running }).practiceFor(reqAs(OWNER))).toBe(null);
    expect(await actions({ flag: { ...running, until: new Date(NOW).toISOString() } }).practiceFor(reqAs(OWNER))).toBe(null);
    expect(await actions({ flag: null }).practiceFor(reqAs(OWNER))).toBe(null);
    expect(await actions({ platform: false, flag: running }).practiceFor(reqAs(OWNER))).toBe(null);
  });
});

// A pretend platform payment service for one provider: records the mode of each call and answers in the service's
// shapes. The press's account is a test account: live calls are refused, as services/payments does.
function fakeService(provider) {
  const calls = [];
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.mode === 'live') return reply(403, { error: { type: 'platform_error', code: 'test_only', message: 'This shop takes test payments only.' } });
    if (provider === 'square' && body.op === 'square.checkout.create') return reply(200, { id: 'LNK1', url: 'https://square.link/u/1', squareOrderId: 'ORD-LNK1' });
    if (body.op === 'checkout.sessions.create') return reply(200, { id: 'cs_new', url: 'https://checkout.stripe.example/cs_new' });
    if (body.op === 'paymentIntents.create') return reply(200, { id: 'pi_new', client_secret: 'pi_new_secret', amount: body.args.params.amount });
    return reply(400, { error: { code: 'bad_request', message: `unknown call ${body.op}` } });
  };
  return { fetch, calls };
}

class PricingError extends Error { constructor(message, code) { super(message); this.code = code; } }

// The real checkout step with the real payments module in platform mode; pricing honours the store status as
// index.js's priceOrder does (store_closed while checkout is paused, unless the settings passed in say otherwise).
function checkoutShop({ provider = 'stripe', website = PRIVATE, flag = null, order: orderExtra = {} } = {}) {
  const shop = actions({ website, flag });
  const service = fakeService(provider);
  const holds = [];
  const order = { customer: { email: 'owner@example.com', address: { country: 'Canada' } }, items: [{ id: 'book', quantity: 1 }], ...orderExtra };
  const orderRef = { get: async () => ({ exists: true, data: () => order }), update: async (data) => Object.assign(order, data) };
  const payments = createPayments({
    provider, mode: 'platform', service: { url: 'https://payments.platform.example', shopId: 'moth-press', fetch: service.fetch, serviceKey: () => 'key' },
    db: shop.db, Stripe: class { constructor() { throw new Error('no Stripe client in platform mode'); } },
    liveSecretKey: { value: () => '' }, readAdminSecret: async () => ({}),
  });
  const { handleStripeCheckout } = checkoutPaymentActions({
    ALLOWED_ORIGINS: ['https://moth-press.web.app'],
    canViewOrder: () => true, checkoutCurrencyOf: (c) => (c || 'cad').toLowerCase(), checkoutRefusal: () => null,
    clientIpOf: () => '203.0.113.1', db: { collection: () => ({ doc: () => orderRef }) }, FALLBACK_RATES: { cad: 1 },
    getCountryCode: () => 'CA', getExchangeRates: async () => ({ cad: 1 }), GiftCardError: class extends Error {},
    orderRequestIdentity: async (req) => req.token || null, orderRequestKey: () => 'key', payments,
    priceOrder: async (o, { settings: known = null } = {}) => {
      const settings = known || website;
      if (settings.maintenance?.enabled) throw new PricingError('The shop is paused for maintenance, so checkout is closed for now.', 'store_closed');
      return { items: [{ id: 'book', title: 'Book', price: 20, quantity: 1 }], settings, appliedDiscount: null, fulfillment: null, shippingEstimate: null,
        subtotal: 20, discount: 0, shipping: 0, shippingMethod: null, tax: 0, giftCardAmount: 0, giftCardRedemptions: [], total: 20 };
    },
    PricingError, publicErrorMessage: (err, fallback) => fallback, refusePreviousAttemptPaid: () => false,
    releaseSupersededAttempt: async () => null,
    reserveCheckout: async (orderId, lines, held, redemptions, mode) => { holds.push({ orderId, mode }); },
    serverGeoCountry: () => null, StockHoldError: class extends Error {}, stripeIntentKey: () => 'intent-key',
    testShop: false, practiceFor: shop.practiceFor,
  });
  const run = async (token, body = {}) => {
    const out = res();
    await handleStripeCheckout({ token, body: { orderId: 'o1', currency: 'cad', returnUrl: 'https://moth-press.web.app/checkout', ...body }, headers: {} }, out);
    return out;
  };
  return { run, order, holds, service };
}

describe('a practice order through the platform (fake Stripe and fake Square)', () => {
  const running = { uid: 'owner-uid', until: new Date(NOW + 1000).toISOString() };

  test('Stripe: the owner\'s card form pays in test mode, and the order is marked and holds its stock', async () => {
    const shop = checkoutShop({ flag: running });
    const out = await shop.run(OWNER, { paymentElement: true, practice: true });
    expect(out.statusCode).toBe(200);
    expect(out.body).toMatchObject({ clientSecret: 'pi_new_secret', stripeMode: 'test' });
    expect(shop.service.calls.map(c => [c.op, c.mode])).toEqual([['paymentIntents.create', 'test']]);
    expect(shop.order).toMatchObject({ practiceOrder: true, stripeMode: 'test', stripePaymentIntentId: 'pi_new' });
    expect(shop.holds).toEqual([{ orderId: 'o1', mode: true }]);
  });

  test('Square: the owner goes to a Sandbox payment page', async () => {
    const shop = checkoutShop({ provider: 'square', flag: running });
    const out = await shop.run(OWNER, { embedded: false, practice: true });
    expect(out.statusCode).toBe(200);
    expect(out.body.url).toBe('https://square.link/u/1');
    expect(shop.service.calls.map(c => [c.op, c.mode])).toEqual([['square.checkout.create', 'test']]);
    expect(shop.order).toMatchObject({ practiceOrder: true, stripeMode: 'test' });
  });

  test('a visitor meets the closed checkout while the owner practises, and nothing reaches the payment service', async () => {
    for (const provider of ['stripe', 'square']) {
      for (const token of [null, SHOPPER]) {
        const shop = checkoutShop({ provider, flag: running });
        const out = await shop.run(token, { paymentElement: provider === 'stripe' });
        expect(out).toMatchObject({ statusCode: 400, body: { code: 'store_closed' } });
        expect(shop.service.calls).toEqual([]);
        expect(shop.order.practiceOrder).toBeUndefined();
      }
    }
  });

  test('a visitor who sends practice: true gets no practice either', async () => {
    const shop = checkoutShop({ flag: running });
    const out = await shop.run(SHOPPER, { paymentElement: true, practice: true });
    expect(out).toMatchObject({ statusCode: 409, body: { code: 'practice_ended' } });
    expect(shop.service.calls).toEqual([]);
  });

  test('once the shop opens, an expected practice order is refused, never charged for real', async () => {
    const shop = checkoutShop({ website: OPEN, flag: running });
    const out = await shop.run(OWNER, { paymentElement: true, practice: true });
    expect(out).toMatchObject({ statusCode: 409, body: { code: 'practice_ended' } });
    expect(shop.service.calls).toEqual([]);
  });

  test('a practice order\'s retry after the hour is refused, even if the browser forgot', async () => {
    const shop = checkoutShop({ website: WALLED, flag: { ...running, until: new Date(NOW - 1).toISOString() }, order: { practiceOrder: true } });
    const out = await shop.run(OWNER, { paymentElement: true });
    expect(out).toMatchObject({ statusCode: 409, body: { code: 'practice_ended' } });
    expect(shop.service.calls).toEqual([]);
  });
});

describe('a paid practice order stays out of the totals', () => {
  function settle(orderExtra) {
    const docs = {
      orders: { o1: { paymentStatus: 'unpaid', status: 'pending_payment', total: 20, activity: [], items: [{ id: 'book', quantity: 1, price: 20 }], stripeMode: 'test', ...orderExtra } },
      books: { book: { status: 'published', stockLevel: 5, trackInventory: true } },
    };
    const analytics = [];
    const ref = (name, id) => ({ name, id,
      async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
      async set(data) { if (name === 'analytics') analytics.push(data); },
      async update(data) { Object.assign(docs[name][id], data); },
    });
    const db = {
      collection: (name) => ({ doc: (id) => ref(name, id), where: () => ({ get: async () => ({ docs: [], empty: true }) }) }),
      runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, data) => Object.assign(docs[r.name][r.id], data), set: () => {} }),
    };
    return { docs, analytics, settlePayment: createSettlement({ db, increment: (n) => ({ inc: n }) }).settlePayment };
  }

  test('the test payment marks it a test order, takes its stock and records no revenue', async () => {
    const shop = settle({ practiceOrder: true });
    expect(await shop.settlePayment('o1', { provider: 'Stripe', message: 'paid', sandbox: () => true })).toMatchObject({ paid: true });
    const order = shop.docs.orders.o1;
    expect(order).toMatchObject({ practiceOrder: true, isTest: true, sandboxPayment: true, paymentStatus: 'paid' });
    expect(shop.docs.books.book.stockLevel).toBe(4);
    expect(shop.analytics).toEqual([]);
    expect(countsAsSale(order)).toBe(false);
    // Its refund may put the books back, as on the test shop.
    expect(sandboxStockTaken(order, false)).toBe(true);
    expect(restockRefundedProblem({ ...order, paymentStatus: 'refunded', status: 'refunded' })).toBe('');
  });

  test('an ordinary sandbox payment on the same shop still takes no stock', async () => {
    const shop = settle({});
    await shop.settlePayment('o1', { provider: 'Stripe', message: 'paid', sandbox: () => true });
    expect(shop.docs.books.book.stockLevel).toBe(5);
    expect(sandboxStockTaken(shop.docs.orders.o1, false)).toBe(false);
  });
});
