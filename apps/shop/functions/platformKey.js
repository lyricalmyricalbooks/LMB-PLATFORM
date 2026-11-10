// The shop's key for the platform's services (code plan 2.2): the payment service (payments/platform.js) and the email
// service (email/platformSender.js) take `X-Shop-Id` + `Authorization: Bearer <key>`. The key is the Functions secret
// PLATFORM_SERVICE_KEY, written by the platform's setup (step 8, LMB-PLATFORM setup/serviceKey.js) before the server
// code is deployed; the platform keeps only its hash.
//
// A Functions secret reaches a function only when the function declares it, and a function's own `secrets` list
// replaces the global one. So on a shop that uses the platform's services, the key is added to the global options AND
// to every function's own list (`withPlatformKey`, checked by platformKey.test.js). A shop on its own keys declares
// nothing, so its deploy never asks for a secret it doesn't have.

const { defineSecret } = require("firebase-functions/params");
const { shopConfig } = require("./shopConfig");

const PLATFORM_SERVICE_KEY = defineSecret("PLATFORM_SERVICE_KEY");

/** Does this shop call the platform's services (payments through the platform, or the platform's email sender)? */
const usesPlatformServices = (config = shopConfig) => config.paymentMode === "platform" || Boolean(config.platformEmailUrl) || Boolean(config.platformDomainsUrl) || Boolean(config.platformAccountingUrl) || Boolean(config.platformSocialUrl) || Boolean(config.platformAccountsUrl) || Boolean(config.platformAppsUrl);

// A shop's own provider keys. A shop on the platform's services has none of them as Functions secrets: the shared server
// is one deploy for every shop, its payments and email go through the platform, and a press's own Shippo or PayPal
// keys are kept in its own admin-only settings (adminSecrets). Declaring them would make the deploy stop for a secret
// that doesn't exist; undeclared, `.value()` reads "" and the code falls back to the shop's saved keys.
const OWN_KEYS = new Set(["RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "SHIPPO_API_TOKEN"]);

/**
 * A function's `secrets`. On a shop that uses the platform's services: the platform key added, the shop's own provider
 * keys left out. Otherwise the list as given.
 */
function withPlatformKey(secrets = [], config = shopConfig) {
  if (!usesPlatformServices(config)) return secrets;
  return [...secrets.filter((secret) => !OWN_KEYS.has(secret?.name)), PLATFORM_SERVICE_KEY];
}

/** The key, read when a call is made ("" when the function has none). */
const platformServiceKey = () => process.env.PLATFORM_SERVICE_KEY || "";

module.exports = { OWN_KEYS, PLATFORM_SERVICE_KEY, usesPlatformServices, withPlatformKey, platformServiceKey };
