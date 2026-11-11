// Runs the release check against the real test shop. Needs Julian's go-ahead and setup (docs/test-shop.md, "Running
// it for real"); nothing in the platform's tests runs this file.
//
//   RELEASE_INBOX=checks@yourpress.example [PLATFORM_SERVICE_ACCOUNT=<signer; default: the test project's Firebase admin account>] \
//     node release-check/run.js [shop id, default the test shop: setup/testShopPlace.js]
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
import { STOCKROOM_DATABASE } from "../clients/shop.js";
import { liveDatabaseUrl, sharedStores, shopPlaces } from "../clients/shared.js";
import { playwrightBrowser } from "./browser.js";
import { TEST_SHOP_ID } from "../setup/testShopPlace.js";
import { runReleaseCheck } from "./runner.js";
import { shopAdmin, shopReads, stockroomReads } from "./shop-clients.js";

export const PLATFORM_PROJECT = "lmb-platform-prod";

export async function gcloudToken() {
  const { stdout } = await promisify(execFile)("gcloud", ["auth", "print-access-token"]);
  return stdout.trim();
}

/**
 * Where the test shop's data and pages are. A shop in the shared system (`shared: true`) keeps its data in its folder
 * of the shared project and answers at its own address, its server learning the shop from `?shop=`
 * (clients/shared.js); a shop with a project of its own, as before.
 */
export function shopWhere({ row, profile, env = {}, fetch, token }) {
  const projectId = profile.firebase.projectId;
  if (row.shared === true) {
    const stores = sharedStores({ fetch, token, projectId, databaseUrl: liveDatabaseUrl(projectId, env) });
    const places = shopPlaces({ ...row, functionsRegion: profile.functionsRegion });
    if (!places.fn) throw new Error(`${row.shopId} has no usable functions region or project`);
    return {
      shopDb: stores.shopDb(row.shopId),
      stockroomDb: stores.stockroomDb(row.shopId),
      urls: { site: places.site, stockroom: env.RELEASE_STOCKROOM_URL || places.stockroom },
      functionUrl: places.fn,
    };
  }
  return {
    shopDb: firestoreClient({ fetch, token, projectId }),
    // The profile's `stockroom` block names the database (setup step 6); STOCKROOM_DATABASE for an older profile.
    stockroomDb: firestoreClient({ fetch, token, projectId, database: profile.stockroom?.firestoreDatabase || env.STOCKROOM_DATABASE || STOCKROOM_DATABASE }),
    urls: { site: profile.siteUrl, stockroom: env.RELEASE_STOCKROOM_URL || `https://${projectId}-stockroom.web.app` },
    functionUrl: (name) => `https://${profile.functionsRegion}-${projectId}.cloudfunctions.net/${name}`,
  };
}

/** Builds every real client for one run. `env` holds RELEASE_INBOX and the optional ones (PLATFORM_SERVICE_ACCOUNT among them). */
export async function realRun({ shopId, env = process.env, fetch = globalThis.fetch, token = gcloudToken, chromium, print = console.log }) {
  for (const name of ["RELEASE_INBOX"]) if (!env[name]) throw new Error(`${name} is not set`);
  const registry = firestoreRegistry(firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT }));
  const row = await registry.getShop(shopId);
  const profile = await registry.getProfile(shopId);
  if (!row || !profile) throw new Error(`the registry has no ${shopId} with a profile; set it up first (setup/)`);
  // Checked again by the runner; checked here too so no sign-in is made for any other shop.
  if (row.testShop !== true) throw new Error(`${shopId} is not the platform's test shop`);
  const session = await testOwnerSession({ identity: identityClient({ fetch, token }), shop: row, profile, serviceAccount: env.PLATFORM_SERVICE_ACCOUNT || undefined });
  // Which sign-in list the test owner is on: the stockroom and the admin accept a sign-in only from the shop's own list.
  print(`The test owner signs in on ${session.user.tenantId ? `the shop's list ${session.user.tenantId}` : "the project's own list (no shop list)"}; registry row: shared ${row.shared === true}, list ${row.tenant ?? "none"}.`);
  const where = shopWhere({ row, profile, env, fetch, token });
  const clients = {
    profile,
    session,
    urls: where.urls,
    browser: await playwrightBrowser({ chromium, launchOptions: { executablePath: env.CHROMIUM_PATH || undefined } }),
    shopData: shopReads(where.shopDb),
    stockroomData: stockroomReads(where.stockroomDb),
    shopAdmin: shopAdmin({ fetch, functionUrl: where.functionUrl, session }),
  };
  // The shop's audit log is in its own database: its folder, in the shared system.
  const auditLog = firestoreAuditLog(() => where.shopDb);
  return runReleaseCheck({ shopId, version: env.RELEASE_VERSION, registry, auditLog, clients, inbox: env.RELEASE_INBOX, print });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const result = await realRun({ shopId: process.argv[2] || TEST_SHOP_ID, chromium });
  process.exitCode = result.ok ? 0 : 1;
}
