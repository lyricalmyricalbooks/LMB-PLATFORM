// Cut an idle shop's bill (code plan 15.16). Google bills every Cloud Scheduler job after the free three (a paused one
// too), and keeps every old build image of the shop's server code. The shop's ten sweeps now run from one "tick" job
// (apps/shop/functions/tick.js), so setup
//   - deletes the ten old jobs (a re-deploy removes them too; this is the safety net for a shop made before the tick),
//   - puts a one-day cleanup rule on the functions' build repository.
// A paused or closed shop has no jobs at all (`onPause`, `onClose`); a shop that comes back gets its server code deployed
// again, which creates the tick job (`onReopen`, through the injected `redeploy`).
import { REGION } from "./steps.js";

/** The ten sweeps that used to be Cloud Scheduler jobs, by function name. */
export const OLD_SWEEPS = Object.freeze([
  "refreshExchangeRates", "inventoryLinkSweep", "paymentPageSweep", "unpaidPaymentSweep", "nightlyFirestoreBackup",
  "dailyOrderDigest", "weeklySummary", "abandonedCartSweep", "storageImageSweep", "backInStockSweep",
]);
/** Firebase names a scheduled function's job `firebase-schedule-<function>-<region>`. */
export const jobIdOf = (name, region = REGION) => `firebase-schedule-${name}-${region}`;
export const TICK_JOB = (region = REGION) => jobIdOf("tick", region);
export const isFirebaseJob = (id) => id.startsWith("firebase-schedule-");

/** Deletes the old per-sweep jobs. Returns the ids it deleted. Never touches the tick job. */
export async function retireOldJobs({ scheduler, projectId, region = REGION }) {
  const present = new Set(await scheduler.listJobs(projectId, region));
  const deleted = [];
  for (const name of OLD_SWEEPS) {
    const id = jobIdOf(name, region);
    if (!present.has(id)) continue;
    await scheduler.deleteJob(projectId, region, id);
    deleted.push(id);
  }
  return deleted;
}

/** Deletes every job the shop's server code made (a paused or closed shop runs nothing). Returns the ids deleted. */
export async function deleteAllJobs({ scheduler, projectId, region = REGION }) {
  const deleted = [];
  for (const id of await scheduler.listJobs(projectId, region)) {
    if (!isFirebaseJob(id)) continue;
    await scheduler.deleteJob(projectId, region, id);
    deleted.push(id);
  }
  return deleted;
}

/** Setup step 17: one tick job and a build cleanup rule. Safe to run twice. */
export function upkeepStep({ number = 17, google, config }) {
  const region = config?.region ?? REGION;
  return {
    number,
    name: "Cut the idle bill: one scheduled job and a build cleanup rule",
    async check({ shop }) {
      const jobs = await google.scheduler.listJobs(shop.shopId, region);
      if (OLD_SWEEPS.some((name) => jobs.includes(jobIdOf(name, region)))) return false;
      return (await google.buildCleanup.has(shop.shopId, region)) !== false;
    },
    async act({ shop }) {
      await retireOldJobs({ scheduler: google.scheduler, projectId: shop.shopId, region });
      if ((await google.buildCleanup.has(shop.shopId, region)) === false) await google.buildCleanup.set(shop.shopId, region);
    },
  };
}

/**
 * The closing sweep's hooks for jobs: `onPause` and `onClose` delete them, `onReopen` deploys the server code again.
 * `redeploy(shop)` is injected (the release runner's functions deploy for that shop).
 */
export function createJobHooks({ scheduler, redeploy, regionOf = () => REGION }) {
  const projectOf = (shop) => shop.projectId ?? shop.shopId;
  const removeJobs = async (shop) => { await deleteAllJobs({ scheduler, projectId: projectOf(shop), region: regionOf(shop) }); };
  return { onPause: removeJobs, onClose: removeJobs, onReopen: async (shop) => { await redeploy(shop); } };
}
