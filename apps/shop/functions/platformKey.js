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
const usesPlatformServices = (config = shopConfig) => config.paymentMode === "platform" || Boolean(config.platformEmailUrl) || Boolean(config.platformDomainsUrl);

/** A function's `secrets`, with the platform key added on a shop that uses the platform's services. */
function withPlatformKey(secrets = [], config = shopConfig) {
  return usesPlatformServices(config) ? [...secrets, PLATFORM_SERVICE_KEY] : secrets;
}

/** The key, read when a call is made ("" when the function has none). */
const platformServiceKey = () => process.env.PLATFORM_SERVICE_KEY || "";

module.exports = { PLATFORM_SERVICE_KEY, usesPlatformServices, withPlatformKey, platformServiceKey };
