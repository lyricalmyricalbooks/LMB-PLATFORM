// Types for the stockroom rules recordSale.ts imports (kept apart so pages built side by side never edit one file).
declare module "@stockroom/currency-migration.js" {
  export function bookCurrencyCode(book: Record<string, unknown> | null | undefined): string;
}
declare module "@stockroom/consignment.js" {
  export function notesWithInvoiceDiscount(invoices: unknown[] | undefined, num: string, notes: string): string;
}
declare module "@stockroom/calendar-day.js" {
  export function localDay(value?: number | string | Date): string;
}
