import { describe, expect, test } from "vitest";
import { exampleProducts, isExampleProduct } from "./exampleProducts";

describe("example products", () => {
  test("three examples, all flagged and published, in neutral words", () => {
    const list = exampleProducts();
    expect(list).toHaveLength(3);
    for (const p of list) {
      expect(isExampleProduct(p)).toBe(true);
      expect(p.status).toBe("published");
      expect(Number(p.retailPrice)).toBeGreaterThan(0);
      expect(Object.values(p).join(" ").toLowerCase()).not.toMatch(/\bbooks?\b|\bauthor\b/);
    }
  });
  test("a real product is not an example", () => {
    expect(isExampleProduct({})).toBe(false);
    expect(isExampleProduct(null)).toBe(false);
    expect(isExampleProduct({ isExample: false })).toBe(false);
  });
});
