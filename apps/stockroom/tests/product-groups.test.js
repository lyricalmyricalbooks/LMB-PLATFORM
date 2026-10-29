// Products sold in sizes (plan 10.5): one item per size, grouped (src/lib/product-groups.js).
import { describe, it, expect } from 'vitest';
import { catalogGroups, freeItemId, groupOf, otherSizes, sizeItem, websiteGroup } from '../src/lib/product-groups.js';
import { cleanShopBook, shopBookName } from '../src/lib/website-todo.js';

const tee = (size, extra = {}) => ({ id: `tee-${size}`, title: `Moth Tee — ${size}`, group: { id: 'web-t1', name: 'Moth Tee' }, listPrice: 30, ...extra });

describe('product groups', () => {
  it('books and lone items stay single; sizes of one product come together where the first was', () => {
    const items = [{ id: 'hound', title: 'The Hound' }, tee('s'), { id: 'zine', title: 'Zine' }, tee('m'),
      { id: 'cap', title: 'Cap', group: { id: 'web-c', name: 'Cap' } }];
    const out = catalogGroups(items);
    expect(out.map(e => (e.kind === 'single' ? e.item.id : `${e.name}:${e.items.map(i => i.id)}`)))
      .toEqual(['hound', 'Moth Tee:tee-s,tee-m', 'zine', 'cap']);
    expect(catalogGroups([{ id: 'a' }, { id: 'b' }]).every(e => e.kind === 'single')).toBe(true);
    expect(groupOf({ group: { id: '', name: 'x' } })).toBeNull();
  });

  it("only a website edition that names its product has a group, and its other sizes are the same product's", () => {
    const offers = ['s', 'm', 'l'].map(size => cleanShopBook({ key: `t1|${size}`, bookId: 't1', title: 'Moth Tee', edition: size.toUpperCase(), product: 'Moth Tee', price: size === 'l' ? 32 : 30 }));
    const book = cleanShopBook({ key: 'hound|signed', title: 'The Hound', edition: 'Signed' });
    expect(websiteGroup(book)).toBeNull();
    expect(otherSizes(book, [...offers, book])).toEqual([]);
    expect(websiteGroup(offers[0])).toEqual({ id: 'web-t1', name: 'Moth Tee' });
    expect(otherSizes(offers[0], [...offers, book]).map(o => o.key)).toEqual(['t1|m', 't1|l']);
    // "M" is in "Moth Tee", yet the M size still says so.
    expect(shopBookName(offers[1])).toBe('Moth Tee — M');
  });

  it('another size copies the saved settings with its own id, name and price, never sharing lists', () => {
    const saved = tee('s', { id: 'moth-tee-s', maxPrint: 50, profitTiers: [{ at: 10 }], stripeLink: 'https://buy.example/s', isbn: 'SKU-S' });
    const l = sizeItem(saved, { key: 't1|l', edition: 'L', price: 32, isbn: 'SKU-L' }, 'Moth Tee — L', new Set(['moth-tee-s']));
    expect(l).toMatchObject({ id: 'moth-tee-l', title: 'Moth Tee — L', listPrice: 32, isbn: 'SKU-L', maxPrint: 50, stripeLink: '', group: { id: 'web-t1', name: 'Moth Tee' } });
    expect(l.profitTiers).toEqual(saved.profitTiers);
    expect(l.profitTiers).not.toBe(saved.profitTiers);
    const m = sizeItem(saved, { key: 't1|m', edition: 'M', price: 30 }, 'Moth Tee — M');
    expect(m.stripeLink).toBe('https://buy.example/s');
    expect(m.listPrice).toBe(30);
    expect(freeItemId('Moth Tee M', new Set(['moth-tee-m', 'moth-tee-m-2']))).toBe('moth-tee-m-3');
  });
});
