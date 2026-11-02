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

/**
 * The invoice editor's starting values for one trade order, or null when it isn't one. Lines are the linked books at the
 * wholesale price actually charged; shipping, the discount and anything not linked to a book here (an e-book, an
 * unlinked edition) are carried so the total matches what the website recorded.
 */
export function tradeInvoiceDraft(web, { today = '' } = {}) {
  if (!isTradeInvoiceOrder(web)) return null;
  const totals = web.totals || {};
  const customer = web.customer || {};
  const address = customer.address || {};
  const items = [];
  let merch = 0;
  for (const [bookId, entry] of Object.entries(web.books || {})) {
    const qty = Math.floor(Number(entry && entry.net));
    if (!(qty > 0)) continue;
    const unit = money(entry.unitCAD);
    merch = money(merch + unit * qty);
    items.push({ description: (Array.isArray(entry.titles) && entry.titles.length ? entry.titles.join(' + ') : bookId), qty, unitPrice: unit, bookId });
  }
  const rest = money(money(totals.subtotal) - merch);
  if (rest > 0.005) items.push({ description: items.length ? 'Other items on the order' : 'Order items', qty: 1, unitPrice: rest, bookId: null });
  if (money(totals.shipping) > 0) items.push({ description: 'Shipping', qty: 1, unitPrice: money(totals.shipping), bookId: null });
  const discount = money(totals.discount);
  const taxable = money(items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0) - discount);
  const tax = money(totals.tax);
  const taxRate = tax > 0 && taxable > 0 ? Math.round((tax / taxable) * 100000) / 1000 : 0;
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
    discount,
    taxRate,
    currencyCode: 'CAD',
    terms: `Net ${days}.`,
    dueDate: dayOf(web.invoice.dueAt),
    notes: `Website order ${clean(web.number) || clean(web.orderId)}.`,
    issueDate: today,
  };
}
