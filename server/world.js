// The platform put together for real: the same pieces and the same web door as walkthrough/world.js, route for route,
// with the platform project's Firestore, Google's sign-in check, Stripe in test mode and Resend in place of the
// pretend ones. `server/world.test.js` fails when a route of the practice door is missing here, so the two can't drift.
//
//   const world = hostedWorld({ env: process.env, fetch, token });
//   world.handle(request) -> answer            every address the server answers (server/http.js shapes)
//   world.door                                  the web door alone (signup/api.js createApi)
//   world.routes                                the door's signed-in routes, by "METHOD /path"
//   world.jobs                                  the jobs runner and run log (services/jobs)
//
// Nothing reaches the network while it is built: every client calls out only when asked. Built from:
//
//   PLATFORM_PROJECT            the platform's Google project (default lmb-platform-prod)
//   PLATFORM_ADMIN_EMAILS       who may open the control room (controlRoom.js); PLATFORM_ADMIN_EMAIL,
//                               PLATFORM_BACKUP_PERSON, PLATFORM_PRIVACY_CONTACT as control-room/people.js reads them
//   HEALTH_ALERT_TO             where a late job or a failed health check is emailed
//   the keys                    the email sender's key, the platform's Stripe test key and the two Stripe events
//                               addresses' signing secrets: each read only by its own service (services/email,
//                               services/payments, services/billing), which also names it for the deploy
//   TRIAL_TIPS_SECRET, CHECKUP_SECRET   signing phrases for the emails' "turn off" links (16+ characters each)
//   LIMIT_PROXY_HOPS            how many of our own proxies add to x-forwarded-for (signup/limits.js proxyHops)
//   BILLING_MODE                "test" (the default). The hosted server refuses "live", and live Stripe settings
//                               (services/payments refuseLiveKeys), until Julian's go: every charge stays a test charge.
//   and the platform settings services/settings.js reads (PLATFORM_URL, SIGNUP_OPEN, prices…).
//
// Besides the door it answers the addresses that aren't signed-in calls:
//
//   POST /api/billing/events     Stripe's events for the platform's own account (billing.handleEvent; raw body)
//   *    /api/payments/...       the payment service's doors (services/payments/http.js: /shop, /stripe/events, Square)
//   POST /api/email/shop         a shop sending an email through the platform (services/email/http.js)
//   GET  /tips/off, /checkup/off the emails' "turn off" pages
//
// What can't be real yet answers plainly that it isn't switched on (server/notConnected.js; listed in README.md).
import { accountRoutes } from "../accounts/routes.js";
import { billingRoutes } from "../accounts/billingRoutes.js";
import { createAccounts } from "../accounts/accounts.js";
import { controlRoutes } from "../control-room/routes.js";
import { controlRoomAdmins, createControlRoom, profilePublisher } from "../control-room/controlRoom.js";
import { createPlatformControls, platformRoutes } from "../control-room/platformControls.js";
import { createBackupAccess, emergencyRoutes } from "../control-room/backupPerson.js";
import { createBreachRegister } from "../control-room/breaches.js";
import { runBook } from "../control-room/runbook.js";
import { controlRoomPeople } from "../control-room/people.js";
import { createInvites } from "../waitlist/invites.js";
import { readGoogleConfig } from "../google/config.js";
import { googleReadiness } from "../google/readiness.js";
import { createSupportInbox } from "../services/support/inbox.js";
import { supportRoutes } from "../services/support/routes.js";
import { createRecovery, recoveryByHand } from "../accounts/recovery.js";
import { recoveryRoutes } from "../accounts/recoveryRoutes.js";
import { deviceWatch } from "../accounts/devices.js";
import { createRepairQueue } from "../control-room/repairs.js";
import { createApi } from "../signup/api.js";
import { createShopMaker } from "../signup/shopMaker.js";
import { createSignup } from "../signup/signup.js";
import { createBillingFromEnv, readBillingConfig } from "../services/billing/index.js";
import { createPaymentWay } from "../services/billing/paymentWay.js";
import { shopPlanCopies } from "../services/billing/shopPlan.js";
import { createClosingSweep } from "../services/billing/closing.js";
import { createPaymentsFromEnv, handlePayments, platformBillingStripe, refuseLiveKeys } from "../services/payments/index.js";
import { createEmailService } from "../services/email/index.js";
import { handleShopEmail } from "../services/email/http.js";
import { liveSettings, platformSettings } from "../services/settings.js";
import { createLimits } from "../signup/limits.js";
import { createAccessRequests } from "../control-room/accessRequests.js";
import { accessRequestRoutes } from "../accounts/accessRequestRoutes.js";
import { businessRoutes, createBusinessRoom } from "../control-room/business.js";
import { createTimeline, timelineRoutes } from "../control-room/timeline.js";
import { createJobsPage, jobsRoutes } from "../control-room/jobs.js";
import { createShopNotes, notesRoutes } from "../control-room/notes.js";
import { deliveryReader } from "../control-room/delivery.js";
import { createJobs } from "../services/jobs/index.js";
import { createPressMessages, messageRoutes } from "../control-room/messages.js";
import { costRoutes, createCostsDesk } from "../control-room/costs.js";
import { createCostReader } from "../services/costs/costs.js";
import { createDataExports, exportRoutes } from "../services/export/export.js";
import { createTrialTips } from "../services/trial-tips/index.js";
import { createCheckups, makeInspector } from "../services/checkup/index.js";
import { firestoreClient } from "../clients/firestore.js";
import { firestoreAuditLog, firestoreRegistry } from "../clients/registry.js";
import { STOCKROOM_DATABASE, registryFiles, shopDataClient, stockroomDataClient } from "../clients/shop.js";
import {
  firestoreAccounts, firestoreActivity, firestoreBreaches, firestoreDeliveryStats, firestoreDevices, firestoreIncomeHistory, firestoreInvites,
  firestoreJobRuns, firestorePlatformState, firestoreRecoveries, firestoreRepairs, firestoreSentLog, firestoreShopNotes, firestoreSupport, firestoreWaitlist,
} from "../clients/stores.js";
import {
  firestoreAccessRequests, firestoreAccountStores, firestoreBillingStores, firestoreDataExports, firestoreFeeLedger, firestorePressMessages,
  firestoreFrontDoorStores, firestoreShopRecords, firestoreSignupStores, firestoreThrottle,
} from "../clients/platformStores.js";
import { createFrontDoor, frontDoorPublicRoutes, frontDoorRoutes } from "../signup/frontDoor.js";
import { signInLinks } from "../clients/signInLinks.js";
import { createIdTokenVerifier } from "./verifyIdToken.js";
import { NOT_CONNECTED, notConnectedClient, notConnectedFn, notConnectedPage } from "./notConnected.js";

export const DEFAULT_PROJECT = "lmb-platform-prod";

/** The test-mode-only rule, checked before anything is built. */
export function assertTestMode(env) {
  const { mode } = readBillingConfig(env);
  if (mode !== "test") throw new Error("The hosted server bills in Stripe's test mode only until Julian's go (code plan 15.6). Set BILLING_MODE=test.");
  refuseLiveKeys(env);
}

/** LIMIT_PROXY_HOPS as a small whole number (0 when unset). */
export function proxyHopsOf(env) {
  const text = String(env.LIMIT_PROXY_HOPS ?? "").trim();
  if (!text) return 0;
  if (!/^\d$/.test(text)) throw new Error("LIMIT_PROXY_HOPS must be a whole number from 0 to 9");
  return Number(text);
}

const secretOf = (env, name) => (String(env[name] ?? "").length >= 16 ? String(env[name]) : null);

export function hostedWorld({ env = process.env, fetch = globalThis.fetch, token, now = () => new Date(), log = console.error } = {}) {
  if (typeof token !== "function") throw new Error("the hosted server needs a token() (server/metadata.js)");
  assertTestMode(env);
  const projectId = String(env.PLATFORM_PROJECT ?? "").trim() || DEFAULT_PROJECT;
  const nowMs = () => now().getTime();
  const settings = platformSettings(env);

  // The platform project's database, and each shop's own (its default database and its stockroom's named one).
  const platform = firestoreClient({ fetch, token, projectId });
  const shopDb = (shopProject) => firestoreClient({ fetch, token, projectId: shopProject });
  const stockroomDb = (shopProject) => firestoreClient({ fetch, token, projectId: shopProject, database: STOCKROOM_DATABASE });
  const platformState = firestorePlatformState(platform);
  const live = () => liveSettings({ env, store: platformState });

  const registry = firestoreRegistry(platform, { now });
  const auditLog = firestoreAuditLog(shopDb);
  const profileFiles = registryFiles(platform, "shop-profile.js");
  const shopData = shopDataClient(shopDb);
  const stockroomData = stockroomDataClient(stockroomDb);
  const deploy = notConnectedClient(NOT_CONNECTED.deploys, ["deployed", "pages", "rules", "functions", "hosting"]);

  // The platform's emails, through Resend, from their real templates.
  const sentLog = firestoreSentLog(platform);
  const email = createEmailService({ env, fetch, registry, sentLog, now });

  // Billing on Stripe's test mode (services/payments alone reads the key).
  const billingStores = firestoreBillingStores(platform);
  const billing = createBillingFromEnv({
    env, fetch, ...billingStores, registry, auditLog, email, now: nowMs,
    shopPlan: shopPlanCopies({ shopData, stockroomData, registry }),
    // Taking a dropped app's pages down needs the deploy tool; the registry's `closedApps` is written either way.
  });
  const feeLedger = firestoreFeeLedger(platform);
  const paymentWay = createPaymentWay({
    stripe: platformBillingStripe({ env, fetch }), mode: "test", settings, customers: billingStores.customers, subscriptions: billingStores.subscriptions,
    registry, auditLog, email, now: nowMs, billing, feeLedger, live,
  });
  const payments = createPaymentsFromEnv({ env, fetch, registry, auditLog, accounts: firestoreAccounts(platform), email, feeLedger, now: nowMs });

  // Sign-up and the shop maker. Making the shop itself waits for the Google organization (15.5): a queued shop stays
  // queued, and the shop-maker job answers that it isn't switched on.
  const stores = firestoreSignupStores(platform);
  const inviteStore = firestoreInvites(platform);
  const invites = createInvites({ invites: inviteStore, email, settings, now });
  const signInLinkMaker = signInLinks({ fetch, token, projectId });
  const signup = createSignup({
    ...stores, registry, billing, email, auth: signInLinkMaker, settings, invites, live, now,
  });
  // The front door (18.4): the six-digit code and each press's setup record, before any shop exists.
  const frontDoor = createFrontDoor({
    ...firestoreFrontDoorStores(platform), email, auth: signInLinkMaker, settings, now,
    stagedFiles: notConnectedClient(NOT_CONNECTED.stagedImports, ["uploadUrl", "stat", "read", "remove"]),
  });
  const repairStore = firestoreRepairs(platform);
  const repairs = createRepairQueue({ store: repairStore, registry, auditLog, now });
  const shopMaker = createShopMaker({ signups: stores.signups, run: notConnectedFn(NOT_CONNECTED.shopMaking), registry, repairs, line: signup, billing, now });

  // Accounts, and the control room.
  const accountStores = firestoreAccountStores(platform);
  const accounts = createAccounts({ accounts: stores.accounts, ...accountStores, registry, shopData, auditLog, email, settings, now });
  const admins = controlRoomAdmins(env);
  const people = controlRoomPeople(env);
  const activity = firestoreActivity(platform);
  const supportStore = firestoreSupport(platform);
  const recoveryStore = firestoreRecoveries(platform);
  const waitlist = firestoreWaitlist(platform);
  const accessRequests = createAccessRequests({ store: firestoreAccessRequests(platform), email, settings, now });
  const deliveryStats = firestoreDeliveryStats(platform);
  const room = createControlRoom({
    registry, auditLog, profileFiles, shopAccess: notConnectedClient(NOT_CONNECTED.supportSignIn, ["supportSignIn"]), repairs, signups: stores.signups, shopData,
    publish: profilePublisher({ deploy, registry }), settings: live, email, breaches: createBreachRegister({ store: firestoreBreaches(platform), registry, auditLog, now }), people,
    activity, supportStore, recoveryStore, platformState, accessRequests, admins, now,
    googleReady: (at) => googleReadiness(readGoogleConfig(env), at),
    taxWatch: () => billing.taxWatch(),
    delivery: deliveryReader({ deliveryStats, now }),
  });
  const controls = createPlatformControls({ admins, settingsStore: platformState, env, activity, waitlist, signups: stores.signups, now, invites });
  const backup = createBackupAccess({
    people, admins, state: platformState, email, registry, auditLog, now,
    runBook: runBook({ state: platformState, registry, platform, rollBack: notConnectedFn(NOT_CONNECTED.rollBack), now }),
  });
  const support = createSupportInbox({ store: supportStore, email, registry, settings, admins, roleIn: (who, shopId) => accounts.roleIn(who, shopId), now });
  const recovery = createRecovery({
    store: recoveryStore, email, registry, auditLog, settings, admins, now,
    findAccount: async (address) => {
      const row = await stores.accounts.findByEmail(address);
      return row ? { accountId: row.accountId } : null;
    },
    applyRecovery: async (move) => recoveryByHand(move),
  });

  // The business side, the timeline, the jobs page, notes, messages to presses, costs and a press's data.
  const incomeHistory = firestoreIncomeHistory(platform);
  const business = createBusinessRoom({ registry, incomeHistory, admins, now });
  const timeline = createTimeline({ admins, registry, activity, supportStore, now });
  const jobRuns = firestoreJobRuns(platform);
  const jobs = createJobs({ store: jobRuns, email, alertTo: String(env.HEALTH_ALERT_TO ?? "").trim() || null, now });
  const pressMessages = createPressMessages({ store: firestorePressMessages(platform), registry, auditLog, shopData, email, activity, admins, now });
  const notes = createShopNotes({ admins, store: firestoreShopNotes(platform), registry, activity, now });
  // The billing export to BigQuery isn't on yet (19.15): the Costs page shows its "not on yet" state.
  const costsDesk = createCostsDesk({ registry, reader: createCostReader({}), settings: live, admins, now });
  const dataExports = createDataExports({
    shopData, stockroomData, storage: notConnectedClient(NOT_CONNECTED.exportFiles, ["write", "signedUrl"]), store: firestoreDataExports(platform), registry, auditLog, activity, email,
    roleIn: (who, shopId) => accounts.roleIn(who, shopId), admins, now,
  });

  // The emails with a "turn off" link: only with their signing phrases.
  const tipsSecret = secretOf(env, "TRIAL_TIPS_SECRET");
  const trialTips = tipsSecret
    ? createTrialTips({ registry, auditLog, guide: { read: (shopId) => shopData.get(shopId, "firstWeek/start") }, email, store: firestoreShopRecords(platform, "trialTips"), settings, secret: tipsSecret, now })
    : null;
  const checkupSecret = secretOf(env, "CHECKUP_SECRET");
  const checkups = checkupSecret
    ? createCheckups({ registry, auditLog, email, store: firestoreShopRecords(platform, "checkups"), inspect: makeInspector({ shopData }), settings, secret: checkupSecret, now })
    : null;
  const closing = createClosingSweep({ registry, auditLog, billing, email, projects: notConnectedClient(NOT_CONNECTED.projectDeletion, ["deleteProject"]), settings, now: nowMs });

  // What the jobs can run (server/jobs.js reads these); the jobs page's "Run now" runs the ones that need nothing more.
  const parts = { env, fetch, token, now, settings, live, platform, registry, auditLog, shopData, email, billing, closing, shopMaker, pressMessages, incomeHistory, trialTips, checkups };
  const runNow = {
    "dropped-apps": () => billing.closeDroppedApps(),
    "press-messages": () => pressMessages.sweep(),
    ...(trialTips ? { "trial-tips": () => trialTips.run() } : {}),
    ...(checkups ? { "shop-checkup": () => checkups.run() } : {}),
  };
  const jobsPage = createJobsPage({ admins, runner: jobs, activity, now, jobs: runNow });

  // The platform's one web door, with the same routes as the practice one (walkthrough/world.js).
  const routes = {
    "POST /api/signup/retry": (claims, request) => shopMaker.retry(claims, request.body?.shopId),
    ...frontDoorRoutes(frontDoor),
    ...accountRoutes(accounts),
    ...billingRoutes({ billing, paymentWay, accounts, registry, auditLog, settings, now }),
    ...controlRoutes(room),
    ...platformRoutes(controls),
    ...emergencyRoutes(backup),
    ...supportRoutes(support),
    ...recoveryRoutes(recovery),
    ...accessRequestRoutes({ requests: accessRequests, accounts, activity, registry, auditLog, now }),
    ...businessRoutes(business),
    ...timelineRoutes(timeline),
    ...jobsRoutes(jobsPage),
    ...notesRoutes(notes),
    ...messageRoutes(pressMessages),
    ...costRoutes(costsDesk),
    ...exportRoutes(dataExports),
  };
  const door = createApi({
    signup, verifyIdToken: createIdTokenVerifier({ projectId, fetch, now: nowMs }), settings, live, plusTax: readBillingConfig(env).tax, routes, publicRoutes: frontDoorPublicRoutes(frontDoor),
    onSignedIn: deviceWatch({ devices: firestoreDevices(platform), email, now }),
    limits: createLimits({ throttle: firestoreThrottle(platform), admins, proxyHops: proxyHopsOf(env), now, log }),
    log,
  });

  const offPage = (sender, piece, request) => {
    const query = new URLSearchParams(request.query ?? {}).toString();
    return sender ? sender.handleOff(`${request.path}${query ? `?${query}` : ""}`) : notConnectedPage(piece, settings.platformName);
  };

  /** Every address the API server answers. */
  async function handle(request) {
    const path = String(request?.path ?? "").replace(/\/+$/, "") || "/";
    if (path === "/api/billing/events") {
      if (request.method !== "POST") return { status: 405, body: { ok: false, message: "Send a POST." } };
      return billing.handleEvent({ headers: request.headers, rawBody: request.rawBody ?? "" });
    }
    if (path === "/api/payments" || path.startsWith("/api/payments/")) return handlePayments({ ...request, path: path.slice("/api/payments".length) || "/" }, { service: payments });
    if (path === "/api/email/shop") return handleShopEmail(request, { service: email, registry, sentLog });
    if (path === "/tips/off" || path === "/checkup/off") {
      if (request.method !== "GET") return { status: 405, body: { ok: false, message: "Open the link from the email." } };
      return path === "/tips/off" ? offPage(trialTips, NOT_CONNECTED.trialTips, request) : offPage(checkups, NOT_CONNECTED.checkups, request);
    }
    return door(request);
  }

  return {
    projectId, settings, live, platform, registry, auditLog, shopData, stockroomData, email, billing, paymentWay, payments, signup, frontDoor, shopMaker, accounts, room, controls,
    backup, support, recovery, business, timeline, jobs, jobRuns, jobsPage, notes, pressMessages, costsDesk, dataExports, trialTips, checkups, closing,
    routes, door, handle, parts,
  };
}
