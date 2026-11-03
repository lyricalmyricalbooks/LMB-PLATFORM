// The combined admin's book page reads one book's figures from the stockroom (lib/book-summary.js).
import { describe, it, expect } from 'vitest';
import { bookSummary, findBook } from '../src/lib/book-summary.js';

const book = { title: 'Small Hours', maxPrint: 100, currency: 'CAD' };
const state = {
  authorStock: 5,
  places: { 'Studio': 10 },
  hist: [
    { chan: 'Website', qty: 3, price: 20, date: '2026-10-01', cur: 'CAD' },
    { chan: 'Book Fair', qty: 2, price: 18, date: '2026-10-20', cur: 'CAD' },
    { chan: 'Website', qty: 1, price: 20, date: '2026-09-01', cur: 'CAD', voided: true },
    { chan: 'Consignment', qty: 1, price: 12, date: '2026-10-05', cur: 'CAD', consignmentLink: true },
  ],
  ledger: [
    { type: 'Shipment', storeName: 'Corner Books', qty: 6 },
    { type: 'Sale', storeName: 'Corner Books', qty: 1 },
  ],
};

describe('one book in the stockroom', () => {
  it('counts what is on hand, who holds it and where', () => {
    const s = bookSummary('b1', state, book);
    expect(s.onHand).toBe(89); // 100 printed, 5 sold directly, 6 sent to a stockist
    expect(s.author).toBe(5);
    expect(s.publisher).toBe(84);
    expect(s.onConsignment).toBe(5);
    expect(s.places).toEqual([{ name: 'Main', qty: 74 }, { name: 'Studio', qty: 10 }]);
    expect(s.stockists).toEqual([{ name: 'Corner Books', qty: 5 }]);
  });
  it('adds up sales by channel, leaving out cancelled ones', () => {
    const s = bookSummary('b1', state, book);
    expect(s.channels).toEqual([
      { chan: 'Website', units: 3, revenue: 60, cur: 'CAD' },
      { chan: 'Book Fair', units: 2, revenue: 36, cur: 'CAD' },
      { chan: 'Consignment', units: 1, revenue: 12, cur: 'CAD' },
    ]);
    expect(s.sold).toBe(6);
    expect(s.lastSale).toBe('2026-10-20');
  });
  it('shows no place list for a book kept in one place', () => {
    expect(bookSummary('b1', { hist: [], ledger: [] }, book).places).toEqual([]);
  });
});

describe('finding the stockroom book for a website book', () => {
  const books = { a: { title: 'Small Hours', isbn: '978-1-234567-89-7' }, b: { title: 'Field Notes' }, c: { title: 'Field  notes!' } };
  it('goes by ISBN first, then by the exact title', () => {
    expect(findBook(books, { isbn: '9781234567897', title: 'whatever' })).toEqual({ id: 'a', title: 'Small Hours', by: 'isbn' });
    expect(findBook(books, { title: 'small hours' })).toEqual({ id: 'a', title: 'Small Hours', by: 'title' });
  });
  it('gives no answer when two books could be it, or none', () => {
    expect(findBook(books, { title: 'Field Notes' })).toBe(null);
    expect(findBook(books, { title: 'Nothing like it' })).toBe(null);
    expect(findBook(books, {})).toBe(null);
  });
});

describe('takings as the stockroom counts them', () => {
  it('leaves out a sale paid straight to the artist until the transfer comes in, and reads old rows in the book\'s currency', () => {
    const s = bookSummary('b1', { hist: [
      { chan: 'Website', qty: 2, price: 10, date: '2026-10-01', cur: 'CAD' },
      { chan: 'Website', qty: 1, price: 10, date: '2026-10-02', cur: 'CAD', artistPending: true },
      { chan: 'Book Fair', qty: 1, price: 15, date: '2026-10-03' },
    ], ledger: [] }, { title: 'X', maxPrint: 10, currency: 'CA$' });
    expect(s.channels).toEqual([
      { chan: 'Website', units: 3, revenue: 20, cur: 'CAD' },
      { chan: 'Book Fair', units: 1, revenue: 15, cur: 'CAD' },
    ]);
  });
});

describe('the admin\'s Home and one list of sales', async () => {
  const { salesRows, todoItems } = await import('../src/lib/book-summary.js');
  it('lists the stockroom\'s to-dos, leaving the website\'s own to the website', () => {
    expect(todoItems({ signals: [
      { id: 'stock-low:a', group: 'stock', status: 'blocked', label: 'Stock running low', detail: 'A is down to 2', fix: { kind: 'book' } },
      { id: 'web-1', group: 'website', status: 'warn', label: 'Website thing' },
      { id: 'orders-unshipped', group: 'orders', status: 'blocked', label: '2 paid orders haven’t been sent' },
      { id: 'orders-receipts', group: 'orders', status: 'info', label: 'Receipts to send' },
    ] })).toEqual([
      { id: 'stock-low:a', group: 'stock', status: 'blocked', label: 'Stock running low', detail: 'A is down to 2' },
      { id: 'orders-unshipped', group: 'orders', status: 'blocked', label: '2 paid orders haven’t been sent', detail: '' },
    ]);
  });
  it('gives every sale since a day across books, newest first, without website orders', () => {
    const books = { a: { title: 'A', currency: 'CA$' }, b: { title: 'B', currency: 'CA$' }, c: { title: 'C' } };
    const states = {
      a: { hist: [
        { num: 1, chan: 'Book Fair', qty: 2, price: 10, date: '2026-10-05', cur: 'CAD' },
        { num: 2, chan: 'Website', qty: 1, price: 10, date: '2026-10-06', cur: 'CAD', webOrderId: 'o1' },
        { num: 3, chan: 'Book Fair', qty: 1, price: 10, date: '2026-09-01', cur: 'CAD' },
        // Paid through the stockroom's own payment link: only the stockroom has it, so it stays.
        { num: 4, chan: 'Website', qty: 1, price: 20, date: '2026-10-04', cur: 'CAD', sheetsId: 'stripe-ch_1' },
      ] },
      b: { hist: [{ num: 1, chan: 'Consignment', qty: 1, price: 6, date: '2026-10-07', notes: 'Corner Books', consignmentLink: true }] },
    };
    const { rows, partial } = salesRows(books, states, { since: '2026-10-01' });
    expect(partial).toBe(true); // C isn't loaded
    expect(rows.map((r) => [r.title, r.chan, r.qty, r.amount, r.cur, r.stockist])).toEqual([
      ['B', 'Consignment', 1, 6, 'CAD', 'Corner Books'],
      ['A', 'Book Fair', 2, 20, 'CAD', ''],
      ['A', 'Website', 1, 20, 'CAD', ''],
    ]);
  });
});
