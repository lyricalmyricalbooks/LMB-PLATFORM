// The shop profile: everything that differs between shops and is safe to be public (Firebase web settings, functions
// region, the shop's address, the bot-check site key, which apps are on). Hosting serves it as /shop-profile.js, which
// sets window.__SHOP_PROFILE__ before the app starts (index.html loads it with `defer`, ahead of the app script), so one
// build serves every shop. The format's master copy is profile/shop-profile.schema.json in the platform repo.
//
// When the file is missing or broken (local dev, tests, the Studio fixture), the shop falls back to this shop's own
// values below, so nothing changes for Lyricalmyrical. Plan, test mode and the Stripe account are never in here.

export type ShopProfile = {
  version: 1;
  shopId: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  functionsRegion: string;
  siteUrl: string;
  appCheckSiteKey?: string;
  apps: { shop: boolean; stockroom: boolean };
};

declare global {
  interface Window { __SHOP_PROFILE__?: unknown }
}

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  version: 1,
  shopId: "lyricalmyrical",
  firebase: {
    apiKey: "AIzaTestShopKeyNotReal00000000000000000",
    authDomain: "lmb-test-shop.firebaseapp.com",
    projectId: "lmb-test-shop",
    storageBucket: "lmb-test-shop.firebasestorage.app",
    messagingSenderId: "100000000001",
    appId: "1:100000000001:web:0000000000000000000001",
  },
  functionsRegion: "us-central1",
  siteUrl: "https://lmb-test-shop.web.app",
  apps: { shop: true, stockroom: true },
};

const FIREBASE_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;
const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/**
 * Checks a profile the page was handed. All or nothing: a profile with any problem is ignored as a whole, so the shop
 * never mixes one project's settings with another's.
 */
export function parseShopProfile(value: unknown): ShopProfile | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, any>;
  if (profile.version !== 1 || !text(profile.shopId) || !text(profile.functionsRegion)) return null;
  if (!text(profile.siteUrl) || !/^https:\/\/[^/\s]+$/.test(profile.siteUrl)) return null;
  const firebase = profile.firebase;
  if (!firebase || typeof firebase !== "object" || !FIREBASE_KEYS.every(key => text(firebase[key]))) return null;
  if (profile.appCheckSiteKey !== undefined && typeof profile.appCheckSiteKey !== "string") return null;
  const apps = profile.apps;
  if (!apps || typeof apps.shop !== "boolean" || typeof apps.stockroom !== "boolean") return null;
  return {
    version: 1,
    shopId: profile.shopId,
    firebase: Object.fromEntries(FIREBASE_KEYS.map(key => [key, firebase[key]])) as ShopProfile["firebase"],
    functionsRegion: profile.functionsRegion,
    siteUrl: profile.siteUrl,
    ...(profile.appCheckSiteKey ? { appCheckSiteKey: profile.appCheckSiteKey } : {}),
    apps: { shop: apps.shop, stockroom: apps.stockroom },
  };
}

/** The profile the page opened with, or this shop's own values when there is none. */
export function readShopProfile(source: unknown = typeof window === "undefined" ? undefined : window.__SHOP_PROFILE__): ShopProfile {
  if (source === undefined) return DEFAULT_SHOP_PROFILE;
  const parsed = parseShopProfile(source);
  if (!parsed) {
    console.warn("The shop profile could not be read; using the built-in settings.");
    return DEFAULT_SHOP_PROFILE;
  }
  return parsed;
}

export const shopProfile: ShopProfile = readShopProfile();
