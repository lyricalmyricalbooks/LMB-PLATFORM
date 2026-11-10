// The shop maker's real clients, in one place: what `shopSteps` (later-steps.js) gets instead of the fakes. Each one
// lives in clients/ and is tested there with a fake `fetch`; this file only wires them together. Nothing here runs by
// itself and nothing here holds a key.
//
//   const clients = realSetupClients({ fetch, token, run, buildDir, registryFirestore, paymentService, emailService,
//                                       serviceAccount });
//   runSteps({ shop, steps: shopSteps({ ...clients, config }), registry: clients.registry, auditLog: clients.auditLog });
//
// - `token()` is the platform's OAuth access token (the shop maker's account: Project Creator in the shops folder,
//   Billing Account User, and owner of the projects it makes).
// - `run(command, args, { cwd })` runs the Firebase command line for deploys (clients/deploy.js); `buildDir(version)`
//   is the folder the release was built in (services/release-runner).
// - `paymentService` and `emailService` are the platform's own services (services/payments, services/email): they
//   already answer `findAccount`/`createAccount` and `wasSent`/`send`, the shapes steps 13 and 14 call.
// - `stagedFiles` is the store of product files kept in setup (signup/frontDoor.js). Without it, step 20 stops for a
//   person on any shop whose press kept a file, so the file is never left behind by a step marked done.
// - `serviceAccount` signs the test owner in for the test shop's link steps (12 and 16); no other shop needs it.
import { deployClient } from "../clients/deploy.js";
import { firestoreClient } from "../clients/firestore.js";
import { googleClients } from "../clients/google.js";
import { identityClient, testOwnerSession } from "../clients/identity.js";
import { firestoreAuditLog, firestoreRegistry } from "../clients/registry.js";
import { firestoreFrontDoorStores } from "../clients/platformStores.js";
import { STOCKROOM_DATABASE, inventoryLinkClient, registryFiles, shopDataClient, siteCheckClient, stockroomClient } from "../clients/shop.js";
import { liveDatabaseUrl, sharedStores } from "../clients/shared.js";
import { REGION } from "./steps.js";
import { TEST_STARTER_CONTENT } from "./test-shop.js";
import { LINK_DOC } from "./later-steps.js";
import { runSteps } from "./runner.js";
import { SHARED_STEP_PLAN, sharedShopSteps } from "./sharedSteps.js";
import { sharedServiceKeyHash } from "./serviceKey.js";

export const PLATFORM_PROJECT = "lmb-platform-prod";

export function realSetupClients({ fetch, token, run, buildDir, registryFirestore, paymentService, emailService, serviceAccount, sleep, stockroomDatabase = STOCKROOM_DATABASE, stagedFiles = null }) {
  const platform = registryFirestore ?? firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT });
  const registry = firestoreRegistry(platform);
  const shopDb = (projectId) => firestoreClient({ fetch, token, projectId });
  const profileFiles = registryFiles(platform, "shop-profile.js");
  const stockroomDb = (projectId) => firestoreClient({ fetch, token, projectId, database: stockroomDatabase });

  // The test owner's sign-in, made once per run and only for the test shop (testOwnerSession refuses any other).
  const identity = identityClient({ fetch, token });
  const sessions = new Map();
  const session = async (projectId) => {
    if (!sessions.has(projectId)) {
      if (!serviceAccount) throw new Error("the test shop's link steps need the platform's service account");
      sessions.set(projectId, testOwnerSession({ identity, shop: await registry.getShop(projectId), profile: await registry.getProfile(projectId), serviceAccount }));
    }
    return sessions.get(projectId);
  };
  const functionsBase = async (projectId) => {
    const profile = await registry.getProfile(projectId);
    if (!profile?.functionsRegion) throw new Error(`${projectId} has no saved profile yet (step 6)`);
    return `https://${profile.functionsRegion}-${projectId}.cloudfunctions.net`;
  };

  return {
    registry,
    auditLog: firestoreAuditLog(shopDb),
    google: googleClients({ fetch, token, sleep }),
    deploy: deployClient({ fetch, token, run, buildDir, ownerEmailOf: async (projectId) => (await registry.getShop(projectId))?.ownerEmail, profileScriptOf: (projectId) => profileFiles.read(projectId) }),
    envFiles: registryFiles(platform, "functions.env"),
    profileFiles,
    shopData: shopDataClient(shopDb),
    stockroom: stockroomClient(stockroomDb),
    inventoryLink: inventoryLinkClient({ fetch, functionsBase, idToken: async (projectId) => (await session(projectId)).idToken }),
    siteCheck: siteCheckClient({ fetch }),
    providers: paymentService ? { stripe: paymentService } : {},
    email: emailService,
    // Step 20 (setup/handover.js): the press's setup record, and the kept product files once their store is connected.
    presses: firestoreFrontDoorStores(platform).presses,
    stagedFiles,
  };
}

/**
 * The shared system's shop maker clients (setup/sharedSteps.js): every shop's data, record and address in one shared
 * project (`projectId`), reached through its folder (clients/shared.js); the registry in the platform project as above.
 * The shop's own server calls go to the shared server with `?shop=<id>`.
 */
export function realSharedClients({ fetch, token, projectId, env = {}, region = REGION, registryFirestore, paymentService, emailService, serviceAccount, sleep, stagedFiles = null }) {
  const platform = registryFirestore ?? firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT });
  const registry = firestoreRegistry(platform);
  const shared = sharedStores({ fetch, token, projectId, databaseUrl: liveDatabaseUrl(projectId, env) });
  const identity = identityClient({ fetch, token });
  const sessions = new Map();
  const session = async (shopId) => {
    if (!sessions.has(shopId)) {
      if (!serviceAccount) throw new Error("the test shop's link steps need the platform's service account");
      sessions.set(shopId, testOwnerSession({ identity, shop: await registry.getShop(shopId), profile: await registry.getProfile(shopId), serviceAccount }));
    }
    return sessions.get(shopId);
  };
  return {
    registry,
    shared,
    auditLog: firestoreAuditLog(shared.shopDb),
    google: googleClients({ fetch, token, sleep }),
    shopData: shopDataClient(shared.shopDb),
    stockroom: stockroomClient(shared.stockroomDb),
    inventoryLink: sharedInventoryLink({
      registry,
      throughShop: inventoryLinkClient({
        fetch, idToken: async (shopId) => (await session(shopId)).idToken,
        functionUrl: async (shopId, name) => `https://${region}-${projectId}.cloudfunctions.net/${name}?shop=${encodeURIComponent(shopId)}`,
      }),
      inFolder: folderInventoryLink({ shopData: shopDataClient(shared.shopDb), stockroomRecords: shared.stockroomRecords }),
    }),
    siteCheck: siteCheckClient({ fetch }),
    providers: paymentService ? { stripe: paymentService } : {},
    email: emailService,
    presses: firestoreFrontDoorStores(platform).presses,
    stagedFiles,
  };
}

/**
 * The shared shop maker's config: the shared project's web app (made once, named like every shop's was) and the
 * platform's own addresses. `shopDomain` is the shops' domain (free addresses are <id>.<shopDomain>).
 */
export async function sharedMakerConfig({ google, projectId, shopDomain, platformUrl, senderEmail, stripePublishableKeys = { live: "", test: "" }, version }) {
  const app = (await google.firebase.listWebApps(projectId)).find((a) => a.displayName === "Shop");
  if (!app) throw new Error(`${projectId} has no web app called Shop yet; make it once in the Firebase console`);
  return {
    sharedProject: projectId,
    webApp: await google.firebase.getWebAppConfig(projectId, app.appId),
    serviceKeyHash: await sharedServiceKeyHash(google, projectId),
    shopDomain,
    stockroomBucket: `${projectId}-stockroom`,
    senderEmail,
    paymentsServiceUrl: `${platformUrl}/api/payments`,
    platformEmailUrl: `${platformUrl}/api/email/shop`,
    stripePublishableKeys,
    release: { version, starterContent: TEST_STARTER_CONTENT },
  };
}

/**
 * The stockroom link for a shop the shared shop maker makes. The test shop's goes through its own admin calls, signed
 * in as its test owner (its starter catalogue is linked book by book and checked by the shop). Any other shop has no
 * one signed in yet, and its shop and stockroom sit in the same project, so the platform turns the link on in the
 * shop's folder: `folderInventoryLink`.
 */
export function sharedInventoryLink({ registry, throughShop, inFolder }) {
  const pick = async (shopId) => ((await registry.getShop(shopId))?.testShop === true ? throughShop : inFolder);
  return Object.fromEntries(["state", "check", "saveLinks", "startSales"].map((name) => [name, async (shopId, ...args) => (await pick(shopId))[name](shopId, ...args)]));
}

/**
 * The link written straight into a new shop's folder (`shops/<id>/systemStatus/inventoryLink`), as the shop's own
 * `startSales` writes it. `check` asks whether the stockroom knows the shop (its record copy, step 4); the shop's own
 * scheduled link job checks the connection itself and shows the owner any problem. Only a start day is ever written,
 * and never over one already there: links between books are the press's to make.
 */
export function folderInventoryLink({ shopData, stockroomRecords, now = () => new Date() }) {
  return {
    state: (shopId) => shopData.get(shopId, LINK_DOC),
    async check(shopId) {
      return (await stockroomRecords.get(shopId)) ? { ok: true } : { ok: false, problem: "the stockroom has no record of this shop yet" };
    },
    async saveLinks() {
      throw new Error("a new shop's book links are made by the press in its admin");
    },
    async startSales(shopId, { startDay }) {
      if ((await shopData.get(shopId, LINK_DOC))?.startDay) return;
      const data = { startDay, backfill: { from: startDay, done: false, cursor: null, sent: 0 }, salesStartedAt: now().toISOString(), salesStartedBy: "Colophon (shop made)" };
      await shopData.set(shopId, LINK_DOC, data, { fields: Object.keys(data) });
    },
  };
}

/**
 * The hosted server's shop maker for the shared system (server/world.js): the `run` createShopMaker calls, or null
 * while `SHARED_SHOPS_PROJECT` and `SHARED_SHOPS_DOMAIN` aren't set (making shops then stays "not switched on").
 * The maker's settings (the shared project's web app) are read once, on the first shop, and again after a failure.
 */
export function sharedShopRun({ env = {}, fetch, token, payments = null, email = null, settings = {}, registryFirestore, stagedFiles = null, sleep, version = "1.0.0" }) {
  const projectId = String(env.SHARED_SHOPS_PROJECT ?? "").trim();
  const shopDomain = String(env.SHARED_SHOPS_DOMAIN ?? "").trim();
  if (!projectId || !shopDomain) return null;
  const clients = realSharedClients({
    fetch, token, projectId, env, registryFirestore, sleep, stagedFiles,
    paymentService: payments, emailService: email, serviceAccount: env.PLATFORM_SERVICE_ACCOUNT || undefined,
  });
  let config = null;
  const configNow = () => {
    config ??= sharedMakerConfig({ google: clients.google, projectId, shopDomain, platformUrl: settings.platformUrl, senderEmail: settings.senderEmail, version })
      .catch((error) => { config = null; throw error; });
    return config;
  };
  return async (shop, options = {}) => runSteps({
    shop, steps: sharedShopSteps({ ...clients, config: await configNow() }), registry: clients.registry, auditLog: clients.auditLog, ...options,
  });
}

export { SHARED_STEP_PLAN };
