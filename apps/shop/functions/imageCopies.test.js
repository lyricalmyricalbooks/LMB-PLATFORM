// Book photo copies + year-long caching (imageCopies.js): additive, idempotent, never heavier than before.
import { describe, expect, it } from "vitest";
const sharp = require("sharp");
const {
  widthsFor, storagePathOf, copyPath, needsCopies, qualityFor, runImageCopies, runCacheControl, wantsLongCache, IMMUTABLE,
} = require("./imageCopies");

const BUCKET = "lmb-test-shop.firebasestorage.app";
const urlFor = (path, token = "t1") => `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

function fakeBucket(files) {
  const store = new Map(Object.entries(files).map(([name, f]) => [name, { ...f }]));
  return {
    name: BUCKET,
    store,
    file(name) {
      return {
        name,
        async download() { const f = store.get(name); if (!f) throw new Error("No such object"); return [f.body]; },
        async save(body, opts) { store.set(name, { body, metadata: { contentType: opts.contentType, ...opts.metadata } }); },
      };
    },
    async getFiles({ maxResults, pageToken }) {
      const names = [...store.keys()].sort();
      const start = pageToken ? Number(pageToken) : 0;
      const page = names.slice(start, start + maxResults).map(name => ({
        name,
        metadata: store.get(name).metadata || {},
        async setMetadata(m) { store.get(name).metadata = { ...store.get(name).metadata, ...m }; },
      }));
      const next = start + maxResults < names.length ? { pageToken: String(start + maxResults) } : null;
      return [page, next];
    },
  };
}

function fakeDb(books) {
  const docs = new Map(Object.entries(books).map(([id, d]) => [`books/${id}`, structuredClone(d)]));
  const ref = path => ({
    path,
    async get() { return { exists: docs.has(path), data: () => docs.get(path) }; },
    async set(data, { merge } = {}) { docs.set(path, merge ? { ...(docs.get(path) || {}), ...data } : data); },
  });
  const collection = name => ({
    doc: id => ref(`${name}/${id}`),
    where() { return collection(name); },
    async get() {
      return { docs: [...docs.entries()].filter(([p]) => p.startsWith(`${name}/`)).map(([p, d]) => ({ id: p.split("/")[1], data: () => d })) };
    },
  });
  return {
    docs,
    collection,
    async runTransaction(fn) {
      return fn({ get: r => r.get(), update: (r, patch) => docs.set(r.path, { ...docs.get(r.path), ...patch }) });
    },
  };
}

const png = (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 30 } } })
  .png().toBuffer();
const noisyJpeg = async (width, height) => {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 40 }).toBuffer();
};

describe("imageCopies helpers", () => {
  it("uses the browser upload's ladder, stopping at the original width", () => {
    expect(widthsFor(1080)).toEqual([480, 640, 960, 1080]);
    expect(widthsFor(3200)).toEqual([480, 640, 960, 1600, 2400, 3200]);
    expect(widthsFor(300)).toEqual([300]);
    expect(qualityFor(960)).toBe(90);
    expect(qualityFor(1600)).toBe(95);
  });

  it("reads only this bucket's download URLs", () => {
    expect(storagePathOf(urlFor("products/1-01.png"), BUCKET)).toBe("products/1-01.png");
    expect(storagePathOf("https://firebasestorage.googleapis.com/v0/b/other/o/x.png?alt=media", BUCKET)).toBeNull();
    expect(storagePathOf("https://example.com/x.png", BUCKET)).toBeNull();
    expect(storagePathOf(`https://storage.googleapis.com/${BUCKET}/products/a.jpg`, BUCKET)).toBe("products/a.jpg");
  });

  it("names copies beside the original", () => {
    expect(copyPath("products/1791667400437-01.png", 480)).toBe("products/1791667400437-01-480w.webp");
    expect(copyPath("hero/abc_123", 960)).toBe("hero/abc_123-960w.webp");
  });

  it("skips photos that already have copies, videos and other hosts", () => {
    expect(needsCopies({ url: urlFor("products/a.jpg") }, BUCKET)).toBe(true);
    expect(needsCopies({ url: urlFor("products/a.jpg"), srcset: [{ url: "x", w: 480 }] }, BUCKET)).toBe(false);
    expect(needsCopies({ url: urlFor("products/a.jpg"), videoUrl: "v" }, BUCKET)).toBe(false);
    expect(needsCopies({ url: "https://example.com/a.jpg" }, BUCKET)).toBe(false);
    expect(needsCopies({ url: urlFor("products/a.gif") }, BUCKET)).toBe(false);
  });
});

describe("runImageCopies", () => {
  it("adds WebP copies to an imported photo without touching the original or its url", async () => {
    const original = await png(1080, 1350);
    const bucket = fakeBucket({ "products/100-01.png": { body: original, metadata: { contentType: "image/png" } } });
    const url = urlFor("products/100-01.png");
    const db = fakeDb({ b1: { title: "Cream Show", photos: [{ id: "p1", url, altText: "Cover" }, { id: "v", url: "https://x/y.jpg", videoUrl: "https://x/v.mp4" }] } });
    const out = await runImageCopies({ db, bucket, sharp, deadline: Date.now() + 60_000 });
    expect(out).toEqual({ found: 1, done: 1, pending: 0 });
    const photo = db.docs.get("books/b1").photos[0];
    expect(photo).toMatchObject({ id: "p1", url, altText: "Cover", width: 1080, height: 1350 });
    expect(photo.srcset.map(v => v.w)).toEqual([480, 640, 960, 1080]);
    expect(bucket.store.get("products/100-01.png").body).toBe(original);
    const copy = bucket.store.get("products/100-01-480w.webp");
    expect(copy.metadata).toMatchObject({ contentType: "image/webp", cacheControl: IMMUTABLE });
    expect(copy.metadata.metadata.firebaseStorageDownloadTokens).toBeTruthy();
    expect((await sharp(copy.body).metadata()).width).toBe(480);
    expect(db.docs.get("books/b1").photos[1]).toEqual({ id: "v", url: "https://x/y.jpg", videoUrl: "https://x/v.mp4" });

    // A second run finds nothing to do.
    const again = await runImageCopies({ db, bucket, sharp, deadline: Date.now() + 60_000 });
    expect(again.found).toBe(0);
  });

  it("serves the original instead of a copy that would be heavier", async () => {
    const original = await noisyJpeg(700, 900);
    const bucket = fakeBucket({ "products/200-01.jpg": { body: original, metadata: { contentType: "image/jpeg" } } });
    const url = urlFor("products/200-01.jpg");
    const db = fakeDb({ b: { photos: [{ url }] } });
    await runImageCopies({ db, bucket, sharp, deadline: Date.now() + 60_000 });
    const { srcset } = db.docs.get("books/b").photos[0];
    expect(srcset[srcset.length - 1].w).toBeLessThanOrEqual(700);
    for (const entry of srcset) {
      if (entry.url === url) continue;
      const name = decodeURIComponent(entry.url.split("/o/")[1].split("?")[0]);
      expect(bucket.store.get(name).body.length).toBeLessThan(original.length);
    }
  });

  it("remembers a picture it can't read and leaves the book alone", async () => {
    const bucket = fakeBucket({});
    const url = urlFor("products/missing.jpg");
    const db = fakeDb({ b: { photos: [{ url }] } });
    const out = await runImageCopies({ db, bucket, sharp, deadline: Date.now() + 60_000, log: { warn() {} } });
    expect(out.done).toBe(0);
    expect(db.docs.get("books/b").photos[0]).toEqual({ url });
    const status = db.docs.get("systemStatus/imageCopies");
    expect(Object.values(status.failed)[0].path).toBe("products/missing.jpg");
    const later = await runImageCopies({ db, bucket, sharp, deadline: Date.now() + 60_000, log: { warn() {} } });
    expect(later.found).toBe(0);
  });
});

describe("runCacheControl", () => {
  it("gives pictures and videos a year-long cache header, leaving backups and other files alone", async () => {
    const bucket = fakeBucket({
      "products/a.jpg": { body: Buffer.from("a"), metadata: { contentType: "image/jpeg" } },
      "products/videos/v.mp4": { body: Buffer.from("v"), metadata: { contentType: "video/mp4", cacheControl: IMMUTABLE } },
      "hero/h": { body: Buffer.from("h"), metadata: { contentType: "image/png", cacheControl: "private, max-age=0" } },
      "backups/2026-10-14/backup.json": { body: Buffer.from("{}"), metadata: { contentType: "image/png" } },
      "digital-assets/book.pdf": { body: Buffer.from("%PDF"), metadata: { contentType: "application/pdf" } },
    });
    const db = fakeDb({});
    const out = await runCacheControl({ db, bucket, deadline: Date.now() + 10_000 });
    expect(out).toEqual({ updated: 2, finished: true });
    expect(bucket.store.get("products/a.jpg").metadata.cacheControl).toBe(IMMUTABLE);
    expect(bucket.store.get("hero/h").metadata.cacheControl).toBe(IMMUTABLE);
    expect(bucket.store.get("backups/2026-10-14/backup.json").metadata.cacheControl).toBeUndefined();
    expect(bucket.store.get("digital-assets/book.pdf").metadata.cacheControl).toBeUndefined();
    expect((await runCacheControl({ db, bucket, deadline: Date.now() + 10_000 })).skipped).toBe(true);
  });

  it("only wants image and video objects without the header", () => {
    expect(wantsLongCache({ name: "assets/x.png", metadata: { contentType: "image/png" } })).toBe(true);
    expect(wantsLongCache({ name: "assets/x.png", metadata: { contentType: "image/png", cacheControl: IMMUTABLE } })).toBe(false);
    expect(wantsLongCache({ name: "assets/", metadata: { contentType: "image/png" } })).toBe(false);
  });
});
