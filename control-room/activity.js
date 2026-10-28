// The control room's activity log (code plan 9.9): every action any platform admin takes, newest first, kept a year.
// Shop actions are also in the registry and the shop's own audit log (controlRoom.js `log`); platform-wide ones
// (settings, invites) are only here. Stored as controlActivity/<id> in the platform project (clients/stores.js
// firestoreActivity), which no browser can read or write.
import { createHash } from "node:crypto";

/** How long the activity log keeps an entry. */
export const ACTIVITY_DAYS = 365;

/** One activity entry: who did what, when, to which shop (or the platform), kept a year. */
export function activityEntry({ at, by, what, shopId = null, detail = {} }) {
  const id = `${at}-${what}-${createHash("sha256").update(JSON.stringify({ by, shopId, detail })).digest("hex").slice(0, 10)}`;
  const keepUntil = new Date(Date.parse(at) + ACTIVITY_DAYS * 86_400_000).toISOString();
  return { id, at, by: by ?? null, what, shopId, detail, keepUntil };
}

