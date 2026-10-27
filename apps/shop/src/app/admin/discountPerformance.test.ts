import { describe, expect, it } from "vitest";
import { discountPerformance, duplicateDiscount } from "./discountPerformance";

describe("discountPerformance", () => {
  it("aggregates paid non-test orders by uppercase code", () => {
    const m = discountPerformance([
      { paymentStatus: "paid", total: 40, discount: 10, appliedDiscount: { code: "save10" } },
      { paymentStatus: "paid", total: 60, discount: 10, appliedDiscount: { code: "SAVE10" } },
      { paymentStatus: "unpaid", total: 99, appliedDiscount: { code: "SAVE10" } },
      { paymentStatus: "paid", total: 5, isTest: true, appliedDiscount: { code: "SAVE10" } },
      { paymentStatus: "paid", total: 5 },
    ]);
    expect(m.get("SAVE10")).toEqual({ orders: 2, revenue: 100, discountGiven: 20, avgOrder: 50, label: "SAVE10" });
    expect(m.size).toBe(1);
  });
  it("duplicates as an inactive, uniquely coded copy without usage", () => {
    const c = duplicateDiscount({ id: "x", code: "SAVE10", usageCount: 4, isActive: true, value: 10 }, ["SAVE10", "SAVE10-COPY"]);
    expect(c).toMatchObject({ code: "SAVE10-COPY2", isActive: false, value: 10 });
    expect(c).not.toHaveProperty("id");
    expect(c).not.toHaveProperty("usageCount");
  });
});

describe("automatic offers", () => {
  it("counts automatic offers under their id and duplicates them by title", async () => {
    const { perfKey } = await import("./discountPerformance");
    const m = discountPerformance([{ paymentStatus: "paid", total: 20, discount: 5, appliedDiscount: { id: "d1", code: null, automatic: true, title: "Fall" } }]);
    expect(m.get(perfKey({ id: "d1", method: "automatic" }))).toMatchObject({ orders: 1, discountGiven: 5 });
    const copy = duplicateDiscount({ id: "d1", method: "automatic", code: "", title: "Fall", usageCount: 3 }, []);
    expect(copy).toMatchObject({ code: "", title: "Fall (copy)", isActive: false });
    expect(copy).not.toHaveProperty("id");
  });
});

describe("duplicate clears the expiry", () => {
  it("never copies an old end date", () => {
    expect(duplicateDiscount({ id: "x", code: "OLD", expiryDate: "2025-01-01" }, []).expiryDate).toBe("");
    expect(duplicateDiscount({ id: "y", method: "automatic", title: "T", expiryDate: "2025-01-01" }, []).expiryDate).toBe("");
  });
});

describe("revenue after refunds", () => {
  it("takes partial refunds off, like the Overview", () => {
    const m = discountPerformance([{ paymentStatus: "paid", total: 50, discount: 5, refundedAmountMinor: 1000, expectedAmountMinor: 5000, appliedDiscount: { code: "X" } }]);
    expect(m.get("X")?.revenue).toBe(40);
  });
});
