import { describe, expect, it } from 'vitest';
import { READY_KEY, readReady, readyApplies, readyHtml, readyLines, showReady, writeReady } from '../src/lib/stockroom-ready.js';
import { DEFAULT_SHOP_PROFILE } from '../src/lib/shop-profile.js';

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
};
const profile = (shop, stockroom = true) => ({ ...DEFAULT_SHOP_PROFILE, apps: { shop, stockroom } });

describe('Your stockroom is ready (plan 17.12)', () => {
  it('shows only for a press with both apps, never on the built-in profile or a stockroom-only plan', () => {
    expect(readyApplies(profile(true, true), DEFAULT_SHOP_PROFILE)).toBe(true);
    expect(readyApplies(profile(false, true), DEFAULT_SHOP_PROFILE)).toBe(false);
    expect(readyApplies(DEFAULT_SHOP_PROFILE, DEFAULT_SHOP_PROFILE)).toBe(false);
    expect(readyApplies(null, DEFAULT_SHOP_PROFILE)).toBe(false);
  });

  it('says how many titles the stockroom holds, and that the shop is linked', () => {
    const lines = readyLines([{ id: 'a', maxPrint: 40 }, { id: 'b', maxPrint: 0 }]);
    expect(lines[0]).toBe('Your stockroom holds 2 titles, and 1 has copies counted.');
    expect(lines[1]).toContain('linked to this stockroom');
  });

  it('uses the singular and an empty message when there are no books', () => {
    expect(readyLines([{ id: 'a', maxPrint: 3 }])[0]).toBe('Your stockroom holds 1 title, and 1 has copies counted.');
    expect(readyLines([])[0]).toMatch(/has no books yet/);
  });

  it('is hidden once the press says Got it, and the choice is remembered', () => {
    const store = memory();
    expect(showReady(readReady(store))).toBe(true);
    writeReady({ ...readReady(store), hiddenAt: '2026-11-02T00:00:00.000Z' }, store);
    expect(store.map.has(READY_KEY)).toBe(true);
    expect(showReady(readReady(store))).toBe(false);
  });

  it('reads a broken store as nothing saved', () => {
    expect(readReady({ getItem: () => '{not json' })).toEqual({});
    expect(readReady({ getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });

  it('the screen names its two actions and escapes its sentences', () => {
    const html = readyHtml(['Your stockroom holds <b>1</b> title.']);
    expect(html).toContain('data-action="ready.hide"');
    expect(html).toContain('data-action="ready.open" data-tab="sheets"');
    expect(html).toContain('&lt;b&gt;1&lt;/b&gt;');
  });
});
