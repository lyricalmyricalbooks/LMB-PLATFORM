// A stockroom-only press (the profile's apps.shop is false) gets a stockroom with no website in it: no switcher, no
// website orders, web analytics or website help, search that finds books only, hand-entered sales that start on
// "In Person", and nothing watching or publishing to a website. The real app is booted with such a profile.
// tests/app-switch-shell.test.js covers a press with both apps (the built-in profile keeps every website part).
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const PROFILE = {
  version: 1,
  shopId: 'moth-press',
  firebase: {
    apiKey: 'k', authDomain: 'moth-press.firebaseapp.com', projectId: 'moth-press', storageBucket: 'moth-press.firebasestorage.app',
    messagingSenderId: '1', appId: '1:1:web:a',
  },
  functionsRegion: 'northamerica-northeast1',
  siteUrl: 'https://mothpress.example',
  apps: { shop: false, stockroom: true },
};

const watched = { orders: 0, published: 0 };
let app;
beforeAll(async () => {
  window.__SHOP_PROFILE__ = PROFILE;
  app = await loadApp({
    books: [makeBook({ id: 'moth', title: 'Moth Songs' })],
    overrides: {
      _fbWatchWebsiteOrders: () => { watched.orders++; return () => {}; },
      _fbPublishWebsiteLink: async () => { watched.published++; return { ok: true }; },
    },
  });
}, 30000);
afterAll(() => { delete window.__SHOP_PROFILE__; });

const wait = (fn) => vi.waitFor(fn, { timeout: 4000, interval: 10 });

describe('the stockroom of a stockroom-only press', () => {
  it('marks the page so the website parts stay out', () => {
    expect(document.documentElement.dataset.website).toBe('off');
  });

  it('marks every way into the website tabs', () => {
    for (const tab of ['website', 'webanalytics']) {
      const ways = [...document.querySelectorAll(`[onclick="switchTab('${tab}')"]`)];
      expect(ways.length, tab).toBeGreaterThan(0);
      for (const el of ways) expect(el.hasAttribute('data-needs-website'), el.outerHTML.slice(0, 80)).toBe(true);
    }
  });

  it('sends a stale link to a website tab to the Dashboard', async () => {
    app.window.switchTab('website');
    await wait(() => expect(document.getElementById('tab-website').style.display).toBe('none'));
    app.window.switchTab('webanalytics');
    await wait(() => expect(document.getElementById('tab-webanalytics').style.display).toBe('none'));
  });

  it('shows no switcher to a website', async () => {
    await app.settle?.();
    for (const el of document.querySelectorAll('[data-app-switch], .app-switch-pill')) expect(el.hidden, el.outerHTML.slice(0, 60)).toBe(true);
  });

  it('neither watches website orders nor publishes stock to a website', async () => {
    await app.settle?.();
    expect(watched).toEqual({ orders: 0, published: 0 });
  });

  it('starts hand-entered sales on In Person, also after the form is cleared', () => {
    for (const id of ['m-chan', 'edit-chan']) {
      const select = document.getElementById(id);
      expect(select.value, id).toBe('In Person');
      select.value = 'Website';
      const form = select.closest('form');
      if (form) { form.reset(); expect(select.value, `${id} after a reset`).toBe('In Person'); }
    }
  });

  it('names the search for books only', () => {
    expect(document.getElementById('app-search-header-btn').getAttribute('aria-label')).toBe('Search books');
  });

  it('marks every help answer about the website, and offers a books-only search answer instead', () => {
    const answers = [...document.querySelectorAll('details.help-q')].filter((d) => !d.hasAttribute('data-needs-website'));
    expect(answers.length).toBeGreaterThan(10);
    for (const d of answers) {
      const copy = d.cloneNode(true);
      copy.querySelectorAll('[data-needs-website]').forEach((el) => el.remove());
      expect(/website/i.test(copy.textContent), d.querySelector('summary')?.textContent).toBe(false);
    }
    expect(document.querySelector('[data-no-website-only] summary')?.textContent).toBe('Finding a book quickly');
  });
});

describe('search with no website', () => {
  // Imported here, after the profile is set: the app reads the profile once, when it first loads.
  let searchEverything;
  beforeAll(async () => { ({ searchEverything } = await import('../src/lib/app-search.js')); });
  const opts = {
    appBooks: [{ id: 'b1', title: 'Moth Songs' }],
    shopBooks: [{ key: 'w1', bookId: 'w1', title: 'Moth Songs (web)' }],
    orders: [{ orderId: 'o1', number: 'Moth-1' }],
    admin: 'https://mothpress.example/admin',
  };
  it('finds this app\'s books only, with no "Search the website" line', () => {
    const r = searchEverything('moth', { ...opts, website: false });
    expect(r.appBooks).toHaveLength(1);
    expect(r.websiteBooks).toEqual([]);
    expect(r.orders).toEqual([]);
    expect(r.websiteSearch).toBeNull();
  });
  it('keeps the website results when there is one', () => {
    expect(searchEverything('moth', opts).websiteSearch).not.toBeNull();
  });
});
