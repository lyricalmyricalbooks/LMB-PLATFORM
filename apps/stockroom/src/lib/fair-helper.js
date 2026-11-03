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
