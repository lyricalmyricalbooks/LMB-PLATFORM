// The weekly summary (control room features, 11 November 2026): every Monday morning one email to the platform owner
// (PLATFORM_ADMIN_EMAIL, else HEALTH_ALERT_TO; server/jobs.js) with this month's plan income, the shops that started
// this week, the shops that said they are leaving this week, and what Today still has waiting.
// Reads the same numbers as Today (today.js todaySummary), so the email and the control room never disagree.
// Safe to run twice: the email's key is the week, so a retry in the same week never sends a second one.
import { todaySummary } from "./today.js";
import { isoWeek } from "./deletionNote.js";

const DAY = 86_400_000;
export const WEEKLY_SUMMARY = "weekly-summary";
/** At most this many waiting lines are written out; the rest are counted. */
export const SUMMARY_LINES = 8;

export function summaryOf(rows, settings, now = new Date()) {
  const today = todaySummary({ rows, settings, now });
  const shops = rows.filter((r) => r.testShop !== true);
  const recent = (iso) => Boolean(iso) && now.getTime() - Date.parse(iso) <= 7 * DAY;
  const started = shops.filter((r) => recent(r.createdAt)).map((r) => r.pressName ?? r.shopId);
  const leaving = shops.filter((r) => recent(r.billing?.leaving?.at) && !r.billing.leaving.keptAt).map((r) => r.pressName ?? r.shopId);
  return {
    income: today.monthlyIncome, currency: today.currency ?? "CAD", live: today.counts.live,
    started, leaving, waiting: today.needs.length, lines: today.needs.slice(0, SUMMARY_LINES).map((n) => n.words),
  };
}

export async function weeklySummary({ registry, email, to, settings = {}, now = () => new Date() }) {
  const at = now();
  if (!to) throw new Error("neither PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO is set, so the weekly summary has nobody to go to");
  const data = summaryOf(await registry.listShops(), settings, at);
  await email.sendPlatform({ kind: WEEKLY_SUMMARY, to, idempotencyKey: `${WEEKLY_SUMMARY}-${isoWeek(at)}`, data });
  return { sent: true, waiting: data.waiting };
}
