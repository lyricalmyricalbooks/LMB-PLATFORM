// Stockroom › Sales records, worked out inside the admin: every sale the stockroom recorded, across items, newest first.
// The order, the running "copies left" and the totals are the stockroom's own (`buildOrderTimeline`,
// `recalculateBookStatsFromHistory`), and the search is its own (`order-history-search.js`), so this page and the
// stockroom's Order History can never disagree. Pure: the page is SalesPage.tsx. Read-only.
import { buildOrderTimeline, recalculateBookStatsFromHistory, type TimelineRow } from "@stockroom/inventory.js";
import { describeHistorySearch, filterHistoryRows, historySearchIsActive } from "@stockroom/order-history-search.js";
import { getBookCurrencyCode, normalizeCurrencyCode, paymentSummary } from "@stockroom/money.js";

import type { StockroomRecords } from "./stockroomData";

export type SaleRow = {
  key: string;
  bookId: string;
  bookTitle: string;
  /** A sale, or a consignment shipment or return (copies moving to or from a store). */
  kind: "sale" | "consign";
  num: string;
  /** The channel as the stockroom shows it ("Website", "In person", "Store", "Direct", "Gift"). */
  channel: string;
  date: string;
  qty: number;
  unit: number | null;
  total: number | null;
  currency: string;
  /** The currency the item is priced in (what its totals are kept in). */
  bookCurrency: string;
  /** Recorded in another currency than the item is priced in now: the stockroom marks these. */
  foreignCurrency: boolean;
  voided: boolean;
  gift: boolean;
  pendingArtist: boolean;
  notes: string;
  enteredBy: string;
  payment: string;
  /** Copies on hand right after this row, the stockroom's running count. */
  after: number | null;
  /** What this consignment row is ("Sent to <store>", "Returned from <store>"). */
  movement: string;
  raw: Record<string, unknown>;
  /** The descriptor the stockroom's own search reads. */
  descriptor: TimelineRow & { bookId: string };
};

const IN_PERSON = ["POS", "Fair", "Event", "In Person"];
const text = (value: unknown) => (value == null ? "" : String(value));
const num = (value: unknown) => Number(value) || 0;

/** A channel as the stockroom words it (a blank one is "Direct"). */
export function channelLabel(chan: unknown): string {
  const c = text(chan).trim();
  if (!c) return "Direct";
  if (c === "Website" || c === "Big Cartel") return "Website";
  if (IN_PERSON.includes(c)) return "In person";
  if (c === "Consignment" || c === "Store") return "Store";
  if (c === "Gratuity") return "Gift";
  return c;
}

const dayOf = (value: unknown) => text(value).slice(0, 10);

/** Every recorded sale and consignment movement across the items, newest first. */
export function buildSalesRows(records: StockroomRecords): SaleRow[] {
  const rows: SaleRow[] = [];
  for (const book of records.books) {
    const state = records.states[book.id];
    if (!state) continue;
    const bookCode = getBookCurrencyCode(book);
    for (const row of buildOrderTimeline({ hist: [], ledger: [], ...state }, book)) {
      const base = { bookId: book.id, bookCurrency: bookCode, bookTitle: book.title || book.id, after: Number.isFinite(row._after) ? (row._after as number) : null };
      if (row.type === "consign") {
        const e = row.e || {};
        const store = text(e.storeName) || "a store";
        const out = e.type === "Shipment";
        rows.push({
          ...base, key: `${book.id}:c${row._ord}`, kind: "consign", num: "", channel: "Store", date: dayOf(e.date),
          qty: num(e.qty), unit: null, total: null, currency: bookCode, foreignCurrency: false, voided: !!e.voided, gift: false, pendingArtist: false,
          notes: text(e.notes), enteredBy: "", payment: "", raw: e,
          movement: out ? `Sent to ${store}` : e.status === "restocked" ? `Returned from ${store}` : `Returned from ${store} and written off`,
          descriptor: { ...row, bookId: book.id },
        });
        continue;
      }
      const h = row.h || {};
      const gift = !!h.gratuity || h.chan === "Gratuity";
      const code = h.cur ? normalizeCurrencyCode(h.cur, bookCode) : bookCode;
      rows.push({
        ...base, key: `${book.id}:${row.i}`, kind: "sale", num: text(h.num), channel: channelLabel(gift ? "Gratuity" : h.chan), date: dayOf(h.date),
        qty: num(h.qty), unit: gift ? null : num(h.price), total: gift ? null : num(h.qty) * num(h.price), currency: code, foreignCurrency: code !== bookCode,
        voided: !!h.voided, gift, pendingArtist: !!h.artistPending, notes: text(h.notes),
        enteredBy: text(h.enteredBy) || (h.artistPending ? "Artist" : "Publisher"),
        payment: paymentSummary(h.payment, book, h), movement: "", raw: h,
        descriptor: { ...row, bookId: book.id },
      });
    }
  }
  // buildOrderTimeline sorts one item at a time; the same newest-first rule across all of them.
  return rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

export type SalesFilter = { search: string; channel: string; bookId: string; from: string; to: string; hideVoided: boolean };
export const NO_FILTER: SalesFilter = { search: "", channel: "", bookId: "", from: "", to: "", hideVoided: false };

export function filterSales(rows: SaleRow[], f: SalesFilter) {
  let scope = rows.filter((r) =>
    (!f.channel || r.channel === f.channel) && (!f.bookId || r.bookId === f.bookId)
    && (!f.from || (!!r.date && r.date >= f.from)) && (!f.to || (!!r.date && r.date <= f.to))
    && (!f.hideVoided || !r.voided));
  const inScope = scope.length;
  // The stockroom's search over the same rows it would be handed there; order is kept.
  if (historySearchIsActive(f.search)) {
    const keep = new Set(filterHistoryRows(scope.map((r) => r.descriptor), f.search));
    scope = scope.filter((r) => keep.has(r.descriptor));
  }
  return { rows: scope, inScope, described: describeHistorySearch(f.search, { shown: scope.length, total: inScope, scope: f.channel }) };
}

export type SalesTotals = {
  /** Sales that count: not voided, gifts and artist-pending included as the stockroom counts them. */
  sales: number;
  /** Copies sold (gifts left out), as the stockroom's "sold". */
  copies: number;
  gifts: number;
  voided: number;
  /** Money taken, per currency (an item's own currency; never added across currencies). */
  revenue: Record<string, number>;
};

/** The figures for these rows, from the stockroom's own tally of an item's history. Voided sales count for nothing. */
export function salesTotals(rows: SaleRow[]): SalesTotals {
  const totals: SalesTotals = { sales: 0, copies: 0, gifts: 0, voided: 0, revenue: {} };
  const perBook = new Map<string, { code: string; hist: unknown[] }>();
  for (const r of rows) {
    if (r.kind !== "sale") continue;
    if (r.voided) { totals.voided++; continue; }
    totals.sales++;
    if (r.gift) totals.gifts += r.qty;
    // One tally per item and currency: a sale kept in another currency is never added into the item's own.
    const groupKey = `${r.bookId}|${r.currency}`;
    const entry = perBook.get(groupKey) || { code: r.currency, hist: [] };
    entry.hist.push(r.raw);
    perBook.set(groupKey, entry);
  }
  for (const { code, hist } of perBook.values()) {
    const tally: { hist: unknown[]; sold?: number; revenue?: number } = { hist };
    recalculateBookStatsFromHistory(tally);
    totals.copies += tally.sold || 0;
    if (tally.revenue) totals.revenue[code] = Math.round(((totals.revenue[code] || 0) + tally.revenue) * 100) / 100;
  }
  return totals;
}
