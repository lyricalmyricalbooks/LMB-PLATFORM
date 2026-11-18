// Digital D2b "Tell buyers": who gets the new-version email, never twice, a page at a time, one job per product.
import { expect, test } from 'vitest';
import { createRequire } from 'module';
const { updateLines, updateAudience, updateEmail, runDigitalUpdates, digitalUpdateActions, MAX_SENDS_PER_RUN } = createRequire(import.meta.url)('./digitalUpdates.js');

const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkFor = (orderId, order, line) => `https://shop.example/dl?o=${orderId}&i=${line.itemId}&v=${line.variantId}&t=${order.downloadToken}`;
const paid = (id, extra = {}) => ({ id, data: { paymentStatus: 'paid', downloadToken: `tok-${id}`, customer: { name: 'Ada Lovelace', email: `${id}@example.com` }, items: [{ id: 'zine', title: 'Zine', format: 'PDF' }], ...extra } });

function fakeDb(jobs = {}, books = { zine: { title: 'Zine <1>' } }) {
  const data = { digitalUpdates: jobs, books, sent: {} };
  const jobRef = id => ({
    id,
    async get() { const d = data.digitalUpdates[id]; return { exists: !!d, data: () => d }; },
    collection: () => ({ doc: h => ({
      async create(v) { const k = `${id}/${h}`; if (data.sent[k]) throw new Error('exists'); data.sent[k] = v; },
      async delete() { delete data.sent[`${id}/${h}`]; },
    }) }),
  });
  let added = 0;
  let lock = Promise.resolve();
  const db = {
    collection(name) {
      const q = { filters: [], n: 1e9, where(f, op, v) { this.filters.push([f, op, v]); return this; }, limit(n) { this.n = n; return this; },
        async get() {
          const docs = Object.entries(data[name] || {}).filter(([, d]) => this.filters.every(([f, op, v]) => (op === 'in' ? v.includes(d[f]) : d[f] === v)))
            .slice(0, this.n).map(([id, d]) => ({ id, data: () => d, ref: jobRef(id) }));
          return { docs, empty: !docs.length };
        } };
      if (name === 'books') return { doc: id => ({ async get() { const d = data.books[id]; return { exists: !!d, data: () => d }; } }) };
      return { ...q, doc: id => jobRef(id ?? `job${++added}`) };
    },
    runTransaction(fn) {
      const run = lock.then(() => fn({
        get: r => r.get(),
        update: (r, patch) => Object.assign(data.digitalUpdates[r.id], patch),
        create: (r, v) => { if (data.digitalUpdates[r.id]) throw new Error('exists'); data.digitalUpdates[r.id] = v; },
      }));
      lock = run.catch(() => {});
      return run;
    },
  };
  return { db, data };
}
const lister = rows => async (after, limit) => rows.filter(r => !after || r.id > after).slice(0, limit);
const job = extra => ({ bookId: 'zine', title: 'Zine', note: '', status: 'queued', audience: 2, sent: 0, failed: 0, cursor: '', createdAt: '2026-11-17T10:00:00Z', ...extra });

test('only paid, live orders that hold a download of the product get the email, each edition once', () => {
  expect(updateLines(paid('a').data, 'zine')).toEqual([{ itemId: 'zine', variantId: '' }]);
  expect(updateLines(paid('a', { paymentStatus: 'unpaid' }).data, 'zine')).toEqual([]);
  expect(updateLines(paid('a', { status: 'cancelled' }).data, 'zine')).toEqual([]);
  expect(updateLines(paid('a', { disputeStatus: 'needs_response' }).data, 'zine')).toEqual([]);
  expect(updateLines(paid('a', { isTest: true }).data, 'zine')).toEqual([]);
  expect(updateLines(paid('a', { downloadToken: '' }).data, 'zine')).toEqual([]);
  expect(updateLines(paid('a').data, 'other')).toEqual([]);
  // Two copies of the same edition: one link. A printed edition of the same product: none.
  const mixed = paid('a', { items: [{ id: 'zine', variantId: 'pdf' }, { id: 'zine', variantId: 'pdf' }, { id: 'zine', variantId: 'print' }] }).data;
  expect(updateLines(mixed, 'zine', v => v !== 'print')).toEqual([{ itemId: 'zine', variantId: 'pdf' }]);
  // A box set's part counts.
  const box = paid('a', { items: [{ id: 'box', bundle: true, components: [{ id: 'zine', title: 'Zine' }] }] }).data;
  expect(updateLines(box, 'zine')).toEqual([{ itemId: 'zine', variantId: '' }]);
  expect(updateAudience([paid('a').data, paid('b', { paymentStatus: 'unpaid' }).data, paid('c').data], 'zine')).toBe(2);
});

test('the email escapes the note and the title, and carries the order\'s own links', () => {
  const order = paid('a').data;
  const m = updateEmail({ title: 'Zine <1>', note: 'Fixed <b>typos</b>', order, orderId: 'a', lines: [{ itemId: 'zine', variantId: '' }], shopName: 'Riso & Co', escapeHtml, linkFor });
  expect(m.subject).toBe('A new version of Zine <1> is ready');
  expect(m.html).toContain('Zine &lt;1&gt;');
  expect(m.html).toContain('Fixed &lt;b&gt;typos&lt;/b&gt;');
  expect(m.html).toContain('Riso &amp; Co');
  expect(m.html).toContain('Hello Ada');
  expect(m.html).toContain('t=tok-a');
});

test('a run sends to each buyer once, skips the rest, and a second run sends nothing more', async () => {
  const { db, data } = fakeDb({ j1: job() });
  const sent = [];
  const deps = { db, escapeHtml, linkFor, shopName: 'Shop', listOrders: lister([paid('a'), paid('b', { paymentStatus: 'unpaid' }), paid('c')]), sendEmail: async m => { sent.push(m); } };
  const r = await runDigitalUpdates(deps);
  expect(r).toMatchObject({ sent: 2, status: 'sent' });
  expect(sent.map(m => m.to)).toEqual(['a@example.com', 'c@example.com']);
  expect(sent.every(m => m.bulk === true)).toBe(true);
  expect(data.digitalUpdates.j1).toMatchObject({ status: 'sent', sent: 2, cursor: 'c' });
  expect((await runDigitalUpdates(deps)).job).toBeNull();
  // Even if the job were queued again from the start, the claims stop a second email.
  data.digitalUpdates.j1.status = 'queued'; data.digitalUpdates.j1.cursor = '';
  await runDigitalUpdates(deps);
  expect(sent).toHaveLength(2);
});

test('a big list goes out over several runs, and a failure frees the claim and tries again later', async () => {
  const rows = Array.from({ length: MAX_SENDS_PER_RUN + 20 }, (_, i) => paid(`o${String(i).padStart(4, '0')}`));
  const { db, data } = fakeDb({ j1: job() });
  const sent = [];
  let fail = false;
  const deps = { db, escapeHtml, linkFor, listOrders: lister(rows), sendEmail: async m => { if (fail) throw new Error('down'); sent.push(m.to); } };
  expect((await runDigitalUpdates(deps)).sent).toBe(MAX_SENDS_PER_RUN);
  expect(data.digitalUpdates.j1.status).toBe('sending');
  fail = true;
  await runDigitalUpdates(deps);
  expect(data.digitalUpdates.j1).toMatchObject({ status: 'sending', failedRuns: 1 });
  fail = false;
  expect((await runDigitalUpdates(deps)).status).toBe('sent');
  expect(new Set(sent).size).toBe(rows.length);
});

test('the admin action counts buyers, queues one job per product and can stop it', async () => {
  const { db, data } = fakeDb();
  const { handleDigitalUpdate } = digitalUpdateActions({ db, requireAdmin: async () => ({ email: 'owner@example.com' }), countBuyers: async () => 3 });
  const call = async body => { const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; await handleDigitalUpdate({ body }, res); return res; };
  expect((await call({ op: 'status', bookId: 'zine' })).body).toEqual({ buyers: 3, latest: null });
  const s = await call({ op: 'send', bookId: 'zine', note: '  New cover  ' });
  expect(s.code).toBe(200);
  const [id] = Object.keys(data.digitalUpdates);
  expect(data.digitalUpdates[id]).toMatchObject({ bookId: 'zine', title: 'Zine <1>', note: 'New cover', status: 'queued', audience: 3 });
  expect((await call({ op: 'send', bookId: 'zine' })).code).toBe(409);
  expect((await call({ op: 'status', bookId: 'zine' })).body.latest).toMatchObject({ status: 'queued', audience: 3 });
  expect((await call({ op: 'cancel', bookId: 'zine' })).code).toBe(200);
  expect(data.digitalUpdates[id].status).toBe('cancelled');
  expect((await call({ op: 'send', bookId: 'gone' })).code).toBe(404);
  expect((await call({ op: 'send', bookId: '../x' })).code).toBe(400);
});

test('nobody bought it yet: nothing is queued', async () => {
  const { db, data } = fakeDb();
  const { handleDigitalUpdate } = digitalUpdateActions({ db, requireAdmin: async () => ({}), countBuyers: async () => 0 });
  const res = { status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await handleDigitalUpdate({ body: { op: 'send', bookId: 'zine' } }, res);
  expect(res.code).toBe(400);
  expect(Object.keys(data.digitalUpdates)).toHaveLength(0);
});
