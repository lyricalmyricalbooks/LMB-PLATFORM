// The fair day email end to end inside index.js (sendFairDaySummary): reads the stockroom's uploaded sales, sends once a
// day to the shop, stays silent on a quiet day or in a shop without the stockroom, and "Send me now" sends again.
import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');

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

function load({ db = makeDb(), users = {}, realSend = false, stockroom = null } = {}) {
  const sent = [];
  const resendKeys = [];
  const transports = [];
  const exportsOf = {};
  const admin = { initializeApp() {}, firestore: Object.assign(() => db, { FieldValue: { increment: n => n } }), auth: () => ({ getUserByEmail: async e => { if (users[e]) return users[e]; const err = new Error('no user'); err.code = 'auth/user-not-found'; throw err; } }), appCheck: () => ({ verifyToken: async () => ({}) }) };
  const capture = _name => (...args) => { const handler = args.at(-1); if (typeof handler === 'function') handler.__opts = args.length > 1 ? args[0] : {}; return handler; };
  const mockRequire = name => {
    if (name === './inventoryLinkStore' && stockroom) return { ...realRequire('./inventoryLinkStore'), ...stockroom };
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
module.exports.__t = { sendEmail, sendFairDaySummary };
${realSend ? '' : 'sendEmail = async (m) => { __sent.push(m); return { ok: true }; };'}
autoApproveShippingAddress = async () => {};`;
  vm.runInNewContext(patched, { module, exports: exportsOf, require: mockRequire, process, Buffer, console, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  return { sent, resendKeys, transports, exports: module.exports, db };
}

const quiet = {};
beforeEach(() => { for (const k of ['warn', 'error', 'log', 'info']) { quiet[k] = console[k]; console[k] = () => {}; } });
afterEach(() => { for (const k of ['warn', 'error', 'log', 'info']) console[k] = quiet[k]; });

const EVENING = Date.parse('2026-11-04T02:00:00Z'); // 9pm in Toronto on 3 November
const sold = [{ id: 'a', title: 'Harbour Lights', currency: 'CA$', hist: [
  { chan: 'Book Fair', date: '2026-11-03', num: 'POS-1', qty: 2, price: 24, notes: 'Cash · Harbour Fair' },
] }];

test('sends the day once, to the shop, from the stockroom\'s uploads of the last day and a half', async () => {
  const asked = [];
  const t = load({ stockroom: { readBooksSoldSince: async (since) => { asked.push(since); return sold; } } });
  const first = await t.exports.__t.sendFairDaySummary(EVENING);
  expect(first).toMatchObject({ sent: true });
  expect(t.sent).toHaveLength(1);
  expect(t.sent[0].subject).toMatch(/^\[FAIR DAY\] \$48\.00 · 1 sale at Harbour Fair$/);
  expect(asked[0]).toBe(EVENING - 36 * 3600 * 1000);
  expect(t.db.store.get('systemStatus/fairDayEmail')).toMatchObject({ lastDay: '2026-11-03' });
  expect(await t.exports.__t.sendFairDaySummary(EVENING + 60_000)).toEqual({ sent: false, reason: 'already-sent' });
  expect(t.sent).toHaveLength(1);
  expect(await t.exports.__t.sendFairDaySummary(EVENING + 60_000, { force: true })).toMatchObject({ sent: true });
  expect(t.sent).toHaveLength(2);
});

test('stays silent on a quiet day and in a shop without the stockroom', async () => {
  const quietDay = load({ stockroom: { readBooksSoldSince: async () => [] } });
  expect(await quietDay.exports.__t.sendFairDaySummary(EVENING)).toEqual({ sent: false, reason: 'no-sales' });
  const none = load({ stockroom: { readBooksSoldSince: async () => { const e = new Error('5 NOT_FOUND: The database stockroom does not exist'); e.code = 5; throw e; } } });
  expect(await none.exports.__t.sendFairDaySummary(EVENING)).toEqual({ sent: false, reason: 'no-stockroom' });
  expect(quietDay.sent.length + none.sent.length).toBe(0);
  const broken = load({ stockroom: { readBooksSoldSince: async () => { const e = new Error('PERMISSION_DENIED'); e.code = 7; throw e; } } });
  await expect(broken.exports.__t.sendFairDaySummary(EVENING)).rejects.toThrow(/PERMISSION_DENIED/);
});
