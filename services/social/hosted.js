// The social service as the hosted server runs it (server/world.js, at /api/social): the real stores in the platform's
// database, and each network's sign-in answer back to the platform's own address.
//
//   hostedSocial({ env, fetch, platform, registry, auditLog, now, log })
//     -> { service, handle(request) }, or null when the social settings are broken (the door then answers "not
//        switched on" and every shop's Sales channels page shows the by-hand steps, as before)
//
// Without the networks' keys or SOCIAL_ENABLED the service is still built: `social.status` answers that it is off and the
// shop shows the by-hand steps, so adding the keys and turning it on needs no other change.
//
// Stores, in the platform project's database (never a shop's folder: they hold the networks' sealed tokens):
//   socialConnections/<shop id>~<network>   each shop's connection to one network, sealed tokens and its places
//   socialStates/<state>                    one-use sign-in states, 15 minutes each
//   socialSent/<key>                        each post in each place, claimed before the network is called
import { createSocialFromEnv, handleSocial } from "./index.js";
import { NETWORKS } from "./endpoints.js";

const SHOP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const STATE = /^[0-9a-f]{48}$/;
const connectionPath = (shopId, network) => {
  if (!SHOP_ID.test(String(shopId ?? ""))) throw new Error("not a shop id");
  if (!NETWORKS.includes(network)) throw new Error("not a network");
  return `socialConnections/${shopId}~${network}`;
};
// The key is "<shop>/<post>/<place>": one document id, so its slashes are encoded.
const sentPath = (key) => `socialSent/${encodeURIComponent(String(key))}`;

/** The three stores social.js asks for, in the platform's database. */
export function socialStores(platform) {
  return {
    connections: {
      get: (shopId, network) => platform.get(connectionPath(shopId, network)),
      // The shop and network are kept on the record too, so listFor() can find a shop's connections.
      set: (shopId, network, record) => platform.set(connectionPath(shopId, network), { ...record, shopId, network }),
      listFor: async (shopId) => {
        if (!SHOP_ID.test(String(shopId ?? ""))) throw new Error("not a shop id");
        return (await platform.query("socialConnections", { where: [["shopId", "==", shopId]], limit: 10 })).map((row) => row.data);
      },
    },
    states: {
      put: (state, record) => {
        if (!STATE.test(state)) throw new Error("not a sign-in state");
        return platform.set(`socialStates/${state}`, record);
      },
      // One use: read and removed together, so a network's answer can't be replayed.
      take: (state) => (STATE.test(String(state)) ? platform.transaction(async (tx) => {
        const found = await tx.get(`socialStates/${state}`);
        if (found) tx.remove(`socialStates/${state}`);
        return found;
      }) : Promise.resolve(null)),
    },
    sent: {
      get: (key) => platform.get(sentPath(key)),
      put: (key, record) => platform.set(sentPath(key), record),
      // Atomic: a post already out, or being sent since `staleBefore`, is not claimed again.
      claim: (key, record, { staleBefore }) => platform.transaction(async (tx) => {
        const existing = (await tx.get(sentPath(key))) ?? null;
        if (existing && (existing.state === "posted" || (existing.state === "sending" && existing.at > staleBefore))) return { claimed: false, existing };
        tx.set(sentPath(key), record);
        return { claimed: true, existing };
      }),
    },
  };
}

/**
 * The settings with the platform's own address filled in: each network sends the press back to
 * <PLATFORM_URL>/api/social/<network>/oauth unless SOCIAL_REDIRECT_BASE says otherwise.
 */
export function socialEnv(env = {}) {
  const base = String(env.PLATFORM_URL ?? "").trim().replace(/\/+$/, "");
  const redirect = String(env.SOCIAL_REDIRECT_BASE ?? "").trim() || (/^https:\/\//.test(base) ? `${base}/api/social` : "");
  return { ...env, SOCIAL_REDIRECT_BASE: redirect };
}

export function hostedSocial({ env = {}, fetch, platform, registry, auditLog, now = () => Date.now(), log = console.error }) {
  let service;
  try {
    service = createSocialFromEnv({ env: socialEnv(env), fetch, registry, auditLog, ...socialStores(platform), now });
  } catch (error) {
    log(`Social channels are off: ${error.message}`);
    return null;
  }
  return { service, handle: (request) => handleSocial(request, { service }) };
}
