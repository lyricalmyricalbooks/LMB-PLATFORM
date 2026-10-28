// A press's Square tokens are kept sealed (AES-256-GCM), as Square asks ("OAuth tokens should be encrypted and stored on
// a secure server"). The sealing key is SQUARE_TOKEN_KEY in the service's environment (32 bytes, Base64); the store only
// ever holds the sealed text. The bookkeeping service (services/accounting) seals presses' QuickBooks tokens the same
// way, with its own key. Each seal is bound to its shop and mode, so a sealed token copied to another shop's
// record won't open.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** The sealing key from its Base64 text; throws unless it is exactly 32 bytes. `name` is the setting, for the message. */
export function sealingKey(text, name = "SQUARE_TOKEN_KEY") {
  const key = Buffer.from(String(text ?? "").trim(), "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, written in Base64`);
  return key;
}

/** Seals `value` (any JSON) for one shop and mode. */
export function seal(key, bound, value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(bound, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

/** Opens a sealed value; throws when it was changed, made with another key, or for another shop or mode. */
export function unseal(key, bound, sealed) {
  const [version, iv, tag, body] = String(sealed ?? "").split(".");
  if (version !== VERSION || !iv || !tag || !body) throw new Error("not a sealed token");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(bound, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const text = Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(text);
}
