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
  stockroom: Object.freeze({ firestoreDatabase: 'stockroom', storageBucket: 'lmb-test-stockroom-stockroom' }),
});

/**
 * Things one press needed once that a new shop doesn't (plan 1.17). Each is off unless the profile's `switches` turns it
 * on with `true`; the test shop's profile names none, so all are off. The shop reads the same list
 * (apps/shop/src/lib/shopProfile.ts SHOP_SWITCHES).
 *   gmailReceiptFinder      Tax Centre › Email Receipt Import's Gmail Finder and Gmail Import tabs (src/features/receipts.js)
 *   gmailOrderScan          Orders › Scan Gmail and Backfill shipping info: order receipts read from Gmail through Apps
 *                           Script (src/main.js fetchOrders, src/features/shipping.js backfillShipping)
 *   oldShopSync             the tab for the press's old shop system, its missing-orders check, the Orders strip and the
 *                           order watch (src/features/bigcartel.js applyOldShopSyncSwitch). Off, nothing names it.
 *   legacyStockroomSignIn   the shop's admin also signs into a separate stockroom project (read by the shop)
 *   githubPagesForwarding   an old GitHub Pages address forwards to the shop (read by the shop)
 */
export const SHOP_SWITCHES = Object.freeze(['legacyStockroomSignIn', 'githubPagesForwarding', 'gmailReceiptFinder', 'gmailOrderScan', 'oldShopSync']);

const FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const text = (value) => typeof value === 'string' && value.trim() !== '';
// The format's patterns for the stockroom's own named database and bucket (profile/shop-profile.schema.json).
const DATABASE_ID = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;
const BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

/**
 * Where this stockroom's data lives in its project (plan 1.20): `{ firestoreDatabase, storageBucket }` when the profile
 * names the stockroom's own database and bucket, null when it uses the project's defaults, undefined when the block is
 * there but broken (the whole profile is then refused).
 */
function stockroomPlace(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object') return undefined;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !DATABASE_ID.test(value.firestoreDatabase ?? '') || !BUCKET.test(value.storageBucket ?? '')) return undefined;
  return { firestoreDatabase: value.firestoreDatabase, storageBucket: value.storageBucket };
}

/** How the shop takes card payments ('own' keys or 'platform'), or '' when the profile says nothing. Only the mode is kept. */
function paymentMode(value) {
  return value && (value.mode === 'own' || value.mode === 'platform') ? value.mode : '';
}

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
  const place = stockroomPlace(value.stockroom);
  if (place === undefined) return null;
  // Only the switches turned on are kept; an unknown name or a non-true value is simply off.
  const switches = value.switches && typeof value.switches === 'object' ? value.switches : {};
  const on = SHOP_SWITCHES.filter((name) => switches[name] === true);
  if (value.name !== undefined && (typeof value.name !== 'string' || !value.name.length || value.name.length > 80)) return null;
  return {
    version: 1,
    shopId: value.shopId,
    ...(value.name !== undefined ? { name: value.name } : {}),
    // What the shop sells (plan 10.23). An answer of the wrong shape is left out, never a reason to refuse the profile.
    ...(typeof value.sells === 'string' && /^[a-z][a-z-]{1,30}$/.test(value.sells) ? { sells: value.sells } : {}),
    firebase: {
      ...Object.fromEntries(FIREBASE_KEYS.map((key) => [key, firebase[key]])),
      databaseURL: firebase.databaseURL || `https://${firebase.projectId}-default-rtdb.firebaseio.com`,
    },
    functionsRegion: value.functionsRegion,
    siteUrl: value.siteUrl,
    apps: { shop: apps.shop, stockroom: apps.stockroom },
    ...(place ? { stockroom: place } : {}),
    ...(paymentMode(value.payments) ? { payments: { mode: paymentMode(value.payments) } } : {}),
    ...(on.length ? { switches: Object.fromEntries(on.map((name) => [name, true])) } : {}),
  };
}

/** The named Firestore database the stockroom uses, or undefined for the project's default one. */
export function stockroomDatabaseId(profile = shopProfile) {
  return profile?.stockroom?.firestoreDatabase;
}

/** The storage bucket the stockroom uses (`gs://…`), or undefined for the project's default one. */
export function stockroomBucketUrl(profile = shopProfile) {
  return profile?.stockroom?.storageBucket ? `gs://${profile.stockroom.storageBucket}` : undefined;
}

/**
 * How download file names start: the press's name from the profile ("Moth Press" → "Moth_Press", or "moth-press" with
 * `lower`), or "Stockroom" when the profile names none. Never one particular press's name.
 */
export function fileStem({ lower = false } = {}, profile = shopProfile) {
  const words = String(profile?.name ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[A-Za-z0-9]+/g) || [];
  const stem = words.length ? words.join('_').slice(0, 40).replace(/_+$/, '') : 'Stockroom';
  return lower ? stem.toLowerCase().replace(/_/g, '-') : stem;
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

/**
 * Is this a shop the platform made and runs (code plan 6.16)? Its press sets up no keys or accounts of its own: every
 * panel marked `data-own-accounts` in index.html (AI, carrier, Stripe-reading and Google Sheet connections) is hidden
 * there. The built-in test settings (local dev, tests) are not such a shop, and neither is a shop that says it uses its
 * own payment keys.
 */
export function runsOnColophon(profile = shopProfile) {
  return profile !== DEFAULT_SHOP_PROFILE && profile?.payments?.mode !== 'own';
}

// CSS reads this mark (src/style.css, `[data-colophon] [data-own-accounts]`), so the panels never flash before the app starts.
if (typeof document !== 'undefined' && runsOnColophon()) document.documentElement.setAttribute('data-colophon', '');
