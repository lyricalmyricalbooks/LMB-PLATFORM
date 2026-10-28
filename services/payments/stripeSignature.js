// Stripe's webhook signature (https://docs.stripe.com/webhooks, "verify signatures manually"): the `Stripe-Signature`
// header is `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`, keyed with the endpoint's signing secret.
// Checked by hand with node:crypto, since the service uses no Stripe package.
import { createHmac, timingSafeEqual } from "node:crypto";

export const TOLERANCE_SECONDS = 300;

const hmac = (secret, text) => createHmac("sha256", secret).update(text, "utf8").digest("hex");

/** The header Stripe would send for `payload` at `timestamp` (unix seconds); the tests sign their events with it. */
export function signatureHeader(secret, payload, timestamp) {
  return `t=${timestamp},v1=${hmac(secret, `${timestamp}.${payload}`)}`;
}

/** Does `header` sign `payload` with `secret`, within the time allowed? */
export function verifySignature(secret, payload, header, { now = Date.now(), toleranceSeconds = TOLERANCE_SECONDS } = {}) {
  if (typeof header !== "string" || typeof payload !== "string" || !secret) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([name]) => name === "t")?.[1]);
  const signatures = parts.filter(([name]) => name === "v1").map(([, value]) => value ?? "");
  if (!Number.isInteger(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;
  const expected = Buffer.from(hmac(secret, `${timestamp}.${payload}`), "utf8");
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
