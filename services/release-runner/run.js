// Runs a release for real. Needs Julian's go-ahead and the platform project (docs/test-shop.md, "Running it for real");
// nothing in the platform's tests runs it, and it never runs by itself.
//
//   RELEASE_FOLDER=folders/<shops folder number> RELEASE_BUILD_ROOT=/var/lmb/builds \
//   RELEASE_INBOX=… PLATFORM_SERVICE_ACCOUNT=… node services/release-runner/run.js <version> [--dry-run]
//
// The version is the git tag `release-<version>` of this repo. The token comes from `gcloud auth print-access-token`;
// the Firebase command line uses the same signed-in account. No key is read from a file.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { gcloudToken, realRun as realReleaseCheck } from "../../release-check/run.js";
import { realSetupClients } from "../../setup/real.js";
import { releaseBuilder } from "./builder.js";
import { runRelease } from "./runner.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A command runner that prints what it runs and fails on a non-zero exit. */
export function commandRunner({ print = console.log } = {}) {
  return async (command, args, { cwd, env } = {}) => {
    print(`$ ${command} ${args.join(" ")}  (in ${cwd})`);
    await promisify(execFile)(command, args, { cwd, env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  };
}

export async function realRelease({ version, dryRun = false, env = process.env, fetch = globalThis.fetch, token = gcloudToken, run = commandRunner(), chromium, print = console.log }) {
  for (const name of ["RELEASE_FOLDER", "RELEASE_BUILD_ROOT"]) if (!env[name]) throw new Error(`${name} is not set`);
  const builder = releaseBuilder({ run, root: env.RELEASE_BUILD_ROOT, source: REPO });
  const clients = realSetupClients({ fetch, token, run, buildDir: builder.dir });
  return runRelease({
    version, dryRun, print, builder,
    registry: clients.registry, auditLog: clients.auditLog, deploy: clients.deploy, envFiles: clients.envFiles,
    profileFiles: clients.profileFiles, siteCheck: clients.siteCheck, projects: clients.google.projects,
    releaseCheck: (shopId, v) => realReleaseCheck({ shopId, env: { ...env, RELEASE_VERSION: v }, fetch, token, chromium, print }),
    config: { folder: env.RELEASE_FOLDER, exclude: (env.RELEASE_HOLD_BACK ?? "").split(",").filter(Boolean) },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, flag] = process.argv.slice(2);
  const dryRun = flag === "--dry-run";
  const chromium = dryRun ? undefined : createRequire(import.meta.url)("playwright").chromium;
  const result = await realRelease({ version, dryRun, chromium });
  process.exitCode = result.ok ? 0 : 1;
}
