// Types for the stockroom rules the Stockists and Shipping pages import (see stockroomLib.d.ts for the others).
declare module "@stockroom/consignment.js" {
  export function collectUniqueConsignmentStores(states: Record<string, any>, books: Array<{ id: string; title?: string }>): Array<Record<string, any>>;
  export function consignmentLedgerTotals(ledger: Array<Record<string, any>>, bookCode: string): Array<{ code: string; outstanding: number; paid: number; outstandingCount: number; paidCount: number }>;
  export function stampLedgerInvoiceLink(s: Record<string, any>, ledgerId: unknown, inv: Record<string, any> | null): void;
  export function storeBalanceComparison(store: Record<string, any>, tallies: { sent: number; sold: number; returned: number; outstanding: number }): Array<{ key: string; label: string; card: number; ledger: number; off: boolean }>;
}
declare module "@stockroom/consignment-ledger-filter.js" {
  export type LedgerFilter = { storeId: string | number | null; type: string | null; unpaidOnly: boolean };
  export const LEDGER_TYPE_FILTERS: Array<{ key: string; label: string; glyph: string }>;
  export function filterLedgerEntries<T extends Record<string, any>>(entries: T[], filter: LedgerFilter): T[];
}
declare module "@stockroom/invoices.js" {
  export const BILL_TO_PERSON: string;
  export const BILL_TO_STORE: string;
  export function invoiceBillToMode(inv: Record<string, any>): string;
  export type BillToPerson = { name: string; email: string; phone: string; address: string; city: string; region: string; postal: string; country: string };
  export function billToPayload(mode: string, who: { store?: Record<string, any> | null; person?: Partial<BillToPerson> | null }): Record<string, any>;
  export function billToPersonFrom(inv: Record<string, any>): BillToPerson;
  export function deriveInvoiceBookIds(inv: Record<string, any>, ownerBookId: string, books: Array<{ id: string; title?: string }>): string[];
  export function lineItemBookId(item: Record<string, any>, ownerBookId: string, books: Array<{ id: string; title?: string }>): string;
  export function neutralInvoicePrefix(businessName: string): string;
  export function invoiceNumberPrefix(num: string): string;
  export function nextInvoiceSeq(allInvoices: Array<Record<string, any>>, prefix: string, year: number): number;
  export function buildInvoiceNumber(prefix: string, year: number, seq: number): string;
  export function clampPercent(v: unknown): number;
  export function formatInvoiceUnitPrice(unitPrice: unknown, symbol?: string): string;
  export function invoiceLineAmount(item: Record<string, any>): number;
  export function invoiceHasLineDiscounts(items: Array<Record<string, any>> | undefined): boolean;
  export function computeInvoiceTotals(input: { items: Array<Record<string, any>>; discountType?: string; discountValue?: unknown; taxRate?: unknown }):
    { subtotal: number; discount: number; discountType: "flat" | "percent"; discountRate: number; taxRate: number; tax: number; total: number };
  export function dueDateFromTerms(issueDate: string, days: number): string;
  export function daysBetween(fromDate: string, toDate: string): number | null;
  export function parseLooseNumber(v: unknown): number;
}
declare module "@stockroom/payment-reminders.js" {
  export function invoiceReminderState(inv: Record<string, any>): { count: number; lastAt: number; lastKind: string; lastStatus: string; snoozedUntil: string };
  export function daysLate(inv: Record<string, any>, today: string): number | null;
  export function reminderSettings(raw: unknown): { auto: boolean; days: number; message: string };
  export function buildReminderEmail(inv: Record<string, any>, opts: { settings: unknown; payLink?: string; publisher?: string; amountLabel?: string; attached?: boolean }): { subject: string; text: string; html: string };
}
declare module "@stockroom/money.js" {
  export function fmt(n: number, cur?: string): string;
  export function fmtD(d: unknown): string;
  export function roundCents(n: number): number;
  export function normalizeCurrencyCode(cur: unknown, fallback?: string): string;
  export function getSym(code: string): string;
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
declare module "@stockroom/invoice-settle.js" {
  export function settleInvoicePaid(s: Record<string, any>, invoiceId: string, opts?: { method?: string; paidAt?: number }):
    { ok: true; inv: Record<string, any>; settled: Array<Record<string, any>> } | { ok: false; reason: "missing" | "paid" | "cancelled" };
}
declare module "@stockroom/print-sheet-layout.js" {
  export function computeTallyRowHeights(numBooks: number, opts?: { includeNotes?: boolean; thHeight?: number }): { tallyRowHeight: number; priceRowHeight: number; fitsOnePage: boolean };
}
