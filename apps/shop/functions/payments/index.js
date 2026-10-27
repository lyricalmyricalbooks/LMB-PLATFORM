// The shop's one door to its card payment provider (code plans 1.11–1.12). Callers ask this module; only the provider
// file talks to the provider. Each shop chooses its provider (shopConfig.paymentProvider, from SHOP_PAYMENT_PROVIDER in
// the shop's functions/.env.<project id>; default "stripe"). Stripe is the only provider so far.
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
// The order bookkeeping (what a payment, refund or reversal means for an order) stays with the callers. A new provider
// is one file beside stripe.js implementing the same names, added to PROVIDERS below.

const { createStripeProvider } = require("./stripe");

const PROVIDERS = Object.freeze({ stripe: createStripeProvider });
const PROVIDER_NAMES = Object.freeze(Object.keys(PROVIDERS));
const DEFAULT_PROVIDER = "stripe";

const INTERFACE = Object.freeze([
  "testMode", "readKeys", "clientForMode", "findOrderPayment", "readAttempt", "stopAttempt", "checkReversal", "refund",
  "webhookClient", "verifyWebhookEvent", "forCheckout", "deployedLiveKey", "checkKey", "webhookEndpoints", "registerPaymentDomain",
]);

/**
 * The payments door for one shop.
 * @param {object} deps
 * @param {string} [deps.provider] the shop's provider (shopConfig.paymentProvider); default "stripe"
 * @param {object} deps.db Firestore
 * @param {(id: string) => Promise<object>} deps.readAdminSecret reads adminSecrets/<id>, {} when missing or unreadable
 * Stripe also takes `Stripe` (the lazy constructor) and `liveSecretKey` (the deployed STRIPE_SECRET_KEY secret).
 */
function createPayments({ provider = DEFAULT_PROVIDER, ...deps }) {
  const make = PROVIDERS[provider];
  if (!make) throw new Error(`Payment provider "${provider}" is not available. Choose one of: ${PROVIDER_NAMES.join(", ")}.`);
  const impl = make(deps);
  const missing = INTERFACE.filter(name => typeof impl[name] !== "function");
  if (missing.length) throw new Error(`Payment provider "${provider}" is missing: ${missing.join(", ")}.`);
  return Object.freeze({ provider: impl.id, ...Object.fromEntries(INTERFACE.map(name => [name, impl[name]])) });
}

module.exports = { createPayments, PROVIDER_NAMES, DEFAULT_PROVIDER, INTERFACE };
