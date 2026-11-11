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
declare module "@stockroom/inventory-adjustment.js" {
  export type AdjustmentInput = {
    id: string; bookId: string; title: string; quantity: number; unitCostNative: number; nrvPerUnitNative?: number; currency: string;
    fxRate: number; date: string; reason: string; evidence: string; notes: string; priorWriteDownCAD: number;
  };
  export function createSection10Adjustment(input: AdjustmentInput): Record<string, any>;
  export function createInventoryDisposalExpense(input: AdjustmentInput): Record<string, any>;
  export function inventoryAdjustmentCsvRows(records: unknown): unknown[][];
}
declare module "@stockroom/inventory.js" {
  export function recordInventoryDisposal(state: Record<string, any>, disposal: { id: string; date: string; qty: number; reason?: string; notes?: string; sheetsId?: string }): Record<string, any> | null;
}
