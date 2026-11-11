// The old Financial Centre's year figures and its "Download tax report" file (main.js calculateFinancials,
// taxcentre.js downloadTaxReport), line for line: sales at their own price, cost of goods sold at the print run's cost
// per copy, operating expenses (a foreign one still waiting for its rate counts 0 and is counted), artist shares by
// tier, and profit. The file lists every sale and book expense of the year, then a COGS and an artist-share line per book.
import { reconcileConsignmentMirrors } from "@stockroom/consignment.js";
import { csvRow } from "@stockroom/csv.js";
import { fileStem } from "@stockroom/shop-profile.js";

import { artistEarningsInYear, isExpenseAwaitingRate, type TaxSeasonInput } from "./taxSeason";

type Row = Record<string, any>;
export type BookYear = { title: string; units: number; revenue: number; unitCost: number; cogs: number; shares: number; net: number };
export type YearFigures = { revenue: number; cogs: number; opex: number; shares: number; profit: number; bookStats: BookYear[]; missingReceiptsCount: number; fxWaitingCount: number };

const stateOf = (input: TaxSeasonInput, book: Row): Row => ({ hist: [], expenses: [], artistPayouts: [], ...(input.states[book.id] || {}) });

export function yearFigures(input: TaxSeasonInput, year: number | string): YearFigures {
  const y = String(year);
  const r: YearFigures = { revenue: 0, cogs: 0, opex: 0, shares: 0, profit: 0, bookStats: [], missingReceiptsCount: 0, fxWaitingCount: 0 };
  const amt = (e: Row) => (isExpenseAwaitingRate(e) ? (r.fxWaitingCount++, 0) : e.baseAmount || e.amountCAD || e.amount || 0);
  const expense = (e: Row) => {
    if (e.voided || !String(e.date || "").startsWith(y)) return;
    r.opex += amt(e);
    if (!e.receipt) r.missingReceiptsCount++;
  };
  for (const book of input.books) {
    const s = stateOf(input, book);
    const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);
    let revenue = 0, units = 0;
    for (const h of s.hist || []) {
      if (h.voided || h.gratuity || !String(h.date || "").startsWith(y)) continue;
      revenue += (parseFloat(h.qty) || 0) * (parseFloat(h.price) || 0);
      units += parseInt(h.qty) || 0;
    }
    const cogs = units * unitCost;
    const shares = artistEarningsInYear(book, s, y);
    r.revenue += revenue; r.cogs += cogs; r.shares += shares;
    r.bookStats.push({ title: book.title, units, revenue, unitCost, cogs, shares, net: revenue - cogs - shares });
    (s.expenses || []).forEach(expense);
  }
  (input.taxCenter?.businessExpenses || []).forEach(expense);
  r.profit = r.revenue - r.cogs - r.opex - r.shares;
  return r;
}

/** The "Tax report" spreadsheet for `year`. */
export function yearReportCsv(input: TaxSeasonInput, year: number | string): { text: string; name: string; waiting: number } {
  const y = String(year);
  const fin = yearFigures(input, y);
  let csv = "Date,Type,Book/Source,Category,Description,Receipt URL,Revenue,COGS,Expense,Artist Payout,Net\n";
  for (const book of input.books) {
    // Sale rows come off the History mirrors, so bring a corrected consignment sale in first (on a copy).
    const s = structuredClone(stateOf(input, book));
    reconcileConsignmentMirrors(s);
    for (const h of s.hist || []) {
      if (h.voided || h.gratuity || !String(h.date || "").startsWith(y)) continue;
      const gross = (h.qty * h.price).toFixed(2);
      csv += csvRow([h.date, "Order", book.title, "Sale", `${h.chan} Order #${h.num}`, "", gross, 0, 0, 0, gross]) + "\n";
    }
    for (const e of s.expenses || []) {
      if (!String(e.date || "").startsWith(y)) continue;
      const a = Number(e.amount) || 0;
      csv += csvRow([e.date, "Expense", book.title, e.cat, e.desc, e.receipt || "", 0, 0, a.toFixed(2), 0, -a.toFixed(2)]) + "\n";
    }
  }
  csv += `\nSUMMARY FOR ${y},,,,,,,,,\n`;
  for (const bs of fin.bookStats) {
    csv += csvRow([`${y}-12-31`, "COGS Summary", bs.title, "COGS", "Inventory Recovery", "", 0, bs.cogs.toFixed(2), 0, 0, -bs.cogs.toFixed(2)]) + "\n";
    csv += csvRow([`${y}-12-31`, "Artist Share", bs.title, "Royalty", "Tiered Payout", "", 0, 0, 0, bs.shares.toFixed(2), -bs.shares.toFixed(2)]) + "\n";
  }
  if (fin.fxWaitingCount) {
    const n = fin.fxWaitingCount;
    csv += csvRow([`${y}-12-31`, "WARNING", "", "", `${n} expense${n === 1 ? " is" : "s are"} still waiting for an exchange rate — counted as 0 in the CAD totals, so they are not final.`, "", 0, 0, 0, 0, 0]) + "\n";
  }
  return { text: csv, name: `${fileStem()}_Tax_Report_${y}.csv`, waiting: fin.fxWaitingCount };
}
