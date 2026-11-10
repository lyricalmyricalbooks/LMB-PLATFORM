// The staged update for the shared system (docs/shared-system.md, phase 7). Every shop lives in one Firebase project,
// so a release goes to a project, not to a shop: the shared test project first (`lmb-test-shop`, with the test shop in
// it), then the live shared project. Each project gets the same build the per-project runner makes (builder.js):
//
//   1. rules: the shop's (Firestore, Storage) and the stockroom's (its database, the Realtime Database, its bucket),
//      stamped with the release;
//   2. the shared server's code, with the server's own settings (`sharedServerEnv`: the same for every shop; each
//      shop's own settings are fields of its record);
//   3. the one Hosting site, the front door for every shop, with the stockroom under /stockroom;
//   4. a check: every part's stamp is this release, one shop in the project answers at its own address (home, /admin,
//      its profile, the stockroom), and in the test project the full release check passes on the test shop;
//   5. each shop's own pages drawn again from its own books (setup/shopSite.js), one shop at a time. A shop whose
//      pages fail keeps its last good ones (nothing is uploaded), is listed, and the release goes on: the code is the
//      same for every shop, so one shop's catalogue never holds the others back.
//
// A failed check puts that project back on the release it had before (the stamp on its live rules), checks it again,
// and stops: the live project never gets a release its test project refused. A project with no earlier release stops
// for a person. Data changes (functions/migrations) are kept per project, so the shared release refuses to start
// while the list has any: they must first learn to run in each shop's folder.
//
// Safe to re-run: a project already on the release, with its stamps and check in order, is left alone and only its
// shops' pages are drawn again. One shared release runs at a time (a registry lock). Everything is recorded: the run
// in the registry (`recordRelease`, kind "shared-release"), each shop's pages in its audit log, and each shop whose
// pages went out gets `release: { version, at, runId }` on its row.
import { randomUUID } from "node:crypto";
import { REGION } from "../../setup/steps.js";
import { shopPlaces } from "../../clients/shared.js";

export const SHARED_RELEASE_LOCK = "_shared-release";
export const LOCK_MINUTES = 120;
export const SHARED_APPS = Object.freeze(["shop", "stockroom"]);
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_NAME = /^[a-z]+-[a-z]+[0-9]{1,2}$/;

const message = (error) => (error instanceof Error ? error.message : String(error));
const usable = (version) => (version && version !== "unknown" && !version.includes("+") ? version : undefined);

/**
 * The shared server's settings file (functions/.env.<project>): what is the same for every shop. Each shop's own
 * settings (SHOP_KEYS in setup/sharedSteps.js) are fields of its record, read per request (functions/shopConfig.js).
 * `platformUrl` is the platform's address (its /api/payments, /api/email/shop and /api/domains doors).
 */
export function sharedServerEnv({ platformUrl, region = REGION }) {
  const base = String(platformUrl ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(base)) throw new Error(`"${platformUrl}" isn't the platform's https address`);
  if (!REGION_NAME.test(region)) throw new Error(`"${region}" isn't a functions region`);
  return [
    // Every shop pays through the platform's payment service, so the server loads the platform key at start.
    `SHOP_PAYMENT_MODE="platform"`,
    `SHOP_PAYMENTS_SERVICE_URL="${base}/api/payments"`,
    `SHOP_FUNCTIONS_REGION="${region}"`,
    `PLATFORM_EMAIL_URL="${base}/api/email/shop"`,
    `PLATFORM_DOMAINS_URL="${base}/api/domains"`,
    "",
  ].join("\n");
}

/**
 * The profile the shared project's own deploy reads (never served: the front door answers each shop's own). It names
 * the project, the stockroom's database and bucket (apps/stockroom/scripts/deployConfig.mjs), both apps (so the site
 * carries the stockroom under /stockroom) and the functions' region (the front door's rewrites).
 */
export function sharedProjectProfile(projectId, { region = REGION } = {}) {
  if (!PROJECT.test(projectId ?? "")) throw new Error(`"${projectId}" isn't a Firebase project id`);
  const profile = {
    version: 1,
    shared: true,
    apps: { shop: true, stockroom: true },
    functionsRegion: region,
    firebase: { projectId },
    stockroom: { firestoreDatabase: "stockroom", storageBucket: `${projectId}-stockroom` },
  };
  return `window.__SHOP_PROFILE__=${JSON.stringify(profile)};`;
}

/**
 * `runSharedRelease({ version, projects, registry, auditLog, builder, deploy, siteCheck, releaseCheck, publishShop,
 *                     migrations, platformUrl, region, dryRun, print, paused })`
 * - `projects`: the shared projects in order, `[{ projectId, test: true }, { projectId }]`; the first must be the test one.
 * - `deploy`: clients/deploy.js (its profile for a shared project is `sharedProjectProfile`).
 * - `publishShop(row, version)`: draws one shop's pages from the release's build and uploads them (setup/shopSite.js).
 * - `migrations`: the number of data changes in the release (apps/shop/functions/migrations/list.js).
 */
export async function runSharedRelease({
  version, projects = [], registry, auditLog, builder, deploy, siteCheck, releaseCheck, publishShop, migrations = 0,
  platformUrl, region = REGION, dryRun = false, print = () => {}, now = () => new Date(), runId = randomUUID(),
  lockMinutes = LOCK_MINUTES, paused = async () => null,
}) {
  if (!VERSION.test(version ?? "")) throw new Error(`"${version}" isn't a release version (like 1.4.0)`);
  if (!projects.length || projects[0].test !== true) throw new Error("a shared release starts with the shared test project");
  if (new Set(projects.map((p) => p.projectId)).size !== projects.length) throw new Error("a shared project is named twice");
  for (const { projectId } of projects) if (!PROJECT.test(projectId ?? "")) throw new Error(`"${projectId}" isn't a Firebase project id`);
  if (migrations > 0) {
    const error = `the release has ${migrations} data change(s), which still run per project; teach them to run in each shop's folder first`;
    print(`Release ${version} can't start: ${error}.`);
    return { ok: false, version, error, projects: [] };
  }
  const envFile = sharedServerEnv({ platformUrl, region });

  const rows = (await registry.listShops()).filter((row) => row?.shared === true && row.status === "live" && row.closing?.stage !== "deleted");
  const shopsOf = (projectId) => rows.filter((row) => row.projectId === projectId).sort((a, b) => a.shopId.localeCompare(b.shopId));
  const testShop = shopsOf(projects[0].projectId).find((row) => row.testShop === true);
  if (!testShop) {
    const error = `${projects[0].projectId} has no live test shop, so the release has nowhere to be tried first`;
    print(`Release ${version} can't start: ${error}.`);
    return { ok: false, version, error, projects: [] };
  }
  for (const { projectId } of projects) print(`${projectId}: ${shopsOf(projectId).length} shop(s).`);
  if (dryRun) return { ok: true, dryRun: true, version, projects: projects.map(({ projectId }) => ({ projectId, shops: shopsOf(projectId).map((r) => r.shopId) })) };

  const pause = await paused();
  if (pause) {
    print(`Releases are paused by ${pause.by} (${pause.reason}); release ${version} doesn't start.`);
    return { ok: false, version, paused: pause, projects: [] };
  }
  const lockFor = () => ({ runId, takenAt: now().toISOString(), expiresAt: new Date(now().getTime() + lockMinutes * 60_000).toISOString() });
  const lock = await registry.takeLock(SHARED_RELEASE_LOCK, lockFor());
  if (!lock.taken) {
    print(`Another shared release (${lock.runId}) is running until ${lock.expiresAt}; this one stops.`);
    return { ok: false, version, locked: true, projects: [] };
  }

  const startedAt = now().toISOString();
  const results = projects.map(({ projectId }) => ({ projectId, status: "not-run" }));
  let error = null;
  try {
    try {
      await builder.build(version);
    } catch (buildError) {
      error = `the build of ${version} failed: ${message(buildError)}`;
      print(`${error}. Nothing was deployed.`);
      return { ok: false, version, error, projects: results };
    }
    const ctx = { deploy, siteCheck, releaseCheck, builder, envFile, region, print, now, runId, registry, auditLog, publishShop };
    for (const [index, project] of projects.entries()) {
      if (!(await registry.takeLock(SHARED_RELEASE_LOCK, lockFor())).taken) {
        error = "the release lock was taken over by another run";
        break;
      }
      const pausedNow = await paused();
      if (pausedNow) {
        error = `releases were paused by ${pausedNow.by} (${pausedNow.reason}) before ${project.projectId}`;
        break;
      }
      const sample = project.test ? testShop : shopsOf(project.projectId)[0] ?? null;
      const result = await releaseProject(ctx, project, sample, version);
      if (result.status === "shipped" || result.status === "already-on") {
        result.pages = await publishAll(ctx, shopsOf(project.projectId), version);
      }
      Object.assign(results[index], result);
      if (result.status !== "shipped" && result.status !== "already-on") {
        error = `${project.projectId}: ${result.error}`;
        break;
      }
    }
    return { ok: !error, version, ...(error ? { error } : {}), projects: results };
  } finally {
    await registry.recordRelease({ kind: "shared-release", version, runId, startedAt, finishedAt: now().toISOString(), ok: !error, ...(error ? { error } : {}), projects: results });
    await registry.releaseLock(SHARED_RELEASE_LOCK, runId);
    print(error ? `Release ${version} stopped: ${error}.` : `Release ${version} reached every shared project.`);
  }
}

/** One project: deploy, check, and go back to the release before on a failed check. */
async function releaseProject(ctx, project, sample, version) {
  const { deploy, print } = ctx;
  const { projectId } = project;
  const previous = usable((await deploy.deployed(projectId, "rules"))?.version);
  if (previous === version) {
    const problems = await checkProject(ctx, project, sample, version);
    if (!problems.length) {
      print(`${projectId} is already on ${version}.`);
      return { status: "already-on", previous };
    }
  }
  try {
    await ship(ctx, projectId, version);
    const problems = await checkProject(ctx, project, sample, version);
    if (!problems.length) {
      print(`${projectId}: ${version} sent and checked.`);
      return { status: "shipped", previous: previous ?? null };
    }
    return rollBack(ctx, project, sample, version, previous, problems.join("; "));
  } catch (deployError) {
    return rollBack(ctx, project, sample, version, previous, `the deploy failed: ${message(deployError)}`);
  }
}

async function rollBack(ctx, project, sample, version, previous, error) {
  ctx.print(`${project.projectId}: ${error}.`);
  if (!previous || previous === version) {
    return { status: "failed", previous: previous ?? null, error: `${error}; there is no earlier release to go back to, so a person looks at it` };
  }
  try {
    await ctx.builder.build(previous);
    await ship(ctx, project.projectId, previous);
    const problems = await checkProject(ctx, project, sample, previous);
    if (problems.length) throw new Error(problems.join("; "));
    ctx.print(`${project.projectId}: back on ${previous}.`);
    return { status: "rolled-back", previous, error };
  } catch (rollbackError) {
    return { status: "rollback-failed", previous, error: `${error}; going back to ${previous} failed too: ${message(rollbackError)}` };
  }
}

/** Rules, then the server code, then the site: the order the shop's own deploy uses, so new pages never meet old rules. */
async function ship({ deploy, envFile, region }, projectId, version) {
  await deploy.rules(projectId, { version, apps: [...SHARED_APPS] });
  await deploy.functions(projectId, { version, region, envFile });
  await deploy.pages(projectId, { version, app: "shop" });
}

/** What is wrong with the project on `version`, in plain words; empty when it passes. */
export async function checkProject({ deploy, siteCheck, releaseCheck }, project, sample, version) {
  const problems = [];
  for (const part of ["rules", "functions", "pages:shop"]) {
    const live = await deploy.deployed(project.projectId, part);
    if (live?.version !== version) problems.push(`its ${part} are on ${live?.version ?? "nothing"}, not ${version}`);
  }
  if (problems.length) return problems;
  if (sample) {
    const { site, stockroom } = shopPlaces(sample);
    for (const url of [site, `${site}/admin`, `${site}/shop-profile.js`, stockroom]) {
      const { status, problems: found = [] } = await siteCheck.get(url);
      if (status !== 200 || found.length) problems.push(`${url} answered ${status}${found.length ? ` (${found.join("; ")})` : ""}`);
    }
  }
  if (problems.length) return problems;
  if (project.test === true) {
    const result = await releaseCheck(sample.shopId, version);
    if (!result?.ok) problems.push(`the release check failed: ${result?.error ?? "no result"}`);
  }
  return problems;
}

/** Every shop's own pages, one at a time. A failure keeps the shop's last good pages and is listed, never fatal. */
async function publishAll({ publishShop, registry, auditLog, print, now, runId }, rows, version) {
  const done = [];
  const failed = [];
  for (const row of rows) {
    const at = now().toISOString();
    try {
      await publishShop(row, version);
      await registry.updateShop(row.shopId, { release: { version, at, runId } });
      await auditLog.write(row.shopId, `${at}-release-${runId}`, { kind: "release", version, runId, at, status: "pages-published" });
      done.push(row.shopId);
    } catch (publishError) {
      const error = message(publishError);
      print(`${row.shopId}: its pages weren't drawn again (${error}); its last good pages stay.`);
      await auditLog.write(row.shopId, `${at}-release-${runId}`, { kind: "release", version, runId, at, status: "pages-failed", error });
      failed.push({ shopId: row.shopId, error });
    }
  }
  return { done, failed };
}
