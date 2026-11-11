// Types for the stockroom rules the Stockists, Shipping and Open call pages import (see stockroomLib.d.ts for the others).
declare module "@stockroom/consignment.js" {
  export function collectUniqueConsignmentStores(states: Record<string, any>, books: Array<{ id: string; title?: string }>): Array<Record<string, any>>;
  export function consignmentLedgerTotals(ledger: Array<Record<string, any>>, bookCode: string): Array<{ code: string; outstanding: number; paid: number; outstandingCount: number; paidCount: number }>;
  export function storeBalanceComparison(store: Record<string, any>, tallies: { sent: number; sold: number; returned: number; outstanding: number }): Array<{ key: string; label: string; card: number; ledger: number; off: boolean }>;
}
declare module "@stockroom/consignment-ledger-filter.js" {
  export type LedgerFilter = { storeId: string | number | null; type: string | null; unpaidOnly: boolean };
  export const LEDGER_TYPE_FILTERS: Array<{ key: string; label: string; glyph: string }>;
  export function filterLedgerEntries<T extends Record<string, any>>(entries: T[], filter: LedgerFilter): T[];
}
declare module "@stockroom/invoices.js" {
  export const BILL_TO_PERSON: string;
  export function invoiceBillToMode(inv: Record<string, any>): string;
}
declare module "@stockroom/payment-reminders.js" {
  export function invoiceReminderState(inv: Record<string, any>): { count: number; lastAt: number; lastKind: string; lastStatus: string; snoozedUntil: string };
  export function daysLate(inv: Record<string, any>, today: string): number | null;
}
declare module "@stockroom/money.js" {
  export function fmt(n: number, cur?: string): string;
  export function fmtD(d: unknown): string;
  export function roundCents(n: number): number;
  export function normalizeCurrencyCode(cur: unknown, fallback?: string): string;
  export function getBookCurrencyCode(book: Record<string, any> | null | undefined): string;
}
declare module "@stockroom/order-followups.js" {
  export type UnshippedOrder = { bookId: string; num: string; customer: string; bookTitle: string; qty: number; days: number };
  export function unshippedOrders(rows: Array<{ bookId: string; entry: Record<string, any>; bookTitle?: string }>, opts?: { now?: number; afterDays?: number; withinDays?: number; labelled?: Set<string> }): UnshippedOrder[];
  export function destinationLabel(entry: Record<string, any>): string;
}
declare module "@stockroom/shipping-price-check.js" {
  export const LOSS_MARGIN: number;
  export function rateAgainstPaid(price: number, paid: number): { gap: number; losing: boolean; text: string } | null;
}
declare module "@stockroom/shipping-reconciliation.js" {
  export function normalizeShippingOrderNumber(value: unknown): string;
  export function linkedShippingSummary(order: Record<string, any>, expenses: Array<Record<string, any>>, rate?: number): { customerPaid: number; customerBase: number | null; postageBase: number | null; marginBase: number | null; linkedCount: number };
}
declare module "@stockroom/postage-matching.js" {
  export function isPostageExpense(expense: Record<string, any>): boolean;
}
declare module "@stockroom/opencall.js" {
  export function ocCurrentStage(contributor: Record<string, any>): string;
  export function ocWaitingDays(contributor: Record<string, any>, now?: number): number | null;
  export function ocWhoseMove(contributor: Record<string, any>, isSuppressed?: (email: string) => boolean): "you" | "artist" | "blocked" | "done";
  export function ocNudgeDue(contributor: Record<string, any>, now?: number): boolean;
  export function ocProblems(contributor: Record<string, any>, isSuppressed?: (email: string) => boolean): string[];
  export function ocStageStates(contributor: Record<string, any>): Array<"done" | "you" | "artist" | "todo">;
  export function ocNextAction(contributor: Record<string, any>): string | null;
  export function ocSortContributors<T extends Record<string, any>>(list: T[], sortBy: string, now?: number): T[];
}
