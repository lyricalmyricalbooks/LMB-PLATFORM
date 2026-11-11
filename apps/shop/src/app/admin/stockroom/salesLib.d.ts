// Types for the stockroom's sales and buyer rules the Sales records and Customers pages import (kept in this file so
// pages built side by side never edit the same declaration file). Functions only, so another file may add overloads.
declare module "@stockroom/order-history-search.js" {
  export function filterHistoryRows<T>(rows: T[], query: string): T[];
  export function historySearchIsActive(query: string): boolean;
  export function describeHistorySearch(query: string, opts?: { shown?: number; total?: number; scope?: string }): { active: boolean; headline: string; detail: string };
}
declare module "@stockroom/inventory.js" {
  export type TimelineRow = { type: "hist" | "consign"; h?: Record<string, unknown>; i?: number; e?: Record<string, unknown>; _ord?: number; _after?: number };
  export function buildOrderTimeline(state: Record<string, unknown>, book: Record<string, unknown>): TimelineRow[];
  export function recalculateBookStatsFromHistory(state: { hist?: unknown[]; sold?: number; revenue?: number; chStats?: Record<string, { txns: number; units: number; revenue: number }> }): void;
}
declare module "@stockroom/money.js" {
  export function fmt(n: unknown, cur?: string): string;
  export function fmtD(d: unknown): string;
  export function normalizeCurrencyCode(cur: unknown, fallback?: string): string;
  export function getBookCurrencyCode(book: Record<string, unknown> | null | undefined): string;
  export function paymentSummary(payment: unknown, book: Record<string, unknown> | null | undefined, entry?: Record<string, unknown> | null): string;
}
declare module "@stockroom/customer-list.js" {
  export type CustomerLine = { bookId: string; bookTitle: string; num: string; date: string; qty: number; amount: number; currency: string; channel: string; source: string };
  export type Customer = {
    email: string; name: string; orders: number; units: number; books: Set<string>; bookIds: Set<string>; channels: Set<string>; sources: Set<string>;
    spend: Record<string, number>; first: string; last: string; lines: CustomerLine[];
  };
  export type CustomerFilters = { search?: string; bookId?: string; channel?: string; spend?: string | number; orders?: string };
  export function custEmailKey(email: unknown): string;
  export function buildCustomerList(input: { books?: Record<string, unknown>; states?: Record<string, unknown>; orders?: unknown[]; appliedIds?: Set<string>; stripeRows?: unknown[] }): Customer[] & { _noEmail: number };
  export function applyCustomerFilter(list: Customer[], filters?: CustomerFilters): Customer[];
}
declare module "@stockroom/customer-segment.js" {
  export const SEGMENT_CHANNEL_LABELS: Record<string, string>;
  export const SEGMENT_ORDER_LABELS: Record<string, string>;
}
