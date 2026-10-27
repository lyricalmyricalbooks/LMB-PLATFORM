// When the refund/dispute safety net in unpaidPaymentSweep re-reads each paid Stripe order from Stripe
// (missed charge.refunded / charge.dispute.* / charge.refund.updated webhooks). The rules for which
// orders are watched and how often are unchanged (stripeRecovery.js): every watched order at least
// every 6 hours, a new payment on the first sweep after it, at most 40 checks per sweep, oldest check first.
//
// What changed is the bookkeeping. The sweep used to read every paid order of the last 120 days on every
// run (96 runs a day) and stamp `stripeCheckedAt` on each order it checked, which woke the order
// triggers. Now the check times live in one server-only record, systemStatus/stripeReversalChecks:
//   { v: 1, orders: { [orderId]: [paidMs, checkedMs, triedMs] }, scannedFrom: iso, reconciledAt: iso }
// Each sweep reads only the orders paid since the last sweep, plus the orders that are due; the full list
// of paid orders is re-read every 6 hours to drop orders that left and add anything the short scan can't
// see. A refund reverted long after the payment (paid again with its old paidAt) asks for that re-read on
// the next sweep through systemStatus/stripeReversalRecheck { at }, so it is not left waiting.
// The I/O is passed in, so this file is pure; paidOrderScanner(db) runs the paid-order scan against the db it is given.

const { reversalWatched, ordersDueReversalCheck, REVERSAL_RECHECK_MS, REVERSAL_WINDOW_MS } = require("./stripeRecovery");
const { runInBatches } = require("./sweepLimits");

const STATE_VERSION = 1;
const RECONCILE_EVERY_MS = 6 * 60 * 60 * 1000; // re-read the full 120-day list this often
const SCAN_OVERLAP_MS = 30 * 60 * 1000;         // each short scan reaches back past the previous sweep
const SCAN_LIMIT = 500;                         // orders per short scan; a full page means "re-read everything next time"
const MAX_TRACKED = 5000;                       // orders the record (and a full re-read) holds; ~200 KB
const CHECKS_PER_RUN = 40;
const DUE_SPARE = 10;
const DUE_ROUNDS = 3;      // due orders the admin just synced free their slot for the next due ones…
const MAX_DUE_READS = 150; // …up to this many due-order reads per sweep
const PAID_STATUSES = ["paid", "refund_pending", "refunded"]; // every status reversalWatched can accept
// The only order fields a scan needs (reversalWatched + the order's own last check). Due orders are
// always read whole, fresh, before they are checked.
const SCAN_FIELDS = ["paymentStatus", "isTest", "stripePaymentIntentId", "paidAt", "createdAt", "refund", "refundedAt", "stripeCheckedAt"];

const msOf = (value) => { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? ms : 0; };
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const isoOf = (ms) => new Date(ms).toISOString();

// The saved record, or null when there is none or it can't be trusted (then the sweep re-reads everything).
function readState(raw) {
  if (!raw || raw.v !== STATE_VERSION || !raw.orders || typeof raw.orders !== "object") return null;
  const orders = {};
  for (const [id, entry] of Object.entries(raw.orders)) {
    if (!Array.isArray(entry) || !(num(entry[0]) > 0)) continue;
    orders[id] = [num(entry[0]), num(entry[1]), num(entry[2])];
  }
  return {
    orders,
    scannedFrom: typeof raw.scannedFrom === "string" ? raw.scannedFrom : null,
    reconciledAt: typeof raw.reconciledAt === "string" ? raw.reconciledAt : null,
  };
}

// What this sweep reads: the full window (reconcile) or only the payments since the previous sweep.
// `recheckMs`: when an order was last put back into the watched set without a new payment (a reverted
// refund); a re-read that started before then may have missed it.
function scanPlan(state, nowMs, recheckMs = 0) {
  const windowStart = nowMs - REVERSAL_WINDOW_MS;
  const reconcile = !state || !state.scannedFrom || !(nowMs - msOf(state.reconciledAt) < RECONCILE_EVERY_MS)
    || (recheckMs > 0 && recheckMs >= msOf(state.reconciledAt));
  const since = reconcile ? windowStart : Math.max(windowStart, msOf(state.scannedFrom) - SCAN_OVERLAP_MS);
  return { reconcile, since: isoOf(since), limit: reconcile ? MAX_TRACKED : SCAN_LIMIT };
}

// Where the next sweep's scan starts and when everything was last re-read.
// A full re-read returns the newest payments first, so even one capped at MAX_TRACKED covers the latest
// ones (and must not repeat every sweep). A short scan that filled its page may have skipped older
// payments since the last sweep: keep the old starting point and re-read everything next time.
// A failed scan changes neither.
function scanMarks(plan, { scanOk, complete, startedMs, saved }) {
  const keep = { scannedFrom: saved ? saved.scannedFrom : null, reconciledAt: saved ? saved.reconciledAt : null };
  if (!scanOk) return keep;
  if (plan.reconcile) return { scannedFrom: isoOf(startedMs), reconciledAt: isoOf(startedMs) };
  if (!complete) return { scannedFrom: keep.scannedFrom, reconciledAt: null };
  return { scannedFrom: isoOf(startedMs), reconciledAt: keep.reconciledAt };
}

// The record after a scan: every watched order seen gets an entry (its own `stripeCheckedAt`, stamped by
// the admin's "Sync with Stripe" or by sweeps before this record existed, counts as its last check);
// orders seen that are no longer watched lose theirs. A complete full re-read also drops entries for
// orders it didn't return (deleted, or no longer paid). Entries past the 120-day window always go.
function mergeScan(entries, scanned, { complete, nowMs }) {
  const next = { ...entries };
  const seen = new Set();
  for (const order of scanned) {
    seen.add(order.id);
    if (!reversalWatched(order, nowMs)) { delete next[order.id]; continue; }
    const before = next[order.id] || [0, 0, 0];
    next[order.id] = [msOf(order.paidAt || order.createdAt), Math.max(before[1], msOf(order.stripeCheckedAt)), before[2]];
  }
  const windowStart = nowMs - REVERSAL_WINDOW_MS;
  for (const [id, [paidMs]] of Object.entries(next)) {
    if (paidMs < windowStart || (complete && !seen.has(id))) delete next[id];
  }
  return next;
}

// Keeps the record under MAX_TRACKED entries (newest payments kept). Returns how many were dropped.
function capEntries(entries) {
  const ids = Object.keys(entries);
  if (ids.length <= MAX_TRACKED) return 0;
  ids.sort((a, b) => entries[b][0] - entries[a][0]);
  for (const id of ids.slice(MAX_TRACKED)) delete entries[id];
  return ids.length - MAX_TRACKED;
}

// Order ids due for a check (last good check 6+ hours ago), oldest check first. An order whose last try
// got no answer from Stripe (triedMs after checkedMs) is still tried on every sweep, but after the
// orders that are simply due, so a group of orders Stripe can't answer for never crowds out the rest.
function dueOrderIds(entries, nowMs, limit = CHECKS_PER_RUN) {
  const due = Object.entries(entries).filter(([, e]) => !(nowMs - e[1] < REVERSAL_RECHECK_MS));
  const failing = ([, e]) => e[2] > e[1];
  const healthy = due.filter((x) => !failing(x)).sort((a, b) => a[1][1] - b[1][1]);
  const retries = due.filter(failing).sort((a, b) => a[1][2] - b[1][2]);
  return [...healthy, ...retries].slice(0, limit).map(([id]) => id);
}

// How many orders are due, and the oldest last check among them (orders never checked aside), so a
// backlog bigger than one sweep's 40 checks gets reported instead of quietly stretching the 6 hours.
function dueBacklog(entries, nowMs) {
  let due = 0, oldestCheckMs = 0;
  for (const e of Object.values(entries)) {
    if (nowMs - e[1] < REVERSAL_RECHECK_MS) continue;
    due++;
    if (e[1] > 0 && (!oldestCheckMs || e[1] < oldestCheckMs)) oldestCheckMs = e[1];
  }
  return { due, oldestCheckMs };
}

// The scan behind io.queryPaid: watched-status orders paid since `since`, newest first, only SCAN_FIELDS,
// 500 per page; one extra order tells a full list from a cut-off one. Pages continue after the last
// document (ties on paidAt included; the cursor needs paidAt, which is in SCAN_FIELDS). Served by the
// (paymentStatus, paidAt desc) orders index.
function paidOrderScanner(db, { pageSize = 500 } = {}) {
  return async (since, max) => {
    const orders = [];
    let last = null;
    while (orders.length <= max) {
      const size = Math.min(pageSize, max + 1 - orders.length);
      let query = db.collection("orders").where("paymentStatus", "in", PAID_STATUSES).where("paidAt", ">=", since)
        .orderBy("paidAt", "desc").select(...SCAN_FIELDS).limit(size);
      if (last) query = query.startAfter(last);
      const page = await query.get();
      for (const d of page.docs) orders.push({ id: d.id, ...d.data() });
      if (page.docs.length < size) break;
      last = page.docs[page.docs.length - 1];
    }
    return { orders: orders.slice(0, max), truncated: orders.length > max };
  };
}

// Resolves after `ms` (Infinity: never), with a cancel so a finished run doesn't keep a timer alive.
function timer(ms) {
  let handle = null;
  const done = Number.isFinite(ms) ? new Promise((resolve) => { handle = setTimeout(resolve, Math.max(0, ms)); }) : new Promise(() => {});
  return { done, cancel: () => { if (handle) clearTimeout(handle); } };
}

/**
 * One sweep's refund/dispute checks.
 * io.readState()                 → the saved record (raw) or null; a throw skips this sweep's checks
 * io.readRecheck()               → (optional) ISO time a re-read was last asked for, or null; a throw is ignored
 * io.writeState(record)          → saves the whole record
 * io.queryPaid(sinceIso, limit)  → { orders, truncated }: watched-status orders paid since then, newest first,
 *                                  at least the SCAN_FIELDS; `truncated` when more than `limit` exist
 * io.getOrders(ids)              → [{ id, ...data } | null] in the same order (ids is never empty)
 * io.check(order, onChecked)     → checkStripeReversal(order.id, order, …, { onChecked }); onChecked runs
 *                                  only once Stripe answered and the result was applied
 * io.stampOrders(ids)            → writes stripeCheckedAt on those orders (only when the record can't be saved)
 * io.warn(message)
 * deadline: no new batch of checks starts after it. stopBy: the record is saved by then even if a check
 * is still waiting on Stripe (the function would otherwise be stopped before saving anything), and no
 * check starts after it.
 */
async function runReversalChecks(io, { now = Date.now, deadline = Infinity, stopBy = Infinity, batch = 5, limit = CHECKS_PER_RUN } = {}) {
  const startedMs = now();
  let raw;
  try { raw = await io.readState(); }
  catch (err) {
    // Treating this as "no record" would re-read everything and overwrite the good record's check times.
    io.warn(`reversal schedule: could not read the record (${err.message}); skipping this sweep's checks`);
    return { skipped: true };
  }
  const saved = readState(raw);
  let recheckMs = 0;
  if (io.readRecheck) {
    try { recheckMs = msOf(await io.readRecheck()); }
    catch (err) { io.warn(`reversal schedule: could not read the re-check request (${err.message})`); }
  }
  const plan = scanPlan(saved, startedMs, recheckMs);
  let scanned = [], scanOk = false, complete = false;
  try {
    const result = await io.queryPaid(plan.since, plan.limit);
    scanned = result.orders || [];
    complete = !result.truncated;
    scanOk = true;
  } catch (err) {
    io.warn(`reversal schedule: paid-order scan failed (${err.message}); checking the orders already on the record`);
  }
  const entries = mergeScan(saved ? saved.orders : {}, scanned, { complete: scanOk && complete && plan.reconcile, nowMs: startedMs });
  const dropped = capEntries(entries);
  if (dropped) io.warn(`reversal schedule: more than ${MAX_TRACKED} paid orders; the ${dropped} oldest are not watched`);
  if (scanOk && plan.reconcile && !complete) io.warn(`reversal schedule: the full re-read stopped at ${MAX_TRACKED} orders`);

  const checkedIds = [];
  let dueCount = 0;
  try {
    // Due orders are read whole and fresh; the same rule as before has the last word. A few extra are
    // read so an order that turns out gone or no longer watched doesn't cost a slot, and when orders the
    // admin just synced (their own stamp is newer than the record) leave slots empty, the next due ones
    // are read to fill them, oldest check first.
    const backlog = dueBacklog(entries, startedMs);
    dueCount = backlog.due;
    if (backlog.due > limit && backlog.oldestCheckMs && startedMs - backlog.oldestCheckMs > REVERSAL_RECHECK_MS + 60 * 60 * 1000) {
      io.warn(`reversal schedule: ${backlog.due} orders are due, more than one sweep checks; the oldest was last checked ${Math.round((startedMs - backlog.oldestCheckMs) / 3600000)} h ago`);
    }
    const toCheck = [];
    const read = new Set();
    for (let round = 0; round < DUE_ROUNDS && toCheck.length < limit; round++) {
      const want = Math.min(limit - toCheck.length + DUE_SPARE, MAX_DUE_READS - read.size);
      const dueIds = want > 0 ? dueOrderIds(entries, startedMs, Infinity).filter((id) => !read.has(id)).slice(0, want) : [];
      if (!dueIds.length) break;
      dueIds.forEach((id) => read.add(id));
      let fresh;
      try { fresh = await io.getOrders(dueIds); }
      catch (err) { io.warn(`reversal schedule: could not read the due orders: ${err.message}`); break; }
      const candidates = [];
      dueIds.forEach((id, i) => {
        if (i >= fresh.length) return; // not read: stays due
        const order = fresh[i];
        if (!order || !reversalWatched(order, startedMs)) { delete entries[id]; return; } // gone, or left
        const e = entries[id];
        const checkedMs = Math.max(e[1], msOf(order.stripeCheckedAt));
        entries[id] = [msOf(order.paidAt || order.createdAt), checkedMs, e[2]];
        candidates.push({ ...order, id, stripeCheckedAt: checkedMs ? isoOf(checkedMs) : null });
      });
      const allowed = new Set(ordersDueReversalCheck(candidates, startedMs, Infinity).map((o) => o.id));
      toCheck.push(...candidates.filter((o) => allowed.has(o.id)).slice(0, limit - toCheck.length));
    }
    const stop = timer(stopBy - now());
    let stopped = false;
    const checks = runInBatches(toCheck, batch, async (order) => {
      if (stopped) return; // the record is saved; the next sweep checks it
      let answered = false;
      try {
        await io.check(order, () => {
          answered = true;
          checkedIds.push(order.id);
          const at = now();
          if (entries[order.id]) entries[order.id] = [entries[order.id][0], at, at];
        });
      } finally {
        if (!answered && entries[order.id]) entries[order.id][2] = now();
      }
    }, { deadline: Math.min(deadline, stopBy), now });
    try { await Promise.race([checks, stop.done]); } finally { stopped = true; stop.cancel(); }
  } finally {
    // A copy: a check still waiting on Stripe at the stop time must not change what was saved.
    const orders = Object.fromEntries(Object.entries(entries).map(([id, e]) => [id, e.slice()]));
    const record = { v: STATE_VERSION, orders, ...scanMarks(plan, { scanOk, complete, startedMs, saved }) };
    try {
      await io.writeState(record);
    } catch (err) {
      // Without the record the next sweep would start again from the orders' own stamps and keep picking
      // the same oldest 40, so stamp the orders checked now, as sweeps did before the record existed.
      io.warn(`reversal schedule: could not save the record (${err.message}); stamping the checked orders instead`);
      await Promise.resolve().then(() => io.stampOrders(checkedIds.slice())).catch((e) => io.warn(`reversal schedule: stamping failed too: ${e.message}`));
    }
  }
  return { reconcile: plan.reconcile, scanned: scanned.length, tracked: Object.keys(entries).length, due: dueCount, checked: checkedIds.length };
}

module.exports = {
  runReversalChecks, paidOrderScanner, readState, scanPlan, scanMarks, mergeScan, capEntries, dueOrderIds, dueBacklog,
  STATE_VERSION, RECONCILE_EVERY_MS, SCAN_OVERLAP_MS, SCAN_LIMIT, MAX_TRACKED, CHECKS_PER_RUN, DUE_SPARE, DUE_ROUNDS,
  MAX_DUE_READS, SCAN_FIELDS, PAID_STATUSES,
};
