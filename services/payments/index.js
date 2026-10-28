// The payment service, put together from its environment (config.js) and the clients it is handed. The function that
// hosts it (platform project, not built yet) calls this once and routes requests to `handlePayments` (http.js).
import { readServiceConfig } from "./config.js";
import { createStripeApi } from "./stripeApi.js";
import { createPaymentService, httpDeliver } from "./service.js";

export { handlePayments } from "./http.js";
export { feeFor, feeForShop, readFeeSettings } from "./fees.js";

/**
 * @param {object} deps
 * @param {object} deps.env the service's environment (process.env); the only place the platform keys are read
 * @param {typeof fetch} deps.fetch for Stripe and for passing events on to shops
 * @param {object} deps.registry the shop registry; deps.auditLog each shop's audit log; deps.accounts the service's
 *   record of the accounts it made (service.js has the shapes)
 */
export function createPaymentsFromEnv({ env, fetch, registry, auditLog, accounts, now }) {
  const config = readServiceConfig(env);
  return createPaymentService({
    stripe: createStripeApi({ fetch, keys: config.keys }),
    registry,
    auditLog,
    accounts,
    deliver: httpDeliver(fetch),
    config,
    now,
  });
}

/** The shop maker's Stripe client (setup/payments.js `providers.stripe`), backed by the service. */
export const setupClient = (service) => ({
  findAccount: (shopId) => service.findAccount(shopId),
  createAccount: (shopId, details) => service.createAccount(shopId, details),
});
