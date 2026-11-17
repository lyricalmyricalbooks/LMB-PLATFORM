// Runs the page refresh for real (pageRefresh.js): every 15 minutes from .github/workflows/shop-pages.yml, and by hand.
//
//   SHARED_SHOPS_TEST_PROJECT=lmb-test-shop SHARED_SHOPS_PROJECT=<live shared project> RELEASE_BUILD_ROOT=/tmp/builds \
//   node services/release-runner/run-page-refresh.js [--list]
//
// `--list` changes nothing: it says which shops would be drawn again, and with GITHUB_OUTPUT set writes `count=<n>`,
// so the workflow only sets up the build tools when a shop changed. The token comes from `gcloud auth
// print-access-token`. Only shops' own published files are written (their site folders); nothing else changes.
import { appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gcloudToken } from "../../release-check/run.js";
import { PLATFORM_PROJECT } from "../../setup/real.js";
import { CATALOGUE_FILE, buildAndPublish, siteFolder } from "../../setup/shopSite.js";
import { firestoreClient } from "../../clients/firestore.js";
import { googleClients } from "../../clients/google.js";
import { firestoreRegistry } from "../../clients/registry.js";
import { liveDatabaseUrl, sharedStores } from "../../clients/shared.js";
import { releaseBuilder } from "./builder.js";
import { commandRunner } from "./run.js";
import { sharedProjects } from "./run-shared.js";
import { refreshShopPages } from "./pageRefresh.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** What the run did, in plain words, for the run's summary page on GitHub. */
export function refreshSummary(result, { listOnly = false } = {}) {
  const lines = [];
  if (!result?.stale?.length && !result?.failed?.length) return `No shop changed its catalogue since its pages were drawn (${result?.checked ?? 0} looked at).\n`;
  if (listOnly) lines.push(`${result.stale.length} shop(s) changed since their pages were drawn: ${result.stale.map((s) => s.shopId).join(", ")}.`);
  if (result.drawn?.length) lines.push(`Drawn again: ${result.drawn.join(", ")}.`);
  if (result.later?.length) lines.push(`Waiting for the next run: ${result.later.join(", ")}.`);
  for (const f of result.failed ?? []) lines.push(`${f.shopId} keeps its last good pages: ${f.error}`);
  return lines.join("\n\n") + "\n";
}

export async function realPageRefresh({ listOnly = false, env = process.env, fetch = globalThis.fetch, token = gcloudToken, run = commandRunner(), print = console.log }) {
  if (!listOnly && !env.RELEASE_BUILD_ROOT) throw new Error("RELEASE_BUILD_ROOT is not set");
  const registry = firestoreRegistry(firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT }));
  const google = googleClients({ fetch, token });
  const stores = new Map();
  const storesOf = (projectId) => {
    if (!stores.has(projectId)) stores.set(projectId, sharedStores({ fetch, token, projectId, databaseUrl: liveDatabaseUrl(projectId, env) }));
    return stores.get(projectId);
  };
  const builder = listOnly ? null : releaseBuilder({ run, root: env.RELEASE_BUILD_ROOT, source: REPO });
  return refreshShopPages({
    registry, listOnly, print,
    projectIds: sharedProjects(env).map((p) => p.projectId),
    readMarker: async (row) => (await storesOf(row.projectId).shopDb(row.shopId).get("settings/catalogVersion"))?.changedAt ?? null,
    readLabels: (row) => google.siteFiles.labels(row.projectId, siteFolder(row.shopId), CATALOGUE_FILE),
    async publishShop(row, version) {
      const record = await storesOf(row.projectId).records.get(row.shopId);
      if (!record) throw new Error("its record is missing from the shared project");
      // Built once per version: a finished build is kept and reused (builder.js).
      await builder.build(version);
      await buildAndPublish({
        shop: { id: row.shopId, record, tenant: record.tenant }, siteFiles: google.siteFiles, projectId: row.projectId,
        appDir: join(builder.dir(version), "apps", "shop"), print,
      });
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const listOnly = process.argv.slice(2).includes("--list");
  const result = await realPageRefresh({ listOnly }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
  } else {
    if (listOnly && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `count=${result.stale.length}\n`);
    // A shop whose pages fail keeps its last good ones and is tried again next run, as in a release: listed, not red.
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, refreshSummary(result, { listOnly }));
  }
}
