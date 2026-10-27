import { describe, expect, it } from "vitest";
import { createElementCleanup, isStripePublishableKey } from "./stripeLifecycle";

describe("Stripe recovery", () => {
  it("allows navigation after Stripe has already destroyed an element", () => {
    const cleanup = createElementCleanup({destroy() {throw new Error("This Element has already been destroyed.");}});
    expect(() => cleanup()).not.toThrow();
    expect(() => cleanup()).not.toThrow();
  });
  it("releases an element only once", () => {
    let destroyed = 0;
    const cleanup = createElementCleanup({destroy(){destroyed++;}});
    cleanup(); cleanup();
    expect(destroyed).toBe(1);
  });
  it("rejects placeholder, secret, and wrong-mode keys before loading the card form", () => {
    expect(isStripePublishableKey("pk_test_placeholder_key",true)).toBe(false);
    expect(isStripePublishableKey("sk_test_abcdefghijklmnopqrstuvwxyz",true)).toBe(false);
    expect(isStripePublishableKey("pk_live_abcdefghijklmnopqrstuvwxyz",true)).toBe(false);
    expect(isStripePublishableKey("pk_test_abcdefghijklmnopqrstuvwxyz",true)).toBe(true);
  });
});
