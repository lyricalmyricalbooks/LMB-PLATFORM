// The stockroom's To-do list, worked out inside the admin by the stockroom's own engine (`buildAttentionSignals`), so
// the list here and the one the stockroom showed can never disagree. Pure: the page is TodoPage.tsx.
import { buildAttentionSignals, SIGNAL_GROUPS, type AttentionResult, type Signal } from "@stockroom/attention-signals.js";

import { labelledOrderNums, submissionsInput, tripsSummaryAll } from "@stockroom/attention-input.js";
import { deriveOnHand } from "@stockroom/inventory.js";

import type { StockroomRecords } from "./stockroomData";
import { SHOP_CURRENCY } from "../moneySign";

/** The stockroom's own key, so an item dismissed on either list stays dismissed on both. */
export const TODO_DISMISSED_KEY = "lm-dismissed-todo-signals";

export type Dismissed = Record<string, boolean>;
export type TodoList = AttentionResult & { hidden: number };

const localToday = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** An item with no records yet starts as the stockroom starts it: everything printed is on the shelf, nothing sold. */
const blankState = (book: Record<string, unknown>) => ({ stock: book.maxPrint, hist: [], ledger: [], stores: [], expenses: [], openCall: [] });

/** The to-do list for these records, minus what the owner dismissed. */
export function buildTodo(records: StockroomRecords, opts: {
  words?: (text: string) => string; booksShop?: boolean; dismissed?: Dismissed; now?: Date;
  /** Fair helper sales the owner's admin couldn't bring in (fairInbox.ts stuckSummary). */
  fairHelpers?: { stuck: number; by: string[]; belowPrice: number } | null;
} = {}): TodoList {
  const states = Object.fromEntries(records.books.map((book) => {
    const state: Record<string, unknown> = { ...blankState(book), ...(records.states[book.id] || {}) };
    // The stockroom counts the shelf again from the records every time it loads (recomputeAfters); the saved count can
    // be stale after a print run change, which would raise a false "running low" and "doesn't match" here.
    if (Number.isFinite(book.maxPrint)) state.stock = deriveOnHand(state, book);
    return [book.id, state];
  }));
  const taxCenter: Record<string, unknown> = records.taxCenter || { businessExpenses: [], recurring: [], settings: { baseCurrency: SHOP_CURRENCY } };
  const titleOf = (bookId: string) => String(records.books.find((b) => b.id === bookId)?.title || bookId);
  const raw = buildAttentionSignals({
    books: records.books,
    states,
    words: opts.words,
    booksShop: opts.booksShop !== false,
    // A shop here has no spreadsheet script to connect and saves straight to the cloud, so neither can need the owner.
    sheets: { connected: false, colophon: true, google: null },
    sync: { online: true, pending: 0, failed: false },
    // Author entries waiting come from the submissions the records hold; the fairs' costs are worked out by the same
    // functions the stockroom app uses. The open call left the admin (11 November 2026), so it raises no line here.
    submissions: submissionsInput(records.submissions, titleOf),
    openCall: [],
    taxCenter,
    tripsSummary: tripsSummaryAll(taxCenter),
    // Only what the records tell: which unsent orders already have a postage label. Card payments to match, refunds
    // to reverse, website orders to review, receipts waiting and the website link's state live in the old app's
    // browser (or its live checks) and are left out.
    automation: { labelledOrderNums: labelledOrderNums(states, taxCenter.businessExpenses as unknown[]), fairHelpers: opts.fairHelpers || undefined },
    today: localToday(opts.now || new Date()),
  });
  const dismissed = opts.dismissed || {};
  const signals = raw.signals.filter((s) => !dismissed[s.id]);
  const byGroup = Object.fromEntries(SIGNAL_GROUPS.map((group) => [group, signals.filter((s) => s.group === group)]));
  return { signals, byGroup, total: signals.length, urgent: signals.filter((s) => s.status === "blocked" || s.status === "warn").length, hidden: raw.signals.length - signals.length };
}

/** Where a fix button goes: the stockroom page, and the book to open there when the fix names one. */
export function fixTarget(signal: Signal, isPage: (id: string) => boolean): { page: string; bookId?: string } | null {
  const fix = signal.fix;
  if (!fix) return null;
  if (fix.kind === "taxcenter") return { page: fix.tab === "deductions" || fix.tab === "ledger" ? "expenses" : "taxcenter" };
  if (fix.kind === "tab") return fix.tab && isPage(fix.tab) ? { page: fix.tab } : null;
  if (fix.kind === "book" || fix.kind === "edit-book") {
    const page = fix.tab && isPage(fix.tab) ? fix.tab : "dashboard";
    return fix.bookId ? { page, bookId: fix.bookId } : { page };
  }
  return null;
}

/** The stockroom page where an item gets fixed, or null when there is nothing to open. */
export const fixPage = (signal: Signal, isPage: (id: string) => boolean): string | null => fixTarget(signal, isPage)?.page ?? null;

export function readDismissed(store: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): Dismissed {
  try { const map = JSON.parse(store?.getItem(TODO_DISMISSED_KEY) || "{}"); return map && typeof map === "object" ? map : {}; } catch { return {}; }
}
