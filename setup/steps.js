// Steps 1–6 of the shop maker (docs/shop-setup.md): registry, project, Firebase, services, database and storage, web app
// and profile. Each step only looks in `check` and only changes things in `act`; runner.js runs them.
//
// Google is reached only through the `google` clients passed in (shape below, in-memory copy in fakes.js). There is no
// real client in this folder yet, so nothing here can create a real project. Every "create" call resolves once Google's
// operation has finished.
//
//   google.projects     get(projectId) -> { projectId, state, parent } | null     create({ projectId, displayName, parent, labels })
//   google.billing      get(projectId) -> { billingEnabled, billingAccountName }   link(projectId, billingAccountName)
//   google.firebase     getProject(projectId) -> object | null                     addFirebase(projectId)
//                       listWebApps(projectId) -> [{ appId, displayName }]         createWebApp(projectId, displayName) -> { appId }
//                       getWebAppConfig(projectId, appId) -> { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }
//   google.services     listEnabled(projectId) -> [name]                           enable(projectId, [name])
//   google.firestore    getDatabase(projectId) -> { locationId } | null            createDatabase(projectId, { locationId, type, deleteProtection })
//   google.storage      getDefaultBucket(projectId) -> { name, location } | null   createDefaultBucket(projectId, { location })
//                       getBucket(projectId, name) -> { name, location, project } | null
//                       createBucket(projectId, { name, location })   a bucket in the project, added to Firebase
//   google.firestore    getDatabase(projectId, databaseId) and createDatabase(projectId, { databaseId, … }) for a named one
//   google.realtimeDatabase  getInstance(projectId) -> { name, location } | null   createInstance(projectId, { location })
//                            (the project's default instance, <project id>-default-rtdb)
//
// The registry (fakes.js has the shape) keeps the shop row and its profile; `profileFiles` keeps the per-shop
// /shop-profile.js that Hosting serves (read(shopId) -> text | null, write(shopId, text)).
import { isDeepStrictEqual } from "node:util";
import { profileProblems, profileScript } from "../profile/profile.js";
import { paymentProblems } from "./payments.js";
// The one name for the stockroom's database, shared with the real clients (clients/shop.js) and the release check.
import { STOCKROOM_DATABASE } from "../clients/shop.js";

export const REGION = "northamerica-northeast1";
export const WEB_APP_NAME = "Shop";

// The stockroom's own pieces inside a shop's project (plan 1.20, decided by Julian): a named Firestore database and a
// bucket of its own, each with its own rules (apps/stockroom/scripts/deployConfig.mjs), so nothing it stores shares the
// shop's rules. Its Realtime Database is the project's default instance: Realtime Database has no Montréal location,
// so it sits in us-central1, where the profile's default database address points.
export { STOCKROOM_DATABASE };
export const RTDB_LOCATION = "us-central1";
export const stockroomBucketName = (shopId) => `${shopId}-stockroom`;

/**
 * The Google services a shop needs. The first twelve are the list in docs/shop-setup.md; the next four are what the
 * shop's server code (2nd-generation functions) and the rules deploy need as well, and the last is the stockroom's.
 */
export const SERVICES = [
  "firestore.googleapis.com",
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
  "identitytoolkit.googleapis.com",
  "cloudfunctions.googleapis.com",
  "firebasehosting.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
  "eventarc.googleapis.com",
  "cloudscheduler.googleapis.com",
  "secretmanager.googleapis.com",
  "firebaseappcheck.googleapis.com",
  "iam.googleapis.com",
  "run.googleapis.com",
  "pubsub.googleapis.com",
  "firebaserules.googleapis.com",
  // The stockroom's Realtime Database.
  "firebasedatabase.googleapis.com",
];

export const PLANS = { shop: { shop: true, stockroom: false }, stockroom: { shop: false, stockroom: true }, both: { shop: true, stockroom: true } };

/** Problems with the sign-up details, in plain words. The shop id is also its Google Cloud project id. */
export function shopProblems(shop) {
  const problems = [];
  if (!shop || typeof shop !== "object") return ["the shop details are missing"];
  if (typeof shop.shopId !== "string" || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(shop.shopId)) {
    problems.push("the shop id must be 6 to 30 lowercase letters, digits or hyphens, start with a letter and not end with a hyphen");
  }
  if (typeof shop.pressName !== "string" || !shop.pressName.trim()) problems.push("the press name is missing");
  if (typeof shop.ownerEmail !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(shop.ownerEmail)) problems.push("the owner email is not an email address");
  if (!(shop.plan in PLANS)) problems.push("the plan must be shop, stockroom or both");
  if (typeof shop.country !== "string" || !/^[A-Z]{2}$/.test(shop.country)) problems.push("the country must be a two-letter code like CA");
  if (typeof shop.currency !== "string" || !/^[A-Z]{3}$/.test(shop.currency)) problems.push("the currency must be a three-letter code like CAD");
  if ("testMode" in shop && typeof shop.testMode !== "boolean") problems.push("test mode must be true or false");
  if ("testShop" in shop && typeof shop.testShop !== "boolean") problems.push("the test shop mark must be true or false");
  // The test shop's test purchases move its stock like real ones; it must never take real money.
  if (shop.testShop === true && shop.testMode !== true) problems.push("the test shop must take payments in test mode");
  problems.push(...paymentProblems(shop));
  return problems;
}

/** Google allows 4–30 letters, digits, spaces, hyphens, quotes and exclamation marks in a project's display name. */
export function projectDisplayName(shop) {
  const name = shop.pressName.replace(/[^A-Za-z0-9 '"!-]/g, "").replace(/\s+/g, " ").trim().slice(0, 30).trim();
  return name.length >= 4 ? name : shop.shopId;
}

// Features one press needed once (profile/shop-profile.schema.json `switches`). A new shop gets every one written down
// as off; a value already in the shop's saved profile is kept, so re-running setup never turns one back off.
export const SWITCHES = Object.freeze(["legacyStockroomSignIn", "githubPagesForwarding", "gmailReceiptFinder"]);

/** All the switches, off unless `saved` (the switches in the shop's saved profile) has them as true or false. */
export function shopSwitches(saved) {
  return Object.fromEntries(SWITCHES.map((name) => [name, typeof saved?.[name] === "boolean" ? saved[name] : false]));
}

/** The public shop profile for this shop, from its web app's settings and the switches it already has. */
export function shopProfile(shop, webAppConfig, region = REGION, savedSwitches = undefined) {
  const { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId } = webAppConfig;
  return {
    version: 1,
    shopId: shop.shopId,
    firebase: { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId },
    functionsRegion: region,
    siteUrl: `https://${projectId}.web.app`,
    apps: { ...PLANS[shop.plan] },
    // Where the stockroom keeps its data in this project (read by apps/stockroom/src/lib/shop-profile.js).
    ...(PLANS[shop.plan].stockroom ? { stockroom: { firestoreDatabase: STOCKROOM_DATABASE, storageBucket: stockroomBucketName(shop.shopId) } } : {}),
    switches: shopSwitches(savedSwitches),
  };
}

/**
 * Steps 1–6. `config.folder` is the `shops` folder (`folders/…`) and `config.billingAccount` the platform's billing
 * account (`billingAccounts/…`); both are passed in, never written here.
 */
export function firstSteps({ google, registry, profileFiles, config, now = () => new Date() }) {
  if (!config?.folder?.startsWith("folders/")) throw new Error("config.folder must be the shops folder, like folders/123");
  if (!config?.billingAccount?.startsWith("billingAccounts/")) throw new Error("config.billingAccount must be like billingAccounts/…");
  const region = config.region ?? REGION;
  const valid = (shop) => {
    const problems = shopProblems(shop);
    if (problems.length) throw new Error(`The shop details have problems: ${problems.join("; ")}`);
    return shop;
  };

  // The stockroom's own database, bucket and Realtime Database as they are now. One in the wrong place, or a bucket name
  // another project holds, stops the run for a person: none can be moved, and nothing is ever deleted here.
  const stockroomPieces = async (shop) => {
    const database = await google.firestore.getDatabase(shop.shopId, STOCKROOM_DATABASE);
    if (database && database.locationId !== region) throw new Error(`the stockroom database is in ${database.locationId}, not ${region}`);
    const name = stockroomBucketName(shop.shopId);
    const bucket = await google.storage.getBucket(shop.shopId, name);
    if (bucket && bucket.project !== shop.shopId) throw new Error(`the bucket name ${name} belongs to another project; a person picks the stockroom's bucket`);
    if (bucket && bucket.location?.toLowerCase() !== region) throw new Error(`the stockroom bucket is in ${bucket.location}, not ${region}`);
    const realtime = await google.realtimeDatabase.getInstance(shop.shopId);
    if (realtime && realtime.location !== RTDB_LOCATION) throw new Error(`the Realtime Database is in ${realtime.location}, not ${RTDB_LOCATION}, so the stockroom's database address would be wrong`);
    return { database, bucket, realtime };
  };

  // The web app's settings, or null when the web app isn't there yet.
  const webAppConfig = async (projectId) => {
    const app = (await google.firebase.listWebApps(projectId)).find((a) => a.displayName === WEB_APP_NAME);
    return app ? google.firebase.getWebAppConfig(projectId, app.appId) : null;
  };

  return [
    {
      number: 1,
      name: "Reserve the shop id in the registry",
      async check({ shop }) {
        const row = await registry.getShop(valid(shop).shopId);
        if (!row) return false;
        if (row.ownerEmail !== shop.ownerEmail) throw new Error(`the shop id ${shop.shopId} already belongs to another press`);
        return true;
      },
      async act({ shop }) {
        const { shopId, pressName, ownerEmail, plan, country, currency } = shop;
        // The test marks live in the registry, where only the platform can change them (docs/test-shop.md).
        await registry.createShop(shopId, {
          shopId, projectId: shopId, pressName, ownerEmail, plan, country, currency, region,
          testMode: shop.testMode === true, testShop: shop.testShop === true, status: "creating", createdAt: now().toISOString(),
        });
      },
    },
    {
      number: 2,
      name: "Create the Google Cloud project in the shops folder and link billing",
      async check({ shop }) {
        const project = await google.projects.get(shop.shopId);
        if (!project) return false;
        if (project.parent !== config.folder) throw new Error(`a project called ${shop.shopId} exists outside the shops folder; choose another shop id`);
        if (project.state === "DELETE_REQUESTED") {
          throw new Error(`the project ${shop.shopId} is marked for deletion; restore it in the Google Cloud console, or mark the shop abandoned and use another id`);
        }
        if (project.state !== "ACTIVE") return false;
        const billing = await google.billing.get(shop.shopId);
        return Boolean(billing?.billingEnabled && billing.billingAccountName === config.billingAccount);
      },
      async act({ shop }) {
        if (!(await google.projects.get(shop.shopId))) {
          await google.projects.create({ projectId: shop.shopId, displayName: projectDisplayName(shop), parent: config.folder, labels: { "lmb-shop": shop.shopId } });
        }
        const billing = await google.billing.get(shop.shopId);
        if (!(billing?.billingEnabled && billing.billingAccountName === config.billingAccount)) {
          await google.billing.link(shop.shopId, config.billingAccount);
        }
      },
    },
    {
      number: 3,
      name: "Add Firebase to the project",
      check: async ({ shop }) => Boolean(await google.firebase.getProject(shop.shopId)),
      act: ({ shop }) => google.firebase.addFirebase(shop.shopId),
    },
    {
      number: 4,
      name: "Turn on the services",
      async check({ shop }) {
        const enabled = new Set(await google.services.listEnabled(shop.shopId));
        return SERVICES.every((name) => enabled.has(name));
      },
      async act({ shop }) {
        const enabled = new Set(await google.services.listEnabled(shop.shopId));
        await google.services.enable(shop.shopId, SERVICES.filter((name) => !enabled.has(name)));
      },
    },
    {
      number: 5,
      name: `Create the database and the storage bucket in ${region}`,
      // The shop's (default) database and bucket; with the stockroom in the plan, also its own named database and
      // bucket in the same place, and the Realtime Database it uses (plan 1.20).
      async check({ shop }) {
        const database = await google.firestore.getDatabase(shop.shopId);
        const bucket = await google.storage.getDefaultBucket(shop.shopId);
        // A database or bucket can't be moved, so one in the wrong place needs a person, not a retry.
        if (database && database.locationId !== region) throw new Error(`the database is in ${database.locationId}, not ${region}`);
        if (bucket && bucket.location?.toLowerCase() !== region) throw new Error(`the storage bucket is in ${bucket.location}, not ${region}`);
        if (!PLANS[shop.plan]?.stockroom) return Boolean(database && bucket);
        const pieces = await stockroomPieces(shop);
        return Boolean(database && bucket && pieces.database && pieces.bucket && pieces.realtime);
      },
      async act({ shop }) {
        if (!(await google.firestore.getDatabase(shop.shopId))) {
          await google.firestore.createDatabase(shop.shopId, { locationId: region, type: "FIRESTORE_NATIVE", deleteProtection: true });
        }
        if (!(await google.storage.getDefaultBucket(shop.shopId))) {
          await google.storage.createDefaultBucket(shop.shopId, { location: region });
        }
        if (!PLANS[shop.plan]?.stockroom) return;
        const pieces = await stockroomPieces(shop);
        if (!pieces.database) {
          await google.firestore.createDatabase(shop.shopId, { databaseId: STOCKROOM_DATABASE, locationId: region, type: "FIRESTORE_NATIVE", deleteProtection: true });
        }
        if (!pieces.bucket) await google.storage.createBucket(shop.shopId, { name: stockroomBucketName(shop.shopId), location: region });
        if (!pieces.realtime) await google.realtimeDatabase.createInstance(shop.shopId, { location: RTDB_LOCATION });
      },
    },
    {
      number: 6,
      name: "Create the web app and write the shop profile",
      async check({ shop }) {
        const settings = await webAppConfig(shop.shopId);
        if (!settings) return false;
        const saved = await registry.getProfile(shop.shopId);
        const profile = shopProfile(shop, settings, region, saved?.switches);
        return isDeepStrictEqual(saved, profile) && (await profileFiles.read(shop.shopId)) === profileScript(profile);
      },
      async act({ shop }) {
        let settings = await webAppConfig(shop.shopId);
        if (!settings) {
          const { appId } = await google.firebase.createWebApp(shop.shopId, WEB_APP_NAME);
          settings = await google.firebase.getWebAppConfig(shop.shopId, appId);
        }
        const saved = await registry.getProfile(shop.shopId);
        const profile = shopProfile(shop, settings, region, saved?.switches);
        const problems = profileProblems(profile);
        if (problems.length) throw new Error(`the shop profile has problems: ${problems.join("; ")}`);
        await registry.saveProfile(shop.shopId, profile);
        await profileFiles.write(shop.shopId, profileScript(profile));
        // Kept in the registry and the shop's audit log with this step's entry (runner.js).
        return { detail: { switches: profile.switches } };
      },
    },
  ];
}
