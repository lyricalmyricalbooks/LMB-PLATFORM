// Runs the self-checks for real: one shop, or every live shop (the daily sweep). Problems go to the repair queue in
// the platform project; a drifted /shop-profile.js is rewritten and the shop's pages deployed again at their release.
//
//   RELEASE_BUILD_ROOT=/var/lmb/builds node control-room/self-check.js [<shop id>]
//
// It needs the platform's real clients and a person (or the platform's scheduler) running it: the token comes from
// `gcloud auth print-access-token`. Nothing in the tests runs it for real.
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSelfChecks } from "./selfChecks.js";
import { createRepairQueue } from "./repairs.js";
import { profilePublisher } from "./controlRoom.js";

/** Runs with the clients given; refuses with none, so nothing pretends to have checked a shop. */
export async function selfCheckCommand({ argv = [], clients, print = console.log }) {
  if (!clients?.registry || !clients.deploy || !clients.profileFiles || !clients.repairStore || !clients.auditLog) {
    throw new Error("The self-checks need the platform's real clients. Nothing was checked.");
  }
  const repairs = createRepairQueue({ store: clients.repairStore, registry: clients.registry, auditLog: clients.auditLog });
  const publish = profilePublisher({ deploy: clients.deploy, registry: clients.registry, build: clients.build });
  const checks = createSelfChecks({ registry: clients.registry, profileFiles: clients.profileFiles, deploy: clients.deploy, publish, repairs, google: clients.google });
  const [shopId] = argv;
  const results = shopId ? [await checks.check(shopId, { why: "command line" })] : await checks.sweep();
  for (const result of results) {
    const failing = result.results.filter((r) => !r.ok).map((r) => `${r.check}: ${r.problem}`);
    const fixed = result.results.filter((r) => r.fixed).map((r) => `${r.check}: ${r.fixed}`);
    print(`${result.shopId}: ${result.skipped ?? result.error ?? (result.ok ? "ok" : "problems")}`);
    for (const line of [...fixed.map((f) => `  fixed ${f}`), ...failing.map((f) => `  to the repair queue: ${f}`)]) print(line);
  }
  return results;
}

async function realClients(env) {
  if (!env.RELEASE_BUILD_ROOT) throw new Error("RELEASE_BUILD_ROOT is not set (the folder releases are built in).");
  const [{ realSetupClients, PLATFORM_PROJECT }, { gcloudToken }, { releaseBuilder }, { commandRunner }, { firestoreClient }, { firestoreRepairs }] = await Promise.all([
    import("../setup/real.js"), import("../release-check/run.js"), import("../services/release-runner/builder.js"),
    import("../services/release-runner/run.js"), import("../clients/firestore.js"), import("../clients/stores.js"),
  ]);
  const run = commandRunner();
  const builder = releaseBuilder({ run, root: env.RELEASE_BUILD_ROOT, source: fileURLToPath(new URL("..", import.meta.url)) });
  const clients = realSetupClients({ fetch: globalThis.fetch, token: gcloudToken, run, buildDir: builder.dir });
  const platform = firestoreClient({ fetch: globalThis.fetch, token: gcloudToken, projectId: PLATFORM_PROJECT });
  return { ...clients, repairStore: firestoreRepairs(platform), build: (version) => builder.build(version) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await selfCheckCommand({ argv: process.argv.slice(2), clients: await realClients(process.env) });
    process.exitCode = results.every((r) => r.ok) ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
