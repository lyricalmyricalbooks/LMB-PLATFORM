// Plan 1.17's shop switches were retired on 14 November 2026: the Gmail receipt finder, the Gmail order scan and the
// old shop system's tab stay off in every shop, even for a profile that still names a switch as on.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadApp } from './helpers/load-app.js';
import * as shopProfileModule from '../src/lib/shop-profile.js';

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

const ALL_ON = { legacyStockroomSignIn: true, githubPagesForwarding: true, gmailReceiptFinder: true, gmailOrderScan: true, oldShopSync: true };

describe('the retired shop switches', () => {
  it('are gone from the profile reader', () => {
    expect('switchOn' in shopProfileModule).toBe(false);
    expect('SHOP_SWITCHES' in shopProfileModule).toBe(false);
    const parsed = shopProfileModule.parseShopProfile(profile(ALL_ON));
    expect(parsed).not.toBeNull();
    expect('switches' in parsed).toBe(false);
  });
});

describe('the Gmail receipt finder is gone', () => {
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

  it('the import has no Gmail tabs, pill or panels and opens on Paste & Upload', async () => {
    for (const id of ['email-tab-gmail', 'email-tab-direct', 'email-account-pill', 'email-panel-gmail', 'email-panel-direct']) {
      expect(el(id), id).toBeNull();
    }
    app.window.openEmailReceiptImportModal();
    await app.settle();
    expect(el('email-tab-manual').getAttribute('aria-selected')).toBe('true');
    expect(shown('email-panel-manual')).toBe(true);
    expect(app.window.searchGmailEmails).toBeUndefined();
    expect(app.window.importDirectGmailEmails).toBeUndefined();
  });

  it('an older profile that names the switch as on changes nothing', async () => {
    window.__SHOP_PROFILE__ = profile(ALL_ON);
    app.window.openEmailReceiptImportModal();
    await app.settle();
    expect(el('email-tab-gmail')).toBeNull();
    expect(el('email-tab-manual').getAttribute('aria-selected')).toBe('true');
  });

  it('asking for an old Gmail tab opens Paste & Upload instead', async () => {
    app.window.openEmailReceiptImportModal();
    await app.settle();
    for (const tab of ['gmail', 'direct']) {
      app.window.switchEmailImportTab(tab);
      expect(el('email-tab-manual').getAttribute('aria-selected')).toBe('true');
      expect(shown('email-panel-manual')).toBe(true);
    }
  });
});

describe('the Gmail order scan stays off', () => {
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
});

describe('the old shop system tab stays off', () => {
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
});

describe("words shown for the old shop system's orders", () => {
  // These show whenever such orders exist, switch or not, so they use neutral words instead of the system's name.
  let app;
  beforeAll(async () => {
    app = await loadApp();
  }, 30000);
  afterEach(() => {
    delete window._reconPayments;
    try { localStorage.removeItem('lm-bigcartel-orders-cache'); } catch { /* private mode */ }
  });

  it('the Payments match pill says "Website order"', () => {
    window._reconPayments = [{
      id: 'pi_1', amount: 25, currency: 'cad', date: '2026-10-01', customer: 'Ada', email: '',
      description: 'Payment for Big Cartel order #ABCD-123456',
    }];
    app.window.renderReconcile();
    const pills = [...document.querySelectorAll('#recon-needs .recon-pill, #recon-matched .recon-pill')].map((n) => n.textContent);
    expect(pills.join(' ')).toContain('Website order #ABCD-123456');
    expect(pills.join(' ')).not.toMatch(/big cartel/i);
  });

  it('the ready-to-ship card says "website order"', async () => {
    localStorage.setItem('lm-bigcartel-orders-cache', JSON.stringify({
      timestamp: Date.now(),
      orders: [{ id: 'ABCD-123456', attributes: { status: 'completed', created_at: new Date().toISOString() } }],
      included: [],
    }));
    const { renderBigCartelShipQueue } = await import('../src/features/shipping.js');
    renderBigCartelShipQueue();
    const card = document.getElementById('ship-bc-queue').textContent;
    expect(card).toContain('1 website order is waiting for a parcel.');
    expect(card).not.toMatch(/big cartel/i);
  });
});
