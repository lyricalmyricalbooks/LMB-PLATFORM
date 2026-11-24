import { describe, expect, it } from "vitest";
import { comingSoonActive, exampleProductOnly, notForSale } from "./comingSoon";

describe("shown but never sold", () => {
  it("covers Coming soon books and example products, nothing else", () => {
    expect(notForSale({ comingSoon: true })).toBe(true);
    expect(notForSale({ isExample: true })).toBe(true);
    expect(exampleProductOnly({ isExample: true })).toBe(true);
    expect(comingSoonActive({ isExample: true })).toBe(false);
    expect(notForSale({ isExample: "true" })).toBe(false);
    expect(notForSale({})).toBe(false);
    expect(notForSale(null)).toBe(false);
  });
});
