// Today (code plan 9.2): the control room opens on the numbers and on what needs the owner. Pure counting over the
// registry rows (each shop's `billing`, kept in step by services/billing) plus the queues, so it is tested without a
// server.
//
// Monthly income counts each paying shop at its plan's price (the row's `billing.amount` when billing keeps one, else
// today's price from the settings), less its own discount (`billing.percentOff`, the founding offer). A trial, a paused
// or a closed plan counts nothing; a shop whose card is being retried still counts, and shows under failed payments.
import { shopHealth } from "./controlRoom.js";
import { switchWaiting } from "./providerSwitch.js";

const DAY = 86_400_000;
/** " today", " since yesterday", " for 4 days": how long something has been wrong, or "" without a date. */
function sinceWords(iso, now) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((now.getTime() - t) / DAY);
  return days < 1 ? " today" : days === 1 ? " since yesterday" : ` for ${days} days`;
}
export const PAYING = new Set(["active", "past_due"]);
export const PAYMENT_PROBLEM = new Set(["past_due", "unpaid", "incomplete"]);
/** The lines about one shop the owner can snooze from Today (a drifting press has its own snooze, driftWatch.js). */
export const SNOOZABLE = Object.freeze(["shop", "payment", "move", "newsletter", "domain", "switch", "parcels"]);
export const SNOOZE_DAYS = 7;
export const MAX_SNOOZE_DAYS = 30;
/** Whether the owner snoozed this kind of line for this shop (`todaySnoozes` on the registry row) and it hasn't ended. */
export const needSnoozed = (row, kind, nowMs) => Date.parse(row?.todaySnoozes?.[kind]?.until ?? "") > nowMs;

/** A web address that runs out this soon shows on Today. */
export const DOMAIN_SOON_DAYS = 14;

/** One shop's monthly charge in cents, or 0 when it isn't paying. */
export function monthlyCents(row, settings) {
  const billing = row.billing ?? {};
  if (!PAYING.has(billing.status) || row.testShop === true) return 0;
  const plan = billing.plan ?? row.plan;
  const price = Number.isInteger(billing.amount) ? billing.amount : settings.prices?.[plan] ?? 0;
  const off = Number.isFinite(billing.percentOff) ? Math.min(Math.max(billing.percentOff, 0), 100) : 0;
  return Math.round(price * (1 - off / 100));
}

/**
 * The numbers and the "needs you" list. `rows` are registry rows; `open` gives a shop's open repairs; the rest are
 * lists already read: waiting support requests, recoveries to check, shops being made.
 */
export function todaySummary({ rows, settings, profiles = {}, checks = {}, open = {}, support = [], recoveries = [], making = [], opening = [], parcels = [], now = new Date() }) {
  const shops = rows.filter((row) => row.testShop !== true);
  const counts = {
    shops: shops.length,
    live: shops.filter((r) => r.status === "live" && !r.closure).length,
    ...planCounts(shops),
    signupsThisWeek: shops.filter((r) => r.createdAt && now.getTime() - Date.parse(r.createdAt) <= 7 * DAY).length,
    failedPayments: shops.filter((r) => PAYMENT_PROBLEM.has(r.billing?.status)).length,
  };
  const monthlyIncome = shops.reduce((sum, row) => sum + monthlyCents(row, settings), 0);

  const needs = [];
  for (const row of rows) {
    const health = shopHealth({ row, profile: profiles[row.shopId] ?? null, checks: checks[row.shopId] ?? [], repairs: open[row.shopId] ?? [] });
    if (health.level === "problem") needs.push({ kind: "shop", shopId: row.shopId, words: `${row.pressName ?? row.shopId}: ${health.reasons[0]}`, go: "#shops" });
  }
  for (const row of shops.filter((r) => PAYMENT_PROBLEM.has(r.billing?.status))) {
    needs.push({ kind: "payment", shopId: row.shopId, words: `${row.pressName ?? row.shopId}: their plan payment failed`, go: "#shops" });
  }
  // Paying presses drifting away (driftWatch.js keeps `drift` on the row once a day).
  // A press the owner snoozed stays off until the snooze ends.
  for (const row of shops.filter((r) => r.drift?.level === "drifting" && PAYING.has(r.billing?.status) && !(Date.parse(r.drift.snoozedUntil ?? "") > now.getTime()))) {
    needs.push({ kind: "drift", shopId: row.shopId, words: `${row.pressName ?? row.shopId} may be drifting away: ${row.drift.reasons.join("; ")}${row.drift.checkedInAt ? " (check-in email sent)" : ""}`, go: "#shops" });
  }
  // A press part-way through moving its old shop over, with nothing ticked for a week (driftWatch.js moveStuck).
  for (const row of shops.filter((r) => r.moveStuck && r.status === "live" && !r.closure)) {
    const m = row.moveStuck;
    needs.push({ kind: "move", shopId: row.shopId, words: `${row.pressName ?? row.shopId} is part-way through moving from their old shop: ${m.done} of ${m.of} parts done, still to do ${m.left.map((t) => t.toLowerCase()).join(", ")} (last part done ${m.days} days ago${m.remindedAt ? `; the shop emailed them a reminder ${String(m.remindedAt).slice(0, 10)}` : ""})`, go: "#shops" });
  }
  // A newsletter that stopped part-way (driftWatch.js keeps `newsletterPaused` on the row once a day).
  for (const row of shops.filter((r) => r.newsletterPaused && r.status === "live" && !r.closure)) {
    const n = row.newsletterPaused;
    needs.push({ kind: "newsletter", shopId: row.shopId, words: `${row.pressName ?? row.shopId}'s newsletter${n.subject ? ` "${n.subject}"` : ""} stopped part-way${n.lastError ? `: ${n.lastError}` : ""}`, go: "#shops" });
  }
  // Web addresses (services/domains, the daily watch): one that stopped opening its shop, or runs out within two weeks.
  for (const row of rows) {
    for (const d of Array.isArray(row.domains) ? row.domains : []) {
      const name = `${row.pressName ?? row.shopId}: ${d.name}`;
      const left = Date.parse(d.expiresAt ?? "") - now.getTime();
      if (d.brokeAt) needs.push({ kind: "domain", shopId: row.shopId, words: `${name} stopped opening the shop${d.brokenEmailedAt ? " (the press was emailed)" : ""}`, go: "#shops" });
      else if (left > 0 && left <= DOMAIN_SOON_DAYS * DAY) needs.push({ kind: "domain", shopId: row.shopId, words: `${name} runs out in ${Math.ceil(left / DAY)} day${Math.ceil(left / DAY) === 1 ? "" : "s"} unless renewed`, go: "#shops" });
    }
  }
  // A press pressed Switch between Stripe and Square and the move isn't finished (providerSwitch.js): finished from the
  // shop's record, and until then both accounts take sales but the shop still runs the old one.
  for (const row of shops) {
    const waiting = switchWaiting(row);
    if (!waiting) continue;
    const to = waiting.to === "square" ? "Square" : "Stripe";
    const days = Math.floor((now.getTime() - Date.parse(waiting.since)) / DAY);
    needs.push({ kind: "switch", shopId: row.shopId, words: `${row.pressName ?? row.shopId} pressed Switch to move card payments to ${to} ${days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`} and it isn't finished${waiting.problem?.message ? ` (${String(waiting.problem.message).replace(/\.$/, "")})` : ""}: finish it from their record`, go: "#shops" });
  }
  // Chit Chats orders (chitChats.js shops): one line per shop whose details Chit Chats refused (nothing reaches it until
  // the press fixes them), with a problem order, or with an order late for tracking.
  for (const p of parcels.filter((x) => x.lastProblem || x.problems || x.late)) {
    const parts = [p.lastProblem ? `Chit Chats refused the shop's details${p.lastProblem.words ? ` (${String(p.lastProblem.words).replace(/\.$/, "")})` : ""}${sinceWords(p.lastProblem.at, now)}, so no order reaches it` : null, p.problems ? `${p.problems} ${p.lastProblem ? "" : "Chit Chats "}order${p.problems === 1 ? "" : "s"} with a problem` : null, p.late ? `${p.lateCount ?? 1} order${(p.lateCount ?? 1) === 1 ? "" : "s"} waiting over 3 days for tracking` : null].filter(Boolean);
    needs.push({ kind: "parcels", shopId: p.shopId, words: `${p.pressName ?? p.shopId}: ${parts.join(", and ")}`, go: "#apps" });
  }
  const repairCount = Object.values(open).reduce((n, list) => n + list.length, 0);
  if (repairCount) needs.push({ kind: "repairs", count: repairCount, words: `${repairCount} item${repairCount === 1 ? "" : "s"} in the repair queue`, go: "#repairs" });
  if (support.length) needs.push({ kind: "support", count: support.length, words: `${support.length} support request${support.length === 1 ? "" : "s"} waiting`, go: "#tickets" });
  if (recoveries.length) needs.push({ kind: "recovery", count: recoveries.length, words: `${recoveries.length} account recover${recoveries.length === 1 ? "y" : "ies"} to check`, go: "#recoveries" });
  const stuck = making.filter((s) => s.status === "failed" || s.status === "stopped" || s.canRetry);
  for (const press of opening) {
    const hours = Math.floor((now.getTime() - Date.parse(press.openedAt)) / 3_600_000);
    needs.push({ kind: "opening", pressId: press.pressId, words: `${press.pressName || press.ownerEmail}: pressed Open my shop ${hours < 48 ? `${hours} hours` : `${Math.floor(hours / 24)} days`} ago and the shop isn't live yet`, go: "#setting-up" });
  }
  if (stuck.length) needs.push({ kind: "signup", count: stuck.length, words: `${stuck.length} new shop${stuck.length === 1 ? "" : "s"} stuck while being made`, go: "#making" });

  // Lines the owner snoozed leave the list until the snooze ends, and are listed apart so they can be woken early.
  const byShop = new Map(rows.map((row) => [row.shopId, row]));
  const snoozed = [];
  const shown = needs.filter((need) => {
    const row = need.shopId ? byShop.get(need.shopId) : null;
    if (!row || !SNOOZABLE.includes(need.kind) || !needSnoozed(row, need.kind, now.getTime())) return true;
    snoozed.push({ ...need, until: row.todaySnoozes[need.kind].until });
    return false;
  });
  return { counts, monthlyIncome, currency: settings.currency, needs: shown, snoozed };
}

/**
 * Shops by where their plan stands, as Today counts them: on a free trial, paying (a card being retried still counts),
 * paused (no card, or closed by the platform) and closed. Pass rows without the test shop. Also used by the nightly
 * income record (incomeHistory.js, plan 19.7), so both count the same way.
 */
export function planCounts(shops) {
  const access = (row) => (row.closure ? "closed-by-platform" : row.billing?.access ?? null);
  return {
    trial: shops.filter((r) => r.billing?.status === "trialing").length,
    paying: shops.filter((r) => PAYING.has(r.billing?.status)).length,
    paused: shops.filter((r) => access(r) === "paused" || access(r) === "closed-by-platform").length,
    closed: shops.filter((r) => access(r) === "closed").length,
  };
}
