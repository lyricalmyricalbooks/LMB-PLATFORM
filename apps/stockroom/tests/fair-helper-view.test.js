// The fair helper's till: what it shows for the price list, a sale in progress and the day's sales.
import { describe, expect, test, vi } from 'vitest';

vi.mock('../src/styles/fair-helper-view.css', () => ({}));
const { booksHtml, cartHtml, syncHtml, todayHtml } = await import('../src/features/fair-helper-view.js');
const { helperCopiesLeft, helperDay } = await import('../src/lib/fair-helper.js');

const menu = { books: [
  { id: 'b1', title: 'Harbour Lights', price: 24, cur: 'CAD', onHand: 3 },
  { id: 'b2', title: 'Tide <Tables>', price: 18, cur: 'CAD', onHand: null },
], at: 'x' };
const mine = [
  { id: 'fs-2', day: '2026-11-03', method: 'Cash', pending: true, lines: [{ bookId: 'b1', title: 'Harbour Lights', qty: 2, price: 24, cur: 'CAD' }] },
  { id: 'fs-1', day: '2026-11-03', method: 'Card', imported: { at: 'y' }, lines: [{ bookId: 'b1', title: 'Harbour Lights', qty: 1, price: 24, cur: 'CAD' }] },
  { id: 'fs-0', day: '2026-11-02', method: 'Card', lines: [{ bookId: 'b2', title: 'Tide', qty: 1, price: 18, cur: 'CAD' }] },
];

describe("the helper's till", () => {
  test('copies left take off only sales the owner has not brought in yet', () => {
    expect(helperCopiesLeft(menu, mine)).toEqual({ b1: 1, b2: null });
  });

  test('the book list shows price and copies, escaped, and says when none are left', () => {
    const html = booksHtml(menu, '', { b1: 1, b2: null }, { b1: 1 });
    expect(html).toContain('CAD 24.00');
    expect(html).toContain('None left');
    expect(html).toContain('1 in this sale');
    expect(html).toContain('Tide &lt;Tables&gt;');
    expect(booksHtml(menu, 'zzz', {}, {})).toContain('No book matches');
    expect(booksHtml(null, '', {}, {}, true)).toContain("couldn't load");
  });

  test('each book shows its cover photo, or its colour, or a plain box', () => {
    const covers = { books: [
      { id: 'p', title: 'Photo', price: 1, cur: 'CAD', onHand: null, cover: 'https://img.example/p.jpg' },
      { id: 'q', title: 'Colour', price: 1, cur: 'CAD', onHand: null, accent: '#336699' },
      { id: 'r', title: 'Plain', price: 1, cur: 'CAD', onHand: null },
    ] };
    const html = booksHtml(covers, '', {}, {});
    expect(html).toContain('<img class="fh-cover" src="https://img.example/p.jpg"');
    expect(html).toContain('style="background:#336699"');
    expect(html.match(/class="fh-cover"/g)).toHaveLength(3);
  });

  test('the cart totals the sale and offers every way of paying', () => {
    const html = cartHtml(menu, { b1: 2, b2: 1 });
    expect(html).toContain('CAD 66.00');
    for (const label of ['Card reader', 'QR / Stripe', 'E-transfer', 'Cash', 'Comp']) expect(html).toContain(label);
    expect(cartHtml(menu, {})).toContain('Tap a book');
    // Straight after a sale: the note and its Undo.
    const done = cartHtml(menu, {}, '✓ Sold 2 books · Cash', true);
    expect(done).toContain('data-action="helper.undo"');
    expect(cartHtml(menu, {}, '✓ Sold 2 books · Cash', false)).not.toContain('helper.undo');
  });

  test('an undone sale stays listed, struck out, and counts in nothing', () => {
    const undone = [{ ...mine[0], cancelled: true, pending: false }, mine[1]];
    expect(helperCopiesLeft(menu, undone)).toEqual({ b1: 3, b2: null });
    const day = helperDay(undone, '2026-11-03');
    expect(day).toMatchObject({ units: 1, kept: 1, totals: { CAD: 24 } });
    const html = todayHtml(day);
    expect(html).toContain('1 book in 1 sale');
    expect(html).toContain('is-undone');
    expect(html).toContain('Undone');
    expect(todayHtml(helperDay([{ ...mine[0], cancelled: true }], '2026-11-03'))).toContain('No sales kept today');
  });

  test("today's sales and the sync line say what is still waiting for signal", () => {
    const day = helperDay(mine, '2026-11-03');
    expect(day).toMatchObject({ units: 3, waiting: 1, totals: { CAD: 72 } });
    expect(day.sales.map((s) => s.id)).toEqual(['fs-2', 'fs-1']);
    const html = todayHtml(day);
    expect(html).toContain('3 books in 2 sales');
    expect(html).toContain('Waiting for signal');
    expect(html).toContain('In the books');
    expect(syncHtml(day, false)).toContain('1 sale is waiting for signal (no connection)');
    expect(syncHtml(helperDay([], '2026-11-03'), true)).toContain('Every sale is uploaded');
  });
});
