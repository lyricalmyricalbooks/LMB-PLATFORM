// The whole platform put together on pretend data: sign-up, the shop maker with its setup steps against a pretend
// Google, billing against a pretend Stripe, the account and billing doors, and the control room. Nothing here reaches
// the network or a real project. `road.test.js` (root) walks a press along it, and `walkthrough/server.js` serves the
// platform's pages on top of it for a person to click through (`npm run walkthrough`).
//
// This is also where the pieces that have no hosted home yet are joined: sign-up starts its trial through billing, the
// shop maker hands the new shop its plan (`billing.publishPlan`, plan 6.14), and one web door carries the sign-up,
// account, billing and control-room routes.
import { accountRoutes, deletionRoutes } from "../accounts/routes.js";
import { createAccountDeletion } from "../accounts/deleteAccount.js";
import { billingPublicRoutes, billingRoutes } from "../accounts/billingRoutes.js";
import { createAccounts } from "../accounts/accounts.js";
import { fakeAccountStores, fakeAuthUsers, fakeDeviceStore } from "../accounts/fakes.js";
import { controlRoutes } from "../control-room/routes.js";
import { controlRoomAdmins, createControlRoom, profilePublisher } from "../control-room/controlRoom.js";
import { fakeActivity, fakeBreachStore, fakeInviteStore, fakePlatformState, fakeRepairStore, fakeShopAccess, fakeWaitlist } from "../control-room/fakes.js";
import { createPlatformControls, platformRoutes } from "../control-room/platformControls.js";
import { createBackupAccess, emergencyRoutes } from "../control-room/backupPerson.js";
import { createBreachRegister } from "../control-room/breaches.js";
import { runBook } from "../control-room/runbook.js";
import { controlRoomPeople } from "../control-room/people.js";
import { createInvites } from "../waitlist/invites.js";
import { readGoogleConfig } from "../google/config.js";
import { googleReadiness } from "../google/readiness.js";
import { taxWatch as watchTaxLines } from "../services/billing/taxWatch.js";
import { createSupportInbox } from "../services/support/inbox.js";
import { supportRoutes } from "../services/support/routes.js";
import { fakeSupportStore } from "../services/support/fakes.js";
import { createRecovery, recoveryByHand } from "../accounts/recovery.js";
import { recoveryRoutes } from "../accounts/recoveryRoutes.js";
import { fakeRecoveryStore } from "../accounts/fakes.js";
import { createRepairQueue } from "../control-room/repairs.js";
import { createApi } from "../signup/api.js";
import { fakeAuth, fakeFrontDoorStores, fakeInvites, fakeSignupStores, fakeStagedFiles, fakeVerifyIdToken } from "../signup/fakes.js";
import { createFrontDoor, frontDoorPublicRoutes, frontDoorRoutes } from "../signup/frontDoor.js";
import { createShopMaker } from "../signup/shopMaker.js";
import { createSignup } from "../signup/signup.js";
import { runSteps } from "../setup/runner.js";
import { shopSteps } from "../setup/later-steps.js";
import { fakeAuditLog, fakeGoogle, fakeProfileFiles, fakeRegistry, fakeServices } from "../setup/fakes.js";
import { TEST_CONFIG } from "../setup/test-shop.js";
import { createBilling } from "../services/billing/billing.js";
import { createPaymentWay } from "../services/billing/paymentWay.js";
import { fakeBillingStores, fakeBillingStripe } from "../services/billing/fakes.js";
import { practicePlatformEmail } from "./practiceEmail.js";
import { fakeStockroomData } from "../services/billing/closingFakes.js";
import { shopPlanCopies } from "../services/billing/shopPlan.js";
import { fakeFeeLedgerStore } from "../services/payments/feeLedgerFakes.js";
import { signatureHeader } from "../services/payments/stripeSignature.js";
import { createStripeApi } from "../services/payments/stripeApi.js";
import { liveSettings, platformSettings } from "../services/settings.js";
import { DEFAULT_LIMITS, createLimits } from "../signup/limits.js";
import { fakeThrottle } from "../signup/fakes.js";
import { createAccessRequests } from "../control-room/accessRequests.js";
import { fakeAccessRequestStore } from "../control-room/fakes.js";
import { accessRequestRoutes } from "../accounts/accessRequestRoutes.js";
import { businessRoutes, createBusinessRoom } from "../control-room/business.js";
import { fakeIncomeHistory } from "../control-room/fakes.js";
import { runBusinessNightly } from "../control-room/nightly.js";
import { createTimeline, timelineRoutes } from "../control-room/timeline.js";
import { createJobsPage, jobsRoutes } from "../control-room/jobs.js";
import { createShopNotes, notesRoutes } from "../control-room/notes.js";
import { createSetupDesk, setupRoutes } from "../control-room/setupPresses.js";
import { createSignInSafety, signInSafetyRoutes } from "../control-room/signInSafety.js";
import { broughtOverRoutes, createBroughtOver } from "../control-room/broughtOver.js";
import { createSalesChannels, salesChannelsRoutes } from "../control-room/salesChannels.js";
import { createShopFeatures, shopFeaturesRoutes } from "../control-room/shopFeatures.js";
import { createShopLooks, shopLooksRoutes } from "../control-room/shopLooks.js";
import { createDriftDesk, createDriftWatch, driftRoutes } from "../control-room/driftWatch.js";
import { deliveryReader } from "../control-room/delivery.js";
import { fakeDeliveryStats, fakeShopNotes } from "../control-room/visibilityFakes.js";
import { createJobs } from "../services/jobs/index.js";
import { fakeJobRuns } from "../services/jobs/fakes.js";
import { createPressMessages, messageRoutes } from "../control-room/messages.js";
import { fakePressMessages } from "../control-room/messagesFakes.js";
import { costRoutes, createCostsDesk } from "../control-room/costs.js";
import { createCostReader } from "../services/costs/costs.js";
import { createDataExports, exportRoutes } from "../services/export/export.js";
import { fakeExportStorage, fakeExportStore } from "../services/export/fakes.js";
import { fakeDomainConnectSeller, fakeSellers } from "../services/domains/fakes.js";

export const DAY = 86_400_000;
const generousLimits = () => Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([kind, limit]) => [kind, { ...limit, max: limit.max * 100 }]));
const WEBHOOK_SECRET = "whsec_pretend_billing";

/** The platform admin the control room lets in (two-step sign-in, as the real one asks). */
export const ADMIN_EMAIL = "admin@example.com";
export const adminClaims = (clock) => ({
  uid: "uid-admin", email: ADMIN_EMAIL, email_verified: true, firebase: { sign_in_second_factor: "totp" }, auth_time: Math.floor(clock.ms() / 1000),
});

/** A person signed in with a confirmed email: the pretend token is the JSON of these claims (signup/fakes.js). */
export const person = (uid, email, name = "") => ({ uid, email, email_verified: true, ...(name ? { name } : {}) });

/** A pretend clock the whole platform shares: `ms()` for billing, `date()` for the rest, `tick` moves it on. */
export function fakeClock(start = "2026-10-28T12:00:00Z") {
  let at = Date.parse(start);
  return { ms: () => at, date: () => new Date(at), tick: (ms) => void (at += ms), days: (n) => void (at += n * DAY) };
}

/**
 * Builds the platform. Options: `start` (the pretend time) or `clock` (any object shaped like fakeClock's, for a clock
 * that follows real time), `env` (platform settings on top of "sign-up is open"), `invited` (waitlist emails with an
 * invite), `waitlisted` (people on the waitlist the control room lists), `google` (a pretend Google, to make a step fail), `suffix` (the five characters of a new shop's id).
 */
export function platformWorld({ start, clock = fakeClock(start), env = {}, invited = [], waitlisted = [], google = fakeGoogle(), suffix = null } = {}) {
  const settingsEnv = { SIGNUP_OPEN: "true", ...env };
  const settings = platformSettings(settingsEnv);
  const live = () => liveSettings({ env: settingsEnv });

  const registry = fakeRegistry();
  const services = fakeServices();
  const profileFiles = fakeProfileFiles();
  // A shop's database exists once its first documents are written (setup step 6 on); before that nothing can be
  // written into it, which is the gap between a trial starting at sign-up and the shop existing.
  const databaseReady = (shopId) => [...services.world.docs.keys()].some((key) => key.startsWith(`${shopId} `));
  const auditLog = fakeAuditLog({ isReady: databaseReady });
  const shopData = { ...services.shopData, remove: async (projectId, path) => void services.world.docs.delete(`${projectId} ${path}`) };
  const stockroomData = fakeStockroomData({ isReady: databaseReady });

  // Billing, on a pretend Stripe.
  const stripe = fakeBillingStripe({ clock: () => Math.floor(clock.ms() / 1000) });
  // The platform's emails, written from their real templates into a practice inbox (practiceEmail.js).
  const email = practicePlatformEmail({ env: settingsEnv, registry });
  const closed = [];
  const billingDeps = {
    stripe: createStripeApi({ fetch: stripe.fetch, keys: { test: "sk_test_fake", live: null } }),
    mode: "test", settings, ...fakeBillingStores(), registry, auditLog, email, now: clock.ms,
  };
  const billing = createBilling({
    ...billingDeps, webhookSecrets: [WEBHOOK_SECRET], shopPlan: shopPlanCopies({ shopData, stockroomData, registry }),
    closeApp: async (entry) => void closed.push(entry),
    // Pretend: a closed app's records "deleted" once its 90 days are over (nothing real to delete here).
    deleteApp: async (entry) => void closed.push({ ...entry, deleted: true }),
  });
  const paymentWay = createPaymentWay({ ...billingDeps, billing, feeLedger: fakeFeeLedgerStore(), live });
  /** A signed event from Stripe, handled by billing; returns the door's answer. */
  const stripeEvent = (type, object, id = `evt_${Math.random().toString(36).slice(2)}`) => {
    const rawBody = JSON.stringify({ id, type, livemode: false, data: { object } });
    return billing.handleEvent({ headers: { "Stripe-Signature": signatureHeader(WEBHOOK_SECRET, rawBody, Math.floor(clock.ms() / 1000)) }, rawBody });
  };

  // Sign-up and the shop maker.
  const stores = fakeSignupStores();
  const invites = fakeInvites(invited);
  const signup = createSignup({
    ...stores, registry, billing, email, auth: fakeAuth(), settings, invites, live, now: clock.date, ...(suffix ? { suffix } : {}),
  });
  // The front door (18.4): the six-digit code and each press's setup record, before any shop exists.
  const frontDoorStores = fakeFrontDoorStores();
  // Kept product files (18.7): the walkthrough's server takes the upload at /walkthrough/uploads/<token>.
  const stagedFiles = fakeStagedFiles({ uploadBase: "/walkthrough/uploads", now: clock.date });
  // "Your web address": a made-up domain bought at a seller with the Allow window, and one with none (the guide).
  const domainLookup = fakeSellers({
    "mothpress.example": { registrar: { name: "GoDaddy.com, LLC" }, domainConnect: fakeDomainConnectSeller() },
    "inkpress.example": { registrar: { name: "Hover" } },
  });
  const frontDoor = createFrontDoor({ ...frontDoorStores, email, auth: fakeAuth(), settings, stagedFiles, signup, now: clock.date, domainLookup, ...(suffix ? { suffix } : {}) });
  const repairStore = fakeRepairStore();
  const repairs = createRepairQueue({ store: repairStore, registry, auditLog, now: clock.date });
  const steps = () => shopSteps({ ...services, google, registry, profileFiles, config: TEST_CONFIG });
  const run = (shop, options = {}) => runSteps({ shop, registry, auditLog, now: clock.date, steps: steps(), ...options });
  const shopMaker = createShopMaker({ signups: stores.signups, run, registry, repairs, line: signup, billing, now: clock.date });

  // Accounts, and the control room.
  const accountStores = fakeAccountStores();
  const accounts = createAccounts({ accounts: stores.accounts, ...accountStores, registry, shopData, auditLog, email, settings, now: clock.date });
  const deletion = createAccountDeletion({
    accounts: stores.accounts, memberships: accountStores.memberships, registry, shopData, auditLog, signups: stores.signups,
    devices: fakeDeviceStore(), authUsers: fakeAuthUsers(), email, now: clock.date,
  });
  // The control room and what it sits on: the platform's own settings, the waitlist and its invites, the activity log,
  // the breach register, the support inbox, account recovery and the backup person's run book (all pretend).
  const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: ADMIN_EMAIL });
  const people = controlRoomPeople({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL });
  const platformState = fakePlatformState();
  const activity = fakeActivity();
  const supportStore = fakeSupportStore();
  const recoveryStore = fakeRecoveryStore();
  const waitlist = fakeWaitlist(waitlisted);
  // "Make changes" asks the press first (19.6): the requests, answered on the account page.
  const accessRequests = createAccessRequests({ store: fakeAccessRequestStore(), email, settings, now: clock.date });
  // Payments and email delivery per shop (19.12): nothing counts payment events in the practice world yet.
  const deliveryStats = fakeDeliveryStats();
  const shopAccess = fakeShopAccess();
  const room = createControlRoom({
    registry, auditLog, profileFiles, shopAccess, repairs, signups: stores.signups, shopData,
    publish: profilePublisher({ deploy: services.deploy, registry }), settings: live, email, breaches: createBreachRegister({ store: fakeBreachStore(), registry, auditLog, now: clock.date }), people,
    activity, supportStore, recoveryStore, platformState, accessRequests, admins, now: clock.date, presses: frontDoorStores.presses,
    // Nothing of Google is set up in the practice world, so the control room shows every item still to do.
    googleReady: (at) => googleReadiness(readGoogleConfig({}), at),
    taxWatch: async () => watchTaxLines({ invoices: [], now: clock.date().getTime() }),
    delivery: deliveryReader({ deliveryStats, now: clock.date }),
  });
  const controls = createPlatformControls({
    admins, settingsStore: platformState, env: settingsEnv, activity, waitlist, signups: stores.signups, now: clock.date,
    invites: createInvites({ invites: fakeInviteStore(), email, settings, now: clock.date }),
  });
  const backup = createBackupAccess({
    people, admins: [ADMIN_EMAIL], state: platformState, email, registry, auditLog, now: clock.date,
    runBook: runBook({ state: platformState, registry, platform: { set: async () => {} }, rollBack: async () => ({ ok: true }), now: clock.date }),
  });
  const support = createSupportInbox({ store: supportStore, email, registry, settings, admins: [ADMIN_EMAIL], roleIn: (person, shopId) => accounts.roleIn(person, shopId), now: clock.date });
  const recovery = createRecovery({
    store: recoveryStore, email, registry, auditLog, settings, admins: [ADMIN_EMAIL], now: clock.date,
    findAccount: async (address) => {
      for (const [accountId, row] of stores.accounts.rows) if (String(row.email ?? "").toLowerCase() === address) return { accountId };
      return null;
    },
    applyRecovery: async (move) => recoveryByHand(move),
  });

  // The business side of Today (19.7-19.9): income records written by the nightly run, read with the registry.
  const incomeHistory = fakeIncomeHistory();
  const business = createBusinessRoom({ registry, incomeHistory, admins, now: clock.date });
  // One timeline per shop, the jobs page and the private notes (19.10, 19.11, 19.13). The jobs this world can run by
  // hand are the ones with nothing outside it; the rest answer "only on the server".
  const timeline = createTimeline({ admins, registry, activity, supportStore, now: clock.date });
  const jobRuns = fakeJobRuns();
  const jobs = createJobs({ store: jobRuns, email, alertTo: ADMIN_EMAIL, now: clock.date });
  // Paying presses drifting away (24.4): the practice shops' own orders and sign-ins.
  const driftWatch = createDriftWatch({ registry, shopData, stockroomData, shopAccess, memberships: accountStores.memberships, email, settings, now: clock.date });
  const jobsPage = createJobsPage({
    admins, runner: jobs, activity, now: clock.date,
    jobs: { "shop-maker": () => shopMaker.sweep(), "dropped-apps": () => billing.closeDroppedApps(), "income-record": () => runBusinessNightly({ registry, settings, incomeHistory, billing, now: clock.date }), "press-messages": () => pressMessages.sweep(), "drift-watch": () => driftWatch.sweep() },
  });
  const notes = createShopNotes({ admins, store: fakeShopNotes(), registry, activity, now: clock.date });
  // Presses still in setup mode or opening (the Setting up page): read only.
  const setupDesk = createSetupDesk({ admins, presses: frontDoorStores.presses, registry, now: clock.date });
  const signInSafety = createSignInSafety({ admins, registry, memberships: accountStores.memberships, shopAccess, now: clock.date });
  const broughtOver = createBroughtOver({ admins, registry, shopData, now: clock.date });
  const driftDesk = createDriftDesk({ admins, registry, settings, activity, now: clock.date });
  const shopFeatures = createShopFeatures({ admins, registry, shopData, now: clock.date });
  const shopLooks = createShopLooks({ admins, registry, shopData, now: clock.date });
  const salesChannels = createSalesChannels({ admins, registry, shopData, stockroomData, now: clock.date });
  // Messages to presses (19.14), what each shop costs (19.15; no billing export in the practice world, so the empty
  // state) and a press's data on request (19.16).
  const pressMessages = createPressMessages({ store: fakePressMessages(), registry, auditLog, shopData, email, activity, admins, now: clock.date });
  const costsDesk = createCostsDesk({ registry, reader: createCostReader({}), settings: live, admins, now: clock.date });
  const exportStorage = fakeExportStorage();
  const listDocs = async (projectId, collection) => [...services.world.docs.entries()]
    .filter(([k]) => k.startsWith(`${projectId} ${collection}/`) && !k.slice(`${projectId} ${collection}/`.length).includes("/"))
    .map(([k, data]) => ({ id: k.slice(`${projectId} ${collection}/`.length), data: structuredClone(data) }));
  const dataExports = createDataExports({
    shopData: { ...shopData, list: listDocs }, stockroomData, storage: exportStorage, store: fakeExportStore(), registry, auditLog, activity, email,
    roleIn: (who, shopId) => accounts.roleIn(who, shopId), admins, now: clock.date,
  });

  // The platform's one web door: sign-up, the shop maker's Try again, accounts, billing and the control room. The hosted
  // door (server/world.js) has the same routes; server/world.test.js checks none is missing there.
  const routes = {
    "POST /api/signup/retry": (claims, request) => shopMaker.retry(claims, request.body?.shopId),
    ...frontDoorRoutes(frontDoor),
    ...accountRoutes(accounts),
    ...deletionRoutes(deletion),
    ...billingRoutes({ billing, paymentWay, accounts, registry, auditLog, settings, now: clock.date }),
    ...controlRoutes(room),
    ...platformRoutes(controls),
    ...emergencyRoutes(backup),
    ...supportRoutes(support),
    ...recoveryRoutes(recovery),
    ...accessRequestRoutes({ requests: accessRequests, accounts, activity, registry, auditLog, now: clock.date }),
    ...businessRoutes(business),
    ...timelineRoutes(timeline),
    ...jobsRoutes(jobsPage),
    ...notesRoutes(notes),
    ...setupRoutes(setupDesk),
    ...signInSafetyRoutes(signInSafety),
    ...broughtOverRoutes(broughtOver),
    ...salesChannelsRoutes(salesChannels),
    ...shopFeaturesRoutes(shopFeatures),
    ...shopLooksRoutes(shopLooks),
    ...driftRoutes(driftDesk),
    ...messageRoutes(pressMessages),
    ...costRoutes(costsDesk),
    ...exportRoutes(dataExports),
  };
  const door = createApi({
    signup, verifyIdToken: fakeVerifyIdToken, settings, live, routes, publicRoutes: { ...frontDoorPublicRoutes(frontDoor), ...billingPublicRoutes({ billing }) },
    // Fair-use limits (19.5) on an in-memory counter, a hundred times the real ones so a person clicking never meets them.
    limits: createLimits({ throttle: fakeThrottle(), admins, limits: generousLimits(), now: clock.date, log: () => {} }),
    log: () => {},
  });
  const ask = (claims, method, path, body) => door({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });

  return {
    clock, settings, registry, auditLog, services, google, profileFiles, shopData, stockroomData, stripe, email, closed, billing, paymentWay, stripeEvent,
    stores, frontDoor, frontDoorStores, stagedFiles, signup, shopMaker, run, steps, repairs, repairStore, accounts, accountStores, shopAccess, driftWatch, room, controls, backup, support, recovery, platformState, activity, door, routes, ask, invites, accessRequests,
    deliveryStats, timeline, jobs, jobRuns, jobsPage, notes,
    pressMessages, costsDesk, dataExports, exportStorage,
    /** The shop's own database as the platform wrote it: a document, or null. */
    doc: (shopId, path) => services.world.docs.get(`${shopId} ${path}`) ?? null,
    // Income over time, why presses leave and failed plan payments (19.7-19.9), and their nightly run.
    business, incomeHistory,
    nightly: () => runBusinessNightly({ registry, settings, incomeHistory, billing, now: clock.date }),
  };
}
