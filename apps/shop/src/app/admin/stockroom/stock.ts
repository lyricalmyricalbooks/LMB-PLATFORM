// Stockroom › Stock and sales, worked out inside the admin by the stockroom's own rules, so a figure here is the figure
// the stockroom shows. Pure: the page is StockPage.tsx.
//
// The stockroom does not trust what it saved. Every time it loads an item it runs `recomputeAfters` (main.js): drop
// duplicate consignment mirrors, re-derive the mirrors from the ledger, rebuild sold / revenue / sales by channel from
// the sales list, recount the shelf. `settle` below runs the same steps from the same library on a copy of the records
// (nothing is written). Two small steps are not importable because they live in main.js with the screen code, and are
// repeated here exactly (marked below): the Consignment line of sales by channel, and each store's tally.
import { reconcileConsignmentMirrors } from "@stockroom/consignment.js";
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
  return state;
}

// main.js reconcileConsignmentChannel: the Consignment line of sales by channel comes from the sales list, not a counter.
function reconcileConsignmentChannel(s: Rec) {
  let txns = 0, units = 0, revenue = 0;
  for (const h of list(s.hist)) {
    if (h.consignmentLink && !h.voided) { txns++; units += num(h.qty); revenue += num(h.qty) * num(h.price); }
  }
  const stats = (s.chStats = s.chStats && typeof s.chStats === "object" ? s.chStats : {}) as Record<string, Rec>;
  if (txns > 0) stats.Consignment = { txns, units, revenue };
  else if (stats.Consignment && !(stats.Consignment.txns || stats.Consignment.units || stats.Consignment.revenue)) delete stats.Consignment;
}

// main.js reconcileStores: a store's sent / sold / returned come from the non-voided ledger; a store with no ledger rows
// keeps what was saved, because there is nothing to rebuild it from.
function storeRows(s: Rec): StoreRow[] {
  const tally = new Map<unknown, { sent: number; sold: number; returned: number }>();
  for (const e of list(s.ledger)) {
    if (e.voided || e.storeId == null) continue;
    let t = tally.get(e.storeId);
    if (!t) { t = { sent: 0, sold: 0, returned: 0 }; tally.set(e.storeId, t); }
    const qty = num(e.qty);
    if (e.type === "Shipment") t.sent += qty;
    else if (e.type === "Sale") t.sold += qty;
    else if (e.type === "Return") t.returned += qty;
  }
  return list(s.stores).map((store) => {
    const t = tally.get(store.id);
    const sent = t ? t.sent : num(store.sent), sold = t ? t.sold : num(store.sold), returned = t ? t.returned : num(store.returned);
    return { id: String(store.id ?? store.name ?? ""), name: String(store.name || "Store"), sent, sold, returned, outstanding: t ? Math.max(0, sent - sold - returned) : num(store.outstanding) };
  });
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
