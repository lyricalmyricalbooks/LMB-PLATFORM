// The control room (code plan 2.8): the platform's own admin. It lists every shop with its plan, release version,
// health and switches; lets a platform admin "act as this shop" for support, logging every use first; and turns one
// shop switch on or off, re-publishing that shop's profile.
//
// Only platform admins get in: a confirmed email on the PLATFORM_ADMIN_EMAILS list (none by default, so nobody is an
// admin by accident), signed in with two steps in the last 12 hours (plan 9.1).
//
// Clients passed in (setup/fakes.js and fakes.js have pretend ones):
//   registry      listShops(); getShop(shopId); getProfile(shopId); saveProfile(shopId, profile);
//                 readReleaseChecks(shopId) -> runs, oldest first; recordEvent(shopId, entry)
//   auditLog      ready(shopId); write(shopId, id, entry): the shop's own audit log
//   profileFiles  read(shopId); write(shopId, text): the shop's /shop-profile.js as the platform keeps it
//   publish       (shopId) -> { apps }: puts the saved /shop-profile.js live (profilePublisher below)
//   shopAccess    supportSignIn(shopId, { by, reason, minutes, mode }) -> { url }: a short sign-in to the shop's admin for
//                 support (supportAccess.js; the shop copy shows a banner and treats it as staff until it ends).
//   repairs       optional: the repair queue (repairs.js): open(shopId), list({ status }), markFixed(id, { by, note })
//   selfCheck     optional: the self-checks (selfChecks.js): check(shopId, { why }), run after every change here
//   shopData      optional: a shop's own database, get(shopId, path) / set(shopId, path, data) (clients/shop.js);
//                 needed to close a shop (closure.js)
//   envFiles, deploy, build, email, squareAccount   optional: the emergency payments switch (emergencyPayments.js);
//                 without envFiles, deploy and email it refuses
//   breaches      optional: the breach register (breaches.js createBreachRegister)
//   people        optional: controlRoomPeople() (people.js): the privacy contact shown with the register
//   newsletters   optional: the newsletter pause (services/email/reputation.js): resume(shopId, { by, reason })
//   settings      optional: () -> the live platform settings (services/settings.js liveSettings), for Today's income
//   supportStore, recoveryStore, signups   optional: list({ status }) / list(): what's waiting, for Today (9.2)
//   platformState optional: the platform's small records (clients/stores.js firestorePlatformState), for the switch
//                 defaults new shops get (9.7, record `newShopSwitches`)
//   feeDefaults   the platform's default per-order fee (services/payments/fees.js readFeeSettings), shown with a shop's fee
//   activity      optional: the activity log (activity.js, plan 9.9): record(entry); every logged action goes there too
import { testShopDocs } from "../setup/test-catalogue.js";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { PLANS, SWITCHES, shopSwitches } from "../setup/steps.js";
import { profileProblems, profileScript } from "../profile/profile.js";
import { SETTINGS_DOC, isPaused, pausedSettings, restoredSettings } from "./closure.js";
import { PAYMENT_ROUTES, emergencyPayments } from "./emergencyPayments.js";
import { activityEntry } from "./activity.js";
import { todaySummary } from "./today.js";
import { MAX_BASIS_POINTS, NO_FEE, feeForShop } from "../services/payments/fees.js";
import { dateText } from "../services/billing/billing.js";
import { platformSettings } from "../services/settings.js";

export const ACT_AS_MINUTES = 30;
/** A change to a press's per-order fee starts this many days after the press is emailed (Julian, 28 October 2026). */
export const FEE_NOTICE_DAYS = 30;
/** Where the switch defaults for new shops are kept (`platformState`), read by the shop maker's setup step 6. */
export const NEW_SHOP_SWITCHES = "newShopSwitches";
export const MIN_REASON = 10;

export class ControlError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** The platform admins, from PLATFORM_ADMIN_EMAILS (comma-separated). Empty unless set. */
export function controlRoomAdmins(env = process.env) {
  return String(env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
}

/** A control-room sign-in lasts this long; after it, sign in again (with the code). */
export const SIGN_IN_HOURS = 12;

/** The two-step words the page shows. "two-step" in the message is how the page knows to offer the set-up. */
export const TWO_STEP_NEEDED = "The control room needs two-step sign-in: a code from your authenticator app each time you sign in. Set it up, then sign in again.";

/**
 * Why this sign-in may not open the control room (plan 9.1), or null: it must have used a second step (Firebase puts
 * `firebase.sign_in_second_factor` on the pass, "totp" for an authenticator app) and be under 12 hours old (`auth_time`,
 * in seconds). Both are on the ID token Firebase signs, so a browser can't add them.
 */
export function twoStepProblem(claims, nowMs = Date.now()) {
  const factor = claims?.firebase?.sign_in_second_factor;
  if (typeof factor !== "string" || !factor) return { status: 403, message: TWO_STEP_NEEDED };
  const signedInAt = Number(claims.auth_time) * 1000;
  if (!Number.isFinite(signedInAt) || nowMs - signedInAt > SIGN_IN_HOURS * 3600_000) {
    return { status: 401, message: `Your control-room sign-in is more than ${SIGN_IN_HOURS} hours old. Sign in again.` };
  }
  return null;
}

/**
 * The signed-in platform admin's email, or a refusal: an address on PLATFORM_ADMIN_EMAILS, confirmed, signed in with
 * two steps in the last 12 hours (plan 9.1). The two-step check comes after the list, so a stranger learns nothing.
 */
export function adminOf(claims, admins, nowMs = Date.now()) {
  if (!claims?.uid) throw new ControlError(401, "Sign in first.");
  const email = String(claims.email ?? "").toLowerCase();
  if (claims.email_verified !== true || !admins.includes(email)) throw new ControlError(403, "The control room is for platform admins only.");
  const problem = twoStepProblem(claims, nowMs);
  if (problem) throw new ControlError(problem.status, problem.message);
  return email;
}

/**
 * A shop's health in three levels, with the reasons in plain words: "ok", "watch" (nothing broken, but look) or
 * "problem" (something is broken or waiting on a person).
 */
export function shopHealth({ row, profile, checks = [], repairs = [] }) {
  const problems = [];
  const watch = [];
  if (row.status !== "live") watch.push(`not live yet (${row.status ?? "being made"})`);
  if (row.status === "live" && !profile) problems.push("live but has no saved profile");
  const last = checks.at(-1);
  if (last && !last.ok) problems.push(`the last release check failed${last.failedCheck ? ` at check ${last.failedCheck}` : ""}: ${last.error ?? "no reason given"}`);
  if (!last && row.testShop) watch.push("the test shop has never passed a release check");
  if (row.billing?.access === "paused") watch.push("the plan is paused until a card is added");
  if (row.billing?.access === "closed") watch.push("the plan has ended");
  if (row.paymentsEmergency) watch.push(`card payments moved to ${row.paymentsEmergency.to === "own" ? "the press's own Stripe keys" : "Square"} by the emergency switch`);
  if (row.closure) watch.push(`closed by the platform on ${String(row.closure.at).slice(0, 10)}: ${row.closure.reason}`);
  // Spending limits (services/health/spending.js): past its budget, a shop's costly jobs slow down or wait.
  if (row.spending?.level === "slow") watch.push("past its budget: photo copies, AI writing and imports run slowly");
  if (row.spending?.level === "held") watch.push("twice its budget: photo copies, AI writing and imports wait until next month");
  for (const repair of repairs) problems.push(`in the repair queue: ${repair.problem}`);
  // The five-minute watch (services/health) keeps its latest results on the row.
  for (const [name, result] of Object.entries(row.health?.checks ?? {})) {
    if (result && result.ok === false) problems.push(`the ${name} check is failing${result.detail ? `: ${result.detail}` : ""}`);
  }
  return { level: problems.length ? "problem" : watch.length ? "watch" : "ok", reasons: [...problems, ...watch] };
}

/**
 * Puts a shop's saved profile live by deploying its pages again at the release they're already on. `build(version)`
 * (the release runner's builder, which skips a release already built) makes sure that release's pages are on hand.
 */
export function profilePublisher({ deploy, registry, build = async () => {} }) {
  return async function publish(shopId) {
    const row = await registry.getShop(shopId);
    const apps = [];
    for (const app of Object.keys(PLANS[row?.plan] ?? {}).filter((name) => PLANS[row.plan][name])) {
      const live = await deploy.deployed(shopId, `pages:${app}`);
      // Pages not deployed yet get the profile when setup deploys them (step 9).
      if (!live) continue;
      await build(live.version);
      await deploy.pages(shopId, { version: live.version, app });
      apps.push(app);
    }
    return { apps };
  };
}

export function createControlRoom({
  registry, auditLog, profileFiles, publish, shopAccess, repairs, selfCheck, shopData, envFiles, deploy, build, email, squareAccount, breaches, people = {}, newsletters, activity, settings, supportStore, recoveryStore, signups, platformState, googleSteps, feeDefaults = NO_FEE, admins, now = () => new Date(),
}) {
  const at = () => now().toISOString();

  // Every control-room action is logged in the registry and, once the shop's database exists, in its own audit log.
  async function log(shopId, what, detail) {
    const stamp = at();
    const entry = { id: `control-room-${stamp}-${what}-${createHash("sha256").update(JSON.stringify(detail)).digest("hex").slice(0, 8)}`, source: "control-room", at: stamp, what, ...detail };
    await registry.recordEvent(shopId, entry);
    if (await auditLog.ready(shopId)) await auditLog.write(shopId, entry.id, entry);
    // The activity log (9.9): every admin action in one list, newest first.
    if (activity) await activity.record(activityEntry({ at: stamp, by: detail.by, what, shopId, detail }));
    return entry;
  }

  const paymentsSwitch = envFiles && deploy && email
    ? emergencyPayments({ registry, envFiles, profileFiles, deploy, build, publish, shopData, squareAccount, email, log, now })
    : null;

  const reasonOf = (reason) => {
    const text = typeof reason === "string" ? reason.trim() : "";
    if (text.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the shop's log.`);
    return text.slice(0, 500);
  };

  async function shopOr404(shopId) {
    const row = typeof shopId === "string" ? await registry.getShop(shopId) : null;
    if (!row) throw new ControlError(404, "There's no shop with that id.");
    return row;
  }

  /**
   * Turns one switch on or off for one shop. Safe to repeat: the saved profile, its file and the live pages end up the
   * same, and each call is logged. Used by the control room and by `switch.js` on the command line.
   */
  async function setSwitch({ by, shopId, name, on, reason }) {
    if (!SWITCHES.includes(name)) throw new ControlError(400, `There's no switch called ${name}. The switches are: ${SWITCHES.join(", ")}.`);
    if (typeof on !== "boolean") throw new ControlError(400, "Say on or off.");
    const why = reasonOf(reason);
    await shopOr404(shopId);
    const saved = await registry.getProfile(shopId);
    if (!saved) throw new ControlError(409, "That shop has no saved profile yet. Its setup writes one (step 6).");
    const from = shopSwitches(saved.switches)[name];
    const profile = { ...saved, switches: { ...shopSwitches(saved.switches), [name]: on } };
    const problems = profileProblems(profile);
    if (problems.length) throw new ControlError(409, `The shop's profile has problems, so nothing was changed: ${problems.join("; ")}`);
    if (!isDeepStrictEqual(saved, profile)) await registry.saveProfile(shopId, profile);
    const text = profileScript(profile);
    if ((await profileFiles.read(shopId)) !== text) await profileFiles.write(shopId, text);
    // The log entry comes before the pages go live, so a change that reaches a shop is always on record.
    await log(shopId, "switch-set", { by, switch: name, from, to: on, reason: why });
    const { apps } = await publish(shopId);
    // Self-checks after every change (2.11): anything off goes to the repair queue.
    const checked = selfCheck ? await selfCheck.check(shopId, { why: `switch ${name} ${on ? "on" : "off"}` }) : null;
    return { shopId, switch: name, from, to: on, changed: from !== on, published: apps, ...(checked ? { selfCheck: { ok: checked.ok, results: checked.results } } : {}) };
  }

  return {
    setSwitch,

    /** Every shop, for the control room's list. */
    async shops(claims) {
      adminOf(claims, admins, now().getTime());
      const rows = await registry.listShops();
      const shops = [];
      for (const row of rows) {
        const profile = await registry.getProfile(row.shopId);
        const checks = await registry.readReleaseChecks(row.shopId);
        const open = repairs ? await repairs.open(row.shopId) : [];
        shops.push({
          shopId: row.shopId,
          pressName: row.pressName ?? row.shopId,
          plan: row.plan ?? null,
          status: row.status ?? null,
          testShop: row.testShop === true,
          version: row.release?.version ?? null,
          access: row.billing?.access ?? null,
          lastCheck: checks.at(-1) ? { ok: checks.at(-1).ok, at: checks.at(-1).finishedAt ?? null, version: checks.at(-1).version ?? null } : null,
          health: shopHealth({ row, profile, checks, repairs: open }),
          switches: profile ? shopSwitches(profile.switches) : null,
          siteUrl: profile?.siteUrl ?? null,
          ownerEmail: row.ownerEmail ?? null,
          billingStatus: row.billing?.status ?? null,
          createdAt: row.createdAt ?? null,
          closed: row.closure ? { by: row.closure.by, reason: row.closure.reason, at: row.closure.at } : null,
          paymentsMoved: row.paymentsEmergency ? { to: row.paymentsEmergency.to, by: row.paymentsEmergency.by, at: row.paymentsEmergency.at } : null,
        });
      }
      const order = { problem: 0, watch: 1, ok: 2 };
      return { shops: shops.sort((a, b) => order[a.health.level] - order[b.health.level] || a.pressName.localeCompare(b.pressName)), switchNames: [...SWITCHES] };
    },

    /**
     * "Act as this shop": a short sign-in to the shop's admin for support. It is logged in the registry and the shop's
     * own audit log before the sign-in is made, with who, why and until when; with no log, no sign-in.
     */
    async actAs(claims, { shopId, reason, mode = "view" } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      // "view" (the default, plan 9.8) looks only: the shop's server and rules refuse its changes. "edit" is staff.
      if (mode !== "view" && mode !== "edit") throw new ControlError(400, "Choose to view the shop or to make changes.");
      const row = await shopOr404(shopId);
      if (row.status !== "live") throw new ControlError(409, "That shop isn't live yet, so there's no admin to open.");
      const expiresAt = new Date(now().getTime() + ACT_AS_MINUTES * 60_000).toISOString();
      await log(shopId, "act-as", { by, reason: why, expiresAt, mode });
      const { url } = await shopAccess.supportSignIn(shopId, { by, reason: why, minutes: ACT_AS_MINUTES, mode });
      return { shopId, url, expiresAt, mode };
    },

    /**
     * Your test shop (9.10): the platform's own shop (`testShop: true` in the registry), for the card at the top of the
     * control room. Null until it exists; `npm run demo` is the test shop on Julian's computer until then.
     */
    async testShop(claims) {
      adminOf(claims, admins, now().getTime());
      const row = (await registry.listShops()).find((r) => r.testShop === true);
      if (!row) return { testShop: null };
      const profile = await registry.getProfile(row.shopId);
      const checks = await registry.readReleaseChecks(row.shopId);
      const last = checks.at(-1);
      const siteUrl = profile?.siteUrl ?? null;
      return {
        testShop: {
          shopId: row.shopId,
          pressName: row.pressName ?? row.shopId,
          status: row.status ?? null,
          version: row.release?.version ?? null,
          storefrontUrl: siteUrl,
          adminUrl: siteUrl ? `${siteUrl}/admin/` : null,
          lastCheck: last ? { ok: last.ok, at: last.finishedAt ?? null, version: last.version ?? null, failedCheck: last.failedCheck ?? null } : null,
          health: shopHealth({ row, profile, checks, repairs: repairs ? await repairs.open(row.shopId) : [] }),
        },
      };
    },

    /**
     * Reset the sample books (9.10): the test shop's starter books and shipping zone go back to how setup step 12 made
     * them, 5 copies each (setup/test-catalogue.js). Only the test shop; its orders, settings and stockroom stay as they
     * are. Logged.
     */
    async resetTestShop(claims, { shopId } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const row = await shopOr404(shopId);
      if (row.testShop !== true) throw new ControlError(409, "Only the test shop's sample books can be reset.");
      if (row.status !== "live") throw new ControlError(409, "The test shop isn't live yet, so there are no sample books to reset.");
      if (!shopData) throw new ControlError(503, "The control room can't reach the test shop's books, so nothing was reset.");
      const docs = testShopDocs();
      await log(shopId, "test-shop-reset", { by, books: docs.map((d) => d.path) });
      for (const { path, data } of docs) await shopData.set(shopId, path, data);
      return { shopId, reset: docs.length };
    },

    /**
     * One shop's record (9.3): owner, plan and billing, setup progress, connections, fee, version, checks, health and
     * its control-room history. Customer details are never part of it.
     */
    async shop(claims, { shopId } = {}) {
      adminOf(claims, admins, now().getTime());
      const row = await shopOr404(shopId);
      const profile = await registry.getProfile(shopId);
      const checks = await registry.readReleaseChecks(shopId);
      const open = repairs ? await repairs.open(shopId) : [];
      const steps = registry.readSteps ? await registry.readSteps(shopId) : [];
      const lastByStep = new Map();
      for (const step of steps) lastByStep.set(step.step, step);
      const fee = feeForShop(row, feeDefaults, now());
      const next = row.platformFee?.next && Date.parse(row.platformFee.next.from) > now().getTime() ? row.platformFee.next : null;
      return {
        shopId,
        pressName: row.pressName ?? shopId,
        ownerEmail: row.ownerEmail ?? null,
        plan: row.plan ?? null,
        status: row.status ?? null,
        testShop: row.testShop === true,
        createdAt: row.createdAt ?? null,
        siteUrl: profile?.siteUrl ?? null,
        version: row.release?.version ?? null,
        billing: row.billing ?? null,
        setup: [...lastByStep.values()].map(({ step, name, ok, error, at, finishedAt }) => ({ step, name: name ?? null, ok: ok !== false && !error, at: finishedAt ?? at ?? null, error: error ?? null })),
        connections: {
          payments: row.payments ? { provider: row.payments.provider ?? null, connected: Boolean(row.payments.accountId) } : null,
          domains: row.domains ?? null,
          google: row.google ?? null,
          email: row.emailSending ?? null,
        },
        fee: { ...fee, next, defaults: feeDefaults },
        lastChecks: checks.slice(-5).reverse(),
        health: shopHealth({ row, profile, checks, repairs: open }),
        closed: row.closure ?? null,
        // Closing an unpaid or dropped shop (6.8): stage, dates and the warning emails sent.
        closing: row.closing ?? null,
        // Every Google step with its state (6.20, google/status.js); a failed read leaves the rest of the record.
        google: googleSteps ? await googleSteps.googleStatus(shopId).catch(() => null) : null,
        history: activity ? await activity.list({ shopId, limit: 50 }) : [],
      };
    },

    /**
     * Run again (6.20 on the shop record): one Google step of one shop, through google/status.js `runAgain`, which keeps
     * its own rules (nothing deleted ahead of 6.8's dates). Logged before it runs.
     */
    async googleRunAgain(claims, { shopId, step } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      await shopOr404(shopId);
      if (!googleSteps) throw new ControlError(503, "The control room can't reach the Google steps right now.");
      if (typeof step !== "string" || !step) throw new ControlError(400, "Choose a Google step to run again.");
      await log(shopId, "google-run-again", { by, step });
      try {
        return { shopId, step, outcome: await googleSteps.runAgain(shopId, step) };
      } catch (failure) {
        throw new ControlError(409, failure.message);
      }
    },

    /**
     * Sets one shop's per-order fee (9.6): a share of each payment, in hundredths of a percent, and whether a refund
     * gives it back. The change starts 30 days after the press is emailed. Setting the fee it already has cancels a
     * change still waiting. Logged; safe to repeat.
     */
    async setFee(claims, { shopId, basisPoints, refunded, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) throw new ControlError(400, "The fee must be a percentage from 0 to 100, in steps of 0.01.");
      if (typeof refunded !== "boolean") throw new ControlError(400, "Say whether a refund gives the fee back.");
      const row = await shopOr404(shopId);
      const current = feeForShop(row, feeDefaults, now());
      const pending = row.platformFee?.next && Date.parse(row.platformFee.next.from) > now().getTime() ? row.platformFee.next : null;
      const own = { basisPoints: current.basisPoints, refunded: current.refunded };
      if (current.basisPoints === basisPoints && current.refunded === refunded) {
        if (!pending) return { shopId, changed: false, fee: own };
        await log(shopId, "fee-change-cancelled", { by, reason: why, was: pending });
        await registry.updateShop(shopId, { platformFee: own });
        return { shopId, changed: true, cancelled: true, fee: own };
      }
      if (pending && pending.basisPoints === basisPoints && pending.refunded === refunded) return { shopId, changed: false, fee: own, next: pending };
      const from = new Date(now().getTime() + FEE_NOTICE_DAYS * 86_400_000).toISOString();
      const next = { basisPoints, refunded, from, by, reason: why };
      if (!email) throw new ControlError(503, "The control room can't email the press here, so the fee wasn't changed.");
      if (!row.ownerEmail) throw new ControlError(409, "That shop has no owner email to tell, so the fee wasn't changed.");
      await log(shopId, "fee-change-scheduled", { by, reason: why, from: own, to: { basisPoints, refunded }, startsAt: from });
      await registry.updateShop(shopId, { platformFee: { ...own, next } });
      await email.sendPlatform({
        kind: "platform-fee-changing", to: row.ownerEmail, shopId, idempotencyKey: `platform-fee/${shopId}/${basisPoints}/${refunded}/${from.slice(0, 10)}`,
        data: { pressName: row.pressName ?? shopId, fromPercent: own.basisPoints / 100, toPercent: basisPoints / 100, refunded, startsOn: dateText(from), link: `${(settings ? await settings() : platformSettings({})).platformUrl}/account/billing?shop=${encodeURIComponent(shopId)}` },
      });
      return { shopId, changed: true, fee: own, next };
    },

    /**
     * One switch for every live shop at once (9.7), each changed, logged and published as one shop's switch is; one
     * shop's trouble doesn't stop the others and is reported.
     */
    async switchAll(claims, { name, on, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!SWITCHES.includes(name)) throw new ControlError(400, `There's no switch called ${name}.`);
      if (typeof on !== "boolean") throw new ControlError(400, "Say on or off.");
      reasonOf(reason);
      const shops = [];
      for (const row of await registry.listShops()) {
        if (row.status !== "live") continue;
        try {
          const done = await setSwitch({ by, shopId: row.shopId, name, on, reason });
          shops.push({ shopId: row.shopId, changed: done.changed });
        } catch (error) {
          shops.push({ shopId: row.shopId, error: error.message });
        }
      }
      return { switch: name, to: on, shops };
    },

    /** The switch defaults new shops get (9.7): every switch, off unless saved on. */
    async newShopSwitches(claims) {
      adminOf(claims, admins, now().getTime());
      const saved = platformState ? await platformState.get(NEW_SHOP_SWITCHES) : null;
      return { switches: shopSwitches(saved?.values), updatedAt: saved?.updatedAt ?? null, updatedBy: saved?.updatedBy ?? null };
    },

    async setNewShopSwitch(claims, { name, on, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!SWITCHES.includes(name)) throw new ControlError(400, `There's no switch called ${name}.`);
      if (typeof on !== "boolean") throw new ControlError(400, "Say on or off.");
      const why = reasonOf(reason);
      if (!platformState) throw new ControlError(503, "The platform's records aren't set up here, so nothing was saved.");
      const saved = await platformState.get(NEW_SHOP_SWITCHES);
      const values = shopSwitches(saved?.values);
      if (values[name] === on) return { switches: values, changed: false };
      values[name] = on;
      await platformState.set(NEW_SHOP_SWITCHES, { values, updatedAt: at(), updatedBy: by });
      if (activity) await activity.record(activityEntry({ at: at(), by, what: "new-shop-switch", detail: { switch: name, to: on, reason: why } }));
      return { switches: values, changed: true };
    },

    /** Today (9.2): the numbers, monthly income and everything that needs a person. */
    async today(claims) {
      adminOf(claims, admins, now().getTime());
      const rows = await registry.listShops();
      const profiles = {}, checks = {}, open = {};
      for (const row of rows) {
        profiles[row.shopId] = await registry.getProfile(row.shopId);
        checks[row.shopId] = await registry.readReleaseChecks(row.shopId);
        open[row.shopId] = repairs ? await repairs.open(row.shopId) : [];
      }
      return todaySummary({
        rows, profiles, checks, open, now: now(),
        settings: settings ? await settings() : platformSettings({}),
        support: supportStore ? await supportStore.list({ status: "open", limit: 200 }) : [],
        recoveries: recoveryStore ? await recoveryStore.list({ status: "waiting" }) : [],
        making: signups ? (await signups.list()).filter((s) => s.status !== "ready") : [],
      });
    },

    /** The repair queue: open items (or fixed ones), newest first. */
    async repairs(claims, { status = "open" } = {}) {
      adminOf(claims, admins, now().getTime());
      if (!repairs) return { repairs: [] };
      if (!["open", "fixed"].includes(status)) throw new ControlError(400, "Choose open or fixed.");
      return { repairs: await repairs.list({ status }) };
    },

    /** A person marks a repair fixed, with what they did. */
    async markFixed(claims, { id, note } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!repairs) throw new ControlError(404, "There's no repair queue.");
      const item = await repairs.markFixed(id, { by, note: typeof note === "string" ? note.trim() : "" });
      if (!item) throw new ControlError(404, "That repair isn't there.");
      return { repair: item };
    },

    /** Runs the self-checks for one shop now (the page's "Check now"). */
    async checkNow(claims, { shopId } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!selfCheck) throw new ControlError(404, "The self-checks aren't set up.");
      await shopOr404(shopId);
      return selfCheck.check(shopId, { why: `asked by ${by}` });
    },

    /**
     * "Close this shop" for abuse (plan 8.4): its checkout and pages close (closure.js), with a reason. Logged before
     * anything changes. Closing a closed shop changes nothing.
     */
    async closeShop(claims, { shopId, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      const row = await shopOr404(shopId);
      if (row.closure) return { shopId, closed: true, changed: false, at: row.closure.at };
      const hasPages = Boolean(PLANS[row.plan]?.shop);
      if (hasPages && !shopData) throw new ControlError(503, "The control room can't reach the shop's settings, so nothing was closed.");
      const settings = hasPages ? await shopData.get(shopId, SETTINGS_DOC) : null;
      const closure = { by, reason: why, at: at(), pauseBefore: settings?.maintenance ?? null };
      await log(shopId, "shop-closed", { by, reason: why });
      // The registry first: from here the payment service refuses the shop, even before its pause page is on.
      await registry.updateShop(shopId, { closure });
      if (hasPages && !isPaused(settings)) await shopData.set(shopId, SETTINGS_DOC, pausedSettings(settings));
      return { shopId, closed: true, changed: true, at: closure.at };
    },

    /** Opens a closed shop again: its pause goes back to what it was before, with a reason in the log. */
    async reopenShop(claims, { shopId, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      const row = await shopOr404(shopId);
      if (!row.closure) return { shopId, closed: false, changed: false };
      const hasPages = Boolean(PLANS[row.plan]?.shop);
      if (hasPages && !shopData) throw new ControlError(503, "The control room can't reach the shop's settings, so nothing was opened.");
      await log(shopId, "shop-reopened", { by, reason: why, closedBy: row.closure.by, closedAt: row.closure.at });
      if (hasPages) await shopData.set(shopId, SETTINGS_DOC, restoredSettings(await shopData.get(shopId, SETTINGS_DOC), row.closure.pauseBefore));
      await registry.updateShop(shopId, { closure: null, lastClosure: { ...row.closure, reopenedBy: by, reopenedAt: at(), reopenReason: why } });
      return { shopId, closed: false, changed: true };
    },

    /**
     * The emergency payments switch (plan 8.5): one shop, or every live shop (`all: true`), to the press's own Stripe
     * keys ("own"), to Square ("square"), or back to the platform's Stripe ("platform"). Each press is emailed at once.
     */
    async movePayments(claims, { shopId, all, to, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!PAYMENT_ROUTES.includes(to)) throw new ControlError(400, "Choose own keys, Square or back to the platform.");
      const why = reasonOf(reason);
      if (all !== true) await shopOr404(shopId);
      if (!paymentsSwitch) throw new ControlError(503, "The emergency payments switch isn't set up here, so nothing was moved.");
      return paymentsSwitch.move({ by, reason: why, to, shopId, all: all === true });
    },

    /** The breach register (plan 8.6): every entry, newest first, and who the privacy contact is. */
    async breaches(claims) {
      adminOf(claims, admins, now().getTime());
      if (!breaches) return { breaches: [], privacyContact: people.privacyContact ?? null };
      return { breaches: await breaches.list(), privacyContact: people.privacyContact ?? null };
    },

    async recordBreach(claims, details = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!breaches) throw new ControlError(503, "The breach register isn't set up here, so nothing was written.");
      return { breach: await breaches.record({ ...details, by }) };
    },

    async updateBreach(claims, { id, reportedToCommissioner, peopleTold, note } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!breaches) throw new ControlError(503, "The breach register isn't set up here, so nothing was written.");
      return { breach: await breaches.update({ by, id, reportedToCommissioner, peopleTold, note }) };
    },

    /**
     * Turns a shop's newsletter back on after it paused itself (too many spam reports or bounces, plan 8.3), once the
     * press has cleaned its list. Logged with the reason; receipts never stopped, so there is nothing else to restart.
     */
    async resumeNewsletter(claims, { shopId, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      if (!newsletters) throw new ControlError(404, "The newsletter pause isn't set up.");
      await shopOr404(shopId);
      const { resumed } = await newsletters.resume(shopId, { by, reason: why });
      if (!resumed) throw new ControlError(409, "That shop's newsletter isn't paused.");
      await log(shopId, "newsletter-resumed", { by, reason: why });
      return { shopId, resumed };
    },

    /** The control room's switch button. */
    async switch(claims, { shopId, name, on, reason } = {}) {
      return setSwitch({ by: adminOf(claims, admins, now().getTime()), shopId, name, on, reason });
    },
  };
}
