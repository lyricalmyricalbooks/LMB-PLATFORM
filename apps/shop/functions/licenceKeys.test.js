// Gap list 38: licence keys. Pure rules, then the transaction against a small fake Firestore.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const lk = require('./licenceKeys');

const line = (extra = {}) => ({ id: 'app', title: 'Font Pack', quantity: 1, price: 20, ...extra });

function fakeDb(initial) {
  const docs = structuredClone(initial);
  const refOf = (name, id) => ({ name, id });
  const read = (r) => { const v = docs[r.name]?.[r.id]; return { exists: v !== undefined, data: () => structuredClone(v) }; };
  return {
    docs,
    collection: (name) => ({ doc: (id) => refOf(name, id) }),
    async runTransaction(fn) {
      const writes = [];
      const out = await fn({ get: async (r) => read(r), update: (r, v) => writes.push([r, v]) });
      for (const [r, v] of writes) Object.assign(docs[r.name][r.id], v);
      return out;
    },
  };
}

describe('cleanKeys', () => {
  test('one per line, trimmed, no blanks, repeats or overlong keys', () => {
    expect(lk.cleanKeys(' A-1 \r\n\nB-2\nA-1\n' + 'x'.repeat(201))).toEqual(['A-1', 'B-2']);
  });
  test('stops at the cap', () => {
    expect(lk.cleanKeys(Array.from({ length: 2100 }, (_, i) => `K${i}`).join('\n'))).toHaveLength(lk.MAX_KEYS);
  });
});

describe('takeKeys', () => {
  test('each copy takes the next key; gift cards, box sets and free gifts take none', () => {
    const order = { items: [line({ quantity: 2 }), line({ id: 'gc', giftCard: true }), line({ bundle: true }), line({ promoGift: true })] };
    const r = lk.takeKeys(order, { app: { available: ['K1', 'K2', 'K3'] }, gc: { available: ['G'] } });
    expect(r.assigned).toEqual([{ line: 0, title: 'Font Pack', keys: ['K1', 'K2'] }]);
    expect(r.left.get('app')).toEqual(['K3']);
    expect(r.short).toBe(0);
  });
  test('two lines of one product share the pool and never get the same key', () => {
    const r = lk.takeKeys({ items: [line(), line({ title: 'Font Pack (again)' })] }, { app: { available: ['K1', 'K2'] } });
    expect(r.assigned.map((e) => e.keys)).toEqual([['K1'], ['K2']]);
  });
  test('a short pool records what is still owed, and a later run tops it up', () => {
    const first = lk.takeKeys({ items: [line({ quantity: 3 })] }, { app: { available: ['K1'] } });
    expect(first.short).toBe(2);
    const second = lk.takeKeys({ items: [line({ quantity: 3 })], licenceKeys: first.assigned }, { app: { available: ['K2', 'K3', 'K4'] } });
    expect(second.assigned[0].keys).toEqual(['K1', 'K2', 'K3']);
    expect(second.added).toBe(2);
    expect(second.left.get('app')).toEqual(['K4']);
  });
  test('a sandbox order gets stand-ins and spends nothing', () => {
    const r = lk.takeKeys({ items: [line({ quantity: 2 })] }, { app: { available: ['K1'] } }, { test: true });
    expect(r.assigned[0].keys).toEqual(['TEST-KEY-1-1', 'TEST-KEY-1-2']);
    expect(r.left.size).toBe(0);
  });
});

describe('assignLicenceKeys', () => {
  const world = (order) => ({ orders: { o1: { paymentStatus: 'paid', items: [line({ quantity: 2 })], ...order } }, licenceKeys: { app: { available: ['K1', 'K2', 'K3'], givenCount: 4 } } });
  const run = (db) => lk.assignLicenceKeys({ db, orderId: 'o1', now: () => 'T' });

  test('a paid order takes its keys once', async () => {
    const db = fakeDb(world());
    expect((await run(db)).added).toBe(2);
    expect(db.docs.orders.o1).toMatchObject({ licenceKeys: [{ line: 0, keys: ['K1', 'K2'] }], licenceKeysAt: 'T', licenceKeysShort: 0 });
    expect(db.docs.licenceKeys.app).toMatchObject({ available: ['K3'], givenCount: 6 });
    expect(await run(db)).toBeNull();
    expect(db.docs.licenceKeys.app.available).toEqual(['K3']);
  });
  test.each([
    ['unpaid', { paymentStatus: 'unpaid' }],
    ['cancelled', { status: 'cancelled' }],
    ['held for review', { review: { status: 'needs_review' } }],
  ])('%s orders take nothing', async (_n, extra) => {
    const db = fakeDb(world(extra));
    expect(await run(db)).toBeNull();
    expect(db.docs.licenceKeys.app.available).toHaveLength(3);
  });
  test('a product with no keys leaves the order alone', async () => {
    const db = fakeDb({ orders: { o1: { paymentStatus: 'paid', items: [line()] } }, licenceKeys: {} });
    expect(await run(db)).toBeNull();
    expect(db.docs.orders.o1.licenceKeysAt).toBeUndefined();
  });
  test('an order that ran short takes the rest once more keys arrive', async () => {
    const db = fakeDb(world({ items: [line({ quantity: 4 })] }));
    expect((await run(db)).short).toBe(1);
    db.docs.licenceKeys.app.available = ['K9'];
    expect((await run(db)).short).toBe(0);
    expect(db.docs.orders.o1.licenceKeys[0].keys).toEqual(['K1', 'K2', 'K3', 'K9']);
  });
});

describe('licenceKeysEmailSection', () => {
  const esc = (s) => String(s).replace(/</g, '&lt;');
  test('escapes keys and says when more are coming', () => {
    const html = lk.licenceKeysEmailSection({ licenceKeys: [{ line: 0, title: 'A<b>', keys: ['<K>'] }], licenceKeysShort: 1 }, { escapeHtml: esc });
    expect(html).toContain('&lt;K>');
    expect(html).toContain('A&lt;b>');
    expect(html).toContain("rest of your codes");
  });
  test('nothing for an order without keys', () => {
    expect(lk.licenceKeysEmailSection({}, { escapeHtml: esc })).toBe('');
  });
});
