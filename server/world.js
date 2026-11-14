// The platform put together for real: the same pieces and the same web door as walkthrough/world.js, route for route,
// with the platform project's Firestore, Google's sign-in check, Stripe in test mode and Gmail in place of the
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
//   GMAIL_SENDING               "on": email goes through Google as the platform's Workspace mailbox (services/email)
//   the keys                    the platform's Stripe test key and the two Stripe events addresses' signing secrets:
//                               each read only by its own service (services/payments, services/billing), which also
//                               names it for the deploy
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
//   *    /api/domains/...        a shop's web addresses (services/domains/http.js: POST /shop, GET /allowed), in the shared system
//   *    /api/google/...         Connect Google (google/hosted.js: POST /shop from a shop, GET /oauth from Google)
//   *    /api/social/...         social channels (services/social/hosted.js: POST /shop, GET /<network>/oauth)
//   *    /api/accounting/...     the QuickBooks link (services/accounting/hosted.js: POST /shop, GET /quickbooks/oauth and /reconnect)
//   GET  /tips/off, /checkup/off the emails' "turn off" pages
//
// What can't be real yet answers plainly that it isn't switched on (server/notConnected.js; listed in README.md).
import { freeAddressTaken } from "../services/domains/freeAddress.js";
import { accountRoutes, deletionRoutes } from "../accounts/routes.js";
import { createAccountDeletion } from "../accounts/deleteAccount.js";
import { identityClient, platformAuthUsers } from "../clients/identity.js";
import { testShopOwnerAccess } from "../control-room/supportAccess.js";
import { billingPublicRoutes, billingRoutes } from "../accounts/billingRoutes.js";
import { createShopBillingDoor, SHOP_BILLING_PREFIX } from "../accounts/shopBillingDoor.js";
import { createAccounts } from "../accounts/accounts.js";
import { controlRoutes } from "../control-room/routes.js";
import { NEW_SHOP_SWITCHES, controlRoomAdmins, createControlRoom, profilePublisher, switchPublisher, zoneWriter } from "../control-room/controlRoom.js";
import { readFeeSettings } from "../services/payments/fees.js";
import { createPlatformControls, platformRoutes } from "../control-room/platformControls.js";
import { createBackupAccess, emergencyRoutes } from "../control-room/backupPerson.js";
import { createBreachRegister } from "../control-room/breaches.js";
import { runBook } from "../control-room/runbook.js";
import { controlRoomPeople } from "../control-room/people.js";
import { createInvites } from "../waitlist/invites.js";
import { readGoogleConfig } from "../google/config.js";
import { googleReadiness } from "../google/readiness.js";
import { hostedGoogleLink } from "../google/hosted.js";
import { accountingEnv, accountingStores, hostedAccounting } from "../services/accounting/hosted.js";
import { readAccountingConfig } from "../services/accounting/config.js";
import { hostedSocial } from "../services/social/hosted.js";
import { createSupportInbox } from "../services/support/inbox.js";
import { supportRoutes } from "../services/support/routes.js";
import { createAppMakers } from "../services/apps/makers.js";
import { createOwnApps } from "../services/apps/ownApps.js";
import { createAppInstalls } from "../services/apps/installs.js";
import { createChitChatsApp } from "../services/chitchats/app.js";
import { chitChatsPublicRoutes, chitChatsRoutes } from "../services/chitchats/routes.js";
import { createMailchimpApp } from "../services/mailchimp/app.js";
import { mailchimpPublicRoutes, mailchimpRoutes } from "../services/mailchimp/routes.js";
import { sealingKey } from "../services/payments/tokenSeal.js";
import { createAppConnection } from "../services/apps/connection.js";
import { createAppAlerts } from "../services/apps/alerts.js";
import { appInstallPublicRoutes, appInstallRoutes, appMakerRoutes, appShopDoorRoutes, appStorePublicRoutes } from "../services/apps/routes.js";
import { createAppShopDoor } from "../services/apps/shopDoor.js";
import { createReceiptMail, receiptShopDoorRoutes } from "../services/receipts/index.js";
import { bankFeedShopDoorRoutes, createBankFeed } from "../services/bankfeed/index.js";
import { createRecovery, recoveryByHand } from "../accounts/recovery.js";
import { recoveryRoutes } from "../accounts/recoveryRoutes.js";
import { deviceWatch } from "../accounts/devices.js";
import { createRepairQueue } from "../control-room/repairs.js";
import { createApi } from "../signup/api.js";
import { createShopMaker } from "../signup/shopMaker.js";
import { createTermsNotice } from "../terms/notice.js";
import { SHARED_STEP_PLAN, sharedShopRun } from "../setup/real.js";
import { sharedBuckets, shopStores } from "../clients/shared.js";
import { firestoreUsageMeters, runUsageMeters } from "../services/usage/meters.js";
import { monitoringUsage, storageUsage, usageSources } from "../services/usage/sources.js";
import { createSignup } from "../signup/signup.js";
import { createBillingFromEnv, readBillingConfig } from "../services/billing/index.js";
import { createPaymentWay } from "../services/billing/paymentWay.js";
import { shopPlanCopies } from "../services/billing/shopPlan.js";
import { createClosingSweep } from "../services/billing/closing.js";
import { createPaymentsFromEnv, handlePayments, platformBillingStripe, refuseLiveKeys, setupClient } from "../services/payments/index.js";
import { createEmailService } from "../services/email/index.js";
import { handleShopEmail } from "../services/email/http.js";
import { liveSettings, platformSettings } from "../services/settings.js";
import { createLimits } from "../signup/limits.js";
import { createAccessRequests } from "../control-room/accessRequests.js";
import { accessRequestRoutes } from "../accounts/accessRequestRoutes.js";
import { businessRoutes, createBusinessRoom } from "../control-room/business.js";
import { createTimeline, timelineRoutes } from "../control-room/timeline.js";
import { createSharedSystemDesk, sharedSystemRoutes } from "../control-room/sharedSystem.js";
import { createJobsPage, jobsRoutes } from "../control-room/jobs.js";
import { runnerFor } from "./jobs.js";
import { createShopNotes, notesRoutes } from "../control-room/notes.js";
import { createSetupDesk, setupRoutes } from "../control-room/setupPresses.js";
import { createSetupClock } from "../signup/setupClock.js";
import { createDriftDesk, createDriftWatch, driftRoutes } from "../control-room/driftWatch.js";
import { createSignInSafety, signInSafetyRoutes } from "../control-room/signInSafety.js";
import { broughtOverRoutes, createBroughtOver } from "../control-room/broughtOver.js";
import { createTookData, tookDataRoutes } from "../control-room/tookData.js";
import { createSalesChannels, salesChannelsRoutes } from "../control-room/salesChannels.js";
import { createShopFeatures, shopFeaturesRoutes } from "../control-room/shopFeatures.js";
import { createShopLooks, shopLooksRoutes } from "../control-room/shopLooks.js";
import { createShopEmails, shopEmailsRoutes } from "../control-room/shopEmails.js";
import { appUseRoutes, createAppUse } from "../control-room/appUse.js";
import { createShopSocial, shopSocialRoutes } from "../control-room/shopSocial.js";
import { connectionsRoutes, createConnectionsDesk } from "../control-room/connectionsDesk.js";
import { createShopApps, shopAppsRoutes } from "../control-room/shopApps.js";
import { chitChatsDeskRoutes, createChitChatsDesk } from "../control-room/chitChats.js";
import { createMailchimpDesk, mailchimpDeskRoutes } from "../control-room/mailchimp.js";
import { createOwnAppsDesk, ownAppsDeskRoutes } from "../control-room/ownApps.js";
import { createQuickBooksDesk, quickbooksDeskRoutes } from "../control-room/quickbooks.js";
import { chitChatsNote } from "../control-room/chitChatsNote.js";
import { switchNote } from "../control-room/switchNote.js";
import { createSellReady, sellReadyRoutes } from "../control-room/sellReady.js";
import { createNotSelling, notSellingRoutes } from "../control-room/notSelling.js";
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
import { registryFiles, shopDataClient, stockroomDataClient } from "../clients/shop.js";
import {
  firestoreAccounts, firestoreActivity, firestoreBreaches, firestoreDeliveryStats, firestoreDevices, firestoreIncomeHistory, firestoreInvites,
  firestoreJobRuns, firestorePlatformState, firestoreRecoveries, firestoreRepairs, firestoreSentLog, firestoreShopNotes, firestoreSupport, firestoreWaitlist,
  firestoreApps, firestoreAppCodes, firestoreAppInstalls, firestoreAppAlerts, firestoreAppAlertState, firestoreChitChats, firestoreMailchimp,
} from "../clients/stores.js";
import {
  firestoreAccessRequests, firestoreAccountStores, firestoreBillingStores, firestoreFoundingSeats, firestoreDataExports, firestoreFeeLedger, firestorePressMessages,
  firestoreFrontDoorStores, firestoreShopRecords, firestoreSignupStores, firestoreThrottle,
} from "../clients/platformStores.js";
import { createFrontDoor, frontDoorPublicRoutes, frontDoorRoutes } from "../signup/frontDoor.js";
import { signInLinks } from "../clients/signInLinks.js";
import { createIdTokenVerifier } from "./verifyIdToken.js";
import { NOT_CONNECTED, notConnectedClient, notConnectedFn, notConnectedPage } from "./notConnected.js";
import { resolveTxt } from "node:dns/promises";
import { sellerLookupClient } from "../services/domains/sellers.js";
import { sharedDomainService } from "../services/domains/hosted.js";
import { readDomainConnectConfig } from "../services/domains/config.js";
import { handleDomains } from "../services/domains/http.js";

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

/** Where Colophon's Zapier app lives, from server/env.yaml; null until both addresses are on zapier.com. */
/** Whether the QuickBooks link is on, for the control room: "broken" when its settings don't go together. */
function quickbooksSwitch(env, accounting) {
  if (!accounting) return "broken";
  try {
    const config = readAccountingConfig(accountingEnv(env));
    if (!config.enabled) return "off";
    return config.apps.live || config.apps.test ? "on" : "no-keys";
  } catch {
    return "broken";
  }
}

function zapierPlace(env) {
  const onZapier = (value) => /^https:\/\/zapier\.com\/\S+$/.test(String(value ?? "").trim());
  return onZapier(env.ZAPIER_INVITE_URL) && onZapier(env.ZAPIER_RETURN_ADDRESS)
    ? { inviteUrl: String(env.ZAPIER_INVITE_URL).trim(), returnAddress: String(env.ZAPIER_RETURN_ADDRESS).trim() }
    : null;
}

const secretOf = (env, name) => (String(env[name] ?? "").length >= 16 ? String(env[name]) : null);

export function hostedWorld({ env = process.env, fetch = globalThis.fetch, token, now = () => new Date(), log = console.error } = {}) {
  if (typeof token !== "function") throw new Error("the hosted server needs a token() (server/metadata.js)");
  assertTestMode(env);
  const projectId = String(env.PLATFORM_PROJECT ?? "").trim() || DEFAULT_PROJECT;
  const nowMs = () => now().getTime();
  const settings = platformSettings(env);

  // The platform project's database, and each shop's (its folder in the shared project once SHARED_SHOPS_PROJECT is set,
  // clients/shared.js shopStores; else its own project's default database and its stockroom's named one).
  const platform = firestoreClient({ fetch, token, projectId });
  const registry = firestoreRegistry(platform, { now });
  // A shop whose registry row places it in a shared project (the test shops, in the shared test project) is reached there.
  const { shared, shopDb, stockroomDb, recordsFor, storesOf } = shopStores({ env, fetch, token, rowOf: (shopId) => registry.getShop(shopId) });
  const platformState = firestorePlatformState(platform);
  const live = () => liveSettings({ env, store: platformState });

  const auditLog = firestoreAuditLog(shopDb);
  const profileFiles = registryFiles(platform, "shop-profile.js");
  const shopData = shopDataClient(shopDb);
  const stockroomData = stockroomDataClient(stockroomDb);
  const deploy = notConnectedClient(NOT_CONNECTED.deploys, ["deployed", "pages", "rules", "functions", "hosting"]);

  // The platform's emails, through Google (the platform's Workspace mailbox), from their real templates.
  const sentLog = firestoreSentLog(platform);
  // shopStart: the shop's own Settings answer to "What do you sell?", so platform emails follow a later change (plan 12.18).
  const email = createEmailService({ env, fetch, token, registry, sentLog, shopStart: (shopId) => shopData.get(shopId, "firstWeek/start"), now });

  // Receipts by email (beta): each shop's own receipts address on the platform mailbox (services/receipts).
  const receiptMail = createReceiptMail({ env, fetch, token, registry, auditLog, now });
  // Bank feed (beta, a paid add-on): each shop's banks through Plaid, read-only (services/bankfeed).
  const bankFeed = createBankFeed({ env, fetch, registry, auditLog, plusTax: readBillingConfig(env).tax, now });

  // Billing on Stripe's test mode (services/payments alone reads the key).
  const billingStores = firestoreBillingStores(platform);
  const billing = createBillingFromEnv({
    env, fetch, ...billingStores, registry, auditLog, email, now: nowMs,
    shopPlan: shopPlanCopies({ shopData, stockroomData, registry }),
    // The founding offer, given when a press first pays (founding.js, 22.1).
    live, foundingSeats: firestoreFoundingSeats(platform),
    // Taking a dropped app's pages down needs the deploy tool; the registry's `closedApps` is written either way.
    // Deleting a closed app's records once its 90 days are over needs server access to the shop's project: until then
    // each try is kept on the app's entry (the control room's Apps closing list shows it) and nothing is deleted.
    deleteApp: notConnectedFn(NOT_CONNECTED.appDeletion),
  });
  const feeLedger = firestoreFeeLedger(platform);
  const paymentWay = createPaymentWay({
    // The same Stripe mode as billing itself, from the one place that reads it.
    stripe: platformBillingStripe({ env, fetch }), mode: readBillingConfig(env).mode, settings, customers: billingStores.customers, subscriptions: billingStores.subscriptions,
    registry, auditLog, email, now: nowMs, billing, feeLedger, live,
  });
  // Each Stripe event is counted per shop, for the control room's delivery counts and health (control-room/delivery.js).
  const deliveryStats = firestoreDeliveryStats(platform);
  const payments = createPaymentsFromEnv({ env, fetch, registry, auditLog, accounts: firestoreAccounts(platform), email, feeLedger, deliveryStats, now: nowMs });

  // Sign-up and the shop maker. Making the shop itself waits for the Google organization (15.5): a queued shop stays
  // queued, and the shop-maker job answers that it isn't switched on.
  const stores = firestoreSignupStores(platform);
  const inviteStore = firestoreInvites(platform);
  const invites = createInvites({ invites: inviteStore, email, settings, live, now });
  const signInLinkMaker = signInLinks({ fetch, token, projectId });
  const signup = createSignup({
    ...stores, registry, billing, email, auth: signInLinkMaker, settings, invites, admins: controlRoomAdmins(env), live, now,
  });
  // The front door (18.4): the six-digit code and each press's setup record, before any shop exists.
  const stagedFiles = notConnectedClient(NOT_CONNECTED.stagedImports, ["uploadUrl", "stat", "read", "remove"]);
  // "Your web address" in setup names where a press bought its domain from the public lookup (nothing is connected
  // until the shop is made). Whether that seller has Colophon's Allow window waits for the Domain Connect settings.
  const domainLookup = sellerLookupClient({ fetch, resolveTxt, config: readDomainConnectConfig(env) });
  const frontDoor = createFrontDoor({ ...firestoreFrontDoorStores(platform), email, auth: signInLinkMaker, settings, now, signup, stagedFiles, making: (shopId) => shopMaker.progress(shopId), domainLookup, freeNameTaken: freeAddressTaken(registry) });
  // The clock for a press that hasn't opened (18.11): two warnings, then its setup is cleared.
  const setupClock = createSetupClock({ presses: firestoreFrontDoorStores(platform).presses, stagedFiles, email, settings, now });
  const repairStore = firestoreRepairs(platform);
  const repairs = createRepairQueue({ store: repairStore, registry, auditLog, now });
  // Once making shops is connected, pass `presses` here and to the domain service, and the domain service as `domains`, so a domain brought in
  // setup is connected when its shop is ready (shopMaker.js connectAddresses; the free address too, with freeAddress and platformZone on the domain service).
  // The shared system (docs/shared-system.md, step 6): with SHARED_SHOPS_PROJECT and SHARED_SHOPS_DOMAIN set, a shop is a
  // few writes in the shared project, made in seconds; without them, making shops stays not switched on.
  // Web addresses (services/domains/hosted.js): on with the shared system, where nothing is deployed per shop. The shop
  // maker puts a new shop's free address on the shared site (step 9) and connects the domain it brought in setup once
  // it is ready (shopMaker.js connectAddresses).
  const presses = firestoreFrontDoorStores(platform).presses;
  // A press's own domain works for every shop in a shared project, the test shops' and the live one: each shop's
  // address goes in the address book of the project it lives in (`storesOf`). Only free addresses wait for the settings.
  const domains = sharedDomainService({ env, fetch, token, shared: storesOf, registry, auditLog, payments, email, presses, sellers: domainLookup, settings, now });
  // The control room's "new shops start with" switches (Shops > Switches for every shop) reach each shop as it is made.
  const sharedRun = sharedShopRun({ env, fetch, token, payments: setupClient(payments), email, settings, registryFirestore: platform, addresses: domains, switchDefaults: async () => (await platformState.get(NEW_SHOP_SWITCHES))?.values ?? null });
  const shopMaker = sharedRun
    ? createShopMaker({ signups: stores.signups, run: sharedRun, registry, repairs, line: signup, billing, steps: SHARED_STEP_PLAN, presses, domains, now })
    : createShopMaker({ signups: stores.signups, run: notConnectedFn(NOT_CONNECTED.shopMaking), registry, repairs, line: signup, billing, now });

  // Accounts, and the control room.
  const accountStores = firestoreAccountStores(platform);
  const accounts = createAccounts({ accounts: stores.accounts, ...accountStores, registry, shopData, auditLog, email, settings, now });
  const deletion = createAccountDeletion({
    accounts: stores.accounts, memberships: accountStores.memberships, registry, shopData, auditLog, signups: stores.signups,
    devices: firestoreDevices(platform), authUsers: platformAuthUsers({ fetch, token, projectId }), email, now,
  });
  const admins = controlRoomAdmins(env);
  const people = controlRoomPeople(env);
  const activity = firestoreActivity(platform);
  const supportStore = firestoreSupport(platform);
  const recoveryStore = firestoreRecoveries(platform);
  const waitlist = firestoreWaitlist(platform);
  const accessRequests = createAccessRequests({ store: firestoreAccessRequests(platform), email, settings, now });
  // The shop's own sign-in (support visits, two-step reset, sign-in safety) waits for the platform's access to it.
  const shopAccess = { ...notConnectedClient(NOT_CONNECTED.supportSignIn, ["supportSignIn"]), ...notConnectedClient(NOT_CONNECTED.twoStepReset, ["removeTwoStep"]),
    ...notConnectedClient(NOT_CONNECTED.signInSafety, ["signInSafety"]),
    // The platform's own test shops open signed in as their owner (the platform's admin). No waiting on IAM: a refusal
    // shows at once with what to run (control-room/supportAccess.js).
    ...testShopOwnerAccess({ identity: identityClient({ fetch, token, signRetries: 0 }), registry }) };
  const room = createControlRoom({
    // Today lists shops with stuck Chit Chats orders; the desk is made further down, and only called once a request comes.
    parcels: () => chitChatsDesk.shops(),
    registry, auditLog, profileFiles, shopAccess, repairs, signups: stores.signups, shopData, stockroomData,
    // A switch reaches a shared-system shop through its record (the front door serves the profile from there), and a
    // shop with a project of its own by deploying its pages again. The shop record shows the fee the payment service charges.
    publish: switchPublisher({ registry, recordsFor, fallback: profilePublisher({ deploy, registry }) }), writeZone: zoneWriter({ recordsFor }), feeDefaults: readFeeSettings(env), settings: live, email, breaches: createBreachRegister({ store: firestoreBreaches(platform), registry, auditLog, now }), people,
    activity, supportStore, recoveryStore, platformState, accessRequests, admins, now, presses: firestoreFrontDoorStores(platform).presses,
    googleReady: (at) => googleReadiness(readGoogleConfig(env), at),
    taxWatch: () => billing.taxWatch(),
    bills: (shopId, page) => billing.invoicePage(shopId, page),
    // Bounces and spam reports come from the newsletter guard's store (services/email/reputation.js), not hosted yet.
    delivery: deliveryReader({ deliveryStats, sentLog, now }),
  });
  // The Launch page (control room): shopMaking is on once the shared system makes shops here (shopMaker above).
  const controls = createPlatformControls({ admins, settingsStore: platformState, env, activity, waitlist, signups: stores.signups, now, invites, project: projectId, shopMaking: Boolean(sharedRun) });
  const backup = createBackupAccess({
    people, admins, state: platformState, email, registry, auditLog, now,
    runBook: runBook({ state: platformState, registry, platform, rollBack: notConnectedFn(NOT_CONNECTED.rollBack), now }),
  });
  const support = createSupportInbox({ store: supportStore, email, registry, settings, admins, roleIn: (who, shopId) => accounts.roleIn(who, shopId), now });
  // Outside apps registered by app makers (code plan 26.1).
  const appStore = firestoreApps(platform);
  // Colophon's own apps (Chit Chats...) list themselves, with secrets made from the link phrase the server already has.
  const ownApps = createOwnApps({
    store: appStore, root: secretOf(env, "OWN_APPS_SECRET") ?? secretOf(env, "CHECKUP_SECRET"),
    platformUrl: settings.platformUrl, supportEmail: settings.supportEmail, now,
    // Mailchimp lists itself once Colophon's own Mailchimp app sign-up is in the server's settings.
    // Zapier lists itself once Colophon's app is on Zapier: its invite link and Zapier's return address (server/env.yaml).
    available: {
      mailchimp: Boolean(String(env.MAILCHIMP_CLIENT_ID ?? "").trim() && String(env.MAILCHIMP_CLIENT_SECRET ?? "").trim()),
      zapier: zapierPlace(env) !== null,
    },
    zapier: zapierPlace(env) ?? {},
  });
  const appMakers = createAppMakers({ store: appStore, admins, now, ensureOwnApps: () => ownApps.ensure() });
  // Installing them on a shop with its owner's permission (26.2).
  const appInstallStore = firestoreAppInstalls(platform);
  const appAlertOutbox = firestoreAppAlerts(platform);
  // Alerts to apps when orders, products or stock change, and when an app is removed (26.4; the app-alerts job).
  const appAlerts = createAppAlerts({
    apps: appStore, installs: appInstallStore, outbox: appAlertOutbox, state: firestoreAppAlertState(platform), shopData, fetch, now,
  });
  const appInstalls = createAppInstalls({
    apps: appStore, makers: appMakers, installs: appInstallStore, codes: firestoreAppCodes(platform), registry, auditLog, now,
    roleIn: (who, shopId) => accounts.roleIn(who, shopId), onRemoved: (install) => appAlerts.removed(install),
  });
  // The app connection: installed apps read their shop through the platform, with their key (26.3).
  const appConnection = createAppConnection({ installs: appInstalls, shopData, registry, outbox: appAlertOutbox, now });
  // Colophon's own Chit Chats app (26.11): paid orders become Chit Chats shipments, tracking comes back. Its app id,
  // secret and sealing key come from ownApps (CHITCHATS_APP_ID / _APP_SECRET / _SEAL_KEY still win when set).
  const chitchatsStores = firestoreChitChats(platform);
  const chitchatsOwn = ownApps.appOf("chitchats");
  const chitchats = createChitChatsApp({
    appId: String(env.CHITCHATS_APP_ID ?? "").trim() || chitchatsOwn?.appId || null,
    appSecret: String(env.CHITCHATS_APP_SECRET ?? "").trim() || chitchatsOwn?.appSecret || null,
    sealKey: env.CHITCHATS_SEAL_KEY ? sealingKey(env.CHITCHATS_SEAL_KEY, "CHITCHATS_SEAL_KEY") : ownApps.sealKeyOf("chitchats"),
    connections: chitchatsStores.connections, shipments: chitchatsStores.shipments,
    exchange: (args) => appInstalls.exchange(args), appCall: (request) => appConnection(request),
    roleIn: (who, shopId) => accounts.roleIn(who, shopId), fetch, now, returnAddress: `${settings.platformUrl}/account/chitchats.html`,
  });
  // Colophon's own Mailchimp app (26.12): confirmed newsletter readers into the press's audience, unsubscribes both ways.
  const mailchimpStores = firestoreMailchimp(platform);
  const mailchimpOwn = ownApps.appOf("mailchimp");
  const mailchimp = createMailchimpApp({
    appId: mailchimpOwn?.appId ?? null, appSecret: mailchimpOwn?.appSecret ?? null, sealKey: ownApps.sealKeyOf("mailchimp"),
    clientId: String(env.MAILCHIMP_CLIENT_ID ?? "").trim() || null, clientSecret: String(env.MAILCHIMP_CLIENT_SECRET ?? "").trim() || null,
    connections: mailchimpStores.connections, members: mailchimpStores.members,
    exchange: (args) => appInstalls.exchange(args), appCall: (request) => appConnection(request),
    roleIn: (who, shopId) => accounts.roleIn(who, shopId), fetch, now, returnAddress: `${settings.platformUrl}/account/mailchimp.html`,
  });
  // The QuickBooks link (services/accounting, plan 7.15): a shop's Settings › Bookkeeping connects the press's own
  // QuickBooks company, and the shop's nightly run sends its sales there. Hidden in every shop until Intuit's keys and
  // ACCOUNTING_ENABLED are in (docs/accounting.md, Turning it on).
  const accounting = hostedAccounting({ env, fetch, platform, registry, auditLog, email, shopStart: (shopId) => shopData.get(shopId, "firstWeek/start"), now: nowMs, log });
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
  const business = createBusinessRoom({ registry, incomeHistory, admins, billing, activity, now });
  const timeline = createTimeline({ admins, registry, activity, supportStore, emailLog: sentLog, shopData, now });
  const jobRuns = firestoreJobRuns(platform);
  const jobs = createJobs({ store: jobRuns, email, alertTo: String(env.HEALTH_ALERT_TO ?? "").trim() || null, now });
  const pressMessages = createPressMessages({ store: firestorePressMessages(platform), registry, auditLog, shopData, email, activity, admins, now });
  const notes = createShopNotes({ admins, store: firestoreShopNotes(platform), registry, activity, now });
  // Presses still in setup mode or opening (the Setting up page): read only.
  const setupDesk = createSetupDesk({ admins, presses: firestoreFrontDoorStores(platform).presses, registry, shopData, now });
  const signInSafety = createSignInSafety({ admins, registry, memberships: accountStores.memberships, shopAccess, now });
  const driftWatch = createDriftWatch({ registry, shopData, stockroomData, shopAccess, memberships: accountStores.memberships, email, settings, now });
  const broughtOver = createBroughtOver({ admins, registry, shopData, now });
  const dataExportStore = firestoreDataExports(platform);
  const tookData = createTookData({ admins, registry, shopData, exports: dataExportStore, now });
  const driftDesk = createDriftDesk({ admins, registry, settings, activity, now });
  const shopFeatures = createShopFeatures({ admins, registry, shopData, now });
  const shopLooks = createShopLooks({ admins, registry, shopData, now });
  const shopEmails = createShopEmails({ admins, registry, emailLog: sentLog, now });
  const appUse = createAppUse({ admins, installs: appInstallStore, outbox: appAlertOutbox, now });
  const shopApps = createShopApps({ admins, registry, installs: appInstallStore, outbox: appAlertOutbox, shopData, now });
  const chitChatsDesk = createChitChatsDesk({ admins, chitchats, stores: chitchatsStores, registry, now: now });
  const sellReady = createSellReady({ admins, registry, shopData, now: now });
  const notSelling = createNotSelling({ admins, registry, shopData, email, activity, now: now });
  // Social channels (plan 27): a shop's Sales channels connects the press's Facebook & Instagram, Pinterest and TikTok
  // (services/social/hosted.js). Off in every shop until the networks' keys and SOCIAL_ENABLED are in (docs/social.md).
  const social = hostedSocial({ env, fetch, platform, registry, auditLog, now: nowMs, log });
  const shopSocial = createShopSocial({ admins, registry, social: social?.service ?? null, now });
  // Every Google, QuickBooks and social connection that stopped working, on the Shops page (control-room/connectionsDesk.js).
  const connectionsDesk = createConnectionsDesk({ admins, platform, registry, now });
  const salesChannels = createSalesChannels({ admins, registry, shopData, stockroomData, now });
  // The billing export to BigQuery isn't on yet (19.15): the Costs page shows its "not on yet" state.
  const costReader = createCostReader({});
  const costsDesk = createCostsDesk({ registry, reader: costReader, settings: live, admins, now });
  // Each shop's use in the shared system (services/usage): the daily usage-meters job writes it, running costs bill by it.
  const sharedProject = String(env.SHARED_SHOPS_PROJECT ?? "").trim();
  const usageMeters = sharedRun ? firestoreUsageMeters(platform) : null;
  const usage = sharedRun ? {
    run: () => runUsageMeters({
      registry, meters: usageMeters, costs: costReader, sharedProject, now,
      sources: usageSources({ monitoring: monitoringUsage({ fetch, token, projectId: sharedProject }), storage: storageUsage({ fetch, token, buckets: sharedBuckets(env) }), sentLog }),
    }),
  } : null;
  const dataExports = createDataExports({
    shopData, stockroomData, storage: notConnectedClient(NOT_CONNECTED.exportFiles, ["write", "signedUrl"]), store: dataExportStore, registry, auditLog, activity, email,
    roleIn: (who, shopId) => accounts.roleIn(who, shopId), admins, now,
  });

  // The emails with a "turn off" link: only with their signing phrases.
  const tipsSecret = secretOf(env, "TRIAL_TIPS_SECRET");
  const trialTips = tipsSecret
    ? createTrialTips({ registry, auditLog, guide: { read: (shopId) => shopData.get(shopId, "firstWeek/start") }, email, store: firestoreShopRecords(platform, "trialTips"), settings, live, secret: tipsSecret, now })
    : null;
  const checkupSecret = secretOf(env, "CHECKUP_SECRET");
  const checkups = checkupSecret
    ? createCheckups({ registry, auditLog, email, store: firestoreShopRecords(platform, "checkups"), inspect: makeInspector({ shopData }), settings, secret: checkupSecret, now })
    : null;
  // Connect Google (google/hosted.js): on once the Google sign-in keys are in Secret Manager. Without them every shop's
  // Google page says "coming soon" (a status of `enabled: false`), and nothing else is answered.
  const googleLink = hostedGoogleLink({ env, fetch, token, platform, registry, domains, now: nowMs, log });
  // A closing shop's Google link is undone with it, and at deletion its own address comes off (google/hosted.js closingHooks).
  const closing = createClosingSweep({ registry, auditLog, billing, email, projects: notConnectedClient(NOT_CONNECTED.projectDeletion, ["deleteProject"]), hooks: googleLink?.closingHooks ?? {}, settings, now: nowMs });

  // The terms promise 30 days' email before new words apply (terms/notice.js).
  const termsNotice = createTermsNotice({ signups: stores.signups, email, settings: live, now });

  // What the jobs can run (server/jobs.js reads these); the jobs page's "Run now" runs the ones that need nothing more.
  const parts = { bankFeed, sharedShops: Boolean(sharedRun), accounting, social, googleLink, domains, usage, usageMeters, costReader, ownApps, chitchats, chitchatsStores, mailchimp, env, fetch, token, projectId, now, settings, live, platform, registry, auditLog, shopData, email, billing, closing, shopMaker, pressMessages, incomeHistory, trialTips, checkups, termsNotice };
  const runNow = {
    "dropped-apps": () => billing.closeDroppedApps(),
    "every-app": () => billing.giveEveryApp(),
    "terms-notice": () => termsNotice.sweep(),
    "press-messages": () => pressMessages.sweep(),
    "setup-clock": () => setupClock.sweep(),
    "drift-watch": () => driftWatch.sweep(),
    "chitchats-tracking": () => chitchats.sweep(),
    "mailchimp-sync": () => mailchimp.sweep(),
    "switch-note": () => switchNote({ registry, email, to: people.adminEmail ?? (String(env.HEALTH_ALERT_TO ?? "").trim() || null), now }),
    "chitchats-note": () => chitChatsNote({ stores: chitchatsStores, registry, email, to: people.adminEmail ?? (String(env.HEALTH_ALERT_TO ?? "").trim() || null), now }),
    ...(trialTips ? { "trial-tips": () => trialTips.run() } : {}),
    ...(checkups ? { "shop-checkup": () => checkups.run() } : {}),
  };
  // The Monday email, sent to the owner now (its own key, so it goes even after this week's one).
  runNow["weekly-summary"] = () => runnerFor({ parts }, "weekly-summary")({ byHand: true });
  const jobsPage = createJobsPage({ admins, runner: jobs, activity, now, jobs: runNow });

  // The platform's one web door, with the same routes as the practice one (walkthrough/world.js).
  const routes = {
    "POST /api/signup/retry": (claims, request) => shopMaker.retry(claims, request.body?.shopId),
    ...frontDoorRoutes(frontDoor),
    ...accountRoutes(accounts),
    ...deletionRoutes(deletion),
    ...billingRoutes({ billing, paymentWay, bankFeed, accounts, registry, auditLog, settings, now }),
    ...controlRoutes(room),
    ...platformRoutes(controls),
    ...emergencyRoutes(backup),
    ...supportRoutes(support),
    ...appMakerRoutes(appMakers),
    ...appInstallRoutes(appInstalls),
    ...chitChatsRoutes(chitchats),
    ...mailchimpRoutes(mailchimp),
    ...recoveryRoutes(recovery),
    ...accessRequestRoutes({ requests: accessRequests, accounts, activity, registry, auditLog, now }),
    ...businessRoutes(business),
    ...timelineRoutes(timeline),
    ...sharedSystemRoutes(createSharedSystemDesk({ admins, registry, meters: usageMeters, now })),
    ...jobsRoutes(jobsPage),
    ...notesRoutes(notes),
    ...setupRoutes(setupDesk),
    ...signInSafetyRoutes(signInSafety),
    ...broughtOverRoutes(broughtOver),
    ...tookDataRoutes(tookData),
    ...salesChannelsRoutes(salesChannels),
    ...shopFeaturesRoutes(shopFeatures),
    ...shopLooksRoutes(shopLooks),
    ...shopEmailsRoutes(shopEmails),
    ...appUseRoutes(appUse),
    ...shopSocialRoutes(shopSocial),
    ...connectionsRoutes(connectionsDesk),
    ...shopAppsRoutes(shopApps),
    ...chitChatsDeskRoutes(chitChatsDesk),
    ...mailchimpDeskRoutes(createMailchimpDesk({ admins, mailchimp, connections: mailchimpStores.connections, registry, now })),
    ...ownAppsDeskRoutes(createOwnAppsDesk({ admins, ownApps, apps: appStore, now })),
    ...quickbooksDeskRoutes(createQuickBooksDesk({ admins, switchedOn: quickbooksSwitch(env, accounting), connections: accountingStores(platform).connections, registry, now })),
    ...sellReadyRoutes(sellReady),
    ...notSellingRoutes(notSelling),
    ...driftRoutes(driftDesk),
    ...messageRoutes(pressMessages),
    ...costRoutes(costsDesk),
    ...exportRoutes(dataExports),
  };
  const door = createApi({
    signup, verifyIdToken: createIdTokenVerifier({ projectId, fetch, now: nowMs }), settings, live, plusTax: readBillingConfig(env).tax, routes, publicRoutes: { ...frontDoorPublicRoutes(frontDoor), ...billingPublicRoutes({ billing }), ...appStorePublicRoutes(appMakers), ...appInstallPublicRoutes(appInstalls), ...appShopDoorRoutes(createAppShopDoor({ registry, installs: appInstalls, makers: appMakers })), ...receiptShopDoorRoutes(receiptMail), ...bankFeedShopDoorRoutes(bankFeed), ...chitChatsPublicRoutes(chitchats), ...mailchimpPublicRoutes(mailchimp) },
    onSignedIn: deviceWatch({ devices: firestoreDevices(platform), email, now }),
    limits: createLimits({ throttle: firestoreThrottle(platform), admins, proxyHops: proxyHopsOf(env), now, log }),
    log,
  });

  // The billing hub inside each shop's admin (22.3): signed in to the shop's own project, one sign-in check per project.
  const shopVerifiers = new Map();
  const shopBilling = createShopBillingDoor({
    billing, paymentWay, exports: dataExports, bankFeed, accounts, registry, auditLog, settings, now, log,
    limits: createLimits({ throttle: firestoreThrottle(platform), admins, proxyHops: proxyHopsOf(env), now, log }),
    verifierFor: (shopProject) => {
      if (!shopVerifiers.has(shopProject)) shopVerifiers.set(shopProject, createIdTokenVerifier({ projectId: shopProject, fetch, now: nowMs }));
      return shopVerifiers.get(shopProject);
    },
  });

  const googleDoor = (request) => {
    if (googleLink) return googleLink.handle(request);
    if (request.path === "/shop" && request.method === "POST" && request.body?.op === "google.status") return { status: 200, body: { enabled: false } };
    return { status: 409, body: { error: { code: "google_off", message: "Connect Google isn't turned on yet." } } };
  };

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
    if (path.startsWith(SHOP_BILLING_PREFIX)) return shopBilling(request);
    if (path === "/api/payments" || path.startsWith("/api/payments/")) return handlePayments({ ...request, path: path.slice("/api/payments".length) || "/" }, { service: payments });
    if (path === "/api/apps/v1" || path.startsWith("/api/apps/v1/")) return appConnection(request);
    if (path === "/api/email/shop") return handleShopEmail(request, { service: email, registry, sentLog });
    if (path === "/api/domains" || path.startsWith("/api/domains/")) {
      if (!domains) return { status: 503, body: { error: { code: "not_connected", message: NOT_CONNECTED.domains.words } } };
      return handleDomains({ ...request, path: path.slice("/api/domains".length) || "/" }, { service: domains });
    }
    if (path === "/api/social" || path.startsWith("/api/social/")) {
      if (!social) return { status: 503, body: { error: { code: "not_connected", message: NOT_CONNECTED.social.words } } };
      return social.handle({ ...request, path: path.slice("/api/social".length) || "/" });
    }
    if (path === "/api/accounting" || path.startsWith("/api/accounting/")) {
      if (!accounting) return { status: 503, body: { error: { code: "not_connected", message: NOT_CONNECTED.bookkeeping.words } } };
      return accounting.handle({ ...request, path: path.slice("/api/accounting".length) || "/" });
    }
    if (path === "/api/google" || path.startsWith("/api/google/")) return googleDoor({ ...request, path: path.slice("/api/google".length) || "/" });
    if (path === "/tips/off" || path === "/checkup/off") {
      if (request.method !== "GET") return { status: 405, body: { ok: false, message: "Open the link from the email." } };
      return path === "/tips/off" ? offPage(trialTips, NOT_CONNECTED.trialTips, request) : offPage(checkups, NOT_CONNECTED.checkups, request);
    }
    return door(request);
  }

  return {
    projectId, settings, live, platform, registry, auditLog, shopData, stockroomData, email, billing, paymentWay, payments, signup, frontDoor, shopMaker, accounts, room, controls,
    appAlerts, chitchats, mailchimp, accounting, social, backup, support, recovery, business, timeline, jobs, jobRuns, jobsPage, notes, pressMessages, costsDesk, dataExports, trialTips, checkups, closing, setupClock, driftWatch,
    routes, door, shopBilling, handle, parts, termsNotice, googleLink,
  };
}
