// Backups › "Stock counts for another shop system" (plan 7.19): src/lib/stock-locations.js.
import { describe, it, expect } from 'vitest';
import { AUTHOR_LOCATION, STOCK_LOCATION_HEADINGS, handleOf, stockLocationsCsv } from '../src/lib/stock-locations.js';

// Every cell is quoted (lib/csv.js csvRow), and no test value holds a quote.
const parse = (csv) => csv.trim().split('\n').map(line => line.slice(1, -1).split('","'));

describe('stockLocationsCsv', () => {
  it('starts with the inventory headings', () => {
    expect(parse(stockLocationsCsv([]))).toEqual([STOCK_LOCATION_HEADINGS]);
    expect(STOCK_LOCATION_HEADINGS).toEqual(['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'SKU', 'Location', 'On hand (new)']);
  });

  it('puts the press copies at its place and the author copies at a second place', () => {
    const rows = parse(stockLocationsCsv([
      { book: { id: 'a', title: 'Moths of the North', isbn: '9781234567897' }, state: { stock: 12, authorStock: 5 } },
      { book: { id: 'b', title: 'Small Hours', sku: 'SH-1' }, state: { stock: 3 } },
    ], { location: 'Studio' }));
    expect(rows.slice(1)).toEqual([
      ['moths-of-the-north', 'Moths of the North', 'Title', 'Default Title', '9781234567897', 'Studio', '7'],
      ['moths-of-the-north', 'Moths of the North', 'Title', 'Default Title', '9781234567897', AUTHOR_LOCATION, '5'],
      ['small-hours', 'Small Hours', 'Title', 'Default Title', 'SH-1', 'Studio', '3'],
    ]);
  });

  it('lists a sold-out book at 0 and never a negative count', () => {
    const rows = parse(stockLocationsCsv([{ book: { id: 'c', title: 'Gone', maxPrint: 2 }, state: { hist: [{ qty: 5 }] } }]));
    expect(rows[1]).toEqual(['gone', 'Gone', 'Title', 'Default Title', '', 'Main location', '0']);
    expect(rows).toHaveLength(2);
  });

  it('keeps two books with the same title apart', () => {
    const rows = parse(stockLocationsCsv([
      { book: { id: 'x', title: 'Untitled' }, state: { stock: 1 } },
      { book: { id: 'y', title: 'Untitled' }, state: { stock: 2 } },
    ]));
    expect(rows.slice(1).map(r => r[0])).toEqual(['untitled', 'untitled-2']);
  });

  it('quotes a title with a comma', () => {
    const csv = stockLocationsCsv([{ book: { id: 'q', title: 'Salt, Smoke' }, state: { stock: 4 } }]);
    expect(csv).toContain('"salt-smoke","Salt, Smoke"');
  });
});

describe('handleOf', () => {
  it('matches the shop file handles', () => {
    expect(handleOf('Café Noir!')).toBe('cafe-noir');
    expect(handleOf('')).toBe('book');
  });
});
