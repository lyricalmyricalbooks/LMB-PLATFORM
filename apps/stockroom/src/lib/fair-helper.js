// Fair helpers (docs/combined-admin.md › Fair helpers plan): someone the shop's owner gave the "fairHelper" role on
// the Team rings up sales at the Fair till and nothing else. They read the till's menu (fairTill/menu, written by the
// publisher's device from its own records) and add sales to an inbox (fairSales); the publisher's stockroom brings
// those sales into the books' records, so it stays the only writer of a book. firestore.rules holds the same limits
// as this file; a test reads the rules to keep the two in step. Pure.
import { FAIR_METHODS } from './fair-mode.js';

/** Ways of paying a helper may record: the till's own, by value ("Cash", "Card", …). */
export const HELPER_METHODS = Object.freeze(FAIR_METHODS.map((m) => m.value));
export const MAX_MENU_BOOKS = 1000;
export const MAX_SALE_LINES = 50;
export const MAX_LINE_QTY = 99;
export const MAX_FAIR_NAME = 80;
const SALE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a verified sign-in pass with the Team's fair helper role (the shop's functions/roles.js). */
export function isFairHelperPass(user, claims) {
  return !!user && user.emailVerified === true && !!user.email && claims?.role === 'fairHelper';
}

const cents = (n) => Math.round(n * 100) / 100;
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * The till's menu for helpers: each book's id, title, price, currency and copies on hand, and nothing else (no
 * author, cost or customer). `books` are [{ id, title, price, cur, onHand }]; onHand null when the book isn't counted.
 * A book without a usable price is left out: a helper can't sell what has no price.
 */
export function fairMenu(books, at = new Date().toISOString()) {
  const out = [];
  for (const b of books || []) {
    const id = text(b?.id, 120);
    const price = Number(b?.price);
    if (!id || !Number.isFinite(price) || price < 0) continue;
    const onHand = Number.isFinite(b?.onHand) ? Math.max(0, Math.floor(b.onHand)) : null;
    out.push({ id, title: text(b.title, 200) || id, price: cents(price), cur: text(b.cur, 3).toUpperCase() || 'CAD', onHand });
    if (out.length >= MAX_MENU_BOOKS) break;
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return { books: out, at };
}

/** A new sale's id: long and random, so two helpers' phones never pick the same one. */
export function newSaleId(random = () => Math.random()) {
  let s = '';
  while (s.length < 20) s += Math.floor(random() * 36).toString(36);
  return `fs-${Date.now().toString(36)}-${s.slice(0, 20)}`;
}

/**
 * The inbox document for one helper sale (without `at`, which the caller sets to the server's time), or null when
 * it can't be sent: no lines, a made-up way of paying, a book not on the menu. Prices come from the menu, never from
 * the helper's screen, so a sale can't be cheaper than the owner set.
 */
export function helperSaleDoc({ id, by, day, fair, method, cart }, menu) {
  if (!SALE_ID.test(String(id || '')) || !DAY.test(String(day || '')) || !HELPER_METHODS.includes(method)) return null;
  const email = String(by || '').trim().toLowerCase();
  if (!email.includes('@')) return null;
  const books = new Map((menu?.books || []).map((b) => [b.id, b]));
  const lines = [];
  for (const item of cart || []) {
    const book = books.get(item?.bookId);
    const qty = Math.floor(Number(item?.qty));
    if (!book || !(qty >= 1 && qty <= MAX_LINE_QTY)) return null;
    lines.push({ bookId: book.id, title: book.title, qty, price: book.price, cur: book.cur });
  }
  if (!lines.length || lines.length > MAX_SALE_LINES) return null;
  return { id, doc: { by: email, day, fair: text(fair, MAX_FAIR_NAME), method, lines } };
}

/**
 * The lines of a sale from the inbox that the stockroom may bring in, checked against its own books: each line names
 * a known book and a whole quantity within limits, and its price is a number. Returns { lines, problem } with
 * problem "" when every line is fine; the publisher's side never brings in part of a sale.
 */
export function checkedHelperLines(sale, knownBookIds) {
  const known = knownBookIds instanceof Set ? knownBookIds : new Set(knownBookIds || []);
  const raw = Array.isArray(sale?.lines) ? sale.lines : [];
  if (!raw.length || raw.length > MAX_SALE_LINES) return { lines: [], problem: 'no-lines' };
  const lines = [];
  for (const l of raw) {
    const qty = Number(l?.qty);
    const price = Number(l?.price);
    if (!known.has(l?.bookId)) return { lines: [], problem: 'unknown-book' };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) return { lines: [], problem: 'bad-quantity' };
    if (!Number.isFinite(price) || price < 0) return { lines: [], problem: 'bad-price' };
    lines.push({ bookId: l.bookId, title: text(l.title, 200), qty, price: cents(price), cur: text(l.cur, 3).toUpperCase() || 'CAD' });
  }
  return { lines, problem: '' };
}

/**
 * The note on each record a helper's sale becomes: the way of paying first, then who rang it up in brackets, then
 * the fair, like a sale rung up on the owner's own till ("Cash (rung up by sam@example.com) · Riverside Fair"). The
 * till's summaries read the way of paying and the fair from it (fair-mode.js saleMethod / fairNameOf).
 */
export function helperSaleNotes(sale) {
  const method = HELPER_METHODS.includes(sale?.method) ? sale.method : 'Cash';
  const by = text(sale?.by, 120);
  const fair = text(sale?.fair, MAX_FAIR_NAME);
  return `${method}${by ? ` (rung up by ${by})` : ''}${fair ? ` · ${fair}` : ''}`;
}

/**
 * What bringing one helper sale into the books does: { rows, problem }. Each row is { bookId, qty, price, notes,
 * date, num } for the ledger's one sale-writing path, all sharing the sale's id as their number, so a checkout's
 * books group together like one till sale. `alreadyIn(bookId, num)` says whether a book already holds a record from
 * this sale (another device brought it in): those books are left out, so bringing a sale in twice never counts it
 * twice. `problem` is "" or one of checkedHelperLines' problems; with a problem nothing is brought in.
 */
export function helperImportPlan(sale, knownBookIds, alreadyIn = () => false) {
  const num = String(sale?.id || '');
  if (!SALE_ID.test(num)) return { rows: [], problem: 'bad-sale' };
  const { lines, problem } = checkedHelperLines(sale, knownBookIds);
  if (problem) return { rows: [], problem };
  const date = DAY.test(String(sale?.day || '')) ? sale.day : '';
  const notes = helperSaleNotes(sale);
  // Two lines for one book (rung up twice in one checkout) become one record of both.
  const byBook = new Map();
  for (const l of lines) {
    const row = byBook.get(l.bookId);
    if (row && row.price === l.price) row.qty += l.qty;
    else if (!row) byBook.set(l.bookId, { bookId: l.bookId, qty: l.qty, price: l.price, notes, date, num });
    else return { rows: [], problem: 'bad-price' };
  }
  return { rows: [...byBook.values()].filter((r) => !alreadyIn(r.bookId, num)), problem: '' };
}

/**
 * Copies a helper's till shows for each book: the menu's count less what this helper has sold that the owner's
 * stockroom hasn't brought in yet (once it has, the menu's count already says so). null for a book that isn't
 * counted. `mySales` are this helper's inbox documents.
 */
export function helperCopiesLeft(menu, mySales) {
  const waiting = new Map();
  for (const sale of mySales || []) {
    if (!sale || sale.imported) continue;
    for (const l of sale.lines || []) waiting.set(l.bookId, (waiting.get(l.bookId) || 0) + (Number(l.qty) || 0));
  }
  const out = {};
  for (const b of menu?.books || []) out[b.id] = b.onHand == null ? null : Math.max(0, b.onHand - (waiting.get(b.id) || 0));
  return out;
}

/** This helper's sales on one day, newest first, with the day's totals by currency and how many still wait to upload. */
export function helperDay(mySales, day) {
  const sales = (mySales || []).filter((s) => s && s.day === day)
    .sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const totals = {};
  let units = 0;
  let waiting = 0;
  for (const s of sales) {
    if (s.pending) waiting++;
    for (const l of s.lines || []) {
      units += Number(l.qty) || 0;
      totals[l.cur || 'CAD'] = cents((totals[l.cur || 'CAD'] || 0) + (Number(l.qty) || 0) * (Number(l.price) || 0));
    }
  }
  return { sales, totals, units, waiting };
}
