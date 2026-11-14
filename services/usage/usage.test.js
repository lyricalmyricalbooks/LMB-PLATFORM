import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeRegistry } from "../../setup/fakes.js";
import { MEMORY_GB, metersFrom, monthBounds, reconcile, runUsageMeters, shareDatabase } from "./meters.js";
import { DATABASE_METRICS, USAGE_METRICS, databaseUsage, monitoringUsage, storageUsage, usageSources } from "./sources.js";

const SHARED = "lmb-test-shop";
const shared = (shopId, extra = {}) => ({ shopId, projectId: SHARED, shared: true, status: "live", ...extra });

function memoryMeters() {
  const docs = new Map();
  return {
    docs,
    get: async (shopId, month) => structuredClone(docs.get(`${shopId}_${month}`) ?? null),
    set: async (shopId, month, data) => { docs.set(`${shopId}_${month}`, structuredClone(data)); },
  };
}

test("a month's bill is split by use, and the shares add up to it exactly", () => {
  const split = reconcile({ meters: { a: { invocations: 100 }, b: { invocations: 300 }, c: {} }, invoiceCents: 1001 });
  assert.deepEqual(split, { a: 250, b: 751, c: 0 });
  // Storage, traffic and emails all weigh by Google's list price.
  const mixed = reconcile({ meters: { a: { storageGb: 1 }, b: { emails: 60 } }, invoiceCents: 100 });
  assert.equal(mixed.a + mixed.b, 100);
  assert.ok(Math.abs(mixed.a - mixed.b) <= 1, "a GB-month of files costs about what 60 emails do");
  // Nothing measured: split evenly.
  assert.deepEqual(reconcile({ meters: { a: {}, b: {}, c: {} }, invoiceCents: 10 }), { a: 4, b: 3, c: 3 });
  assert.deepEqual(reconcile({ meters: {}, invoiceCents: 10 }), {});
});

test("a shop's numbers come from its server time, traffic, files and emails", () => {
  assert.deepEqual(metersFrom({ work: { count: 40, ms: 8000 }, bytes: 2.5e9, storageBytes: 1e8, emails: 3 }), {
    invocations: 40, computeGbSeconds: 8 * MEMORY_GB, egressGb: 2.5, storageGb: 0.1, emails: 3, reads: 0, writes: 0, deletes: 0, firestoreGb: 0,
  });
  assert.equal("storageGb" in metersFrom({}), false, "storage left as it was when not measured");
  assert.deepEqual(monthBounds("2026-12"), { start: "2026-12-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z" });
  assert.throws(() => monthBounds("2026-13"), /must look like/);
});

test("the daily job meters this month and last, splits last month's bill once it is in, and never changes a split month", async () => {
  const registry = fakeRegistry();
  for (const row of [shared("press-a"), shared("press-b"), { shopId: "other", projectId: "other", status: "live" }]) await registry.createShop(row.shopId, row);
  const meters = memoryMeters();
  const asked = [];
  const sources = { read: async (month, ids, { measureStorage }) => { asked.push([month, ids, measureStorage]); return Object.fromEntries(ids.map((id) => [id, metersFrom({ work: { count: id === "press-a" ? 300 : 100, ms: 0 } })])); } };
  let bill = null;
  const costs = { configured: true, read: async (month) => (bill && month === "2026-10" ? { projects: [{ projectId: SHARED, currency: "CAD", netCents: bill }] } : { projects: [] }) };

  // The 2nd: last month's bill hasn't settled.
  const early = await runUsageMeters({ registry, meters, sources, costs, sharedProject: SHARED, now: () => new Date("2026-11-02T07:00:00Z") });
  assert.deepEqual(asked, [["2026-11", ["press-a", "press-b"], true], ["2026-10", ["press-a", "press-b"], false]]);
  assert.match(early.waiting, /settles by day 3/);
  assert.equal((await meters.get("press-a", "2026-11")).invocations, 300);
  assert.equal((await meters.get("other", "2026-11")), null, "a shop with its own project isn't metered here");

  // The 3rd, the export not in yet: still waits, never billed nothing.
  const waiting = await runUsageMeters({ registry, meters, sources, costs, sharedProject: SHARED, now: () => new Date("2026-11-03T07:00:00Z") });
  assert.match(waiting.waiting, /no CAD cost/);
  assert.equal((await meters.get("press-a", "2026-10")).reconciled, false);

  // The bill is in: split 3 to 1.
  bill = 1000;
  const done = await runUsageMeters({ registry, meters, sources, costs, sharedProject: SHARED, now: () => new Date("2026-11-04T07:00:00Z") });
  assert.deepEqual(done.reconciled, { month: "2026-10", shops: 2, invoiceCents: 1000 });
  assert.equal((await meters.get("press-a", "2026-10")).costCents, 750);
  assert.equal((await meters.get("press-b", "2026-10")).costCents, 250);
  assert.equal((await meters.get("press-b", "2026-10")).reconciled, true);

  // Later runs leave the split month alone, even if the export moves.
  bill = 5000;
  await runUsageMeters({ registry, meters, sources, costs, sharedProject: SHARED, now: () => new Date("2026-11-05T07:00:00Z") });
  assert.equal((await meters.get("press-a", "2026-10")).costCents, 750);
  await assert.rejects(runUsageMeters({ registry, meters, sources, costs, now: () => new Date() }), /shared project's id/);
});

test("the running costs bill a shared shop by its split, once it is split", async () => {
  const { costsFor } = await import("../billing/runningCostJob.js");
  const meters = memoryMeters();
  await meters.set("press-a", "2026-10", { invocations: 300, reconciled: false });
  const rows = [shared("press-a")];
  assert.deepEqual(await costsFor({ rows, month: "2026-10", meters, final: true }), {}, "not split yet: waits");
  await meters.set("press-a", "2026-10", { invocations: 300, reconciled: true, costCents: 750 });
  assert.deepEqual(await costsFor({ rows, month: "2026-10", meters, final: true }), { "press-a": 750 });
});

// A fetch that answers from a table of handlers and records each request's address and query.
function recorder(answer) {
  const seen = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const request = { method: init.method ?? "GET", path: `${u.origin}${u.pathname}`, query: Object.fromEntries(u.searchParams), auth: init.headers?.Authorization };
    seen.push(request);
    const json = answer(request);
    return { ok: true, status: 200, text: async () => JSON.stringify(json), json: async () => json };
  };
  return { fetch, seen };
}
const token = async () => "t";

test("Cloud Monitoring's month of a usage metric, summed by shop over every page and day", async () => {
  const pages = {
    "": { timeSeries: [{ metric: { labels: { shop: "press-a" } }, points: [{ value: { distributionValue: { count: "3", mean: 10 } } }, { value: { distributionValue: { count: "1", mean: 2 } } }] }], nextPageToken: "p2" },
    p2: { timeSeries: [{ metric: { labels: { shop: "press-b" } }, points: [{ value: { distributionValue: { count: "2", mean: 50 } } }] }, { metric: { labels: { shop: "Bad Id" } }, points: [] }] },
  };
  const { fetch, seen } = recorder((r) => pages[r.query.pageToken ?? ""]);
  const sums = await monitoringUsage({ fetch, token, projectId: SHARED }).sums(USAGE_METRICS.work, "2026-11");
  assert.deepEqual(sums, { "press-a": { count: 4, sum: 32 }, "press-b": { count: 2, sum: 100 } });
  assert.equal(seen[0].path, `https://monitoring.googleapis.com/v3/projects/${SHARED}/timeSeries`);
  assert.deepEqual({ ...seen[0].query }, {
    filter: 'metric.type="logging.googleapis.com/user/shop_work_ms"', "interval.startTime": "2026-11-01T00:00:00.000Z", "interval.endTime": "2026-12-01T00:00:00.000Z",
    "aggregation.alignmentPeriod": "86400s", "aggregation.perSeriesAligner": "ALIGN_DELTA", "aggregation.crossSeriesReducer": "REDUCE_SUM", "aggregation.groupByFields": "metric.label.shop",
  });
  assert.equal(seen[0].auth, "Bearer t");
});

test("a shop's files are counted under its own folder in every shared bucket", async () => {
  const { fetch, seen } = recorder((r) => (r.path.includes("-stockroom") ? { items: [{ size: "5" }] } : r.query.pageToken ? { items: [{ size: "7" }] } : { items: [{ size: "10" }], nextPageToken: "n" }));
  const storage = storageUsage({ fetch, token, buckets: [`${SHARED}.firebasestorage.app`, `${SHARED}-stockroom`] });
  assert.equal(await storage.bytes("press-a"), 22);
  assert.ok(seen.every((r) => r.query.prefix === "shops/press-a/"));
  await assert.rejects(storage.bytes("../x"), /isn't a shop id/);
});

test("the sources together give each shop its meters", async () => {
  const monitoring = { sums: async (metric) => (metric === USAGE_METRICS.work ? { "press-a": { count: 2, sum: 4000 } } : { "press-a": { count: 1, sum: 1e9 } }) };
  const storage = { bytes: async () => 2e9 };
  const sentLog = { countInMonth: async (shopId, month) => (shopId === "press-a" && month === "2026-11" ? 5 : 0) };
  const out = await usageSources({ monitoring, storage, sentLog }).read("2026-11", ["press-a", "press-b"]);
  assert.deepEqual(out["press-a"], { invocations: 2, computeGbSeconds: 4 * MEMORY_GB, egressGb: 1, storageGb: 2, emails: 5, reads: 0, writes: 0, deletes: 0, firestoreGb: 0 });
  assert.equal(out["press-b"].invocations, 0);
  assert.equal("storageGb" in (await usageSources({ monitoring, storage, sentLog }).read("2026-11", ["press-a"], { measureStorage: false }))["press-a"], false);
});

test("the shared database is shared out by each shop's other use, evenly when nothing else was measured", () => {
  const totals = { reads: 1_000_000, writes: 40_000, deletes: 400, gb: 2 };
  const shared = shareDatabase({ a: metersFrom({ work: { count: 300, ms: 0 } }), b: metersFrom({ work: { count: 100, ms: 0 } }) }, totals);
  assert.deepEqual([shared.a.reads, shared.a.writes, shared.a.deletes, shared.a.firestoreGb], [750_000, 30_000, 300, 1.5]);
  assert.deepEqual([shared.b.reads, shared.b.firestoreGb], [250_000, 0.5]);
  assert.equal(shared.a.invocations, 300, "the shop's own numbers are kept");
  // Each shop's share replaces what was there; a re-run gives the same answer, never twice as much.
  assert.deepEqual(shareDatabase(shared, totals), shared);
  assert.deepEqual(shareDatabase({ a: metersFrom({}), b: metersFrom({}) }, totals).a.reads, 500_000);
  const before = { a: metersFrom({}) };
  assert.equal(shareDatabase(before, null), before, "no totals: nothing changed");
  // The split of the month's bill doesn't move: every shop's weight grows in the same proportion.
  assert.deepEqual(reconcile({ meters: shared, invoiceCents: 1000 }), reconcile({ meters: { a: { invocations: 300 }, b: { invocations: 100 } }, invoiceCents: 1000 }));
});

test("the database's month comes from Firestore's own figures in Cloud Monitoring, every database added up", async () => {
  const asked = [];
  const answers = {
    [DATABASE_METRICS.reads]: [{ points: [{ value: { int64Value: "600" } }, { value: { int64Value: "400" } }] }, { points: [{ value: { int64Value: "50" } }] }],
    [DATABASE_METRICS.writes]: [{ points: [{ value: { int64Value: "30" } }] }],
    [DATABASE_METRICS.deletes]: [],
    [DATABASE_METRICS.bytes]: [{ points: [{ value: { doubleValue: 1e9 } }, { value: { doubleValue: 3e9 } }] }],
  };
  const fetch = async (url) => {
    const u = new URL(url);
    asked.push(Object.fromEntries(u.searchParams));
    const metric = /metric\.type="([^"]+)"/.exec(u.searchParams.get("filter"))[1];
    return new Response(JSON.stringify({ timeSeries: answers[metric] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const totals = await databaseUsage({ fetch, token: async () => "t", projectId: SHARED }).totals("2026-11");
  assert.deepEqual(totals, { reads: 1050, writes: 30, deletes: 0, gb: 2 });
  assert.equal(asked.length, 4);
  assert.ok(asked.every((q) => q.filter.endsWith('resource.type="firestore.googleapis.com/Database"') && q["aggregation.crossSeriesReducer"] === "REDUCE_SUM" && q["interval.startTime"] === "2026-11-01T00:00:00.000Z"));
  assert.deepEqual(asked.map((q) => q["aggregation.perSeriesAligner"]), ["ALIGN_DELTA", "ALIGN_DELTA", "ALIGN_DELTA", "ALIGN_MEAN"]);

  // Read with the rest of the day's meters; a failed read leaves the database at 0 and the rest written.
  const monitoring = { sums: async () => ({ a: { count: 10, sum: 0 } }) };
  const storage = { bytes: async () => 0 };
  const read = await usageSources({ monitoring, storage, database: { totals: async () => totals } }).read("2026-11", ["a"]);
  assert.equal(read.a.reads, 1050);
  const failed = await usageSources({ monitoring, storage, database: { totals: async () => { throw new Error("down"); } } }).read("2026-11", ["a"]);
  assert.deepEqual([failed.a.reads, failed.a.invocations], [0, 10]);
});
