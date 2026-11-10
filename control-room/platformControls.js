// The owner's controls over the platform itself (code plan 9.4, 9.5, 9.9): the platform settings that change without a
// release, the waitlist and its invites, and the activity log of every control-room action. Platform admins only, the
// same check as the rest of the control room (adminOf).
//
// Clients passed in (fakes.js has pretend ones):
//   settingsStore  the platform's small records (clients/stores.js firestorePlatformState): get(name); set(name, value)
//   env            the service's environment, read by services/settings.js
//   activity       the activity log (clients/stores.js firestoreActivity): record(entry); list({ shopId, limit })
//   waitlist       optional: the waitlist (clients/stores.js firestoreWaitlist): list() -> rows
//   invites        optional: waitlist/invites.js createInvites(...)
//   signups        optional: shops in the making (signup stores): list() -> rows
//   project        optional: the platform's Google project, for the Secret Manager link on the Launch page
//   keyEnv         optional: where the keys are read (the walkthrough passes pretend ones); default env
//   shopMaking     optional: whether Create my shop can make a press's Google project here (false on the hosted server
//                  until its Google access is connected)
import { EDITABLE, SETTINGS_RECORD, editableValues, liveSettings, platformSettings, savedSettingsProblems } from "../services/settings.js";
import { ControlError, MIN_REASON, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";
import { EMAIL_SECRETS } from "../services/email/index.js";
import { PAYMENTS_SECRETS } from "../services/payments/index.js";
import { BILLING_SECRETS } from "../services/billing/index.js";

/**
 * The keys the Launch page checks, in the order to add them. Their names come from their own services; the page gets
 * only whether each is there, never a value.
 */
const LAUNCH_KEYS = Object.freeze([
  { id: "stripe", label: "Stripe test key", key: PAYMENTS_SECRETS[0], getIt: "https://dashboard.stripe.com/test/apikeys",
    gives: "Plans, cards on file and presses connecting Stripe." },
  { id: "connect-events", label: "Stripe events secret (presses' payments)", key: PAYMENTS_SECRETS[1], events: "/api/payments/stripe/events",
    gives: "Tells the platform when a press's Stripe account or payment changes." },
  { id: "billing-events", label: "Stripe events secret (plans)", key: BILLING_SECRETS[0], events: "/api/billing/events",
    gives: "Tells the platform when a plan is paid, fails or ends." },
  { id: "email", label: "Email sending key", key: EMAIL_SECRETS[0], getIt: "https://resend.com/api-keys",
    gives: "Sign-in codes, receipts and every email to presses." },
]);

const reasonOf = (reason) => {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the activity log.`);
  return text.slice(0, 500);
};

export function createPlatformControls({ admins, settingsStore, env = process.env, activity, waitlist, invites, signups, project = null, shopMaking = true, keyEnv = env, now = () => new Date() }) {
  const at = () => now().toISOString();
  const record = async (entry) => (activity ? activity.record(activityEntry({ at: at(), ...entry })) : null);

  return {
    /** The editable settings: what each is now, what the environment alone says, and the words for the page. */
    async settings(claims) {
      adminOf(claims, admins, now().getTime());
      const saved = await settingsStore.get(SETTINGS_RECORD);
      const current = await liveSettings({ env, store: settingsStore });
      return {
        fields: Object.entries(EDITABLE).filter(([, field]) => !field.hidden).map(([path, field]) => ({ path, ...field })),
        values: editableValues(current),
        defaults: editableValues(platformSettings(env)),
        changed: Object.keys(saved?.values ?? {}),
        updatedAt: saved?.updatedAt ?? null,
        updatedBy: saved?.updatedBy ?? null,
      };
    },

    /**
     * Saves changed settings ({ path: value }), with a reason. A value equal to what the environment says is dropped,
     * so the saved record only holds real changes; `reset: [path]` drops a change. Each changed value is logged.
     */
    async saveSettings(claims, { values = {}, reset = [], reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      if (!Array.isArray(reset) || reset.some((path) => !EDITABLE[path])) throw new ControlError(400, "Only settings on this page can be reset.");
      const problems = savedSettingsProblems(values);
      if (problems.length) throw new ControlError(400, `Nothing was saved: ${problems.join("; ")}.`);
      const defaults = editableValues(platformSettings(env));
      const saved = await settingsStore.get(SETTINGS_RECORD);
      const before = editableValues(await liveSettings({ env, store: settingsStore }));
      const next = { ...(saved?.values ?? {}) };
      for (const path of reset) delete next[path];
      for (const [path, value] of Object.entries(values)) {
        if (value === defaults[path]) delete next[path];
        else next[path] = value;
      }
      const after = editableValues(await liveSettings({ env, store: { get: async () => ({ values: next }) } }));
      const changes = Object.keys(EDITABLE).filter((path) => before[path] !== after[path]).map((path) => ({ path, from: before[path], to: after[path] }));
      if (!changes.length) return { changed: [], values: after };
      await settingsStore.set(SETTINGS_RECORD, { values: next, updatedAt: at(), updatedBy: by });
      await record({ by, what: "settings-changed", detail: { changes, reason: why } });
      return { changed: changes, values: after };
    },

    /**
     * The Launch page: what the platform needs before a press can sign up, each key there or not (never its value), the
     * sign-up switch, and the addresses the walkthrough opens.
     */
    async launch(claims) {
      adminOf(claims, admins, now().getTime());
      const current = await liveSettings({ env, store: settingsStore });
      const platformUrl = current.platformUrl;
      return {
        project,
        platformUrl,
        signupOpen: current.signupOpen === true,
        invites: Boolean(invites),
        shopMaking: shopMaking === true,
        keys: LAUNCH_KEYS.map(({ id, label, key, getIt, events, gives }) => ({
          id, label, gives, secret: key.secret, ready: String(keyEnv[key.env] ?? "").trim() !== "",
          getIt: getIt ?? null, events: events ? `${platformUrl}${events}` : null,
        })),
      };
    },

    /** The waitlist, newest first, each marked invited or not, with the shops in the making. */
    async waitlist(claims) {
      adminOf(claims, admins, now().getTime());
      const rows = waitlist ? await waitlist.list() : [];
      const people = [];
      for (const row of rows) {
        people.push({
          email: row.email, name: row.name ?? "", press: row.press ?? "", plan: row.plan ?? "unsure",
          joinedAt: row.firstSignedUpAt ?? row.at ?? null,
          invited: invites ? await invites.isInvited(row.email) : false,
        });
      }
      people.sort((a, b) => String(b.joinedAt ?? "").localeCompare(String(a.joinedAt ?? "")));
      // Shops being made, and ready shops whose plan change (an app added or dropped) has stopped (signup/shopMaker.js).
      const signupRows = signups ? await signups.list() : [];
      const making = signupRows.filter((row) => row.status !== "ready").map(({ shopId, pressName, ownerEmail, status, message, canRetry, createdAt }) => ({ shopId, pressName, ownerEmail, status, message: message ?? null, canRetry: canRetry === true, createdAt }));
      const planStops = signupRows.filter((row) => row.status === "ready" && row.planSync).map(({ shopId, pressName, ownerEmail, planSync, createdAt }) => ({
        shopId, pressName, ownerEmail, status: "plan-change-stopped", createdAt, canRetry: planSync.needsHelp === true,
        message: `Moving to the ${planSync.plan} plan stopped at step ${planSync.failedStep ?? "?"}${planSync.needsHelp ? " and needs you" : `, tried ${planSync.tries} time${planSync.tries === 1 ? "" : "s"}`}: ${planSync.error ?? "no reason given"}`,
      }));
      return {
        waiting: people.filter((p) => !p.invited).length,
        people,
        inTheMaking: [...making, ...planStops],
      };
    },

    /** Invites one address from the waitlist (or any address). A repeat sends nothing new. */
    async invite(claims, { email } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      if (!invites) throw new ControlError(503, "Invites aren't set up here, so nobody was invited.");
      let result;
      try {
        result = await invites.invite({ by, to: email });
      } catch (error) {
        if (error?.status === 400) throw new ControlError(400, error.message);
        throw error;
      }
      if (result.sent) await record({ by, what: "waitlist-invite", detail: { email: result.email } });
      return result;
    },

    /**
     * Try again for a shop whose making stopped (the shop maker's sweep picks it up). Unlike the press's own button,
     * this also restarts a stop that needed a person, once the person (you) has fixed what stopped it, and a stopped
     * plan change on a ready shop. Logged.
     */
    async retry(claims, { shopId, reason } = {}) {
      const by = adminOf(claims, admins, now().getTime());
      const why = reasonOf(reason);
      const row = signups && typeof shopId === "string" ? await signups.get(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop being made with that id.");
      // A ready shop whose plan change stopped: the next sweep tries the change again at once.
      if (row.status === "ready" && row.planSync) {
        await signups.set(shopId, { ...row, planSync: null });
        await record({ by, what: "plan-change-retry", shopId, detail: { reason: why, plan: row.planSync.plan, step: row.planSync.failedStep ?? null } });
        return { shopId, status: "ready", changed: true };
      }
      if (["ready", "queued", "making"].includes(row.status)) return { shopId, status: row.status, changed: false };
      await signups.set(shopId, { ...row, status: "queued", message: null, canRetry: false, nextTryAt: null, attempts: 0 });
      await record({ by, what: "signup-retry", shopId, detail: { reason: why, was: row.status } });
      return { shopId, status: "queued", changed: true };
    },

    /** The activity log, newest first; one shop's only with `shopId`. Read only. */
    async activity(claims, { shopId, limit = 200 } = {}) {
      adminOf(claims, admins, now().getTime());
      if (!activity) return { entries: [] };
      const n = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : 200;
      return { entries: await activity.list({ shopId: typeof shopId === "string" && shopId ? shopId : null, limit: n }) };
    },
  };
}

export function platformRoutes(controls) {
  const body = (request) => (request.body && typeof request.body === "object" ? request.body : {});
  return {
    "GET /api/control/settings": (claims) => controls.settings(claims),
    "GET /api/control/launch": (claims) => controls.launch(claims),
    "POST /api/control/settings": (claims, request) => controls.saveSettings(claims, body(request)),
    "GET /api/control/waitlist": (claims) => controls.waitlist(claims),
    "POST /api/control/invite": (claims, request) => controls.invite(claims, body(request)),
    "POST /api/control/retry": (claims, request) => controls.retry(claims, body(request)),
    "POST /api/control/activity": (claims, request) => controls.activity(claims, body(request)),
  };
}
