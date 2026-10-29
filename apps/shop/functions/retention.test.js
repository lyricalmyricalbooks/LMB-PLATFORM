import { describe, expect, test } from "vitest";
import { createRequire } from "module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { pruneOldAuditLog, AUDIT_LOG_KEEP_DAYS, RETENTION_BATCH } = require("./retention.js");

const DAY = 864e5;
const NOW = Date.parse("2028-06-01T12:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

/** A pretend audit-log: documents with a createdAt, queried by "createdAt <" with a limit, deleted in a batch. */
function fakeDb(entries) {
  const docs = new Map(entries.map((e, i) => [`a${i}`, e]));
  return {
    docs,
    collection: (name) => {
      expect(name).toBe("audit-log");
      return {
        where: (field, op, value) => {
          expect([field, op]).toEqual(["createdAt", "<"]);
          return { orderBy: () => ({ limit: (n) => ({ get: async () => {
            const hits = [...docs].filter(([, d]) => d.createdAt < value).sort((a, b) => (a[1].createdAt < b[1].createdAt ? -1 : 1)).slice(0, n);
            return { empty: !hits.length, size: hits.length, docs: hits.map(([id]) => ({ id, ref: { id } })) };
          } }) }) };
        },
      };
    },
    batch: () => { const ids = []; return { delete: (ref) => ids.push(ref.id), commit: async () => ids.forEach((id) => docs.delete(id)) }; },
  };
}

describe("the admin history keep-time", () => {
  test("two years is kept, older is deleted oldest first, one batch at a time", async () => {
    const db = fakeDb([{ createdAt: iso(10) }, { createdAt: iso(AUDIT_LOG_KEEP_DAYS - 1) }, { createdAt: iso(AUDIT_LOG_KEEP_DAYS + 1) }, { createdAt: iso(900) }]);
    expect(await pruneOldAuditLog(db, NOW)).toBe(2);
    expect([...db.docs.values()].map((d) => d.createdAt).sort()).toEqual([iso(AUDIT_LOG_KEEP_DAYS - 1), iso(10)].sort());
    expect(await pruneOldAuditLog(db, NOW)).toBe(0);
  });
  test("a big backlog goes in batches", async () => {
    const db = fakeDb(Array.from({ length: RETENTION_BATCH + 20 }, () => ({ createdAt: iso(800) })));
    expect(await pruneOldAuditLog(db, NOW)).toBe(RETENTION_BATCH);
    expect(await pruneOldAuditLog(db, NOW)).toBe(20);
  });
  test("orders and customers are never named here, and the sweep calls it in its own try block", () => {
    const code = readFileSync(new URL("./retention.js", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/"orders"|"customers"|"newsletter"|"reviews"/);
    expect(readFileSync(new URL("./scheduledJobs.js", import.meta.url), "utf8")).toMatch(/pruneOldAuditLog\(db\)/);
  });
});
