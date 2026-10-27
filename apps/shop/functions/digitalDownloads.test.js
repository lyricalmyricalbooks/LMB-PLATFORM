// Round-2 PR 4: digital downloads. #113 capped, honest links; #61 no live link for unreleased pre-orders;
// #114 box-set parts are delivered; #115 one file per digital edition; #116 cancelled/disputed orders refused;
// #117 clean file name, attachment disposition and content type.
import { describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';

const realRequire = createRequire(import.meta.url);
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8');
const dd = realRequire('./digitalDelivery');

function harness(initial) {
  const docs = structuredClone(initial);
  const sent = [];
  const signed = [];
  const refOf = (name, id) => ({
    path: `${name}/${id}`, id,
    async get() { const v = docs[name]?.[id]; return { id, exists: v !== undefined, data: () => (v === undefined ? undefined : structuredClone(v)) }; },
    async set(v) { docs[name] ||= {}; docs[name][id] = v; },
    async update(c) { Object.assign(docs[name][id], c); },
  });
  const db = {
    collection: (name) => ({
      doc: (id) => refOf(name, id), add: async () => ({}),
      where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }), get: async () => ({ empty: true, docs: [] }) }),
    }),
    async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, v) => r.set(v), update: (r, v) => r.update(v) }); },
  };
  const firestore = Object.assign(() => db, { FieldValue: { increment: (n) => n, serverTimestamp: () => 'now', delete: () => undefined } });
  const storage = () => ({ bucket: () => ({ file: (name) => ({ exists: async () => [true], getSignedUrl: async (o) => { signed.push({ name, ...o }); return [`https://signed/${name}`]; } }) }) });
  const admin = { initializeApp() {}, firestore, storage, auth: () => ({ verifyIdToken: async () => ({}) }), appCheck: () => ({}) };
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
  const patched = `${source}\nsendEmail = async (m) => { __sent.push(m); return { ok: true }; };\nautoApproveShippingAddress = async () => {};`;
  vm.runInNewContext(patched, { module, exports: module.exports, require: mockRequire, process: { env: { APP_CHECK_MODE: 'off' } }, Buffer, console, setTimeout, clearTimeout, URL, AbortController, __sent: sent, fetch: async () => { throw new Error('no network'); } }, { filename: 'index.js' });
  const download = async (query) => {
    const res = { code: 200, body: null, location: null, status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, redirect(u) { this.location = u; return this; } };
    await module.exports.downloadDigitalAsset({ query: { orderId: 'o1', token: 'T'.repeat(8), ...query }, headers: {} }, res);
    return res;
  };
  const paid = async (items) => {
    await module.exports.onOrderUpdated({ data: { before: { data: () => order({ items, paymentStatus: 'unpaid' }) }, after: { data: () => order({ items }) } }, params: { orderId: 'o1' } });
    return sent.find((m) => m.to === 'reader@example.com').html;
  };
  return { docs, sent, signed, download, paid, exports: module.exports };
}

const line = (extra = {}) => ({ id: 'b1', title: 'Night Poems', quantity: 1, price: 10, format: 'E-book (PDF)', digital: true, ...extra });
const order = (extra = {}) => ({ orderId: 'AB-1', paymentStatus: 'paid', paymentMethod: 'Stripe', downloadToken: 'T'.repeat(8), customer: { name: 'Reader', email: 'reader@example.com', address: {} }, items: [line()], total: 10, subtotal: 10, shipping: 0, ...extra });
const book = (extra = {}) => ({ title: 'Night Poems', status: 'published', format: 'E-book (PDF)', digital: true, digitalFileName: '1730000000000-night.pdf', ...extra });
const world = (o = {}, b = {}, more = {}) => ({ orders: { o1: order(o) }, books: { b1: book(b), ...more }, settings: { website: {}, notifications: {} } });

describe('#113 download count cap', () => {
  test('the eleventh download of one line is refused and nothing more is signed', async () => {
    const app = harness(world());
    for (let i = 0; i < dd.DOWNLOAD_LIMIT; i++) expect((await app.download({ itemId: 'b1' })).location).toBeTruthy();
    const over = await app.download({ itemId: 'b1' });
    expect(over.code).toBe(429);
    expect(over.location).toBeNull();
    expect(app.signed).toHaveLength(dd.DOWNLOAD_LIMIT);
  });
  test('the owner resetting downloadCounts gives a fresh allowance, and the signed link is short-lived', async () => {
    const app = harness(world({ downloadCounts: { b1__base: 10 } }));
    expect((await app.download({ itemId: 'b1' })).code).toBe(429);
    app.docs.orders.o1.downloadCounts = {};
    expect((await app.download({ itemId: 'b1' })).location).toBeTruthy();
    expect(app.signed[0].expires - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });
  test('the email no longer claims the links expire in 24 hours', async () => {
    const html = await harness(world()).paid([line()]);
    expect(html).toContain('Download File');
    expect(html).not.toMatch(/24 hours/);
    expect(html).toMatch(/up to 10 times/);
  });
});

describe('#61 pre-ordered e-books', () => {
  test('the confirmation email gives a not-yet-released e-book no link, and says when it opens', async () => {
    const items = [line({ preorder: true, releaseDate: '2999-01-02' })];
    const html = await harness(world({ items }, { preorder: true, publishDate: '2999-01-02' })).paid(items);
    expect(html).not.toContain('Download File');
    expect(html).toContain('Available from 2999-01-02');
  });
});

describe('#114 box sets', () => {
  const box = { id: 'box', title: 'Poetry Box', bundle: true, quantity: 1, price: 30, format: 'Hardcover', components: [{ id: 'b1', variantId: '', quantity: 1, title: 'Night Poems' }] };
  test('a part of a box set downloads, and the email lists it', async () => {
    const app = harness(world({ items: [box] }, {}, { box: { title: 'Poetry Box', status: 'published' } }));
    expect((await app.download({ itemId: 'b1' })).location).toBeTruthy();
    expect(await app.paid([box])).toContain('itemId=b1');
  });
  test('a part that is only a paperback does not unlock the file', async () => {
    const app = harness(world({ items: [box] }, { format: 'Paperback', digital: false }));
    expect((await app.download({ itemId: 'b1' })).code).toBe(403);
  });
});

describe('#115 one file per digital edition', () => {
  const variants = [{ id: 'pdf', name: 'PDF', digital: true, digitalFileName: '1-a.pdf' }, { id: 'epub', name: 'EPUB', digital: true, digitalFileName: '2-a.epub' }];
  test('the edition bought decides the file', async () => {
    const app = harness(world({ items: [line({ variantId: 'epub', format: 'E-book (EPUB)' })] }, { variants }));
    await app.download({ itemId: 'b1', variantId: 'epub' });
    expect(app.signed[0].name).toBe('digital-assets/2-a.epub');
  });
  test('an edition without its own file falls back to the book file', () => {
    expect(dd.pickFileName(book({ variants: [{ id: 'x', digital: true }] }), 'x')).toBe('1730000000000-night.pdf');
  });
  test('an order with both editions can fetch each file', async () => {
    const items = [line({ variantId: 'pdf' }), line({ variantId: 'epub', format: 'E-book (EPUB)' })];
    const app = harness(world({ items }, { variants }));
    await app.download({ itemId: 'b1', variantId: 'pdf' });
    await app.download({ itemId: 'b1', variantId: 'epub' });
    expect(app.signed.map((s) => s.name)).toEqual(['digital-assets/1-a.pdf', 'digital-assets/2-a.epub']);
  });
});

describe('#116 cancelled and disputed orders', () => {
  test.each([['cancelled', { status: 'cancelled' }], ['disputed', { disputeStatus: 'needs_response' }]])('%s order is refused', async (_n, extra) => {
    const app = harness(world(extra));
    const res = await app.download({ itemId: 'b1' });
    expect(res.code).toBe(403);
    expect(app.signed).toHaveLength(0);
  });
  test('a won dispute downloads again', async () => {
    expect((await harness(world({ disputeStatus: 'won' })).download({ itemId: 'b1' })).location).toBeTruthy();
  });
});

describe('#117 file name and content type', () => {
  test('the signed link is an attachment with the book title and a real content type', async () => {
    const app = harness(world({}, { digitalFileName: '1730000000000-night.epub' }));
    await app.download({ itemId: 'b1' });
    expect(app.signed[0].responseDisposition).toContain('attachment; filename="Night Poems.epub"');
    expect(app.signed[0].responseDisposition).not.toMatch(/1730000000000/);
    expect(app.signed[0].responseType).toBe('application/epub+zip');
  });
  test('helpers', () => {
    expect(dd.downloadFilename('A/B: "C"', '17300000000-x.pdf')).toBe('A B C.pdf');
    expect(dd.contentTypeFor('x.pdf')).toBe('application/pdf');
    expect(dd.contentTypeFor('x.bin')).toBe('application/octet-stream');
    expect(dd.contentDisposition('Café.pdf')).toContain("filename*=UTF-8''Caf%C3%A9.pdf");
  });
});
