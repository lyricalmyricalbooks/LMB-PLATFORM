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
import { EDITABLE, SETTINGS_RECORD, editableValues, liveSettings, platformSettings, savedSettingsProblems } from "../services/settings.js";
import { ControlError, MIN_REASON, adminOf } from "./controlRoom.js";
import { activityEntry } from "./activity.js";

const reasonOf = (reason) => {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < MIN_REASON) throw new ControlError(400, `Say why, in at least ${MIN_REASON} characters. It goes in the activity log.`);
  return text.slice(0, 500);
};

export function createPlatformControls({ admins, settingsStore, env = process.env, activity, waitlist, invites, signups, now = () => new Date() }) {
  const at = () => now().toISOString();
  const record = async (entry) => (activity ? activity.record(activityEntry({ at: at(), ...entry })) : null);

  return {
    /** The editable settings: what each is now, what the environment alone says, and the words for the page. */
    async settings(claims) {
      adminOf(claims, admins);
      const saved = await settingsStore.get(SETTINGS_RECORD);
      const current = await liveSettings({ env, store: settingsStore });
      return {
        fields: Object.entries(EDITABLE).map(([path, field]) => ({ path, ...field })),
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
      const by = adminOf(claims, admins);
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

    /** The waitlist, newest first, each marked invited or not, with the shops in the making. */
    async waitlist(claims) {
      adminOf(claims, admins);
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
      const making = signups ? (await signups.list()).filter((row) => row.status !== "ready") : [];
      return {
        waiting: people.filter((p) => !p.invited).length,
        people,
        inTheMaking: making.map(({ shopId, pressName, ownerEmail, status, message, canRetry, createdAt }) => ({ shopId, pressName, ownerEmail, status, message: message ?? null, canRetry: canRetry === true, createdAt })),
      };
    },

    /** Invites one address from the waitlist (or any address). A repeat sends nothing new. */
    async invite(claims, { email } = {}) {
      const by = adminOf(claims, admins);
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
     * this also restarts a stop that needed a person, once the person (you) has fixed what stopped it. Logged.
     */
    async retry(claims, { shopId, reason } = {}) {
      const by = adminOf(claims, admins);
      const why = reasonOf(reason);
      const row = signups && typeof shopId === "string" ? await signups.get(shopId) : null;
      if (!row) throw new ControlError(404, "There's no shop being made with that id.");
      if (["ready", "queued", "making"].includes(row.status)) return { shopId, status: row.status, changed: false };
      await signups.set(shopId, { ...row, status: "queued", message: null, canRetry: false, nextTryAt: null, attempts: 0 });
      await record({ by, what: "signup-retry", shopId, detail: { reason: why, was: row.status } });
      return { shopId, status: "queued", changed: true };
    },

    /** The activity log, newest first; one shop's only with `shopId`. Read only. */
    async activity(claims, { shopId, limit = 200 } = {}) {
      adminOf(claims, admins);
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
    "POST /api/control/settings": (claims, request) => controls.saveSettings(claims, body(request)),
    "GET /api/control/waitlist": (claims) => controls.waitlist(claims),
    "POST /api/control/invite": (claims, request) => controls.invite(claims, body(request)),
    "POST /api/control/retry": (claims, request) => controls.retry(claims, body(request)),
    "POST /api/control/activity": (claims, request) => controls.activity(claims, body(request)),
  };
}
