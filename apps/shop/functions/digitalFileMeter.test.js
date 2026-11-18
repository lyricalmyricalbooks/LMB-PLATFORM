// Digital D3: every bought file handed out is metered for the shop's running cost (usageLog.js kind "file"): a download
// counts its whole size each time, a play only on the order file's first play of the day.
import { describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const crypto = require('crypto');
const digitalDelivery = require('./digitalDelivery');
const { digitalDownloadEndpoint } = require('./digitalDownloadEndpoint');

function setup({ files, metaSize = 0 }) {
  const docs = {
    orders: { o1: { orderId: 'AB-1', paymentStatus: 'paid', downloadToken: 'T'.repeat(8), items: [{ id: 'b1', title: 'Tide', digital: true, format: 'Audiobook' }] } },
    books: { b1: { title: 'Tide', status: 'published', digital: true, digitalFiles: files } },
    settings: { website: {} },
  };
  const refOf = (name, id) => ({
    async get() { const v = docs[name]?.[id]; return { exists: v !== undefined, data: () => (v === undefined ? undefined : structuredClone(v)) }; },
    async set(v) { docs[name] ||= {}; docs[name][id] = v; },
    async update(c) { Object.assign(docs[name][id], c); },
    collection: (sub) => ({ doc: (d) => refOf(`${name}/${id}/${sub}`, d) }),
  });
  const db = {
    collection: (name) => ({ doc: (id) => refOf(name, id) }),
    async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, v) => r.set(v), update: (r, v) => r.update(v) }); },
  };
  const admin = { storage: () => ({ bucket: () => ({ file: (name) => ({
    exists: async () => [true], getMetadata: async () => [{ size: metaSize }],
    getSignedUrl: async () => [`https://signed/${name}`],
  }) }) }) };
  const metered = [];
  const { downloadDigitalAsset } = digitalDownloadEndpoint({
    onRequest: (fn) => fn, admin, db, crypto, digitalDelivery,
    catalogDigital: (b) => b.digital === true, isPhysicalItem: (l) => l.digital !== true, preorderActive: () => false,
    fileUsage: (bytes) => metered.push(bytes),
  });
  const ask = async (query) => {
    const res = { code: 200, status(c) { this.code = c; return this; }, send() { return this; }, json(b) { this.body = b; return this; }, set() { return this; }, redirect(u) { this.location = u; return this; } };
    await downloadDigitalAsset({ query: { orderId: 'o1', itemId: 'b1', token: 'T'.repeat(8), ...query }, headers: {}, method: 'GET' }, res);
    return res;
  };
  return { ask, metered };
}

describe('Digital D3: download traffic on the shop meter', () => {
  test('each download counts the file size it hands out', async () => {
    const { ask, metered } = setup({ files: [{ file: '1-tide.mp3', name: 'Tide', size: 5_000_000 }] });
    expect((await ask({})).location).toBeTruthy();
    await ask({});
    expect(metered).toEqual([5_000_000, 5_000_000]);
  });
  test('a file saved without its size is measured from storage', async () => {
    const { ask, metered } = setup({ files: [{ file: '1-tide.pdf' }], metaSize: 1234 });
    await ask({});
    expect(metered).toEqual([1234]);
  });
  test('only the first play of the day counts, so fresh links for one listen are free', async () => {
    const { ask, metered } = setup({ files: [{ file: '1-tide.m4b', name: 'Tide', size: 90_000_000 }] });
    expect((await ask({ play: '1' })).body.kind).toBe('audio');
    await ask({ play: '1' });
    await ask({ play: '1' });
    expect(metered).toEqual([90_000_000]);
  });
  test('a refused play or download meters nothing', async () => {
    const { ask, metered } = setup({ files: [{ file: '1-notes.pdf', size: 10 }] });
    expect((await ask({ play: '1' })).code).toBe(400);
    expect((await ask({ token: 'X'.repeat(8) })).code).toBe(403);
    expect(metered).toEqual([]);
  });
});
