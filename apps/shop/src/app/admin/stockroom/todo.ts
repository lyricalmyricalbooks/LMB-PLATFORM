// The stockroom's To-do list, worked out inside the admin by the stockroom's own engine (`buildAttentionSignals`), so
// the list here and the one the stockroom showed can never disagree. Pure: the page is TodoPage.tsx.
import { buildAttentionSignals, SIGNAL_GROUPS, type AttentionResult, type Signal } from "@stockroom/attention-signals.js";

import { OC_STAGES } from "@stockroom/opencall.js";

import type { StockroomRecords } from "./stockroomData";

/** The stockroom's own key, so an item dismissed on either list stays dismissed on both. */
export const TODO_DISMISSED_KEY = "lm-dismissed-todo-signals";

export type Dismissed = Record<string, boolean>;
export type TodoList = AttentionResult & { hidden: number };

const localToday = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** An item with no records yet starts as the stockroom starts it: everything printed is on the shelf, nothing sold. */
const blankState = (book: Record<string, unknown>) => ({ stock: book.maxPrint, hist: [], ledger: [], stores: [], expenses: [], openCall: [] });

function openCallWaiting(records: StockroomRecords) {
  return records.books.flatMap((book) => {
    const list = records.states[book.id]?.openCall;
    if (!Array.isArray(list)) return [];
    // A contributor waits until each of the stockroom's stages is ticked.
    const waiting = list.filter((c) => OC_STAGES.some((stage) => !c?.[stage.key])).length;
    return waiting ? [{ bookId: book.id, bookTitle: book.title || book.id, waiting }] : [];
  });
}

/** The to-do list for these records, minus what the owner dismissed. */
export function buildTodo(records: StockroomRecords, opts: { words?: (text: string) => string; booksShop?: boolean; dismissed?: Dismissed; now?: Date } = {}): TodoList {
  const states = Object.fromEntries(records.books.map((book) => [book.id, { ...blankState(book), ...(records.states[book.id] || {}) }]));
  const raw = buildAttentionSignals({
    books: records.books,
    states,
    words: opts.words,
    booksShop: opts.booksShop !== false,
    // A shop here has no spreadsheet script to connect and saves straight to the cloud, so neither can need the owner.
    sheets: { connected: false, colophon: true, google: null },
    sync: { online: true, pending: 0, failed: false },
    submissions: [],
    openCall: openCallWaiting(records),
    taxCenter: records.taxCenter || { businessExpenses: [], recurring: [], settings: { baseCurrency: "CAD" } },
    tripsSummary: {},
    today: localToday(opts.now || new Date()),
  });
  const dismissed = opts.dismissed || {};
  const signals = raw.signals.filter((s) => !dismissed[s.id]);
  const byGroup = Object.fromEntries(SIGNAL_GROUPS.map((group) => [group, signals.filter((s) => s.group === group)]));
  return { signals, byGroup, total: signals.length, urgent: signals.filter((s) => s.status === "blocked" || s.status === "warn").length, hidden: raw.signals.length - signals.length };
}

/** The stockroom page where an item gets fixed, or null when there is nothing to open. */
export function fixPage(signal: Signal, isPage: (id: string) => boolean): string | null {
  const fix = signal.fix;
  if (!fix) return null;
  if (fix.kind === "taxcenter") return "taxcenter";
  if (fix.kind === "tab") return fix.tab && isPage(fix.tab) ? fix.tab : null;
  if (fix.kind === "book" || fix.kind === "edit-book") return fix.tab && isPage(fix.tab) ? fix.tab : "dashboard";
  return null;
}

export function readDismissed(store: Pick<Storage, "getItem"> | undefined = typeof localStorage === "undefined" ? undefined : localStorage): Dismissed {
  try { const map = JSON.parse(store?.getItem(TODO_DISMISSED_KEY) || "{}"); return map && typeof map === "object" ? map : {}; } catch { return {}; }
}
