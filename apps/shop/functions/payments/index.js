// The shop's one door to its card payment provider (code plans 1.11–1.12). Callers ask this module; only the provider
// file talks to the provider. Each shop chooses its provider (shopConfig.paymentProvider, from SHOP_PAYMENT_PROVIDER in
// the shop's functions/.env.<project id>; default "stripe"). Stripe, or Square (code plan 2.2b; through the platform only).
//
// Each shop also chooses a mode (shopConfig.paymentMode, SHOP_PAYMENT_MODE; code plan 2.2): "own" (default) uses the
// shop's own keys; "platform" sends every call through the platform's payment service on the press's connected account
// (platform.js), with no provider key in the shop at all. The interface is the same in both modes, except that in
// platform mode verifyWebhookEvent returns a promise (it fetches the event again); callers await it.
//
// The provider interface: every provider returns an object with these (payments.test.js checks each one has them).
// "account" is the opaque value clientForMode returns; callers only hand it back.
//
//   id                                              the provider's name ("stripe")
//   testMode()                                      is the shop taking sandbox payments now?
//   readKeys()                                      the shop's keys for both modes, read once (a sweep passes them on)
//   clientForMode(mode, accountId)                  an account to act in, for an order's mode ("test"/"live")
//
//   Look up a payment
//   findOrderPayment(orderId, order, ids, keys?)    a saved payment of this order, from whichever mode holds it
//   readAttempt(account, ids, found)                an unpaid attempt's payment, written into `found` as read
//   stopAttempt(account, { intent, session })       best effort: stop an attempt the shopper may still finish
//
//   Reversal check and refund
//   checkReversal(orderId, order, { keys }, apply)  refunds/disputes made at the provider, handed to `apply`
//   refund({ mode, accountId, paymentIntentId, amountMinor, metadata, idempotencyKey, onCalling })
//
//   Webhook
//   webhookClient()                                 the client the webhook verifies deliveries with
//   verifyWebhookEvent(client, rawBody, signature, secrets)
//
//   Checkout
//   forCheckout(settings)                           { settlePreviousIntent, createCardIntent, createCheckoutSession }
//
//   Admin (Settings › Payments)
//   deployedLiveKey(), checkKey(key), webhookEndpoints(), registerPaymentDomain(domainName)
//
//   Fees and payouts (code plan 7.10; orderMoney.js writes them on the order)
//   paymentMoney(orderId, order, { keys? })          { parts: { charge?, <refund id>? } } as the provider has them now
//   payoutMoney({ mode, payoutId, accountId?, arrivalDate? })   { payout: { id, date }, lines: [{ paymentId, key, part }] }
//
// The order bookkeeping (what a payment, refund or reversal means for an order) stays with the callers. A new provider
// is one file beside stripe.js implementing the same names, added to PROVIDERS below.

const { createStripeProvider } = require("./stripe");
const { createSquareProvider } = require("./square");
const { createPlatformAccess } = require("./platform");

const PROVIDERS = Object.freeze({ stripe: createStripeProvider, square: createSquareProvider });
const PROVIDER_NAMES = Object.freeze(Object.keys(PROVIDERS));
const DEFAULT_PROVIDER = "stripe";
const MODES = Object.freeze(["own", "platform"]);
const DEFAULT_MODE = "own";

const INTERFACE = Object.freeze([
  "testMode", "readKeys", "clientForMode", "findOrderPayment", "readAttempt", "stopAttempt", "checkReversal", "refund",
  "webhookClient", "verifyWebhookEvent", "forCheckout", "deployedLiveKey", "checkKey", "webhookEndpoints", "registerPaymentDomain",
  "paymentMoney", "payoutMoney",
]);

/**
 * The payments door for one shop.
 * @param {object} deps
 * @param {string} [deps.provider] the shop's provider (shopConfig.paymentProvider); default "stripe"
 * @param {object} deps.db Firestore
 * @param {(id: string) => Promise<object>} deps.readAdminSecret reads adminSecrets/<id>, {} when missing or unreadable
 * @param {string} [deps.mode] "own" (default) or "platform" (shopConfig.paymentMode)
 * @param {{ url: string, shopId: string, serviceKey: () => string, fetch?: typeof fetch }} [deps.service] platform mode:
 *   the payment service's address (shopConfig.paymentsServiceUrl), this shop's id in the platform registry
 *   (shopConfig.project) and its key (platformKey.js)
 * Stripe also takes `Stripe` (the lazy constructor) and `liveSecretKey` (the deployed STRIPE_SECRET_KEY secret).
 */
function createPayments({ provider = DEFAULT_PROVIDER, mode = DEFAULT_MODE, service = null, ...deps }) {
  const make = PROVIDERS[provider];
  if (!make) throw new Error(`Payment provider "${provider}" is not available. Choose one of: ${PROVIDER_NAMES.join(", ")}.`);
  if (!MODES.includes(mode)) throw new Error(`Payment mode "${mode}" is not available. Choose one of: ${MODES.join(", ")}.`);
  const platform = mode === "platform"
    ? createPlatformAccess({ fetch: service?.fetch || globalThis.fetch, url: service?.url, shopId: service?.shopId, serviceKey: service?.serviceKey })
    : null;
  const impl = make({ ...deps, platform });
  const missing = INTERFACE.filter(name => typeof impl[name] !== "function");
  if (missing.length) throw new Error(`Payment provider "${provider}" is missing: ${missing.join(", ")}.`);
  // `account`: the press's account on the platform (platform.js platformAccount); null with the shop's own keys.
  return Object.freeze({ provider: impl.id, mode, account: platform ? platform.account : null, ...Object.fromEntries(INTERFACE.map(name => [name, impl[name]])) });
}

/**
 * The name a press or shopper sees for the company taking the shop's card payments (code plan 5.2): "Square" for a
 * Square shop, "Stripe" otherwise. The shop's admin and storefront use the same rule (src/lib/shopProfile.ts
 * `providerName`, from the shop profile's `payments`, which platform setup writes with the same provider).
 */
function providerName(provider) {
  return provider === "square" ? "Square" : "Stripe";
}

module.exports = { createPayments, providerName, PROVIDER_NAMES, DEFAULT_PROVIDER, MODES, DEFAULT_MODE, INTERFACE };
