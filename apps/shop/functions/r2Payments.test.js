// Regression tests for the "round 2" payment/checkout fixes (PR 1): manual orders keep their extras and
// hold the priced lines, failed-refund recovery for refunds Stripe called succeeded, retry idempotency,
// refund restock defaults, Sync with Stripe on paid orders, shipping live-rate rules, box-set weights,
// discount claims, PayPal total, gift-card adjust history and secret bindings.
import { test, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { failedRefundId, ordersDueReversalCheck } from './stripeRecovery.js';
import { refundRetrySuffix } from './partialRefund.js';
import { sameOrderLines } from './paymentGuards.js';
import { emailIdentity, openClaims, limitReached } from './discountClaims.js';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');

const getPath = (data, path) => path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), data);
function resolvePatch(current, patch) {
  const out = { ...(current || {}) };
  for (const [key, value] of Object.entries(patch)) {
    let next = value;
    if (value && typeof value === 'object' && '__inc' in value) next = (Number(getPath(out, key)) || 0) + value.__inc;
    else if (value && typeof value === 'object' && '__union' in value) next = [...(getPath(out, key) || []), ...value.__union];
    if (key.includes('.')) {
      const parts = key.split('.');
      let cursor = out;
      parts.slice(0, -1).forEach(part => { cursor[part] = { ...(cursor[part] || {}) }; cursor = cursor[part]; });
      cursor[parts.at(-1)] = next;
    } else out[key] = next;
  }
  return out;
}

function harness({ docs = {}, intents = {}, charge = null, refunds = [], stripeRefundStatus = 'succeeded', carrierRates = null, carrierFails = false, refundDefault = 3000 } = {}) {
  docs.settings ||= { website: {} };
  const stripeCalls = { refunds: [], intents: [] }, emails = [];
  const store = (name) => (docs[name] ||= {});
  const docRef = (name, id) => ({
    _name: name, _id: id, id,
    async get() { const data = store(name)[id]; return { exists: data !== undefined, id, data: () => data }; },
    async set(data, opts) { store(name)[id] = opts?.merge ? resolvePatch(store(name)[id], data) : data; },
    async update(change) { store(name)[id] = resolvePatch(store(name)[id], change); },
    async create(data) { store(name)[id] = data; },
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
        if (op === '>=') return actual >= value;
        if (op === '<=') return actual <= value;
        return true;
      })).slice(0, max).map(([id, data]) => ({ id, data: () => data, ref: docRef(name, id) }));
      return { empty: !hits.length, docs: hits, size: hits.length, forEach: fn => hits.forEach(fn) };
    },
  });
  const db = {
    collection(name) { return { doc: id => docRef(name, id), ...query(name) }; },
    async runTransaction(fn) {
      return fn({
        get: async ref => (ref.get ? ref.get() : ref),
        set: (ref, data, opts) => { store(ref._name)[ref._id] = opts?.merge ? resolvePatch(store(ref._name)[ref._id], data) : data; },
        update: (ref, change) => { store(ref._name)[ref._id] = resolvePatch(store(ref._name)[ref._id], change); },
        delete: ref => { delete store(ref._name)[ref._id]; },
      });
    },
  };
  const FieldValue = { increment: n => ({ __inc: n }), arrayUnion: (...v) => ({ __union: v }), delete: () => undefined, serverTimestamp: () => new Date().toISOString() };
  const admin = {
    initializeApp() {},
    firestore: Object.assign(() => db, { FieldValue }),
    auth: () => ({ verifyIdToken: async () => ({ email: 'lyricalmyricalbooks@gmail.com', email_verified: true, uid: 'admin1' }) }),
  };
  const wrap = (...args) => args.at(-1);
  const Stripe = class {
    constructor() {
      this.paymentIntents = {
        retrieve: async (id) => ({ id, status: 'requires_payment_method', ...(intents[id] || {}), ...(charge ? { metadata: { order_id: 'o1' }, latest_charge: charge } : {}) }),
        create: async payload => { stripeCalls.intents.push(payload); return { id: 'pi_new', client_secret: 'pi_new_secret_x' }; },
        cancel: async id => ({ id, status: 'canceled' }),
      };
      this.refunds = {
        list: async () => ({ data: refunds }),
        create: async (payload, options) => { stripeCalls.refunds.push({ payload, options }); return { id: `re_${stripeCalls.refunds.length}`, status: stripeRefundStatus, amount: payload.amount ?? refundDefault, currency: 'cad' }; },
      };
      this.disputes = { list: async () => ({ data: [] }) };
      this.checkout = { sessions: { create: async () => ({ id: 'cs_x', url: 'https://x' }), retrieve: async id => ({ id, status: 'open', payment_status: 'unpaid' }) } };
      this.webhooks = { constructEvent: body => JSON.parse(body) };
    }
  };
  const mockRequire = name => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class { constructor() { this.emails = { send: async m => { emails.push(m); return { data: { id: 'e' } }; } }; } } };
    if (name === 'nodemailer') return { createTransport: () => ({ sendMail: async m => { emails.push(m); return { messageId: 'x' }; } }) };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'whsec_fake' }) };
    return realRequire(name);
  };
  const mod = { exports: {} };
  const mockFetch = async (url) => {
    const text = String(url);
    if (text.includes('er-api')) return { ok: true, json: async () => ({ rates: { USD: 1, EUR: 1 } }) };
    if (text.includes('shippo') || text.includes('goshippo')) {
      if (carrierFails) throw new Error('Shippo unreachable');
      return { ok: true, status: 200, json: async () => ({ rates: carrierRates || [] }), text: async () => '{}' };
    }
    throw new Error(`Unexpected network: ${text}`);
  };
  const exposed = `${source}\nmodule.exports.__test = { applyOrderRefund, revertFailedRefund, checkStripeReversal, assertDiscountNotUsedByCustomer, priceOrder, resolveShipping, releaseSupersededAttempt };`;
  vm.runInNewContext(exposed, { module: mod, exports: mod.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: mockFetch }, { filename: 'index.js' });
  async function call(handler, body = {}, { admin: asAdmin = false, orderKey = 'a'.repeat(64) } = {}) {
    const response = { code: 200, value: null, set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } };
    await mod.exports[handler]({ method: 'POST', body, headers: { origin: 'http://localhost:5173', 'x-order-key': orderKey, ...(asAdmin ? { authorization: 'Bearer tok' } : {}) }, socket: { remoteAddress: '127.0.0.1' } }, response);
    return response;
  }
  return { docs, call, stripeCalls, emails, ...mod.exports.__test };
}

const pickup = { enabled: true, pickupLocations: [{ id: 'shop', enabled: true, name: 'Shop', price: 2, address: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } }], deliveryZones: [] };
const baseSettings = (extra = {}) => ({ website: { localFulfillment: pickup, taxes: { rates: [] }, payments: { stripe: { secretKey: 'sk_live_fake' }, manualMethods: [{ id: 'cash', enabled: true, name: 'Cash', instructions: 'Pay' }] }, ...extra } });
const manualDraft = (items) => ({ customer: { name: 'Reader', email: 'reader@example.com', billingAddress: { country: 'Canada', state: 'ON' } }, items, fulfillmentSelection: { method: 'pickup', optionId: 'pickup:shop' } });
const placeManual = (app, items) => app.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: manualDraft(items) });

// ── Fault 2 ──────────────────────────────────────────────────────────────────────────────
test('fault 2: a manual-payment order keeps paid add-ons and the gift-card recipient', async () => {
  const app = harness({ docs: {
    settings: baseSettings(),
    books: {
      signed: { status: 'published', format: 'Paperback', retailPrice: 20, addOns: [{ id: 'signed', label: 'Signed copy', price: 5, kind: 'option' }, { id: 'note', label: 'Inscription', price: 3, kind: 'text', maxLength: 40 }] },
      card: { status: 'published', productType: 'giftCard', format: 'Gift card', retailPrice: 25 },
    },
  } });
  const result = await placeManual(app, [
    { id: 'signed', quantity: 1, addOns: [{ id: 'signed' }, { id: 'note', text: 'For Ada' }] },
    { id: 'card', quantity: 1, giftCardDetails: { recipientName: 'Ada', recipientEmail: 'ada@example.com' } },
  ]);
  expect(result.code).toBe(200);
  const saved = app.docs.orders[result.value.orderId];
  expect(saved.items[0].price).toBe(28);
  expect(saved.items[0].addOns).toEqual([{ id: 'signed', label: 'Signed copy', price: 5 }, { id: 'note', label: 'Inscription', price: 3, text: 'For Ada' }]);
  expect(saved.items[1].giftCardDetails).toMatchObject({ recipientEmail: 'ada@example.com', recipientName: 'Ada' });
});

// ── Fault 58 ─────────────────────────────────────────────────────────────────────────────
test('fault 58: a manual order for a box set holds the books inside it, not the set', async () => {
  const app = harness({ docs: {
    settings: baseSettings(),
    books: {
      set: { status: 'published', format: 'Paperback', retailPrice: 40, bundleItems: [{ bookId: 'partA', quantity: 1 }] },
      partA: { status: 'published', format: 'Paperback', retailPrice: 20, trackInventory: true, stockLevel: 1, title: 'Part A' },
    },
  } });
  const first = await placeManual(app, [{ id: 'set', quantity: 1 }]);
  expect(first.code).toBe(200);
  expect(Object.keys(app.docs['stock-holds'].partA.holds)).toEqual([first.value.orderId]);
  // The last copy is held, so a second shopper cannot take it.
  const second = await app.call('createStripeCheckoutSession', { action: 'createManualLocalOrder', manualMethodId: 'cash', orderDraft: { ...manualDraft([{ id: 'set', quantity: 1 }]), customer: { name: 'Other', email: 'other@example.com', billingAddress: { country: 'Canada', state: 'ON' } } } });
  expect(second.code).toBe(400);
  expect(second.value.error).toMatch(/another shopper|left/i);
});

// ── Fault 5 ──────────────────────────────────────────────────────────────────────────────
const paidOrder = (extra = {}) => ({
  paymentStatus: 'paid', status: 'open', stripeMode: 'live', stripePaymentIntentId: 'pi_1', total: 30, paidAt: '2026-10-01T10:00:00Z', customer: { email: 'reader@example.com' },
  items: [{ id: 'book', quantity: 2, price: 15 }], activity: [], trackingKey: 'a'.repeat(64), ...extra,
});
const stockDocs = () => ({ books: { book: { status: 'published', stockLevel: 5, trackInventory: true } }, settings: baseSettings(), analytics: {}, adminSecrets: {} });

test('fault 5: a refund Stripe called succeeded is reverted when its refund event later fails', async () => {
  const app = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder() } } });
  await app.applyOrderRefund('o1', { provider: 'stripe', refundId: 're_1', amountMinor: 3000, currency: 'cad', status: 'succeeded', restock: true, actor: 'admin' });
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
  expect(app.docs.books.book.stockLevel).toBe(7);
  const out = await app.revertFailedRefund('o1', { refundId: 're_1', source: 'test' });
  expect(out.reverted).toBe(true);
  expect(app.docs.orders.o1).toMatchObject({ paymentStatus: 'paid', refund: { status: 'failed' } });
  expect(app.docs.books.book.stockLevel).toBe(5);
});

test('fault 5: a failed refund for a different id does not undo a completed refund', async () => {
  const app = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder() } } });
  await app.applyOrderRefund('o1', { provider: 'stripe', refundId: 're_1', amountMinor: 3000, currency: 'cad', status: 'succeeded', restock: true, actor: 'admin' });
  expect((await app.revertFailedRefund('o1', { refundId: 're_other' })).reverted).toBe(false);
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
});

test('fault 5: the sweep re-reads recently refunded Stripe orders and reverts a Dashboard refund that failed', async () => {
  const refunded = paidOrder({ paymentStatus: 'refunded', refund: { id: null, provider: 'stripe', status: 'succeeded' }, refundedAt: new Date().toISOString(), preRefund: { status: 'open' } });
  expect(ordersDueReversalCheck([refunded, { ...refunded, refundedAt: '2020-01-01T00:00:00Z' }, { ...refunded, refund: { provider: 'dispute' } }])).toHaveLength(1);
  const charge = { amount: 3000, amount_refunded: 0, refunded: false, currency: 'cad', disputed: false };
  expect(failedRefundId(refunded, charge, [{ id: 're_9', status: 'failed' }])).toBe('re_9');
  expect(failedRefundId(refunded, charge, [{ id: 're_9', status: 'pending' }])).toBe(null);
  const app = harness({ docs: { ...stockDocs(), orders: { o1: refunded } }, charge, refunds: [{ id: 're_9', status: 'failed' }] });
  await app.checkStripeReversal('o1', app.docs.orders.o1, 'test');
  expect(app.docs.orders.o1.paymentStatus).toBe('paid');
});

// ── Fault 39 / 90 ────────────────────────────────────────────────────────────────────────
test('fault 39: a reverted refund is flagged on the order and the shop is emailed by the update trigger', async () => {
  const app = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder() } } });
  await app.applyOrderRefund('o1', { provider: 'stripe', refundId: 're_1', amountMinor: 3000, currency: 'cad', status: 'pending', actor: 'admin' });
  await app.revertFailedRefund('o1', { refundId: 're_1' });
  expect(app.docs.orders.o1.refund.status).toBe('failed');
  expect(app.docs.orders.o1.refundFailedAt).toBeTruthy();
  expect(source).toMatch(/Refund failed: order \$\{orderId\} needs a new refund/);
});

test('fault 90: pressing Refund again after a failed refund uses a new idempotency key (Stripe and PayPal)', async () => {
  const failed = paidOrder({ refund: { id: 're_old', provider: 'stripe', status: 'failed' }, refundFailedAt: '2026-10-05T00:00:00Z' });
  expect(refundRetrySuffix(failed)).toBe('-after-re_old');
  expect(refundRetrySuffix(paidOrder())).toBe('');
  const app = harness({ docs: { ...stockDocs(), orders: { o1: failed } }, stripeRefundStatus: 'pending' });
  const res = await app.call('refundOrder', { orderId: 'o1', reason: 'again' }, { admin: true });
  expect(res.code).toBe(200);
  expect(app.stripeCalls.refunds[0].options.idempotencyKey).toBe('order-refund-o1-full-after-re_old');
  const first = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder() } } });
  await first.call('refundOrder', { orderId: 'o1' }, { admin: true });
  expect(first.stripeCalls.refunds[0].options.idempotencyKey).toBe('order-refund-o1-full');
});

// ── Fault 93 (already fixed on main; pinned) ─────────────────────────────────────────────
test('fault 93: a full refund after a Dashboard partial refund records and keeps the whole refunded total', async () => {
  const partial = paidOrder({ total: 30, refundedAmountMinor: 2000, partiallyRefunded: true });
  const app = harness({ docs: { ...stockDocs(), orders: { o1: partial } }, stripeRefundStatus: 'succeeded', refundDefault: 1000 });
  const res = await app.call('refundOrder', { orderId: 'o1', restock: false }, { admin: true });
  expect(res.code).toBe(200);
  expect(app.docs.orders.o1.refund.amount).toBe(30);
  expect(app.docs.orders.o1.refundedAmountMinor).toBe(3000);
});

// ── Fault 67 ─────────────────────────────────────────────────────────────────────────────
test('fault 67: a Dashboard/PayPal full refund does not restock books that already shipped', async () => {
  const shipped = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder({ fulfillmentStatus: 'shipped', trackingNumber: '123' }) } } });
  await shipped.applyOrderRefund('o1', { provider: 'stripe', amountMinor: 3000, currency: 'cad', actor: 'stripe-dashboard' });
  expect(shipped.docs.books.book.stockLevel).toBe(5);
  expect(shipped.docs.orders.o1.inventoryRestockedAt).toBeUndefined();
  const unsent = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder({ fulfillmentStatus: 'paid' }) } } });
  await unsent.applyOrderRefund('o1', { provider: 'stripe', amountMinor: 3000, currency: 'cad', actor: 'stripe-dashboard' });
  expect(unsent.docs.books.book.stockLevel).toBe(7);
  const explicit = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder({ fulfillmentStatus: 'shipped' }) } } });
  await explicit.applyOrderRefund('o1', { provider: 'stripe', amountMinor: 3000, currency: 'cad', restock: true, actor: 'admin' });
  expect(explicit.docs.books.book.stockLevel).toBe(7);
});

// ── Fault 92 ─────────────────────────────────────────────────────────────────────────────
test('fault 92: the status check on a paid order reads Stripe and picks up a refund the webhook missed', async () => {
  const charge = { amount: 3000, amount_refunded: 3000, refunded: true, currency: 'cad', disputed: false };
  const app = harness({ docs: { ...stockDocs(), orders: { o1: paidOrder() } }, charge });
  const res = await app.call('createStripeCheckoutSession', { action: 'status', orderId: 'o1' });
  expect(res.code).toBe(200);
  expect(res.value.paymentStatus).toBe('refunded');
  expect(app.docs.orders.o1.paymentStatus).toBe('refunded');
});

const GC = 'a'.repeat(40);
// ── Fault 131 ────────────────────────────────────────────────────────────────────────────
test('fault 131: gift-card adjust records the change that was applied, not the one requested', async () => {
  const app = harness({ docs: { giftCards: { [GC]: { balanceMinor: 2000, history: [] } }, settings: baseSettings() } });
  const res = await app.call('createStripeCheckoutSession', { action: 'giftCardAdmin', op: 'adjust', id: GC, deltaMinor: -5000, reason: 'oops' }, { admin: true });
  expect(res.value).toMatchObject({ ok: true });
  expect(res.code).toBe(200);
  expect(res.value).toMatchObject({ balanceMinor: 0, appliedMinor: -2000, clamped: true });
  expect(app.docs.giftCards[GC].history.at(-1)).toMatchObject({ type: 'adjusted', minor: -2000, requestedMinor: -5000 });
});

test('gift card actions in the wrong shape are refused before a card is read (src/shared/giftCardActions.ts)', async () => {
  const app = harness({ docs: { giftCards: { [GC]: { balanceMinor: 2000, history: [] } }, settings: baseSettings() } });
  for (const body of [
    { op: 'adjust', id: GC, deltaMinor: '-5', reason: 'x' },
    { op: 'adjust', id: GC, deltaMinor: -500 },
    { op: 'setEnabled', id: GC, enabled: 'yes' },
    { op: 'issue', amountMinor: 2500, recipientEmail: ['a@b.co'] },
    { op: 'resend', id: { $gt: '' } },
  ]) {
    const res = await app.call('createStripeCheckoutSession', { action: 'giftCardAdmin', ...body }, { admin: true });
    expect(res.code, JSON.stringify(body)).toBe(400);
    expect(res.value.code).toBe('bad_request');
  }
  for (const op of ['toString', 'constructor', 'delete']) {
    const res = await app.call('createStripeCheckoutSession', { action: 'giftCardAdmin', op, id: GC }, { admin: true });
    expect(res.code).toBe(400);
    expect(res.value.error).toBe('Unknown gift card action.');
  }
  // A mistyped year from the date field still gets the friendly answer, not a shape error.
  const typo = await app.call('createStripeCheckoutSession', { action: 'giftCardAdmin', op: 'setExpiry', id: GC, expiresOn: '20266-01-01' }, { admin: true });
  expect(typo.code).toBe(400);
  expect(typo.value.error).toMatch(/real date/);
  expect(app.docs.giftCards[GC]).toEqual({ balanceMinor: 2000, history: [] });
});

// ── Fault 148 ────────────────────────────────────────────────────────────────────────────
test('fault 148: createPayPalOrder is bound to the Stripe secret its paid-twice guard reads', () => {
  const block = source.slice(source.indexOf('exports.createPayPalOrder'), source.indexOf('async (req, res)', source.indexOf('exports.createPayPalOrder')));
  expect(block).toMatch(/secrets: \[[^\]]*STRIPE_SECRET_KEY/);
});

// ── Fault 41 ─────────────────────────────────────────────────────────────────────────────
test('fault 41: an earlier paid order only blocks a new order that buys the same things', async () => {
  expect(sameOrderLines([{ id: 'a', quantity: 1 }], [{ id: 'a', variantId: null, quantity: 1 }, { id: 'g', promoGift: true, quantity: 1 }])).toBe(true);
  expect(sameOrderLines([{ id: 'a', quantity: 1 }], [{ id: 'b', quantity: 1 }])).toBe(false);
  expect(sameOrderLines([{ id: 'a', quantity: 1 }], [{ id: 'a', quantity: 2 }])).toBe(false);
  const mk = () => harness({ docs: { settings: baseSettings(), orders: { prev: { customer: { email: 'Reader@Example.com' }, paymentStatus: 'paid', status: 'open', items: [{ id: 'a', quantity: 1 }] } } } });
  const same = await mk().releaseSupersededAttempt({ body: { previousOrderId: 'prev' } }, 'reader@example.com', 'new', [{ id: 'a', quantity: 1 }]);
  expect(same).toEqual({ paidOrderId: 'prev' });
  const different = await mk().releaseSupersededAttempt({ body: { previousOrderId: 'prev' } }, 'reader@example.com', 'new', [{ id: 'b', quantity: 1 }]);
  expect(different).toEqual({});
});

// ── Faults 54 / 55 (live carrier rules) ───────────────────────────────────────────────────
const shippingSetup = (extra = {}) => ({
  settings: baseSettings({ origin: { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } }),
  'private-integrations': { shippo: { apiToken: 'shippo_live_aaaaaaaaaaaaaaaaaaaa', dynamicRatesEnabled: true, dynamicRateCountries: ['CA'] } },
  ...extra,
});
const profiles = [{ id: 'general', zones: [{ countries: ['CA'], rates: [{ id: 'flat8', name: 'Standard', type: 'flat', base: 8, enabled: true }] }] }];
const shipOrder = (selection) => ({ customer: { name: 'R', email: 'r@example.com', address: { street: '2 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'CA' } }, fulfillmentSelection: { method: 'shipping', optionId: selection }, shippingMethod: selection });
const physical = [{ id: 'book', quantity: 1, price: 30, format: 'Paperback', weightGrams: 400, shippingProfileId: 'general' }];
const carrier = [{ provider: 'Canada Post', servicelevel: { name: 'Expedited Parcel' }, amount: '19.50', estimated_days: 3 }];

test('fault 54: a cheaper profile rate cannot stand in for live carrier rates that exist', async () => {
  const app = harness({ docs: shippingSetup(), carrierRates: carrier });
  await expect(app.resolveShipping(physical, shipOrder('Standard'), profiles, false, app.docs.settings.website, 30)).rejects.toThrow(/no longer available/);
  // Coded, so checkout knows to fetch the carrier's rates again instead of refusing every retry.
  await expect(app.resolveShipping(physical, shipOrder('Standard'), profiles, false, app.docs.settings.website, 30)).rejects.toMatchObject({ code: 'shipping_rates_changed' });
  const live = await app.resolveShipping(physical, shipOrder('Canada Post Expedited Parcel'), profiles, false, app.docs.settings.website, 30);
  expect(live.cost).toBe(19.5);
});

test('fault 55: a carrier outage after a live rate was picked says so, not "we do not ship there"', async () => {
  const app = harness({ docs: shippingSetup(), carrierFails: true });
  await expect(app.resolveShipping(physical, shipOrder('Canada Post Expedited Parcel'), profiles, false, app.docs.settings.website, 30)).rejects.toThrow(/temporarily unavailable/);
  // A profile rate still works when the carrier is down.
  const fallback = await harness({ docs: shippingSetup(), carrierFails: true }).resolveShipping(physical, shipOrder('Standard'), profiles, false, {}, 30);
  expect(fallback.cost).toBe(8);
});

test('a refused profile rate reaches checkout with its code, so the shopper gets fresh carrier rates', async () => {
  const app = harness({ docs: { ...shippingSetup(), books: { book: { status: 'published', format: 'Paperback', retailPrice: 30, weight: '400 g', shippingProfileId: 'general' } }, 'shipping-profiles': { general: profiles[0] } }, carrierRates: carrier });
  const order = { ...shipOrder('Standard'), items: [{ id: 'book', quantity: 1 }] };
  await expect(app.priceOrder(order)).rejects.toMatchObject({ status: 400, code: 'shipping_rates_changed' });
});

// ── Fault 56 ─────────────────────────────────────────────────────────────────────────────
test('fault 56: a box-set part weighs what its chosen edition weighs', async () => {
  const app = harness({ docs: { settings: baseSettings(), books: {
    set: { status: 'published', format: 'Paperback', retailPrice: 40, bundleItems: [{ bookId: 'part', variantId: 'hc', quantity: 2 }] },
    part: { status: 'published', title: 'Part', format: 'Paperback', retailPrice: 20, weight: '300 g', variants: [{ id: 'hc', name: 'Hardcover', price: 25, weight: '900 g', format: 'Hardcover' }] },
  } } });
  const priced = await app.priceOrder({ customer: { email: 'r@example.com', address: { country: 'CA', state: 'ON' }, billingAddress: { country: 'Canada', state: 'ON' } }, items: [{ id: 'set', quantity: 1 }], fulfillmentSelection: { method: 'pickup', optionId: 'pickup:shop' } });
  expect(priced.items[0].weightGrams).toBe(1800);
});

// ── Faults 59 / 60 ───────────────────────────────────────────────────────────────────────
test('fault 59: aliases of one mailbox are one customer, and pending manual orders hold the use', async () => {
  expect(emailIdentity('N.ame+2@Gmail.com')).toBe('name@gmail.com');
  expect(emailIdentity('name+x@example.com')).toBe('name@example.com');
  expect(emailIdentity('a.b@example.com')).toBe('a.b@example.com');
  const discount = { id: 'd1', onePerCustomer: true };
  const used = harness({ docs: { orders: { x: { appliedDiscount: { id: 'd1' }, paymentStatus: 'paid', customer: { email: 'name@gmail.com' } } } } });
  await expect(used.assertDiscountNotUsedByCustomer(discount, 'n.ame+2@gmail.com', 'new')).rejects.toThrow(/already used/);
  const pending = harness({ docs: { orders: { x: { appliedDiscount: { id: 'd1' }, paymentStatus: 'pending', status: 'pending_payment', customer: { email: 'name@gmail.com' } } } } });
  await expect(pending.assertDiscountNotUsedByCustomer(discount, 'name+again@gmail.com', 'new')).rejects.toThrow(/already used/);
  const none = harness({ docs: { orders: {} } });
  await expect(none.assertDiscountNotUsedByCustomer(discount, 'someone@else.com', 'new')).resolves.toBeUndefined();
});

test('fault 60: other shoppers\' unpaid claims count against the usage limit; a shopper\'s own retry does not', async () => {
  const now = Date.now();
  const live = (email, extra = {}) => ({ appliedDiscount: { id: 'd1' }, paymentStatus: 'unpaid', status: 'pending_payment', stripePaymentIntentId: 'pi_x', updatedAt: new Date(now).toISOString(), customer: { email }, ...extra });
  const discount = { id: 'd1', usageLimit: 2, usageCount: 1 };
  const app = harness({ docs: { orders: { a: live('a@example.com') } } });
  await expect(app.assertDiscountNotUsedByCustomer(discount, 'b@example.com', 'new')).rejects.toThrow(/usage limit/);
  await expect(app.assertDiscountNotUsedByCustomer(discount, 'A@example.com', 'new')).resolves.toBeUndefined();
  const stale = harness({ docs: { orders: { a: live('a@example.com', { updatedAt: new Date(now - 3 * 3600 * 1000).toISOString() }), b: live('c@example.com', { stripePaymentIntentId: null }) } } });
  await expect(stale.assertDiscountNotUsedByCustomer(discount, 'b@example.com', 'new')).resolves.toBeUndefined();
  expect(limitReached({ usageLimit: 0, usageCount: 5 }, [], 'x')).toBe(false);
  expect(openClaims([live('a@example.com', { isTest: true })], {})).toHaveLength(0);
});
