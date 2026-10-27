import { describe, it, expect, vi } from 'vitest';
import vm from 'vm';
import served from '../public/shop-profile.js?raw';
import databaseRules from '../database.rules.json?raw';
import { DATA_ROOT, DEFAULT_SHOP_PROFILE, parseShopProfile, readShopProfile } from '../src/lib/shop-profile.js';

const good = () => ({
  version: 1,
  shopId: 'moth-press',
  firebase: {
    apiKey: 'web-key',
    authDomain: 'moth-press.firebaseapp.com',
    projectId: 'moth-press',
    storageBucket: 'moth-press.firebasestorage.app',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
  },
  functionsRegion: 'northamerica-northeast1',
  siteUrl: 'https://moth-press.web.app',
  apps: { shop: true, stockroom: true },
});

describe('shop profile', () => {
  it('reads a good profile and fills in the default database address', () => {
    const profile = parseShopProfile(good());
    expect(profile.firebase.projectId).toBe('moth-press');
    expect(profile.firebase.databaseURL).toBe('https://moth-press-default-rtdb.firebaseio.com');
  });

  it('keeps a database address in another region', () => {
    const input = good();
    input.firebase.databaseURL = 'https://moth-press-default-rtdb.northamerica-northeast1.firebasedatabase.app';
    expect(parseShopProfile(input).firebase.databaseURL).toBe(input.firebase.databaseURL);
  });

  it('ignores a profile with any problem as a whole', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const broken of [
      null,
      { ...good(), version: 2 },
      { ...good(), siteUrl: 'http://moth-press.web.app' },
      { ...good(), firebase: { ...good().firebase, projectId: '' } },
      { ...good(), firebase: { ...good().firebase, databaseURL: 'https://x.example/path' } },
      { ...good(), apps: { shop: true } },
    ]) {
      expect(parseShopProfile(broken)).toBeNull();
      expect(readShopProfile(broken)).toBe(DEFAULT_SHOP_PROFILE);
    }
    warn.mockRestore();
  });

  it('uses the test project when the page has no profile', () => {
    expect(readShopProfile(undefined)).toBe(DEFAULT_SHOP_PROFILE);
  });

  it('the served file equals the built-in settings', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(served, sandbox);
    expect(parseShopProfile(sandbox.window.__SHOP_PROFILE__)).toEqual(DEFAULT_SHOP_PROFILE);
  });

  it('the data folder is the one the database rules guard', () => {
    expect(DATA_ROOT).toBe('lyrical');
    expect(databaseRules).toMatch(new RegExp(`"rules":\\s*\\{\\s*"${DATA_ROOT}":`));
  });
});
