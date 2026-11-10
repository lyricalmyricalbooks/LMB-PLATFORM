// Runs the shared system's staged update for real (shared.js): the shared test project, then the live one, then each
// shop's pages. Needs Julian's go-ahead (docs/shared-system.md); nothing in the platform's tests runs it, and it never
// runs by itself.
//
//   SHARED_SHOPS_TEST_PROJECT=lmb-test-shop SHARED_SHOPS_PROJECT=<live shared project> PLATFORM_URL=https://… \
//   RELEASE_BUILD_ROOT=/var/lmb/builds RELEASE_INBOX=… PLATFORM_SERVICE_ACCOUNT=… \
//   node services/release-runner/run-shared.js <version> [--dry-run]
//
// Without SHARED_SHOPS_PROJECT only the test project gets the release. The version is the git tag `release-<version>`
// of this repo, built once (builder.js). The token comes from `gcloud auth print-access-token`; the Firebase command
// line uses the same signed-in account. No key is read from a file.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gcloudToken, realRun as realReleaseCheck } from "../../release-check/run.js";
import { PLATFORM_PROJECT } from "../../setup/real.js";
import { REGION } from "../../setup/steps.js";
import { buildAndPublish } from "../../setup/shopSite.js";
import { deployClient } from "../../clients/deploy.js";
import { firestoreClient } from "../../clients/firestore.js";
import { googleClients } from "../../clients/google.js";
import { firestoreAuditLog, firestoreRegistry } from "../../clients/registry.js";
import { liveDatabaseUrl, sharedStores } from "../../clients/shared.js";
import { siteCheckClient } from "../../clients/shop.js";
import { firestorePlatformState } from "../../clients/stores.js";
import { releasesPaused } from "../../control-room/runbook.js";
import { releaseBuilder } from "./builder.js";
import { commandRunner } from "./run.js";
import { runSharedRelease, sharedProjectProfile } from "./shared.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The shared projects in release order, from the environment: the test project first. */
export function sharedProjects(env = {}) {
  const test = String(env.SHARED_SHOPS_TEST_PROJECT ?? "").trim() || "lmb-test-shop";
  const live = String(env.SHARED_SHOPS_PROJECT ?? "").trim();
  return [{ projectId: test, test: true }, ...(live && live !== test ? [{ projectId: live }] : [])];
}

export async function realSharedRelease({ version, dryRun = false, env = process.env, fetch = globalThis.fetch, token = gcloudToken, run = commandRunner(), chromium, print = console.log }) {
  for (const name of ["RELEASE_BUILD_ROOT", "PLATFORM_URL"]) if (!env[name]) throw new Error(`${name} is not set`);
  const region = String(env.SHOP_FUNCTIONS_REGION ?? "").trim() || REGION;
  const builder = releaseBuilder({ run, root: env.RELEASE_BUILD_ROOT, source: REPO });
  const platform = firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT });
  const registry = firestoreRegistry(platform);
  const stores = new Map();
  const storesOf = (projectId) => {
    if (!stores.has(projectId)) stores.set(projectId, sharedStores({ fetch, token, projectId, databaseUrl: liveDatabaseUrl(projectId, env) }));
    return stores.get(projectId);
  };
  // Each shop's audit log is in its folder, in whichever shared project holds it.
  const projectOf = async (shopId) => {
    const row = await registry.getShop(shopId);
    if (row?.shared !== true) throw new Error(`${shopId} isn't in the shared system`);
    return row.projectId;
  };
  const auditLog = { write: async (shopId, id, entry) => firestoreAuditLog(storesOf(await projectOf(shopId)).shopDb).write(shopId, id, entry) };
  const google = googleClients({ fetch, token });
  return runSharedRelease({
    version, dryRun, print, region, platformUrl: env.PLATFORM_URL, projects: sharedProjects(env), registry, auditLog, builder,
    migrations: createRequire(import.meta.url)("../../apps/shop/functions/migrations/list.js").length,
    deploy: deployClient({
      fetch, token, run, buildDir: builder.dir,
      // The rules name no owner (each shop's record does), and the project's own profile is never served.
      ownerEmailOf: async () => "", profileScriptOf: async (projectId) => sharedProjectProfile(projectId, { region }),
    }),
    siteCheck: siteCheckClient({ fetch }),
    releaseCheck: (shopId, v) => realReleaseCheck({ shopId, env: { ...env, RELEASE_VERSION: v }, fetch, token, chromium, print }),
    async publishShop(row, v) {
      const record = await storesOf(row.projectId).records.get(row.shopId);
      if (!record) throw new Error("its record is missing from the shared project");
      await buildAndPublish({
        shop: { id: row.shopId, record, tenant: record.tenant }, siteFiles: google.siteFiles, projectId: row.projectId,
        appDir: join(builder.dir(v), "apps", "shop"), print,
      });
    },
    paused: () => releasesPaused(firestorePlatformState(platform)),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes("--dry-run");
  const chromium = dryRun ? undefined : createRequire(import.meta.url)("playwright").chromium;
  const result = await realSharedRelease({ version, dryRun, chromium });
  process.exitCode = result.ok ? 0 : 1;
}
