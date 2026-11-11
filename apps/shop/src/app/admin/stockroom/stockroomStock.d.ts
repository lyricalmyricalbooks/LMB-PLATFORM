// Types for the stockroom's plain-JS stock and money rules that the Stock and sales page imports (kept apart from
// stockroomLib.d.ts so pages built side by side don't edit the same file). Ambient module declarations merge.
declare module "@stockroom/inventory.js" {
  export type InventoryBreakdown = {
    printed: number; onHand: number; directSold: number; consignSold: number; gratuities: number;
    onConsignment: number; writtenOff: number; unaccounted: number;
  };
  export function inventoryBreakdown(state: Record<string, unknown>, book: Record<string, unknown>): InventoryBreakdown;
  export function deriveStockBreakdown(state: Record<string, unknown>, book: Record<string, unknown>): {
    totalOnHand: number; publisherOnHand: number; authorHeld: number; pctPublisher: number; pctAuthor: number;
  };
  export function deduplicateDirectConsignmentSales(state: Record<string, unknown>): void;
  export function recalculateBookStatsFromHistory(state: Record<string, unknown>): void;
}
declare module "@stockroom/consignment.js" {
  export function reconcileConsignmentMirrors(state: Record<string, unknown>): void;
}
declare module "@stockroom/money.js" {
  export function transferAmount(transfer: unknown): number | null;
  export function fmt(amount: unknown, currency?: string): string;
  export function fmtWhole(amount: unknown, currency?: string): string;
  export function getBookCurrencyCode(book: unknown): string;
}
