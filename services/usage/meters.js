// Each shop's month of use in the shared system (docs/shared-system.md, phase 7), for pay what you use
// (services/billing/runningCost.js). Every shop shares one Google project, so Google's bill is one bill: the meters say
// how much of it each shop used, and once the month's bill is known they split it so the shares add up to it exactly.
//
//   usage/{shopId}_{YYYY-MM} in the platform project, one record per shop and month:
//     { shopId, month, invocations, computeGbSeconds, egressGb, storageGb, emails, reads, writes, deletes, firestoreGb,
//       updatedAt, reconciled: false }
//   and, once the shared project's bill for the month is in the billing export (from the 3rd of the next month):
//     { …, reconciled: true, costCents, invoiceCents, reconciledAt }
//
// Where each number comes from (sources.js):
//   invocations, computeGbSeconds  the shared server's usage lines (apps/shop/functions/usageLog.js), counted by shop by
//                                  the log-based metric shop_work_ms (server/setup-usage-metrics.js); time at MEMORY_GB
//   egressGb                       the front door's usage lines (pages and files it served), metric shop_page_bytes
//   storageGb                      the shop's files in the shared buckets (shops/<id>/…), measured on the day
//   emails                         the emails sent for the shop (the platform's sent log)
//   reads, writes, deletes,        the shared database's month (Cloud Monitoring's Firestore figures, every database in
//   firestoreGb                    the project) shared out by each shop's other measured use (shareDatabase). Google
//                                  counts the database as a whole (reads from shoppers' browsers never reach the
//                                  server), so this is the shop's share, the same split the month's bill gets when it is
//                                  reconciled; the owner's tracker shows it day by day instead of $0 until then.
//
// `runUsageMeters` is the daily job: this month so far, and last month again until it is reconciled. A reconciled
// record is never written again. Safe to run any number of times.
import { METER_KEYS, UNIT_PRICES } from "../billing/runningCost.js";
import { BILL_FROM_DAY } from "../billing/runningCostJob.js";
import { monthOf } from "../costs/costs.js";

/** The memory each server instance has (the shop functions' default), to turn server time into GB-seconds. */
export const MEMORY_GB = 0.25;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The record's id: usage/{shopId}_{YYYY-MM}. */
export const usageId = (shopId, month) => `${shopId}_${month}`;

/** The usage records in the platform project's database (clients/firestore.js client). */
export function firestoreUsageMeters(firestore) {
  return {
    get: (shopId, month) => firestore.get(`usage/${usageId(shopId, month)}`),
    set: (shopId, month, data) => firestore.set(`usage/${usageId(shopId, month)}`, data),
  };
}

/** The month's first moment and the next month's, as ISO times (UTC, as the billing export counts). */
export function monthBounds(month) {
  if (!MONTH.test(month ?? "")) throw new Error("the month must look like 2026-11");
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString(), end: new Date(Date.UTC(y, m, 1)).toISOString() };
}

const previousMonthOf = (month) => {
  const [y, m] = month.split("-").map(Number);
  return monthOf(Date.UTC(y, m - 2, 1));
};

/** One shop's numbers from what the sources measured: { work: { count, ms }, bytes, storageBytes, emails }. */
export function metersFrom({ work = null, bytes = 0, storageBytes = null, emails = 0 } = {}) {
  const ms = Number(work?.ms) || 0;
  return {
    invocations: Number(work?.count) || 0,
    computeGbSeconds: round((ms / 1000) * MEMORY_GB),
    egressGb: round((Number(bytes) || 0) / 1e9),
    ...(storageBytes === null ? {} : { storageGb: round((Number(storageBytes) || 0) / 1e9) }),
    emails: Number(emails) || 0,
    reads: 0, writes: 0, deletes: 0, firestoreGb: 0,
  };
}
const round = (n) => Math.round(n * 1e6) / 1e6;

/** The meters that are the shared database's, shared out by shareDatabase rather than measured per shop. */
export const DATABASE_KEYS = Object.freeze(["reads", "writes", "deletes", "firestoreGb"]);

/**
 * Each shop's share of the shared database: `measured` { [shopId]: meters } with the database's month `totals`
 * { reads, writes, deletes, gb } handed out by each shop's other use priced at list prices (so a shop that shows more
 * pages and runs more orders carries more of it), evenly when nothing else was measured. Returns new records; a shop's
 * own database numbers are replaced, never added to. With no totals, the records are returned as they were.
 */
export function shareDatabase(measured, totals) {
  const ids = Object.keys(measured ?? {}).sort();
  if (!totals || !ids.length) return measured;
  const weights = ids.map((id) => Math.max(0, weightOf(measured[id], DATABASE_KEYS)));
  const sum = weights.reduce((a, b) => a + b, 0);
  const amount = (key) => Math.max(0, Number(totals[key]) || 0);
  return Object.fromEntries(ids.map((id, i) => {
    const share = sum > 0 ? weights[i] / sum : 1 / ids.length;
    return [id, { ...measured[id], reads: round(amount("reads") * share), writes: round(amount("writes") * share), deletes: round(amount("deletes") * share), firestoreGb: round(amount("gb") * share) }];
  }));
}

/**
 * The month's bill split by use: { [shopId]: cents }, adding up to `invoiceCents` exactly. Each shop's weight is its
 * meters priced at Google's list prices, unrounded (so a quiet shop still counts); the cents are handed
 * out by largest remainder. With no use measured at all, the bill is split evenly.
 */
export function reconcile({ meters, invoiceCents }) {
  const ids = Object.keys(meters).sort();
  const total = Math.max(0, Math.round(Number(invoiceCents) || 0));
  if (!ids.length) return {};
  const weights = ids.map((id) => Math.max(0, weightOf(meters[id])));
  const sum = weights.reduce((a, b) => a + b, 0);
  const shares = ids.map((_, i) => (sum > 0 ? (total * weights[i]) / sum : total / ids.length));
  const out = Object.fromEntries(ids.map((id, i) => [id, Math.floor(shares[i])]));
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  const order = ids.map((id, i) => [id, shares[i] - Math.floor(shares[i])]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (let i = 0; left > 0; i = (i + 1) % order.length, left -= 1) out[order[i][0]] += 1;
  return out;
}
// The meters' list-price cost in millionths of a dollar, unrounded (meterCost rounds to cents, too coarse for a quiet shop).
function weightOf(record, leaveOut = []) {
  return METER_KEYS.reduce((sum, kind) => {
    if (leaveOut.includes(kind)) return sum;
    const amount = Number(record?.[kind]);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount * UNIT_PRICES[kind].micros : 0);
  }, 0);
}

/**
 * The daily job. `rows` are the shared project's shops (registry rows with `shared: true`); `sources.read(month,
 * shopIds, { measureStorage })` -> { [shopId]: metersFrom(…) }; `costs` is the billing export reader
 * (services/costs createCostReader). Returns { month, written, reconciled: { month, shops } | null, waiting }.
 */
export async function runUsageMeters({ registry, meters, sources, costs = null, sharedProject, currency = "CAD", now = () => new Date() }) {
  if (!sharedProject) throw new Error("the usage meters need the shared project's id");
  const today = now();
  const month = monthOf(today);
  const last = previousMonthOf(month);
  const rows = (await registry.listShops()).filter((row) => row.shared === true && row.projectId === sharedProject);
  const ids = rows.map((row) => row.shopId).sort();
  const at = today.toISOString();

  const write = async (m, measureStorage) => {
    const measured = ids.length ? await sources.read(m, ids, { measureStorage }) : {};
    const records = {};
    for (const shopId of ids) {
      const before = await meters.get(shopId, m);
      if (before?.reconciled === true) { records[shopId] = before; continue; }
      const record = { ...(before ?? {}), shopId, month: m, ...measured[shopId], updatedAt: at, reconciled: false };
      await meters.set(shopId, m, record);
      records[shopId] = record;
    }
    return records;
  };

  await write(month, true);
  // Last month: counted again in full (the logs of its last hours arrive late), its storage kept from its own days.
  const lastRecords = await write(last, false);
  let reconciled = null;
  let waiting = null;
  if (ids.length && Object.values(lastRecords).some((r) => r.reconciled !== true)) {
    if (today.getUTCDate() < BILL_FROM_DAY) waiting = `last month's bill settles by day ${BILL_FROM_DAY}`;
    else if (!costs?.configured) waiting = "the billing export isn't on yet";
    else {
      const project = (await costs.read(last))?.projects?.find((p) => p.projectId === sharedProject && p.currency === currency);
      if (!project) waiting = `the export has no ${currency} cost for ${sharedProject} in ${last} yet`;
      else {
        const split = reconcile({ meters: lastRecords, invoiceCents: Math.max(0, project.netCents) });
        for (const shopId of ids) {
          if (lastRecords[shopId].reconciled === true) continue;
          await meters.set(shopId, last, { ...lastRecords[shopId], reconciled: true, costCents: split[shopId], invoiceCents: Math.max(0, project.netCents), reconciledAt: at });
        }
        reconciled = { month: last, shops: ids.length, invoiceCents: Math.max(0, project.netCents) };
      }
    }
  }
  return { month, written: ids.length, reconciled, waiting, summary: `${ids.length} shops metered for ${month}${reconciled ? `; ${last} split (${reconciled.invoiceCents} cents)` : waiting ? `; ${last} waits: ${waiting}` : ""}` };
}
