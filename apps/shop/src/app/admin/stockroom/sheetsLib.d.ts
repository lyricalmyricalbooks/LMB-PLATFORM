// Types for the stockroom's Google Sheet rules the Sheets page imports (kept in this file so pages built side by side
// never edit the same declaration file). Functions only, so another file may add overloads.
declare module "@stockroom/google-sheet.js" {
  export const MAX_SALES_LINES: number;
  export const REFRESH_AFTER_MS: number;
  type Lines = (string | number)[][];
  type Opts = { isPractice?: (book: unknown, id: string) => boolean; max?: number };
  export function salesSheetLines(books: Record<string, unknown>, states: Record<string, unknown>, opts?: Opts): Lines;
  export function expensesSheetLines(books: Record<string, unknown>, states: Record<string, unknown>, opts?: Opts): Lines;
  export function sentWords(writtenAt: string | undefined, now?: number): string;
}
