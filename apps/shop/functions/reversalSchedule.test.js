// The refund/dispute safety net keeps its timing (every watched order at least every 6 hours, a new
// payment on the next sweep, 40 checks per sweep, oldest first) while reading only new payments and the
// due orders, and without writing to orders.
import { describe, expect, it } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { runReversalChecks, paidOrderScanner, readState, scanPlan, mergeScan, capEntries, dueOrderIds, MAX_TRACKED, SCAN_LIMIT, SCAN_FIELDS, PAID_STATUSES, MAX_DUE_READS, DUE_ROUNDS, DUE_SPARE } = require("./reversalSchedule.js");

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const T0 = Date.parse("2026-10-15T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const paid = (id, paidMs, extra = {}) => ({ id, paymentStatus: "paid", stripeMode: "live", stripePaymentIntentId: `pi_${id}`, paidAt: iso(paidMs), createdAt: iso(paidMs - MIN), ...extra });

// A fake shop: orders in memory, the record in memory, Stripe answers through `found`.
// Like the real query, a scan returns only SCAN_FIELDS; like Firestore's getAll, an empty read throws.
const scanCopy = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k === "id" || SCAN_FIELDS.includes(k)));
function shop(orders = [], { found = () => true } = {}) {
  const db = new Map(orders.map((o) => [o.id, o]));
  const io = {
    record: null, recheck: null, reads: 0, queries: [], fetched: [], tried: [], checked: [], stamped: [], warnings: [],
    failWrite: false, failScan: false, failRead: false, failRecheck: false,
    readState: async () => { if (io.failRead) throw new Error("unavailable"); return io.record; },
    readRecheck: async () => { if (io.failRecheck) throw new Error("unavailable"); return io.recheck; },
    writeState: async (r) => { if (io.failWrite) throw new Error("write refused"); io.record = JSON.parse(JSON.stringify(r)); },
    queryPaid: async (since, limit) => {
      if (io.failScan) throw new Error("index building");
      io.queries.push({ since, limit });
      const hits = [...db.values()].filter((o) => ["paid", "refund_pending", "refunded"].includes(o.paymentStatus) && o.paidAt && o.paidAt >= since)
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
      io.reads += Math.min(hits.length, limit + 1);
      return { orders: hits.slice(0, limit).map(scanCopy), truncated: hits.length > limit };
    },
    getOrders: async (ids) => {
      if (!ids.length) throw new Error("Function \"Firestore.getAll()\" requires at least 1 argument.");
      io.fetched.push(...ids); io.reads += ids.length;
      return ids.map((id) => (db.has(id) ? { ...db.get(id), id } : null));
    },
    check: async (order, onChecked) => {
      io.tried.push(order.id);
      expect(order.stripeMode).toBe("live"); // checks get the whole order, not the scan's few fields
      if (found(order)) { io.checked.push(order.id); onChecked(); }
    },
    stampOrders: async (ids) => { io.stamped.push(...ids); },
    warn: (m) => io.warnings.push(m),
  };
  return { db, io };
}
const run = (io, nowMs, opts = {}) => runReversalChecks(io, { now: () => nowMs, ...opts });

describe("reversal schedule", () => {
  it("first sweep re-reads every paid order, checks the due ones and saves their times without touching orders", async () => {
    const { io } = shop([paid("a", T0 - 2 * DAY), paid("b", T0 - 30 * DAY), paid("old", T0 - 130 * DAY), paid("t", T0 - DAY, { isTest: true }), { id: "u", paymentStatus: "unpaid", stripePaymentIntentId: "pi_u", createdAt: iso(T0) }]);
    const result = await run(io, T0);
    expect(result.reconcile).toBe(true);
    expect(io.checked.sort()).toEqual(["a", "b"]);
    expect(io.stamped).toEqual([]);
    expect(io.record).toMatchObject({ v: 1, scannedFrom: iso(T0), reconciledAt: iso(T0) });
    expect(Object.keys(io.record.orders).sort()).toEqual(["a", "b"]);
    expect(io.record.orders.a).toEqual([T0 - 2 * DAY, T0, T0]);
  });

  it("the next sweeps read only new payments and check nothing until 6 hours have passed", async () => {
    const { io, db } = shop([paid("a", T0 - 2 * DAY), paid("b", T0 - 30 * DAY)]);
    await run(io, T0);
    io.checked = []; io.reads = 0; io.queries = []; io.fetched = [];
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toEqual([]);
    expect(io.queries[0]).toEqual({ since: iso(T0 - 30 * MIN), limit: SCAN_LIMIT });
    expect(io.reads).toBe(0);
    // A payment between sweeps is checked on the very next one (read whole first).
    db.set("c", paid("c", T0 + 20 * MIN));
    await run(io, T0 + 30 * MIN);
    expect(io.checked).toEqual(["c"]);
    expect(io.fetched).toEqual(["c"]);
    // Six hours after the first check the two older orders are due again; that sweep re-reads everything.
    io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked.sort()).toEqual(["a", "b"]);
    // The order paid between sweeps is due 6 hours after its check.
    io.checked = []; io.fetched = [];
    await run(io, T0 + 6 * HOUR + 30 * MIN);
    expect(io.checked).toEqual(["c"]);
    expect(io.fetched).toEqual(["c"]);
  });

  it("an order the admin synced with Stripe recently waits 6 hours from that sync", async () => {
    const { io, db } = shop([paid("a", T0 - 2 * DAY)]);
    await run(io, T0);
    db.get("a").stripeCheckedAt = iso(T0 + 5 * HOUR);
    io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toEqual([]);
    expect(io.record.orders.a[1]).toBe(T0 + 5 * HOUR);
    await run(io, T0 + 11 * HOUR);
    expect(io.checked).toEqual(["a"]);
  });

  it("an order Stripe couldn't answer for stays due and is tried again on the next sweep", async () => {
    let answer = false;
    const { io } = shop([paid("a", T0 - DAY)], { found: () => answer });
    await run(io, T0);
    expect(io.record.orders.a[1]).toBe(0);
    answer = true;
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toEqual(["a"]);
  });

  it("reports a backlog bigger than one sweep can check", async () => {
    const orders = Array.from({ length: 60 }, (_, i) => paid(`o${i}`, T0 - DAY - i * MIN, { stripeCheckedAt: iso(T0 - 8 * HOUR) }));
    const { io } = shop(orders);
    const result = await run(io, T0);
    expect(result.due).toBe(60);
    expect(io.warnings.some((w) => /60 orders are due/.test(w))).toBe(true);
  });

  it("checks at most 40 per sweep: never-checked orders first, then the oldest checks", async () => {
    // 5 never checked, and 70 last checked between 7 and 20 hours ago (each at a different time).
    const orders = [
      ...Array.from({ length: 5 }, (_, i) => paid(`new${i}`, T0 - (i + 1) * HOUR)),
      ...Array.from({ length: 70 }, (_, i) => paid(`o${i}`, T0 - 2 * DAY - i * MIN, { stripeCheckedAt: iso(T0 - 7 * HOUR - i * 11 * MIN) })),
    ];
    const { io } = shop(orders);
    await run(io, T0);
    const oldest35 = Array.from({ length: 35 }, (_, i) => `o${69 - i}`);
    expect(io.tried).toHaveLength(40);
    expect(io.fetched).toHaveLength(40 + DUE_SPARE); // one read of the due orders, no more rounds once 40 are chosen
    expect(io.tried.slice(0, 5).sort()).toEqual(["new0", "new1", "new2", "new3", "new4"]);
    expect(io.tried.slice(5)).toEqual(oldest35); // oldest check first, in that order
    // The next sweep takes the next oldest 35.
    io.tried = [];
    await run(io, T0 + 15 * MIN);
    expect(io.tried).toEqual(Array.from({ length: 35 }, (_, i) => `o${34 - i}`));
  });

  it("due orders the admin just synced free their slots for the next due ones", async () => {
    // The record still has the sweep's 7-hour-old check for 30 orders the admin opened an hour ago
    // (Sync with Stripe stamps the order, not the record), sorting them ahead of 40 orders really due.
    const synced = Array.from({ length: 30 }, (_, i) => paid(`s${i}`, T0 - 3 * DAY - i * MIN, { stripeCheckedAt: iso(T0 - HOUR) }));
    const due = Array.from({ length: 40 }, (_, i) => paid(`d${i}`, T0 - 4 * DAY - i * MIN));
    const { io } = shop([...synced, ...due]);
    io.record = {
      v: 1, scannedFrom: iso(T0 - 15 * MIN), reconciledAt: iso(T0 - HOUR),
      orders: Object.fromEntries([
        ...synced.map((o) => [o.id, [Date.parse(o.paidAt), T0 - 7 * HOUR, T0 - 7 * HOUR]]),
        ...due.map((o) => [o.id, [Date.parse(o.paidAt), T0 - 6.5 * HOUR, T0 - 6.5 * HOUR]]),
      ]),
    };
    const result = await run(io, T0);
    expect(result.reconcile).toBe(false);
    expect(io.checked.sort()).toEqual(due.map((o) => o.id).sort());
    expect(io.fetched).toHaveLength(70); // 50 first, then the 20 left
    for (const o of synced) expect(io.record.orders[o.id][1]).toBe(T0 - HOUR);
  });

  const allSynced = (n) => {
    const synced = Array.from({ length: n }, (_, i) => paid(`s${i}`, T0 - 3 * DAY - i * MIN, { stripeCheckedAt: iso(T0 - HOUR) }));
    const { io } = shop(synced);
    io.record = { v: 1, scannedFrom: iso(T0 - 15 * MIN), reconciledAt: iso(T0 - HOUR), orders: Object.fromEntries(synced.map((o) => [o.id, [Date.parse(o.paidAt), T0 - 7 * HOUR, 0]])) };
    return io;
  };

  it("stops reading due orders after a few rounds when they all turn out just synced", async () => {
    const io = allSynced(200);
    await run(io, T0, { limit: 10 }); // 3 rounds of 10 + spare stay under the read cap
    expect(io.fetched).toHaveLength(DUE_ROUNDS * (10 + DUE_SPARE));
    expect(new Set(io.fetched).size).toBe(io.fetched.length);
    expect(io.checked).toEqual([]);
  });

  it("never reads more due orders than the cap in one sweep", async () => {
    const io = allSynced(300);
    await run(io, T0, { limit: 60 }); // 3 rounds of 60 + spare would pass the cap
    expect(io.fetched).toHaveLength(MAX_DUE_READS);
    expect(new Set(io.fetched).size).toBe(MAX_DUE_READS);
    expect(io.checked).toEqual([]);
  });

  it("a due-order read that fails stops the rounds; what was read is still checked and the rest stay due", async () => {
    // 30 just synced sort first, then 80 really due: round 1 reads 30 synced + 20 due, round 2 fails.
    const synced = Array.from({ length: 30 }, (_, i) => paid(`s${i}`, T0 - 3 * DAY - i * MIN, { stripeCheckedAt: iso(T0 - HOUR) }));
    const due = Array.from({ length: 80 }, (_, i) => paid(`d${i}`, T0 - 4 * DAY - i * MIN));
    const { io } = shop([...synced, ...due]);
    io.record = {
      v: 1, scannedFrom: iso(T0 - 15 * MIN), reconciledAt: iso(T0 - HOUR),
      orders: Object.fromEntries([
        ...synced.map((o) => [o.id, [Date.parse(o.paidAt), T0 - 7 * HOUR, T0 - 7 * HOUR]]),
        ...due.map((o) => [o.id, [Date.parse(o.paidAt), T0 - 6.5 * HOUR, T0 - 6.5 * HOUR]]),
      ]),
    };
    const read = io.getOrders;
    let calls = 0;
    io.getOrders = async (ids) => { calls += 1; if (calls === 2) throw new Error("deadline exceeded"); return read(ids); };
    await run(io, T0);
    expect(calls).toBe(2); // no third round after the failure
    expect(io.checked).toHaveLength(20);
    expect(io.warnings.some((w) => w.includes("could not read the due orders"))).toBe(true);
    const stillDue = due.filter((o) => io.record.orders[o.id][1] === T0 - 6.5 * HOUR);
    expect(stillDue).toHaveLength(60);
  });

  it("drops orders that left: refunded elsewhere, deleted, or past 120 days", async () => {
    const { io, db } = shop([paid("a", T0 - DAY), paid("b", T0 - DAY), paid("c", T0 - 119.8 * DAY)]);
    await run(io, T0);
    db.get("a").paymentStatus = "refunded"; db.get("a").refund = { provider: "paypal" };
    db.delete("b");
    await run(io, T0 + 6 * HOUR + MIN);
    expect(Object.keys(io.record.orders)).toEqual([]);
  });

  it("an order put back to paid with a re-check request is found on the next sweep", async () => {
    const { io, db } = shop([paid("a", T0 - 90 * DAY, { paymentStatus: "refunded", refund: { provider: "stripe" }, refundedAt: iso(T0 - 80 * DAY) })]);
    await run(io, T0);
    db.get("a").paymentStatus = "paid"; // the webhook reverted a failed refund…
    io.recheck = iso(T0 + 10 * MIN);    // …and asked for a re-read
    const result = await run(io, T0 + 15 * MIN);
    expect(result.reconcile).toBe(true);
    expect(io.checked).toEqual(["a"]);
    // Asked once: the sweep after that is a short one again.
    expect((await run(io, T0 + 30 * MIN)).reconcile).toBe(false);
    // A request made while a re-read was running asks for one more.
    expect(scanPlan(readState(io.record), T0 + 45 * MIN, Date.parse(io.record.reconciledAt)).reconcile).toBe(true);
  });

  it("a re-check request that can't be read doesn't stop the checks", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    io.failRecheck = true;
    await run(io, T0);
    expect(io.checked).toEqual(["a"]);
    expect(io.warnings.some((w) => /re-check request/.test(w))).toBe(true);
  });

  it("re-reading everything every 6 hours finds an order put back to paid long after it was paid", async () => {
    const { io, db } = shop([paid("a", T0 - 90 * DAY, { paymentStatus: "refunded", refund: { provider: "stripe" }, refundedAt: iso(T0 - 80 * DAY) })]);
    await run(io, T0);
    expect(io.record.orders).toEqual({});
    db.get("a").paymentStatus = "paid"; // e.g. a failed refund reverted by the webhook
    await run(io, T0 + 15 * MIN);
    expect(io.checked).toEqual([]);
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toEqual(["a"]);
  });

  it("a short scan that fills its page keeps its start and re-reads everything next time", async () => {
    const { io, db } = shop([]);
    await run(io, T0);
    for (let i = 0; i < SCAN_LIMIT + 5; i++) db.set(`n${i}`, paid(`n${i}`, T0 + MIN + i * 1000));
    await run(io, T0 + 15 * MIN);
    expect(io.record.scannedFrom).toBe(iso(T0));
    expect(io.record.reconciledAt).toBeNull();
    expect(scanPlan(readState(io.record), T0 + 30 * MIN).reconcile).toBe(true);
    await run(io, T0 + 30 * MIN);
    expect(Object.keys(io.record.orders)).toHaveLength(SCAN_LIMIT + 5);
  });

  it("a failed scan still checks the orders on the record and keeps the scan marks", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    await run(io, T0);
    io.failScan = true; io.checked = [];
    await run(io, T0 + 6 * HOUR);
    expect(io.checked).toEqual(["a"]);
    expect(io.record).toMatchObject({ scannedFrom: iso(T0), reconciledAt: iso(T0) });
  });

  it("when the record can't be saved, the checked orders are stamped as before", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    io.failWrite = true;
    await run(io, T0);
    expect(io.stamped).toEqual(["a"]);
  });

  it("an unreadable or old record means re-reading everything", async () => {
    expect(readState({ v: 0, orders: {} })).toBeNull();
    expect(readState({ v: 1, orders: { a: [T0, T0], b: "x", c: [NaN, 1], d: [T0, null, "x"] } }).orders).toEqual({ a: [T0, T0, 0], d: [T0, 0, 0] });
    const { io } = shop([paid("a", T0 - DAY)]);
    io.record = { v: 99, orders: { a: [1, T0] } };
    expect((await run(io, T0)).reconcile).toBe(true);
    expect(io.checked).toEqual(["a"]);
  });

  it("keeps the record under its size cap, newest payments first", () => {
    const entries = {};
    const scanned = Array.from({ length: MAX_TRACKED + 3 }, (_, i) => paid(`o${i}`, T0 - DAY - i * MIN));
    const merged = mergeScan(entries, scanned, { complete: true, nowMs: T0 });
    expect(capEntries(merged)).toBe(3);
    expect(merged[`o${MAX_TRACKED + 2}`]).toBeUndefined();
    expect(merged.o0).toBeDefined();
    expect(dueOrderIds(merged, T0, 40)).toHaveLength(40);
  });

  it("a record that can't be read skips the checks instead of overwriting it", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    await run(io, T0);
    const before = JSON.stringify(io.record);
    io.failRead = true; io.checked = [];
    expect(await run(io, T0 + 6 * HOUR)).toEqual({ skipped: true });
    expect(io.checked).toEqual([]);
    expect(JSON.stringify(io.record)).toBe(before);
  });

  it("orders Stripe can't answer for are retried every sweep, but after the orders that are simply due", async () => {
    const orders = [...Array.from({ length: 40 }, (_, i) => paid(`bad${i}`, T0 - 10 * DAY - i * MIN)), ...Array.from({ length: 30 }, (_, i) => paid(`ok${i}`, T0 - DAY - i * MIN))];
    const { io } = shop(orders, { found: (o) => !o.id.startsWith("bad") });
    await run(io, T0, { limit: 40 });
    await run(io, T0 + 15 * MIN, { limit: 40 });
    await run(io, T0 + 30 * MIN, { limit: 40 });
    // Every healthy order got its check although 40 failing ones sort "oldest" by check time.
    expect(new Set(io.checked).size).toBe(30);
    // With room to spare, the failing ones are still tried on each sweep (as before).
    io.tried = [];
    await run(io, T0 + 45 * MIN, { limit: 40 });
    expect(io.tried.filter((id) => id.startsWith("bad"))).toHaveLength(40);
  });

  it("a check whose refund/dispute update failed is tried again on the next sweep", async () => {
    const { io } = shop([paid("a", T0 - DAY)]);
    io.check = async (order) => { io.tried.push(order.id); throw new Error("transaction contention"); };
    await run(io, T0).catch(() => {});
    expect(io.record.orders.a[1]).toBe(0);
    expect(dueOrderIds(readState(io.record).orders, T0 + 15 * MIN)).toEqual(["a"]);
  });

  it("saves the record by the stop time even when a check is still waiting on Stripe", async () => {
    const { io } = shop([paid("a", T0 - DAY), paid("b", T0 - 2 * DAY)]);
    io.check = async (order, onChecked) => { if (order.id === "a") return new Promise(() => {}); onChecked(); };
    const started = Date.now();
    const result = await runReversalChecks(io, { now: () => T0, stopBy: T0 + 50, batch: 5 });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(result.checked).toBe(1);
    expect(io.record.orders.b[1]).toBe(T0);
    expect(io.record.orders.a[1]).toBe(0);
  });

  it("no check starts after the stop time, and checks still running then don't change the saved record", async () => {
    const orders = Array.from({ length: 20 }, (_, i) => paid(`o${i}`, T0 - DAY - i * MIN));
    const { io } = shop(orders);
    let saved = null;
    io.writeState = async (r) => { saved = r; };
    // The sweep's clock reads T0 until the first check starts and T0 + 100 after that, past the stop
    // time; the stop timer itself is real (80 ms) and fires while the first batch (200 ms) still runs.
    let clock = T0;
    const started = [];
    io.check = async (order, onChecked) => {
      started.push(order.id);
      clock = T0 + 100;
      await new Promise((resolve) => setTimeout(resolve, 200));
      onChecked();
    };
    await runReversalChecks(io, { now: () => clock, deadline: T0 + 10000, stopBy: T0 + 80, batch: 5 });
    const snapshot = JSON.stringify(saved);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(started).toHaveLength(5); // only the first batch, already running at the stop time
    expect(JSON.stringify(saved)).toBe(snapshot);
    expect(Object.values(saved.orders).every(([, checkedMs]) => checkedMs === 0)).toBe(true);
  });

  it("no check starts after the stop time even when the sweep's clock doesn't move", async () => {
    const { io } = shop(Array.from({ length: 10 }, (_, i) => paid(`o${i}`, T0 - DAY - i * MIN)));
    io.check = async (order, onChecked) => { io.tried.push(order.id); await new Promise((resolve) => setTimeout(resolve, 150)); onChecked(); };
    await runReversalChecks(io, { now: () => T0, stopBy: T0 + 50, batch: 5 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(io.tried).toHaveLength(5);
  });

  it("over three days of sweeps every watched order is checked on time", async () => {
    // Payments arrive at irregular times; some are refunded through the webhook partway.
    const { io, db } = shop(Array.from({ length: 120 }, (_, i) => paid(`p${i}`, T0 - (i * 17 + 3) * HOUR)));
    const lastCheck = new Map();
    const firstSeen = new Map();
    let worstGap = 0, worstFirst = 0;
    for (let t = T0, n = 0; t < T0 + 3 * DAY; t += 15 * MIN, n++) {
      if (n % 7 === 3) db.set(`new${n}`, paid(`new${n}`, t - 4 * MIN));
      if (n === 50) { db.get("p3").paymentStatus = "refunded"; db.get("p3").refund = { provider: "paypal" }; }
      io.checked = [];
      await run(io, t);
      for (const id of io.checked) {
        if (lastCheck.has(id)) worstGap = Math.max(worstGap, t - lastCheck.get(id));
        else firstSeen.set(id, t);
        lastCheck.set(id, t);
      }
    }
    for (const [id, t] of firstSeen) if (id.startsWith("new")) worstFirst = Math.max(worstFirst, t - Date.parse(db.get(id).paidAt));
    expect(worstGap).toBeLessThanOrEqual(6 * HOUR + 15 * MIN);
    expect(worstFirst).toBeLessThanOrEqual(15 * MIN);
    for (const [id, o] of db) if (o.paymentStatus === "paid" && Date.parse(o.paidAt) > T0 - 120 * DAY + 3 * DAY) expect(lastCheck.has(id)).toBe(true);
    expect(io.stamped).toEqual([]);
  });
});

// A fake Firestore orders collection that behaves like the real query: filters, newest paidAt first with
// ties broken by document id (descending, as Firestore adds __name__), only the selected fields, and a
// startAfter cursor that needs the order-by field on the snapshot.
function ordersDb(rows) {
  const log = [];
  const pick = (r, fields) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "id" && (!fields || fields.includes(k))));
  const query = (state) => ({
    where: (field, op, value) => query({ ...state, where: [...state.where, [field, op, value]] }),
    orderBy: (field, dir) => query({ ...state, orderBy: [field, dir] }),
    select: (...fields) => query({ ...state, select: fields }),
    limit: (n) => query({ ...state, limit: n }),
    startAfter: (snap) => {
      if (snap.get("paidAt") === undefined) throw new Error("Field \"paidAt\" is missing in the provided DocumentSnapshot.");
      return query({ ...state, after: snap });
    },
    async get() {
      let hits = rows.filter((r) => state.where.every(([f, op, v]) => (op === "in" ? v.includes(r[f]) : op === ">=" ? r[f] != null && r[f] >= v : false)));
      hits.sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.id.localeCompare(a.id));
      if (state.after) {
        const at = state.after.get("paidAt"), id = state.after.id;
        hits = hits.filter((r) => r.paidAt < at || (r.paidAt === at && r.id < id));
      }
      hits = hits.slice(0, state.limit);
      log.push({ where: state.where, orderBy: state.orderBy, select: state.select, limit: state.limit, after: state.after ? state.after.id : null, rows: hits.length });
      return { docs: hits.map((r) => { const data = pick(r, state.select); return { id: r.id, data: () => ({ ...data }), get: (k) => data[k] }; }) };
    },
  });
  return { log, db: { collection: (name) => { expect(name).toBe("orders"); return query({ where: [], orderBy: null, select: null, limit: Infinity, after: null }); } } };
}

describe("paid-order scan", () => {
  // 1,203 matching orders, three at a time sharing one paidAt, plus orders the scan must leave out.
  const SINCE = iso(T0 - 100 * DAY);
  const many = Array.from({ length: 1203 }, (_, i) => paid(`m${String(i).padStart(4, "0")}`, T0 - Math.floor(i / 3) * HOUR, { secret: "not scanned" }));
  const others = [
    { ...paid("unpaid", T0), paymentStatus: "unpaid" },
    paid("tooOld", T0 - 101 * DAY),
    { ...paid("cancelled", T0), paymentStatus: "failed" },
  ];

  it("a full re-read pages through every order exactly once, newest first, with only the scan fields", async () => {
    const { db, log } = ordersDb([...many, ...others]);
    const { orders, truncated } = await paidOrderScanner(db)(SINCE, MAX_TRACKED);
    expect(truncated).toBe(false);
    expect(orders).toHaveLength(1203);
    expect(new Set(orders.map((o) => o.id)).size).toBe(1203);
    expect(orders.map((o) => o.id)).toEqual([...many].sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.id.localeCompare(a.id)).map((o) => o.id));
    expect(orders.every((o) => o.secret === undefined && o.stripePaymentIntentId)).toBe(true);
    expect(log.map((q) => q.rows)).toEqual([500, 500, 203]);
    expect(log.map((q) => q.after)).toEqual([null, orders[499].id, orders[999].id]);
    for (const q of log) {
      expect(q.where).toEqual([["paymentStatus", "in", PAID_STATUSES], ["paidAt", ">=", SINCE]]);
      expect(q.orderBy).toEqual(["paidAt", "desc"]);
      expect(q.select).toEqual(SCAN_FIELDS);
      expect(q.limit).toBeLessThanOrEqual(500);
    }
  });

  it("a short scan with more new payments than one page says it was cut off", async () => {
    const { db, log } = ordersDb(many.slice(0, SCAN_LIMIT + 1));
    const { orders, truncated } = await paidOrderScanner(db)(SINCE, SCAN_LIMIT);
    expect(truncated).toBe(true);
    expect(orders).toHaveLength(SCAN_LIMIT);
    expect(log.map((q) => [q.limit, q.rows])).toEqual([[500, 500], [1, 1]]);
  });

  it("exactly one page of new payments is complete, and the start time is applied", async () => {
    const { db } = ordersDb(many.slice(0, SCAN_LIMIT));
    expect((await paidOrderScanner(db)(SINCE, SCAN_LIMIT)).truncated).toBe(false);
    const recent = ordersDb([...many, ...others]);
    const since = iso(T0 - 2 * HOUR);
    const { orders, truncated } = await paidOrderScanner(recent.db)(since, SCAN_LIMIT);
    expect(truncated).toBe(false);
    expect(orders.map((o) => o.id).sort()).toEqual(["m0000", "m0001", "m0002", "m0003", "m0004", "m0005", "m0006", "m0007", "m0008"]);
    expect(PAID_STATUSES).toEqual(["paid", "refund_pending", "refunded"]);
  });
});
