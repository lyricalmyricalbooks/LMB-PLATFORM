// Plan 1.17: one press's one-offs are switches in the shop profile, off unless turned on. In the stockroom that is
// the Gmail receipt finder: off, Email Receipt Import opens on Paste & Upload with the Gmail tabs out of sight.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/load-app.js';
import { DEFAULT_SHOP_PROFILE, SHOP_SWITCHES, parseShopProfile, switchOn } from '../src/lib/shop-profile.js';
import { SHOP_SWITCHES as SHOP_SIDE } from '../../shop/src/lib/shopProfile.ts';

const profile = (switches) => ({
  version: 1,
  shopId: 'moth-press',
  firebase: {
    apiKey: 'web-key', authDomain: 'moth-press.firebaseapp.com', projectId: 'moth-press',
    storageBucket: 'moth-press.firebasestorage.app', messagingSenderId: '123', appId: '1:123:web:abc',
  },
  functionsRegion: 'northamerica-northeast1',
  siteUrl: 'https://moth-press.web.app',
  apps: { shop: true, stockroom: true },
  ...(switches === undefined ? {} : { switches }),
});

describe('shop switches', () => {
  it('are all off for a new shop and for the built-in test profile', () => {
    for (const name of SHOP_SWITCHES) {
      expect(switchOn(name, DEFAULT_SHOP_PROFILE)).toBe(false);
      expect(switchOn(name, parseShopProfile(profile()))).toBe(false);
    }
  });

  it('turn on only with true, and unknown names are dropped', () => {
    const parsed = parseShopProfile(profile({ gmailReceiptFinder: true, legacyStockroomSignIn: 'yes', somethingElse: true }));
    expect(parsed.switches).toEqual({ gmailReceiptFinder: true });
    expect(switchOn('gmailReceiptFinder', parsed)).toBe(true);
    expect(switchOn('legacyStockroomSignIn', parsed)).toBe(false);
    expect(parseShopProfile(profile('on')).switches).toBeUndefined();
  });

  it('name the same switches as the shop', () => {
    expect([...SHOP_SWITCHES]).toEqual([...SHOP_SIDE]);
  });
});

describe('the Gmail receipt finder follows its switch', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp();
  }, 30000);
  afterEach(() => {
    delete window.__SHOP_PROFILE__;
    app.window.closeEmailReceiptImportModal();
  });

  const el = (id) => document.getElementById(id);
  const shown = (id) => el(id).style.display !== 'none';

  it('off: the import opens on Paste & Upload and the Gmail tabs, pill and panels stay hidden', async () => {
    app.window.openEmailReceiptImportModal();
    await app.settle();
    for (const id of ['email-tab-gmail', 'email-tab-direct', 'email-account-pill']) expect(el(id).hidden, id).toBe(true);
    expect(el('email-tab-manual').getAttribute('aria-selected')).toBe('true');
    expect(shown('email-panel-manual')).toBe(true);
    expect(shown('email-panel-gmail')).toBe(false);
    expect(shown('email-panel-direct')).toBe(false);
    // The finder never mounted, so its placeholder is still what the page shipped with.
    expect(el('email-panel-gmail').textContent).toContain('Opening your receipt finder');
  });

  it('off: asking for a Gmail tab opens Paste & Upload instead', async () => {
    app.window.openEmailReceiptImportModal();
    await app.settle();
    for (const tab of ['gmail', 'direct']) {
      app.window.switchEmailImportTab(tab);
      expect(el('email-tab-manual').getAttribute('aria-selected')).toBe('true');
      expect(shown('email-panel-manual')).toBe(true);
    }
  });

  it('on: the Gmail Finder is offered and opens first, as before', async () => {
    window.__SHOP_PROFILE__ = profile({ gmailReceiptFinder: true });
    app.window.openEmailReceiptImportModal();
    await app.settle();
    for (const id of ['email-tab-gmail', 'email-tab-direct', 'email-account-pill']) expect(el(id).hidden, id).toBe(false);
    expect(el('email-tab-gmail').getAttribute('aria-selected')).toBe('true');
    expect(shown('email-panel-gmail')).toBe(true);
    app.window.switchEmailImportTab('direct');
    expect(shown('email-panel-direct')).toBe(true);
  });
});
