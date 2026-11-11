// Types for the stockroom's money rules that the Tax centre, Expenses and Ask pages import through `@stockroom`.
// Rows are the stockroom's own plain records, so they are typed loosely on purpose (`Row`).
type Row = Record<string, any>;

declare module "@stockroom/tax-ledger.js" {
  export type TaxSources = { books: Record<string, Row>; states: Record<string, Row>; taxCenter: Row | null; fxRateCache: Record<string, number> };
  export type Ledger = { totalGrossSales: number; totalOperatingExpenses: number; allLedger: Row[] };
  export type Delta = { kind: "new" } | { kind: "pct"; pct: number; dir: "up" | "down" | "flat" } | null;
  export type CashFlowSummary = {
    sales: number; expenses: number; net: number; artistPayouts: number; artistDebtRecovered: number; netAfterPayouts: number;
    profitMargin: number | null; avgSale: number | null; txnCount: number; unitsSold: number;
    prevYear: string | null; deltas: { sales: Delta; expenses: Delta; net: Delta } | null;
  };
  export type Trip = { total: number; count: number; latestDate?: string; minDate?: string; maxDate?: string; items: Row[]; categories: Record<string, number>; deductible?: number; record?: Row | null };
  export function buildTaxLedger(sources: TaxSources, selectedYear: string): Ledger;
  export function expenseBaseAmount(e: Row, fxRateCache?: Record<string, number>): number;
  export function tripsSummary(taxCenter: Row | null, fxRateCache?: Record<string, number>): Record<string, Trip>;
  export function tripsForYear(taxCenter: Row | null, fxRateCache?: Record<string, number>, selectedYear?: string): Record<string, Trip>;
  export function categorySummary(allLedger: Row[]): { list: Array<{ name: string; total: number; spent: number; rate: number; count: number; items: Row[] }>; grandTotal: number; totalTxns: number };
  export function cashFlowSummary(sources: TaxSources, selectedYear: string, ledger: { totalGrossSales: number; totalOperatingExpenses: number }): CashFlowSummary;
  export function rateNotes(allLedger: Row[]): { missing: number; estimated: number };
  export function ledgerYears(allLedger: Row[]): string[];
  export function ledgerCsvRows(data: Row[], baseCurrency: string): string[][];
  export function ledgerRowInType(row: Row, type: string): boolean;
  export function ledgerRowMatchesText(row: Row, query: string): boolean;
}
declare module "@stockroom/cashflow.js" {
  export function computeCashFlowMetrics(sources: Row, yearFilter: string): Row;
  export function buildCashFlowBuckets(ledger: Row[], yearFilter: string): Array<{ key: string; label: string; income: number; expense: number }>;
}
declare module "@stockroom/recurring.js" {
  export const RECURRING_FREQUENCIES: Array<{ id: string; months: number; label: string; short: string; per: string }>;
  export function recurringDueCharges(sub: Row, now?: Date): Array<{ date: string; monthKey: string; amount: number }>;
  export function newRecurringId(): string;
  export function localYmd(date?: Date): string;
  export function normalizeRecurring(sub: Row): Row;
  export function recurringStatus(sub: Row, now?: Date): "active" | "paused" | "ended" | "scheduled" | "invalid";
  export function nextRecurringDate(sub: Row, now?: Date): string | null;
  export function currentAmount(sub: Row, now?: Date): number;
  export function monthlyEquivalent(sub: Row, now?: Date): number;
  export function frequencyLabel(frequency: string): string;
  export function relativeDayLabel(dateStr: string, now?: Date): string;
  export function summarizeRecurring(subs: Row[], rates?: Record<string, number>, base?: string, now?: Date): {
    monthlyBase: number; annualBase: number; activeCount: number; pausedCount: number; endedCount: number; scheduledCount: number; unconverted: string[];
  };
}
declare module "@stockroom/deduction-gaps.js" {
  export function findDeductionGaps(ctx: Row): { gaps: Array<{ id: string; title: string; category: string; detail: string; prompt: string; estimate: number | null; estimateBasis?: string }>; hidden: number; totalEstimate: number; note: string };
}
declare module "@stockroom/receipt-storage.js" {
  export function expensesWithSettlements(state: Row | null): Row[];
  export function expenseMissingReceipt(item: Row): boolean;
  export function isGratuityExpense(item: Row): boolean;
  export function isRentExpense(item: Row): boolean;
  export function receiptRefsOf(item: Row): string[];
  export function summarizeReceiptStorage(items: Row[]): { cloudExpenses: number; cloudFiles: number; localFiles: number; linkedFiles: number; withReceipts: number; withoutReceipts: number; rentExpenses: number; totalFiles: number };
}
declare module "@stockroom/expense-totals.js" {
  export type CurrencyBucket = { code: string; outstanding: number; outstandingCount: number; settled: number; settledCount: number };
  export function expenseLedgerTotals(expenses: Row[], bookCode: string): CurrencyBucket[];
  export function expenseTotalsCopy(bucket: CurrencyBucket): { label: string; sub: string; status: "outstanding" | "clear"; amount: number; code: string };
  export function totalsByCurrency(expenses: Row[], bookCode: string): Array<{ code: string; total: number }>;
}
declare module "@stockroom/money.js" {
  export function fmt(n: number, cur?: string): string;
  export function getBookCurrencyCode(book: Row): string;
  export function normalizeCurrencyCode(cur: unknown, fallback?: string): string;
  export function roundCents(n: number): number;
}
declare module "@stockroom/csv.js" {
  export function toCsv(rows: unknown[][], opts?: { bom?: boolean; eol?: string }): string;
}
declare module "@stockroom/download.js" {
  export function downloadCsv(csv: string, filename: string): void;
}
declare module "@stockroom/shop-profile.js" {
  export function fileStem(opts?: { lower?: boolean }, profile?: { name?: string }): string;
}
declare module "@stockroom/publisher-intel-tools.js" {
  export function runIntelTool(name: string, args?: Row, ctx?: Row): Row;
}
