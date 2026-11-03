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
