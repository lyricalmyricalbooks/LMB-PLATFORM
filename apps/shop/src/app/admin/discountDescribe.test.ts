import { describe, expect, it } from "vitest";
import { dateRangeLabel, describeDiscount, shopDayLabel, tierSummary } from "./discountDescribe";

describe("describeDiscount", () => {
  it("summarises a code in one line", () => {
    expect(describeDiscount({
      type: "percentage", value: 20, appliesTo: "categories", selectedCategories: ["Poetry"], maxDiscountAmount: 15,
      minOrderAmount: 40, onePerCustomer: true, startDate: "2026-10-01", expiryDate: "2026-10-31",
    }, [], 2026)).toBe("20% off Poetry, up to CA$15 · min CA$40 · 1 per customer · Oct 1–31");
  });
  it("describes tiers, BOGO, free shipping and books", () => {
    expect(tierSummary([{ minSpend: 100, value: 20 }, { minSpend: 50, value: 5, type: "fixed" }])).toBe("CA$5 off over CA$50, 20% off over CA$100");
    expect(describeDiscount({ type: "bogo", buyQuantity: 2, getQuantity: 1, getDiscountValue: 100 }, [], 2026)).toBe("Buy 2 get 1 free");
    expect(describeDiscount({ type: "freeship", minOrderAmount: 50 }, [], 2026)).toBe("Free shipping · min CA$50");
    expect(describeDiscount({ type: "fixed", value: 5.5, appliesTo: "products", selectedProducts: ["b1"] }, [{ id: "b1", title: "Odes" }], 2026)).toBe("CA$5.50 off Odes");
  });
  it("formats shop days without time-zone drift", () => {
    expect(shopDayLabel("2026-10-31")).toBe("Oct 31, 2026");
    expect(dateRangeLabel("2026-10-28", "2026-11-03", 2026)).toBe("Oct 28 – Nov 3");
    expect(dateRangeLabel("", "2027-01-05", 2026)).toBe("until Jan 5, 2027");
    expect(dateRangeLabel("2026-12-01", "", 2026)).toBe("from Dec 1");
  });
});
