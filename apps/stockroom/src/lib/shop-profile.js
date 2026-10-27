// The shop profile: what differs between shops and is safe to be public (Firebase web settings, functions region,
// the shop's address, which apps are on). Hosting serves it as /shop-profile.js, which sets window.__SHOP_PROFILE__
// before the app starts (index.html loads it with `defer`, ahead of the app script), so one build serves every shop.
// The shop reads the same file (apps/shop/src/lib/shopProfile.ts); the format's master copy is
// profile/shop-profile.schema.json in the platform repo.
//
// When the file is missing or broken (local dev, tests), the stockroom falls back to the test project below, so it
// never mixes one project's settings with another's.

/** The Realtime Database folder every shop's stockroom data lives under. database.rules.json names it too. */
export const DATA_ROOT = 'lyrical';

export const DEFAULT_SHOP_PROFILE = Object.freeze({
  version: 1,
  shopId: 'lmb-test-stockroom',
  firebase: Object.freeze({
    apiKey: 'AIzaTestStockroomKeyNotReal000000000000',
    authDomain: 'lmb-test-stockroom.firebaseapp.com',
    databaseURL: 'https://lmb-test-stockroom-default-rtdb.firebaseio.com',
    projectId: 'lmb-test-stockroom',
    storageBucket: 'lmb-test-stockroom.firebasestorage.app',
    messagingSenderId: '100000000002',
    appId: '1:100000000002:web:0000000000000000000002',
  }),
  functionsRegion: 'us-central1',
  siteUrl: 'https://lmb-test-stockroom.web.app',
  apps: Object.freeze({ shop: false, stockroom: true }),
});

/**
 * Things one press needed once that a new shop doesn't (plan 1.17). Each is off unless the profile's `switches` turns it
 * on with `true`; the test shop's profile names none, so all are off. The shop reads the same list
 * (apps/shop/src/lib/shopProfile.ts SHOP_SWITCHES).
 *   gmailReceiptFinder      Tax Centre › Email Receipt Import's Gmail Finder and Gmail Import tabs (src/features/receipts.js)
 *   legacyStockroomSignIn   the shop's admin also signs into a separate stockroom project (read by the shop)
 *   githubPagesForwarding   an old GitHub Pages address forwards to the shop (read by the shop)
 */
export const SHOP_SWITCHES = Object.freeze(['legacyStockroomSignIn', 'githubPagesForwarding', 'gmailReceiptFinder']);

const FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const text = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * Checks a profile the page was handed. All or nothing: a profile with any problem is ignored as a whole.
 * `firebase.databaseURL` is optional; without it the project's default database address is used.
 */
export function parseShopProfile(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.version !== 1 || !text(value.shopId) || !text(value.functionsRegion)) return null;
  if (!text(value.siteUrl) || !/^https:\/\/[^/\s]+$/.test(value.siteUrl)) return null;
  const firebase = value.firebase;
  if (!firebase || typeof firebase !== 'object' || !FIREBASE_KEYS.every((key) => text(firebase[key]))) return null;
  if (firebase.databaseURL !== undefined && !/^https:\/\/[^/\s]+\/?$/.test(firebase.databaseURL)) return null;
  const apps = value.apps;
  if (!apps || typeof apps.shop !== 'boolean' || typeof apps.stockroom !== 'boolean') return null;
  // Only the switches turned on are kept; an unknown name or a non-true value is simply off.
  const switches = value.switches && typeof value.switches === 'object' ? value.switches : {};
  const on = SHOP_SWITCHES.filter((name) => switches[name] === true);
  return {
    version: 1,
    shopId: value.shopId,
    firebase: {
      ...Object.fromEntries(FIREBASE_KEYS.map((key) => [key, firebase[key]])),
      databaseURL: firebase.databaseURL || `https://${firebase.projectId}-default-rtdb.firebaseio.com`,
    },
    functionsRegion: value.functionsRegion,
    siteUrl: value.siteUrl,
    apps: { shop: apps.shop, stockroom: apps.stockroom },
    ...(on.length ? { switches: Object.fromEntries(on.map((name) => [name, true])) } : {}),
  };
}

/** Whether the profile turns this one-off on. Anything but `true` is off. */
export function switchOn(name, profile = shopProfile) {
  return profile?.switches?.[name] === true;
}

/** The profile the page opened with, or the test project when there is none. */
export function readShopProfile(source = typeof window === 'undefined' ? undefined : window.__SHOP_PROFILE__) {
  if (source === undefined) return DEFAULT_SHOP_PROFILE;
  const parsed = parseShopProfile(source);
  if (!parsed) {
    console.warn('The shop profile could not be read; using the built-in settings.');
    return DEFAULT_SHOP_PROFILE;
  }
  return parsed;
}

export const shopProfile = readShopProfile();
