// A fair helper's card payment by QR (fairHelperPay.js and index.js fairHelperPayment): prices come from the till's
// menu, only the helper's own payment can be read, and only a fair helper (or the owner and staff) may ask.
import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { fairPayPlan, fairCheckoutParams, fairPaymentState } = realRequire('./fairHelperPay');

const SALE = 'fs-abc123-0123456789abcdefghij';
const MENU = { books: [
  { id: 'b1', title: 'Harbour Lights', price: 24, cur: 'CAD' },
  { id: 'b2', title: 'Tide Tables', price: 18.5, cur: 'CAD' },
  { id: 'u1', title: 'US Edition', price: 20, cur: 'USD' },
] };

describe('pricing a helper\'s sale', () => {
  test('from the menu, never from the helper\'s screen', () => {
    const plan = fairPayPlan(MENU, { saleId: SALE, lines: [{ bookId: 'b1', qty: 2, price: 1 }, { bookId: 'b2', qty: 1 }] });
    expect(plan).toEqual({ amountMinor: 6650, currency: 'CAD', count: 3, name: 'Book fair sale (3 items)' });
  });
  test('refuses an unknown book, an odd count, two currencies, an empty sale or a bad id', () => {
    expect(fairPayPlan(MENU, { saleId: SALE, lines: [{ bookId: 'zz', qty: 1 }] }).problem).toMatch(/isn't on the till/);
    expect(fairPayPlan(MENU, { saleId: SALE, lines: [{ bookId: 'b1', qty: 1.5 }] }).problem).toMatch(/how many/);
    expect(fairPayPlan(MENU, { saleId: SALE, lines: [{ bookId: 'b1', qty: 1 }, { bookId: 'u1', qty: 1 }] }).problem).toMatch(/two currencies/);
    expect(fairPayPlan(MENU, { saleId: SALE, lines: [] }).problem).toBeTruthy();
    expect(fairPayPlan(MENU, { saleId: '../x', lines: [{ bookId: 'b1', qty: 1 }] }).problem).toBeTruthy();
    expect(fairPayPlan({ books: [{ id: 'c', price: 0.2, cur: 'CAD' }] }, { saleId: SALE, lines: [{ bookId: 'c', qty: 1 }] }).problem).toMatch(/0.50/);
  });
  test('the checkout names the sale and the helper and closes after half an hour', () => {
    const params = fairCheckoutParams({ amountMinor: 2400, currency: 'CAD', name: 'Book fair sale (1 item)' }, { saleId: SALE, helper: 'sam@example.com', shopName: 'Moth Press', returnUrl: 'https://moth.example/', nowSeconds: 1000 });
    expect(params).toMatchObject({ mode: 'payment', expires_at: 2800, metadata: { fair_sale: SALE, fair_helper: 'sam@example.com' } });
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'cad', unit_amount: 2400 });
    expect(params).not.toHaveProperty('client_reference_id');
  });
  test('a payment is read back only by the helper who made it', () => {
    const session = { status: 'complete', payment_status: 'paid', metadata: { fair_sale: SALE, fair_helper: 'sam@example.com' } };
    expect(fairPaymentState(session, 'sam@example.com')).toEqual({ paid: true, open: false });
    expect(fairPaymentState(session, 'eve@example.com')).toBeNull();
    expect(fairPaymentState({ metadata: {} }, 'sam@example.com')).toBeNull();
  });
});

function harness({ token = {}, menu = MENU, open = true, sessions = {} } = {}) {
  const docs = { settings: { website: {} } };
  const made = [];
  const refOf = (name, id) => ({
    path: `${name}/${id}`, id,
    async get() { const value = docs[name]?.[id]; return { id, exists: value !== undefined, data: () => value }; },
    async set(value) { docs[name] ||= {}; docs[name][id] = value; },
    async update(change) { Object.assign(docs[name][id], change); },
  });
  const db = {
    collection: (name) => ({ doc: (id) => refOf(name, id), where() { return this; }, limit() { return this; }, async get() { return { empty: true, docs: [] }; } }),
    async runTransaction(fn) { return fn({ get: (ref) => ref.get(), set: (ref, v) => ref.set(v), update: (ref, v) => ref.update(v) }); },
  };
  const firestore = Object.assign(() => db, { FieldValue: { increment: (n) => n, serverTimestamp: () => 'now', delete: () => undefined } });
  const admin = { initializeApp() {}, firestore, auth: () => ({ verifyIdToken: async () => structuredClone(token) }), appCheck: () => ({}) };
  class Stripe {
    constructor() {
      this.checkout = { sessions: {
        create: async (params, options) => { made.push({ params, options }); return { id: 'cs_test_123456789', url: 'https://pay.example/cs_test_123456789' }; },
        retrieve: async (id) => sessions[id],
        expire: async () => ({}),
      } };
    }
  }
  const store = { readFairTill: async () => ({ menu, open }), connectionProblem: () => null };
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name === './inventoryLinkStore') return store;
    if (name === 'firebase-functions/v2/options') return { setGlobalOptions() {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => (...args) => args.at(-1) });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'sk_test_fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(here, 'index.js'), 'utf8');
  vm.runInNewContext(source, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: 'off' } }, Buffer, console, setTimeout, clearTimeout, URL, AbortController, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  const call = async (body) => {
    const response = { code: 200, body: null, set() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; } };
    await module.exports.fairHelperPayment({ method: 'POST', headers: { authorization: 'Bearer t' }, body, ip: '1.2.3.4' }, response);
    return response;
  };
  return { call, made };
}

const helper = { email: 'Sam@Example.com', email_verified: true, role: 'fairHelper' };

describe('the fairHelperPayment endpoint', () => {
  test('opens a checkout priced from the menu for a signed-in helper', async () => {
    const app = harness({ token: helper });
    const res = await app.call({ action: 'start', saleId: SALE, lines: [{ bookId: 'b1', qty: 1, price: 0.01 }] });
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ url: 'https://pay.example/cs_test_123456789', amount: 2400, currency: 'CAD' });
    expect(app.made[0].params.metadata).toEqual({ fair_sale: SALE, fair_helper: 'sam@example.com' });
    expect(app.made[0].options.idempotencyKey).toBe(`fair-${SALE}-2400-CAD`);
  });
  test('refuses a stranger, an author and an unverified helper', async () => {
    for (const token of [{ email: 'x@example.com', email_verified: true }, { ...helper, role: 'author' }, { ...helper, email_verified: false }]) {
      expect((await harness({ token }).call({ action: 'start', saleId: SALE, lines: [{ bookId: 'b1', qty: 1 }] })).code).toBe(401);
    }
  });
  test('refuses while the plan is paused, and explains a bad sale', async () => {
    expect((await harness({ token: helper, open: false }).call({ action: 'start', saleId: SALE, lines: [{ bookId: 'b1', qty: 1 }] })).code).toBe(409);
    const bad = await harness({ token: helper }).call({ action: 'start', saleId: SALE, lines: [{ bookId: 'nope', qty: 1 }] });
    expect(bad.code).toBe(400);
    expect(bad.body.error).toMatch(/isn't on the till/);
  });
  test('tells only the helper who made it whether it is paid', async () => {
    const sessions = { cs_test_123456789: { status: 'complete', payment_status: 'paid', metadata: { fair_sale: SALE, fair_helper: 'sam@example.com' } } };
    expect((await harness({ token: helper, sessions }).call({ action: 'status', sessionId: 'cs_test_123456789' })).body).toEqual({ paid: true, open: false });
    const other = await harness({ token: { ...helper, email: 'eve@example.com' }, sessions }).call({ action: 'status', sessionId: 'cs_test_123456789' });
    expect(other.code).toBe(404);
  });
});
