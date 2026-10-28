// The nightly backup run (plan 4.3). Each shop backs up its own database every night (its nightly backup function,
// systemStatus/backup). The platform adds what that doesn't cover:
// - the stockroom's own database (plan 1.20), which nothing in the stockroom backs up: exported every night;
// - the shop's database when its own backup has missed a night (no good one in STAND_IN_HOURS): exported as a stand-in.
// Exports go to backups/<day>/ in the shop's bucket (clients/google.js `backups.run`), next to the shop's own. Each one
// is written on the registry row (`platformBackup: { shopAt?, stockroomAt? }`, read by the backup check in checks.js)
// and as a registry event. A failed export is an event too; the five-minute run's backup check then alerts on it.
//
//   runNightlyBackups({ registry, backups, shopDb, now, print })
import { STOCKROOM_DATABASE } from "../../clients/shop.js";
import { appsOf } from "../../setup/later-steps.js";
import { leftOut } from "../release-runner/rings.js";

export const STAND_IN_HOURS = 22;

const message = (error) => (error instanceof Error ? error.message : String(error));

export async function runNightlyBackups({ registry, backups, shopDb, now = () => new Date(), print = () => {}, stockroomDatabase = STOCKROOM_DATABASE }) {
  const rows = (await registry.listShops()).filter((row) => !leftOut(row));
  const results = [];
  for (const row of rows) {
    const apps = appsOf(row);
    const done = {};
    const failed = [];
    const jobs = [];
    if (apps.includes("shop")) {
      const own = await shopDb(row.shopId).get("systemStatus/backup").catch(() => null);
      const fresh = own?.lastSuccessAt && (now().getTime() - Date.parse(own.lastSuccessAt)) / 3_600_000 < STAND_IN_HOURS;
      if (!fresh) jobs.push(["shopAt", "(default)"]);
    }
    if (apps.includes("stockroom")) jobs.push(["stockroomAt", stockroomDatabase]);
    for (const [field, database] of jobs) {
      const at = now().toISOString();
      try {
        const { name } = await backups.run(row.shopId, { database });
        done[field] = at;
        await registry.recordEvent(row.shopId, { id: `backup-${at}-${field}`, kind: "backup", database, ok: true, folder: name, at });
      } catch (error) {
        failed.push(database);
        await registry.recordEvent(row.shopId, { id: `backup-${at}-${field}`, kind: "backup", database, ok: false, error: message(error), at });
        print(`${row.shopId}: the ${database} backup failed: ${message(error)}`);
      }
    }
    if (Object.keys(done).length) await registry.updateShop(row.shopId, { platformBackup: { ...(row.platformBackup ?? {}), ...done } });
    results.push({ shopId: row.shopId, backedUp: Object.keys(done), failed });
  }
  return { shops: results, ok: results.every((r) => !r.failed.length) };
}
