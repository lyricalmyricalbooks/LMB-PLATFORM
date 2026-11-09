// Trade invoices from website orders (code plan 12.10).
//
// A trade account with invoice terms orders on the website and pays later. The website records that order as an ordinary
// paid sale (stock out, revenue) and sends it here with `web.invoice = { days, dueAt, paidAt }`. This module, with no DOM
// and no Firebase, decides which of those orders still need an invoice and builds the invoice editor's starting
// values from one. Nothing is written back to the website: it tracks when the money arrives.

import { roundCents } from './money.js';

const clean = (value) => String(value ?? '').trim();
const money = (value) => roundCents(Number(value) || 0);
const dayOf = (value) => (/^\d{4}-\d{2}-\d{2}/.test(clean(value)) ? clean(value).slice(0, 10) : '');

/** True for an order sold on invoice terms that is still owed, is not a rehearsal and has not been refunded. */
export function isTradeInvoiceOrder(web) {
  if (!web || typeof web !== 'object' || web.test === true) return false;
  const invoice = web.invoice;
  if (!invoice || !(Number(invoice.days) > 0) || invoice.paidAt) return false;
  if (web.paymentStatus !== 'paid' || web.refundState === 'full') return false;
  return true;
}

/**
 * The orders to offer an invoice for: trade orders with no invoice made from them yet. `docs` are the
 * websiteOrders documents ({ id, web }); `invoices` every saved invoice (the ones made from an order carry its id in
 * `webOrderId`). Oldest due date first.
 */
export function tradeInvoicesToSend(docs = [], invoices = []) {
  const made = new Set((invoices || []).map(inv => clean(inv && inv.webOrderId)).filter(Boolean));
  return (docs || [])
    .filter(d => d && d.id && isTradeInvoiceOrder(d.web) && !made.has(clean(d.id)))
    .map(d => ({
      orderId: clean(d.id),
      number: clean(d.web.number) || clean(d.web.orderId) || clean(d.id),
      name: clean(d.web.customer && d.web.customer.name),
      total: money(d.web.totals && d.web.totals.total),
      days: Math.floor(Number(d.web.invoice.days)),
      dueDay: dayOf(d.web.invoice.dueAt),
    }))
    .sort((a, b) => (a.dueDay || '9999').localeCompare(b.dueDay || '9999') || a.number.localeCompare(b.number));
}

const toCents = (value) => Math.round((Number(value) || 0) * 100);

/**
 * The shortest tax rate (in %) that the invoice editor turns back into exactly `taxCents` on `taxableCents`: the
 * editor only knows a rate, and a rate rounded to three places can miss the website's tax by a cent on a big order.
 */
export function rateForTax(taxCents, taxableCents) {
  if (!(taxCents > 0) || !(taxableCents > 0)) return 0;
  const exact = (taxCents / taxableCents) * 100;
  for (let places = 0; places <= 8; places++) {
    const f = 10 ** places;
    const rate = Math.round(exact * f) / f;
    if (Math.round(taxableCents * rate / 100) === taxCents) return rate;
  }
  return exact;
}

/**
 * The invoice editor's starting values for one trade order, or null when it isn't one. Lines are the linked books at the
 * wholesale price actually charged (the website's own line totals, so copies × price adds back to the cent); shipping,
 * the discount and anything not linked to a book here (an e-book, an unlinked edition) are carried so the total matches
 * what the website recorded. Copies a partial refund took back are not billed, and the tax goes with them; money
 * refunded beyond those copies comes off as discount, so the bill is what is still owed.
 */
export function tradeInvoiceDraft(web, { today = '' } = {}) {
  if (!isTradeInvoiceOrder(web)) return null;
  const totals = web.totals || {};
  const customer = web.customer || {};
  const address = customer.address || {};
  const items = [];
  let soldMerch = 0;   // every linked copy sold, in cents
  let keptMerch = 0;   // the copies still gone
  for (const [bookId, entry] of Object.entries(web.books || {})) {
    const qty = Math.floor(Number(entry && entry.net));
    const sold = Math.max(0, Math.floor(Number(entry && entry.sold)) || 0) || Math.max(0, qty || 0);
    const line = Math.max(0, toCents(entry && entry.merchCAD)) || Math.max(0, toCents(entry && entry.unitCAD) * sold);
    soldMerch += line;
    if (!(qty > 0)) continue;
    const kept = sold > qty ? Math.round((line * qty) / sold) : line;
    keptMerch += kept;
    // Precise enough that qty × unit rounds back to the line total.
    const unitPrice = Math.round((kept / 100 / qty) * 1e6) / 1e6;
    items.push({ description: (Array.isArray(entry.titles) && entry.titles.length ? entry.titles.join(' + ') : bookId), qty, unitPrice, bookId });
  }
  const restCents = Math.max(0, toCents(totals.subtotal) - soldMerch);
  if (restCents > 0) {
    const unlinked = (Array.isArray(web.unlinked) ? web.unlinked : []).map(u => clean(u && u.title)).filter(Boolean);
    const label = unlinked.length ? unlinked.join(' + ') : (items.length ? 'Other items on the order' : 'Order items');
    items.push({ description: label, qty: 1, unitPrice: restCents / 100, bookId: null });
  }
  const shipCents = Math.max(0, toCents(totals.shipping));
  if (shipCents > 0) items.push({ description: 'Shipping', qty: 1, unitPrice: shipCents / 100, bookId: null });

  // What the order was before any refund, and the share of it the copies kept still carry.
  const goodsAll = soldMerch + restCents;
  const goodsKept = keptMerch + restCents;
  const share = goodsAll > 0 ? goodsKept / goodsAll : 1;
  let discountCents = Math.round(Math.max(0, toCents(totals.discount)) * share);
  const taxCents = Math.round(Math.max(0, toCents(totals.tax)) * share);
  if (web.refundState === 'partial') {
    // Money refunded beyond the copies that came back (and their tax) is still off the bill.
    const refundCAD = web.refund && clean(web.refund.currency).toUpperCase() === 'CAD' ? Math.max(0, Math.round(Number(web.refund.amountMinor) || 0)) : 0;
    const billedBefore = (goodsKept - discountCents) + shipCents + taxCents;
    const owed = Math.max(0, toCents(totals.total) - refundCAD);
    if (refundCAD > 0 && billedBefore > owed) discountCents += billedBefore - owed;
  }
  const lineCents = goodsKept + shipCents;
  discountCents = Math.min(discountCents, lineCents);
  const discount = discountCents / 100;
  const taxRate = rateForTax(taxCents, lineCents - discountCents);
  const days = Math.floor(Number(web.invoice.days));
  const firstLinked = items.find(it => it.bookId);
  return {
    webOrderId: clean(web.orderId),
    ownerBookId: firstLinked ? firstLinked.bookId : null,
    person: {
      name: clean(customer.name),
      email: clean(customer.email),
      phone: clean(customer.phone),
      address: [clean(address.street), clean(address.unit)].filter(Boolean).join(', '),
      city: clean(address.city),
      region: clean(address.state),
      postal: clean(address.zip),
      country: clean(address.country),
    },
    items,
    discount: money(discount),
    taxRate,
    currencyCode: 'CAD',
    terms: `Net ${days}.`,
    dueDate: dayOf(web.invoice.dueAt),
    notes: `Website order ${clean(web.number) || clean(web.orderId)}.`,
    issueDate: today,
  };
}
