import { describe, expect, it } from "vitest";
import { check } from "./edge";
import { discountRecord, discountUpdate, type DiscountRecord } from "./discountRecord";

const record: DiscountRecord = {
  code: "SPRING", type: "percentage", value: 10, isActive: true, startDate: null, expiryDate: "2026-12-31",
  minOrderAmount: null, minQuantity: null, maxDiscountAmount: 15, usageLimit: null, usageCount: 0, onePerCustomer: false,
  appliesTo: "categories", selectedCategories: ["cat-1"], selectedProducts: [], allowedEmailDomains: "", allowedCustomerEmails: "",
  description: "", buyQuantity: null, getQuantity: null, getDiscountValue: null, tiers: null, method: "code", title: "",
  giftBookId: null, giftVariantId: null, createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z",
};

describe("discount record shape", () => {
  it("accepts what saveDiscount builds", () => {
    expect(check(discountRecord, record).ok).toBe(true);
    expect(check(discountRecord, { ...record, type: "tiered", tiers: [{ minSpend: "50", value: 10, type: "fixed" }] }).ok).toBe(true);
  });

  it("refuses a wrong-typed field and names it", () => {
    const bad = check(discountRecord, { ...record, value: "10" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.path).toBe("value");
    expect(check(discountRecord, { ...record, type: "half-price" }).ok).toBe(false);
    expect(check(discountRecord, { ...record, usageCount: -1 }).ok).toBe(false);
  });

  it("checks an edit's fields and lets older records' extras and gaps through", () => {
    expect(check(discountUpdate, { isActive: false, updatedAt: "2026-10-27T00:00:00.000Z" }).ok).toBe(true);
    // An edit spreads the loaded record: legacy `active`, empty dates, a tier saved before tiers had a type.
    expect(check(discountUpdate, { ...record, active: true, startDate: "", tiers: [{ minSpend: 20, value: 5 }] }).ok).toBe(true);
    expect(check(discountUpdate, { minOrderAmount: "abc" }).ok).toBe(false);
  });
});
