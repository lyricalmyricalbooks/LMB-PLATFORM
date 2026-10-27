import { describe, expect, it } from "vitest";
import * as lifecycle from "./stripeLifecycle";

const checkout = (options: Record<string, unknown> = {}) => lifecycle.stripeCheckoutState({
  keyValid: true, cardState: "ready", paymentStarted: false, ...options,
} as Parameters<typeof lifecycle.stripeCheckoutState>[0]);

describe("inline-only Stripe checkout", () => {
  it("enables payment only after the actual inline fields are ready", () => {
    expect(checkout()).toEqual({ inline: true, canPay: true, canRetry: false });
    expect(checkout({ cardState: "loading" })).toEqual({ inline: true, canPay: false, canRetry: false });
  });
  it("blocks a missing or invalid browser key instead of redirecting", () => {
    expect(checkout({ keyValid: false })).toEqual({ inline: false, canPay: false, canRetry: false });
  });
  it("ignores old hosted settings and keeps the ready fields inline", () => {
    expect(checkout({ redirect: true, hostedSelected: true })).toEqual({ inline: true, canPay: true, canRetry: false });
  });
  it("offers an inline reload after loading fails before a payment attempt", () => {
    expect(checkout({ cardState: "error" })).toEqual({ inline: true, canPay: false, canRetry: true });
  });
  it("does not reload payment fields after an uncertain payment request", () => {
    expect(checkout({ cardState: "error", paymentStarted: true })).toEqual({ inline: true, canPay: false, canRetry: false });
  });
});
