// The social service's settings, from its own environment only (Secret Manager in the platform project). The platform's
// Meta, Pinterest and TikTok app keys are read here and nowhere else; no shop project ever holds them. **Off unless
// SOCIAL_ENABLED is "true"** (code plan 27.9 waits on Julian: each network's developer app and its review).
//
//   SOCIAL_ENABLED                          "true" turns social channels on for every shop
//   META_APP_ID / META_APP_SECRET           the Meta app (Facebook Login for Business): Facebook & Instagram
//   META_GRAPH_VERSION                      optional, e.g. "v23.0" (endpoints.js has the default)
//   PINTEREST_APP_ID / PINTEREST_APP_SECRET the Pinterest app
//   TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET the TikTok app
//   SOCIAL_REDIRECT_BASE                    this service's https address; each network's sign-in answer comes back to
//                                           <base>/<network>/oauth, listed exactly so in that network's app
//   SOCIAL_TOKEN_KEY                        32 random bytes in Base64: seals each press's tokens (../payments/tokenSeal.js)
//
// A network whose two keys are missing is simply not offered; one key without the other is a mistake and stops start-up.
import { sealingKey } from "../payments/tokenSeal.js";

const text = (value) => (typeof value === "string" ? value.trim() : "");

const KEYS = Object.freeze({
  meta: ["META_APP_ID", "META_APP_SECRET"],
  pinterest: ["PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
});

function app(env, network) {
  const [idName, secretName] = KEYS[network];
  const id = text(env[idName]);
  const secret = text(env[secretName]);
  if (!id && !secret) return null;
  if (!id || !secret) throw new Error(`${idName} and ${secretName} go together`);
  return Object.freeze({ id, secret });
}

/** The secrets the platform's server reads (server/deploy.js): every one optional, so the server starts without them. */
export const SOCIAL_SECRETS = Object.freeze([
  { env: "META_APP_ID", secret: "meta-app-id", api: true, jobs: true },
  { env: "META_APP_SECRET", secret: "meta-app-secret", api: true, jobs: true },
  { env: "PINTEREST_APP_ID", secret: "pinterest-app-id", api: true, jobs: true },
  { env: "PINTEREST_APP_SECRET", secret: "pinterest-app-secret", api: true, jobs: true },
  { env: "TIKTOK_CLIENT_KEY", secret: "tiktok-client-key", api: true, jobs: true },
  { env: "TIKTOK_CLIENT_SECRET", secret: "tiktok-client-secret", api: true, jobs: true },
  { env: "SOCIAL_TOKEN_KEY", secret: "social-token-key", api: true, jobs: true },
]);

export function readSocialConfig(env = {}) {
  const enabled = text(env.SOCIAL_ENABLED).toLowerCase() === "true";
  const apps = Object.freeze({ meta: app(env, "meta"), pinterest: app(env, "pinterest"), tiktok: app(env, "tiktok") });
  const any = Object.values(apps).some(Boolean);
  const base = text(env.SOCIAL_REDIRECT_BASE).replace(/\/+$/, "");
  if (base && !/^https:\/\/[^/\s]+(\/\S*)?$/.test(base)) throw new Error("SOCIAL_REDIRECT_BASE must be an https address");
  const keyText = text(env.SOCIAL_TOKEN_KEY);
  if (any && !keyText) throw new Error("SOCIAL_TOKEN_KEY is needed with social app keys");
  if (any && !base) throw new Error("SOCIAL_REDIRECT_BASE is needed with social app keys");
  const metaVersion = text(env.META_GRAPH_VERSION);
  if (metaVersion && !/^v\d{1,3}\.\d$/.test(metaVersion)) throw new Error("META_GRAPH_VERSION looks like v23.0");
  return Object.freeze({
    enabled,
    apps,
    metaVersion: metaVersion || null,
    redirectUrl: (network) => (base ? `${base}/${network}/oauth` : null),
    tokenKey: keyText ? sealingKey(keyText, "SOCIAL_TOKEN_KEY") : null,
  });
}
