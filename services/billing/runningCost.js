// Pay what you use (Julian, 10 November 2026): each shop pays what it cost to run that month, at Google's own prices
// and with no markup, plus a flat platform fee ($5, the plan price in services/settings.js). This file is the pure
// money maths, so it is tested without Google or Stripe:
//
// - meterCost(meters): a shop's month of use priced line by line. `meters` is the per-shop month record the shared
//   system writes (usage/{shopId}_{YYYY-MM} in the platform project): counts (reads, writes, deletes, invocations,
//   computeGbSeconds, emails) and sizes averaged over the month (firestoreGb, storageGb) and the month's web traffic
//   (egressGb). Unknown or negative values count as 0.
// - runningCostCents({ meters, exportCents }): the meters when there are any, else the shop's own project's net cost
//   from Google's billing export (services/costs `costPerShop`), which is what a shop costs while each shop still has
//   its own project.
// - paidShare(...): the part of a month the plan was paid for. A month the press spent in its free trial costs nothing.
// - EXAMPLE_SHOPS / examples(settings): a quiet, a typical and a busy shop, priced the same way, for the pricing page.
//   The page's numbers come from here, so they move with the prices.
// - projectedCents(...): where a month is heading from its cost so far (a straight line), when only cents are known.
// - monthPace(...): so far and month end from a meter record, sizes kept apart from counts: the tracker and the email.
//
// Prices are in millionths of a dollar in the plan currency (CAD) per unit: Google's list prices for the region the
// shops run in (US dollars at 1.38), and a per-email share of the Google Workspace mailbox that sends
// the platform's email (services/email/gmail.js). Check them against Google's current
// price list before going live (docs/start-real-accounts.md).

const DAY = 86_400_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** What each kind of use costs, in millionths of a dollar per unit, with the words a press sees. */
export const UNIT_PRICES = Object.freeze({
  reads: Object.freeze({ micros: 0.83, words: "Database reads" }),
  writes: Object.freeze({ micros: 2.48, words: "Database saves" }),
  deletes: Object.freeze({ micros: 0.28, words: "Database deletes" }),
  firestoreGb: Object.freeze({ micros: 248_400, words: "Database storage" }),
  storageGb: Object.freeze({ micros: 35_880, words: "Photo and file storage" }),
  egressGb: Object.freeze({ micros: 207_000, words: "Web traffic" }),
  invocations: Object.freeze({ micros: 0.55, words: "Background jobs" }),
  computeGbSeconds: Object.freeze({ micros: 10, words: "Background job time" }),
  emails: Object.freeze({ micros: 600, words: "Emails sent" }),
});
export const METER_KEYS = Object.freeze(Object.keys(UNIT_PRICES));

const amountOf = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** A month of use priced: { cents, lines: [{ kind, words, amount, cents }] } (lines rounded for show, cents summed exactly). */
export function meterCost(meters = {}) {
  let totalMicros = 0;
  const lines = METER_KEYS.map((kind) => {
    const amount = amountOf(meters?.[kind]);
    const micros = amount * UNIT_PRICES[kind].micros;
    totalMicros += micros;
    return { kind, words: UNIT_PRICES[kind].words, amount, cents: Math.round(micros / 10_000) };
  });
  return { cents: Math.round(totalMicros / 10_000), lines };
}

const hasMeters = (meters) => Boolean(meters) && METER_KEYS.some((kind) => amountOf(meters[kind]) > 0);

/**
 * A shop's running cost for a month in cents, or null when nothing is known yet: the meters when there are any, else
 * the export's net cost for the shop's own project (never below 0: a month of free-tier credits costs nothing).
 */
export function runningCostCents({ meters, exportCents } = {}) {
  if (hasMeters(meters)) return meterCost(meters).cents;
  if (Number.isInteger(exportCents)) return Math.max(0, exportCents);
  return null;
}

/** The first and next month's first moment of "2026-11", in UTC. */
export function monthBounds(month) {
  if (!MONTH.test(month ?? "")) throw new Error("the month must look like 2026-11");
  const [y, m] = month.split("-").map(Number);
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1) };
}

/** The month before a time, "2026-10" for any day in November 2026 (UTC). */
export function previousMonth(time) {
  const d = new Date(time);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

/** "October 2026". */
export const monthWords = (month) => new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(monthBounds(month).start));

/**
 * The part of a month (0 to 1) the plan was paid for: from the later of the month's start and `paidFrom` (the trial's
 * end, or the plan's start when there was no trial) to the earlier of the month's end and `endedAt`.
 */
export function paidShare({ month, paidFrom, endedAt }) {
  const { start, end } = monthBounds(month);
  const from = Math.max(start, Number.isFinite(Date.parse(paidFrom ?? "")) ? Date.parse(paidFrom) : start);
  const to = Math.min(end, Number.isFinite(Date.parse(endedAt ?? "")) ? Date.parse(endedAt) : end);
  if (to <= from) return 0;
  return Math.round(((to - from) / (end - start)) * 1000) / 1000;
}

/** Where a month's running cost is heading from its use so far, in cents (a straight line from the days gone by). */
export function projectedCents({ soFarCents, now, month }) {
  const { start, end } = monthBounds(month);
  const gone = Math.min(Math.max(now - start, DAY), end - start);
  return Math.round((Math.max(0, soFarCents) * (end - start)) / gone);
}

/** The meters that are sizes kept all month (priced per GB-month), not counts that pile up day by day. */
export const SIZE_KEYS = Object.freeze(["firestoreGb", "storageGb"]);

/** How much of `month` has gone at `now`, from one day's worth to all of it (the straight line's divisor). */
export function monthGone({ now, month }) {
  const { start, end } = monthBounds(month);
  return Math.min(Math.max(now - start, DAY), end - start) / (end - start);
}

/**
 * A month in progress from its meter record: { soFarCents, monthEndCents }. Counts (reads, emails, pages shown…) go on
 * at the pace they came so far; sizes (photos and records kept) are already a whole month's average, so so far is the
 * part of the month gone and the month's end is their whole price. projectedCents' straight line would count a
 * month's storage once a day.
 */
export function monthPace({ meters, now, month }) {
  const gone = monthGone({ now, month });
  let counts = 0;
  let sizes = 0;
  for (const kind of METER_KEYS) {
    const micros = amountOf(meters?.[kind]) * UNIT_PRICES[kind].micros;
    if (SIZE_KEYS.includes(kind)) sizes += micros; else counts += micros;
  }
  return { soFarCents: Math.round((counts + sizes * gone) / 10_000), monthEndCents: Math.round((counts / gone + sizes) / 10_000) };
}

/** Three shops priced the same way, for the pricing page and help: what a month of each costs to run. */
export const EXAMPLE_SHOPS = Object.freeze([
  Object.freeze({ id: "quiet", name: "A quiet shop", line: "About 500 visits a month",
    meters: Object.freeze({ reads: 150_000, writes: 10_000, deletes: 1_000, firestoreGb: 0.05, storageGb: 0.5, egressGb: 1, invocations: 20_000, computeGbSeconds: 5_000, emails: 100 }) }),
  Object.freeze({ id: "typical", name: "A typical shop", line: "About 2,000 visits and 40 orders a month",
    meters: Object.freeze({ reads: 600_000, writes: 50_000, deletes: 5_000, firestoreGb: 0.2, storageGb: 2, egressGb: 6, invocations: 80_000, computeGbSeconds: 20_000, emails: 500 }) }),
  Object.freeze({ id: "busy", name: "A busy shop", line: "About 15,000 visits and 300 orders a month",
    meters: Object.freeze({ reads: 3_000_000, writes: 250_000, deletes: 20_000, firestoreGb: 1, storageGb: 8, egressGb: 40, invocations: 400_000, computeGbSeconds: 100_000, emails: 3_000 }) }),
]);

/** Each example shop's month: { id, name, line, runningCents, feeCents, totalCents } at the plan fee `feeCents`. */
export const examples = (feeCents) => EXAMPLE_SHOPS.map(({ id, name, line, meters }) => {
  const runningCents = meterCost(meters).cents;
  return { id, name, line, runningCents, feeCents, totalCents: runningCents + feeCents };
});

/** The bill a press's running cost may pass before they're told, unless they choose their own: $25. */
export const DEFAULT_ALERT_CENTS = 2500;
