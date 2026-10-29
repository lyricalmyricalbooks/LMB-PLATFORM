// One order = one email to the customer ("Order confirmed") and one to the shop
// ("[NEW ORDER] … paid"). Card orders send nothing when created (before payment).
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

function harness(extraDocs = {}) {
  const sent = [];
  const intents = [];
  const docs = { settings: { website: { payments: {} }, notifications: {} }, ...extraDocs };
  const db = {
    collection(name) {
      return {
        doc: (id) => ({
          async get() { const data = docs[name]?.[id]; return { exists: !!data, data: () => data }; },
          async set() {}, async update() {},
        }),
        add: async () => {},
        where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
      };
    },
    async runTransaction(fn) { return fn({ get: async () => ({ exists: false, data: () => ({}) }), update() {}, set() {} }); },
  };
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => n } }) };
  const wrap = (...args) => args.at(-1);
  const Stripe = class { constructor() { this.paymentIntents = { create: async (p) => { intents.push(p); return { id: 'pi_1', client_secret: 's' }; } }; } };
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return Stripe;
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  // Capture every email instead of sending it; skip the address check (network).
  const patched = `${source}
sendEmail = async (m) => { __sent.push(m); return { ok: true }; };
autoApproveShippingAddress = async () => {};
module.exports.__words = { loadNotificationSettings, compileEmailTemplate };`;
  vm.runInNewContext(patched, { module, exports: module.exports, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { sent, intents, exports: module.exports };
}

const order = (extra = {}) => ({ orderId: 'AB-1', customer: { name: 'Reader', email: 'reader@example.com', address: {} }, items: [{ id: 'b', title: 'Book', quantity: 1, price: 3 }], total: 3.39, subtotal: 3, shipping: 0, paymentMethod: 'Stripe', ...extra });
const created = (data) => ({ data: { data: () => data }, params: { orderId: 'o1' } });
const updated = (before, after) => ({ data: { before: { data: () => before }, after: { data: () => after } }, params: { orderId: 'o1' } });

test('a card order sends nothing when it is created (it is not paid yet)', async () => {
  const app = harness();
  await app.exports.onOrderCreated(created(order({ paymentStatus: 'unpaid' })));
  expect(app.sent).toEqual([]);
});

test('a manual-payment order tells the shop once when placed', async () => {
  const app = harness();
  await app.exports.onOrderCreated(created(order({ paymentStatus: 'pending', paymentMethod: 'e-Transfer' })));
  expect(app.sent.filter((m) => m.to === 'owner@example.com' && /\[NEW ORDER\]/.test(m.subject)).length).toBe(1);
});

test('becoming paid sends exactly one customer email and one shop email', async () => {
  const app = harness();
  await app.exports.onOrderUpdated(updated(order({ paymentStatus: 'unpaid' }), order({ paymentStatus: 'paid' })));
  const toCustomer = app.sent.filter((m) => m.to === 'reader@example.com');
  const toShop = app.sent.filter((m) => m.to === 'owner@example.com');
  expect(toCustomer.length).toBe(1);
  expect(toShop.length).toBe(1);
  expect(toShop[0].subject).toMatch(/^\[NEW ORDER\] AB-1 · paid/);
  // One click to the order's fulfilment page in the admin.
  expect(toShop[0].html).toMatch(/href="[^"]*\/admin#orders\/o1"[^>]*>Fulfil this order/);
});

test('"Resend order confirmation" sends the customer one more copy per request, never the shop email', async () => {
  const app = harness();
  const paid = order({ paymentStatus: 'paid' });
  const stamped = order({ paymentStatus: 'paid', confirmationEmailRequestedAt: '2026-10-10T10:00:00.000Z' });
  await app.exports.onOrderUpdated(updated(paid, stamped));
  await app.exports.onOrderUpdated(updated(stamped, stamped)); // unrelated later update: no resend
  expect(app.sent.filter((m) => m.to === 'reader@example.com').length).toBe(1);
  expect(app.sent.filter((m) => m.to === 'owner@example.com').length).toBe(0);
  await app.exports.onOrderUpdated(updated(order({ paymentStatus: 'unpaid' }), order({ paymentStatus: 'unpaid', confirmationEmailRequestedAt: 'x' })));
  expect(app.sent.filter((m) => m.to === 'reader@example.com').length).toBe(1);
});

test('the customer email total is exactly what the card was charged, not total × rate', async () => {
  const app = harness();
  // 3.39 CAD × 0.7299 = 2.474… → "US$2.47", but the PaymentIntent (per-line rounding) was 248 cents.
  const paid = order({ paymentStatus: 'paid', checkoutCurrency: 'USD', exchangeRate: 0.7299, expectedAmountMinor: 248, expectedCurrency: 'usd' });
  await app.exports.onOrderUpdated(updated(order({ paymentStatus: 'unpaid' }), paid));
  const toCustomer = app.sent.filter((m) => m.to === 'reader@example.com');
  expect(toCustomer).toHaveLength(1);
  expect(toCustomer[0].html).toContain('US$2.48');
  expect(toCustomer[0].html).not.toContain('US$2.47');
});

test('a sandbox order marks the shop email [TEST]', async () => {
  const app = harness();
  await app.exports.onOrderUpdated(updated(order({ paymentStatus: 'unpaid' }), order({ paymentStatus: 'paid', isTest: true, sandboxPayment: true })));
  expect(app.sent.find((m) => m.to === 'owner@example.com').subject).toMatch(/^\[TEST\] \[NEW ORDER\]/);
});

test('the card payment asks Stripe for no receipt email', () => {
  // The card payment intent is created by the Stripe payment provider (payments/stripe.js, createCardIntent).
  const payment = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'payments', 'stripe.js'), 'utf8');
  const call = payment.slice(payment.indexOf('stripe.paymentIntents.create({'), payment.indexOf('metadata: { order_id: orderId, checkout: "payment_element" }'));
  expect(call.length).toBeGreaterThan(0);
  expect(call).not.toMatch(/^\s*receipt_email\s*:/m);
});

// Plan 10.23: a shop that doesn't sell books gets its own words in customer emails; a books shop keeps every word.
const BOOK_REVIEW_SUBJECT = 'How are you finding your book?';
test('a clothing shop\'s customer emails say "your order", never "your book" or "reading"', async () => {
  const app = harness({ firstWeek: { start: { publishes: 'clothing' } } });
  const settings = await app.exports.__words.loadNotificationSettings();
  expect(settings.review_request.subject).toBe('How are you finding your order?');
  expect(settings.customer_welcome.body).toContain('download your digital purchases');
  const gift = app.exports.__words.compileEmailTemplate('gift_card', settings, { recipient_name: 'Sam', sender_name: 'Jo', amount: 'CA$5.00', code: 'ABCD', message: '', expires: '' });
  expect(gift.html).toContain('Enjoy,');
  for (const id of ['customer_welcome', 'gift_card', 'review_request']) {
    const { subject, html } = app.exports.__words.compileEmailTemplate(id, settings, { customer_name: 'Sam', recipient_name: 'Sam', code: 'ABCD' });
    expect(`${subject} ${html}`, id).not.toMatch(/\b(books?|reading|readers?)\b/i);
  }
  // An emptied field falls back to the shop's own words too.
  const emptied = app.exports.__words.compileEmailTemplate('gift_card', { ...settings, gift_card: { ...settings.gift_card, signoff: '' } }, { code: 'ABCD' });
  expect(emptied.html).toContain('Enjoy,');
});

test('saved words still at the books default read as the shop\'s; words the owner wrote are kept', async () => {
  const notifications = { review_request: { subject: BOOK_REVIEW_SUBJECT, body: 'Our own words about your new shirt.', enabled: true } };
  const app = harness({ firstWeek: { start: { publishes: 'jewelry' } }, settings: { website: { payments: {} }, notifications } });
  const settings = await app.exports.__words.loadNotificationSettings();
  expect(settings.review_request.subject).toBe('How are you finding your order?');
  expect(settings.review_request.body).toBe('Our own words about your new shirt.');
});

test('a books shop, a skipped answer or an unknown one keeps the book words', async () => {
  for (const start of [undefined, { publishes: 'books' }, { publishes: 'zines' }, { publishes: 'spaceships' }, {}]) {
    const app = harness(start ? { firstWeek: { start } } : {});
    const settings = await app.exports.__words.loadNotificationSettings();
    expect(settings.review_request.subject, JSON.stringify(start)).toBe(BOOK_REVIEW_SUBJECT);
    expect(settings.gift_card.signoff).toBe('Happy reading,\nThe {{shop_name}} team');
    expect(settings.customer_welcome.body).toContain('digital library books');
  }
});
