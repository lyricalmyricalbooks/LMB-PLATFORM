// Types for the stockroom's fair helper rules (apps/stockroom/src/lib/fair-helper.js) and the till's ways of paying,
// which the admin's helper till and the owner's inbox import through `@stockroom`.
declare module "@stockroom/fair-helper.js" {
  export type MenuBook = { id: string; title: string; price: number; cur: string; onHand: number | null; cover?: string; accent?: string };
  export type FairMenu = { books: MenuBook[]; at: string };
  export type HelperLine = { bookId: string; title: string; qty: number; price: number; cur: string };
  export type HelperSale = {
    id: string; by?: string; day?: string; fair?: string; method?: string; lines?: HelperLine[];
    imported?: unknown; cancelled?: boolean; pending?: boolean; at?: unknown;
  };
  export type ImportRow = { bookId: string; qty: number; price: number; notes: string; date: string; num: string };
  export const HELPER_METHODS: readonly string[];
  export function fairMenu(books: Array<{ id: string; title?: string; price?: unknown; cur?: string; onHand?: number | null; cover?: string; accent?: unknown }>, at?: string): FairMenu;
  export function newSaleId(random?: () => number): string;
  export function helperSaleDoc(
    sale: { id: string; by: string; day: string; fair: string; method: string; cart: Array<{ bookId: string; qty: number }> },
    menu: FairMenu | null,
  ): { id: string; doc: { by: string; day: string; fair: string; method: string; lines: HelperLine[] } } | null;
  export function helperImportPlan(
    sale: HelperSale, knownBookIds: Iterable<string> | Set<string>, alreadyIn?: (bookId: string, num: string) => boolean,
    prices?: Record<string, { price: unknown; cur: string }> | null,
  ): { rows: ImportRow[]; problem: string };
  export function helperCopiesLeft(menu: FairMenu | null, mySales: HelperSale[]): Record<string, number | null>;
  export function helperDay(mySales: HelperSale[], day: string): {
    sales: HelperSale[]; totals: Record<string, number>; byMethod: Record<string, Record<string, number>>;
    units: number; waiting: number; kept: number;
  };
}
declare module "@stockroom/fair-mode.js" {
  export const FAIR_METHODS: ReadonlyArray<{ value: string; label: string; icon: string; other?: boolean }>;
}
