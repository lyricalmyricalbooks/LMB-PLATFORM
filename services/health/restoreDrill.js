// The monthly restore drill (plan 13.5). A backup nobody has restored is a hope, not a backup. Once a month the platform
// takes one live shop, restores its latest backup into a scratch database, counts the shop's books, orders and reviews
// there and in the live shop, writes the result on the shop's row, and removes the scratch database.
//
//   runRestoreDrill({ registry, backups, firestore, notify, config: { alertTo }, now, print })
//
// - `backups.latest(shopId)` -> { name: "backups/<day>/" } | null; `backups.restoreScratch(shopId, { folder })` ->
//   { database }; `backups.removeScratch(shopId, database)`; `firestore.count(shopId, database, collection)` -> number.
// - The result is the row's `restoreDrill: { at, ok, folder, counts: { <collection>: { restored, live } }, detail? }` and
//   the health check `drill` (so the control room's list of shops with a problem shows it, and a failure sends the same
//   `health-alert` email as any other check). It runs again after a month, not on every call.
// - Only a shop with a backup is picked. The shop whose last drill is oldest goes first, so every shop is tried in turn.
// - Nothing in the live shop is written: the scratch database is the only thing created, and it is always removed.
import { leftOut } from "../release-runner/rings.js";
import { HEALTH_ALERT, nextState } from "./runner.js";

export const DRILL_COLLECTIONS = ["books", "orders", "reviews"];
export const DRILL_EVERY_DAYS = 28;

const message = (error) => (error instanceof Error ? error.message : String(error));

/** A restored count matches the live one when it is within 10% (at least 5 documents): the live shop moved on since the backup. */
export function countsMatch(restored, live) {
  if (live > 0 && restored === 0) return false;
  return Math.abs(live - restored) <= Math.max(5, Math.ceil(live * 0.1));
}

export async function runRestoreDrill({ registry, backups, firestore, notify, config = {}, now = () => new Date(), print = () => {}, collections = DRILL_COLLECTIONS }) {
  if (!config.alertTo) throw new Error("the restore drill needs an address to send alerts to (HEALTH_ALERT_TO)");
  const rows = (await registry.listShops()).filter((row) => !leftOut(row));
  const last = Math.max(0, ...rows.map((row) => Date.parse(row.restoreDrill?.at ?? 0) || 0));
  if (last && (now().getTime() - last) / 86_400_000 < DRILL_EVERY_DAYS) return { ran: false, reason: "the last drill was less than a month ago" };

  const candidates = [];
  for (const row of [...rows].sort((a, b) => (Date.parse(a.restoreDrill?.at ?? 0) || 0) - (Date.parse(b.restoreDrill?.at ?? 0) || 0))) {
    const latest = await backups.latest(row.shopId).catch(() => null);
    if (latest) { candidates.push({ row, folder: latest.name }); break; }
  }
  if (!candidates.length) return { ran: false, reason: "no live shop has a backup to test yet" };

  const { row, folder } = candidates[0];
  const at = now().toISOString();
  const counts = {};
  let detail = "";
  let scratch = null;
  try {
    scratch = (await backups.restoreScratch(row.shopId, { folder })).database;
    for (const collection of collections) {
      counts[collection] = { restored: await firestore.count(row.shopId, scratch, collection), live: await firestore.count(row.shopId, "(default)", collection) };
    }
    const wrong = Object.entries(counts).filter(([, c]) => !countsMatch(c.restored, c.live));
    if (wrong.length) detail = wrong.map(([name, c]) => `${name}: ${c.restored} restored, ${c.live} live`).join("; ");
  } catch (error) {
    detail = `couldn't restore: ${message(error)}`;
  } finally {
    if (scratch) {
      try { await backups.removeScratch(row.shopId, scratch); } catch (error) { detail = `${detail ? `${detail}; ` : ""}the scratch copy ${scratch} was not removed: ${message(error)}`; }
    }
  }
  const ok = detail === "";

  const before = row.health?.checks?.drill;
  const { state, alert } = nextState("drill", before, ok ? { ok: true } : { ok: false, detail }, at);
  if (alert) {
    try {
      await notify.sendPlatform({
        kind: HEALTH_ALERT, to: config.alertTo, shopId: row.shopId,
        idempotencyKey: `health-${row.shopId}-drill-${alert}-${state.since}-${at}`,
        data: { pressName: row.pressName ?? row.shopId, shopId: row.shopId, check: "drill", state: alert, detail: state.detail ?? "", since: state.since },
      });
      if (alert === "recovered") delete state.alertedAt; else state.alertedAt = at;
    } catch (error) {
      print(`${row.shopId}: couldn't send the drill alert: ${message(error)}`);
      if (alert === "recovered") state.recoveryUnsent = true;
    }
  }
  await registry.recordEvent(row.shopId, { id: `drill-${at}`, kind: "restore-drill", ok, folder, counts, ...(detail ? { detail } : {}), at });
  const health = row.health ?? { checkedAt: at, ok: true, checks: {} };
  const checks = { ...health.checks, drill: state };
  await registry.updateShop(row.shopId, {
    restoreDrill: { at, ok, folder, counts, ...(detail ? { detail } : {}) },
    health: { ...health, ok: Object.values(checks).every((c) => c.ok), checks },
  });
  print(`${row.shopId}: restore drill ${ok ? "passed" : `failed: ${detail}`}`);
  return { ran: true, shopId: row.shopId, ok, counts, detail };
}
