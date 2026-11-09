// Fair helpers, the owner's side: the publisher's stockroom brings a helper's sale into the books once, through the
// ledger's own sale path, only after the server says this device may, and leaves a sale with a problem alone.
import { describe, expect, test, vi, beforeEach } from 'vitest';

const app = vi.hoisted(() => ({ BOOKS: {}, states: {}, written: [], handlers: {}, refreshed: 0 }));

vi.mock('../src/main.js', () => ({ renderHist: () => {}, refreshAttentionSurfaces: () => { app.refreshed++; } }));
vi.mock('../src/features/dashboard.js', () => ({ updateDash: () => {} }));
vi.mock('../src/features/website-link.js', () => ({ websiteCoverOf: (id) => (id === 'web' ? 'https://img.example/web.jpg' : '') }));
vi.mock('../src/core/store.js', () => ({
  BOOKS: app.BOOKS,
  states: app.states,
  onBookEvent: (type, fn) => { app.handlers[type] = fn; return () => {}; },
}));
vi.mock('../src/features/sales-ledger.js', () => ({
  writeOrderToLedger: (bookId, opts) => {
    app.written.push({ bookId, ...opts });
    app.states[bookId].hist.unshift({ num: opts.num, chan: opts.chan, qty: opts.qty });
  },
}));

const { bringInSales, currentMenu, fairHelperTodo, startFairHelpers } = await import('../src/features/fair-helpers.js');

const sale = (id, extra = {}) => ({
  id, by: 'sam@example.com', day: '2026-11-03', fair: 'Harbour Fair', method: 'Card',
  lines: [{ bookId: 'b1', qty: 2, price: 24 }], ...extra,
});

beforeEach(() => {
  for (const k of Object.keys(app.BOOKS)) delete app.BOOKS[k];
  for (const k of Object.keys(app.states)) delete app.states[k];
  app.written.length = 0;
  Object.assign(app.BOOKS, {
    b1: { id: 'b1', title: 'Harbour Lights', listPrice: 24, currency: 'CAD', cost: 3 },
    b2: { id: 'b2', title: 'Tide Tables', listPrice: 18, currency: 'CAD' },
  });
  app.states.b1 = { stock: 7, hist: [] };
  app.states.b2 = { stock: 0, hist: [] };
});

describe("bringing helpers' sales in", () => {
  test('a claimed sale becomes till records with the sale id and the helper on them', async () => {
    const claim = vi.fn(async () => true);
    expect(await bringInSales([sale('fs-one-12345678')], { claim })).toBe(1);
    expect(claim).toHaveBeenCalledWith('fs-one-12345678');
    expect(app.written).toHaveLength(1);
    expect(app.written[0]).toMatchObject({
      bookId: 'b1', num: 'fs-one-12345678', chan: 'Book Fair', qty: 2, price: 24, date: '2026-11-03',
      notes: 'Card (rung up by sam@example.com) · Harbour Fair', enteredBy: 'Publisher',
      extra: { fairHelper: 'sam@example.com' },
    });
    expect(app.written[0].payment).toMatchObject({ amount: 48, rate: null });
  });

  test('never twice: not when marked, not when the book holds it, not when another device claimed it', async () => {
    const claim = vi.fn(async () => true);
    await bringInSales([sale('fs-two-12345678', { imported: { at: 'x' } })], { claim });
    expect(claim).not.toHaveBeenCalled();
    app.states.b1.hist.push({ num: 'fs-three-1234567', chan: 'Book Fair' });
    await bringInSales([sale('fs-three-1234567')], { claim });
    expect(app.written).toHaveLength(0);
    expect(await bringInSales([sale('fs-four-12345678')], { claim: async () => false })).toBe(0);
    // Undone by the helper: never claimed, never added.
    const never = vi.fn(async () => true);
    await bringInSales([sale('fs-undone-1234567', { cancelled: true })], { claim: never });
    expect(never).not.toHaveBeenCalled();
    expect(app.written).toHaveLength(0);
  });

  test('a sale with a problem is left alone', async () => {
    const claim = vi.fn(async () => true);
    await bringInSales([sale('fs-five-12345678', { lines: [{ bookId: 'gone', qty: 1, price: 5 }] })], { claim });
    await bringInSales([sale('fs-six-123456789', { lines: [{ bookId: 'b1', qty: 1.5, price: 5 }] })], { claim });
    expect(claim).not.toHaveBeenCalled();
    expect(app.written).toHaveLength(0);
  });

  test('a sale written straight to the inbox below the book’s price, or in another currency, is never brought in', async () => {
    const claim = vi.fn(async () => true);
    await bringInSales([sale('fs-cheap-12345678', { lines: [{ bookId: 'b1', qty: 2, price: 0 }] })], { claim });
    await bringInSales([sale('fs-usd-123456789', { lines: [{ bookId: 'b1', qty: 1, price: 24, cur: 'USD' }] })], { claim });
    expect(claim).not.toHaveBeenCalled();
    expect(app.written).toHaveLength(0);
    expect(fairHelperTodo()).toMatchObject({ belowPrice: 2 });
    // At the book's own price (or above, after the owner lowered it), it comes in.
    expect(await bringInSales([sale('fs-fair-12345678', { lines: [{ bookId: 'b1', qty: 1, price: 26 }] })], { claim })).toBe(1);
    // Undone by the helper: off the to-do list.
    await bringInSales([sale('fs-cheap-12345678', { cancelled: true }), sale('fs-usd-123456789', { cancelled: true })], { claim });
    expect(fairHelperTodo()?.belowPrice || 0).toBe(0);
  });

  test('a stuck sale shows as a to-do until its book is back, then comes in by itself', async () => {
    const claim = vi.fn(async () => true);
    const stuck = sale('fs-seven-1234567', { lines: [{ bookId: 'b3', qty: 1, price: 9 }] });
    app.refreshed = 0;
    await bringInSales([stuck], { claim });
    expect(fairHelperTodo()).toMatchObject({ by: ['sam@example.com'] });
    expect(app.refreshed).toBe(1);
    await bringInSales([stuck], { claim });
    expect(app.refreshed).toBe(1);
    app.BOOKS.b3 = { id: 'b3', title: 'Back again', listPrice: 9, currency: 'CAD' };
    app.states.b3 = { stock: 4, hist: [] };
    expect(await bringInSales([stuck], { claim })).toBe(1);
    expect(app.written.map((w) => w.bookId)).toEqual(['b3']);
    // Only the two problem sales from the test before are still listed.
    expect(fairHelperTodo().stuck).toBe(2);
  });
});

describe("the helpers' price list", () => {
  test('holds price, currency and copies on hand, and nothing else', () => {
    const menu = currentMenu();
    expect(menu.books).toEqual([
      { id: 'b1', title: 'Harbour Lights', price: 24, cur: 'CAD', onHand: 7 },
      { id: 'b2', title: 'Tide Tables', price: 18, cur: 'CAD', onHand: 0 },
    ]);
  });

  test('a cover comes from the website first, then from the book form', () => {
    app.BOOKS.web = { id: 'web', title: 'Web Book', listPrice: 10, currency: 'CA$', coverUrl: 'https://img.example/own.jpg' };
    app.BOOKS.own = { id: 'own', title: 'Own Book', listPrice: 10, currency: 'CA$', coverUrl: 'https://img.example/own.jpg' };
    const byId = Object.fromEntries(currentMenu().books.map((b) => [b.id, b]));
    expect(byId.web.cover).toBe('https://img.example/web.jpg');
    expect(byId.own.cover).toBe('https://img.example/own.jpg');
    expect(byId.b1).not.toHaveProperty('cover');
  });

  test('only the publisher, only on the plan with both apps', () => {
    const win = { IS_PUBLISHER: true, _fbWatchFairSales: () => {}, _fbWriteFairMenu: async () => {}, addEventListener: () => {} };
    expect(startFairHelpers({ win: { ...win, IS_PUBLISHER: false }, profile: { apps: { shop: true, stockroom: true } } })).toBe(false);
    expect(startFairHelpers({ win, profile: { apps: { shop: false, stockroom: true } } })).toBe(false);
    expect(startFairHelpers({ win, profile: { apps: { shop: true, stockroom: true } } })).toBe(true);
  });
});
