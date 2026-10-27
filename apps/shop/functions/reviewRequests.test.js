// Review-request emails: off by default, once per order, honour opt-outs, bounded, retry-safe.
import { expect, test } from 'vitest';
import { createRequire } from 'module';
const { runReviewRequests, reviewRequestProblem, reviewBookIds, delayDaysOf, MAX_ATTEMPTS } = createRequire(import.meta.url)('./reviewRequests.js');

const NOW = Date.parse('2026-10-20T12:00:00Z');
const daysAgo = d => new Date(NOW - d * 86400000).toISOString();

function fakeDb(orders, { optedOut = [], books = {} } = {}) {
  const data = { orders, books, 'marketing-optout': Object.fromEntries(optedOut.map(e => [`h:${e}`, {}])) };
  const queries = [];
  const ref = (name, id) => ({ name, id,
    async get() { const d = data[name]?.[id]; return { exists: !!d, data: () => d }; },
    async update(patch) { Object.assign(data[name][id], patch); },
  });
  const db = {
    collection(name) {
      const q = { filters: [], where(f, op, v) { this.filters.push([f, op, v]); return this; }, orderBy() { return this; }, limit(n) { this.n = n; return this; },
        async get() {
          queries.push({ name, filters: this.filters, limit: this.n });
          const docs = Object.entries(data[name] || {}).filter(([, d]) => this.filters.every(([f, op, v]) => (op === '>=' ? d[f] >= v : d[f] <= v)))
            .map(([id, d]) => ({ id, data: () => d, ref: ref(name, id) }));
          return { docs };
        } };
      return { ...q, doc: id => ref(name, id) };
    },
    async runTransaction(fn) { return fn({ get: r => r.get(), update: (r, patch) => Object.assign(data[r.name][r.id], patch) }); },
  };
  return { db, data, queries };
}

const order = (extra = {}) => ({ paymentStatus: 'paid', status: 'completed', shippedAt: daysAgo(15), customer: { email: 'Ann@X.ca', name: 'Ann' }, items: [{ id: 'b1', format: 'Paperback' }, { id: 'e1', format: 'E-book (EPUB)' }], ...extra });

function deps(db, sent, { enabled = true, fail = false } = {}) {
  return {
    db, now: NOW,
    notificationSettings: { review_request: { enabled, delayDays: 14 } },
    compileEmailTemplate: (id, _s, vars, extra) => ({ subject: `${id}:${vars.order_id}`, html: `${vars.items_table}${extra}` }),
    siteLink: p => `https://shop.test${p}`,
    escapeHtml: s => String(s).replace(/</g, '&lt;'),
    optOutId: e => `h:${e}`,
    unsubscribeUrl: e => `https://shop.test/track?unsubscribe=1&e=${e}`,
    sendEmail: async m => { if (fail) throw new Error('smtp down'); sent.push(m); },
  };
}

test('does nothing while the switch is off (the default)', async () => {
  const { db, queries } = fakeDb({ o1: order() });
  const sent = [];
  expect(await runReviewRequests(deps(db, sent, { enabled: false }))).toMatchObject({ sent: 0, skipped: 'off' });
  expect(queries).toHaveLength(0);
});

test('asks once per shipped paid order, linking only printed, live books', async () => {
  const { db, data, queries } = fakeDb({ o1: order(), o2: order({ shippedAt: daysAgo(3) }) }, { books: { b1: { title: 'Odes <1>', slug: 'odes', status: 'published' } } });
  const sent = [];
  await runReviewRequests(deps(db, sent));
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ to: 'ann@x.ca', subject: 'review_request:o1' });
  expect(sent[0].html).toContain('https://shop.test/books/odes');
  expect(sent[0].html).toContain('Odes &lt;1>');
  expect(sent[0].html).toContain('unsubscribe=1');
  expect(data.orders.o1.reviewRequestedAt).toBeTruthy();
  expect(queries[0]).toMatchObject({ name: 'orders', limit: 200 });
  await runReviewRequests(deps(db, sent));
  expect(sent).toHaveLength(1);
});

test('skips opted-out shoppers, test, unpaid and e-book-only orders', async () => {
  const { db, data } = fakeDb({
    o1: order(), o2: order({ isTest: true }), o3: order({ paymentStatus: 'refunded' }), o4: order({ items: [{ id: 'e1', format: 'E-book (PDF)' }] }),
  }, { optedOut: ['ann@x.ca'], books: { b1: { title: 'Odes' } } });
  const sent = [];
  await runReviewRequests(deps(db, sent));
  expect(sent).toHaveLength(0);
  expect(data.orders.o1.reviewRequestSkipped).toBe('opted_out');
});

test('a failed send releases the claim, and gives up after a few tries', async () => {
  const { db, data } = fakeDb({ o1: order() }, { books: { b1: { title: 'Odes' } } });
  const sent = [];
  for (let i = 0; i < MAX_ATTEMPTS + 1; i++) await runReviewRequests(deps(db, sent, { fail: true }));
  expect(data.orders.o1.reviewRequestedAt).toBeNull();
  expect(data.orders.o1.reviewRequestAttempts).toBe(MAX_ATTEMPTS);
  expect(reviewRequestProblem(data.orders.o1)).toBe('gave_up');
});

test('helpers', () => {
  expect(reviewBookIds(order({ items: [{ id: 'b1' }, { id: 'b1' }, { id: 'g', giftCard: true }] }))).toEqual(['b1']);
  expect(delayDaysOf({})).toBe(14);
  expect(delayDaysOf({ delayDays: 400 })).toBe(90);
});
