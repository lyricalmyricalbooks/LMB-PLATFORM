// Imported photos into the shop's own Storage (photoImport.js, plan 3.1b): proven with a fake bucket, database and
// fetch. Nothing here reaches a real shop or the internet.
import { describe, expect, it } from "vitest";
const { publicHttps, needsImport, runPhotoImport, MAX_BYTES } = require("./photoImport");

const BUCKET = "lmb-test-shop.firebasestorage.app";
const OWN = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/products%2F1-01.png?alt=media&token=t1`;
const OLD_A = "https://cdn.oldshop.example/files/cover-a.jpg";
const OLD_B = "https://cdn.oldshop.example/files/back-b.png";

function fakeBucket() {
  const store = new Map();
  return {
    name: BUCKET,
    store,
    file(name) {
      return {
        name,
        async exists() { return [store.has(name)]; },
        async getMetadata() { return [store.get(name)?.metadata || {}]; },
        // Shaped like Cloud Storage's getMetadata(): custom fields under `metadata`.
        async save(body, opts) { store.set(name, { body, contentType: opts.contentType, metadata: { ...opts.metadata } }); },
      };
    },
  };
}

function fakeDb(books) {
  const docs = new Map(Object.entries(books).map(([id, d]) => [`books/${id}`, structuredClone(d)]));
  const audit = [];
  const ref = path => ({
    path,
    async get() { return { exists: docs.has(path), data: () => docs.get(path) }; },
    async set(data, { merge } = {}) { docs.set(path, merge ? { ...(docs.get(path) || {}), ...data } : data); },
  });
  const collection = name => ({
    doc: id => ref(`${name}/${id}`),
    where() { return collection(name); },
    async add(entry) { if (name === "audit-log") audit.push(entry); return { id: String(audit.length) }; },
    async get() {
      return { docs: [...docs.entries()].filter(([p]) => p.startsWith(`${name}/`)).map(([p, d]) => ({ id: p.split("/")[1], data: () => d })) };
    },
  });
  return {
    docs,
    audit,
    collection,
    async runTransaction(fn) {
      return fn({ get: r => r.get(), update: (r, patch) => docs.set(r.path, { ...docs.get(r.path), ...patch }) });
    },
  };
}

function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const a = answers[url];
    if (!a) return { ok: false, status: 404, url, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
    const body = Buffer.from(a.body || "photo-bytes");
    return {
      ok: true, status: 200, url: a.finalUrl || url,
      headers: new Map([["content-type", a.type || "image/jpeg"], ["content-length", String(a.length ?? body.length)]]),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
  };
  return { fetch, calls };
}

const quiet = { warn() {} };
const book = id => fakeDbBooks => fakeDbBooks.docs.get(`books/${id}`);

describe("photoImport helpers", () => {
  it("fetches only https addresses on public host names", () => {
    expect(publicHttps(OLD_A)).toBe(true);
    expect(publicHttps("http://cdn.oldshop.example/a.jpg")).toBe(false);
    expect(publicHttps("https://169.254.169.254/latest")).toBe(false);
    expect(publicHttps("https://[::1]/a.jpg")).toBe(false);
    expect(publicHttps("https://localhost/a.jpg")).toBe(false);
    expect(publicHttps("https://metadata.google.internal/a")).toBe(false);
    expect(publicHttps("https://user:pw@cdn.oldshop.example/a.jpg")).toBe(false);
    expect(publicHttps("not a url")).toBe(false);
  });

  it("skips photos already in this bucket, videos and empty photos", () => {
    expect(needsImport({ url: OLD_A }, BUCKET)).toBe(true);
    expect(needsImport({ url: OWN }, BUCKET)).toBe(false);
    expect(needsImport({ url: OLD_A, videoUrl: "https://v.example/x.mp4" }, BUCKET)).toBe(false);
    expect(needsImport(null, BUCKET)).toBe(false);
  });
});

describe("runPhotoImport", () => {
  const setup = () => {
    const db = fakeDb({
      one: { title: "One", photos: [{ url: OLD_A, altText: "Cover" }, { url: OWN }, { url: OLD_B }], photoUrl: OLD_A },
      two: { title: "Two", photos: [{ url: OLD_A }] },
      own: { title: "Own", photos: [{ url: OWN }] },
    });
    const bucket = fakeBucket();
    const { fetch, calls } = fakeFetch({ [OLD_A]: { type: "image/jpeg" }, [OLD_B]: { type: "image/png" } });
    return { db, bucket, fetch, calls };
  };

  it("copies old-address photos into the bucket and swaps each book to the copy, keeping the old address", async () => {
    const { db, bucket, fetch, calls } = setup();
    const result = await runPhotoImport({ db, bucket, fetch, deadline: Date.now() + 60_000, log: quiet });
    expect(result).toMatchObject({ found: 3, done: 3, books: 2, failed: 0, pending: 0 });
    // One download per address, even when two books share it.
    expect(calls.sort()).toEqual([OLD_B, OLD_A].sort());
    const names = [...bucket.store.keys()];
    expect(names).toHaveLength(2);
    for (const name of names) expect(name).toMatch(/^products\/imported\/[0-9a-f]{32}\.(jpg|png)$/);
    const one = book("one")(db);
    expect(one.photos[0].url).toContain(`/v0/b/${BUCKET}/o/products%2Fimported%2F`);
    expect(one.photos[0]).toMatchObject({ altText: "Cover", importedFrom: OLD_A });
    expect(one.photos[1]).toEqual({ url: OWN });
    expect(one.photos[2].importedFrom).toBe(OLD_B);
    expect(one.photoUrl).toBe(one.photos[0].url);
    expect(book("two")(db).photos[0].url).toBe(one.photos[0].url);
    expect(book("own")(db).photos).toEqual([{ url: OWN }]);
    const saved = bucket.store.get(names.find(n => n.endsWith(".jpg")));
    expect(saved.metadata).toMatchObject({ cacheControl: "public, max-age=31536000, immutable", metadata: { importedFrom: OLD_A } });
    expect(saved.contentType).toBe("image/jpeg");
  });

  it("writes one audit line per run that copied something, and none when nothing was left", async () => {
    const { db, bucket, fetch } = setup();
    await runPhotoImport({ db, bucket, fetch, deadline: Date.now() + 60_000, log: quiet });
    expect(db.audit).toHaveLength(1);
    expect(db.audit[0]).toMatchObject({ type: "catalog", photos: 3, books: 2 });
    expect(db.audit[0].message).toBe("Copied 3 imported photos on 2 books into the shop's own storage");
    await runPhotoImport({ db, bucket, fetch, deadline: Date.now() + 60_000, log: quiet });
    expect(db.audit).toHaveLength(1);
  });

  it("is safe to re-run: a second pass downloads nothing, and a copy saved before a crash is reused", async () => {
    const { db, bucket, fetch, calls } = setup();
    await runPhotoImport({ db, bucket, fetch, deadline: Date.now() + 60_000, log: quiet });
    const after = structuredClone([...db.docs.entries()]);
    calls.length = 0;
    const again = await runPhotoImport({ db, bucket, fetch, deadline: Date.now() + 60_000, log: quiet });
    expect(again.found).toBe(0);
    expect(calls).toEqual([]);
    expect(structuredClone([...db.docs.entries()]).filter(([p]) => p.startsWith("books/"))).toEqual(after.filter(([p]) => p.startsWith("books/")));

    // The file was saved but the book never switched (the run stopped in between): the next run reuses the file.
    const db2 = fakeDb({ three: { photos: [{ url: OLD_A }] } });
    calls.length = 0;
    await runPhotoImport({ db: db2, bucket, fetch, deadline: Date.now() + 60_000, log: quiet });
    expect(calls).toEqual([]);
    expect(db2.docs.get("books/three").photos[0].url).toBe(book("one")(db).photos[0].url);
    expect(bucket.store.size).toBe(2);
  });

  it("leaves a photo alone when the old address is gone, isn't a picture, is too big or redirects inward, and retries a week later", async () => {
    const db = fakeDb({
      gone: { photos: [{ url: "https://cdn.oldshop.example/gone.jpg" }] },
      page: { photos: [{ url: "https://cdn.oldshop.example/page" }] },
      huge: { photos: [{ url: "https://cdn.oldshop.example/huge.jpg" }] },
      inward: { photos: [{ url: "https://cdn.oldshop.example/inward.jpg" }] },
    });
    const bucket = fakeBucket();
    const { fetch, calls } = fakeFetch({
      "https://cdn.oldshop.example/page": { type: "text/html" },
      "https://cdn.oldshop.example/huge.jpg": { length: MAX_BYTES + 1 },
      "https://cdn.oldshop.example/inward.jpg": { finalUrl: "https://10.0.0.1/x.jpg" },
    });
    const now = Date.now();
    const result = await runPhotoImport({ db, bucket, fetch, deadline: now + 60_000, now, log: quiet });
    expect(result).toMatchObject({ found: 4, done: 0, failed: 4 });
    expect(bucket.store.size).toBe(0);
    expect(db.audit).toEqual([]);
    for (const id of ["gone", "page", "huge", "inward"]) expect(db.docs.get(`books/${id}`).photos[0].importedFrom).toBeUndefined();
    const status = db.docs.get("systemStatus/photoImport");
    expect(Object.values(status.failed).map(f => f.reason).sort()).toEqual([
      "larger than 20 MB", "moved to an address that isn't allowed", "not a photo (text/html)", "the old shop answered 404",
    ]);
    calls.length = 0;
    await runPhotoImport({ db, bucket, fetch, deadline: now + 60_000, now: now + 3600_000, log: quiet });
    expect(calls).toEqual([]);
    await runPhotoImport({ db, bucket, fetch, deadline: Date.now() + 60_000, now: now + 8 * 24 * 3600_000, log: quiet });
    expect(calls).toHaveLength(4);
  });

  it("stops at the deadline and leaves the rest for the next run", async () => {
    const { db, bucket, fetch, calls } = setup();
    const result = await runPhotoImport({ db, bucket, fetch, deadline: Date.now() - 1, log: quiet });
    expect(result).toMatchObject({ found: 3, done: 0, pending: 3 });
    expect(calls).toEqual([]);
    expect(db.docs.get("systemStatus/photoImport").pending).toBe(3);
  });

  it("refuses to run without an injected fetch", async () => {
    const { db, bucket } = setup();
    await expect(runPhotoImport({ db, bucket, deadline: Date.now() + 1000 })).rejects.toThrow(/needs a fetch/);
  });
});
