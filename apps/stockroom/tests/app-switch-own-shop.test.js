// @vitest-environment node
// Plan 1.21: inside a shop's own project the switch opens that project's shop, from the profile the page was given.
import { describe, it, expect, vi, afterEach } from 'vitest';

const profile = {
  version: 1,
  shopId: 'moth-press',
  firebase: {
    apiKey: 'k', authDomain: 'moth-press.firebaseapp.com', projectId: 'moth-press', storageBucket: 'moth-press.firebasestorage.app',
    messagingSenderId: '1', appId: '1:1:web:a',
  },
  functionsRegion: 'northamerica-northeast1',
  siteUrl: 'https://mothpress.example',
  apps: { shop: true, stockroom: true },
  stockroom: { firestoreDatabase: 'stockroom', storageBucket: 'moth-press-stockroom' },
};

const load = async (value) => {
  vi.resetModules();
  globalThis.window = { __SHOP_PROFILE__: value };
  return import('../src/lib/app-switch.js');
};
afterEach(() => { delete globalThis.window; vi.resetModules(); });

describe("the switch in a shop's own project", () => {
  it("opens the shop's admin at its own address and trusts the project's addresses", async () => {
    const { WEBSITE_ADMIN, WEBSITE_ORIGINS, websiteOrderUrl } = await load(profile);
    expect(WEBSITE_ADMIN).toBe('https://mothpress.example/admin');
    expect(websiteOrderUrl('A-1')).toBe('https://mothpress.example/admin#orders/A-1');
    for (const origin of ['https://mothpress.example', 'https://moth-press.web.app', 'https://moth-press.firebaseapp.com']) {
      expect(WEBSITE_ORIGINS).toContain(origin);
    }
  });

  it('keeps the test shop when the profile has no shop', async () => {
    const { WEBSITE_ADMIN, WEBSITE_ORIGINS } = await load({ ...profile, apps: { shop: false, stockroom: true } });
    expect(WEBSITE_ADMIN).toBe('https://lmb-test-shop.web.app/admin');
    expect(WEBSITE_ORIGINS).not.toContain('https://mothpress.example');
  });
});
