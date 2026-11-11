// Runs the shared system's staged update for real (shared.js): the shared test project, then the live one, then each
// shop's pages. Needs Julian's go-ahead (docs/shared-system.md); nothing in the platform's tests runs it, and it never
// runs by itself.
//
//   SHARED_SHOPS_TEST_PROJECT=lmb-test-shop SHARED_SHOPS_PROJECT=<live shared project> PLATFORM_URL=https://… \
//   RELEASE_BUILD_ROOT=/var/lmb/builds RELEASE_INBOX=… PLATFORM_SERVICE_ACCOUNT=… \
//   node services/release-runner/run-shared.js <version | current> [--dry-run] [--test-shop-only] [--wait-for-lock]
//
// Without SHARED_SHOPS_PROJECT only the test project gets the release. The version is the git tag `release-<version>`
// of this repo, or the commit a merge's version names (`1.2.31-g9644c9f`), built once (builder.js). `current` is the
// version the test shop runs now: what "Send the update to shops" sends on (.github/workflows/send-to-shops.yml).
// `--test-shop-only` is a merge's own update (.github/workflows/update-test-shop.yml): the test project alone, which
// keeps the new version to be looked at when only its release check fails. `--wait-for-lock` waits (up to an hour)
// for another release to finish instead of stopping. With GITHUB_STEP_SUMMARY set, the outcome is written there in
// plain words. The token comes from `gcloud auth print-access-token`; the Firebase command
// line uses the same signed-in account. No key is read from a file.
import { appendFile } from "node:fs/promises";
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

/** The version the shared test project runs now (its rules' stamp), or null when it has none to go on. */
export async function testShopVersion(deploy, projects) {
  const version = (await deploy.deployed(projects[0].projectId, "rules"))?.version;
  return version && version !== "unknown" && !version.includes("+") ? version : null;
}

/** Runs `attempt()` again while another release holds the lock, every minute, up to `tries` times. */
export async function retryWhileLocked(attempt, { tries = 60, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), print = () => {} } = {}) {
  for (let left = tries; ; left -= 1) {
    const result = await attempt();
    if (!result?.locked || left <= 1) return result;
    print("Another release is running; trying again in a minute.");
    await sleep(60_000);
  }
}

/** The outcome in plain words, for the run's summary page on GitHub. */
export function releaseSummary(result, { testShopOnly = false } = {}) {
  const v = result?.version ?? "?";
  const lines = [];
  if (result?.dryRun) {
    lines.push(`### Check only: nothing was changed`, "", `Version ${v} would go to:`);
    for (const p of result.projects ?? []) lines.push(`- ${p.projectId}: ${p.shops.length} shop(s)`);
    return lines.join("\n") + "\n";
  }
  const status = (projectId) => result?.projects?.find((p) => p.projectId === projectId)?.status;
  const first = result?.projects?.[0];
  if (result?.ok && first?.waiting) {
    lines.push(`### The test shop is on ${v}`, "", "Its pages, stockroom and admin passed the release check. The test purchase waits:", "", first.waiting, "",
      "Real shops can't get this version until a test purchase passes.");
  } else if (result?.ok) {
    lines.push(testShopOnly ? `### The test shop is on ${v}` : `### ${v} reached every shop`, "",
      testShopOnly
        ? `It passed the release check (a test purchase, the stockroom, the admin and a refund), so "Send the update to shops" can send it to real shops.`
        : "Each project passed its checks first.");
  } else if (first?.status === "kept-check-failed") {
    lines.push(`### The test shop shows ${v}, but its release check failed`, "", `It stays on the test shop so you can look at it, and it can't go to real shops until a later version passes.`, "", `What failed: ${first.error}`);
  } else if (result?.locked) {
    lines.push(`### ${v} didn't start`, "", "Another release was still running after an hour. Run this again once it is done.");
  } else if (result?.paused) {
    lines.push(`### ${v} didn't start`, "", `Releases are paused (${result.paused.reason}). Resume them in the control room first.`);
  } else {
    lines.push(`### ${v} stopped`, "", `Why: ${result?.error ?? "no result"}`);
    for (const p of result?.projects ?? []) {
      if (p.status === "rolled-back") lines.push("", `${p.projectId} went back to ${p.previous}, the version it had before, and works as it did.`);
      if (p.status === "rollback-failed" || p.status === "failed") lines.push("", `${p.projectId} needs a person to look at it.`);
    }
    if (result?.projects?.length > 1 && status(result.projects[1].projectId) === "not-run") lines.push("", "Real shops weren't touched.");
  }
  return lines.join("\n") + "\n";
}

export async function realSharedRelease({ version, dryRun = false, testShopOnly = false, env = process.env, fetch = globalThis.fetch, token = gcloudToken, run = commandRunner(), chromium, print = console.log }) {
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
  const projects = testShopOnly ? sharedProjects(env).slice(0, 1) : sharedProjects(env);
  const deploy = deployClient({
    fetch, token, run, buildDir: builder.dir,
    // The rules name no owner (each shop's record does), and the project's own profile is never served.
    ownerEmailOf: async () => "", profileScriptOf: async (projectId) => sharedProjectProfile(projectId, { region }),
  });
  if (!version || version === "current") {
    version = await testShopVersion(deploy, projects);
    if (!version) throw new Error(`${projects[0].projectId} has no version to send on; merge a change first, or name one`);
    print(`The test shop runs ${version}; sending that one.`);
  }
  return runSharedRelease({
    version, dryRun, print, region, platformUrl: env.PLATFORM_URL, projects, registry, auditLog, builder, deploy,
    keepOnFailedCheck: testShopOnly,
    migrations: createRequire(import.meta.url)("../../apps/shop/functions/migrations/list.js").length,
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
  const testShopOnly = flags.includes("--test-shop-only");
  const chromium = dryRun ? undefined : createRequire(import.meta.url)("playwright").chromium;
  const attempt = () => realSharedRelease({ version, dryRun, testShopOnly, chromium }).catch((error) => ({ ok: false, version, error: error instanceof Error ? error.message : String(error) }));
  const result = flags.includes("--wait-for-lock") ? await retryWhileLocked(attempt, { print: console.log }) : await attempt();
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, releaseSummary(result, { testShopOnly }));
  if (!result.ok && result.error) console.error(result.error);
  process.exitCode = result.ok ? 0 : 1;
}
