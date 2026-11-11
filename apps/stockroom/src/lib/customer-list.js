/**
 * customer-list.js — who has bought, grouped by email.
 *
 * Pure: records in, buyers out. The Customers tab (features/customers.js) and the shop admin's Customers page both draw
 * their list from here, so the two can never count a buyer differently.
 *
 * Aggregates every buyer we can identify into one de-duplicated list keyed by lowercased email. Order history works
 * fully offline; scanned-but-unapplied website orders and a pulled Stripe list add buyers the history hasn't seen.
 * Spend is best-effort and kept per currency, never mixed — the Tax Centre remains the source of truth for money.
 */
import { getBookCurrencyCode, normalizeCurrencyCode } from './money.js';

/** Stable dedup key for a buyer: the lowercased, trimmed email. */
export function custEmailKey(email) { return String(email || '').trim().toLowerCase(); }

function upsert(map, email, name) {
  const key = custEmailKey(email);
  if (!key) return null;
  let rec = map.get(key);
  if (!rec) {
    rec = {
      email: String(email).trim(), name: '', orders: 0, units: 0,
      books: new Set(), bookIds: new Set(), channels: new Set(), sources: new Set(),
      spend: {}, first: '', last: '',
      // Each order that made up this buyer (newest first once built), for a detail view. The old tab ignores it.
      lines: [],
    };
    map.set(key, rec);
  }
  const nm = String(name || '').trim();
  if (nm && nm.length > rec.name.length) rec.name = nm; // keep the fullest name seen
  return rec;
}
function addSpend(rec, cur, amt) {
  const c = normalizeCurrencyCode(cur || '', '') || String(cur || '').toUpperCase();
  const n = Number(amt);
  if (!c || !isFinite(n) || n === 0) return;
  rec.spend[c] = (rec.spend[c] || 0) + n;
}
function touchDate(rec, date) {
  const d = String(date || '').slice(0, 10);
  if (!d) return;
  if (!rec.first || d < rec.first) rec.first = d;
  if (!rec.last || d > rec.last) rec.last = d;
}

/**
 * Build the de-duplicated buyer list, most recent buyer first.
 * @param {object} input
 * @param {Record<string, object>} input.books      the catalogue by id
 * @param {Record<string, object>} input.states     each book's records by id (`hist` is the sales list)
 * @param {object[]} [input.orders]                 scanned website orders (not yet in history)
 * @param {Set<string>} [input.appliedIds]          order numbers/ids already in history, skipped in `orders`
 * @param {object[]} [input.stripeRows]             the pulled Stripe payments
 * @returns {object[] & {_noEmail: number}}         `_noEmail` = sales left out for having no email
 */
export function buildCustomerList({ books = {}, states = {}, orders = [], appliedIds = new Set(), stripeRows = [] } = {}) {
  const map = new Map();
  let noEmail = 0;

  // 1) Order history across every book (authoritative, works offline).
  Object.keys(states).forEach(bid => {
    const bk = books[bid];
    const bookCur = bk ? normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD') : 'CAD';
    const bookTitle = bk?.title || bid;
    (states[bid].hist || []).forEach(h => {
      if (h.voided || h.gratuity || h.chan === 'Gratuity') return;
      const email = h.shipEmail || h.email || '';
      if (!custEmailKey(email)) { noEmail++; return; }
      const rec = upsert(map, email, h.shipName || h.customer || '');
      rec.orders++;
      rec.units += Number(h.qty) || 0;
      rec.books.add(bookTitle);
      rec.bookIds.add(bid);
      if (h.chan) rec.channels.add(h.chan);
      const isStripe = typeof h.sheetsId === 'string' && h.sheetsId.startsWith('stripe-');
      rec.sources.add(isStripe ? 'Stripe' : (h.chan === 'Website' ? 'Website' : (h.chan || 'Order')));
      const payCur = h.payment?.currency ? normalizeCurrencyCode(h.payment.currency, bookCur) : bookCur;
      const payAmt = h.payment?.amount != null ? h.payment.amount : (Number(h.qty) || 0) * (Number(h.price) || 0);
      addSpend(rec, payCur, payAmt);
      touchDate(rec, h.date);
      rec.lines.push({ bookId: bid, bookTitle, num: h.num ? String(h.num) : '', date: String(h.date || '').slice(0, 10), qty: Number(h.qty) || 0, amount: Number(payAmt) || 0, currency: payCur, channel: h.chan || '', source: 'History' });
    });
  });

  // 2) Scanned website orders not yet applied — still real buyers. Skip any whose order number is already in history
  //    to avoid double-counting.
  (orders || []).forEach(o => {
    if (!custEmailKey(o.email)) return;
    if (appliedIds.has(o.orderNum) || appliedIds.has(o.id)) return;
    const rec = upsert(map, o.email, o.customer || o.shipName || '');
    rec.orders++;
    rec.units += Number(o.qty) || 0;
    const bk = o.bookId && books[o.bookId] ? books[o.bookId] : null;
    let amount = 0, currency = '';
    if (bk) {
      rec.books.add(bk.title);
      rec.bookIds.add(o.bookId);
      currency = normalizeCurrencyCode(getBookCurrencyCode(bk), 'CAD');
      amount = (Number(o.qty) || 0) * (Number(o.price) || bk.listPrice || 0);
      addSpend(rec, currency, amount);
    }
    rec.channels.add('Website');
    rec.sources.add('Website');
    touchDate(rec, o.date);
    rec.lines.push({ bookId: o.bookId || '', bookTitle: bk?.title || '', num: String(o.orderNum || o.id || ''), date: String(o.date || '').slice(0, 10), qty: Number(o.qty) || 0, amount, currency, channel: 'Website', source: 'Website order' });
  });

  // 3) Stripe pull cache — discover/enrich card buyers. Only add counts + spend for buyers we don't already know
  //    locally, so payments already reconciled into history aren't double-counted.
  const knownBeforeStripe = new Set(map.keys());
  (stripeRows || []).forEach(p => {
    if (p.refunded || !custEmailKey(p.email)) return;
    const existed = knownBeforeStripe.has(custEmailKey(p.email));
    const rec = upsert(map, p.email, p.customer || '');
    rec.sources.add('Stripe');
    touchDate(rec, p.date);
    if (!existed) {
      rec.orders++;
      addSpend(rec, p.currency, p.amount);
      rec.lines.push({ bookId: '', bookTitle: '', num: '', date: String(p.date || '').slice(0, 10), qty: 0, amount: Number(p.amount) || 0, currency: normalizeCurrencyCode(p.currency || '', '') || String(p.currency || '').toUpperCase(), channel: 'Stripe', source: 'Stripe' });
    }
  });

  const list = Array.from(map.values());
  list.forEach(r => r.lines.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0)));
  // String comparison on ISO "YYYY-MM-DD" dates; most recent first.
  list.sort((a, b) => {
    const dA = a.last || '';
    const dB = b.last || '';
    return dA > dB ? -1 : (dA < dB ? 1 : 0);
  });
  list._noEmail = noEmail;
  return list;
}

/** A buyer's total spend as one number for the spend filter: other currencies at the tab's rough rates to dollars. */
export function customerSpendRough(spend) {
  let sum = 0;
  Object.keys(spend || {}).forEach(c => {
    const amt = spend[c] || 0;
    if (c === 'USD') sum += amt * 1.35;
    else if (c === 'EUR') sum += amt * 1.48;
    else if (c === 'GBP') sum += amt * 1.75;
    else sum += amt;
  });
  return sum;
}

/**
 * The five filters of the Customers tab over a list from buildCustomerList().
 * @param {object[]} list
 * @param {{search?: string, bookId?: string, channel?: string, spend?: string|number, orders?: string}} [f]
 */
export function applyCustomerFilter(list, f = {}) {
  let out = list;
  if (f.bookId) out = out.filter(r => r.bookIds.has(f.bookId));
  if (f.channel) {
    out = out.filter(r => {
      if (f.channel === 'Stripe') return r.sources.has('Stripe');
      return r.channels.has(f.channel);
    });
  }
  if (f.spend) {
    const min = Number(f.spend);
    out = out.filter(r => customerSpendRough(r.spend) >= min);
  }
  if (f.orders === 'repeat') {
    out = out.filter(r => r.orders >= 2);
  } else if (f.orders === 'single') {
    out = out.filter(r => r.orders === 1);
  }
  const q = String(f.search || '').trim().toLowerCase();
  if (q) out = out.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
  return out;
}
