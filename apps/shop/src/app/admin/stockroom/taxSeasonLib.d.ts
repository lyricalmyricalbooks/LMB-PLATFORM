// The stockroom's own rules the tax-season export uses (`@stockroom/*` → apps/stockroom/src/lib).
declare module "@stockroom/earnings.js" {
  export function calcArtistEarnings(book: Record<string, any>, state: Record<string, any>): { totalArtistEarned?: number } | number | null;
  export function tierEffectiveCap(tier: Record<string, any>, productionCost?: number): number | null;
  export function payoutNetted(payout: Record<string, any>): number;
}
declare module "@stockroom/bookkeeping-days.js" {
  export type InPersonTax = { rate: number; name: string; included: boolean };
  export type DayLine = { date: string; salesCents: number; taxes: Record<string, number>; netCents: number; currency: string; [k: string]: unknown };
  export const TAX_BOOK_NAMES: readonly string[];
  export function suggestedTaxBookName(rate: { country?: string; region?: string; rate?: string | number } | null): string;
  export function inPersonTaxOf(setting: unknown): InPersonTax | null;
  export function isInPersonSale(row: unknown): boolean;
  export function inPersonDailyLines(sales: Array<{ date: string; amount: number }>, opts?: { tax?: InPersonTax | null; currency?: string }): DayLine[];
  export function dayLineRows(days: DayLine[]): string[][];
}
declare module "@stockroom/csv.js" {
  export function csvCell(value: unknown): string;
  export function csvRow(cells: unknown[]): string;
}
