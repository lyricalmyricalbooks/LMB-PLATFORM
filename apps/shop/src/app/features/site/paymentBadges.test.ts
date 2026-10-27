import { describe, it, expect } from "vitest";
import { resolveFooterBadges } from "./paymentBadges";

describe("resolveFooterBadges", () => {
  const settings = { payments: { footerBadges: ["visa", "paypal"] } };
  it("falls back to Settings › Payments", () => {
    expect(resolveFooterBadges({}, settings)).toEqual(["visa", "paypal"]);
  });
  it("lets the design override, including an empty list", () => {
    expect(resolveFooterBadges({ footerBadges: ["klarna"] }, settings)).toEqual(["klarna"]);
    expect(resolveFooterBadges({ footerBadges: [] }, settings)).toEqual([]);
  });
  it("tolerates missing data", () => {
    expect(resolveFooterBadges(undefined, undefined)).toEqual([]);
  });
});
