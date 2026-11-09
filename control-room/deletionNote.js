// The weekly deletion note (closing apps, round three, 3 November 2026): once a week, an email to the platform owner
// (PLATFORM_ADMIN_EMAIL, else the alert address HEALTH_ALERT_TO; server/jobs.js) listing every closed app whose records are deleted within the next week, and any one past its
// date that is still waiting (deleting it failed, or the deletion client isn't connected). A last look before records
// go for good: a press that wrote in can be helped while there is still something to help with.
//
// Reads the same list as the control room's Apps closing page (appsClosing.js `closed`). Nothing to list, no email.
// Safe to run twice: the email's key is the week, so a retry in the same week never sends a second one.
import { appsClosing } from "./appsClosing.js";
import { dateText } from "../services/billing/billing.js";

const DAY = 86_400_000;
/** The note covers deletions due within this many days: a week plus one, so a late run never leaves a gap. */
export const NOTE_DAYS = 8;
export const DELETION_NOTE = "apps-deleting-soon";

/** The ISO week of a date, e.g. "2026-W45": the email's idempotency key. */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7)).padStart(2, "0")}`;
}

/** The closed apps the note lists: deleted within NOTE_DAYS, or overdue. */
export function dueForDeletion(rows, now = new Date()) {
  return appsClosing(rows, now).closed.filter((c) => c.overdue || Date.parse(c.downloadUntil) - now.getTime() <= NOTE_DAYS * DAY);
}

export async function weeklyDeletionNote({ registry, email, to, now = () => new Date() }) {
  const at = now();
  const due = dueForDeletion(await registry.listShops(), at);
  if (!due.length) return { sent: false, listed: 0, why: "nothing is due for deletion this week" };
  // A run with nobody to tell fails, so the jobs page and the late-job alert show it.
  if (!to) throw new Error("neither PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO is set, so the weekly deletion note has nobody to go to");
  const apps = due.map(({ shopId, pressName, ownerEmail, app, downloadUntil, overdue, warnedAt, problem, bounced }) => ({
    shopId, pressName, ownerEmail, app, date: dateText(downloadUntil), overdue, warned: warnedAt ? dateText(warnedAt) : null, problem, bounced: Boolean(bounced),
  }));
  await email.sendPlatform({ kind: DELETION_NOTE, to, idempotencyKey: `${DELETION_NOTE}-${isoWeek(at)}`, data: { apps } });
  return { sent: true, listed: apps.length };
}
