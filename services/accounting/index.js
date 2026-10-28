// The bookkeeping service, put together from its environment (config.js) and the clients it is handed. The function
// that hosts it (platform project, not built yet) calls this once, routes requests to `handleAccounting` (http.js) and
// runs `nightly()` once a night.
import { readAccountingConfig } from "./config.js";
import { createAccountingService } from "./accounting.js";
import { createQuickBooksApi } from "./quickbooksApi.js";

export { handleAccounting } from "./http.js";

/**
 * @param {object} deps
 * @param {object} deps.env the service's environment (process.env); the only place the QuickBooks keys are read
 * @param {typeof fetch} deps.fetch
 * @param {object} deps.registry deps.auditLog deps.connections deps.states deps.sent (accounting.js has the shapes;
 *   connections, states and sent are platform-project collections in the real service)
 * @param {Function} [deps.notifyOwner] emails the press's owner (services/email)
 */
export function createAccountingFromEnv({ env, fetch, registry, auditLog, connections, states, sent, notifyOwner = null, now }) {
  const config = readAccountingConfig(env);
  return createAccountingService({
    qbo: createQuickBooksApi({ fetch, apps: config.apps, redirectUrl: config.redirectUrl, now }),
    registry, auditLog, connections, states, sent, notifyOwner, config, now,
  });
}
