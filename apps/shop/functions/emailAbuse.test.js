// PR 2 (email abuse and correctness): a shop-wide budget for anonymous-triggered email, one plain
// recipient, proof-of-owner before reminder/alert email, readable CTA buttons, digital-only
// confirmation wording, the Resend secret everywhere, Gmail timeouts and the postal-address gate.
import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');
const { claimEmailSend, GLOBAL_EMAIL_BUDGET } = realRequire('./emailThrottle');
const { risoLayout } = realRequire('./emailTheme');

// ── A small in-memory Firestore: enough for the triggers under test ──────────────────────────
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  let auto = 0;
  const dig = (obj, field) => field.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Date ? x.toISOString() : x))));
  const docRef = (coll, id) => {
    const key = `${coll}/${id}`;
    const ref = {
      id, path: key,
      async get() { const data = store.get(key); return { exists: data !== undefined, id, ref, data: () => clone(data), get: f => dig(data, f) }; },
      set(d, opts) { store.set(key, opts?.merge ? { ...(store.get(key) || {}), ...clone(d) } : clone(d)); return Promise.resolve(); },
      update(d) { if (!store.has(key)) return Promise.reject(new Error('NOT_FOUND')); store.set(key, { ...store.get(key), ...clone(d) }); return Promise.resolve(); },
      delete() { store.delete(key); return Promise.resolve(); },
    };
    return ref;
  };
  const query = (coll, filters = []) => ({
    where: (f, op, v) => query(coll, [...filters, [f, op, v]]),
    orderBy: () => query(coll, filters), limit: () => query(coll, filters),
    async get() {
      const docs = [];
      for (const [key, data] of store) {
        if (!key.startsWith(`${coll}/`) || key.slice(coll.length + 1).includes('/')) continue;
        const ok = filters.every(([f, op, v]) => {
          const x = dig(data, f);
          return op === '==' ? x === v : op === '<' ? x < v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : op === '!=' ? x !== v : true;
        });
        if (ok) { const id = key.slice(coll.length + 1); docs.push({ id, ref: docRef(coll, id), data: () => clone(data), get: f => dig(data, f), exists: true }); }
      }
      return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) };
    },
  });
  const db = {
    store,
    collection: coll => ({ doc: id => docRef(coll, id || `auto${++auto}`), add: async d => { const r = docRef(coll, `auto${++auto}`); await r.set(d); return r; }, ...query(coll) }),
    async runTransaction(fn) { return fn({ get: r => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), delete: r => r.delete() }); },
    batch() { const ops = []; return { delete: r => ops.push(() => r.delete()), update: (r, d) => ops.push(() => r.update(d)), set: (r, d, o) => ops.push(() => r.set(d, o)), commit: async () => { for (const op of ops) await op(); } }; },
  };
  return db;
}

function load({ db = makeDb(), users = {}, realSend = false } = {}) {
  const sent = [];
  const resendKeys = [];
  const transports = [];
  const exportsOf = {};
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: n => n } }), auth: () => ({ getUserByEmail: async e => { if (users[e]) return users[e]; const err = new Error('no user'); err.code = 'auth/user-not-found'; throw err; } }), appCheck: () => ({ verifyToken: async () => ({}) }) };
  const capture = _name => (...args) => { const handler = args.at(-1); if (typeof handler === 'function') handler.__opts = args.length > 1 ? args[0] : {}; return handler; };
  const mockRequire = name => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return class { constructor() { this.paymentIntents = {}; } };
    if (name === 'resend') return { Resend: class { constructor(key) { resendKeys.push(key); this.emails = { send: async () => ({ data: { id: 'r1' }, error: null }) }; } } };
    if (name === 'nodemailer') return { createTransport: opts => { transports.push(opts); return { sendMail: async () => ({ messageId: 'g1' }) }; } };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: (_, prop) => capture(prop) });
    if (name === 'firebase-functions/params') return { defineSecret: n => ({ name: n, value: () => (n === 'RESEND_API_KEY' ? 're_fake' : 'fake') }) };
    return realRequire(name);
  };
  const module = { exports: exportsOf };
  const patched = `${source}
module.exports.__t = { sendEmail, handlePrivacyRequest, compileEmailTemplate };
${realSend ? '' : 'sendEmail = async (m) => { __sent.push(m); return { ok: true }; };'}
autoApproveShippingAddress = async () => {};`;
  vm.runInNewContext(patched, { module, exports: exportsOf, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { sent, resendKeys, transports, exports: module.exports, db };
}

const quiet = {};
beforeEach(() => { for (const k of ['warn', 'error', 'log', 'info']) { quiet[k] = console[k]; console[k] = () => {}; } });
afterEach(() => { for (const k of ['warn', 'error', 'log', 'info']) console[k] = quiet[k]; });

const SETTINGS = { 'settings/website': { location: { street: '1 Main St', city: 'Toronto', state: 'ON', country: 'Canada' } } };
const contact = (email, extra = {}) => { const ref = { async get() { return { exists: true, get: () => 'new' }; }, update: async () => {} }; return { data: { data: () => ({ name: 'Ada', email, message: 'Hello', ...extra }), ref }, params: { messageId: 'm1' } }; };

// ── 1 / 31: one shop-wide budget, whoever is typed ───────────────────────────────────────────
test('rotating fake sender addresses cannot exceed the shop-wide hourly email budget', async () => {
  const db = makeDb();
  let allowed = 0;
  for (let i = 0; i < 200; i++) if (await claimEmailSend(db, 'ownerNotify', `fake${i}@example.com`, { now: 1000 })) allowed++;
  expect(allowed).toBe(GLOBAL_EMAIL_BUDGET.hour.max);
});

test('the daily budget caps a whole day even when every hour is fresh', async () => {
  const db = makeDb();
  let allowed = 0;
  for (let hour = 0; hour < 24; hour++) {
    for (let i = 0; i < 100; i++) if (await claimEmailSend(db, 'visitorReply', `h${hour}-${i}@example.com`, { now: hour * 61 * 60 * 1000 + 1 })) allowed++;
  }
  expect(allowed).toBe(GLOBAL_EMAIL_BUDGET.day.max);
});

test('a refused send uses nothing from the budget, and the per-address limit still applies', async () => {
  const db = makeDb();
  expect(await claimEmailSend(db, 'visitorReply', 'a@example.com', { now: 5 })).toBe(true);
  expect(await claimEmailSend(db, 'visitorReply', 'a@example.com', { now: 6 })).toBe(false);
  expect(db.store.get('contact-email-throttle/_global_hour').count).toBe(1);
});

test('the contact form with a new fake sender each time stops mailing past the budget', async () => {
  const app = load({ db: makeDb(SETTINGS) });
  for (let i = 0; i < 80; i++) await app.exports.onContactMessage(contact(`fake${i}@example.com`));
  expect(app.sent.length).toBeLessThanOrEqual(GLOBAL_EMAIL_BUDGET.hour.max);
  expect(app.sent.length).toBeGreaterThan(0);
});

// ── 3: one plain address, never a list ───────────────────────────────────────────────────────
test('a contact "email" that is a list of addresses is never mailed', async () => {
  const app = load({ db: makeDb(SETTINGS) });
  await app.exports.onContactMessage(contact('a@x.com,b@y.com,c@z.com'));
  expect(app.sent.filter(m => String(m.to).includes(','))).toEqual([]);
  expect(app.sent.filter(m => m.to !== 'lyricalmyricalbooks@gmail.com')).toEqual([]);
});

test('sendEmail refuses a recipient that is not one plain address', async () => {
  const app = load({ db: makeDb(SETTINGS), realSend: true });
  for (const to of ['a@x.com,b@y.com', 'a@x.com;b@y.com', 'a@x.com b@y.com', 'Ada <a@x.com>', 'a@x.com\r\nBcc: z@z.com']) {
    await expect(app.exports.__t.sendEmail({ to, subject: 's', html: '<p>x</p>' })).rejects.toThrow(/not a valid email address/);
  }
  expect(app.resendKeys).toEqual([]);
});

test('the contactMessages rule accepts only one plain address', () => {
  const rules = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8');
  const block = rules.slice(rules.indexOf('match /contactMessages/'));
  const line = block.split('\n').find(l => l.includes('email.matches('));
  expect(line).toBeTruthy();
  expect(line).not.toContain('".+@.+');
  const pattern = new RegExp('^' + /matches\("(.*)"\)/.exec(line)[1].replace(/\\\\/g, '\\') + '$');
  expect(pattern.test('reader@example.com')).toBe(true);
  for (const bad of ['a@x.com,b@y.com', 'a@x.com;b@y.com', 'a@x.com b@y.com', 'Ada <a@x.com>', 'a@x.com\nb@y.com']) expect(pattern.test(bad)).toBe(false);
});

// ── 31: privacy and order-request emails ─────────────────────────────────────────────────────
function res() { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; }
const privacyReq = (email, i = 1) => ({ method: 'POST', headers: { 'x-forwarded-for': `203.0.113.${i % 250}` }, body: { email, type: 'export' } });

test('the same address asking for its data again adds neither a second record nor a second email', async () => {
  const app = load({ db: makeDb(SETTINGS) });
  for (let i = 0; i < 3; i++) { const r = res(); await app.exports.__t.handlePrivacyRequest(privacyReq('ada@example.com', i), r); expect(r.code).toBe(200); }
  expect(app.sent.length).toBe(1);
  expect([...app.db.store.keys()].filter(k => k.startsWith('privacyRequests/')).length).toBe(1);
});

test('privacy requests from many fake addresses stay within the shop-wide email budget but are still recorded', async () => {
  const app = load({ db: makeDb(SETTINGS) });
  for (let i = 0; i < 70; i++) await app.exports.__t.handlePrivacyRequest(privacyReq(`fake${i}@example.com`, i), res());
  expect(app.sent.length).toBe(GLOBAL_EMAIL_BUDGET.hour.max);
  expect([...app.db.store.keys()].filter(k => k.startsWith('privacyRequests/')).length).toBe(70);
});

// ── 26: guests who only typed their email are reminded, once per address ever ─────────────────
const cartDoc = (email, extra = {}) => ({ email, recovered: false, updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), items: [{ id: 'b1', qty: 1 }], ...extra });
const BOOK = { 'books/b1': { title: 'Poems', retailPrice: 20, status: 'published' } };
const runSweep = app => app.exports.abandonedCartSweep({});
const checkoutAttempt = email => ({ 'orders/o1': { customer: { email }, stripePaymentIntentId: 'pi_1', paymentStatus: 'unpaid' } });

test('a guest who only typed their email at checkout gets a reminder', async () => {
  const app = load({ db: makeDb({ ...SETTINGS, ...BOOK, 'abandoned-carts/c1': cartDoc('guest@example.com') }) });
  await runSweep(app);
  expect(app.sent.map(m => m.to)).toEqual(['guest@example.com']);
});

test('carts naming the same address reach it once, ever', async () => {
  const db = makeDb({ ...SETTINGS, ...BOOK, 'abandoned-carts/c1': cartDoc('someone@example.com'), 'abandoned-carts/c2': cartDoc('someone@example.com') });
  const app = load({ db });
  await runSweep(app);
  db.store.set('abandoned-carts/c3', cartDoc('someone@example.com'));
  await runSweep(app);
  expect(app.sent.map(m => m.to)).toEqual(['someone@example.com']);
});

test('reminders also stop when the shop-wide email budget is used up', async () => {
  const seed = { ...SETTINGS, ...BOOK, 'contact-email-throttle/_global_hour': { windowStart: Date.now(), count: GLOBAL_EMAIL_BUDGET.hour.max } };
  Object.assign(seed, checkoutAttempt('shopper@example.com'), { 'abandoned-carts/c1': cartDoc('shopper@example.com') });
  const app = load({ db: makeDb(seed) });
  await runSweep(app);
  expect(app.sent).toEqual([]);
});

const restock = () => ({ data: { before: { data: () => ({ title: 'Poems', status: 'published', stockLevel: 0, trackInventory: true }) }, after: { data: () => ({ title: 'Poems', status: 'published', stockLevel: 5, trackInventory: true }) } }, params: { bookId: 'b1' } });
const alertDoc = email => ({ email, bookId: 'b1', variantId: '', status: 'waiting', bookTitle: 'Poems' });

test('back-in-stock mail goes to a new guest too, once per address, within the shop-wide budget', async () => {
  const seed = { ...SETTINGS, 'stockAlerts/guest': alertDoc('guest@example.com') };
  const app = load({ db: makeDb(seed) });
  await app.exports.onBookRestocked(restock());
  expect(app.sent.map(m => m.to)).toEqual(['guest@example.com']);
  const full = { ...SETTINGS, 'stockAlerts/guest': alertDoc('guest@example.com'), 'contact-email-throttle/_global_hour': { windowStart: Date.now(), count: GLOBAL_EMAIL_BUDGET.hour.max } };
  const over = load({ db: makeDb(full) });
  await over.exports.onBookRestocked(restock());
  expect(over.sent).toEqual([]);
  expect(over.db.store.get('stockAlerts/guest').status).toBe('waiting');
});

// Coming soon: no email while the switch is on; switching it off sends "Out now" to the page's signups.
const bookEvent = (before, after) => ({ data: { before: { data: () => ({ title: 'Poems', status: 'published', ...before }) }, after: { data: () => ({ title: 'Poems', status: 'published', ...after }) } }, params: { bookId: 'b1' } });

test('a Coming soon book emails its signups only when it comes out', async () => {
  const waiting = load({ db: makeDb({ ...SETTINGS, 'stockAlerts/fan': alertDoc('fan@example.com') }) });
  await waiting.exports.onBookRestocked(bookEvent({ comingSoon: true, stockLevel: 0, trackInventory: true }, { comingSoon: true, stockLevel: 50, trackInventory: true }));
  expect(waiting.sent).toEqual([]);
  expect(waiting.db.store.get('stockAlerts/fan').status).toBe('waiting');

  const out = load({ db: makeDb({ ...SETTINGS, 'stockAlerts/fan': alertDoc('fan@example.com') }) });
  await out.exports.onBookRestocked(bookEvent({ comingSoon: true, stockLevel: 50, trackInventory: true }, { comingSoon: false, stockLevel: 50, trackInventory: true }));
  expect(out.sent.map(m => m.to)).toEqual(['fan@example.com']);
  expect(out.sent[0].subject).toMatch(/^Out now: Poems/);

  // Sold in editions: a book-wide signup hears when any edition can be bought.
  const editions = load({ db: makeDb({ ...SETTINGS, 'stockAlerts/fan': alertDoc('fan@example.com') }) });
  await editions.exports.onBookRestocked(bookEvent({ comingSoon: true, stockLevel: 0, variants: [{ id: 'pb', stock: 4 }] }, { comingSoon: false, stockLevel: 0, variants: [{ id: 'pb', stock: 4 }] }));
  expect(editions.sent.map(m => m.to)).toEqual(['fan@example.com']);
});

// ── 27: CTA buttons readable in the light theme ──────────────────────────────────────────────
const buttonPairs = html => [...risoLayout(html, { theme: 'light' }).matchAll(/<a [^>]*style="([^"]*)"/g)]
  .map(m => ({ bg: /background:\s*(#[0-9a-f]{3,8})/i.exec(m[1])?.[1], fg: /(?:^|;)\s*color:\s*(#[0-9a-f]{3,8})/i.exec(m[1])?.[1] }))
  .filter(p => p.bg && p.fg);

test('the shop alerts and back-in-stock "Shop now" are not ink on ink', async () => {
  const paid = load({ db: makeDb(SETTINGS) });
  const order = { orderId: 'AB-1', customer: { name: 'Reader', email: 'reader@example.com', address: {} }, items: [{ id: 'b', title: 'Book', quantity: 1, price: 3, format: 'Paperback' }], total: 3.39, subtotal: 3, shipping: 0, paymentMethod: 'Stripe', paymentStatus: 'unpaid' };
  await paid.exports.onOrderUpdated({ data: { before: { data: () => order }, after: { data: () => ({ ...order, paymentStatus: 'paid' }) } }, params: { orderId: 'o1' } });
  const shop = paid.sent.find(m => /NEW ORDER/.test(m.subject));
  expect(shop).toBeTruthy();
  const pairs = buttonPairs(shop.html);
  expect(pairs.length).toBeGreaterThan(0);
  for (const p of pairs) expect(p.bg.toLowerCase()).not.toBe(p.fg.toLowerCase());

  const manual = load({ db: makeDb(SETTINGS) });
  await manual.exports.onOrderCreated({ data: { data: () => ({ ...order, paymentStatus: 'pending', paymentMethod: 'e-Transfer' }) }, params: { orderId: 'o2' } });
  const alert = manual.sent.find(m => /NEW ORDER/.test(m.subject));
  expect(alert).toBeTruthy();
  for (const p of buttonPairs(alert.html)) expect(p.bg.toLowerCase()).not.toBe(p.fg.toLowerCase());

  const back = load({ db: makeDb({ ...SETTINGS, 'stockAlerts/buyer': alertDoc('buyer@example.com'), ...checkoutAttempt('buyer@example.com') }) });
  await back.exports.onBookRestocked(restock());
  const pairs2 = buttonPairs(back.sent[0].html);
  expect(pairs2.length).toBeGreaterThan(0);
  for (const p of pairs2) expect(p.bg.toLowerCase()).not.toBe(p.fg.toLowerCase());
});

// ── 98: digital-only confirmation wording ────────────────────────────────────────────────────
const confirmation = async items => {
  const app = load({ db: makeDb(SETTINGS) });
  const order = { orderId: 'AB-2', customer: { name: 'Reader', email: 'reader@example.com', address: {} }, items, total: 5, subtotal: 5, shipping: 0, paymentMethod: 'Stripe', paymentStatus: 'unpaid', downloadToken: 't' };
  await app.exports.onOrderUpdated({ data: { before: { data: () => order }, after: { data: () => ({ ...order, paymentStatus: 'paid' }) } }, params: { orderId: 'o3' } });
  return app.sent.find(m => m.to === 'reader@example.com').html;
};

test('an e-book-only order is not told it is being prepared for shipment', async () => {
  const html = await confirmation([{ id: 'e', title: 'Ebook', quantity: 1, price: 5, format: 'E-book', digital: true }]);
  expect(html).not.toMatch(/shipment|has shipped|when it ships/i);
  expect(html).toMatch(/download links are below/i);
  expect(html).toMatch(/Download File/);
});

test('an order with a printed book still gets the shipping wording', async () => {
  const html = await confirmation([{ id: 'e', title: 'Ebook', quantity: 1, price: 5, format: 'E-book', digital: true }, { id: 'p', title: 'Print', quantity: 1, price: 20, format: 'Paperback' }]);
  expect(html).toMatch(/preparing it for shipment/);
});

// ── 73: the Resend secret reaches every sender ───────────────────────────────────────────────
test('sendEmail called without a secret still uses the Functions RESEND_API_KEY', async () => {
  const app = load({ db: makeDb(SETTINGS), realSend: true });
  await app.exports.__t.sendEmail({ to: 'reader@example.com', subject: 's', html: '<p>x</p>' });
  expect(app.resendKeys).toEqual(['re_fake']);
});

test('every function that can send email declares RESEND_API_KEY, including the Stripe webhook', () => {
  const app = load();
  const names = (fn) => (fn.__opts?.secrets || []).map(s => s.name);
  for (const fn of ['stripeWebhook', 'createStripeCheckoutSession', 'onOrderUpdated', 'onOrderCreated', 'abandonedCartSweep', 'onBookRestocked', 'unpaidPaymentSweep', 'onContactMessage', 'shippoWebhook']) {
    expect(names(app.exports[fn]), fn).toContain('RESEND_API_KEY');
  }
});

// ── 89: Gmail SMTP cannot hang a send ────────────────────────────────────────────────────────
test('the Gmail SMTP transport has connection, greeting and socket timeouts', async () => {
  const db = makeDb({ ...SETTINGS, 'adminSecrets/gmail': { appPassword: 'abcd efgh ijkl mnop' } });
  const app = load({ db, realSend: true });
  await app.exports.__t.sendEmail({ to: 'reader@example.com', subject: 's', html: '<p>x</p>' });
  expect(app.transports.length).toBe(1);
  for (const key of ['connectionTimeout', 'greetingTimeout', 'socketTimeout']) expect(app.transports[0][key]).toBeGreaterThan(0);
  expect(app.transports[0].socketTimeout).toBeLessThanOrEqual(30000);
});

// ── 102: no marketing email without a postal address ─────────────────────────────────────────
test('the abandoned-cart sweep sends nothing until a postal address is saved', async () => {
  const seed = { ...BOOK, ...checkoutAttempt('shopper@example.com'), 'abandoned-carts/c1': cartDoc('shopper@example.com') };
  const without = load({ db: makeDb(seed) });
  await runSweep(without);
  expect(without.sent).toEqual([]);
  const withAddress = load({ db: makeDb({ ...seed, ...SETTINGS }) });
  await runSweep(withAddress);
  expect(withAddress.sent.length).toBe(1);
});

// ── Already-fixed faults: guards so they cannot regress ──────────────────────────────────────
test('a lost chargeback is not mailed as a shop refund, and a partial refund is mailed once', async () => {
  const { refundEmailFacts } = realRequire('./emailMoney');
  expect(refundEmailFacts({ total: 20, refund: { provider: 'dispute', amount: 20, currency: 'CAD' } })).toBeNull();
  const app = load({ db: makeDb(SETTINGS) });
  const base = { orderId: 'AB-3', customer: { name: 'R', email: 'r@example.com', address: {} }, items: [{ id: 'p', title: 'Print', quantity: 1, price: 20, format: 'Paperback' }], total: 20, paymentStatus: 'paid', expectedCurrency: 'CAD' };
  await app.exports.onOrderUpdated({ data: { before: { data: () => base }, after: { data: () => ({ ...base, partiallyRefunded: true, refundedAmountMinor: 500 }) } }, params: { orderId: 'o4' } });
  expect(app.sent.filter(m => m.to === 'r@example.com').length).toBe(1);
});

test('{{items_table}} written into a body is replaced once, without <br/> inside the table', () => {
  const app = load();
  const table = '<table><tr><td>Row</td></tr></table>';
  const { html } = app.exports.__t.compileEmailTemplate('order_pending_payment', { order_pending_payment: { subject: 's', body: 'Hi\n{{items_table}}\nBye', buttonText: '', signoff: '' } }, { items_table: table });
  expect(html.split('<td>Row</td>').length - 1).toBe(1);
  expect(html).not.toMatch(/<table><br\/>/);
});
