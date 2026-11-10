// The daily pay-what-you-use job (job "running-costs"): from the 3rd of each month (Google's billing export runs up to
// two days behind), last month's running cost goes on each paying shop's next bill (billing.billRunningCosts, once per
// shop and month); every day, a press whose month looks set to pass their amount is emailed (runningCostAlerts).
//
// Where a shop's cost comes from (runningCost.js runningCostCents): its meter record for the month when the shared
// system writes one (`meters.get(shopId, month)` -> { reads, writes, ... } | null, the usage/{shopId}_{YYYY-MM} records
// in the platform project), else its own project's net cost in Google's billing export (services/costs `costPerShop`
// over `reader.read(month)`). A shop with neither is left for a later day, never billed nothing by mistake.
import { costPerShop, monthOf } from "../costs/costs.js";
import { previousMonth, runningCostCents } from "./runningCost.js";

/** The day of the month from which last month is billed (the export settles by then). */
export const BILL_FROM_DAY = 3;

/** Each shop's running cost for a month, { [shopId]: cents }, from its meters or the export; unknown shops left out. */
export async function costsFor({ rows, month, meters = null, reader = null }) {
  const fromExport = reader?.configured ? costPerShop({ rows, costs: await reader.read(month) }) : {};
  const costs = {};
  for (const row of rows) {
    const record = meters ? await meters.get(row.shopId, month) : null;
    const exported = fromExport[row.shopId];
    const cents = runningCostCents({ meters: record, exportCents: exported && exported.currency === "CAD" ? exported.cents : undefined });
    if (cents !== null) costs[row.shopId] = cents;
  }
  return costs;
}

/** One run: bill last month (from the 3rd) and send this month's heads-ups. Safe to run any number of times a day. */
export async function runRunningCosts({ billing, registry, meters = null, reader = null, now = () => new Date() }) {
  const today = now();
  const rows = (await registry.listShops()).filter((row) => row.testShop !== true);
  let billed = null;
  if (today.getUTCDate() >= BILL_FROM_DAY) {
    const month = previousMonth(today.getTime());
    billed = await billing.billRunningCosts({ month, costs: await costsFor({ rows, month, meters, reader }) });
  }
  const thisMonth = monthOf(today);
  const told = await billing.runningCostAlerts({ month: thisMonth, soFar: await costsFor({ rows, month: thisMonth, meters, reader }) });
  return {
    summary: `${billed ? `${billed.month}: billed ${billed.billed.length}, waiting for costs ${billed.missing.length}` : `bills from day ${BILL_FROM_DAY}`}; heads-ups sent ${told.length}`,
    billed, told,
  };
}
