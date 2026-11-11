// Marking a consignment invoice paid, as plain data changes on one book's state. Moved out of main.js (where
// `ledgerById` and `settleLedgerSalePaid` lived) so the shop admin's Stockists page settles an invoice with exactly the
// stockroom's rule: the invoice flips to paid, each linked pending sale flips to paid, the store's owed balance drops
// by what those sales owed and their History mirrors follow. No DOM, no saving, no network: the callers do that.

import { histMirrorForLedger } from './consignment.js';
import { roundCents } from './money.js';

/** Ledger rows by id in one pass (the first row wins for a repeated id). */
export function ledgerById(s) {
  const map = new Map();
  for (const x of (s.ledger || [])) if (x && !map.has(x.id)) map.set(x.id, x);
  return map;
}

/** Canonical "mark this sale paid": only a pending, non-voided row. Returns true when it changed something. */
export function settleLedgerSalePaid(s, e) {
  if (!e || e.status !== 'pending' || e.voided) return false;
  const st = (s.stores || []).find(x => x.id === e.storeId);
  if (st) st.amountOwed = roundCents(Math.max(0, (st.amountOwed || 0) - (e.amountDue || 0)));
  e.status = 'paid'; e.paid = 'paid';
  const h = histMirrorForLedger(s, e);
  if (h) h.paidState = 'paid';
  return true;
}

/** The pending, non-voided ledger sales an invoice bills, and what they owe together (book currency). */
export function invoicePendingSales(s, inv) {
  const rows = [];
  let due = 0;
  const ledger = ledgerById(s);
  for (const it of ((inv && inv.items) || [])) {
    if (!it || !it._ledgerId) continue;
    const e = ledger.get(it._ledgerId);
    if (e && e.status === 'pending' && !e.voided) { rows.push(e); due += Number(e.amountDue) || 0; }
  }
  return { rows, due: roundCents(due) };
}

/**
 * Settle the invoice `invoiceId` in state `s` (mutates `s`). Only a draft or sent invoice can be settled. Returns
 * `{ ok: true, inv, settled }` (the sales it cleared) or `{ ok: false, reason }` with reason "missing", "paid" or
 * "cancelled".
 */
export function settleInvoicePaid(s, invoiceId, { method = 'Other', paidAt = Date.now() } = {}) {
  const inv = ((s && s.invoices) || []).find(i => i && String(i.id) === String(invoiceId));
  if (!inv) return { ok: false, reason: 'missing' };
  if (inv.status === 'paid') return { ok: false, reason: 'paid' };
  if (inv.status === 'cancelled') return { ok: false, reason: 'cancelled' };
  const { rows } = invoicePendingSales(s, inv);
  inv.status = 'paid';
  inv.paidAt = paidAt;
  inv.paidMethod = method;
  const settled = rows.filter(e => settleLedgerSalePaid(s, e));
  return { ok: true, inv, settled };
}
