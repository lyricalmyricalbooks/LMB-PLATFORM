// End-to-end server pricing for scheduled sales, add-ons, box sets, automatic discounts / free
// gifts and gift cards, through the real checkout handlers (index.js) with an in-memory Firestore.
import { test, expect, describe } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const realRequire = createRequire(import.meta.url);
const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const { giftCardId } = realRequire('./giftCards.js');

const CODE = 'ABCD-EFGH-JKMN-PQRS';
const CARD_ID = giftCardId(CODE);

function harness({ items, books = {}, discounts = {}, giftCards = {}, appliedDiscount = null, cards = undefined, paymentMethod = 'Stripe', taxRate = 0, collectTax } = {}) {
  const updates = [], stripeCalls = [];
  const order = {
    items, trackingKey: 'a'.repeat(64), paymentMethod,
    customer: { email: 'reader@example.com', name: 'Reader', address: null, billingAddress: { country: 'Canada', state: 'ON' } },
    paymentStatus: 'unpaid', status: 'pending_payment', appliedDiscount, ...(cards ? { giftCards: cards } : {}),
  };
  const docs = {
    orders: { order1: order },
    books: { ebook: { status: 'published', format: 'E-book', retailPrice: 20, digital: true }, ...books },
    discounts,
    giftCards,
    settings: { website: { taxes: { rates: taxRate ? [{ country: 'Canada', region: 'ON', rate: taxRate }] : [], ...(collectTax === undefined ? {} : { collect: collectTax }) }, payments: { stripe: { secretKey: 'sk_test_fake' } } } },
  };
  const snap = (name, id) => { const data = docs[name]?.[id]; return { exists: !!data, data: () => data, id }; };
  const merge = (name, id, change) => { docs[name] ||= {}; const target = (docs[name][id] ||= {}); for (const [k, v] of Object.entries(change)) { if (k.includes('.')) { const [a, b] = k.split('.'); target[a] = { ...(target[a] || {}), [b]: v }; } else target[k] = v; } };
  const query = (name, filters) => ({
    where: (f, o, v) => query(name, [...filters, [f, v]]),
    limit: () => query(name, filters),
    async get() { const kept = Object.entries(docs[name] || {}).filter(([, d]) => filters.every(([f, v]) => f.split('.').reduce((x, k) => x?.[k], d) === v)).map(([id, d]) => ({ id, data: () => d })); return { empty: !kept.length, docs: kept }; },
  });
  const db = {
    collection(name) { return {
      doc(id) { return { _name: name, _id: id, async get() { return snap(name, id); }, async update(change) { updates.push({ name, id, change }); merge(name, id, change); }, async set(data, opts) { if (opts?.merge) merge(name, id, data); else { docs[name] ||= {}; docs[name][id] = data; } }, async create(data) { docs[name] ||= {}; docs[name][id] = data; } }; },
      where: (f, o, v) => query(name, [[f, v]]),
      async get() { return query(name, []).get(); },
    }; },
    async runTransaction(fn) { return fn({ get: async ref => snap(ref._name, ref._id), set: (ref, data) => { docs[ref._name] ||= {}; docs[ref._name][ref._id] = data; }, update: (ref, change) => merge(ref._name, ref._id, change), create: (ref, data) => { docs[ref._name] ||= {}; docs[ref._name][ref._id] = data; } }); },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: n => n } }) };
  const wrap = (...args) => args.at(-1);
  const Stripe = class { constructor() { this.checkout = { sessions: { create: async p => { stripeCalls.push(p); return { id: 'cs_test' }; } } }; this.paymentIntents = { create: async p => { stripeCalls.push(p); return { id: 'pi_test', client_secret: 'secret' }; } }; } };
  const mockRequire = name => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const mockFetch = async url => {
    if (String(url).includes('er-api')) return { ok: true, json: async () => ({ rates: { USD: 1, EUR: 1 } }) };
    throw new Error(`Unexpected network: ${url}`);
  };
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: mockFetch }, { filename: 'index.js' });
  async function call(handler, body = {}) { const response = { code: 200, value: null, set() { return this; }, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; }, send(value) { this.value = value; return this; } }; await module.exports[handler]({ method: 'POST', body: { orderId: 'order1', currency: 'cad', paymentElement: true, ...body }, headers: { origin: 'http://localhost:5173', 'x-order-key': 'a'.repeat(64) }, socket: { remoteAddress: '127.0.0.1' } }, response); return response; }
  return { call, order, docs, stripeCalls, updates };
}

const line = (id, extra = {}) => ({ id, quantity: 1, price: 0, ...extra });

describe('scheduled sales', () => {
  test('an ended sale charges the retail price', async () => {
    const app = harness({ items: [line('ebook')], books: { ebook: { status: 'published', format: 'E-book', digital: true, retailPrice: 20, isOnSale: true, salePrice: 5, saleEndsAt: '2000-01-01' } } });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(200);
    expect(app.order.total).toBe(20);
  });
  test('a running sale charges the sale price', async () => {
    const app = harness({ items: [line('ebook')], books: { ebook: { status: 'published', format: 'E-book', digital: true, retailPrice: 20, isOnSale: true, salePrice: 5, saleStartsAt: '2000-01-01' } } });
    await app.call('createStripeCheckoutSession');
    expect(app.order.total).toBe(5);
  });
});

describe('paid add-ons', () => {
  const books = { ebook: { status: 'published', format: 'E-book', digital: true, retailPrice: 20, addOns: [{ id: 'signed', label: 'Signed', price: 5 }, { id: 'ins', label: 'Inscription', price: 3, kind: 'text' }] } };
  test('are priced from the catalog per copy, whatever the browser says', async () => {
    const app = harness({ books, items: [line('ebook', { quantity: 2, price: 1, addOns: [{ id: 'signed', price: 0 }, { id: 'ins', text: 'For Sam' }] })] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(200);
    expect(app.order.items[0]).toMatchObject({ price: 28, basePrice: 20, addOns: [{ id: 'signed', label: 'Signed', price: 5 }, { id: 'ins', label: 'Inscription', price: 3, text: 'For Sam' }] });
    expect(app.order.total).toBe(56);
    expect(app.stripeCalls[0].amount).toBe(5600);
  });
  test('an add-on that is not offered stops checkout before payment', async () => {
    const app = harness({ books, items: [line('ebook', { addOns: [{ id: 'free-money' }] })] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(400);
    expect(app.stripeCalls).toHaveLength(0);
  });
});

describe('box sets', () => {
  const books = {
    set: { status: 'published', title: 'Trilogy', format: 'E-book', digital: true, retailPrice: 45, bundleItems: [{ bookId: 'a', quantity: 1 }, { bookId: 'b', quantity: 2 }] },
    a: { status: 'published', title: 'A', retailPrice: 20, trackInventory: true, stockLevel: 3 },
    b: { status: 'published', title: 'B', retailPrice: 20, trackInventory: true, stockLevel: 3 },
  };
  test('sell at their own price and record their parts', async () => {
    const app = harness({ books, items: [line('set')] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(200);
    expect(app.order.total).toBe(45);
    expect(app.order.items[0]).toMatchObject({ bundle: true, components: [{ id: 'a', quantity: 1, title: 'A' }, { id: 'b', quantity: 2, title: 'B' }] });
  });
  test('are limited by the stock of the books inside', async () => {
    const app = harness({ books, items: [line('set', { quantity: 2 })] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(400);
    expect(r.value.error).toMatch(/Only 1 left/);
  });
});

describe('automatic discounts', () => {
  const discounts = {
    spring: { method: 'automatic', title: 'Spring sale', type: 'percentage', value: 25, code: '' },
    small: { method: 'automatic', title: 'Small', type: 'fixed', value: 1, code: '' },
    off: { method: 'automatic', title: 'Off', type: 'percentage', value: 90, code: '', isActive: false },
    code10: { code: 'TEN', type: 'fixed', value: 2 },
  };
  test('apply the best active offer with no code', async () => {
    const app = harness({ discounts, items: [line('ebook')] });
    await app.call('createStripeCheckoutSession');
    expect(app.order.discount).toBe(5);
    expect(app.order.appliedDiscount).toMatchObject({ id: 'spring', automatic: true, title: 'Spring sale', code: null });
    expect(app.order.total).toBe(15);
  });
  test('a code the shopper enters replaces them', async () => {
    const app = harness({ discounts, items: [line('ebook')], appliedDiscount: { code: 'TEN' } });
    await app.call('createStripeCheckoutSession');
    expect(app.order.discount).toBe(2);
    expect(app.order.appliedDiscount).toMatchObject({ id: 'code10', code: 'TEN' });
  });
  test('cannot be redeemed by typing an old code', async () => {
    const app = harness({ discounts: { auto: { method: 'automatic', code: 'AUTO', type: 'percentage', value: 50 } }, items: [line('ebook')], appliedDiscount: { code: 'AUTO' } });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(400);
    expect(r.value.error).toMatch(/Discount code error/);
  });
  test('a free gift is added from the catalog and costs nothing', async () => {
    const books = { tote: { status: 'published', title: 'Tote', format: 'E-book', digital: true, retailPrice: 12 } };
    const app = harness({ books, discounts: { gift: { method: 'automatic', title: 'Free tote', type: 'gift', giftBookId: 'tote', minOrderAmount: 15, code: '' } }, items: [line('ebook'), line('tote', { promoGift: true, price: 0, quantity: 5 })] });
    await app.call('createStripeCheckoutSession');
    const gift = app.order.items.filter(i => i.promoGift);
    expect(gift).toHaveLength(1);
    expect(gift[0]).toMatchObject({ id: 'tote', quantity: 1, price: 12 });
    expect(app.order.discount).toBe(12);
    expect(app.order.total).toBe(20);
  });
});

describe('gift cards', () => {
  const card = (balanceMinor, extra = {}) => ({ [CARD_ID]: { code: CODE, last4: 'PQRS', initialMinor: 5000, balanceMinor, enabled: true, holds: {}, history: [], ...extra } });
  test('pay part of an order: the card form charges only the rest, and the amount is held', async () => {
    const app = harness({ items: [line('ebook')], giftCards: card(500), cards: [{ code: 'abcd efgh jkmn pqrs' }] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(200);
    expect(app.order).toMatchObject({ giftCardAmount: 5, total: 15, giftCardRedemptions: [{ id: CARD_ID, minor: 500, last4: 'PQRS' }] });
    expect(app.stripeCalls[0].amount).toBe(1500);
    expect(app.order.expectedAmountMinor).toBe(1500);
    expect(app.docs.giftCards[CARD_ID].holds.order1.minor).toBe(500);
  });
  test('another checkout\'s hold is not spendable', async () => {
    const app = harness({ items: [line('ebook')], giftCards: card(500, { holds: { other: { minor: 400, expiresAt: Date.now() + 60000 } } }), cards: [{ code: CODE }] });
    await app.call('createStripeCheckoutSession');
    expect(app.order.giftCardAmount).toBe(1);
  });
  test('covering the whole order is completed without a card and spends the balance once', async () => {
    const app = harness({ items: [line('ebook')], giftCards: card(5000), cards: [{ code: CODE }], paymentMethod: 'Free' });
    const stripe = await app.call('createStripeCheckoutSession');
    expect(stripe.code).toBe(400);
    expect(stripe.value.code).toBe('nothing_to_charge');
    const r = await app.call('createStripeCheckoutSession', { action: 'completeFreeOrder' });
    expect(r.code).toBe(200);
    expect(app.order.paymentStatus).toBe('paid');
    expect(app.docs.giftCards[CARD_ID].balanceMinor).toBe(3000);
    expect(app.docs.giftCards[CARD_ID].holds).toEqual({});
    expect(app.order.giftCardsDebitedAt).toBeTruthy();
  });
  test('a test-mode gift card cannot pay for a real order on its own', async () => {
    const app = harness({ items: [line('ebook')], giftCards: card(5000, { isTest: true }), cards: [{ code: CODE }], paymentMethod: 'Free' });
    app.docs.settings.website.payments.testMode = true;
    const r = await app.call('createStripeCheckoutSession', { action: 'completeFreeOrder' });
    expect(r.code).toBe(400);
    expect(r.value.code).toBe('gift_card_rejected');
    expect(app.order.paymentStatus).toBe('unpaid');
    expect(app.docs.giftCards[CARD_ID].balanceMinor).toBe(5000);
  });
  test("the shopper's own earlier attempt does not block their gift card", async () => {
    const { holdOwner } = realRequire('./stockHolds.js');
    const owner = holdOwner({ customer: { email: 'reader@example.com' } });
    const app = harness({ items: [line('ebook')], giftCards: card(5000, { holds: { earlier: { minor: 5000, expiresAt: Date.now() + 60000, owner } } }), cards: [{ code: CODE }], paymentMethod: 'Free' });
    const r = await app.call('createStripeCheckoutSession', { action: 'completeFreeOrder' });
    expect(r.code).toBe(200);
    expect(app.docs.giftCards[CARD_ID].balanceMinor).toBe(3000);
  });
  test('a box set waits for the latest pre-order book inside it', async () => {
    const books = {
      set: { status: 'published', title: 'Set', retailPrice: 30, bundleItems: [{ bookId: 'a' }, { bookId: 'b' }] },
      a: { status: 'published', title: 'A', retailPrice: 20, preorder: true, publishDate: '2999-01-02' },
      b: { status: 'published', title: 'B', retailPrice: 20, preorder: true, publishDate: '2999-05-06' },
    };
    const app = harness({ books, items: [line('set')] });
    app.order.customer.address = { street: '1 Main', city: 'Toronto', state: 'ON', zip: 'M6G3H1', country: 'Canada' };
    app.docs['shipping-profiles'] = { general: { zones: [{ countries: ['CA'], rates: [{ id: 'std', name: 'Standard', type: 'flat', price: 5, enabled: true }] }] } };
    await app.call('createStripeCheckoutSession');
    expect(app.order.items[0]).toMatchObject({ preorder: true, releaseDate: '2999-05-06' });
  });
  test('a disabled or unknown card is refused with a code checkout understands', async () => {
    const app = harness({ items: [line('ebook')], giftCards: card(500, { enabled: false }), cards: [{ code: CODE }] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(400);
    expect(r.value.code).toBe('gift_card_rejected');
    const unknown = harness({ items: [line('ebook')], cards: [{ code: CODE }] });
    expect((await unknown.call('createStripeCheckoutSession')).value.code).toBe('gift_card_rejected');
  });
  test('gift-card products are never discounted, taxed or paid for with another gift card', async () => {
    const books = { gc: { status: 'published', title: 'Gift card', productType: 'giftCard', variants: [{ id: 'g25', name: 'CA$25', price: 25, digital: true }] } };
    const app = harness({ books, taxRate: 13, discounts: { spring: { method: 'automatic', title: 'Spring', type: 'percentage', value: 50, code: '' } }, giftCards: card(5000), cards: [{ code: CODE }],
      items: [line('gc', { variantId: 'g25', giftCardDetails: { recipientEmail: 'Sam@Example.com', message: 'Enjoy' } }), line('ebook')] });
    const r = await app.call('createStripeCheckoutSession');
    expect(r.code).toBe(200);
    expect(app.order.items[0]).toMatchObject({ giftCard: true, digital: true, format: 'Gift card', giftCardDetails: { recipientEmail: 'sam@example.com', message: 'Enjoy' } });
    expect(app.order.discount).toBe(10); // 50% of the e-book only
    expect(app.order.tax).toBeCloseTo(1.3); // 13% of the discounted e-book only
    expect(app.order.giftCardAmount).toBeCloseTo(11.3); // never the CA$25 gift card line
    expect(app.order.total).toBe(25);
  });
});

describe('tax collection switch (Settings › Taxes)', () => {
  test('rates are charged while collection is on (missing = on)', async () => {
    const app = harness({ items: [line('ebook')], taxRate: 13 });
    expect((await app.call('createStripeCheckoutSession')).code).toBe(200);
    expect(app.order.tax).toBeCloseTo(2.6);
    expect(app.order.total).toBeCloseTo(22.6);
  });
  test('switched off: no tax is charged even with saved rates', async () => {
    const app = harness({ items: [line('ebook')], taxRate: 13, collectTax: false });
    expect((await app.call('createStripeCheckoutSession')).code).toBe(200);
    expect(app.order.tax).toBe(0);
    expect(app.order.total).toBe(20);
  });
});
