// The bookkeeper's copy of Bookkeeping › Reports (13 November 2026). A bookkeeper (Team role "bookkeeper") may not read
// the stockroom's records (they hold keys and customers), so the owner's Reports page saves the finished reports as the
// setting `reportsForBookkeeper`, the one more document the bookkeeper's rules open (apps/stockroom/firestore.rules and
// database.rules.json, next to `taxCentreForBookkeeper`). It holds figures only: no customer names or emails, no
// receipt links. `day` (not a time) means it is written at most once a day unless a figure changes.
import { balanceSheet, balanceSheetRows, cashForecast, type BalanceSheet, type Forecast, type StatementInput } from "./moneyStatements";
import { yearFigures } from "./yearReport";
import { stockroomWriteApi } from "./stockroomWrite";

type Row = Record<string, any>;

export const BOOKKEEPER_REPORTS_KEY = "reportsForBookkeeper";
export type ProfitAndLoss = { year: string; revenue: number; cogs: number; opex: number; shares: number; profit: number };
export type BookkeeperReports = {
  day: string; pressName: string; currency: string; balance: BalanceSheet; yearEnd: BalanceSheet | null; forecast: Forecast; pl: ProfitAndLoss[];
};

const round = (n: number) => Math.round(n * 100) / 100;

/** The copy itself: today's balance sheet, last year-end's, the forecast and the profit and loss for this year and last. */
export function bookkeeperReports(input: StatementInput, pressName: string): BookkeeperReports {
  const balance = balanceSheet(input, input.today);
  const year = Number(input.today.slice(0, 4));
  const taxInput = { books: input.records.books as Row[], states: input.sources.states, taxCenter: input.sources.taxCenter, fxRateCache: input.sources.fxRateCache };
  const pl = [String(year), String(year - 1)].map((y) => {
    const f = yearFigures(taxInput, y);
    return { year: y, revenue: round(f.revenue), cogs: round(f.cogs), opex: round(f.opex), shares: round(f.shares), profit: round(f.profit) };
  });
  const forecast = cashForecast(input, balance);
  return {
    day: input.today, pressName, currency: balance.currency, balance, yearEnd: balanceSheet(input, `${year - 1}-12-31`),
    // Dated items only (the usual-sales line is in the weeks), and the first 80: the copy stays small.
    // Invoice lines lose who was billed: the copy carries no customer names.
    forecast: { ...forecast, items: forecast.items.filter((it) => it.source !== "sales").slice(0, 80)
      .map((it) => (it.source === "invoice" ? { ...it, label: it.label.replace(/ from .*$/, "") } : it)) }, pl,
  };
}

/** Saves the copy when it changed. Never throws: the copy catches up the next time the owner opens Reports. */
export async function saveBookkeeperReports(input: StatementInput, pressName: string): Promise<void> {
  try { await stockroomWriteApi.saveSetting(BOOKKEEPER_REPORTS_KEY, bookkeeperReports(input, pressName)); }
  catch (error) { console.warn("[reports] the bookkeeper's copy was not saved", error); }
}

/** A stored copy read back, or null when it isn't one (never saved, or an older shape). */
export function readBookkeeperReports(raw: unknown): BookkeeperReports | null {
  const v = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!v || typeof v !== "object") return null;
  const r = v as Partial<BookkeeperReports>;
  return typeof r.day === "string" && r.balance && Array.isArray(r.balance.assets) && r.forecast && Array.isArray(r.forecast.weeks) && Array.isArray(r.pl) ? (r as BookkeeperReports) : null;
}

/** The profit and loss as spreadsheet rows (the bookkeeper's download). */
export function profitAndLossRows(pl: ProfitAndLoss, pressName: string, currency: string): string[][] {
  const m = (n: number) => n.toFixed(2);
  return [[`${pressName} profit and loss`, pl.year, currency], [], ["Sales", m(pl.revenue)], ["Cost of goods sold", m(-pl.cogs)],
    ["Gross profit", m(pl.revenue - pl.cogs)], ["Expenses", m(-pl.opex)], ...(pl.shares ? [["Artist shares", m(-pl.shares)]] : []), ["Net profit", m(pl.profit)]];
}

export { balanceSheetRows };
