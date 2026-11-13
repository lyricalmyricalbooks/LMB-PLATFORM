// Fair helpers, the owner's side, now run by the admin (it was the old stockroom app's features/fair-helpers.js). The
// owner's admin keeps the till's menu for helpers (fairTill/menu: each item's title, price, currency and copies on
// hand) and brings the sales helpers ring up (fairSales) into the records through the stockroom writer, so a book is
// still written only by its owner. The checks are the stockroom's own (lib/fair-helper.js); the rules are unchanged.
//
// A sale is brought in once its Undo has passed (a helper's Undo is a few seconds after the sale). It is claimed on
// the server first (marked `imported`, refused when the helper undid it), so two of the owner's devices never both
// bring it in; then each item gets one row numbered with the sale's id, which is skipped when the item holds it already.
// A claimed sale whose rows couldn't all be stored is kept on this device and finished at the next look.
import { FAIR_UNDO_MS } from "@stockroom/fair-mode.js";
import { fairMenu, helperImportPlan, type FairMenu, type HelperSale, type ImportRow } from "@stockroom/fair-helper.js";
import { bookCurrencyCode } from "@stockroom/currency-migration.js";

import type { BookState } from "./planSave";
import type { StockBook, StockroomRecords } from "./stockroomData";
import type { BookSaveResult } from "./stockroomWrite";
import { SHOP_CURRENCY } from "../moneySign";

/** The channel every till sale is recorded under, as on the owner's own till. */
export const FAIR_CHANNEL = "Book Fair";
/** How long after a sale reaches the server the helper may still Undo it on their screen, with room to spare. */
export const BRING_IN_AFTER_MS = FAIR_UNDO_MS + 15_000;
const UNFINISHED_KEY = "colophon-fair-unfinished";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const cents = (n: number) => Math.round(n * 100) / 100;

/** The menu from the records: list price, the item's currency, copies on hand and its cover. */
export function menuFrom(records: StockroomRecords, at?: string): FairMenu {
  return fairMenu(records.books.map((b) => ({
    id: b.id, title: b.title, price: b.listPrice, cur: bookCurrencyCode(b), onHand: num(records.states[b.id]?.stock),
    cover: typeof b.coverUrl === "string" ? b.coverUrl : "", accent: b.accent,
  })), at);
}

/** Each item's own price and currency: a helper's sale is never brought in below them. */
export function ownPrices(books: StockBook[]) {
  return Object.fromEntries(books.map((b) => [b.id, { price: b.listPrice, cur: bookCurrencyCode(b) }]));
}

const rowsOf = (state: Record<string, unknown> | undefined) => (Array.isArray(state?.hist) ? state!.hist as Array<Record<string, unknown>> : []);
const holds = (state: Record<string, unknown> | undefined, saleNum: string) => rowsOf(state).some((h) => h && h.num === saleNum && h.chan === FAIR_CHANNEL);

/** `mutate` adding one helper sale's row to its item; an item that holds the sale already is left as it is. */
export function addHelperRow(row: ImportRow, by: string, book: StockBook | undefined, now = Date.now()) {
  return (state: BookState): BookState => {
    if (holds(state as Record<string, unknown>, row.num)) return state;
    const hist = (Array.isArray(state.hist) ? state.hist : (state.hist = [])) as Array<Record<string, unknown>>;
    state.stock = Math.max(0, (num(state.stock) ?? 0) - row.qty);
    const amount = cents(row.qty * row.price);
    const cur = book ? bookCurrencyCode(book) : SHOP_CURRENCY;
    hist.unshift({
      recordedAt: new Date(now).toISOString(), num: row.num, chan: FAIR_CHANNEL, qty: row.qty, price: row.price, after: state.stock,
      notes: row.notes, date: row.date, payment: { currency: cur, amount, rate: null, convertedTotal: amount },
      enteredBy: "Publisher", fairHelper: by, cur,
    });
    return state;
  };
}

const atMs = (at: unknown): number | null => {
  if (at && typeof (at as { toMillis?: unknown }).toMillis === "function") return (at as { toMillis: () => number }).toMillis();
  const n = typeof at === "string" ? Date.parse(at) : Number(at);
  return Number.isFinite(n) ? n : null;
};

/** True when a sale is ready to come in: on the server, not undone, not brought in, and past its Undo. */
export function readyToBringIn(sale: HelperSale, now = Date.now()) {
  if (!sale || sale.imported || sale.cancelled || sale.pending) return false;
  const at = atMs(sale.at);
  return at != null && now - at >= BRING_IN_AFTER_MS;
}

export type InboxIO = {
  load(): Promise<StockroomRecords>;
  /** Marks the sale brought in on the server; false when it is gone, undone or already brought in. */
  claim(saleId: string): Promise<boolean>;
  saveBook(bookId: string, mutate: (state: BookState) => BookState): Promise<BookSaveResult>;
  unfinished: { read(): string[]; write(ids: string[]): void };
};

export type Stuck = { id: string; by: string; day: string; problem: string };
export type BringInResult = { brought: number; stuck: Stuck[]; waiting: number };

/**
 * Brings each ready helper sale into the records. `sales` are the inbox's recent sales. Sales with a problem (an item
 * the stockroom no longer has, a price below the owner's) are left in the inbox untouched and listed as stuck.
 */
export async function bringIn(sales: HelperSale[], io: InboxIO, now = Date.now()): Promise<BringInResult> {
  const unfinished = new Set(io.unfinished.read());
  const ready = sales.filter((s) => readyToBringIn(s, now));
  const finishing = sales.filter((s) => unfinished.has(s.id));
  const waiting = sales.filter((s) => s && !s.imported && !s.cancelled && !readyToBringIn(s, now)).length;
  if (!ready.length && !finishing.length) return { brought: 0, stuck: [], waiting };

  const records = await io.load();
  const books = new Map(records.books.map((b) => [b.id, b]));
  const states: Record<string, Record<string, unknown> | undefined> = { ...records.states };
  const prices = ownPrices(records.books);
  const stuck: Stuck[] = [];
  let brought = 0;

  const store = async (sale: HelperSale) => {
    const plan = helperImportPlan(sale, books.keys(), (bookId, saleNum) => holds(states[bookId], saleNum), prices);
    if (plan.problem) return plan.problem;
    for (const row of plan.rows) {
      const result = await io.saveBook(row.bookId, addHelperRow(row, String(sale.by || ""), books.get(row.bookId), now));
      if (result.status !== "saved" && result.status !== "unchanged") return "not-stored";
      states[row.bookId] = result.state as Record<string, unknown>;
    }
    return "";
  };

  for (const sale of finishing) {
    if (!(await store(sale))) { unfinished.delete(sale.id); brought++; }
  }
  for (const sale of ready) {
    if (unfinished.has(sale.id)) continue;
    const check = helperImportPlan(sale, books.keys(), () => false, prices);
    if (check.problem) { stuck.push({ id: sale.id, by: String(sale.by || ""), day: String(sale.day || ""), problem: check.problem }); continue; }
    // The server says which device brings it in; offline, the claim fails and the sale waits for the next look.
    let mine = false;
    try { mine = await io.claim(sale.id); } catch { break; }
    if (!mine) continue;
    unfinished.add(sale.id);
    io.unfinished.write([...unfinished]);
    if (!(await store(sale))) { unfinished.delete(sale.id); brought++; }
  }
  io.unfinished.write([...unfinished]);
  return { brought, stuck, waiting };
}

export const localUnfinished = {
  read(): string[] {
    try { const v = JSON.parse(globalThis.localStorage?.getItem(UNFINISHED_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
  },
  write(ids: string[]) {
    try { if (ids.length) globalThis.localStorage?.setItem(UNFINISHED_KEY, JSON.stringify(ids.slice(-200))); else globalThis.localStorage?.removeItem(UNFINISHED_KEY); } catch { /* private mode: finished this visit */ }
  },
};

// The sales the last look couldn't bring in, for Home's to-dos (attention-signals.js "orders-fair-helper-stuck").
let stuckNow: Stuck[] = [];
export function setStuck(stuck: Stuck[]) { stuckNow = stuck; }
/** The to-do input for stuck helper sales: { stuck, by, belowPrice }, or null when none are. */
export function stuckSummary(stuck: Stuck[] = stuckNow) {
  if (!stuck.length) return null;
  return { stuck: stuck.length, by: [...new Set(stuck.map((s) => s.by).filter(Boolean))], belowPrice: stuck.filter((s) => s.problem === "below-price").length };
}
