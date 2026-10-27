import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { cleanReport, signatureOf, recordClientError, NEW_PER_DAY } = require("./clientErrors.js");

function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const ref = (col, id) => ({ path: `${col}/${id}` });
  const db = {
    docs,
    collection: col => ({ doc: id => ref(col, id) }),
    runTransaction: async fn => fn({
      get: async r => ({ exists: docs.has(r.path), data: () => docs.get(r.path) }),
      set: (r, value, opts) => docs.set(r.path, opts?.merge ? { ...(docs.get(r.path) || {}), ...value } : value),
    }),
  };
  return db;
}

describe("cleanReport keeps nothing personal", () => {
  it("drops email addresses, long numbers, query strings and fragments", () => {
    const r = cleanReport({ kind: "page", message: "Can't read order 12345678 for ada@example.com",
      stack: "at x (https://shop.example/assets/a.js?v=1#k:1:2)", path: "/track?orderId=abc&key=secret#top", section: "Hero<script>", build: "abc 123" });
    expect(r).toEqual({ kind: "page", message: "Can't read order [number] for [email]", stack: "at x (https://shop.example/assets/a.js)",
      path: "/track", section: "Heroscript", build: "abc123" });
  });
  it("keeps Firefox/Safari stack frames and line breaks", () => {
    const r = cleanReport({ message: "x", stack: "render@https://shop.example/assets/index-a.js:12:345\nrun@https://shop.example/assets/b.js:1:2" });
    expect(r.stack).toBe("render@https://shop.example/assets/index-a.js:12:345\nrun@https://shop.example/assets/b.js:1:2");
    expect(cleanReport({ message: "x", stack: "for ada@example.com\nat y" }).stack).toBe("for [email]\nat y");
  });
  it("refuses an empty report and caps lengths", () => {
    expect(cleanReport(null)).toBeNull();
    expect(cleanReport({ message: "   " })).toBeNull();
    const r = cleanReport({ message: "x".repeat(1000), stack: "y".repeat(5000), kind: "made-up", path: "https://evil.example/" });
    expect(r.message).toHaveLength(300);
    expect(r.stack).toHaveLength(2000);
    expect(r.kind).toBe("script");
    expect(r.path).toBe("/");
  });
  it("groups the same error whatever its numbers", () => {
    const a = cleanReport({ kind: "section", message: "Index 3 out of range", section: "Hero" });
    const b = cleanReport({ kind: "section", message: "Index 7 out of range", section: "Hero" });
    const c = cleanReport({ kind: "section", message: "Index 7 out of range", section: "Footer" });
    expect(signatureOf(a)).toBe(signatureOf(b));
    expect(signatureOf(a)).not.toBe(signatureOf(c));
  });
});

describe("recordClientError", () => {
  const report = path => cleanReport({ kind: "page", message: "Boom", path });
  it("records a new error, then counts repeats and remembers a few pages", async () => {
    const db = fakeDb();
    expect(await recordClientError(db, report("/books/a"), 1e12)).toBe("recorded");
    expect(await recordClientError(db, report("/books/b"), 1e12 + 1000)).toBe("counted");
    expect(await recordClientError(db, report("/books/a"), 1e12 + 2000)).toBe("counted");
    const row = db.docs.get(`clientErrors/${signatureOf(report("/"))}`);
    expect(row.count).toBe(3);
    expect(row.paths).toEqual(["/books/b", "/books/a"]);
    expect(row.lastPath).toBe("/books/a");
    expect(row.expiresAt.getTime()).toBe(1e12 + 2000 + 30 * 864e5);
  });
  it("stops recording new errors past the day's budget but still counts known ones", async () => {
    const now = Date.UTC(2026, 9, 25, 18);
    const db = fakeDb({ "systemStatus/clientErrorBudget": { day: "2026-10-25", created: NEW_PER_DAY } });
    expect(await recordClientError(db, report("/"), now)).toBe("full");
    // A new Toronto day starts a new budget.
    expect(await recordClientError(db, report("/"), now + 864e5)).toBe("recorded");
    expect(await recordClientError(db, report("/"), now + 864e5)).toBe("counted");
  });
});
