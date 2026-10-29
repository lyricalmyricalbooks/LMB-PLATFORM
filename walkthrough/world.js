// The whole platform put together on pretend data: sign-up, the shop maker with its setup steps against a pretend
// Google, billing against a pretend Stripe, the account and billing doors, and the control room. Nothing here reaches
// the network or a real project. `road.test.js` (root) walks a press along it, and `walkthrough/server.js` serves the
// platform's pages on top of it for a person to click through (`npm run walkthrough`).
//
// This is also where the pieces that have no hosted home yet are joined: sign-up starts its trial through billing, the
// shop maker hands the new shop its plan (`billing.publishPlan`, plan 6.14), and one web door carries the sign-up,
// account, billing and control-room routes.
import { accountRoutes } from "../accounts/routes.js";
import { billingRoutes } from "../accounts/billingRoutes.js";
import { createAccounts } from "../accounts/accounts.js";
import { fakeAccountStores } from "../accounts/fakes.js";
import { controlRoutes } from "../control-room/routes.js";
import { controlRoomAdmins, createControlRoom, profilePublisher } from "../control-room/controlRoom.js";
import { fakeActivity, fakeBreachStore, fakeInviteStore, fakePlatformState, fakeRepairStore, fakeShopAccess, fakeWaitlist } from "../control-room/fakes.js";
import { createPlatformControls, platformRoutes } from "../control-room/platformControls.js";
import { createBackupAccess, emergencyRoutes } from "../control-room/backupPerson.js";
import { createBreachRegister } from "../control-room/breaches.js";
import { runBook } from "../control-room/runbook.js";
import { controlRoomPeople } from "../control-room/people.js";
import { createInvites } from "../waitlist/invites.js";
import { createSupportInbox } from "../services/support/inbox.js";
import { supportRoutes } from "../services/support/routes.js";
import { fakeSupportStore } from "../services/support/fakes.js";
import { createRecovery, recoveryByHand } from "../accounts/recovery.js";
import { recoveryRoutes } from "../accounts/recoveryRoutes.js";
import { fakeRecoveryStore } from "../accounts/fakes.js";
import { createRepairQueue } from "../control-room/repairs.js";
import { createApi } from "../signup/api.js";
import { fakeAuth, fakeInvites, fakeSignupStores, fakeVerifyIdToken } from "../signup/fakes.js";
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

export const DAY = 86_400_000;
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
  const repairStore = fakeRepairStore();
  const repairs = createRepairQueue({ store: repairStore, registry, auditLog, now: clock.date });
  const steps = () => shopSteps({ ...services, google, registry, profileFiles, config: TEST_CONFIG });
  const run = (shop, options = {}) => runSteps({ shop, registry, auditLog, now: clock.date, steps: steps(), ...options });
  const shopMaker = createShopMaker({ signups: stores.signups, run, registry, repairs, line: signup, billing, now: clock.date });

  // Accounts, and the control room.
  const accountStores = fakeAccountStores();
  const accounts = createAccounts({ accounts: stores.accounts, ...accountStores, registry, shopData, auditLog, email, settings, now: clock.date });
  // The control room and what it sits on: the platform's own settings, the waitlist and its invites, the activity log,
  // the breach register, the support inbox, account recovery and the backup person's run book (all pretend).
  const admins = controlRoomAdmins({ PLATFORM_ADMIN_EMAILS: ADMIN_EMAIL });
  const people = controlRoomPeople({ PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL });
  const platformState = fakePlatformState();
  const activity = fakeActivity();
  const supportStore = fakeSupportStore();
  const recoveryStore = fakeRecoveryStore();
  const waitlist = fakeWaitlist(waitlisted);
  const room = createControlRoom({
    registry, auditLog, profileFiles, shopAccess: fakeShopAccess(), repairs, signups: stores.signups, shopData,
    publish: profilePublisher({ deploy: services.deploy, registry }), settings: live, email, breaches: createBreachRegister({ store: fakeBreachStore(), registry, auditLog, now: clock.date }), people,
    activity, supportStore, recoveryStore, platformState, admins, now: clock.date,
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

  // The platform's one web door: sign-up, the shop maker's Try again, accounts, billing and the control room.
  const door = createApi({
    signup, verifyIdToken: fakeVerifyIdToken, settings, live,
    routes: {
      "POST /api/signup/retry": (claims, request) => shopMaker.retry(claims, request.body?.shopId),
      ...accountRoutes(accounts),
      ...billingRoutes({ billing, paymentWay, accounts, registry, auditLog, settings, now: clock.date }),
      ...controlRoutes(room),
      ...platformRoutes(controls),
      ...emergencyRoutes(backup),
      ...supportRoutes(support),
      ...recoveryRoutes(recovery),
    },
    log: () => {},
  });
  const ask = (claims, method, path, body) => door({ method, path, body, headers: claims ? { Authorization: `Bearer ${JSON.stringify(claims)}` } : {} });

  return {
    clock, settings, registry, auditLog, services, google, profileFiles, shopData, stockroomData, stripe, email, closed, billing, paymentWay, stripeEvent,
    stores, signup, shopMaker, run, steps, repairs, repairStore, accounts, accountStores, room, controls, backup, support, recovery, platformState, activity, door, ask, invites,
    /** The shop's own database as the platform wrote it: a document, or null. */
    doc: (shopId, path) => services.world.docs.get(`${shopId} ${path}`) ?? null,
  };
}
