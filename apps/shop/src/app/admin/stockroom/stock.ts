// Stockroom › Stock and sales, worked out inside the admin by the stockroom's own rules, so a figure here is the figure
// the stockroom shows. Pure: the page is StockPage.tsx.
//
// The stockroom does not trust what it saved. Every time it loads an item it runs `recomputeAfters` (main.js): drop
// duplicate consignment mirrors, re-derive the mirrors from the ledger, rebuild sold / revenue / sales by channel from
// the sales list, recount the shelf, rebuild each store's tally. `settle` below runs the same steps from the same library
// on a copy of the records (nothing is written).
import { reconcileConsignmentChannel, reconcileConsignmentMirrors, reconcileStores } from "@stockroom/consignment.js";
import {
  deduplicateDirectConsignmentSales, deriveOnHand, deriveStockBreakdown, inventoryBreakdown, recalculateBookStatsFromHistory,
  type InventoryBreakdown,
} from "@stockroom/inventory.js";
import { fmt, getBookCurrencyCode, transferAmount } from "@stockroom/money.js";

import type { StockBook, StockroomRecords } from "./stockroomData";

type Rec = Record<string, unknown>;
const list = (value: unknown): Rec[] => (Array.isArray(value) ? (value as Rec[]) : []);
const num = (value: unknown) => Number(value) || 0;

export type ChannelRow = { chan: string; txns: number; units: number; revenue: number };
export type StoreRow = { id: string; name: string; sent: number; sold: number; returned: number; outstanding: number };
/** Sold out, at or under the item's own threshold, within twice it (the stockroom's red and amber), or fine. */
export type StockLevel = "soldout" | "low" | "watch" | "ok";
export type ItemStock = InventoryBreakdown & {
  id: string; title: string; author: string; currency: string; code: string; listPrice: number; threshold: number;
  /** False for an item with no print run: its saved count is all there is (the stockroom's own fallback). */
  hasPrintRun: boolean;
  /** Copies the maker holds themselves, and what the publisher holds. */
  authorHeld: number; publisherOnHand: number;
  /** Copies sold (gifts left out), all channels. */
  sold: number;
  /** What the sales brought in, including the gross an artist collected and has not yet forwarded. */
  revenue: number;
  channels: ChannelRow[]; stores: StoreRow[];
  level: StockLevel;
};

/** The records of an item with none yet, as the stockroom starts it: everything printed is on the shelf, nothing sold. */
const blankState = (book: StockBook): Rec => ({ stock: book.maxPrint, authorStock: 0, sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [], artistTransfers: [], invoices: [] });

/** The item's records as the stockroom has them once loaded (a copy: the saved records are never changed). */
export function settle(book: StockBook, saved: Rec | undefined): Rec {
  const state: Rec = structuredClone({ ...blankState(book), ...(saved || {}) });
  for (const key of ["hist", "ledger", "stores", "artistTransfers", "invoices"]) state[key] = list(state[key]);
  deduplicateDirectConsignmentSales(state);
  reconcileConsignmentMirrors(state);
  recalculateBookStatsFromHistory(state);
  if (Number.isFinite(book.maxPrint)) state.stock = deriveOnHand(state, book);
  reconcileConsignmentChannel(state);
  reconcileStores(state);
  return state;
}

/** Each store's tally, rebuilt by the stockroom's own rule (reconcileStores) on the settled copy. */
function storeRows(s: Rec): StoreRow[] {
  return list(s.stores).map((store) => ({
    id: String(store.id ?? store.name ?? ""), name: String(store.name || "Store"),
    sent: num(store.sent), sold: num(store.sold), returned: num(store.returned), outstanding: num(store.outstanding),
  }));
}

/** Sales by channel with the gross an artist collected directly folded back in (dashboard.js chStatsWithHeld), biggest first. */
function channelRows(s: Rec): ChannelRow[] {
  const out: Record<string, ChannelRow> = {};
  for (const [chan, cs] of Object.entries((s.chStats || {}) as Record<string, Rec>)) out[chan] = { chan, txns: num(cs.txns), units: num(cs.units), revenue: num(cs.revenue) };
  for (const t of list(s.artistTransfers)) {
    const amount = transferAmount(t) || 0;
    if (!amount) continue;
    const chan = String(t.chan ?? "");
    const row = (out[chan] = out[chan] || { chan, txns: 0, units: 0, revenue: 0 });
    row.revenue += amount;
  }
  return Object.values(out).sort((a, b) => b.revenue - a.revenue || b.units - a.units || a.chan.localeCompare(b.chan));
}

/** The stockroom's colours for a shelf: red at or under the threshold, amber within twice it (main.js stockClass). */
export function stockLevel(onHand: number, threshold: number): StockLevel {
  if (onHand <= 0) return "soldout";
  if (onHand <= threshold) return "low";
  if (onHand <= threshold * 2) return "watch";
  return "ok";
}

export function itemStock(book: StockBook, saved: Rec | undefined): ItemStock {
  const s = settle(book, saved);
  const breakdown = inventoryBreakdown(s, book);
  const split = deriveStockBreakdown(s, book);
  const held = list(s.artistTransfers).reduce((sum, t) => sum + (transferAmount(t) || 0), 0);
  const threshold = book.threshold === "" || book.threshold == null || !Number.isFinite(Number(book.threshold)) ? 0 : Number(book.threshold);
  return {
    ...breakdown,
    id: book.id, title: String(book.title || book.id), author: String(book.author || ""), currency: String(book.currency || "$"), code: getBookCurrencyCode(book),
    listPrice: num(book.listPrice), threshold, hasPrintRun: Number.isFinite(book.maxPrint),
    authorHeld: split.authorHeld, publisherOnHand: split.publisherOnHand,
    sold: breakdown.directSold + breakdown.consignSold,
    revenue: num(s.revenue) + held,
    channels: channelRows(s), stores: storeRows(s),
    level: stockLevel(breakdown.onHand, threshold),
  };
}

const URGENCY: Record<StockLevel, number> = { soldout: 0, low: 1, watch: 2, ok: 3 };

/** Every item, sold out and low first, then by title. */
export function catalogueStock(records: StockroomRecords): ItemStock[] {
  return records.books.map((book) => itemStock(book, records.states[book.id])).sort((a, b) => URGENCY[a.level] - URGENCY[b.level] || a.title.localeCompare(b.title));
}

/** Items whose title or maker contains every typed word, in any case. */
export function searchItems(items: ItemStock[], query: string): ItemStock[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => { const hay = `${item.title} ${item.author}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}

export type Totals = { items: number; onHand: number; sold: number; atStores: number; needAttention: number; revenue: { code: string; currency: string; amount: number }[] };

/** The whole shelf in a line. Revenue is added per currency, never across them. */
export function totalsOf(items: ItemStock[]): Totals {
  const revenue = new Map<string, { code: string; currency: string; amount: number }>();
  for (const item of items) {
    const row = revenue.get(item.code) || { code: item.code, currency: item.currency, amount: 0 };
    row.amount += item.revenue;
    revenue.set(item.code, row);
  }
  return {
    items: items.length,
    onHand: items.reduce((n, i) => n + i.onHand, 0), sold: items.reduce((n, i) => n + i.sold, 0), atStores: items.reduce((n, i) => n + i.onConsignment, 0),
    needAttention: items.filter((i) => i.level === "soldout" || i.level === "low").length,
    revenue: [...revenue.values()],
  };
}

export const money = (amount: number, currency: string) => fmt(amount, currency);
