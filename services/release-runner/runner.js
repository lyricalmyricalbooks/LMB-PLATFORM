// The release runner (plan 4.1): build a release once, then send it ring by ring, the test shop first and every other
// platform shop after, stopping at the first shop whose check fails and putting that shop back on its previous
// release.
//
//   runRelease({ version, registry, auditLog, builder, deploy, envFiles, profileFiles, siteCheck, projects,
//                releaseCheck, config: { folder, exclude }, dryRun, print })
//
// - `builder.build(version)` builds the shop and stockroom once, into the folder `deploy` reads (builder.js). A build
//   that fails stops the release before anything is deployed. A rollback builds the previous release the same way;
//   a build already made is reused.
// - `deploy` is clients/deploy.js; `envFiles` / `profileFiles` the per-shop files the shop maker saved (steps 6 and 8);
//   `siteCheck` the page check (clients/shop.js); `projects.get(id)` reads a Google Cloud project (clients/google.js).
// - `releaseCheck(shopId, version)` runs the release check (release-check/runner.js) on the test shop and resolves to
//   `{ ok, error? }`. Every other shop gets the page check and the release stamps.
//
// What a failure does: the shop that failed goes back to the release it had before (its registry row's
// `release.version`, else the stamp read from its live rules before the deploy), is checked again, and the release
// stops. Shops later in the order are not touched; shops earlier in ring 2 passed their checks and keep the new
// release. A shop with no earlier release to go back to stops the run for a person. Data changes (plan 4.2) must keep
// working with the previous release's code, so a rollback never has to undo one.
//
// Safe to re-run: a shop already on this release, with its stamps and check in order, is checked and left alone.
// One release runs at a time (a registry lock), and each shop's own lock is held while it is deployed, so the shop
// maker can't work on it at the same moment. Everything is recorded: the whole run in the registry
// (`recordRelease`), each shop's part in its audit log, and the shop's row gets `release: { version, at }`.
import { randomUUID } from "node:crypto";
import { appsOf } from "../../setup/later-steps.js";
import { REGION } from "../../setup/steps.js";
import { planRings } from "./rings.js";

export const RELEASE_LOCK = "_release-runner";
export const LOCK_MINUTES = 120;
const VERSION = /^\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/;

const message = (error) => (error instanceof Error ? error.message : String(error));

export async function runRelease({
  version, registry, auditLog, builder, deploy, envFiles, profileFiles, siteCheck, projects, releaseCheck,
  config = {}, dryRun = false, print = () => {}, now = () => new Date(), runId = randomUUID(), lockMinutes = LOCK_MINUTES,
}) {
  if (!VERSION.test(version ?? "")) throw new Error(`"${version}" isn't a release version (like 1.4.0)`);
  if (!config.folder) throw new Error("the release runner needs the shops folder, to make sure every shop it touches is the platform's");

  const plan = planRings(await registry.listShops(), { exclude: config.exclude ?? [] });
  for (const { shopId, reason } of plan.skipped) print(`Left out ${shopId ?? "a row"}: ${reason}.`);
  if (plan.problem) {
    print(`Release ${version} can't start: ${plan.problem}.`);
    return { ok: false, version, error: plan.problem, shops: [] };
  }
  const order = plan.rings.flatMap((ring, index) => ring.map((row) => ({ row, ring: index + 1 })));
  print(`Release ${version}: ring 1 ${plan.rings[0].map((r) => r.shopId).join(", ")}; ring 2 ${plan.rings[1].length} shop(s).`);
  if (dryRun) {
    for (const { row, ring } of order) print(`  would send to ${row.shopId} (ring ${ring}, now on ${row.release?.version ?? "an unrecorded release"})`);
    return { ok: true, dryRun: true, version, rings: plan.rings.map((ring) => ring.map((row) => row.shopId)), shops: [] };
  }

  const lockFor = () => ({ runId, takenAt: now().toISOString(), expiresAt: new Date(now().getTime() + lockMinutes * 60_000).toISOString() });
  const lock = await registry.takeLock(RELEASE_LOCK, lockFor());
  if (!lock.taken) {
    print(`Another release (${lock.runId}) is running until ${lock.expiresAt}; this one stops.`);
    return { ok: false, version, locked: true, shops: [] };
  }

  const startedAt = now().toISOString();
  const shops = order.map(({ row, ring }) => ({ shopId: row.shopId, ring, status: "not-run" }));
  let error = null;
  try {
    try {
      await builder.build(version);
    } catch (buildError) {
      error = `the build of ${version} failed: ${message(buildError)}`;
      print(`${error}. Nothing was deployed.`);
      return { ok: false, version, error, shops };
    }

    const ctx = { registry, auditLog, builder, deploy, envFiles, profileFiles, siteCheck, projects, releaseCheck, config, print, now, runId, lockFor };
    for (const [index, { row }] of order.entries()) {
      // A long release must not lapse its own lock half-way.
      const renewed = await registry.takeLock(RELEASE_LOCK, lockFor());
      if (!renewed.taken) {
        error = "the release lock was taken over by another run";
        break;
      }
      const result = await releaseShop(ctx, row, version);
      Object.assign(shops[index], result);
      await record(ctx, row.shopId, version, result);
      if (result.status !== "shipped" && result.status !== "already-on") {
        error = `${row.shopId}: ${result.error}`;
        break;
      }
    }
    return { ok: !error, version, ...(error ? { error } : {}), shops };
  } finally {
    await registry.recordRelease({ kind: "release", version, runId, startedAt, finishedAt: now().toISOString(), ok: !error, ...(error ? { error } : {}), shops });
    await registry.releaseLock(RELEASE_LOCK, runId);
    print(error ? `Release ${version} stopped: ${error}.` : `Release ${version} reached every shop.`);
  }
}

/** One shop: deploy, check, and roll back on a failed check. Resolves to the shop's line in the release record. */
async function releaseShop(ctx, row, version) {
  const { registry, projects, config, print, runId, lockFor } = ctx;
  const shopId = row.shopId;
  const project = await projects.get(shopId);
  if (project?.parent !== config.folder) {
    return { status: "refused", error: `its project isn't in the platform's shops folder (${project?.parent ?? "no such project"}); nothing was deployed` };
  }
  const lock = await registry.takeLock(shopId, lockFor());
  if (!lock.taken) return { status: "busy", error: `the shop maker is working on it (run ${lock.runId}); nothing was deployed` };
  try {
    const previous = row.release?.version ?? usable((await ctx.deploy.deployed(shopId, "rules"))?.version);
    if (previous === version) {
      const problems = await checkShop(ctx, row, version);
      if (!problems.length) {
        print(`${shopId} is already on ${version}.`);
        return { status: "already-on", previous };
      }
    }
    try {
      await ship(ctx, row, version);
      const problems = await checkShop(ctx, row, version);
      if (!problems.length) {
        await registry.updateShop(shopId, { release: { version, at: ctx.now().toISOString(), runId } });
        print(`${shopId}: ${version} sent and checked.`);
        return { status: "shipped", previous: previous ?? null };
      }
      return rollBack(ctx, row, version, previous, problems.join("; "));
    } catch (error) {
      return rollBack(ctx, row, version, previous, `the deploy failed: ${message(error)}`);
    }
  } finally {
    await registry.releaseLock(shopId, runId);
  }
}

async function rollBack(ctx, row, version, previous, error) {
  const { print } = ctx;
  print(`${row.shopId}: ${error}.`);
  if (!previous || previous === version) {
    return { status: "failed", previous: previous ?? null, error: `${error}; there is no earlier release to go back to, so a person looks at it` };
  }
  try {
    await ctx.builder.build(previous);
    await ship(ctx, row, previous);
    const problems = await checkShop(ctx, row, previous);
    if (problems.length) throw new Error(problems.join("; "));
    print(`${row.shopId}: back on ${previous}.`);
    return { status: "rolled-back", previous, error };
  } catch (rollbackError) {
    return { status: "rollback-failed", previous, error: `${error}; going back to ${previous} failed too: ${message(rollbackError)}` };
  }
}

/** Rules, then server code, then pages: the order the shop's own deploy uses, so new pages never meet old rules. */
async function ship({ deploy, envFiles, profileFiles }, row, version) {
  const apps = appsOf(row);
  await deploy.rules(row.shopId, { version, apps });
  if (apps.includes("shop")) {
    const envFile = await envFiles.read(row.shopId);
    if (!envFile) throw new Error("its server settings file is missing from the registry (setup step 8)");
    await deploy.functions(row.shopId, { version, region: row.region ?? REGION, envFile });
  }
  for (const app of apps) {
    const profileScript = app === "shop" ? await profileFiles.read(row.shopId) : undefined;
    if (app === "shop" && !profileScript) throw new Error("its shop profile file is missing from the registry (setup step 6)");
    await deploy.pages(row.shopId, { version, app, profileScript });
  }
}

/** What is wrong with the shop on `version`, in plain words; empty when it passes. */
export async function checkShop({ deploy, siteCheck, releaseCheck }, row, version) {
  const apps = appsOf(row);
  const problems = [];
  const urls = {};
  for (const part of ["rules", ...(apps.includes("shop") ? ["functions"] : []), ...apps.map((app) => `pages:${app}`)]) {
    const live = await deploy.deployed(row.shopId, part);
    if (live?.version !== version) problems.push(`its ${part} are on ${live?.version ?? "nothing"}, not ${version}`);
    if (part.startsWith("pages:") && live?.url) urls[part.slice(6)] = live.url;
  }
  const pages = [];
  if (urls.shop) pages.push(urls.shop, `${urls.shop}/admin`, `${urls.shop}/shop-profile.js`);
  if (urls.stockroom) pages.push(urls.stockroom);
  for (const url of pages) {
    const { status, problems: found = [] } = await siteCheck.get(url);
    if (status !== 200 || found.length) problems.push(`${url} answered ${status}${found.length ? ` (${found.join("; ")})` : ""}`);
  }
  if (problems.length) return problems;
  if (row.testShop === true) {
    const result = await releaseCheck(row.shopId, version);
    if (!result?.ok) problems.push(`the release check failed: ${result?.error ?? "no result"}`);
  }
  return problems;
}

async function record({ auditLog, now, runId }, shopId, version, result) {
  const at = now().toISOString();
  await auditLog.write(shopId, `${at}-release-${runId}`, { kind: "release", version, runId, at, ...result });
}

const usable = (version) => (version && version !== "unknown" && !version.includes("+") ? version : undefined);
