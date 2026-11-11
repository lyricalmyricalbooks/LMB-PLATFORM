import { describe, expect, it } from 'vitest';
import { invoicePendingSales, ledgerById, settleInvoicePaid, settleLedgerSalePaid } from '../src/lib/invoice-settle.js';

const state = () => ({
  stores: [{ id: 's1', name: 'Harbour', amountOwed: 30 }],
  ledger: [
    { id: 'a', type: 'Sale', storeId: 's1', status: 'pending', amountDue: 20 },
    { id: 'b', type: 'Sale', storeId: 's1', status: 'pending', amountDue: 10, voided: true },
    { id: 'c', type: 'Sale', storeId: 's1', status: 'paid', amountDue: 5 },
  ],
  hist: [],
  invoices: [
    { id: 'i1', num: 'INV-1', status: 'sent', items: [{ _ledgerId: 'a' }, { _ledgerId: 'b' }, { _ledgerId: 'c' }, {}] },
    { id: 'i2', status: 'paid', items: [] },
    { id: 'i3', status: 'cancelled', items: [] },
  ],
});

describe('invoice settling', () => {
  it('keeps the first row for a repeated id', () => {
    const m = ledgerById({ ledger: [{ id: 'x', n: 1 }, { id: 'x', n: 2 }, null] });
    expect(m.get('x').n).toBe(1);
  });
  it('counts only pending, non-voided linked sales', () => {
    const s = state();
    expect(invoicePendingSales(s, s.invoices[0])).toEqual({ rows: [s.ledger[0]], due: 20 });
  });
  it('flips the invoice and its pending sales and lowers what the store owes', () => {
    const s = state();
    const r = settleInvoicePaid(s, 'i1', { method: 'Bank transfer', paidAt: 123 });
    expect(r.ok).toBe(true);
    expect(r.settled.map((e) => e.id)).toEqual(['a']);
    expect(s.invoices[0]).toMatchObject({ status: 'paid', paidAt: 123, paidMethod: 'Bank transfer' });
    expect(s.ledger[0]).toMatchObject({ status: 'paid', paid: 'paid' });
    expect(s.ledger[1].status).toBe('pending');
    expect(s.stores[0].amountOwed).toBe(10);
  });
  it('refuses a paid, cancelled or missing invoice without changing anything', () => {
    const s = state();
    const before = JSON.stringify(s);
    expect(settleInvoicePaid(s, 'i2')).toEqual({ ok: false, reason: 'paid' });
    expect(settleInvoicePaid(s, 'i3')).toEqual({ ok: false, reason: 'cancelled' });
    expect(settleInvoicePaid(s, 'nope')).toEqual({ ok: false, reason: 'missing' });
    expect(JSON.stringify(s)).toBe(before);
  });
  it('never takes the owed balance below zero', () => {
    const s = state(); s.stores[0].amountOwed = 5;
    expect(settleLedgerSalePaid(s, s.ledger[0])).toBe(true);
    expect(s.stores[0].amountOwed).toBe(0);
    expect(settleLedgerSalePaid(s, s.ledger[0])).toBe(false);
  });
});
