// The combined admin's line to the stockroom frame (combined.ts, StockroomFrame.tsx) for pages that are not the
// stockroom's own: the book page asks for one book's stock and sales, and opens that book in the stockroom. The
// stockroom stays the master count, so its figures come from it, never worked out again here.
//
// The frame opens on first need (Dashboard listens through `onNeed`) and is kept; questions wait for it to be ready.
import { FROM_ADMIN, FROM_STOCKROOM } from "./combined";

/** One stockroom book, as the stockroom counts it (apps/stockroom/src/lib/book-summary.js `bookSummary`). */
export interface StockroomBook {
  id: string; title: string; onHand: number; publisher: number; author: number; onConsignment: number;
  places: { name: string; qty: number }[]; stockists: { name: string; qty: number }[];
  channels: { chan: string; units: number; revenue: number; cur: string }[]; sold: number; lastSale: string | null;
}
/** The stockroom book that looks like a website book (`findBook`). */
export interface StockroomMatch { id: string; title: string; by: "isbn" | "title" }

/** One item of the stockroom's to-do list (`todoItems`). */
export interface StockroomTodo { id: string; group: string; status: string; label: string; detail: string }
/** One sale the stockroom recorded (`salesRows`): fairs, stockists, invoices, by hand; never a website order. */
export interface StockroomSale {
  key: string; bookId: string; title: string; date: string; chan: string; qty: number; amount: number; cur: string;
  stockist: string; invoice: string;
}

type Ask = { what: "book"; book: string } | { what: "find"; isbn?: string; title?: string } | { what: "todo" } | { what: "sales"; since?: string };

let frame: Window | null = null;
let seq = 0;
const readyWaiters = new Set<() => void>();
const needListeners = new Set<() => void>();
// A page asked before Dashboard listened (a child's effect runs before its parent's): the next listener hears it.
let neededEarly = false;
const need = () => {
  if (!needListeners.size) neededEarly = true;
  for (const listener of needListeners) listener();
};
const openListeners = new Set<(page: string) => void>();
let pendingOpen: { tab: string; book?: string; todo?: string } | null = null;

const post = (message: object) => {
  try { frame?.postMessage(message, window.location.origin); } catch { /* frame gone */ }
};

/** A checked answer from the stockroom frame to question `id`, else undefined. */
export function answerFor(event: { source: unknown; origin: string; data: unknown }, from: unknown, origin: string, id: string): { result: unknown } | undefined {
  if (!event || !from || event.source !== from || event.origin !== origin) return undefined;
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object" || data.source !== FROM_STOCKROOM || data.type !== "answer" || data.id !== id) return undefined;
  return { result: data.failed ? null : data.result ?? null };
}

export const stockroomBridge = {
  /** StockroomFrame: the frame said it is ready (again), or went away (null). */
  attach(win: Window | null) {
    frame = win;
    if (!win) return;
    for (const done of [...readyWaiters]) done();
    if (pendingOpen) { post({ source: FROM_ADMIN, type: "open", ...pendingOpen }); pendingOpen = null; }
  },
  /** Dashboard: open the frame when a page needs it. */
  onNeed(listener: () => void) {
    needListeners.add(listener);
    if (neededEarly) { neededEarly = false; listener(); }
    return () => { needListeners.delete(listener); };
  },
  /** Dashboard: show a stockroom page (the book page's "Open in the stockroom"). */
  onOpen(listener: (page: string) => void) { openListeners.add(listener); return () => { openListeners.delete(listener); }; },

  /** Show stockroom page `tab` in the admin, with `book` picked or on to-do item `todo`. */
  openPage(tab: string, extra: { book?: string; todo?: string } = {}) {
    if (frame) post({ source: FROM_ADMIN, type: "open", tab, ...extra });
    else { pendingOpen = { tab, ...extra }; need(); }
    for (const open of openListeners) open(tab);
  },
  /** Show stockroom page `tab` with `book` picked, in the admin. */
  openBook(tab: string, book: string) { stockroomBridge.openPage(tab, { book }); },

  /** Ask until the stockroom has an answer: it says nothing (null) while its catalog or records are still loading. */
  async askUntil<T>(question: Ask, { tries = 5, againMs = 1_500 } = {}): Promise<T | null> {
    for (let i = 0; i < tries; i += 1) {
      const answer = await stockroomBridge.ask<T>(question);
      if (answer) return answer;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, againMs));
    }
    return null;
  },

  /** Ask the stockroom; null when it has no answer (yet), can't be reached in `timeoutMs`, or failed. */
  async ask<T>(question: Ask, { timeoutMs = 15_000 } = {}): Promise<T | null> {
    const started = Date.now();
    if (!frame) {
      need();
      const got = await new Promise<boolean>((resolve) => {
        const done = () => { readyWaiters.delete(done); window.clearTimeout(timer); resolve(true); };
        const timer = window.setTimeout(() => { readyWaiters.delete(done); resolve(false); }, timeoutMs);
        readyWaiters.add(done);
      });
      if (!got || !frame) return null;
    }
    const from = frame;
    const id = `q${++seq}-${Date.now().toString(36)}`;
    return new Promise<T | null>((resolve) => {
      const on = (event: MessageEvent) => {
        const answer = answerFor(event, from, window.location.origin, id);
        if (!answer) return;
        finish(answer.result as T | null);
      };
      const finish = (value: T | null) => { window.removeEventListener("message", on); window.clearTimeout(timer); resolve(value); };
      const timer = window.setTimeout(() => finish(null), Math.max(1_000, timeoutMs - (Date.now() - started)));
      window.addEventListener("message", on);
      post({ source: FROM_ADMIN, type: "ask", id, ...question });
    });
  },
};
