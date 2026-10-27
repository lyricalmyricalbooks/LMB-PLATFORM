// The Functions' own document copy (backupJson.js): every collection, sub-collections, special values round-trip.
import { describe, expect, it } from "vitest";
import zlib from "node:zlib";
const { encodeValue, decodeValue, runJsonBackup, exportRefusedForPermission } = require("./backupJson");

class Timestamp { constructor(s, n) { this.seconds = s; this.nanoseconds = n; } toMillis() { return this.seconds * 1000; } }
class GeoPoint { constructor(lat, lng) { this.latitude = lat; this.longitude = lng; } }
const ref = path => ({ path, collection() {} });
const types = { Timestamp, GeoPoint, ref };

// A tiny Firestore + bucket fake: collections of { id: data }, ordered queries with limit/startAfter.
function fakeDb(data, { failOn = "" } = {}) {
  const query = (docs, name) => {
    const q = { _docs: docs, _limit: Infinity, _after: null,
      orderBy() { return q; }, limit(n) { q._limit = n; return q; }, startAfter(d) { q._after = d; return q; },
      async get() {
        if (name === failOn) throw new Error("boom");
        let rows = [...q._docs].sort((a, b) => (a.ref.path < b.ref.path ? -1 : 1));
        if (q._after) rows = rows.filter(r => r.ref.path > q._after.ref.path);
        return { docs: rows.slice(0, q._limit) };
      } };
    return q;
  };
  const docsOf = (prefix, obj) => Object.entries(obj).map(([id, d]) => ({ ref: { path: `${prefix}/${id}` }, data: () => d }));
  return {
    async listCollections() { return Object.keys(data).filter(k => !k.includes("/")).map(id => ({ id })); },
    collection: id => query(docsOf(id, data[id]), id),
    collectionGroup: name => query(Object.keys(data).filter(k => k.endsWith(`/${name}`)).flatMap(k => docsOf(k, data[k])), `group:${name}`),
  };
}
function fakeBucket() {
  const files = {};
  return { files, file: name => ({ async save(body) { files[name] = body; } }) };
}
const lines = buf => zlib.gunzipSync(buf).toString("utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));

describe("encodeValue / decodeValue", () => {
  it("round-trips Firestore special values", () => {
    const value = { at: new Timestamp(10, 5), where: new GeoPoint(1, 2), book: ref("books/a"), raw: Buffer.from("hi"),
      n: [1, "x", null, { deep: true }], weird: { __fs: "not special" }, inf: Infinity };
    const back = decodeValue(JSON.parse(JSON.stringify(encodeValue(value))), types);
    expect(back.at).toBeInstanceOf(Timestamp);
    expect(back.at).toMatchObject({ seconds: 10, nanoseconds: 5 });
    expect(back.where).toMatchObject({ latitude: 1, longitude: 2 });
    expect(back.book.path).toBe("books/a");
    expect(Buffer.from(back.raw).toString()).toBe("hi");
    expect(back.n).toEqual([1, "x", null, { deep: true }]);
    expect(back.weird).toEqual({ __fs: "not special" });
    expect(back.inf).toBe(Infinity);
  });
});

describe("runJsonBackup", () => {
  const data = {
    books: { a: { title: "A" }, b: { title: "B" }, c: { title: "C" } },
    orders: { o1: { total: 5 } },
    "rate-limits": { x: { n: 1 } },
    "books/a/private": { admin: { shelfLocation: "S1" } },
  };
  it("copies every collection page by page, sub-collections too, and writes the manifest last", async () => {
    const bucket = fakeBucket();
    const m = await runJsonBackup({ db: fakeDb(data), bucket, folder: "backups/d/json", idField: "__id", pageSize: 2, at: "t" });
    expect(m.complete).toBe(true);
    expect(m.documents).toBe(5);
    expect(lines(bucket.files["backups/d/json/books.ndjson.gz"]).map(l => l.path)).toEqual(["books/a", "books/b", "books/c"]);
    expect(lines(bucket.files["backups/d/json/_group_private.ndjson.gz"])).toEqual([{ path: "books/a/private/admin", data: { shelfLocation: "S1" } }]);
    expect(bucket.files["backups/d/json/rate-limits.ndjson.gz"]).toBeUndefined();
    expect(Object.keys(bucket.files).pop()).toBe("backups/d/json/manifest.json");
    // One downloadable file with every document, named in the manifest.
    const all = JSON.parse(bucket.files["backups/d/json/backup.json"]);
    expect(all).toMatchObject({ format: "lyricalmyrical-firestore-json/1", createdAt: "t", complete: true, documentCount: 5 });
    expect(all.documents.map(d => d.path)).toEqual(["books/a", "books/b", "books/c", "orders/o1", "books/a/private/admin"]);
    expect(m.download).toBe("backups/d/json/backup.json");
  });
  it("an empty database still gives a valid download file", async () => {
    const bucket = fakeBucket();
    await runJsonBackup({ db: fakeDb({}), bucket, folder: "f", idField: "__id" });
    expect(JSON.parse(bucket.files["f/backup.json"]).documents).toEqual([]);
  });
  it("one unreadable collection is reported but the others are still copied", async () => {
    const bucket = fakeBucket();
    const m = await runJsonBackup({ db: fakeDb(data, { failOn: "orders" }), bucket, folder: "f", idField: "__id" });
    expect(m.complete).toBe(false);
    expect(m.collections.find(c => c.id === "orders")).toMatchObject({ complete: false, error: "boom" });
    expect(bucket.files["f/books.ndjson.gz"]).toBeDefined();
  });
  it("stops at the deadline and says the copy is incomplete", async () => {
    let t = 0;
    const m = await runJsonBackup({ db: fakeDb(data), bucket: fakeBucket(), folder: "f", idField: "__id", deadline: 2, now: () => t++ });
    expect(m.complete).toBe(false);
    expect(m.collections.some(c => c.error === "Ran out of time")).toBe(true);
  });
});

describe("exportRefusedForPermission", () => {
  it("recognises the missing-role refusal", () => {
    expect(exportRefusedForPermission({ code: 7, message: "7 PERMISSION_DENIED: The caller does not have permission" })).toBe(true);
    expect(exportRefusedForPermission({ code: 14, message: "unavailable" })).toBe(false);
  });
});
