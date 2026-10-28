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
//   SHOP_FUNCTIONS_REGION where the shop's server code runs (the shop profile's functionsRegion; the deploy writes it
//                        from public/shop-profile.js). Every function deploys there (index.js setGlobalOptions), and
//                        links to them (the Stripe webhook, e-book downloads) name it. Unset keeps us-central1
//   SHOP_TEST_SHOP       "true" only on the platform's own test shop (docs/test-shop.md): its sandbox checkouts hold
//                        stock like live ones, so the release check covers the hold. Anything else, or unset, is a
//                        normal shop. Set by the platform, never by the shop owner
//   SHOP_STOCKROOM_DATABASE the stockroom's named Firestore database in this project (plan 1.21; the profile's
//                        stockroom.firestoreDatabase). The inventory app link reads and writes there
//                        (inventoryLinkStore.js). Unset keeps "stockroom", the name setup gives every shop
//   PLATFORM_EMAIL_URL   the platform email service's shop door (https). Set: when the shop hasn't connected its own
//                        Gmail (or Gmail refuses a send) its emails go through the platform's shared sender, with the
//                        shop's name and replies to the shop; Resend keys in the shop are no longer used. Unset: the
//                        shop's own Resend key, as before. The shop proves who it is with PLATFORM_SERVICE_KEY, read
//                        at send time (email/platformSender.js), never from this file's frozen config

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

/** The shop's server settings from `env` (process.env in the functions), each one checked on its own. */
function readShopConfig(env = {}) {
  const project = text(env.GCLOUD_PROJECT) || text(env.GOOGLE_CLOUD_PROJECT) || PLACEHOLDER.project;
  // firebaseapp.com is deliberately absent: the site sends visitors from there to web.app (scripts/canonicalHost.mjs)
  // instead of serving checkout twice.
  const hosted = PROJECT.test(project) ? `https://${project}.web.app` : "";
  const region = REGION.test(text(env.SHOP_FUNCTIONS_REGION)) ? text(env.SHOP_FUNCTIONS_REGION) : PLACEHOLDER.region;
  const functionsProject = PROJECT.test(project) ? project : PLACEHOLDER.project;
  const siteUrl = origin(env.SHOP_SITE_URL) || origin(env.SITE_URL) || hosted || PLACEHOLDER.siteUrl;
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
    paymentsServiceUrl: paymentsServiceUrlOf(paymentModeOf(env.SHOP_PAYMENT_MODE), env.SHOP_PAYMENTS_SERVICE_URL),
    testShop: text(env.SHOP_TEST_SHOP).toLowerCase() === "true",
    stockroomDatabase: DATABASE_ID.test(text(env.SHOP_STOCKROOM_DATABASE)) ? text(env.SHOP_STOCKROOM_DATABASE) : PLACEHOLDER.stockroomDatabase,
    platformEmailUrl: /^https:\/\/[^\s"'<>]+$/.test(text(env.PLATFORM_EMAIL_URL)) ? text(env.PLATFORM_EMAIL_URL) : "",
    allowedOrigins: Object.freeze([...new Set([...LOCAL_ORIGINS, ...extraOrigins, ...(hosted ? [hosted] : []), siteUrl, ...www])]),
    project: functionsProject,
    region,
    // The public address of one of this shop's functions, the same form the shop's pages call (src/app/lib/functionsBase.ts).
    functionsBase: `https://${region}-${functionsProject}.cloudfunctions.net`,
  });
}

/** The address of one of this shop's Cloud Functions. */
const functionLink = (config, name) => `${config.functionsBase}/${name}`;

const shopConfig = readShopConfig(process.env);

module.exports = { PLACEHOLDER, readShopConfig, shopConfig, paymentProviderOf, paymentModeOf, functionLink };
