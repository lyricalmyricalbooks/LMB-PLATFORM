// Income over time (code plan 19.7). Once a night the platform writes one record of its own income: what Today shows
// right now (monthly income, shops paying, on a free trial, paused and closed), counted the same way (today.js), plus
// what moved since the night before: new paying shops, plans moved up or down, shops lost, and free trials that became
// paying. The control room's Today page draws the last 12 months as a line from these records.
//
// One record per day, keyed by the day in Toronto (`YYYY-MM-DD`):
//
//   {
//     day, at, currency,
//     incomeCents, paying, trial, paused, closed,
//     atRisk: { count, cents }   paying presses the drift watch marks drifting or to watch, and what they pay a month
//     first          true on the first night ever (nothing to compare with, so no movements)
//     moves: {
//       newPaying, newPayingCents       shops paying tonight that weren't last time (a trial that converted included)
//       upgrades, upgradeCents          paying both times, paying more now (a bigger plan)
//       downgrades, downgradeCents      paying both times, paying less now (a smaller plan)
//       lost, lostCents                 paying last time, not paying now (paused, closed or gone)
//       trialToPaid                     on a free trial last time, paying now
//       trialEnded                      on a free trial last time and not now (paying or not): the rate's bottom line
//     }
//     shops: { <shopId>: { state, cents } }   each shop tonight, for the next night's movements
//   }
//
// The test shop never counts. Running twice on the same day writes the same key with the same numbers: the movements
// are always against the last record before today, never against today's own.
//
// Store (fakes.js `fakeIncomeHistory`, clients/stores.js `firestoreIncomeHistory`):
//   get(day) -> record | null; set(day, record); list({ since }) -> records with day >= since, oldest first
import { PAYING, billingCurrency, incomeByCurrency, monthlyCents, planCounts } from "./today.js";
import { atRiskSummary } from "./driftWatch.js";

const DAY = 86_400_000;
/** How far back the trial-to-paying rate looks. */
export const TRIAL_RATE_DAYS = 90;

/** The day in Toronto, `YYYY-MM-DD`: the key of that night's record. */
export function dayKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The month `back` months before the month of `day` ("2026-11-02", 1 -> "2026-10"). */
function monthBefore(day, back) {
  const [year, month] = day.split("-").map(Number);
  const index = year * 12 + (month - 1) - back;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Where one shop's plan stands tonight, in one word. */
function stateOf(row) {
  const billing = row.billing ?? {};
  if (PAYING.has(billing.status)) return "paying";
  if (billing.status === "trialing") return "trial";
  if (row.closure || billing.access === "paused") return "paused";
  if (billing.access === "closed") return "closed";
  return "none";
}

/** What moved between two nights' shops. */
export function movements(before, after) {
  const moves = { newPaying: 0, newPayingCents: 0, upgrades: 0, upgradeCents: 0, downgrades: 0, downgradeCents: 0, lost: 0, lostCents: 0, trialToPaid: 0, trialEnded: 0 };
  for (const shopId of new Set([...Object.keys(before), ...Object.keys(after)])) {
    // Money moves in the platform's own currency only: a shop billed in another counts in the numbers, not the cents.
    const home = (shop) => (shop && !shop.currency ? shop : shop ? { ...shop, cents: 0 } : null);
    const was = home(before[shopId]) ?? { state: "none", cents: 0 };
    const now = home(after[shopId]) ?? { state: "none", cents: 0 };
    if (was.state === "trial" && now.state !== "trial") moves.trialEnded += 1;
    if (now.state === "paying" && was.state !== "paying") {
      moves.newPaying += 1;
      moves.newPayingCents += now.cents;
      if (was.state === "trial") moves.trialToPaid += 1;
    } else if (was.state === "paying" && now.state !== "paying") {
      moves.lost += 1;
      moves.lostCents += was.cents;
    } else if (was.state === "paying" && now.state === "paying" && now.cents !== was.cents) {
      if (now.cents > was.cents) {
        moves.upgrades += 1;
        moves.upgradeCents += now.cents - was.cents;
      } else {
        moves.downgrades += 1;
        moves.downgradeCents += was.cents - now.cents;
      }
    }
  }
  return moves;
}

/**
 * Tonight's record, written under today's key. `registry` lists the shops (their `billing`, kept in step by
 * services/billing); `settings` gives the prices and currency (services/settings.js). Returns the record.
 */
export async function snapshotIncome({ registry, settings, store, now = new Date() }) {
  const day = dayKey(now);
  const shops = (await registry.listShops()).filter((row) => row.testShop !== true);
  const tonight = {};
  const home = String(settings.currency ?? "CAD").toUpperCase();
  // Each shop in its own billing currency; the income line and the movements count the platform's own currency only.
  for (const row of shops) {
    const currency = billingCurrency(row, settings);
    tonight[row.shopId] = { state: stateOf(row), cents: monthlyCents(row, settings), ...(currency !== home ? { currency } : {}) };
  }
  const byCurrency = incomeByCurrency(shops, settings);
  // The night before (or the last night that ran): never today's own record, so a second run gives the same numbers.
  const risk = atRiskSummary(shops, settings, now.getTime());
  const earlier = (await store.list({ since: monthBefore(day, 13) })).filter((r) => r.day < day).at(-1) ?? null;
  const record = {
    day,
    at: now.toISOString(),
    currency: settings.currency,
    incomeCents: byCurrency[home] ?? 0,
    otherIncome: Object.fromEntries(Object.entries(byCurrency).filter(([code]) => code !== home)),
    ...planCounts(shops),
    atRisk: { count: risk.presses.length, cents: risk.drifting.monthlyCents + risk.watch.monthlyCents },
    first: !earlier,
    moves: movements(earlier?.shops ?? tonight, tonight),
    shops: tonight,
  };
  await store.set(day, record);
  return record;
}

const sum = (records, field) => records.reduce((total, r) => total + (r.moves?.[field] ?? 0), 0);

/**
 * The line and the figures for Today: each of the last `months` months at its last record (its month-end value), then
 * this month so far; money kept (new paying shops and bigger plans) and lost (smaller plans and shops lost) this
 * month, in cents; and how many free trials became paying over the last 90 days.
 */
export async function history({ store, months = 12, now = new Date() }) {
  const today = dayKey(now);
  const keys = Array.from({ length: months + 1 }, (_, i) => monthBefore(today, months - i));
  const since = `${keys[0]}-01`;
  const records = (await store.list({ since })).filter((r) => r.day >= since && r.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1));
  const line = keys.map((month) => {
    const last = records.filter((r) => r.day.startsWith(`${month}-`)).at(-1);
    return last
      ? { month, day: last.day, incomeCents: last.incomeCents, paying: last.paying, trial: last.trial, paused: last.paused, closed: last.closed, atRisk: last.atRisk ?? null }
      : { month, day: null, incomeCents: null, paying: null, trial: null, paused: null, closed: null, atRisk: null };
  });
  const thisMonth = records.filter((r) => r.day.startsWith(`${keys.at(-1)}-`));
  const rateSince = dayKey(new Date(now.getTime() - TRIAL_RATE_DAYS * DAY));
  const recent = records.filter((r) => r.day > rateSince);
  const ended = sum(recent, "trialEnded");
  const converted = sum(recent, "trialToPaid");
  return {
    currency: records.at(-1)?.currency ?? null,
    months: line,
    started: records.length > 0,
    kept: { cents: sum(thisMonth, "newPayingCents") + sum(thisMonth, "upgradeCents"), newPaying: sum(thisMonth, "newPaying"), upgrades: sum(thisMonth, "upgrades") },
    lost: { cents: sum(thisMonth, "downgradeCents") + sum(thisMonth, "lostCents"), downgrades: sum(thisMonth, "downgrades"), lost: sum(thisMonth, "lost") },
    trials: { ended, converted, rate: ended ? converted / ended : null, days: TRIAL_RATE_DAYS },
  };
}
