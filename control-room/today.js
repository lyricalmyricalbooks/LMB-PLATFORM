// Today (code plan 9.2): the control room opens on the numbers and on what needs the owner. Pure counting over the
// registry rows (each shop's `billing`, kept in step by services/billing) plus the queues, so it is tested without a
// server.
//
// Monthly income counts each paying shop at its plan's price (the row's `billing.amount` when billing keeps one, else
// today's price from the settings), less its own discount (`billing.percentOff`, the founding offer). A trial, a paused
// or a closed plan counts nothing; a shop whose card is being retried still counts, and shows under failed payments.
import { shopHealth } from "./controlRoom.js";

const DAY = 86_400_000;
export const PAYING = new Set(["active", "past_due"]);
export const PAYMENT_PROBLEM = new Set(["past_due", "unpaid", "incomplete"]);
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
export function todaySummary({ rows, settings, profiles = {}, checks = {}, open = {}, support = [], recoveries = [], making = [], now = new Date() }) {
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
  for (const row of shops.filter((r) => r.drift?.level === "drifting" && PAYING.has(r.billing?.status))) {
    needs.push({ kind: "drift", shopId: row.shopId, words: `${row.pressName ?? row.shopId} may be drifting away: ${row.drift.reasons.join("; ")}${row.drift.checkedInAt ? " (check-in email sent)" : ""}`, go: "#shops" });
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
  const repairCount = Object.values(open).reduce((n, list) => n + list.length, 0);
  if (repairCount) needs.push({ kind: "repairs", count: repairCount, words: `${repairCount} item${repairCount === 1 ? "" : "s"} in the repair queue`, go: "#repairs" });
  if (support.length) needs.push({ kind: "support", count: support.length, words: `${support.length} support request${support.length === 1 ? "" : "s"} waiting`, go: "#tickets" });
  if (recoveries.length) needs.push({ kind: "recovery", count: recoveries.length, words: `${recoveries.length} account recover${recoveries.length === 1 ? "y" : "ies"} to check`, go: "#recoveries" });
  const stuck = making.filter((s) => s.status === "failed" || s.status === "stopped" || s.canRetry);
  if (stuck.length) needs.push({ kind: "signup", count: stuck.length, words: `${stuck.length} new shop${stuck.length === 1 ? "" : "s"} stuck while being made`, go: "#making" });

  return { counts, monthlyIncome, currency: settings.currency, needs };
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
