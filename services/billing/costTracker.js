// The running-cost tracker a shop owner sees in Settings › Billing (Julian, 14 November 2026): what the shop has cost
// to run so far this month, in plain groups, where the month is heading, the bill that will come of it, and how it
// compares with the months before. Pure maths over the same numbers the bill is made from (runningCost.js), so it is
// tested without Google or Stripe; billing.costTracker reads the shop's records and puts the money into words.
//
// - costGroups(meters, rate): the nine meters as five things a press recognises, biggest first.
// - trackerFigures({...}): everything the page shows, in cents of the press's billing currency.
// - taxOn(cents, { taxCents, beforeTaxCents }): tax on an estimate at the rate the press's next bill is taxed at.
//
// Estimates only: the bill itself is made from the month's final numbers (meters.js reconciles them with Google's own
// bill), and Stripe works out the tax. Nothing here changes what anyone pays.
import { DEFAULT_ALERT_CENTS, UNIT_PRICES, meterCost, monthBounds, monthWords, paidShare, projectedCents } from "./runningCost.js";

const DAY = 86_400_000;
const amountOf = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
const whole = (n) => new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 }).format(Math.round(n));
const sized = (gb) => (gb >= 1 ? `${new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(gb)} GB` : `${whole(gb * 1000)} MB`);
const count = (n, one, many) => `${whole(n)} ${Math.round(n) === 1 ? one : many}`;

/** The groups a press sees, each made of the meters it adds up, with the words for how much was used. */
export const COST_GROUPS = Object.freeze([
  Object.freeze({ id: "visitors", words: "Visitors", kinds: ["egressGb"], used: (m) => (amountOf(m.egressGb) ? `${sized(m.egressGb)} of pages and photos shown` : "") }),
  Object.freeze({ id: "storage", words: "Photos and files", kinds: ["storageGb"], used: (m) => (amountOf(m.storageGb) ? `${sized(m.storageGb)} kept` : "") }),
  Object.freeze({ id: "work", words: "Orders and upkeep", kinds: ["invocations", "computeGbSeconds"], used: (m) => (amountOf(m.invocations) ? count(m.invocations, "task run", "tasks run") : "") }),
  Object.freeze({ id: "records", words: "Shop records", kinds: ["reads", "writes", "deletes", "firestoreGb"], used: (m) => (amountOf(m.reads) + amountOf(m.writes) ? `${whole(amountOf(m.reads) + amountOf(m.writes))} looks and saves` : "") }),
  Object.freeze({ id: "emails", words: "Emails", kinds: ["emails"], used: (m) => (amountOf(m.emails) ? count(m.emails, "email sent", "emails sent") : "") }),
]);

/**
 * A month of use as the five groups: [{ id, words, used, cents }], biggest first (ties keep the order above). `rate`
 * turns the platform's home currency into the press's (1 for a Canadian press). The groups' cents add up to `total`
 * exactly when it is given (the month's cost as billed), so the list never disagrees with the figure above it.
 */
export function costGroups(meters = {}, rate = 1, total = null) {
  const groups = COST_GROUPS.map((group) => {
    const micros = group.kinds.reduce((sum, kind) => sum + amountOf(meters?.[kind]) * (UNIT_PRICES[kind]?.micros ?? 0), 0);
    return { id: group.id, words: group.words, used: group.used(meters ?? {}), cents: Math.round((micros / 10_000) * rate) };
  });
  if (Number.isInteger(total)) {
    // Rounding (and a reconciled month's shared-out costs) land on the biggest group, so the rows sum to the total.
    const gap = total - groups.reduce((sum, g) => sum + g.cents, 0);
    const biggest = groups.reduce((best, g) => (g.cents > best.cents ? g : best), groups[0]);
    biggest.cents = Math.max(0, biggest.cents + gap);
  }
  return groups.map((g, index) => ({ ...g, index })).sort((a, b) => b.cents - a.cents || a.index - b.index).map(({ index, ...g }) => g);
}

/** The months before `month`, newest last: ["2026-06", …, "2026-10"] for (2026-11, 5). */
export function monthsBefore(month, howMany) {
  const { start } = monthBounds(month);
  const d = new Date(start);
  return Array.from({ length: howMany }, (_, i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (howMany - i), 1)).toISOString().slice(0, 7));
}

/** Tax on `cents` at the rate of a bill whose tax was `taxCents` on `beforeTaxCents`; null when that bill tells nothing. */
export function taxOn(cents, { taxCents, beforeTaxCents } = {}) {
  if (!Number.isInteger(taxCents) || !Number.isInteger(beforeTaxCents) || beforeTaxCents <= 0 || taxCents < 0) return null;
  return Math.round((Math.max(0, cents) * taxCents) / beforeTaxCents);
}

/**
 * Everything the tracker shows, in cents of the press's currency.
 *   month       "2026-11", the month `now` (ms) is in
 *   record      the shop's meter record for the month so far, or null when nothing is measured yet
 *   history     { [month]: cents } of earlier months' running cost as billed (billing's `runningCosts`)
 *   feeCents    the monthly platform fee before the founding offer; `feeAfterCents` after it
 *   rate        home currency to the press's currency (1 at home); null when it isn't known yet
 *   alertCents  the amount the press asked to be told about (0 = off)
 *   paidFrom    when the plan starts being paid for (the trial's end): a trial month costs nothing
 */
export function trackerFigures({ month, now, record = null, history = {}, feeCents = 0, feeAfterCents = feeCents, rate = 1, alertCents = DEFAULT_ALERT_CENTS, paidFrom = null }) {
  const { start, end } = monthBounds(month);
  const days = Math.round((end - start) / DAY);
  const day = Math.min(days, Math.max(1, Math.ceil((now - start) / DAY)));
  const measured = Boolean(record) && Number.isFinite(rate) && rate > 0;
  const soFarHome = measured ? meterCost(record).cents : 0;
  const soFar = measured ? Math.round(soFarHome * rate) : null;
  const groups = measured ? costGroups(record, rate, soFar) : [];
  // The same straight line the heads-up email uses, so the page and the email never disagree.
  const monthEnd = measured ? Math.round(projectedCents({ soFarCents: soFarHome, now, month }) * rate) : null;
  const share = paidShare({ month, paidFrom });
  const running = monthEnd === null ? null : Math.round(monthEnd * share);
  const discount = Math.max(0, feeCents - feeAfterCents);
  const beforeTax = running === null ? null : feeAfterCents + running;

  const past = monthsBefore(month, 5).map((m) => ({ month: m, cents: Number.isInteger(history?.[m]?.cents) ? history[m].cents : null }));
  const known = past.filter((p) => p.cents !== null);
  const last = known.at(-1) ?? null;
  const average = known.length ? Math.round(known.reduce((sum, p) => sum + p.cents, 0) / known.length) : null;
  // Against last month, only when both are worth comparing (a few cents either way isn't a trend).
  const change = last && monthEnd !== null && last.cents >= 50 ? Math.round(((monthEnd - last.cents) / last.cents) * 100) : null;

  const limit = Number.isInteger(alertCents) && alertCents > 0 ? alertCents : 0;
  // The heads-up watches the fee plus the whole month's running cost, as billing.runningCostAlerts does.
  const watched = monthEnd === null ? null : feeAfterCents + monthEnd;
  return {
    month, monthWords: monthWords(month), day, days, measured,
    soFar, groups, monthEnd, share,
    estimate: { fee: feeCents, discount, running, beforeTax, freeTrial: share === 0 },
    trend: [...past, { month, cents: monthEnd, now: true }],
    lastMonth: last, average, change,
    alert: { cents: limit, on: limit > 0, watched, passing: limit > 0 && watched !== null && watched > limit, used: limit > 0 && watched !== null ? Math.min(1, watched / limit) : null },
  };
}
