// The shop profile: everything that differs between shops and is safe to be public (Firebase web settings, functions
// region, the shop's address, the bot-check site key, which apps are on). Hosting serves it as /shop-profile.js, which
// sets window.__SHOP_PROFILE__ before the app starts (index.html loads it with `defer`, ahead of the app script), so one
// build serves every shop. The format's master copy is profile/shop-profile.schema.json in the platform repo.
//
// When the file is missing or broken (local dev, tests, the Studio fixture), the shop falls back to this shop's own
// values below, so nothing changes for this shop. Plan, test mode, the platform fee and secret keys are never in here;
// `payments` holds only what the card form needs on the page (plan 2.2), and the server never trusts it.

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
  switches?: Partial<Record<ShopSwitch, boolean>>;
  payments?: ShopPayments;
};

/**
 * How the shop takes card payments (plan 2.2). Missing, or mode "own": the shop's own keys from its settings, as before.
 * Mode "platform": through the platform's payment service, on the press's connected account; the page then loads
 * Stripe with the platform's publishable key for that account (`stripe`).
 */
export type ShopPayments = {
  provider: "stripe" | "square";
  mode: "own" | "platform";
  stripe?: { accountId: string; publishableKey?: string; testPublishableKey?: string };
};

/**
 * Things one press needed once that a new shop doesn't (plan 1.17). Each is off unless the profile's `switches` turns it
 * on with `true`; the test shop's profile names none, so all are off.
 *   legacyStockroomSignIn   the admin sign-in also signs into a separate stockroom project (src/lib/legacyFirebase.ts)
 *   githubPagesForwarding   an old GitHub Pages address forwards to the shop and hands over the bag (movedState.ts)
 *   gmailReceiptFinder      the stockroom's Gmail receipt finder (read by the stockroom; listed here so both agree)
 */
export const SHOP_SWITCHES = ["legacyStockroomSignIn", "githubPagesForwarding", "gmailReceiptFinder"] as const;
export type ShopSwitch = (typeof SHOP_SWITCHES)[number];

/** Whether the profile turns this one-off on. Anything but `true` is off. */
export function switchOn(name: ShopSwitch, profile: ShopProfile = shopProfile): boolean {
  return profile.switches?.[name] === true;
}

declare global {
  interface Window { __SHOP_PROFILE__?: unknown }
}

export const DEFAULT_SHOP_PROFILE: ShopProfile = {
  version: 1,
  shopId: "lmb-test-shop",
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
const matches = (value: unknown, pattern: RegExp) => typeof value === "string" && pattern.test(value);

/** The profile's `payments`, checked like the platform's format: undefined when missing, null when it is wrong. */
export function parseShopPayments(value: unknown): ShopPayments | undefined | null {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payments = value as Record<string, any>;
  if (!["stripe", "square"].includes(payments.provider) || !["own", "platform"].includes(payments.mode)) return null;
  let stripe: ShopPayments["stripe"];
  if (payments.stripe !== undefined) {
    const s = payments.stripe;
    if (!s || typeof s !== "object" || !matches(s.accountId, /^acct_[A-Za-z0-9]+$/)) return null;
    if (s.publishableKey !== undefined && !matches(s.publishableKey, /^pk_live_[A-Za-z0-9]+$/)) return null;
    if (s.testPublishableKey !== undefined && !matches(s.testPublishableKey, /^pk_test_[A-Za-z0-9]+$/)) return null;
    stripe = {
      accountId: s.accountId,
      ...(s.publishableKey ? { publishableKey: s.publishableKey } : {}),
      ...(s.testPublishableKey ? { testPublishableKey: s.testPublishableKey } : {}),
    };
  }
  return { provider: payments.provider, mode: payments.mode, ...(stripe ? { stripe } : {}) };
}

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
  // Only the switches turned on are kept; an unknown name or a non-true value is simply off.
  const on = SHOP_SWITCHES.filter(name => profile.switches && typeof profile.switches === "object" && profile.switches[name] === true);
  const payments = parseShopPayments(profile.payments);
  if (payments === null) return null;
  return {
    version: 1,
    shopId: profile.shopId,
    firebase: Object.fromEntries(FIREBASE_KEYS.map(key => [key, firebase[key]])) as ShopProfile["firebase"],
    functionsRegion: profile.functionsRegion,
    siteUrl: profile.siteUrl,
    ...(profile.appCheckSiteKey ? { appCheckSiteKey: profile.appCheckSiteKey } : {}),
    apps: { shop: apps.shop, stockroom: apps.stockroom },
    ...(on.length ? { switches: Object.fromEntries(on.map(name => [name, true])) } : {}),
    ...(payments ? { payments } : {}),
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

/**
 * The Stripe card form's settings when the platform takes the payments: the platform's publishable key for the shop's
 * current mode and the press's account. null when the shop uses its own keys (the settings' keys apply).
 */
export function platformStripe(testMode: boolean, profile: ShopProfile = shopProfile): { publishableKey: string; stripeAccount: string } | null {
  const payments = profile.payments;
  if (payments?.provider !== "stripe" || payments.mode !== "platform" || !payments.stripe) return null;
  return {
    publishableKey: (testMode ? payments.stripe.testPublishableKey : payments.stripe.publishableKey) || "",
    stripeAccount: payments.stripe.accountId,
  };
}
