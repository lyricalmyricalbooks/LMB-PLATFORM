// Did the payment company certainly take no refund? Then the order's refund claim comes off (index.js refundOrder),
// so a refused refund never leaves the order stuck with a pending refund that blocks returns and exchanges.
// Stripe's own library names its errors by class (StripeInvalidRequestError); the platform's payment service
// (payments/platform.js) passes on Stripe's API type (invalid_request_error) and an HTTP `statusCode`, not `status`.
"use strict";

const DEFINITE_REFUSALS = Object.freeze([
  "StripeInvalidRequestError", "StripeCardError", "StripePermissionError", "StripeAuthenticationError",
  "invalid_request_error", "card_error", "permission_error", "authentication_error",
]);

const httpStatus = (err) => Number(err?.status ?? err?.statusCode) || 0;

/** True when the refund was refused for good. A 409 (a refund already under way, say) or an idempotency clash never counts. */
function refundRefused(err) {
  // An idempotency clash is a retry of a refund that may have gone through.
  if (err?.type === "idempotency_error" || /idempotenc/i.test(String(err?.code || ""))) return false;
  if (DEFINITE_REFUSALS.includes(err?.type)) return true;
  const status = httpStatus(err);
  return status >= 400 && status < 500 && status !== 409;
}

module.exports = { DEFINITE_REFUSALS, httpStatus, refundRefused };
