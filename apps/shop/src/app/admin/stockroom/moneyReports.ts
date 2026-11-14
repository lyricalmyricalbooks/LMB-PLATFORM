// The stockroom's money pages (Tax centre, Expenses, Ask about your sales), worked out inside the admin by the stockroom's
// own rules (`@stockroom/*`), so a figure here is the figure the stockroom showed. Pure: the pages are TaxCenterPage.tsx,
// ExpensesPage.tsx and AskPage.tsx. Nothing here writes anything.
import { buildCashFlowBuckets } from "@stockroom/cashflow.js";
import { toCsv } from "@stockroom/csv.js";
import { findDeductionGaps } from "@stockroom/deduction-gaps.js";
import { expenseLedgerTotals, expenseTotalsCopy } from "@stockroom/expense-totals.js";
import { getBookCurrencyCode, normalizeCurrencyCode } from "@stockroom/money.js";
import { runIntelTool } from "@stockroom/publisher-intel-tools.js";
import { expenseMissingReceipt, expensesWithSettlements, isGratuityExpense, isRentExpense, receiptRefsOf, summarizeReceiptStorage } from "@stockroom/receipt-storage.js";
import { currentAmount, frequencyLabel, monthlyEquivalent, nextRecurringDate, normalizeRecurring, recurringStatus, summarizeRecurring } from "@stockroom/recurring.js";
import { fileStem } from "@stockroom/shop-profile.js";
import {
  buildTaxLedger, cashFlowSummary, categorySummary, ledgerCsvRows, ledgerRowInType, ledgerRowMatchesText, ledgerYears, rateNotes, tripsForYear, tripsSummary,
  type TaxSources,
} from "@stockroom/tax-ledger.js";

import { shopProfile } from "../../../lib/shopProfile";
import { keptRates, type RateCache } from "./datedRates";
import type { StockroomRecords } from "./stockroomData";
import { SHOP_CURRENCY, homeCurrency } from "../moneySign";

type Row = Record<string, any>;

/** The records as the stockroom's rules want them. States are copied: the ledger re-derives consignment mirrors in place. */
export function sourcesOf(records: StockroomRecords, dated: RateCache = keptRates()): TaxSources {
  const taxCenter = (records.taxCenter || {}) as Row;
  const rates = taxCenter.settings?.rates;
  return {
    books: Object.fromEntries(records.books.map((b) => [b.id, b])),
    states: structuredClone(records.states) as Record<string, Row>,
    taxCenter,
    // The Tax centre's saved daily rates, then the rates for each sale's own date kept in this browser (taxRates.ts
    // fetches them). A foreign-currency sale with no dated rate yet is valued at the saved rate and says so (rateNotes).
    fxRateCache: { [`${SHOP_CURRENCY}_${SHOP_CURRENCY}`]: 1, ...(rates && typeof rates === "object" ? rates : {}), ...dated },
  };
}

const baseCurrencyOf = (sources: TaxSources) => homeCurrency(sources.taxCenter?.settings?.baseCurrency);

// ── Tax centre ──────────────────────────────────────────────────────────────────────────────────────────────────

export const LEDGER_PAGE_SIZE = 25;

export type RecurringRow = { id: string; desc: string; vendor: string; cat: string; currency: string; amount: number; every: string; status: string; next: string | null; perMonth: number };

export function taxCenterModel(sources: TaxSources, year: string, now: Date = new Date()) {
  const everything = buildTaxLedger(sources, "all");
  const ledger = year === "all" ? everything : buildTaxLedger(sources, year);
  const baseCurrency = baseCurrencyOf(sources);
  const summary = cashFlowSummary(sources, year, ledger);
  const rows = [...ledger.allLedger].sort((a, b) => ((a.date || "") > (b.date || "") ? -1 : (a.date || "") < (b.date || "") ? 1 : 0));
  const categories = categorySummary(ledger.allLedger);
  const trips = Object.entries(tripsForYear(sources.taxCenter, sources.fxRateCache, year))
    .map(([name, t]) => ({ name, ...t }))
    .sort((a, b) => b.total - a.total);
  const subs = (Array.isArray(sources.taxCenter?.recurring) ? sources.taxCenter!.recurring : []) as Row[];
  const recurringSummary = summarizeRecurring(subs, sources.fxRateCache, baseCurrency, now);
  const recurring: RecurringRow[] = subs.map((raw) => {
    const s = normalizeRecurring(raw);
    return {
      id: String(s.id || s.desc), desc: s.desc || "Untitled", vendor: s.vendor || "", cat: s.cat || "", currency: s.currency || baseCurrency,
      amount: currentAmount(s, now), every: frequencyLabel(s.frequency), status: recurringStatus(s, now), next: nextRecurringDate(s, now),
      perMonth: monthlyEquivalent(s, now),
    };
  });
  const tripsBySummary = tripsSummary(sources.taxCenter, sources.fxRateCache);
  const gaps = findDeductionGaps({ books: sources.books, states: sources.states, taxCenter: sources.taxCenter, tripsSummary: tripsBySummary, today: localDay(now) });
  return {
    baseCurrency, years: ledgerYears(everything.allLedger), summary, rows, buckets: buildCashFlowBuckets(ledger.allLedger, year),
    categories, trips, recurring, recurringSummary, gaps, notes: rateNotes(ledger.allLedger),
  };
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type LedgerFilter = { type: "all" | "sales" | "expenses"; query: string };

/** The ledger rows the type and search choose (the stockroom's own matching). */
export function filterLedger(rows: Row[], filter: LedgerFilter): Row[] {
  const q = filter.query.trim().toLowerCase();
  return rows.filter((r) => ledgerRowInType(r, filter.type) && ledgerRowMatchesText(r, q));
}

/** Income, expenses and net of the rows shown (the table's footer). */
export function ledgerTotals(rows: Row[]) {
  let income = 0, expense = 0;
  for (const r of rows) { if (r.isIncome) income += r.baseAmount || 0; else expense += r.baseAmount || 0; }
  return { income, expense, net: income - expense };
}

/** The ledger as a spreadsheet file the browser saves: the stockroom's own columns, named from the press's profile. */
export function ledgerCsvFile(rows: Row[], baseCurrency: string, now: Date = new Date()) {
  return {
    name: `${fileStem({}, { name: shopProfile.name })}_Tax_Ledger_${localDay(now)}.csv`,
    // BOM and CRLF as the stockroom writes it: the file is opened directly in Excel.
    text: toCsv(ledgerCsvRows(rows, baseCurrency), { bom: true, eol: "\r\n" }),
  };
}

// ── Expenses ────────────────────────────────────────────────────────────────────────────────────────────────────

export type ExpenseLine = {
  key: string; scope: "item" | "business"; itemId: string; itemTitle: string; id: unknown; date: string; desc: string; cat: string; ref: string;
  amount: number; currency: string; baseAmount: number | null; receipt: "attached" | "missing" | "exempt" | "reference"; receiptCount: number;
  status: "pending" | "paid back" | "ours" | "";
};

/** Every expense across the items and the Tax centre, newest first, with where its receipt stands. */
export function expensesModel(records: StockroomRecords) {
  const lines: ExpenseLine[] = [];
  const forTotals: Record<string, Row[]> = {};
  const all: Row[] = [];
  const receiptOf = (e: Row): ExpenseLine["receipt"] => {
    if (receiptRefsOf(e).length) return "attached";
    if (isRentExpense(e) || isGratuityExpense(e)) return "exempt";
    return expenseMissingReceipt(e) ? "missing" : "reference";
  };
  for (const book of records.books) {
    const state = records.states[book.id];
    const cur = getBookCurrencyCode(book);
    const expenses = expensesWithSettlements(state || null);
    forTotals[book.id] = expenses;
    expenses.forEach((e, i) => {
      if (!e || typeof e !== "object" || e.voided) return;
      all.push(e);
      lines.push({
        key: `item:${book.id}:${e.id ?? i}`, scope: "item", itemId: book.id, itemTitle: book.title || book.id, id: e.id, date: String(e.date || ""), desc: String(e.desc || ""),
        cat: String(e.cat || ""), ref: String(e.ref || ""), amount: Number(e.amount) || 0, currency: normalizeCurrencyCode(e.currency, cur),
        baseAmount: e.baseAmount != null ? Number(e.baseAmount) : null, receipt: receiptOf(e), receiptCount: receiptRefsOf(e).length,
        status: isGratuityExpense(e) ? "ours" : e.received ? "paid back" : "pending",
      });
    });
  }
  const tc = (records.taxCenter || {}) as Row;
  const baseCur = homeCurrency(tc.settings?.baseCurrency);
  (Array.isArray(tc.businessExpenses) ? tc.businessExpenses : []).forEach((e: Row, i: number) => {
    if (!e || typeof e !== "object" || e.voided) return;
    all.push(e);
    lines.push({
      key: `biz:${e.id ?? i}`, scope: "business", itemId: "", itemTitle: "", id: e.id, date: String(e.date || ""), desc: String(e.desc || ""), cat: String(e.cat || ""),
      ref: String(e.ref || ""), amount: Number(e.amount) || 0, currency: normalizeCurrencyCode(e.currency, baseCur),
      baseAmount: e.baseAmount != null ? Number(e.baseAmount) : null, receipt: receiptOf(e), receiptCount: receiptRefsOf(e).length, status: "",
    });
  });
  lines.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  // What each item's authors are still owed back, per currency, by the stockroom's own definition.
  const owed = records.books.flatMap((book) => expenseLedgerTotals(forTotals[book.id] || [], getBookCurrencyCode(book))
    .filter((t) => t.outstanding > 0 || t.settled > 0)
    .map((t) => ({ itemId: book.id, itemTitle: book.title || book.id, ...expenseTotalsCopy(t) })));
  // Totals per currency, never added across currencies.
  const byCurrency = new Map<string, { code: string; total: number; count: number }>();
  for (const l of lines) {
    const b = byCurrency.get(l.currency) || { code: l.currency, total: 0, count: 0 };
    b.total = Math.round((b.total + l.amount) * 100) / 100; b.count += 1; byCurrency.set(l.currency, b);
  }
  return { lines, baseCurrency: baseCur, receipts: summarizeReceiptStorage(all), missing: lines.filter((l) => l.receipt === "missing").length, owed, totals: [...byCurrency.values()].sort((a, b) => a.code.localeCompare(b.code)) };
}

// ── Ask about your sales ────────────────────────────────────────────────────────────────────────────────────────

export const ASK_QUESTIONS = [
  { id: "sold", label: "What did we sell?", tool: "querySales" },
  { id: "spent", label: "What did we spend?", tool: "queryExpenses" },
  { id: "cash", label: "Money in and out", tool: "queryLedger" },
  { id: "events", label: "Fairs and trips", tool: "queryEvents" },
  { id: "stock", label: "Stock on hand", tool: "queryCatalog" },
  { id: "wrong", label: "Anything that looks wrong?", tool: "findAnomalies" },
  { id: "missing", label: "Costs that might be missing", tool: "findMissingCosts" },
] as const;
export type AskId = typeof ASK_QUESTIONS[number]["id"];

/** One question answered from the records by the stockroom's own read-only tools, for 'all' or one year. */
export function askModel(sources: TaxSources, id: AskId, year: string, now: Date = new Date()): Row {
  const q = ASK_QUESTIONS.find((x) => x.id === id)!;
  const range = year === "all" ? {} : { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  const ctx = {
    books: sources.books, states: sources.states, taxCenter: sources.taxCenter, now,
    tripsSummary: tripsSummary(sources.taxCenter, sources.fxRateCache),
    buildLedger: (y: string) => buildTaxLedger(sources, y),
  };
  const args = id === "events" ? { year } : id === "cash" ? { year } : id === "stock" ? {} : id === "missing" ? { today: localDay(now) } : range;
  return runIntelTool(q.tool, args, ctx);
}
