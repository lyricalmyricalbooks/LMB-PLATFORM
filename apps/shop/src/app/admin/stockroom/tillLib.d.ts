// Types for the stockroom's register rules that the Till page imports through `@stockroom` (apps/stockroom/src/lib/fair-mode.js).
declare module "@stockroom/fair-mode.js" {
  type Totals = Record<string, number>;
  export type RegisterSale = { num: string; at: number; method: string; lines: Array<{ bookId: string; title: string; qty: number; amount: number; cur: string }>; totals: Totals; units: number };
  export type RegisterDay = { sales: RegisterSale[]; totals: Totals; units: number };
  export type DaySummary = {
    titles: Array<{ bookId: string; title: string; units: number; totals: Totals; left: number | null }>;
    methods: Array<{ method: string; label: string; sales: number; totals: Totals }>;
    totals: Totals; units: number; sales: number;
  };
  export const FAIR_UNDO_MS: number;
  export function registerSalesForDay(books: Array<{ id: string; title?: string; currency?: string; hist?: unknown[] }>, day: string): RegisterDay;
  export function fairDaySummary(day: RegisterDay, leftById?: Record<string, number | null>): DaySummary;
  export function readCurrentFair(dayStr: string, storage?: Storage): { name: string; day: string } | null;
  export function saveCurrentFair(name: string, dayStr: string, storage?: Storage): string | null;
}
