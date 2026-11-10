// Apps closing (after the plan-choice work, 3 November 2026): every shop with an app its plan dropped that closes at the
// end of the month it paid for, soonest first, with whether the week-before reminder has gone out. A word from the
// platform may save a stockroom full of records the press forgot to download. With it, how often presses dropped an
// app over the last six months and then kept it: many keeps would mean the plan page's drop is confusing.
//
// With them: the closed apps still holding records (their 90 days to download, then waiting to be deleted, with any
// problem deleting them), why presses dropped apps, and a closing email that bounced, so nobody loses records unwarned.
//
// Pure reading of the registry rows (services/billing writes `billing.appsClosing`, `billing.appDrops` and `closedApps`
// there; the email webhook `closingEmailBounce`). The test shop never counts.

import { DROP_REASONS } from "../services/billing/closedApps.js";
import { PLAN_APPS } from "../services/billing/plans.js";

const DAY = 86_400_000;
const SIX_MONTHS = 183 * DAY;
const APP_WORDS = Object.freeze({ shop: "Website", stockroom: "Stockroom" });

/** A closing email that bounced for good in the last 30 days (services/billing/closedApps.js closingBounceRecorder). */
const bounceOf = (row, nowMs) => (row.closingEmailBounce && nowMs - Date.parse(row.closingEmailBounce.at) <= 30 * DAY ? row.closingEmailBounce : null);

export function appsClosing(rows, now = new Date()) {
  const nowMs = now.getTime();
  const shops = [];
  const closed = [];
  const drops = { dropped: 0, kept: 0, closed: 0, waiting: 0, reasons: {} };
  // Every shop gets the website and the stockroom (10 November 2026): shops still on an older plan, or whose missing app
  // is still being built, until billing's daily sweep and the shop maker have moved them.
  const moving = [];
  for (const row of rows) {
    if (row.testShop === true) continue;
    const who = { shopId: row.shopId, pressName: row.pressName ?? row.shopId, ownerEmail: row.ownerEmail ?? null, bounced: bounceOf(row, nowMs) };
    const gone = row.status === "abandoned" || ["closed", "deleted"].includes(row.closing?.stage);
    if (!gone && PLAN_APPS[row.plan] && (row.plan !== "both" || (row.builtPlan && row.builtPlan !== "both"))) {
      const has = PLAN_APPS[row.builtPlan ?? row.plan] ?? PLAN_APPS[row.plan];
      moving.push({ ...who, gets: Object.keys(APP_WORDS).filter((app) => !has[app]).map((app) => APP_WORDS[app]).join(" and ") || "Nothing", step: row.plan === "both" ? "Being built" : "Plan moves tonight" });
    }
    const closing = row.billing?.appsClosing;
    if (closing?.apps?.length && closing.at) {
      shops.push({
        ...who,
        apps: closing.apps.map((app) => APP_WORDS[app] ?? app).join(" and "),
        closesAt: closing.at,
        daysLeft: Math.max(0, Math.ceil((Date.parse(closing.at) - nowMs) / DAY)),
        reminded: closing.reminded ?? null,
      });
    }
    // Closed apps still holding records: in their 90 days to download, or past them and waiting to be deleted.
    // A shop deleted whole took its closed apps with it (billing afterClosing skips it too): nothing left to list.
    for (const [app, entry] of Object.entries(row.closing?.stage === "deleted" ? {} : row.closedApps ?? {})) {
      if (!entry?.downloadUntil || entry.deletedAt || PLAN_APPS[row.plan]?.[app]) continue;
      const left = Math.ceil((Date.parse(entry.downloadUntil) - nowMs) / DAY);
      closed.push({ ...who, app: APP_WORDS[app] ?? app, downloadUntil: entry.downloadUntil, daysLeft: Math.max(0, left), overdue: left <= 0, warnedAt: entry.warnedAt ?? null, problem: entry.problem ?? null });
    }
    for (const drop of row.billing?.appDrops ?? []) {
      if (!(nowMs - Date.parse(drop.at) <= SIX_MONTHS)) continue;
      drops.dropped += 1;
      drops[drop.keptAt ? "kept" : drop.closedAt ? "closed" : "waiting"] += 1;
      if (drop.reason) drops.reasons[drop.reason] = (drops.reasons[drop.reason] ?? 0) + 1;
    }
  }
  shops.sort((a, b) => a.daysLeft - b.daysLeft || a.pressName.localeCompare(b.pressName));
  // The ones waiting to be deleted first (something is stuck), then the downloads ending soonest.
  closed.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.daysLeft - b.daysLeft || a.pressName.localeCompare(b.pressName));
  moving.sort((a, b) => a.pressName.localeCompare(b.pressName));
  return { moving, shops, closed, drops, reasonWords: DROP_REASONS };
}
