// Each shop's key for the platform's services (code plan 2.2): the payment service and the email service take
// `X-Shop-Id` + `Authorization: Bearer <key>` and check the key against `serviceKeyHash` in the shop's registry row.
// The key itself lives only in the shop's own database, at `platformSecrets/service` (`key`), which the shop's rules
// let no browser read or write; the shop's server code reads it there (apps/shop functions/payments/platform.js).
//
// Written by step 8 with the rest of the server details. Safe to re-run: a key whose hash the registry already holds
// is kept; anything else (no key, no hash, or a mismatch after a run stopped halfway) gets a fresh key, written to the
// shop first and to the registry second, so the registry never names a key the shop doesn't have.
import { randomBytes } from "node:crypto";
import { hashServiceKey, serviceKeyMatches } from "../services/email/http.js";

export const SERVICE_KEY_PATH = "platformSecrets/service";

/** Does the shop hold the key whose hash the registry keeps? */
export async function hasServiceKey({ shopData, registry }, shopId) {
  const stored = await shopData.get(shopId, SERVICE_KEY_PATH);
  const row = await registry.getShop(shopId);
  return serviceKeyMatches(stored?.key, row?.serviceKeyHash);
}

/** Gives the shop a service key unless it already has the registry's one. Returns true when a new key was made. */
export async function ensureServiceKey({ shopData, registry, now = () => new Date() }, shopId) {
  if (await hasServiceKey({ shopData, registry }, shopId)) return false;
  const key = randomBytes(32).toString("hex");
  await shopData.set(shopId, SERVICE_KEY_PATH, { key, writtenAt: now().toISOString(), writtenBy: "setup" });
  await registry.updateShop(shopId, { serviceKeyHash: hashServiceKey(key) });
  return true;
}
