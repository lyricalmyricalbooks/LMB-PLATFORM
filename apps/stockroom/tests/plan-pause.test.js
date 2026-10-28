// The stockroom read-only while the shop's plan is paused or closed (the platform's plan 6.7; src/lib/plan-pause.js).
// The checks that the rules and firebase.js agree with it are in security-rules.test.js.
import { describe, it, expect } from 'vitest';
import { planReadOnly, lockWrites, PlanPausedError, planPauseBannerHtml } from '../src/lib/plan-pause.js';

describe('planReadOnly', () => {
  it('is read-only for a paused or closed plan, or any access but "open"', () => {
    expect(planReadOnly({ access: 'paused' })).toBe(true);
    expect(planReadOnly({ access: 'closed' })).toBe(true);
    expect(planReadOnly({ access: 'something new' })).toBe(true);
    expect(planReadOnly({ access: null })).toBe(true);
  });
  it('stays open for an open plan or no plan at all', () => {
    expect(planReadOnly({ access: 'open' })).toBe(false);
    expect(planReadOnly(null)).toBe(false);
    expect(planReadOnly(undefined)).toBe(false);
    expect(planReadOnly({})).toBe(false);
    expect(planReadOnly('paused')).toBe(false);
  });
});

describe('lockWrites', () => {
  it('refuses every write while locked, and passes through once open again', async () => {
    let locked = true;
    const calls = [];
    const target = { _fbSave: async (...args) => { calls.push(args); return 'saved'; }, _fbLoad: async () => 'read' };
    lockWrites(target, () => locked, ['_fbSave', '_fbMissing']);
    await expect(target._fbSave('b1')).rejects.toBeInstanceOf(PlanPausedError);
    await expect(target._fbSave('b1')).rejects.toMatchObject({ code: 'plan-paused' });
    expect(calls).toEqual([]);
    expect(await target._fbLoad()).toBe('read');
    locked = false;
    expect(await target._fbSave('b1', 2)).toBe('saved');
    expect(calls).toEqual([['b1', 2]]);
    expect(target._fbMissing).toBeUndefined();
  });
  it('wraps once however often it runs', async () => {
    const target = { _fbSave: async () => 'ok' };
    lockWrites(target, () => false, ['_fbSave']);
    const first = target._fbSave;
    lockWrites(target, () => false, ['_fbSave']);
    expect(target._fbSave).toBe(first);
  });
});

describe('the read-only banner', () => {
  it('says why and links to the plan page for a paused plan', () => {
    const html = planPauseBannerHtml({ access: 'paused', link: 'https://platform.example/account/billing?shop=s1' });
    expect(html).toContain('Your plan is paused');
    expect(html).toContain('Add a card');
    expect(html).toContain('href="https://platform.example/account/billing?shop=s1"');
  });
  it('words a closed shop differently', () => {
    const html = planPauseBannerHtml({ access: 'closed', link: 'https://platform.example/account/billing?shop=s1' });
    expect(html).toContain('Your shop is closed');
    expect(html).toContain('See your plan');
  });
  it('uses only an https link and leaves the button out otherwise', () => {
    for (const link of ['javascript:alert(1)', 'http://platform.example/x', 'https://x.example/"><script>', 42, undefined]) {
      const html = planPauseBannerHtml({ access: 'paused', link });
      expect(html).not.toContain('<a ');
      expect(html).not.toContain('<script');
    }
  });
  it('uses no technical words', () => {
    const html = planPauseBannerHtml({ access: 'paused', link: 'https://platform.example/b' }) + planPauseBannerHtml({ access: 'closed' });
    expect(html).not.toMatch(/firebase|firestore|database|api|key|webhook/i);
  });
});
