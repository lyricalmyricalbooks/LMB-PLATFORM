// What each shop costs us (code plan 19.15): Google's bill per shop project, next to what the shop pays, so a shop that
// costs more than it brings in shows. Pure over rows already read, so it is tested without Google.
//
// The rows are Cloud Billing's standard usage cost export to BigQuery, one row per charge (only the fields used here):
//   { project: { id }, cost, credits: [{ amount }], usage_start_time, currency }
// `cost` is in the currency's units (dollars, not cents) and credits are negative amounts (free tier, discounts). A
// project's month is its rows whose usage started in that month (UTC), net of credits. Rows from projects that aren't
// a shop (the platform's own, or a charge with no project) are listed apart, never dropped.
//
// The reader (`fetchRows({ month })`, a BigQuery query) is not built until Julian switches the export on: see README.md.
import { monthlyCents } from "../../control-room/today.js";

/** "2026-11": the month a time falls in, in UTC (the export's usage times are UTC). */
export const monthOf = (time) => new Date(time).toISOString().slice(0, 7);

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Sums in millionths of a unit, so many small charges add up exactly; cents only at the end.
const micros = (amount) => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 1e6) : 0;
};
const cents = (m) => Math.round(m / 1e4);

/** BigQuery's Node client gives a TIMESTAMP as { value }; a plain string or Date works too. */
function timeOf(value) {
  const raw = value && typeof value === "object" && !(value instanceof Date) ? value.value : value;
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Each shop with a project of its own, by that project. A shop in the shared system (`shared: true`) shares its
 * project with every other shop, so the project's cost is never one shop's: its share comes from the usage meters
 * (services/usage), and the shared project shows on its own.
 */
function projectsOfOwn(rows) {
  return new Map(rows.filter((row) => row.shared !== true).map((row) => [row.projectId ?? row.shopId, row]));
}

/**
 * One month of the billing export, summed per project and currency: [{ projectId, currency, costCents, creditCents,
 * netCents }], biggest net first. `projectId` is null for a charge that belongs to no project.
 */
export function readCosts({ rows = [], period }) {
  if (!MONTH.test(period ?? "")) throw new Error("the month must look like 2026-11");
  const sums = new Map();
  let skipped = 0;
  for (const row of rows) {
    const at = timeOf(row?.usage_start_time);
    if (at === null) {
      skipped += 1;
      continue;
    }
    if (monthOf(at) !== period) continue;
    const projectId = typeof row.project?.id === "string" && row.project.id ? row.project.id : null;
    const currency = typeof row.currency === "string" && /^[A-Z]{3}$/.test(row.currency) ? row.currency : "unknown";
    const key = `${projectId ?? ""} ${currency}`;
    const sum = sums.get(key) ?? { projectId, currency, cost: 0, credits: 0 };
    sum.cost += micros(row.cost);
    for (const credit of Array.isArray(row.credits) ? row.credits : []) sum.credits += micros(credit?.amount);
    sums.set(key, sum);
  }
  const projects = [...sums.values()]
    .map(({ projectId, currency, cost, credits }) => ({ projectId, currency, costCents: cents(cost), creditCents: cents(credits), netCents: cents(cost + credits) }))
    .sort((a, b) => b.netCents - a.netCents || String(a.projectId).localeCompare(String(b.projectId)));
  return { period, projects, skipped };
}

/**
 * Per shop: what Google cost this month, what the shop pays this month (its plan price less its own percent off, as
 * Today counts it, plus pay-as-you-sell fees when recorded) and the margin; `losing` when Google cost more than it pays.
 * Most losing first. `rows` are registry rows (a shop's project is its `projectId`, else its shop id); `fees` is
 * { [shopId]: cents } for the month. A cost in another currency than the plans' has no margin (`losing` null).
 */
export function costReport({ rows = [], costs, settings, fees = {} }) {
  const planCurrency = settings?.currency ?? null;
  const byProject = projectsOfOwn(rows);
  const shops = new Map();
  const notShops = [];
  for (const project of costs?.projects ?? []) {
    const row = project.projectId ? byProject.get(project.projectId) : null;
    if (!row) {
      notShops.push({ projectId: project.projectId, currency: project.currency, googleCents: project.netCents, creditCents: project.creditCents });
      continue;
    }
    const shop = shops.get(row.shopId) ?? { row, google: {} };
    shop.google[project.currency] = (shop.google[project.currency] ?? 0) + project.netCents;
    shops.set(row.shopId, shop);
  }
  // A live shop with no charges yet still shows (nothing billed, or the export is behind).
  for (const row of rows) if (row.status === "live" && !shops.has(row.shopId)) shops.set(row.shopId, { row, google: {} });

  const list = [...shops.values()].map(({ row, google }) => {
    const currencies = Object.keys(google);
    const other = currencies.filter((c) => c !== planCurrency);
    const googleCents = google[planCurrency] ?? 0;
    const feeCents = Number.isInteger(fees[row.shopId]) ? fees[row.shopId] : 0;
    const planCents = settings ? monthlyCents(row, settings) : 0;
    const paidCents = planCents + feeCents;
    const comparable = other.length === 0;
    return {
      shopId: row.shopId,
      pressName: row.pressName ?? row.shopId,
      projectId: row.projectId ?? row.shopId,
      plan: row.plan ?? null,
      testShop: row.testShop === true,
      currency: planCurrency,
      googleCents,
      planCents,
      // Pay what you use: the running cost last put on the shop's bill (in planCents too), to set against Google's.
      runningCents: Number.isInteger(row.billing?.lastRunningCost?.cents) ? row.billing.lastRunningCost.cents : 0,
      runningMonth: row.billing?.lastRunningCost?.month ?? null,
      feeCents,
      paidCents,
      marginCents: comparable ? paidCents - googleCents : null,
      losing: comparable ? googleCents > paidCents : null,
      ...(other.length ? { otherCurrencies: Object.fromEntries(other.map((c) => [c, google[c]])) } : {}),
    };
  });
  list.sort((a, b) => (a.marginCents ?? Infinity) - (b.marginCents ?? Infinity) || a.pressName.localeCompare(b.pressName));

  const totals = {};
  for (const project of costs?.projects ?? []) totals[project.currency] = (totals[project.currency] ?? 0) + project.netCents;
  return { period: costs?.period ?? null, currency: planCurrency, shops: list, notShops, totals, losing: list.filter((s) => s.losing).length };
}

/**
 * Each shop's Google cost for the month, { [shopId]: { cents, currency } }: what row 15.17's spend guards read. Only
 * shops; a shop billed in two currencies keeps the larger.
 */
export function costPerShop({ rows = [], costs }) {
  const byProject = projectsOfOwn(rows);
  const sums = {};
  for (const project of costs?.projects ?? []) {
    const row = project.projectId ? byProject.get(project.projectId) : null;
    if (!row) continue;
    sums[row.shopId] ??= {};
    sums[row.shopId][project.currency] = (sums[row.shopId][project.currency] ?? 0) + project.netCents;
  }
  return Object.fromEntries(Object.entries(sums).map(([shopId, byCurrency]) => {
    const [currency, cents] = Object.entries(byCurrency).sort((a, b) => b[1] - a[1])[0];
    return [shopId, { cents, currency }];
  }));
}

/**
 * The costs reader: `fetchRows({ month })` gives that month's export rows (the BigQuery query, once the export is on;
 * fakes.js has a pretend one). Without it, `read` says the export isn't on yet.
 */
export function createCostReader({ fetchRows } = {}) {
  return {
    configured: typeof fetchRows === "function",
    async read(month) {
      if (typeof fetchRows !== "function") return null;
      return readCosts({ rows: await fetchRows({ month }), period: month });
    },
  };
}
