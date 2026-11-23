// Away reply (plan 4, 3.7): the contact form's "Message received" email becomes the away reply while the shop is
// closed, only with Bookings on and the switch on, under the same once-a-day budget.
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
import { awayTemplate, backWords } from './awayReply.js';

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

// Noon on a Tuesday in Toronto (shopEmails reads the clock through Date.now in this realm).
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.UTC(2026, 10, 24, 17, 0))); });
afterAll(() => { vi.useRealTimers(); });
const ALWAYS_OPEN = Array.from({ length: 7 }, () => [{ start: '09:00', end: '17:00' }]);
const NEVER_OPEN = Array.from({ length: 7 }, () => []);
function shop({ bookings = true, awayReply = true, hours = NEVER_OPEN, awayWords } = {}) {
  const app = harness();
  if (bookings) app.docs['platform/features'] = { bookings: true };
  app.docs['bookingSettings/main'] = { hours, daysOff: [], awayReply, ...(awayWords ? { awayWords } : {}) };
  return app;
}
const toVisitor = (app) => app.sent.filter(m => m.to === 'victim@example.com');

test('closed with the away reply on: the owner\'s words go instead of "Message received", never the visitor\'s text', async () => {
  const app = shop({ awayWords: 'Gone printing <b>until</b> Monday.' });
  await app.exports.onContactMessage(contact());
  const [reply] = toVisitor(app);
  expect(reply.subject).toContain("we're closed right now");
  expect(reply.html).toContain('Gone printing &lt;b&gt;until&lt;/b&gt; Monday.');
  expect(reply.html).not.toContain('evil.example');
  expect(reply.html).not.toContain("We're back");
});

test('the reply says when the shop opens again', async () => {
  const app = shop({ hours: [[], [], [{ start: '14:00', end: '18:00' }], [], [], [], []] });
  await app.exports.onContactMessage(contact());
  expect(toVisitor(app)[0].html).toMatch(/We.{1,6}re back Tuesday, November 24 at 2:00/);
});

test('the standard words when the owner wrote none; nothing extra when the shop is open, off or Bookings is off', async () => {
  const closed = shop();
  await closed.exports.onContactMessage(contact());
  expect(toVisitor(closed)[0].html).toContain("answer as soon as we");
  for (const app of [shop({ hours: ALWAYS_OPEN }), shop({ awayReply: false }), shop({ bookings: false })]) {
    await app.exports.onContactMessage(contact());
    const [reply] = toVisitor(app);
    expect(reply).toBeTruthy();
    expect(reply.subject).not.toContain("closed right now");
  }
});

test('the away reply goes even when "Message received" is switched off, and still once a day per address', async () => {
  const app = shop();
  app.docs['settings/notifications'] = { contact_reply: { enabled: false } };
  for (let i = 0; i < 3; i++) await app.exports.onContactMessage(contact());
  expect(toVisitor(app).length).toBe(1);
  expect(toVisitor(app)[0].subject).toContain("closed right now");
});

test('the return time reads in the shop\'s language and clock', () => {
  const ms = Date.UTC(2026, 10, 24, 15, 0); // 10:00 a.m. in Toronto
  expect(backWords(ms, 'America/Toronto', 'en')).toMatch(/^Tuesday, November 24 at 10:00\sa\.m\.$/);
  expect(backWords(ms, 'America/Toronto', 'fr')).toMatch(/^le mardi 24 novembre à 10 h 00$/);
  expect(awayTemplate('fr', true).body).toContain('Nous serons de retour {{back}}.');
  expect(awayTemplate('en', false).body).not.toContain('{{back}}');
});
