// Gift card plus card on a Square shop (code plan 5.3), as a Stripe shop's card form does it: the gift card pays first and
// Square's page charges only the rest; a partial refund comes off the card only, and a full refund gives back the card
// payment, then the gift card. The checkout, the paid event and the refunds run through the real shop code; a pretend
// platform payment service answers the Square calls (services/payments tests the Square side), so nothing reaches Square.
import { describe, expect, test, afterEach } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const realRequire = createRequire(import.meta.url);
const { checkoutPaymentActions } = realRequire('./checkoutPayment');
const { createPayments } = realRequire('./payments/index.js');
const { readShopConfig } = realRequire('./shopConfig');
const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');

const SERVICE_URL = 'https://payments.platform.example';
const RETURN_URL = 'https://moth-press.web.app/checkout';
const OWNER = { uid: 'owner-uid', email: 'owner@example.com', email_verified: true };

// The platform's payment service for a Square shop: a payment page charges its lines less the gift card's share, as
// Square's order does with its "Gift card" discount. Refunds never go past what the card paid.
function fakeSquare() {
  const calls = [];
  const world = { links: new Map(), payments: new Map(), refunds: new Map() };
  world.pay = (linkId) => {
    const link = world.links.get(linkId);
    const payment = { id: `PAY${world.payments.size + 1}`, status: 'COMPLETED', amountMinor: link.totalMinor, totalMinor: link.totalMinor, currency: 'CAD', refundedMinor: 0, appFeeMinor: 0, referenceId: link.referenceId, refundIds: [], createdAt: new Date().toISOString() };
    world.payments.set(payment.id, payment);
    link.paymentIds = [payment.id];
    link.state = 'COMPLETED';
    return payment;
  };
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetch = async (url, init) => {
    if (!String(url).startsWith(SERVICE_URL)) throw new Error(`Unexpected network: ${url}`);
    const { op, mode, args } = JSON.parse(init.body);
    calls.push({ op, mode, args });
    if (op === 'square.checkout.create') {
      const lines = args.params.lineItems.reduce((sum, l) => sum + l.unitAmountMinor * l.quantity, 0);
      const totalMinor = lines - (args.params.giftCardMinor || 0);
      if (totalMinor < 1) return reply(400, { error: { code: 'bad_request', message: 'the order must charge something' } });
      const link = { id: `LNK${world.links.size + 1}`, url: 'https://square.link/u/1', referenceId: args.params.referenceId, state: 'OPEN', totalMinor, currency: 'CAD', paymentIds: [] };
      world.links.set(link.id, link);
      return reply(200, { id: link.id, url: link.url });
    }
    if (op === 'square.payments.retrieve') return reply(200, { ...world.payments.get(args.id) });
    if (op === 'square.refunds.create') {
      const payment = world.payments.get(args.params.paymentId);
      const left = payment.totalMinor - payment.refundedMinor;
      const amountMinor = args.params.amountMinor ?? left;
      if (amountMinor > left) return reply(400, { error: { code: 'bad_request', message: 'more than the payment' } });
      const refund = { id: `RFD${world.refunds.size + 1}`, status: 'COMPLETED', amountMinor, currency: 'CAD', paymentId: payment.id };
      world.refunds.set(refund.id, refund);
      payment.refundedMinor += amountMinor;
      return reply(200, refund);
    }
    return reply(400, { error: { code: 'bad_request', message: `unknown call ${op}` } });
  };
  return { fetch, calls, world };
}

const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });

// A 50.00 order (a 40.00 book and 10.00 shipping) with a 15.00 gift card, priced by the server.
const PRICED = {
  items: [{ id: 'book', title: 'Moth Book', price: 40, quantity: 1 }], appliedDiscount: null, fulfillment: null, shippingEstimate: null,
  subtotal: 40, discount: 0, shipping: 10, shippingMethod: null, tax: 0, giftCardAmount: 15, giftCardRedemptions: [{ id: 'gc1', minor: 1500 }], total: 35,
};

// The real checkout step and the real payments module in platform mode, for one provider.
function checkout({ provider = 'square', priced = PRICED } = {}) {
  const service = fakeSquare();
  const stripeCalls = [];
  const fetch = provider === 'square' ? service.fetch : async (_url, init) => {
    const body = JSON.parse(init.body);
    stripeCalls.push(body);
    const reply = (b) => ({ ok: true, status: 200, json: async () => b });
    if (body.op === 'paymentIntents.create') return reply({ id: 'pi_new', client_secret: 'pi_new_secret', amount: body.args.params.amount });
    return reply({ id: 'cs_new', url: 'https://checkout.stripe.example/cs_new' });
  };
  const settings = { payments: { testMode: false } };
  const holds = [];
  const order = { customer: { email: 'reader@example.com', address: { country: 'Canada' } }, items: [{ id: 'book', quantity: 1 }], giftCards: [{ code: 'GIFT-0001' }] };
  const orderRef = { get: async () => ({ exists: true, data: () => order }), update: async (data) => Object.assign(order, data) };
  const payments = createPayments({
    provider, mode: 'platform', service: { url: SERVICE_URL, shopId: 'moth-press', fetch, serviceKey: () => 'key' },
    db: { collection: () => ({ doc: () => orderRef }) }, Stripe: class { constructor() { throw new Error('no Stripe client in platform mode'); } },
    liveSecretKey: { value: () => '' }, readAdminSecret: async () => ({}),
  });
  const { handleStripeCheckout } = checkoutPaymentActions({
    ALLOWED_ORIGINS: ['https://moth-press.web.app'],
    canViewOrder: () => true, checkoutCurrencyOf: (c) => (c || 'cad').toLowerCase(), checkoutRefusal: () => null,
    clientIpOf: () => '203.0.113.1', db: { collection: () => ({ doc: () => orderRef }) }, FALLBACK_RATES: { cad: 1 },
    getCountryCode: () => 'CA', getExchangeRates: async () => ({ cad: 1 }), GiftCardError: class extends Error {},
    orderRequestIdentity: async () => null, orderRequestKey: () => 'key', payments,
    priceOrder: async () => ({ ...priced, settings }),
    PricingError: class extends Error {}, publicErrorMessage: (err, fallback) => fallback, refusePreviousAttemptPaid: () => false,
    releaseSupersededAttempt: async () => null,
    reserveCheckout: async (orderId, lines, held, redemptions, testMode) => { holds.push({ orderId, redemptions, testMode }); },
    serverGeoCountry: () => null, StockHoldError: class extends Error {}, stripeIntentKey: () => 'intent-key',
    testShop: false, practiceFor: async () => null,
  });
  const run = async (body = {}) => {
    const out = res();
    await handleStripeCheckout({ token: null, body: { orderId: 'o1', currency: 'cad', returnUrl: RETURN_URL, ...body }, headers: {} }, out);
    return out;
  };
  return { run, order, holds, service, stripeCalls };
}

describe('checkout: the gift card pays first, Square takes the rest', () => {
  test('Square\'s page is asked for every line less the gift card, and the order expects only that from the card', async () => {
    const shop = checkout();
    const out = await shop.run({ embedded: false });
    expect(out.statusCode).toBe(200);
    expect(out.body.url).toBe('https://square.link/u/1');
    const made = shop.service.calls.find((c) => c.op === 'square.checkout.create');
    expect(made.mode).toBe('live');
    expect(made.args.params.lineItems.reduce((sum, l) => sum + l.unitAmountMinor * l.quantity, 0)).toBe(5000);
    expect(made.args.params.giftCardMinor).toBe(1500);
    expect(shop.service.world.links.get('LNK1').totalMinor).toBe(3500);
    // The webhook settles only the card's share; the gift card is debited when it does.
    expect(shop.order).toMatchObject({ expectedAmountMinor: 3500, expectedCurrency: 'cad', chargedGiftCards: [{ id: 'gc1', minor: 1500 }], giftCardAmount: 15, total: 35 });
    // The gift card is held with the stock while the page is open.
    expect(shop.holds).toEqual([{ orderId: 'o1', redemptions: [{ id: 'gc1', minor: 1500 }], testMode: false }]);
  });

  test('an order the gift card covers has nothing for Square to take', async () => {
    const shop = checkout({ priced: { ...PRICED, giftCardAmount: 50, giftCardRedemptions: [{ id: 'gc1', minor: 5000 }], total: 0 } });
    const out = await shop.run({ embedded: false });
    expect(out).toMatchObject({ statusCode: 400, body: { code: 'nothing_to_charge' } });
    expect(shop.service.calls).toEqual([]);
  });

  test('without a gift card the page charges every line, as before', async () => {
    const shop = checkout({ priced: { ...PRICED, giftCardAmount: 0, giftCardRedemptions: [], total: 50 } });
    expect((await shop.run({ embedded: false })).statusCode).toBe(200);
    const made = shop.service.calls.find((c) => c.op === 'square.checkout.create');
    expect(made.args.params.giftCardMinor).toBeUndefined();
    expect(shop.order.expectedAmountMinor).toBe(5000);
  });

  test('a Stripe shop is unchanged: gift cards on the card form only, which charges the same rest', async () => {
    const hosted = checkout({ provider: 'stripe' });
    expect(await hosted.run({ embedded: false })).toMatchObject({ statusCode: 400, body: { code: 'gift_card_rejected' } });
    expect(hosted.stripeCalls).toEqual([]);
    const form = checkout({ provider: 'stripe' });
    expect((await form.run({ paymentElement: true })).statusCode).toBe(200);
    expect(form.stripeCalls.find((c) => c.op === 'paymentIntents.create').args.params.amount).toBe(3500);
    expect(form.order).toMatchObject({ expectedAmountMinor: 3500, chargedGiftCards: [{ id: 'gc1', minor: 1500 }] });
  });
});

// ── The paid event and the refunds, through index.js as a Square shop ────────────────────────────────────────────────

const getPath = (data, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), data);
function patch(current, change) {
  const out = { ...(current || {}) };
  for (const [key, value] of Object.entries(change)) {
    const next = value && typeof value === 'object' && '__inc' in value ? (Number(getPath(out, key)) || 0) + value.__inc : value;
    if (key.includes('.')) {
      const parts = key.split('.');
      let cursor = out;
      parts.slice(0, -1).forEach((part) => { cursor[part] = { ...(cursor[part] || {}) }; cursor = cursor[part]; });
      cursor[parts.at(-1)] = next;
    } else out[key] = next;
  }
  return out;
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function squareShop(docs) {
  const square = fakeSquare();
  // functions/payments reaches the platform with the global fetch; the pretend service answers it.
  globalThis.fetch = square.fetch;
  const store = (name) => (docs[name] ||= {});
  const docRef = (name, id) => ({
    _name: name, _id: id, id,
    async get() { const data = store(name)[id]; return { exists: data !== undefined, id, data: () => data, ref: docRef(name, id) }; },
    async set(data, opts) { store(name)[id] = opts?.merge ? patch(store(name)[id], data) : data; },
    async update(change) { store(name)[id] = patch(store(name)[id], change); },
    async create(data) { if (store(name)[id] !== undefined) throw Object.assign(new Error('exists'), { code: 6 }); store(name)[id] = data; },
    async delete() { delete store(name)[id]; },
  });
  const query = (name, filters = [], max = Infinity) => ({
    where(field, op, value) { return query(name, [...filters, { field, op, value }], max); },
    limit(n) { return query(name, filters, n); },
    orderBy() { return this; },
    async get() {
      const hits = Object.entries(store(name)).filter(([, data]) => filters.every(({ field, op, value }) => {
        const actual = getPath(data, field);
        if (op === '==') return actual === value;
        if (op === 'in') return value.includes(actual);
        if (op === '<=') return actual <= value;
        if (op === '>=') return actual >= value;
        return true;
      })).slice(0, max).map(([id, data]) => ({ id, data: () => data, ref: docRef(name, id) }));
      return { empty: !hits.length, docs: hits, size: hits.length, forEach: (fn) => hits.forEach(fn) };
    },
  });
  const db = {
    collection(name) { return { doc: (id) => docRef(name, id), ...query(name) }; },
    async runTransaction(fn) {
      return fn({
        get: async (ref) => (ref.get ? ref.get() : ref),
        set: (ref, data, opts) => { store(ref._name)[ref._id] = opts?.merge ? patch(store(ref._name)[ref._id], data) : data; },
        create: (ref, data) => { store(ref._name)[ref._id] = data; },
        update: (ref, change) => { store(ref._name)[ref._id] = patch(store(ref._name)[ref._id], change); },
        delete: (ref) => { delete store(ref._name)[ref._id]; },
      });
    },
    batch() { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, c) => ops.push(() => r.update(c)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const op of ops) await op(); } }; },
  };
  const FieldValue = { increment: (n) => ({ __inc: n }), delete: () => undefined, serverTimestamp: () => new Date().toISOString(), arrayUnion: (...v) => v };
  const admin = {
    initializeApp() {},
    firestore: Object.assign(() => db, { FieldValue }),
    auth: () => ({ verifyIdToken: async () => OWNER }),
  };
  // The shop's settings for a Square shop on the platform, as its deploy writes them.
  const config = { shopConfig: readShopConfig({ ...process.env, SHOP_PAYMENT_PROVIDER: 'square', SHOP_PAYMENT_MODE: 'platform', SHOP_PAYMENTS_SERVICE_URL: SERVICE_URL }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === './shopConfig') return { ...realRequire('./shopConfig'), ...config };
    if (name === './platformKey') return { ...realRequire('./platformKey'), usesPlatformServices: () => true, platformServiceKey: () => 'platform-key-fake' };
    if (name === 'stripe') return class { constructor() { throw new Error('a Square shop makes no Stripe client'); } };
    if (name === 'resend') return { Resend: class { constructor() { this.emails = { send: async () => ({ data: { id: 'e' } }) }; } } };
    if (name === 'nodemailer') return { createTransport: () => ({ sendMail: async () => ({ messageId: 'x' }) }) };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'platform-key-fake' }) };
    return realRequire(name);
  };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: square.fetch }, { filename: 'index.js' });
  const call = async (handler, req) => {
    const out = { code: 200, value: null, set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } };
    await mod.exports[handler]({ method: 'POST', headers: { origin: 'http://localhost:5173' }, socket: { remoteAddress: '127.0.0.1' }, ...req }, out);
    return out;
  };
  const refund = (body) => call('refundOrder', { body: { orderId: 'o1', reason: 'Customer asked', ...body }, headers: { origin: 'http://localhost:5173', authorization: 'Bearer tok' } });
  return { docs, square, call, refund };
}

// The order as the checkout above leaves it, its page paid, the 15.00 gift card held for it.
async function paidOrder() {
  const placed = checkout();
  await placed.run({ embedded: false });
  const docs = {
    settings: { website: { payments: { testMode: false } } },
    books: { book: { status: 'published', stockLevel: 5, trackInventory: true, title: 'Moth Book' } },
    giftCards: { gc1: { code: 'GIFT-0001', enabled: true, initialMinor: 2000, balanceMinor: 2000, holds: { o1: 1500 }, history: [] } },
    orders: { o1: { ...placed.order, paymentStatus: 'unpaid', status: 'pending_payment', fulfillmentStatus: 'unfulfilled', paymentMethod: 'Stripe', checkoutCurrency: 'CAD', activity: [], createdAt: new Date().toISOString() } },
  };
  const shop = squareShop(docs);
  shop.square.world.links.set(placed.order.stripeCheckoutSessionId.replace(/^sqlink_/, ''), { ...placed.service.world.links.get('LNK1') });
  const payment = shop.square.world.pay(placed.order.stripeCheckoutSessionId.replace(/^sqlink_/, ''));
  const event = await shop.call('stripeWebhook', { rawBody: Buffer.from(JSON.stringify({ event_id: 'evt-paid-1', type: 'payment.updated', data: { type: 'payment', id: payment.id } })), headers: {} });
  expect(event.code).toBe(200);
  return { shop, payment };
}

describe('the payment and the refunds', () => {
  test('Square\'s payment of the rest marks the order paid and takes the gift card\'s share off it', async () => {
    const { shop, payment } = await paidOrder();
    const order = shop.docs.orders.o1;
    expect(order).toMatchObject({ paymentStatus: 'paid', stripePaymentIntentId: `sqpay_${payment.id}`, stripeAmountTotal: 3500 });
    expect(shop.docs.giftCards.gc1.balanceMinor).toBe(500);
    expect(shop.docs.giftCards.gc1.holds).toEqual({});
  });

  test('a partial refund comes off the card only, never past what the card paid', async () => {
    const { shop, payment } = await paidOrder();
    const part = await shop.refund({ amountMinor: 1000 });
    expect(part.code).toBe(200);
    expect(part.value).toMatchObject({ partial: true, amount: 10 });
    expect(shop.square.world.payments.get(payment.id).refundedMinor).toBe(1000);
    expect(shop.docs.giftCards.gc1.balanceMinor).toBe(500);
    // The gift card's 15.00 is not the card's to give back: at most 25.00 is left to refund.
    const tooMuch = await shop.refund({ amountMinor: 2600 });
    expect(tooMuch.code).toBe(409);
    expect(shop.square.world.refunds.size).toBe(1);
  });

  test('a full refund gives back the card payment first, then the gift card', async () => {
    const { shop, payment } = await paidOrder();
    await shop.refund({ amountMinor: 1000 });
    const rest = await shop.refund({});
    expect(rest.code).toBe(200);
    // Square refunds what is left of the 35.00 card payment, and no more.
    expect([...shop.square.world.refunds.values()].map((r) => r.amountMinor)).toEqual([1000, 2500]);
    expect(shop.square.world.payments.get(payment.id).refundedMinor).toBe(3500);
    // Then the gift card is whole again.
    expect(shop.docs.giftCards.gc1.balanceMinor).toBe(2000);
    expect(shop.docs.giftCards.gc1.history.map((h) => [h.type, h.minor])).toEqual([['redeemed', 1500], ['refunded', 1500]]);
    expect(shop.docs.orders.o1).toMatchObject({ paymentStatus: 'refunded', refund: { provider: 'stripe', amount: 35 } });
    expect(shop.docs.orders.o1.activity.map((a) => a.message).join(' ')).toMatch(/Square refund/);
  });
});
