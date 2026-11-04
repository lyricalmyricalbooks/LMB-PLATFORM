// The social service, put together from its environment (config.js) and the stores it is handed. The function that
// hosts it (platform project, not built yet) calls this once and routes requests to `handleSocial` (http.js).
import { readSocialConfig } from "./config.js";
import { createSocialService } from "./social.js";
import { createNetworkClients } from "./networks.js";

export { handleSocial } from "./http.js";

/**
 * @param {object} deps
 * @param {object} deps.env the service's environment (process.env); the only place the networks' keys are read
 * @param {typeof fetch} deps.fetch
 * @param {object} deps.registry deps.auditLog deps.connections deps.states deps.sent (social.js has the shapes;
 *   connections, states and sent are platform-project collections in the real service)
 */
export function createSocialFromEnv({ env, fetch, registry, auditLog, connections, states, sent, now }) {
  const config = readSocialConfig(env);
  return createSocialService({ clients: createNetworkClients({ fetch, config, now }), registry, auditLog, connections, states, sent, config, now });
}
