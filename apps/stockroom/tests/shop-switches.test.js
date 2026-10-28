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

describe('the Gmail order scan follows its switch', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp();
  }, 30000);
  afterEach(() => {
    delete window.__SHOP_PROFILE__;
  });

  const el = (id) => document.getElementById(id);
  const scanParts = () => [...document.querySelectorAll('[data-gmail-order-scan]')];
  const websiteWords = () => document.querySelector('[data-no-gmail-order-scan]');

  it('off: Orders shows the website words, with no Gmail scan, buttons, tiles or queue', () => {
    app.window.renderOrders();
    expect(scanParts().length).toBeGreaterThan(4);
    for (const part of scanParts()) expect(part.hidden).toBe(true);
    for (const id of ['scan-btn', 'backfill-shipping-btn', 'orders-list', 'web-orders-status', 'apply-all-btn']) {
      expect(el(id).closest('[hidden]'), id).not.toBeNull();
    }
    expect(websiteWords().hidden).toBe(false);
    expect(websiteWords().textContent).toContain('arrive here by themselves');
  });

  it('off: no rival is named in the Orders words a new shop sees', () => {
    app.window.renderOrders();
    const shown = [...document.querySelectorAll('.web-orders-hero p')].filter((p) => !p.closest('[hidden]'));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.map((p) => p.textContent).join(' ')).not.toMatch(/big cartel/i);
  });

  it('off: Scan Gmail and Backfill shipping info refuse without reading anything', async () => {
    const calls = [];
    const realFetch = window.fetch;
    window.fetch = (...args) => { calls.push(args); return realFetch(...args); };
    try {
      await app.window.fetchOrders();
      await app.window.backfillShipping();
    } finally {
      window.fetch = realFetch;
    }
    expect(calls).toEqual([]);
    expect(el('scan-btn').disabled).toBe(false);
  });

  it('on: the scan screen comes back as before', () => {
    window.__SHOP_PROFILE__ = profile({ gmailOrderScan: true });
    app.window.renderOrders();
    for (const part of scanParts()) expect(part.hidden).toBe(false);
    expect(websiteWords().hidden).toBe(true);
    expect(el('scan-btn').textContent).toBe('Scan Gmail');
  });
});

describe('the old shop system tab follows its switch', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp();
  }, 30000);
  afterEach(() => {
    delete window.__SHOP_PROFILE__;
  });

  const el = (id) => document.getElementById(id);
  const parts = () => [...document.querySelectorAll('[data-old-shop-sync]')];
  const visibleText = (root) => {
    const copy = root.cloneNode(true);
    copy.querySelectorAll('[hidden]').forEach((node) => node.remove());
    return copy.textContent;
  };
  const helpAnswer = () => [...document.querySelectorAll('details.help-q')]
    .find((q) => q.querySelector('summary').textContent.includes('artists can'));

  it('off: the sidebar and tab buttons, their badges and the Orders strip stay hidden', () => {
    app.window.switchTab('dashboard');
    expect(parts().length).toBeGreaterThan(6);
    for (const part of parts()) expect(part.hidden).toBe(true);
    for (const badge of document.querySelectorAll('.bc-gap-badge')) expect(badge.hidden).toBe(true);
    expect(el('web-bc-gap-strip').hidden).toBe(true);
  });

  it('off: no rival is named in the help answer, Payments or Orders words a new shop sees', () => {
    app.window.switchTab('website');
    expect(visibleText(helpAnswer())).not.toMatch(/big cartel/i);
    expect(visibleText(helpAnswer())).toContain('Shipping, Sheets and Backups');
    expect(visibleText(document.querySelector('#tab-reconcile .section-subcopy'))).not.toMatch(/big cartel/i);
    expect(visibleText(el('tab-website'))).not.toMatch(/big cartel/i);
  });

  it('off: a link to the tab lands on Website orders, and no check asks the old system', async () => {
    const calls = [];
    const realFetch = window.fetch;
    window.fetch = (...args) => { calls.push(args); return realFetch(...args); };
    const activePanel = () => document.querySelector('.tab-panel.active')?.id;
    try {
      app.window.switchTab('website');
      const website = activePanel();
      app.window.switchTab('dashboard');
      app.window.switchTab('bigcartel');
      expect(el('tab-bigcartel').classList.contains('active')).toBe(false);
      expect(activePanel()).toBe(website);
      expect(await app.window.checkBigCartelLedgerGaps({ silent: true })).toBeNull();
      expect(await app.window.autoCheckBigCartelLedgerGaps()).toBeNull();
      await app.window.refreshBigCartelOrdersIfDue({ force: true });
    } finally {
      window.fetch = realFetch;
    }
    expect(calls).toEqual([]);
  });

  it('on: the tab, its words and its buttons come back as before', () => {
    window.__SHOP_PROFILE__ = profile({ oldShopSync: true });
    app.window.switchTab('bigcartel');
    for (const part of parts()) expect(part.hidden).toBe(false);
    expect(el('tab-bigcartel').classList.contains('active')).toBe(true);
    expect(visibleText(helpAnswer())).toContain('Shipping, Big Cartel, Sheets and Backups');
    app.window.switchTab('dashboard');
  });
});
