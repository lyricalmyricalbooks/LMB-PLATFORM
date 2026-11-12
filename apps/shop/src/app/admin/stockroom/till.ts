// The Till (Stockroom › Sell in person), drawn by the admin itself. Pure: the tiles, the cart, the sale a payment button
// makes, the row each of its lines adds (the shape the stockroom's own register writes, features/pos.js), and the queue
// that keeps sales on this device until they are stored. The page is TillPage.tsx; every save goes through
// stockroomWrite.ts (WRITING.md). A sale is recorded the moment it is charged: it waits here, never lost, when the
// connection drops, and is stored when it comes back.
import { bookCurrencyCode } from "@stockroom/currency-migration.js";
import { localDay } from "@stockroom/calendar-day.js";

import type { BookState } from "./planSave";
import type { StockroomRecords, StockBook } from "./stockroomData";

/** The four payment buttons (mockup order). `value` is what the sale's note starts with, as the stockroom's register writes it. */
export const TILL_METHODS = [
  { value: "Cash", label: "Cash" },
  { value: "Card", label: "Card reader" },
  { value: "Stripe QR", label: "QR / Stripe" },
] as const;
/** Behind Other: the stockroom register's other ways of paying. */
export const OTHER_METHODS = [
  { value: "Bank Transfer", label: "E-transfer" },
  { value: "Comp/Gift", label: "Free copy" },
] as const;
export const ALL_METHODS: ReadonlyArray<{ value: string; label: string }> = [...TILL_METHODS, ...OTHER_METHODS];

/** The payment sheet's ways to pay (v4 mockup 1j). Other holds the two in OTHER_METHODS. */
export const SHEET_PAYS = [
  { value: "Cash", label: "Cash" },
  { value: "Card", label: "Card reader" },
  { value: "Stripe QR", label: "QR" },
  { value: "Other", label: "Other" },
] as const;
export type SheetPay = typeof SHEET_PAYS[number]["value"];
/** The quick amounts beside Exact on the cash part of the sheet. */
export const QUICK_CASH = [20, 50, 100] as const;

/**
 * Cash given against a total in one currency: the change due, or what is still to pay. Null while nothing (or nothing
 * readable) is typed, so the sheet says nothing yet.
 */
export function cashChange(total: number, given: string): { covered: boolean; amount: number } | null {
  const text = given.trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  const diff = Math.round((n - total) * 100) / 100;
  return diff >= 0 ? { covered: true, amount: diff } : { covered: false, amount: -diff };
}

/** The tile colours, in turn (Colophon tile tokens). */
export const TILE_TONES = ["mint", "apricot", "sky", "lilac"] as const;

export type TillItem = {
  id: string; title: string; initials: string; tone: typeof TILE_TONES[number];
  price: number; cur: string; onHand: number | null; codes: string[];
  /** The item's cover photo (the catalogue's `coverUrl`), "" when it has none: the tile shows initials then. */
  photo: string;
  /** A till-only item: its sales are tallied on the item, never in the stock records. */
  extra?: boolean;
};

/** Up to two letters for a tile: the first letters of the first two words that count ("The Ferry Poems" → "FP"). */
export function initials(title: string): string {
  const words = String(title || "").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const skip = new Set(["the", "a", "an", "of", "and"]);
  const kept = words.length > 1 ? words.filter((w) => !skip.has(w.toLowerCase())) : words;
  return (kept.length ? kept : words).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** A cover address safe to show on a tile: https, or a picture kept in the record itself. */
export function tilePhoto(url: unknown): string {
  const u = String(url ?? "").trim();
  return /^https:\/\/\S+$/i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) ? u : "";
}

/** Every item the till can sell, in the catalogue's order, with its copies on hand (null: not counted). */
export function tillItems(records: StockroomRecords): TillItem[] {
  const extras = (records.extras || []).filter((e) => !records.books.some((b) => b.id === e.id));
  return [...records.books, ...extras].map((book, i) => {
    const state = records.states[book.id] || {};
    const codes = [book.isbn, book.isbn13, book.sku, book.barcode, book.upc].map((c) => String(c ?? "").replace(/[\s-]/g, "")).filter(Boolean);
    return {
      id: book.id, title: book.title || "Untitled", initials: initials(book.title), tone: TILE_TONES[i % TILE_TONES.length],
      price: Math.max(0, num(book.listPrice) ?? 0), cur: bookCurrencyCode(book), photo: tilePhoto(book.coverUrl), onHand: i >= records.books.length ? null : num(state.stock), codes,
      ...(i >= records.books.length ? { extra: true } : {}),
    };
  });
}

/** The items a search or a scanned code picks: an exact code first and alone, else title words. */
export function findItems(items: TillItem[], query: string): TillItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const code = q.replace(/[\s-]/g, "");
  const exact = items.filter((i) => i.codes.some((c) => c.toLowerCase() === code));
  if (exact.length) return exact;
  return items.filter((i) => i.title.toLowerCase().includes(q) || i.codes.some((c) => c.toLowerCase().includes(code)));
}

export type Cart = Record<string, number>;
export type CartLine = { id: string; title: string; qty: number; price: number; cur: string; amount: number };

const cents = (n: number) => Math.round(n * 100) / 100;

export function cartLines(cart: Cart, items: TillItem[]): CartLine[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return Object.entries(cart).flatMap(([id, qty]) => {
    const item = byId.get(id);
    return item && qty > 0 ? [{ id, title: item.title, qty, price: item.price, cur: item.cur, amount: cents(qty * item.price) }] : [];
  });
}

/** Totals per currency, never added across currencies, in a steady order. */
export function totalsOf(lines: Array<{ cur: string; amount: number }>): Array<{ cur: string; amount: number }> {
  const t = new Map<string, number>();
  for (const l of lines) t.set(l.cur, cents((t.get(l.cur) || 0) + l.amount));
  return [...t.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cur, amount]) => ({ cur, amount }));
}

export function money(amount: number, cur: string): string {
  try { return new Intl.NumberFormat("en-CA", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).format(amount); }
  catch { return `${cur} ${amount.toFixed(2)}`; }
}
export const totalText = (totals: Array<{ cur: string; amount: number }>) => totals.length ? totals.map((t) => money(t.amount, t.cur)).join(" + ") : money(0, "CAD");

// ── A sale and its queue ──────────────────────────────────────────────────────────────────────────────────────────

export type TillLine = { bookId: string; title: string; qty: number; price: number; cur: string; rowId: string; stored?: boolean };
export type TillSale = {
  /** The checkout's number, shared by its rows ("POS-123456", as the stockroom's register numbers them). */
  num: string; at: number; day: string; method: string; fair: string; lines: TillLine[];
  /** Why the records refused it (a person has to look); the sale stays here until then. */
  problem?: string;
};

/** The stockroom's own row id (`evt-<time>-<random>`), which also orders the day's sales (fair-mode.js `eventTime`). */
const rowId = (at: number, random: () => number) => `evt-${at.toString(36)}-${random().toString(36).slice(2, 9)}`;

/** The way of paying that takes no money (the till's "Free copy"). */
export const FREE_COPY = "Comp/Gift";

export function newTillSale(lines: CartLine[], method: string, fair: string, now = Date.now(), random = Math.random): TillSale {
  return {
    num: `POS-${now.toString().slice(-6)}`, at: now, day: localDay(new Date(now)), method, fair: fair.trim(),
    // A free copy takes no money: its lines are recorded at 0, so no report counts income that never came in.
    lines: lines.map((l) => ({ bookId: l.id, title: l.title, qty: l.qty, price: method === FREE_COPY ? 0 : l.price, cur: l.cur, rowId: rowId(now, random) })),
  };
}

/** The note a till row carries: "<way of paying> · <fair>", which the stockroom reads back (fair-mode.js `fairNameOf`). */
export const tillNote = (sale: Pick<TillSale, "method" | "fair">) => (sale.fair ? `${sale.method} · ${sale.fair}` : sale.method);

/**
 * `mutate` adding one line of a till sale to its item, as the stockroom's register does (`chan: "Book Fair"`). A sale
 * already handed over is recorded even past the copies on hand; the stock never goes below zero. Sent twice, it is one row.
 */
export function addTillLine(sale: TillSale, line: TillLine, book: StockBook | undefined) {
  return (state: BookState): BookState => {
    const hist = (Array.isArray(state.hist) ? state.hist : (state.hist = [])) as Array<Record<string, unknown>>;
    if (hist.some((h) => h.sheetsId === line.rowId)) return state;
    const stock = num(state.stock) ?? 0;
    state.stock = Math.max(0, stock - line.qty);
    const amount = cents(line.qty * line.price);
    hist.unshift({
      recordedAt: new Date(sale.at).toISOString(),
      num: sale.num, chan: "Book Fair", qty: line.qty, price: line.price, after: state.stock, notes: tillNote(sale),
      date: sale.day, payment: { currency: line.cur, amount, rate: null, convertedTotal: amount },
      enteredBy: "Publisher", sheetsId: line.rowId, cur: book ? bookCurrencyCode(book) : line.cur,
      // The stockroom's mark for a copy given away: off the stock, out of sales, shares and tax figures.
      ...(sale.method === FREE_COPY ? { gratuity: true } : {}),
    });
    return state;
  };
}

/** Copies the queue still has to take off each item (lines not stored yet). */
export function waitingCopies(queue: TillSale[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sale of queue) for (const l of sale.lines) if (!l.stored) out[l.bookId] = (out[l.bookId] || 0) + l.qty;
  return out;
}

/** Copies left for a tile: on hand, less what is waiting to upload and what is in the cart (null: not counted). */
export function leftFor(item: TillItem, waiting: Record<string, number>, cart: Cart): number | null {
  return item.onHand == null ? null : item.onHand - (waiting[item.id] || 0) - (cart[item.id] || 0);
}

const QUEUE_KEY = "lm-admin-till-queue";

export function readQueue(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage, key = QUEUE_KEY): TillSale[] {
  try {
    const v = JSON.parse(storage?.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((s) => s && typeof s.num === "string" && Array.isArray(s.lines)) : [];
  } catch { return []; }
}

/** Keep the queue on this device. False when the browser wouldn't (private mode, full): the page says to stay open. */
export function writeQueue(queue: TillSale[], storage: Pick<Storage, "setItem" | "removeItem"> | undefined = globalThis.localStorage, key = QUEUE_KEY): boolean {
  try {
    if (queue.length) storage?.setItem(key, JSON.stringify(queue)); else storage?.removeItem(key);
    return !!storage;
  } catch { return false; }
}

/** The line under the payment buttons. */
export function uploadLine({ online, waiting, kept }: { online: boolean; waiting: number; kept: boolean }): { tone: "ok" | "wait" | "risk"; text: string } {
  const sales = `${waiting} ${waiting === 1 ? "sale" : "sales"}`;
  if (waiting && !kept) return { tone: "risk", text: `Keep this page open · ${sales} waiting to upload` };
  if (!online) return { tone: "wait", text: waiting ? `Offline · ${sales} waiting to upload` : "Offline · sales wait on this device" };
  if (waiting) return { tone: "wait", text: `Uploading · ${sales} waiting` };
  return { tone: "ok", text: "All sales uploaded" };
}
