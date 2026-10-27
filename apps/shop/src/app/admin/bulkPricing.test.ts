import { describe, expect, it } from "vitest";
import { adjustPrice, catalogToCsv, previewPrices } from "./bulkPricing";

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
