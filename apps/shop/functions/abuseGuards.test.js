// Emails a visitor can trigger without signing in must not become a relay to strangers'
// inboxes, and server errors must not leak internals to the browser.
import { expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

function harness({ authUsers = {}, failOrders = false } = {}) {
  const sent = [];
  const docs = { 'settings/website': { payments: {} }, 'settings/notifications': {} };
  const ref = (col, id) => ({
    path: `${col}/${id}`,
    async get() {
      if (failOrders && col === 'orders') throw new Error('internal: projects/secret-db/orders permission detail');
      const data = docs[`${col}/${id}`];
      return { exists: !!data, data: () => data, get: k => data?.[k] };
    },
    async set(data) { docs[`${col}/${id}`] = data; },
    async update(data) { docs[`${col}/${id}`] = { ...docs[`${col}/${id}`], ...data }; },
  });
  const db = {
    collection: (col) => ({ doc: (id) => ref(col, id), add: async () => {}, where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }) }),
    async runTransaction(fn) {
      return fn({
        get: async r => r.get(),
        set: (r, data) => { docs[r.path] = data; },
        update: (r, data) => { docs[r.path] = { ...docs[r.path], ...data }; },
      });
    },
  };
  const auth = { getUser: async (uid) => { if (!authUsers[uid]) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' }); return authUsers[uid]; } };
  const admin = { initializeApp() {}, auth: () => auth, firestore: Object.assign(() => db, { FieldValue: { increment: (n) => n } }) };
  const wrap = (...args) => args.at(-1);
  const mockRequire = (name) => {
    if (name === 'firebase-admin') return admin;
    if (name === 'stripe') return class {};
    if (name === 'resend') return { Resend: class {} };
    if (name.startsWith('firebase-functions/v2/')) return new Proxy({}, { get: () => wrap });
    if (name === 'firebase-functions/params') return { defineSecret: () => ({ value: () => 'fake' }) };
    return realRequire(name);
  };
  const module = { exports: {} };
  const patched = `${source}
sendEmail = async (m) => { __sent.push(m); return { ok: true }; };`;
  const quiet = { ...console, warn() {}, error() {}, log() {} };
  vm.runInNewContext(patched, { module, exports: module.exports, require: mockRequire, process, Buffer, console: quiet, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { sent, docs, exports: module.exports };
}

const contact = (extra = {}) => ({
  data: { data: () => ({ name: 'Mallory', email: 'victim@example.com', phone: '', subject: 'WIN A PRIZE', message: 'Click http://evil.example/now to claim', page: '/contact', status: 'new', ...extra }), ref: { path: 'contactMessages/m', get: async () => ({ exists: true, get: () => 'new' }) } },
  params: { messageId: 'm' },
});
const toVisitor = (app, email = 'victim@example.com') => app.sent.filter(m => m.to === email);
const toShop = app => app.sent.filter(m => m.to === 'lyricalmyricalbooks@gmail.com');

test('the visitor confirmation never echoes what the visitor typed', async () => {
  const app = harness();
  await app.exports.onContactMessage(contact());
  const [reply] = toVisitor(app);
  expect(reply).toBeTruthy();
  expect(reply.html).not.toContain('evil.example');
  expect(reply.html).not.toContain('WIN A PRIZE');
  expect(reply.subject).not.toContain('WIN A PRIZE');
});

test('an older saved template using {{message}} gets a blank, not the visitor text', async () => {
  const app = harness();
  app.docs['settings/notifications'] = { contact_reply: { subject: 'Re: {{subject}}', body: 'You said: {{message}}', enabled: true } };
  await app.exports.onContactMessage(contact());
  const [reply] = toVisitor(app);
  expect(reply.html).not.toContain('evil.example');
  expect(reply.subject).not.toContain('WIN A PRIZE');
});

test('one address gets at most one confirmation a day, however many messages name it', async () => {
  const app = harness();
  for (let i = 0; i < 4; i++) await app.exports.onContactMessage(contact({ email: i % 2 ? 'Victim@Example.com ' : 'victim@example.com' }));
  expect(app.sent.filter(m => /victim@example\.com/i.test(m.to)).length).toBe(1);
  // The throttle stores a hash, never the address.
  expect(JSON.stringify(Object.keys(app.docs))).not.toContain('victim');
});

test('the shop is emailed at most 5 messages an hour from one sender; the rest wait in Messages', async () => {
  const app = harness();
  for (let i = 0; i < 8; i++) await app.exports.onContactMessage(contact());
  expect(toShop(app).length).toBe(5);
  // A different sender still gets through.
  await app.exports.onContactMessage(contact({ email: 'reader@example.com' }));
  expect(toShop(app).length).toBe(6);
});

const customerCreated = (uid, data) => ({ data: { data: () => data }, params: { customerId: uid } });

test('a welcome email goes only to the account\'s own verified email', async () => {
  const app = harness({ authUsers: { u1: { uid: 'u1', email: 'reader@example.com', emailVerified: true } } });
  await app.exports.onCustomerCreated(customerCreated('u1', { uid: 'u1', email: 'reader@example.com', name: 'Reader' }));
  expect(app.sent.map(m => m.to)).toEqual(['reader@example.com']);
});

test('a profile naming someone else\'s address sends nothing', async () => {
  const app = harness({ authUsers: { u1: { uid: 'u1', email: 'attacker@example.com', emailVerified: true } } });
  await app.exports.onCustomerCreated(customerCreated('u1', { uid: 'u1', email: 'victim@example.com', name: 'x' }));
  expect(app.sent).toEqual([]);
});

test('an unverified or missing account sends nothing', async () => {
  const app = harness({ authUsers: { u1: { uid: 'u1', email: 'reader@example.com', emailVerified: false } } });
  await app.exports.onCustomerCreated(customerCreated('u1', { uid: 'u1', email: 'reader@example.com' }));
  await app.exports.onCustomerCreated(customerCreated('ghost', { uid: 'ghost', email: 'reader@example.com' }));
  expect(app.sent).toEqual([]);
});

test('a failed download shows a plain message, never the internal error', async () => {
  const app = harness({ failOrders: true });
  let status = 0, body = '';
  const res = { status(code) { status = code; return this; }, send(text) { body = String(text); return this; }, redirect() {} };
  await app.exports.downloadDigitalAsset({ query: { orderId: 'o1', itemId: 'i1', token: 't' } }, res);
  expect(status).toBe(500);
  expect(body).not.toMatch(/internal|secret-db|permission/);
  expect(body.length).toBeGreaterThan(0);
});
