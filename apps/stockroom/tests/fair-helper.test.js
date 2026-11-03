// Fair helpers: the menu holds only what a helper needs, a sale takes its prices from the menu, the stockroom brings
// in only whole, sensible sales (the limits are checked against firestore.rules in security-rules.test.js).
import { describe, expect, test } from 'vitest';
import {
  MAX_MENU_BOOKS, checkedHelperLines, fairMenu, helperSaleDoc,
  isFairHelperPass, newSaleId,
} from '../src/lib/fair-helper.js';

const menu = fairMenu([
  { id: 'b1', title: 'Harbour Lights', price: 24, cur: 'cad', onHand: 7, author: 'a@example.com', cost: 3 },
  { id: 'b2', title: 'Tide Tables', price: 18.005, cur: 'USD', onHand: null },
  { id: 'b3', title: 'No price' },
], '2026-11-03T10:00:00Z');

describe('fair helpers', () => {
  test('only a verified pass with the role is a helper', () => {
    expect(isFairHelperPass({ emailVerified: true, email: 'h@example.com' }, { role: 'fairHelper' })).toBe(true);
    expect(isFairHelperPass({ emailVerified: false, email: 'h@example.com' }, { role: 'fairHelper' })).toBe(false);
    expect(isFairHelperPass({ emailVerified: true, email: 'h@example.com' }, { role: 'staff' })).toBe(false);
    expect(isFairHelperPass(null, { role: 'fairHelper' })).toBe(false);
  });

  test('the menu has each book\'s id, title, price, currency and count, and nothing else', () => {
    expect(menu).toEqual({ at: '2026-11-03T10:00:00Z', books: [
      { id: 'b1', title: 'Harbour Lights', price: 24, cur: 'CAD', onHand: 7 },
      { id: 'b2', title: 'Tide Tables', price: 18.01, cur: 'USD', onHand: null },
    ] });
    expect(fairMenu(Array.from({ length: MAX_MENU_BOOKS + 5 }, (_, i) => ({ id: `b${i}`, price: 1 }))).books).toHaveLength(MAX_MENU_BOOKS);
  });

  test('a sale takes its prices from the menu and is refused when anything is off', () => {
    const base = { id: newSaleId(), by: ' Helper@Example.com ', day: '2026-11-03', fair: '  Harbour   Fair ', method: 'Cash' };
    const sale = helperSaleDoc({ ...base, cart: [{ bookId: 'b1', qty: 2, price: 1 }] }, menu);
    expect(sale.doc).toEqual({ by: 'helper@example.com', day: '2026-11-03', fair: 'Harbour Fair', method: 'Cash',
      lines: [{ bookId: 'b1', title: 'Harbour Lights', qty: 2, price: 24, cur: 'CAD' }] });
    expect(helperSaleDoc({ ...base, cart: [] }, menu)).toBeNull();
    expect(helperSaleDoc({ ...base, cart: [{ bookId: 'b9', qty: 1 }] }, menu)).toBeNull();
    expect(helperSaleDoc({ ...base, cart: [{ bookId: 'b1', qty: 0 }] }, menu)).toBeNull();
    expect(helperSaleDoc({ ...base, method: 'Free', cart: [{ bookId: 'b1', qty: 1 }] }, menu)).toBeNull();
    expect(helperSaleDoc({ ...base, id: 'x', cart: [{ bookId: 'b1', qty: 1 }] }, menu)).toBeNull();
  });

  test('the stockroom brings in only a whole, sensible sale', () => {
    const known = new Set(['b1', 'b2']);
    expect(checkedHelperLines({ lines: [{ bookId: 'b1', title: 'H', qty: 2, price: 24, cur: 'cad' }] }, known))
      .toEqual({ lines: [{ bookId: 'b1', title: 'H', qty: 2, price: 24, cur: 'CAD' }], problem: '' });
    expect(checkedHelperLines({ lines: [{ bookId: 'b1', qty: 1, price: 24 }, { bookId: 'zz', qty: 1, price: 1 }] }, known).problem).toBe('unknown-book');
    expect(checkedHelperLines({ lines: [{ bookId: 'b1', qty: -3, price: 24 }] }, known).problem).toBe('bad-quantity');
    expect(checkedHelperLines({ lines: [{ bookId: 'b1', qty: 1.5, price: 24 }] }, known).problem).toBe('bad-quantity');
    expect(checkedHelperLines({ lines: [{ bookId: 'b1', qty: 1, price: 'free' }] }, known).problem).toBe('bad-price');
    expect(checkedHelperLines({ lines: [] }, known).problem).toBe('no-lines');
  });

  test('sale ids are long, random and fit the rules', () => {
    const a = newSaleId(); const b = newSaleId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

});
