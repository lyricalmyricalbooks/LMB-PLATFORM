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
//   SHOP_FUNCTIONS_REGION where the shop's server code runs (the shop profile's functionsRegion; the deploy writes it
//                        from public/shop-profile.js). Every function deploys there (index.js setGlobalOptions), and
//                        links to them (the Stripe webhook, e-book downloads) name it. Unset keeps us-central1
//   SHOP_TEST_SHOP       "true" only on the platform's own test shop (docs/test-shop.md): its sandbox checkouts hold
//                        stock like live ones, so the release check covers the hold. Anything else, or unset, is a
//                        normal shop. Set by the platform, never by the shop owner
//   PLATFORM_EMAIL_URL   the platform email service's shop door (https). Set: when the shop hasn't connected its own
//                        Gmail (or Gmail refuses a send) its emails go through the platform's shared sender, with the
//                        shop's name and replies to the shop; Resend keys in the shop are no longer used. Unset: the
//                        shop's own Resend key, as before. The shop proves who it is with PLATFORM_SERVICE_KEY, read
//                        at send time (email/platformSender.js), never from this file's frozen config

const { PROVIDER_NAMES, DEFAULT_PROVIDER } = require("./payments");

const PLACEHOLDER = Object.freeze({
  ownerEmail: "owner@example.com",
  senderName: "Your Press",
  senderEmail: "orders@example.com",
  siteUrl: "https://lmb-test-shop.web.app",
  extraOrigins: Object.freeze(["https://yourpress.github.io", "https://yourpress.example", "https://www.yourpress.example"]),
  project: "lmb-test-shop",
  paymentProvider: DEFAULT_PROVIDER,
  region: "us-central1",
  testShop: false,
});

// A Cloud Functions region name: northamerica-northeast1, us-central1, europe-west2…
const REGION = /^[a-z]+-[a-z]+[0-9]{1,2}$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

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
    testShop: text(env.SHOP_TEST_SHOP).toLowerCase() === "true",
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

module.exports = { PLACEHOLDER, readShopConfig, shopConfig, paymentProviderOf, functionLink };
