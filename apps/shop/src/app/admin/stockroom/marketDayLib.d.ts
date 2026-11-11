// Types for the stockroom's morning-after summary (apps/stockroom/src/lib/market-day.js), imported through `@stockroom`.
declare module "@stockroom/market-day.js" {
  type Row = { bookId: string; entry: Record<string, any> };
  export type MarketDaySummary = { day: string; copies: number; lines: Array<{ bookId: string; qty: number; title: string; left: number | null }>; pay: { card: number; cash: number; other: number }; unmatched: number };
  export function latestMarketDay(rows: Row[], opts?: { today?: string; shownFor?: string; lookbackDays?: number }): string;
  export function summariseMarketDay(rows: Row[], day: string, opts?: { books?: Record<string, { title?: string }>; stockOf?: (id: string) => number | null; unmatched?: number }): MarketDaySummary;
  export function describeMarketDay(summary: MarketDaySummary): { title: string; detail: string; count: number; needsYou?: boolean };
}
