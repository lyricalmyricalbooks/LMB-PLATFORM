import { describe, expect, it } from "vitest";
import { payLinkState, payLinkUntil } from "./payLinkState";

const now = Date.parse("2026-11-03T00:00:00Z");
const order = (patch: any = {}) => ({ paymentStatus: "unpaid", status: "pending_payment", paymentLink: { expiresAt: "2026-11-17T00:00:00.000Z" }, ...patch });

describe("Pay now on the order page", () => {
  it("shows only on an unpaid order made with a link that is still open", () => {
    expect(payLinkState(order(), now)).toBe("pay");
    expect(payLinkState(order(), Date.parse("2026-11-18T00:00:00Z"))).toBe("expired");
    expect(payLinkState(order({ paymentStatus: "paid" }), now)).toBeNull();
    expect(payLinkState(order({ paymentStatus: "pending" }), now)).toBeNull();
    expect(payLinkState(order({ status: "cancelled" }), now)).toBeNull();
    expect(payLinkState({ paymentStatus: "unpaid" }, now)).toBeNull();
  });
  it("says the closing day in words", () => {
    expect(payLinkUntil(order(), "en-CA")).toMatch(/November/);
    expect(payLinkUntil({}, "en-CA")).toBe("");
  });
});
