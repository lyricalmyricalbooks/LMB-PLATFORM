import { describe, expect, it } from "vitest";
import { adjustPrice, catalogToCsv, planEndSale, planSale, previewPrices, saleScheduleProblem } from "./bulkPricing";

describe("bulkPricing", () => {
  it("adjusts by percent, amount and set with rounding and a zero floor", () => {
    expect(adjustPrice(19.99, "percent", 10)).toBe(21.99);
    expect(adjustPrice(10, "percent", -100)).toBe(0);
    expect(adjustPrice(10, "amount", -15)).toBe(0);
    expect(adjustPrice(10, "amount", 2.5)).toBe(12.5);
    expect(adjustPrice(10, "set", 8)).toBe(8);
    expect(adjustPrice(10, "set", -1)).toBeNull();
    expect(adjustPrice(10, "percent", NaN)).toBeNull();
  });
  it("previews only books that actually change", () => {
    const p = previewPrices([{ id: "a", title: "A", retailPrice: 10 }, { id: "b", retailPrice: 0 }, { id: "c" }], "percent", 10);
    expect(p).toEqual([{ id: "a", title: "A", from: 10, to: 11 }]);
  });
  it("csv escapes formulas", () => {
    expect(catalogToCsv([{ title: "=x", retailPrice: 5 }])).toContain(`"'=x"`);
  });
});

describe("scheduled sale on many products", () => {
  const plain = { id: "a", title: "Zine", retailPrice: 20 };
  it("prices each product off its regular price and saves the dates", () => {
    const { changes, skipped } = planSale([plain, { id: "b", title: "Print", retailPrice: 19.99 }], { percent: 15, startsAt: "2026-12-01", endsAt: "2026-12-31" });
    expect(skipped).toEqual([]);
    expect(changes.map((c) => c.to)).toEqual([17, 16.99]);
    expect(changes[0].patch).toEqual({ isOnSale: true, salePrice: 17, saleStartsAt: "2026-12-01", saleEndsAt: "2026-12-31" });
  });
  it("skips editions, gift cards and unpriced products by name", () => {
    const { changes, skipped } = planSale([
      { id: "g", title: "Card", productType: "giftCard", retailPrice: 25 },
      { id: "e", title: "Ed", retailPrice: 10, variants: [{ price: 10 }] },
      { id: "n", title: "Free" },
    ], { percent: 10, startsAt: "", endsAt: "" });
    expect(changes).toEqual([]);
    expect(skipped.map((s) => s.id)).toEqual(["g", "e", "n"]);
  });
  it("refuses a bad discount or an end before the start", () => {
    expect(saleScheduleProblem({ percent: 0, startsAt: "", endsAt: "" })).toMatch(/1% and 99%/);
    expect(saleScheduleProblem({ percent: 100, startsAt: "", endsAt: "" })).toMatch(/1% and 99%/);
    expect(saleScheduleProblem({ percent: 20, startsAt: "2026-12-10", endsAt: "2026-12-01" })).toMatch(/end on or after/);
    expect(planSale([plain], { percent: 20, startsAt: "2026-12-10", endsAt: "2026-12-01" }).changes).toEqual([]);
  });
  it("ending a sale clears the flag and the dates, only where there is a sale", () => {
    const out = planEndSale([plain, { id: "s", title: "On", isOnSale: true, salePrice: 5, saleEndsAt: "2026-12-31" }]);
    expect(out).toEqual([{ id: "s", title: "On", patch: { isOnSale: false, saleStartsAt: "", saleEndsAt: "" } }]);
  });
});
