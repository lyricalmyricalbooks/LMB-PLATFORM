// Runs the release check against the real test shop. Needs Julian's go-ahead and setup (docs/test-shop.md, "Running
// it for real"); nothing in the platform's tests runs this file.
//
//   RELEASE_INBOX=checks@yourpress.example PLATFORM_SERVICE_ACCOUNT=<the platform's release-check service account> \
//     node release-check/run.js [shop id, default platform-test]
//
// The platform token comes from `gcloud auth print-access-token` (the person or job running it is signed in to
// gcloud as an account allowed on the platform project and the test shop's project). No key is read from a file.
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { firestoreClient } from "../clients/firestore.js";
import { identityClient, testOwnerSession } from "../clients/identity.js";
import { firestoreAuditLog, firestoreRegistry } from "../clients/registry.js";
import { playwrightBrowser } from "./browser.js";
import { runReleaseCheck } from "./runner.js";
import { shopAdmin, shopReads, stockroomReads } from "./shop-clients.js";

export const PLATFORM_PROJECT = "lmb-platform-prod";
// The stockroom's own named database in each shop's project (plan 1.20) when the profile doesn't name one (its
// `stockroom` block, written by setup step 6, is what the stockroom itself opens).
export const STOCKROOM_DATABASE = process.env.STOCKROOM_DATABASE || "stockroom";

export async function gcloudToken() {
  const { stdout } = await promisify(execFile)("gcloud", ["auth", "print-access-token"]);
  return stdout.trim();
}

/** Builds every real client for one run. `env` holds RELEASE_INBOX, PLATFORM_SERVICE_ACCOUNT and the optional ones. */
export async function realRun({ shopId, env = process.env, fetch = globalThis.fetch, token = gcloudToken, chromium, print = console.log }) {
  for (const name of ["RELEASE_INBOX", "PLATFORM_SERVICE_ACCOUNT"]) if (!env[name]) throw new Error(`${name} is not set`);
  const registry = firestoreRegistry(firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT }));
  const row = await registry.getShop(shopId);
  const profile = await registry.getProfile(shopId);
  if (!row || !profile) throw new Error(`the registry has no ${shopId} with a profile; set it up first (setup/)`);
  // Checked again by the runner; checked here too so no sign-in is made for any other shop.
  if (row.testShop !== true) throw new Error(`${shopId} is not the platform's test shop`);
  const projectId = profile.firebase.projectId;
  const session = await testOwnerSession({ identity: identityClient({ fetch, token }), shop: row, profile, serviceAccount: env.PLATFORM_SERVICE_ACCOUNT });
  const shopDb = firestoreClient({ fetch, token, projectId });
  const clients = {
    profile,
    session,
    urls: { site: profile.siteUrl, stockroom: env.RELEASE_STOCKROOM_URL || `https://${projectId}-stockroom.web.app` },
    browser: await playwrightBrowser({ chromium, launchOptions: { executablePath: env.CHROMIUM_PATH || undefined } }),
    shopData: shopReads(shopDb),
    stockroomData: stockroomReads(firestoreClient({ fetch, token, projectId, database: profile.stockroom?.firestoreDatabase || STOCKROOM_DATABASE })),
    shopAdmin: shopAdmin({ fetch, functionsBase: `https://${profile.functionsRegion}-${projectId}.cloudfunctions.net`, session }),
  };
  const auditLog = firestoreAuditLog(() => shopDb);
  return runReleaseCheck({ shopId, version: env.RELEASE_VERSION, registry, auditLog, clients, inbox: env.RELEASE_INBOX, print });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const result = await realRun({ shopId: process.argv[2] || "platform-test", chromium });
  process.exitCode = result.ok ? 0 : 1;
}
