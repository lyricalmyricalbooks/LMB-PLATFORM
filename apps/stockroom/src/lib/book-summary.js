// One book's stock and sales as the combined admin's book page shows them (docs/combined-admin.md, step 2): the
// stockroom stays the master count, so the website admin asks the stockroom for these figures instead of working
// them out again from the stockroom's records. Pure: give it the book's state and its catalog entry.
import { deriveStockBreakdown, inventoryBreakdown } from './inventory.js';
import { placeCounts } from './stock-places.js';
import { bookCurrencyCode } from './currency-migration.js';
import { normalizeCurrencyCode } from './money.js';
import { fairNameOf } from './fair-mode.js';

const num = (v) => Number(v) || 0;
const cents = (v) => Math.round(v * 100) / 100;
const digits = (v) => String(v ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
const words = (v) => String(v ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * @returns {{ id: string, title: string, onHand: number, publisher: number, author: number,
 *   onConsignment: number, places: { name: string, qty: number }[], stockists: { name: string, qty: number }[],
 *   channels: { chan: string, units: number, revenue: number, cur: string }[], sold: number, lastSale: string | null }}
 */
export function bookSummary(id, s, book) {
  const breakdown = deriveStockBreakdown(s, book);
  const accounting = inventoryBreakdown(s, book);
  const counts = placeCounts(s, book);
  const channels = new Map();
  let lastSale = null;
  for (const h of (s && s.hist) || []) {
    if (!h || h.voided || h.gratuity) continue;
    const chan = String(h.chan || 'Other');
    const cur = h.cur ? normalizeCurrencyCode(h.cur, bookCurrencyCode(book)) : bookCurrencyCode(book);
    const key = `${chan}\u0000${cur}`;
    const row = channels.get(key) || { chan, units: 0, revenue: 0, cur };
    row.units += num(h.qty);
    // A sale paid straight to the artist is not takings until the artist's transfer comes in (as the stockroom's own
    // totals count it: lib/inventory.js recalculateBookStatsFromHistory).
    if (!h.artistPending) row.revenue += num(h.qty) * num(h.price);
    channels.set(key, row);
    if (h.date && (!lastSale || String(h.date) > lastSale)) lastSale = String(h.date);
  }
  // Copies still at each stockist: sent, less sold there and sent back.
  const stores = new Map();
  for (const e of (s && s.ledger) || []) {
    if (!e || e.voided || !e.storeName) continue;
    const sign = e.type === 'Shipment' ? 1 : e.type === 'Sale' || e.type === 'Return' ? -1 : 0;
    if (!sign) continue;
    stores.set(e.storeName, (stores.get(e.storeName) || 0) + sign * num(e.qty));
  }
  const list = [...channels.values()].map((r) => ({ ...r, revenue: cents(r.revenue) })).sort((a, b) => b.units - a.units);
  return {
    id,
    title: String((book && book.title) || id),
    onHand: breakdown.totalOnHand,
    publisher: breakdown.publisherOnHand,
    author: breakdown.authorHeld,
    onConsignment: accounting.onConsignment,
    places: counts.length > 1 ? counts : [],
    stockists: [...stores].map(([name, qty]) => ({ name, qty })).filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty),
    channels: list,
    sold: list.reduce((n, r) => n + r.units, 0),
    lastSale,
  };
}

/**
 * The stockroom book that is most likely the website's book: the same ISBN (10 or more digits), else exactly the
 * same title. Only a single clear answer counts; two books with the same title is no answer.
 * @param {Record<string, { title?: string, isbn?: string }>} books
 * @returns {{ id: string, title: string, by: 'isbn' | 'title' } | null}
 */
export function findBook(books, { isbn, title } = {}) {
  const entries = Object.entries(books || {});
  const want = digits(isbn);
  if (want.length >= 10) {
    const hits = entries.filter(([, b]) => digits(b && b.isbn) === want);
    if (hits.length === 1) return { id: hits[0][0], title: String(hits[0][1].title || hits[0][0]), by: 'isbn' };
  }
  const name = words(title);
  if (name) {
    const hits = entries.filter(([, b]) => words(b && b.title) === name);
    if (hits.length === 1) return { id: hits[0][0], title: String(hits[0][1].title || hits[0][0]), by: 'title' };
  }
  return null;
}

/**
 * The stockroom's to-do list for the combined admin's Home ("Needs you now"), from `visibleAttentionResult()`:
 * plain fields only, the ones that need doing (`blocked` or `warn`). The website's own items (group `website`) are left
 * out: Home counts those itself. `orders-unshipped` stays: it lists only orders the website doesn't hold (payment
 * links, older imported orders), never the website's own (lib/order-followups.js `unshippedOrders`).
 * @param {{ signals?: Array<{ id: string, group: string, status: string, label?: string, detail?: string }> }} result
 */
export function todoItems(result) {
  return ((result && result.signals) || [])
    .filter((s) => s && s.id && s.group !== 'website' && (s.status === 'blocked' || s.status === 'warn'))
    .map((s) => ({ id: String(s.id), group: String(s.group), status: String(s.status || 'info'), label: String(s.label || ''), detail: String(s.detail || '') }));
}

/**
 * Every sale the stockroom recorded on or after `since` (YYYY-MM-DD), across all books, for the combined admin's
 * one list of sales. The website's own orders (`webOrderId`) are left out: the admin lists them from the website. `partial` says some
 * book's records weren't loaded, so the list may be short.
 */
export function salesRows(books, states, { since = '' } = {}) {
  const rows = [];
  let partial = false;
  for (const [id, book] of Object.entries(books || {})) {
    const s = states && states[id];
    if (!s || s._loadFailed) { partial = true; continue; }
    for (const h of s.hist || []) {
      // A sale the website link wrote or adopted carries `webOrderId`: it is the website's own order there. Other
      // 'Website' sales (payment links, older imported orders, recovered orders) exist only here, so they stay.
      if (!h || h.voided || h.gratuity || h.webOrderId) continue;
      const date = String(h.date || '');
      if (since && date && date < since) continue;
      const cur = h.cur ? normalizeCurrencyCode(h.cur, bookCurrencyCode(book)) : bookCurrencyCode(book);
      rows.push({
        key: `${id}:${h.num ?? ''}:${date}:${rows.length}`, bookId: id, title: String(book.title || id), date,
        chan: String(h.chan || 'Other'), qty: num(h.qty), amount: h.artistPending ? 0 : cents(num(h.qty) * num(h.price)), cur,
        stockist: h.consignmentLink ? String(h.storeName || h.notes || '') : '', invoice: h.invoiceNum ? String(h.invoiceNum) : '',
        // A till sale: its checkout number (one per customer) and the fair it was sold at, for the admin's fair days.
        ...(h.chan === 'Book Fair' ? { sale: h.num ? String(h.num) : '', fair: fairNameOf(h.notes) } : {}),
      });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { rows, partial };
}
