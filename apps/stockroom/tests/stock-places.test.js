// Stock in more than one place (plan 12.16): src/lib/stock-places.js and its seams.
import { describe, it, expect } from 'vitest';
import { derivePlaces, placeCounts, placeSummary, movePlaceStock, removePlace, cleanPlaceName, MAX_PLACES } from '../src/lib/stock-places.js';
import { deriveOnHand, deriveStockBreakdown } from '../src/lib/inventory.js';
import { stockLocationsCsv } from '../src/lib/stock-locations.js';
import { mergeMetadata } from '../src/lib/merge-state.js';

const book = { id: 'b', title: 'Moths', maxPrint: 100 };
const fresh = () => ({ stock: 100, hist: [], ledger: [] });
const sale = (qty) => ({ qty, price: 10, chan: 'direct', date: '2026-11-01', num: 'x' + qty });

describe('places', () => {
  it('a book with no places has everything at Main and prints nothing extra', () => {
    const s = fresh();
    expect(derivePlaces(s, book)).toMatchObject({ main: 100, places: [], publisherOnHand: 100 });
    expect(placeSummary(s, book)).toBe('');
  });

  it('moving copies changes only the places: total on hand, stock and sales stay put', () => {
    const s = { ...fresh(), hist: [sale(4)] };
    const before = JSON.stringify({ ...s, places: undefined, placeMoves: undefined });
    const r = movePlaceStock(s, book, { from: 'Main', to: 'Market stall', qty: 10, note: 'Saturday' });
    expect(r.ok).toBe(true);
    expect(deriveOnHand(s, book)).toBe(96);
    expect(JSON.stringify({ ...s, places: undefined, placeMoves: undefined })).toBe(before);
    expect(placeCounts(s, book)).toEqual([{ name: 'Main', qty: 86 }, { name: 'Market stall', qty: 10 }]);
    expect(s.placeMoves).toHaveLength(1);
    expect(placeSummary(s, book)).toBe('Main 86 · Market stall 10');
  });

  it('a sale takes from Main first, and named places only shrink once Main is empty', () => {
    const s = fresh();
    movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 30 });
    s.hist.push(sale(50));
    expect(derivePlaces(s, book)).toMatchObject({ main: 20, places: [{ name: 'Studio', qty: 30 }] });
    s.hist.push(sale(30));
    const d = derivePlaces(s, book);
    expect(d.main).toBe(0);
    expect(d.places[0].qty).toBe(20);
    expect(d.main + d.places[0].qty).toBe(deriveStockBreakdown(s, book).publisherOnHand);
    // voiding the second sale puts its copies back; Main is refilled first
    s.hist[1].voided = true;
    expect(derivePlaces(s, book)).toMatchObject({ main: 20, places: [{ name: "Studio", qty: 30 }] });
  });

  it('copies held by the author are never in a place', () => {
    const s = { ...fresh(), authorStock: 40 };
    expect(derivePlaces(s, book)).toMatchObject({ publisherOnHand: 60, authorHeld: 40, main: 60 });
    expect(movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 61 }).ok).toBe(false);
    expect(movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 60 }).ok).toBe(true);
  });

  it('refuses a move that makes no sense', () => {
    const s = fresh();
    expect(movePlaceStock(s, book, { from: 'Main', to: 'main', qty: 1 }).ok).toBe(false);
    expect(movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 0 }).ok).toBe(false);
    expect(movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 101 }).ok).toBe(false);
    expect(movePlaceStock(s, book, { from: 'Nowhere', to: 'Studio', qty: 1 }).ok).toBe(false);
    expect(movePlaceStock(s, book, { from: 'Main', to: '   ', qty: 1 }).ok).toBe(false);
    expect(s.places).toBeUndefined();
    expect(s.placeMoves).toBeUndefined();
  });

  it('matches names without regard to case and keeps one place', () => {
    const s = fresh();
    movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 5 });
    movePlaceStock(s, book, { from: 'Main', to: ' studio ', qty: 5 });
    expect(Object.keys(s.places)).toEqual(['Studio']);
    expect(s.places.Studio).toBe(10);
    expect(cleanPlaceName('  a   b ')).toBe('a b');
  });

  it('limits how many places there can be', () => {
    const s = fresh();
    for (let i = 0; i < MAX_PLACES; i++) expect(movePlaceStock(s, book, { from: 'Main', to: 'P' + i, qty: 1 }).ok).toBe(true);
    expect(movePlaceStock(s, book, { from: 'Main', to: 'One more', qty: 1 }).ok).toBe(false);
  });

  it('closing a place sends its copies back to Main', () => {
    const s = fresh();
    movePlaceStock(s, book, { from: 'Main', to: 'Studio', qty: 12 });
    expect(removePlace(s, book, 'studio').ok).toBe(true);
    expect(derivePlaces(s, book)).toMatchObject({ main: 100, places: [] });
    expect(s.placeMoves).toHaveLength(2);
    expect(removePlace(s, book, 'Studio').ok).toBe(false);
  });
});

describe('seams', () => {
  it('the stock counts file is unchanged without places and splits by place with them', () => {
    const plain = [{ book, state: fresh() }];
    expect(stockLocationsCsv(plain)).toBe(stockLocationsCsv([{ book, state: { ...fresh(), places: {} } }]));
    const s = fresh();
    movePlaceStock(s, book, { from: 'Main', to: 'Market stall', qty: 7 });
    const lines = stockLocationsCsv([{ book, state: s }]).trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"93"');
    expect(lines[2]).toContain('"Market stall","7"');
  });

  it('a move on one device and nothing on the other merges to the move', () => {
    const base = { stock: 100 };
    const local = { stock: 100 };
    movePlaceStock(local, book, { from: 'Main', to: 'Studio', qty: 3 });
    const merged = mergeMetadata(base, base, local).value;
    expect(merged.places).toEqual({ Studio: 3 });
    expect(merged.placeMoves).toHaveLength(1);
  });
});
