import { describe, it, expect } from "vitest";
import guards from "./paymentGuards.js";
const { checkoutRefusal, manualPaidRefusal, stripeIntentKey } = guards;

describe("checkoutRefusal", () => {
  it("lets an unpaid open order pay", () => {
    expect(checkoutRefusal({ paymentStatus: "unpaid", status: "open" })).toBeNull();
  });
  it("refuses paid and cancelled orders", () => {
    expect(checkoutRefusal({ paymentStatus: "paid" })).toBe("paid");
    expect(checkoutRefusal({ paymentStatus: "unpaid", status: "cancelled" })).toBe("closed");
    expect(checkoutRefusal({ paymentStatus: "refund_pending" })).toBe("closed");
  });
});

describe("manualPaidRefusal", () => {
  it("allows manual-payment orders", () => {
    expect(manualPaidRefusal({ paymentStatus: "pending", paymentMethod: "E-transfer" })).toBeNull();
  });
  it("refuses card and PayPal orders", () => {
    expect(manualPaidRefusal({ paymentMethod: "Stripe" })).toBe("provider");
    expect(manualPaidRefusal({ paymentMethod: "PayPal" })).toBe("provider");
    expect(manualPaidRefusal({ paymentMethod: "E-transfer", stripePaymentIntentId: "pi_1" })).toBe("provider");
  });
  it("refuses cancelled orders", () => {
    expect(manualPaidRefusal({ status: "cancelled", paymentMethod: "E-transfer" })).toBe("closed");
  });
});

describe("stripeIntentKey", () => {
  it("is stable for the same attempt and changes after a cancelled intent", () => {
    expect(stripeIntentKey("o1", 1234, "CAD", null)).toBe(stripeIntentKey("o1", 1234, "cad", undefined));
    expect(stripeIntentKey("o1", 1234, "cad", "pi_a")).not.toBe(stripeIntentKey("o1", 1234, "cad", null));
    expect(stripeIntentKey("o1", 1235, "cad", null)).not.toBe(stripeIntentKey("o1", 1234, "cad", null));
  });
});
