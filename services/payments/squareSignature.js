// Square's webhook signature (https://developer.squareup.com/docs/webhooks/step3validate): the
// `x-square-hmacsha256-signature` header is the Base64 HMAC-SHA256, keyed with the subscription's signature key, of the
// subscription's notification URL followed by the raw body (Square staff, developer forums, 15 October 2026). The URL
// must be the one configured in Square exactly, so it comes from the service's settings, never from the request.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SQUARE_SIGNATURE_HEADER = "x-square-hmacsha256-signature";

/** The header value Square sends for this body (tests use it to sign their pretend deliveries). */
export function squareSignature(signatureKey, notificationUrl, rawBody) {
  return createHmac("sha256", signatureKey).update(`${notificationUrl}${rawBody}`, "utf8").digest("base64");
}

/** Does the header match one of the subscription's keys? Constant-time comparison, as Square asks. */
export function verifySquareSignature(signatureKeys, notificationUrl, rawBody, header) {
  if (typeof header !== "string" || !header || typeof notificationUrl !== "string" || !notificationUrl) return false;
  const given = Buffer.from(header, "utf8");
  return signatureKeys.some((key) => {
    const expected = Buffer.from(squareSignature(key, notificationUrl, rawBody), "utf8");
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
