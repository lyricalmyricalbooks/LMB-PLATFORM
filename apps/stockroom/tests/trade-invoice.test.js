import { describe, expect, it } from 'vitest';
import { isTradeInvoiceOrder, tradeInvoicesToSend, tradeInvoiceDraft, rateForTax } from '../src/lib/trade-invoice.js';
import { computeInvoiceTotals } from '../src/lib/invoices.js';

const web = (extra = {}) => ({
  v: 1, orderId: 'ABC123', number: '#WEB-ABC123', test: false, paymentStatus: 'paid', refundState: 'none',
  totals: { subtotal: 70, discount: 0, shipping: 10, tax: 10.4, total: 90.4 },
  customer: { name: 'Main Street Goods', email: 'orders@mainstreetgoods.example', phone: '555', address: { street: '1 Main St', unit: '2', city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'Canada' } },
  books: { b1: { net: 2, sold: 2, restocked: 0, unitCAD: 20, merchCAD: 40, titles: ['Tee'] }, b2: { net: 1, sold: 1, restocked: 0, unitCAD: 30, merchCAD: 30, titles: ['Hoodie — XL'] } },
  invoice: { days: 30, dueAt: '2026-12-02T15:00:00.000Z', paidAt: null },
  ...extra,
});

describe('which orders are trade invoices', () => {
  it('needs terms, a paid order, no rehearsal, nothing refunded and no payment recorded', () => {
    expect(isTradeInvoiceOrder(web())).toBe(true);
    expect(isTradeInvoiceOrder(web({ invoice: undefined }))).toBe(false);
    expect(isTradeInvoiceOrder(web({ invoice: { days: 0 } }))).toBe(false);
    expect(isTradeInvoiceOrder(web({ invoice: { days: 30, paidAt: '2026-12-01T00:00:00Z' } }))).toBe(false);
    expect(isTradeInvoiceOrder(web({ test: true }))).toBe(false);
    expect(isTradeInvoiceOrder(web({ refundState: 'full' }))).toBe(false);
    expect(isTradeInvoiceOrder(web({ paymentStatus: 'refunded' }))).toBe(false);
    expect(isTradeInvoiceOrder(null)).toBe(false);
  });
  it('lists orders without an invoice yet, earliest due date first', () => {
    const docs = [
      { id: 'o2', web: web({ orderId: 'o2', number: '#WEB-2', invoice: { days: 30, dueAt: '2026-12-20T00:00:00Z' } }) },
      { id: 'o1', web: web({ orderId: 'o1', number: '#WEB-1' }) },
      { id: 'o3', web: web({ orderId: 'o3', invoice: undefined }) },
      { id: 'o4', web: web({ orderId: 'o4' }) },
    ];
    const list = tradeInvoicesToSend(docs, [{ webOrderId: 'o4' }, { webOrderId: '' }]);
    expect(list.map(x => x.orderId)).toEqual(['o1', 'o2']);
    expect(list[0]).toMatchObject({ number: '#WEB-1', name: 'Main Street Goods', total: 90.4, days: 30, dueDay: '2026-12-02' });
  });
});

describe('the invoice draft', () => {
  it('bills the linked books at the wholesale price charged, with shipping and the website tax rate', () => {
    const d = tradeInvoiceDraft(web(), { today: '2026-11-02' });
    expect(d.items).toEqual([
      { description: 'Tee', qty: 2, unitPrice: 20, bookId: 'b1' },
      { description: 'Hoodie — XL', qty: 1, unitPrice: 30, bookId: 'b2' },
      { description: 'Shipping', qty: 1, unitPrice: 10, bookId: null },
    ]);
    expect(d.taxRate).toBe(13);
    expect(d.terms).toBe('Net 30.');
    expect(d.dueDate).toBe('2026-12-02');
    expect(d.notes).toBe('Website order #WEB-ABC123.');
    expect(d.person).toMatchObject({ name: 'Main Street Goods', address: '1 Main St, 2', city: 'Toronto', region: 'ON', postal: 'M6G 3H1', country: 'Canada' });
    expect(d.webOrderId).toBe('ABC123');
    expect(d.ownerBookId).toBe('b1');
  });
  it('carries what is not a linked book so the total still matches the website', () => {
    const d = tradeInvoiceDraft(web({ totals: { subtotal: 120, discount: 5, shipping: 0, tax: 0, total: 115 } }));
    expect(d.items.map(i => i.description)).toEqual(['Tee', 'Hoodie — XL', 'Other items on the order']);
    expect(d.items[2].unitPrice).toBe(50);
    expect(d.discount).toBe(5);
    expect(d.taxRate).toBe(0);
  });
  it('skips books whose copies all went back (never billed as other items), and gives nothing for a normal order', () => {
    const d = tradeInvoiceDraft(web({ books: { b1: { net: 0, sold: 2, restocked: 2, unitCAD: 20, titles: ['Tee'] } }, totals: { subtotal: 40, discount: 0, shipping: 0, tax: 0, total: 40 } }));
    expect(d.items).toEqual([]);
    expect(d.ownerBookId).toBeNull();
    expect(tradeInvoiceDraft(web({ invoice: undefined }))).toBeNull();
  });
});

describe('the invoice total matches what the website says is owed', () => {
  const totalOf = (d) => computeInvoiceTotals({ items: d.items, discountType: 'flat', discountValue: d.discount, taxRate: d.taxRate }).total;
  const one = (books, totals, extra = {}) => web({ books, totals, ...extra });

  it('uses the website line total when the copies don’t divide evenly (no stray cent, no filler line)', () => {
    for (const merch of [200, 100]) {
      const d = tradeInvoiceDraft(one({ b1: { net: 3, sold: 3, restocked: 0, unitCAD: merch / 3, merchCAD: merch, titles: ['T'] } }, { subtotal: merch, discount: 0, shipping: 0, tax: merch * 0.13, total: merch * 1.13 }));
      expect(d.items.map(i => i.description)).toEqual(['T']);
      expect(totalOf(d)).toBe(Math.round(merch * 113) / 100);
    }
  });

  it('reproduces the website tax to the cent on big orders', () => {
    for (const [sub, tax] of [[9876.54, 1283.95], [12345.67, 1604.94], [25000, 3250.01], [7777.77, 1011.11]]) {
      const d = tradeInvoiceDraft(one({ b1: { net: 1, sold: 1, restocked: 0, unitCAD: sub, merchCAD: sub, titles: ['T'] } }, { subtotal: sub, discount: 0, shipping: 0, tax, total: Math.round((sub + tax) * 100) / 100 }));
      expect(totalOf(d)).toBe(Math.round((sub + tax) * 100) / 100);
    }
    expect(rateForTax(1040, 8000)).toBe(13);
  });

  it('names unlinked items by their titles', () => {
    const d = tradeInvoiceDraft(web({ unlinked: [{ title: 'Zine', qty: 1 }], totals: { subtotal: 80, discount: 0, shipping: 10, tax: 0, total: 90 } }));
    expect(d.items.map(i => i.description)).toEqual(['Tee', 'Hoodie — XL', 'Zine', 'Shipping']);
    expect(totalOf(d)).toBe(90);
  });

  it('does not bill copies a partial refund took back, nor their tax', () => {
    const d = tradeInvoiceDraft(one({ b1: { net: 1, sold: 2, restocked: 1, unitCAD: 40, merchCAD: 80, titles: ['T'] } }, { subtotal: 80, discount: 0, shipping: 0, tax: 10.4, total: 90.4 }, { refundState: 'partial', refund: { amountMinor: 4520, currency: 'CAD' } }));
    expect(d.items).toEqual([{ description: 'T', qty: 1, unitPrice: 40, bookId: 'b1' }]);
    expect(totalOf(d)).toBe(45.2);
  });

  it('takes money refunded beyond the returned copies off the bill', () => {
    const d = tradeInvoiceDraft(one({ b1: { net: 2, sold: 2, restocked: 0, unitCAD: 40, merchCAD: 80, titles: ['T'] } }, { subtotal: 80, discount: 0, shipping: 0, tax: 10.4, total: 90.4 }, { refundState: 'partial', refund: { amountMinor: 1000, currency: 'CAD' } }));
    expect(totalOf(d)).toBe(80.4);
  });
});
