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
// - `serviceAccount` signs the test owner in for the test shop's link steps (12 and 16); no other shop needs it.
import { deployClient } from "../clients/deploy.js";
import { firestoreClient } from "../clients/firestore.js";
import { googleClients } from "../clients/google.js";
import { identityClient, testOwnerSession } from "../clients/identity.js";
import { firestoreAuditLog, firestoreRegistry } from "../clients/registry.js";
import { STOCKROOM_DATABASE, inventoryLinkClient, registryFiles, shopDataClient, siteCheckClient, stockroomClient } from "../clients/shop.js";

export const PLATFORM_PROJECT = "lmb-platform-prod";

export function realSetupClients({ fetch, token, run, buildDir, registryFirestore, paymentService, emailService, serviceAccount, sleep, stockroomDatabase = STOCKROOM_DATABASE }) {
  const platform = registryFirestore ?? firestoreClient({ fetch, token, projectId: PLATFORM_PROJECT });
  const registry = firestoreRegistry(platform);
  const shopDb = (projectId) => firestoreClient({ fetch, token, projectId });
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
    deploy: deployClient({ fetch, token, run, buildDir, ownerEmailOf: async (projectId) => (await registry.getShop(projectId))?.ownerEmail }),
    envFiles: registryFiles(platform, "functions.env"),
    profileFiles: registryFiles(platform, "shop-profile.js"),
    shopData: shopDataClient(shopDb),
    stockroom: stockroomClient(stockroomDb),
    inventoryLink: inventoryLinkClient({ fetch, functionsBase, idToken: async (projectId) => (await session(projectId)).idToken }),
    siteCheck: siteCheckClient({ fetch }),
    providers: paymentService ? { stripe: paymentService } : {},
    email: emailService,
  };
}
