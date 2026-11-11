// The combined admin's line to the stockroom for pages that are not the stockroom's own: the book page asks for one
// book's stock and sales and opens that book in the stockroom; Home asks for the to-dos and today at the fair; All
// sales asks for every recorded sale. Answered here from the stockroom's records with the stockroom's own rules
// (stockroom/stockroomAnswers.ts), so the figures are the stockroom's, never worked out a second way. The old stockroom
// app no longer runs behind the admin (11 November 2026).
import { answerFrom, type Ask } from "./stockroom/stockroomAnswers";
import { isRefusal, stockroomApi, type StockroomRecords } from "./stockroom/stockroomData";
import { onStockroomSaved } from "./stockroom/stockroomWrite";

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
  /** A till sale only: its checkout number (one per customer) and the fair it was sold at ("" when none was named). */
  sale?: string; fair?: string;
}

/** Today at the fair (`fairForAdmin`): the till's end-of-day figures, per currency, and its upload state. */
export interface StockroomFair {
  day: string | null; fair: string | null; sales: number; units: number;
  totals: Array<{ cur: string; amount: number }>;
  methods: Array<{ label: string; sales: number; totals: Array<{ cur: string; amount: number }> }>;
  titles: Array<{ bookId: string; title: string; units: number; left: number | null; totals: Array<{ cur: string; amount: number }> }>;
  /** Books sold today that are down to the till's "only a few left" count, fewest first. Absent from an older stockroom. */
  low?: Array<{ bookId: string; title: string; left: number }>;
  upload: { tone: string; text: string };
}

/** Records read within this long answer the next question too (Home, the book page and All sales ask together). */
const FRESH_MS = 15_000;
let cached: { at: number; read: Promise<StockroomRecords> } | null = null;
// A change saved in the admin shows at once: the next question reads the records again.
onStockroomSaved(() => { cached = null; });
const openListeners = new Set<(page: string, extra?: { book?: string; todo?: string }) => void>();

/** The records, read once for questions asked close together; a failed read is never kept. */
function records(load: () => Promise<StockroomRecords>): Promise<StockroomRecords> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.read;
  const read = load();
  cached = { at: Date.now(), read };
  read.catch(() => { if (cached?.read === read) cached = null; });
  return read;
}

export const stockroomBridge = {
  /** Dashboard: show a stockroom page (the book page's "Open in the stockroom"). */
  onOpen(listener: (page: string, extra?: { book?: string; todo?: string }) => void) { openListeners.add(listener); return () => { openListeners.delete(listener); }; },

  /** Show stockroom page `tab` in the admin, with `book` picked or on to-do item `todo`. */
  openPage(tab: string, extra: { book?: string; todo?: string } = {}) {
    for (const open of openListeners) open(tab, extra);
  },
  /** Show stockroom page `tab` with `book` picked, in the admin. */
  openBook(tab: string, book: string) { stockroomBridge.openPage(tab, { book }); },

  /** Forget the records read, so the next question reads them again (after a change saved here). */
  forget() { cached = null; },

  /** Kept for the callers that asked the old app again while it loaded: the records answer at once. */
  async askUntil<T>(question: Ask, opts: { load?: () => Promise<StockroomRecords> } = {}): Promise<T | null> {
    return stockroomBridge.ask<T>(question, opts);
  },

  /**
   * Ask the stockroom; `{ refused: true }` when its records are kept from this sign-in (a team member), null when they
   * couldn't be read (a dropped connection is never an empty answer).
   */
  async ask<T>(question: Ask, { load = stockroomApi.load }: { load?: () => Promise<StockroomRecords> } = {}): Promise<T | null> {
    try {
      return answerFrom(question, await records(load)) as T | null;
    } catch (error) {
      if (isRefusal(error)) return { refused: true } as T;
      console.error("The stockroom's records could not be read", error);
      return null;
    }
  },
};
