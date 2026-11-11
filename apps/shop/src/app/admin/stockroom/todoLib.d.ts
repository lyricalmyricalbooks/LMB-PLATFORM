// Types for the pure to-do helpers shared with the old stockroom app (apps/stockroom/src/lib/attention-input.js).
declare module "@stockroom/attention-input.js" {
  export type SubmissionLine = { bookId: string; bookTitle: string; sales: number; expenses: number };
  export type OpenCallLine = { bookId: string; bookTitle: string; waiting: number };
  export function submissionsInput(authorSubmissions: Record<string, { sales?: object; expenses?: object } | null> | undefined, titleOf?: (bookId: string) => string | undefined): SubmissionLine[];
  export function openCallWaiting(states: Record<string, Record<string, unknown> | null> | undefined, titleOf?: (bookId: string) => string | undefined): OpenCallLine[];
  export function ordersWithLabels(nums: string[], businessExpenses?: unknown[]): string[];
  export function labelledOrderNums(states: Record<string, Record<string, unknown> | null> | undefined, businessExpenses?: unknown[]): string[];
  export function tripsSummaryAll(taxCenter: Record<string, unknown> | null | undefined, fxRates?: Record<string, number>): Record<string, unknown>;
}
declare module "@stockroom/book-summary.js" {
  /** The to-do lines that need the owner (blocked or warn), as Home counts them. */
  export function todoItems(result: { signals?: Array<{ id: string; group: string; status: string; label?: string; detail?: string }> } | null | undefined): Array<{ id: string; group: string; status: string; label: string; detail: string }>;
}
