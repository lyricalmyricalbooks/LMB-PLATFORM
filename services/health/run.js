// Runs the health checks or the nightly backups for real. Needs the platform project (docs/test-shop.md steps 1–2) and
// a schedule to call it (every five minutes, and once a night); nothing in the platform's tests runs it.
//
//   HEALTH_ALERT_TO=<the platform's alert address> node services/health/run.js checks
//   node services/health/run.js nightly
//   HEALTH_ALERT_TO=<the platform's alert address> node services/health/run.js botcheck   # daily (plan 15.18)
//   HEALTH_ALERT_TO=<the platform's alert address> node services/health/run.js drill   # monthly (plan 13.5)
//
// The token comes from `gcloud auth print-access-token`. Alerts go through the platform's email service, which reads its own
// settings; this file never reads a key.
import { pathToFileURL } from "node:url";
import { firestoreClient } from "../../clients/firestore.js";
import { googleClients } from "../../clients/google.js";
import { firestoreRegistry } from "../../clients/registry.js";
import { siteCheckClient } from "../../clients/shop.js";
import { firestorePlatformState, firestoreSentLog } from "../../clients/stores.js";
import { gcloudToken } from "../../release-check/run.js";
import { PLATFORM_PROJECT } from "../../setup/real.js";
import { publishStatus } from "../../status/publish.js";
import { createEmailService } from "../email/index.js";
import { healthChecks } from "./checks.js";
import { runBotCheckWatch } from "./botCheck.js";
import { runNightlyBackups } from "./nightly.js";
import { runRestoreDrill } from "./restoreDrill.js";
import { runHealth } from "./runner.js";

/** `projectId`: the platform project; the hosted jobs server passes its own (server/jobs.js). */
export async function realHealth({ job, env = process.env, fetch = globalThis.fetch, token = gcloudToken, projectId = PLATFORM_PROJECT, print = console.log }) {
  if (!["checks", "nightly", "drill", "botcheck"].includes(job)) throw new Error('say which job to run: "checks", "nightly", "drill" or "botcheck"');
  if (job !== "nightly" && !env.HEALTH_ALERT_TO) throw new Error("HEALTH_ALERT_TO is not set");
  const platform = firestoreClient({ fetch, token, projectId });
  const registry = firestoreRegistry(platform);
  const shopDb = (projectId) => firestoreClient({ fetch, token, projectId });
  if (job === "nightly") return runNightlyBackups({ registry, backups: googleClients({ fetch, token }).backups, shopDb, print });
  if (job === "drill") {
    const google = googleClients({ fetch, token });
    const notify = createEmailService({ env, fetch, registry, sentLog: firestoreSentLog(platform) });
    return runRestoreDrill({ registry, backups: google.backups, firestore: google.firestore, notify, config: { alertTo: env.HEALTH_ALERT_TO }, print });
  }
  if (job === "botcheck") {
    const notify = createEmailService({ env, fetch, registry, sentLog: firestoreSentLog(platform) });
    await runBotCheckWatch({ registry, google: googleClients({ fetch, token }), platformState: firestorePlatformState(platform), notify, config: { alertTo: env.HEALTH_ALERT_TO }, print });
    return { ok: true };
  }
  const notify = createEmailService({ env, fetch, registry, sentLog: firestoreSentLog(platform) });
  const result = await runHealth({ registry, checks: healthChecks({ siteCheck: siteCheckClient({ fetch }), fetch, shopDb }), notify, config: { alertTo: env.HEALTH_ALERT_TO }, print });
  // The public status page's summary, from the rows this run just updated (status/).
  await publishStatus({ registry, platform });
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await realHealth({ job: process.argv[2] });
  process.exitCode = result.ok === false ? 1 : 0;
}
