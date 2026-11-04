// A refund the payment company refused never leaves the order's refund claim behind (index.js refundOrder).
import { describe, expect, it } from "vitest";
const { httpStatus, refundRefused } = require("./refundRefusal");

describe("refund refusals", () => {
  it("counts Stripe's own errors and the platform payment service's answers alike", () => {
    expect(refundRefused({ type: "StripeInvalidRequestError" })).toBe(true);
    // payments/platform.js serviceError: Stripe's API type and an HTTP statusCode.
    expect(refundRefused({ type: "invalid_request_error", statusCode: 400 })).toBe(true);
    expect(refundRefused({ type: "square_error", statusCode: 400 })).toBe(true);
    expect(refundRefused({ type: "platform_error", statusCode: 422 })).toBe(true);
    expect(httpStatus({ statusCode: 400 })).toBe(400);
  });

  it("keeps the claim when the refund may still go through", () => {
    expect(refundRefused({ type: "api_connection_error", statusCode: 502 })).toBe(false);
    expect(refundRefused({ type: "api_error", statusCode: 500 })).toBe(false);
    expect(refundRefused({ type: "idempotency_error", statusCode: 409 })).toBe(false);
    expect(refundRefused(new Error("socket hang up"))).toBe(false);
  });
});
