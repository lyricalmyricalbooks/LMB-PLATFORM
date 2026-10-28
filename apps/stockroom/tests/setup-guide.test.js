import { describe, expect, it } from 'vitest';
import { GUIDE_KEY, guideApplies, guideHtml, guideSteps, readGuide, showGuide, writeGuide } from '../src/lib/setup-guide.js';
import { DEFAULT_SHOP_PROFILE } from '../src/lib/shop-profile.js';

const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), map };
};
const profile = (shop, stockroom = true) => ({ ...DEFAULT_SHOP_PROFILE, apps: { shop, stockroom } });

describe('Set up your stockroom (plan 6.9)', () => {
  it('shows only for a stockroom-only plan, never on the built-in profile or with the shop in the plan', () => {
    expect(guideApplies(profile(false), DEFAULT_SHOP_PROFILE)).toBe(true);
    expect(guideApplies(profile(true), DEFAULT_SHOP_PROFILE)).toBe(false);
    expect(guideApplies(DEFAULT_SHOP_PROFILE, DEFAULT_SHOP_PROFILE)).toBe(false);
    expect(guideApplies(null, DEFAULT_SHOP_PROFILE)).toBe(false);
  });

  it('has five steps that tick themselves from the books, except the phone one, which the owner ticks', () => {
    expect(guideSteps({}).map((s) => s.done)).toEqual([false, false, false, false, false]);
    const books = [{ id: 'a', maxPrint: 200 }];
    const states = { a: { hist: [{ id: 'h1' }], stores: [{ id: 's1' }] } };
    expect(guideSteps({ books, states }).map((s) => [s.id, s.done])).toEqual([['books', true], ['stock', true], ['sale', true], ['store', true], ['phone', false]]);
    expect(guideSteps({ books, states }, { done: { phone: 'now', sale: 'now' } }).at(-1).done).toBe(true);
    // A hand tick never stands in for a step the books can tell.
    expect(guideSteps({}, { done: { sale: 'now' } })[2].done).toBe(false);
  });

  it('hides for good, or once every step is done', () => {
    const steps = guideSteps({});
    expect(showGuide(steps)).toBe(true);
    expect(showGuide(steps, { hiddenAt: 'now' })).toBe(false);
    expect(showGuide(steps.map((s) => ({ ...s, done: true })))).toBe(false);
  });

  it('keeps its ticks in this browser, and a blocked or broken store reads as nothing saved', () => {
    const store = memory();
    expect(readGuide(store)).toEqual({});
    expect(writeGuide({ done: { phone: 'now' } }, store)).toBe(true);
    expect(readGuide(store)).toEqual({ done: { phone: 'now' } });
    store.map.set(GUIDE_KEY, '{broken');
    expect(readGuide(store)).toEqual({});
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readGuide(blocked)).toEqual({});
    expect(writeGuide({}, blocked)).toBe(false);
  });

  it('draws a card with the count, a button per step and plain words', () => {
    const html = guideHtml(guideSteps({ books: [{ id: 'a', maxPrint: 10 }] }));
    expect(html).toContain('Set up your stockroom');
    expect(html).toContain('2 of 5 done');
    expect(html).toContain('data-action="guide.open" data-tab="pos"');
    expect(html).toContain('data-action="guide.tick" data-id="phone"');
    expect(html).toContain('data-action="guide.hide"');
    expect(html).not.toContain('onclick');
    expect(html.toLowerCase()).not.toMatch(/firebase|api|webhook|deploy/);
  });
});
