// PR 10: background jobs stay inside their time limits, finish what they could not reach, and bound their reads.
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInBatches, backupFoldersToPrune } from "./sweepLimits.js";
import { digestSince, digestNeedsOperations, DIGEST_ORDER_LIMIT, DIGEST_WINDOW_DAYS } from "./orderDigest.js";
import { pruneOldCarts, CART_KEEP_DAYS } from "./cartCleanup.js";

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js"), "utf8");
const block = (start, end) => {
  const i = source.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const j = end ? source.indexOf(end, i + start.length) : source.length;
  return source.slice(i, j);
};
// The scheduled jobs live in scheduledJobs.js (index.js keeps their export lines).
const jobsSource = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "scheduledJobs.js"), "utf8");
const jobBlock = (start, end) => {
  const i = jobsSource.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  const j = end ? jobsSource.indexOf(end, i + start.length) : jobsSource.length;
  expect(j).toBeGreaterThan(i);
  return jobsSource.slice(i, j);
};

describe("runInBatches", () => {
  it("runs a few at a time, never more than the batch size at once", async () => {
    let active = 0, peak = 0;
    const res = await runInBatches([1, 2, 3, 4, 5, 6, 7], 3, async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); active--; });
    expect(peak).toBe(3);
    expect(res).toMatchObject({ processed: 7, failed: 0, skipped: [] });
  });
  it("stops starting new batches after the deadline and hands back what it skipped", async () => {
    let clock = 0;
    const done = [];
    const res = await runInBatches([1, 2, 3, 4, 5, 6], 2, async n => { done.push(n); clock += 100; }, { deadline: 150, now: () => clock });
    expect(done).toEqual([1, 2]);
    expect(res.skipped).toEqual([3, 4, 5, 6]);
  });
  it("one failing item does not stop the others", async () => {
    const res = await runInBatches([1, 2, 3], 3, async n => { if (n === 2) throw new Error("x"); });
    expect(res).toMatchObject({ processed: 2, failed: 1 });
  });
});

describe("#19 back-in-stock emails", () => {
  const trigger = block("exports.onBookRestocked = onDocumentUpdated(", "exports.backInStockSweep");
  it("the trigger has a longer timeout than the 60 s default and sends in batches within a time budget", () => {
    expect(trigger).toMatch(/timeoutSeconds:\s*300/);
    expect(trigger).toContain("sendRestockAlerts");
    expect(source).toMatch(/RESTOCK_BUDGET_MS\s*=\s*240\s*\*\s*1000/);
    expect(source).toContain("runInBatches(leaders, RESTOCK_BATCH, sendOne, { deadline })");
  });
  it("alerts the run cannot reach stay pending and a scheduled sweep finishes them", () => {
    expect(trigger).toContain("restockPending: true");
    const sweep = jobBlock("const backInStockSweep = onSchedule(");
    expect(sweep).toContain('schedule: "every 15 minutes"');
    expect(sweep).toMatch(/timeoutSeconds:\s*300/);
    expect(sweep).toContain('where("restockPending", "==", true)');
    // Only sends while the book is still published and in stock.
    expect(sweep).toContain('book.status !== "published"');
    expect(sweep).toContain("available.has(");
  });
});

describe("#20 backups", () => {
  it("keeps 30 days: only dated folders older than that, never the newest, never hand-made folders", () => {
    const today = new Date("2026-10-10T12:00:00Z");
    const prefixes = ["backups/2026-10-09/", "backups/2026-09-20/", "backups/2026-09-09/", "backups/2026-08-01/", "backups/keep-me/", "backups/2026-13-45/"];
    expect(backupFoldersToPrune(prefixes, today, 30)).toEqual(["backups/2026-09-09/", "backups/2026-08-01/"]);
    // Everything is old: the newest one is still kept.
    expect(backupFoldersToPrune(["backups/2020-01-01/", "backups/2020-01-02/"], today, 30)).toEqual(["backups/2020-01-01/"]);
    expect(backupFoldersToPrune([], today, 30)).toEqual([]);
  });
  it("the backup prunes only after a good run and records a prune failure without failing the backup", () => {
    const job = block("async function runFirestoreBackup(", "exports.nightlyFirestoreBackup");
    expect(job).toContain("backupFoldersToPrune(");
    expect(job).toContain("deleteFiles({ prefix, force: true })");
    expect(job).toContain("pruneError");
    expect(job.indexOf("backupStatusRecord({ ok: outcome.ok")).toBeLessThan(job.indexOf("backupFoldersToPrune("));
    expect(job.indexOf("if (outcome.ok) {")).toBeLessThan(job.indexOf("backupFoldersToPrune("));
  });
  it("a refused export still runs the document copy, and the nightly job and Back up now share one runner", () => {
    const job = block("async function runFirestoreBackup(", "exports.nightlyFirestoreBackup");
    expect(job.indexOf("exportDocuments(")).toBeLessThan(job.indexOf("runJsonBackup("));
    expect(job).toContain("runningSince");
    expect(block("exports.nightlyFirestoreBackup = onSchedule(", "async function handleBackupNow")).toContain('runFirestoreBackup({ trigger: "nightly"');
    expect(block("async function handleBackupNow(")).toContain("requireAdmin(req, res)");
    expect(source).toContain("  backupNow: handleBackupNow,");
  });
});

describe("#68 unpaidPaymentSweep", () => {
  const sweep = block("exports.unpaidPaymentSweep = onSchedule(", "exports.nightlyFirestoreBackup");
  it("looks up payments a few at a time within a time budget", () => {
    expect(sweep).toContain("runInBatches(candidates, SWEEP_LOOKUP_BATCH");
    expect(sweep).toContain("sweepStartedAt + SWEEP_LOOKUP_MS");
    expect(sweep).toContain("sweepStartedAt + SWEEP_REVERSAL_MS");
  });
  it("sends the owner alert before the slow reversal checks, email queue and review requests", () => {
    const alertAt = sweep.indexOf("Stripe webhook missed");
    expect(alertAt).toBeGreaterThan(-1);
    expect(alertAt).toBeLessThan(sweep.indexOf("checkStripeReversal("));
    expect(alertAt).toBeLessThan(sweep.indexOf("runEmailOutbox()"));
    expect(alertAt).toBeLessThan(sweep.indexOf("runReviewRequests("));
  });
});

describe("#71 dailyOrderDigest", () => {
  it("reads a bounded window of paid orders and the private record only for open orders", () => {
    const job = jobBlock("const dailyOrderDigest = onSchedule(", "const weeklySummary =");
    expect(job).toContain('.where("createdAt", ">=", digestSince())');
    expect(job).toContain(".limit(DIGEST_ORDER_LIMIT)");
    expect(job).not.toContain('db.collection("order-operations").get()');
    expect(job).toContain("digestNeedsOperations");
    expect(DIGEST_ORDER_LIMIT).toBeGreaterThan(0);
  });
  it("the window is six months and finished orders need no private record", () => {
    expect(digestSince(Date.parse("2026-10-10T00:00:00Z"))).toBe(new Date(Date.parse("2026-10-10T00:00:00Z") - DIGEST_WINDOW_DAYS * 86400000).toISOString());
    expect(digestNeedsOperations({ paymentStatus: "paid", fulfillmentStatus: "delivered" })).toBe(false);
    expect(digestNeedsOperations({ paymentStatus: "paid", fulfillmentStatus: "cancelled" })).toBe(false);
    expect(digestNeedsOperations({ paymentStatus: "paid", isTest: true })).toBe(false);
    expect(digestNeedsOperations({ paymentStatus: "paid", fulfillmentStatus: "paid" })).toBe(true);
    expect(digestNeedsOperations({ paymentStatus: "paid", fulfillmentStatus: "shipped" })).toBe(true);
  });
});

describe("#82 abandonedCartSweep", () => {
  const sweep = jobBlock("const abandonedCartSweep = onSchedule(", "const storageImageSweep =");
  it("reads only the 7-day window, newest first, capped, with a longer timeout", () => {
    expect(sweep).toMatch(/timeoutSeconds:\s*300/);
    expect(sweep).toContain('.where("updatedAt", ">=", oldestUpdated)');
    expect(sweep).toContain('.orderBy("updatedAt", "desc")');
    expect(sweep).toContain(".limit(ABANDONED_CART_BATCH)");
    expect(sweep).toContain("runInBatches(pending, 10");
  });
  it("deletes carts older than a month so the collection cannot grow without limit", async () => {
    const now = Date.parse("2026-10-10T00:00:00Z");
    const deleted = [];
    const queries = [];
    const db = {
      collection: () => ({
        where(field, op, value) { const q = { field, op, value, filters: [{ field, op, value }] };
          const chain = { where(f, o, v) { q.filters.push({ field: f, op: o, value: v }); return chain; }, orderBy() { return chain; }, limit() { return chain; },
            async get() { queries.push(q.filters); const docs = q.filters[0].value === false ? [{ ref: "r1" }, { ref: "r2" }] : [{ ref: "r3" }]; return { empty: !docs.length, size: docs.length, docs }; } };
          return chain; },
      }),
      batch: () => ({ delete: ref => deleted.push(ref), commit: vi.fn(async () => {}) }),
    };
    expect(await pruneOldCarts(db, now)).toBe(3);
    expect(deleted).toEqual(["r1", "r2", "r3"]);
    const cutoff = new Date(now - CART_KEEP_DAYS * 86400000).toISOString();
    expect(queries.every(f => f.some(x => x.field === "updatedAt" && x.op === "<" && x.value === cutoff))).toBe(true);
    expect(jobsSource).toContain("pruneOldCarts(db)");
  });
});
