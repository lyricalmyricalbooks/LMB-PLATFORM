// Who this shop is, for the server: the owner's address, the sender, the site address and the extra web addresses
// allowed to call the functions. Each shop's Firebase project gets its own values from the platform's setup script,
// which writes them to functions/.env.<project id> (Firebase loads that file for that project at deploy, so they never
// sit in another shop's project and never reach a browser). A missing or malformed value keeps the placeholder below,
// so a half-filled file can't take the shop down; tests and the emulator run on the placeholders.
//
//   SHOP_OWNER_EMAIL     the owner's sign-in address; always owner in the admin; gets the shop's alert emails
//   SHOP_SENDER_NAME     the name order emails come from, until Settings › Communications sets one
//   SHOP_SENDER_EMAIL    the address order emails come from, same
//   SHOP_SITE_URL        https://… with no trailing slash; its www. twin is allowed too. Without it: SITE_URL (what
//                        the deploy workflow writes), else the project's own https://<project id>.web.app
//   SHOP_EXTRA_ORIGINS   more web addresses allowed to call the functions, comma-separated (an old address that
//                        still forwards, for example). Set it, even empty, for a real shop: unset keeps the
//                        placeholder addresses below
//   SHOP_PAYMENT_PROVIDER which card payment provider the shop uses (functions/payments lists them; only "stripe" so
//                        far). Unset or empty means "stripe". Any other name stops the functions from loading
//                        (paymentProviderOf): a shop must never take payments through a provider it didn't choose
//   SHOP_PAYMENT_MODE    "own" (unset or empty): the shop's own provider keys, from its settings. "platform": every
//                        payment call goes through the platform's payment service on the press's connected account
//                        (functions/payments/platform.js); the shop holds no provider key. Any other value stops the
//                        functions from loading, like a wrong provider
//   SHOP_PAYMENTS_SERVICE_URL the platform payment service's address (https://…), needed in platform mode
//   SHOP_PAYMENT_EARLIER the provider the shop sold through before switching (platform mode only; "stripe" or
//                        "square", not the current one). Older orders keep their lookups, refunds and payouts there
//                        (functions/payments/index.js). Unset or empty: none. Anything else stops the functions loading
//   SHOP_FUNCTIONS_REGION where the shop's server code runs (the shop profile's functionsRegion; the deploy writes it
//                        from public/shop-profile.js). Every function deploys there (index.js setGlobalOptions), and
//                        links to them (the Stripe webhook, e-book downloads) name it. Unset keeps us-central1
//   SHOP_TEST_SHOP       "true" only on the platform's own test shop (docs/test-shop.md): its sandbox checkouts hold
//                        stock like live ones, so the release check covers the hold. Anything else, or unset, is a
//                        normal shop. Set by the platform, never by the shop owner
//   SHOP_STOCKROOM_DATABASE the stockroom's named Firestore database in this project (plan 1.21; the profile's
//                        stockroom.firestoreDatabase). The inventory app link reads and writes there
//                        (inventoryLinkStore.js). Unset keeps "stockroom", the name setup gives every shop
//   PLATFORM_DOMAINS_URL the platform domain service's address (https, LMB-PLATFORM services/domains, plan 2.9). Set:
//                        Settings › General › Your web address puts the shop on the press's own address. Unset: the
//                        card says the platform's team sets addresses up.
//   PLATFORM_GOOGLE_URL  the platform's Google link (https, LMB-PLATFORM google/, plan 6.17). Set: the admin shows
//                        Connect Google (one sign-in for Analytics, search, Google Shopping and email) instead of the
//                        Google Analytics and Search Console cards. Unset: those cards, as before.
//   PLATFORM_APPS_URL    the platform's app store door (https, LMB-PLATFORM services/apps/shopDoor.js, plan 26.5). Set:
//                        Settings › Apps lists installed apps and the store, and can remove an app. Unset: the page
//                        shows only the shop's own app activity.
//   PLATFORM_ACCOUNTING_URL the platform bookkeeping service's address (https, LMB-PLATFORM services/accounting, plan
//                        7.15). Set: Settings › Bookkeeping can connect QuickBooks. Unset: the page stays hidden.
//   PLATFORM_EMAIL_URL   the platform email service's shop door (https). Set: when the shop hasn't connected its own
//                        Gmail (or Gmail refuses a send) its emails go through the platform's shared sender, with the
//                        shop's name and replies to the shop; Resend keys in the shop are no longer used. Unset: the
//                        shop's own Resend key, as before. The shop proves who it is with PLATFORM_SERVICE_KEY, read
//                        at send time (email/platformSender.js), never from this file's frozen config
//   PLATFORM_ACCOUNTS_URL the platform accounts' shop door (https, LMB-PLATFORM accounts/teamSync.js, plan 5.11). Set:
//                        each change in Settings › Team tells the platform, which re-reads this shop's Team list so
//                        the people on it see the shop in the platform's account switcher. Unset: nothing is sent

const { PROVIDER_NAMES, DEFAULT_PROVIDER, MODES, DEFAULT_MODE } = require("./payments");

const PLACEHOLDER = Object.freeze({
  ownerEmail: "owner@example.com",
  senderName: "Your Press",
  senderEmail: "orders@example.com",
  siteUrl: "https://lmb-test-shop.web.app",
  extraOrigins: Object.freeze(["https://yourpress.github.io", "https://yourpress.example", "https://www.yourpress.example"]),
  project: "lmb-test-shop",
  paymentProvider: DEFAULT_PROVIDER,
  paymentMode: DEFAULT_MODE,
  earlierPaymentProvider: null,
  region: "us-central1",
  testShop: false,
  stockroomDatabase: "stockroom",
});

// A Cloud Functions region name: northamerica-northeast1, us-central1, europe-west2…
const REGION = /^[a-z]+-[a-z]+[0-9]{1,2}$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
// A named Firestore database id; "(default)" never matches, so the link can't be pointed at the shop's own data.
const DATABASE_ID = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/;

const EMAIL = /^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/;
const ORIGIN = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i;
const LOCAL_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4000"];

const text = value => (typeof value === "string" ? value.trim() : "");
const email = value => (EMAIL.test(text(value)) && text(value).length <= 254 ? text(value).toLowerCase() : "");
const origin = value => {
  const v = text(value).replace(/\/+$/, "");
  return ORIGIN.test(v) ? v.toLowerCase() : "";
};

// The shop's payment provider. Unlike the other values, a wrong one is refused rather than replaced: quietly using
// Stripe for a shop set up for another provider would fail at checkout, in front of a shopper.
function paymentProviderOf(value) {
  const name = text(value).toLowerCase();
  if (!name) return PLACEHOLDER.paymentProvider;
  if (PROVIDER_NAMES.includes(name)) return name;
  throw new Error(`SHOP_PAYMENT_PROVIDER is "${text(value).slice(0, 40)}", which this shop can't use yet. `
    + `Set it to one of: ${PROVIDER_NAMES.join(", ")} (or leave it empty for ${PLACEHOLDER.paymentProvider}) in the shop's functions/.env file, then deploy again.`);
}

// How the shop takes payments: refused rather than replaced when wrong, for the same reason as the provider.
function paymentModeOf(value) {
  const name = text(value).toLowerCase();
  if (!name) return PLACEHOLDER.paymentMode;
  if (MODES.includes(name)) return name;
  throw new Error(`SHOP_PAYMENT_MODE is "${text(value).slice(0, 40)}". Set it to one of: ${MODES.join(", ")} `
    + `(or leave it empty for ${PLACEHOLDER.paymentMode}) in the shop's functions/.env file, then deploy again.`);
}

// The payment service's address: required in platform mode, ignored otherwise.
function paymentsServiceUrlOf(mode, value) {
  const url = text(value).replace(/\/+$/, "");
  if (mode !== "platform") return "";
  if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(url)) {
    throw new Error("SHOP_PAYMENT_MODE is platform, but SHOP_PAYMENTS_SERVICE_URL isn't an https:// address. Set it in the shop's functions/.env file, then deploy again.");
  }
  return url;
}

// Square runs only through the platform (code plan 2.2b): the shop never holds a Square token of its own.
function providerModeOf(provider, mode) {
  if (provider === "square" && mode !== "platform") {
    throw new Error('SHOP_PAYMENT_PROVIDER is "square", which runs through the platform only. Set SHOP_PAYMENT_MODE="platform" and SHOP_PAYMENTS_SERVICE_URL in the shop\'s functions/.env file, then deploy again.');
  }
  return mode;
}

// The provider a shop sold through before a switch: only through the platform, and never the current one.
function earlierProviderOf(value, provider, mode) {
  const name = text(value).toLowerCase();
  if (!name) return null;
  if (!PROVIDER_NAMES.includes(name) || name === provider || mode !== "platform") {
    throw new Error(`SHOP_PAYMENT_EARLIER is "${text(value).slice(0, 40)}". It must name the provider the shop used before switching through the platform (one of: ${PROVIDER_NAMES.filter(n => n !== provider).join(", ")}), or be empty, in the shop's functions/.env file. Then deploy again.`);
  }
  return name;
}

/** The shop's server settings from `env` (process.env in the functions), each one checked on its own. */
function readShopConfig(env = {}) {
  const project = text(env.GCLOUD_PROJECT) || text(env.GOOGLE_CLOUD_PROJECT) || PLACEHOLDER.project;
  // firebaseapp.com is deliberately absent: the site sends visitors from there to web.app (scripts/canonicalHost.mjs)
  // instead of serving checkout twice.
  const hosted = PROJECT.test(project) ? `https://${project}.web.app` : "";
  const region = REGION.test(text(env.SHOP_FUNCTIONS_REGION)) ? text(env.SHOP_FUNCTIONS_REGION) : PLACEHOLDER.region;
  const functionsProject = PROJECT.test(project) ? project : PLACEHOLDER.project;
  // The platform's walkthrough runs the shop on this computer (LMB-PLATFORM demo/run.js): on the emulators, and only
  // there, its emails link to the local shop instead of a web address that doesn't exist.
  const local = env.FUNCTIONS_EMULATOR === "true" && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(text(env.DEMO_SHOP_URL)) ? text(env.DEMO_SHOP_URL) : "";
  const siteUrl = local || origin(env.SHOP_SITE_URL) || origin(env.SITE_URL) || hosted || PLACEHOLDER.siteUrl;
  const extraOrigins = env.SHOP_EXTRA_ORIGINS === undefined
    ? [...PLACEHOLDER.extraOrigins]
    : text(env.SHOP_EXTRA_ORIGINS).split(",").map(origin).filter(Boolean);
  const host = new URL(siteUrl).hostname;
  const www = host.startsWith("www.") || host.endsWith(".web.app") ? [] : [`https://www.${host}`];
  return Object.freeze({
    ownerEmail: email(env.SHOP_OWNER_EMAIL) || PLACEHOLDER.ownerEmail,
    senderName: text(env.SHOP_SENDER_NAME).replace(/[\r\n"<>]+/g, " ").slice(0, 80) || PLACEHOLDER.senderName,
    senderEmail: email(env.SHOP_SENDER_EMAIL) || PLACEHOLDER.senderEmail,
    siteUrl,
    siteHost: host.replace(/^www\./, ""),
    paymentProvider: paymentProviderOf(env.SHOP_PAYMENT_PROVIDER),
    paymentMode: providerModeOf(paymentProviderOf(env.SHOP_PAYMENT_PROVIDER), paymentModeOf(env.SHOP_PAYMENT_MODE)),
    earlierPaymentProvider: earlierProviderOf(env.SHOP_PAYMENT_EARLIER, paymentProviderOf(env.SHOP_PAYMENT_PROVIDER), paymentModeOf(env.SHOP_PAYMENT_MODE)),
    paymentsServiceUrl: paymentsServiceUrlOf(paymentModeOf(env.SHOP_PAYMENT_MODE), env.SHOP_PAYMENTS_SERVICE_URL),
    testShop: text(env.SHOP_TEST_SHOP).toLowerCase() === "true",
    stockroomDatabase: DATABASE_ID.test(text(env.SHOP_STOCKROOM_DATABASE)) ? text(env.SHOP_STOCKROOM_DATABASE) : PLACEHOLDER.stockroomDatabase,
    platformEmailUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_EMAIL_URL)) ? text(env.PLATFORM_EMAIL_URL) : "",
    platformDomainsUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_DOMAINS_URL)) ? text(env.PLATFORM_DOMAINS_URL).replace(/\/+$/, "") : "",
    platformGoogleUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_GOOGLE_URL)) ? text(env.PLATFORM_GOOGLE_URL).replace(/\/+$/, "") : "",
    platformAccountingUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_ACCOUNTING_URL)) ? text(env.PLATFORM_ACCOUNTING_URL).replace(/\/+$/, "") : "",
    platformSocialUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_SOCIAL_URL)) ? text(env.PLATFORM_SOCIAL_URL).replace(/\/+$/, "") : "",
    platformAppsUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_APPS_URL)) ? text(env.PLATFORM_APPS_URL).replace(/\/+$/, "") : "",
    platformAccountsUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_ACCOUNTS_URL)) ? text(env.PLATFORM_ACCOUNTS_URL).replace(/\/+$/, "") : "",
    allowedOrigins: Object.freeze([...new Set([...LOCAL_ORIGINS, ...extraOrigins, ...(hosted ? [hosted] : []), siteUrl, ...www])]),
    project: functionsProject,
    // The shop's id in the shared system (shops/<id>, docs/shared-system.md); null for a server that runs no shop record.
    shopId: SHOP_ID.test(text(env.SHOP_ID)) ? text(env.SHOP_ID) : null,
    region,
    // The public address of one of this shop's functions, the same form the shop's pages call (src/app/lib/functionsBase.ts).
    functionsBase: `https://${region}-${functionsProject}.cloudfunctions.net`,
  });
}

/** The address of one of this shop's Cloud Functions, naming the shop (?shop=) so the shared server knows whose it is. */
function functionLink(config, name, params = {}) {
  const url = new URL(`${config.functionsBase}/${name}`);
  if (config.shopId) url.searchParams.set("shop", config.shopId);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  return url.toString();
}

// The settings each shop keeps in its record (shops/<id>.server, written by the platform), in place of the
// functions/.env.<project> file a shop had when it had its own project. Everything else (the platform's service
// addresses, the region) is the same for every shop and comes from the server's own environment.
const SHOP_KEYS = Object.freeze([
  "SHOP_SENDER_NAME", "SHOP_SENDER_EMAIL", "SHOP_SITE_URL", "SHOP_EXTRA_ORIGINS", "SHOP_PAYMENT_PROVIDER",
  "SHOP_PAYMENT_MODE", "SHOP_PAYMENT_EARLIER", "SHOP_TEST_SHOP", "SHOP_STOCKROOM_DATABASE",
]);
const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** One shop's server settings from its record ({ ownerEmail, server: { SHOP_…: "…" } }) and the server's environment. */
function configForShop(shopId, record = {}, env = process.env) {
  const shared = Object.fromEntries(Object.entries(env).filter(([key]) => !SHOP_KEYS.includes(key) && key !== "SHOP_OWNER_EMAIL" && key !== "SHOP_ID"));
  const own = {};
  for (const key of SHOP_KEYS) if (typeof record.server?.[key] === "string") own[key] = record.server[key];
  // A shop with no extra addresses has none: the placeholder test addresses are for a server with no record at all.
  if (own.SHOP_EXTRA_ORIGINS === undefined) own.SHOP_EXTRA_ORIGINS = "";
  const config = readShopConfig({ ...shared, ...own, SHOP_OWNER_EMAIL: typeof record.ownerEmail === "string" ? record.ownerEmail : "", SHOP_ID: shopId });
  // A record with no owner address has no owner: never the placeholder address.
  return Object.freeze({ ...config, ownerEmail: email(record.ownerEmail) });
}

const baseConfig = readShopConfig(process.env);
// The settings of the shop this code is running for (shopScope.js runInShop), or the server's own outside any shop.
// A live view, so code that reads shopConfig.ownerEmail when it runs always gets the current shop's owner.
const currentConfig = () => require("./shopScope").currentShop()?.config || baseConfig;
const shopConfig = new Proxy({}, {
  get: (_, prop) => currentConfig()[prop],
  has: (_, prop) => prop in currentConfig(),
  ownKeys: () => Reflect.ownKeys(currentConfig()),
  getOwnPropertyDescriptor: (_, prop) => (prop in currentConfig() ? { value: currentConfig()[prop], enumerable: true, configurable: true, writable: false } : undefined),
  set: () => false,
});

module.exports = { PLACEHOLDER, SHOP_KEYS, readShopConfig, configForShop, shopConfig, baseConfig, paymentProviderOf, paymentModeOf, functionLink };
