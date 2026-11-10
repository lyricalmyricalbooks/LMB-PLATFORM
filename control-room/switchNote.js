// The stuck-switch note (control room, follow-up to #450): once a day, an email to the platform owner
// (PLATFORM_ADMIN_EMAIL, else the alert address HEALTH_ALERT_TO; server/jobs.js) naming each press whose switch between
// Stripe and Square (control-room/providerSwitch.js) passed two days without finishing in the last day. After a day the
// press's own Payments page says "Colophon is on it", so this is what makes that true when the owner isn't looking at
// Today. Each switch is named once, on the day it crosses two days, so a long wait never nags every morning; Today and
// the Shops list's "Switch not finished" filter keep showing it until it is done.
//
// The same morning note names each live Stripe press whose payouts Stripe paused two days ago (today.js payoutsPaused,
// paused since the row's `payments.stateAt`), also once: the press's money has stopped and they are the likeliest to
// leave. Today and the Shops list's "Payouts paused" filter keep showing it until Stripe pays again.
//
// Nothing new, no email. Safe to run twice: the email's key is the day. Read only. The test shop is left out, as on
// Today.
import { switchWaiting } from "./providerSwitch.js";
import { dateText } from "../services/billing/billing.js";
import { payoutsPaused } from "./today.js";

export const SWITCH_NOTE = "switch-stuck";
/** A switch waiting this many days gets named. */
export const STUCK_DAYS = 2;
const DAY = 86_400_000;

export async function switchNote({ registry, email, to, now = () => new Date() }) {
  const at = now();
  const stuckBefore = at.getTime() - STUCK_DAYS * DAY;
  const crossedToday = (iso) => { const t = Date.parse(iso ?? ""); return t <= stuckBefore && t > stuckBefore - DAY; };
  const rows = (await registry.listShops()).filter((row) => row && !row.testShop && !row.closure && !["closed", "abandoned"].includes(row.status));
  const waiting = rows
    .map((row) => ({ row, wait: switchWaiting(row) }))
    .filter(({ wait }) => wait && Number.isFinite(Date.parse(wait.since)));
  const crossed = waiting.filter(({ wait }) => crossedToday(wait.since));
  const stillWaiting = waiting.filter(({ wait }) => Date.parse(wait.since) <= stuckBefore - DAY).length;
  const paused = rows.filter((row) => payoutsPaused(row) && crossedToday(row.payments.stateAt))
    .map((row) => ({ shopId: row.shopId, pressName: row.pressName ?? row.shopId, since: dateText(row.payments.stateAt), pastDue: row.payments.pastDue === true }))
    .sort((a, b) => a.pressName.localeCompare(b.pressName));
  if (!crossed.length && !paused.length) return { sent: false, shops: 0, paused: 0, why: `no switch or payout pause passed ${STUCK_DAYS} days in the last day` };
  // A run with nobody to tell fails, so the jobs page and the late-job alert show it.
  if (!to) throw new Error("neither PLATFORM_ADMIN_EMAIL nor HEALTH_ALERT_TO is set, so the stuck-switch note has nobody to go to");
  const shops = crossed
    .map(({ row, wait }) => ({ shopId: wait.shopId, pressName: row.pressName ?? wait.shopId, from: wait.from, to: wait.to, since: dateText(wait.since), problem: wait.problem?.message ?? null }))
    .sort((a, b) => a.pressName.localeCompare(b.pressName));
  await email.sendPlatform({ kind: SWITCH_NOTE, to, idempotencyKey: `${SWITCH_NOTE}-${at.toISOString().slice(0, 10)}`, data: { shops, stillWaiting, days: STUCK_DAYS, paused } });
  return { sent: true, shops: shops.length, paused: paused.length };
}
