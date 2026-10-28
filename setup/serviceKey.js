// Each shop's key for the platform's services (code plan 2.2). The payment service and the email service take
// `X-Shop-Id` + `Authorization: Bearer <key>` and check the key against `serviceKeyHash` in the shop's registry row
// (services/email/http.js). The key itself lives only in the shop's own project, as the Functions secret
// PLATFORM_SERVICE_KEY, which the shop's server code reads (apps/shop functions/platformKey.js); the registry keeps
// only its SHA-256.
//
// Written by step 8, before the server code is deployed (the deploy pins the secret's latest version). Safe to re-run,
// and never rotates a key the shop already has:
//
//   the secret exists, its hash is in the registry    kept, nothing written
//   the secret exists, the registry lacks its hash    the registry takes its hash (a run that stopped halfway)
//   no secret                                         a new key is made, written to the secret first, then its hash
//                                                     to the registry, so the registry never names a key the shop lacks
//
// `google.secrets`: latest(projectId, name) -> value | null; add(projectId, name, value) adds a version, creating the
// secret when it is missing. Neither the key nor the platform's own keys are ever logged.
import { randomBytes } from "node:crypto";
import { hashServiceKey, serviceKeyMatches } from "../services/email/http.js";

export const SERVICE_KEY_SECRET = "PLATFORM_SERVICE_KEY";

/** Does the shop's secret hold the key whose hash the registry keeps? */
export async function hasServiceKey({ google, registry }, shopId) {
  const key = await google.secrets.latest(shopId, SERVICE_KEY_SECRET);
  const row = await registry.getShop(shopId);
  return serviceKeyMatches(key, row?.serviceKeyHash);
}

/** Makes sure the shop has its key and the registry its hash. Returns what it did: "kept", "recorded" or "created". */
export async function ensureServiceKey({ google, registry }, shopId) {
  let key = await google.secrets.latest(shopId, SERVICE_KEY_SECRET);
  const row = await registry.getShop(shopId);
  if (serviceKeyMatches(key, row?.serviceKeyHash)) return "kept";
  let outcome = "recorded";
  if (typeof key !== "string" || key.length < 32) {
    key = randomBytes(32).toString("hex");
    await google.secrets.add(shopId, SERVICE_KEY_SECRET, key);
    outcome = "created";
  }
  await registry.updateShop(shopId, { serviceKeyHash: hashServiceKey(key) });
  return outcome;
}
