import { describe, expect, test } from "vitest";
import { exampleProducts, isExampleProduct } from "./exampleProducts";

describe("example products", () => {
  test("four examples from the shop's sample set, all flagged and published, each with its licensed photo", () => {
    for (const sells of [undefined, "books", "clothing", "other", "hair"]) {
      const list = exampleProducts(sells);
      expect(list).toHaveLength(4);
      for (const p of list) {
        expect(isExampleProduct(p)).toBe(true);
        expect(p.status).toBe("published");
        expect(String(p.title)).toMatch(/^Example /);
        expect(Number(p.retailPrice)).toBeGreaterThan(0);
        expect((p.photos as { url: string }[])[0].url).toMatch(/\/samples\/\w+\/[\w-]+\.webp$/);
        expect(Object.values(p).join(" ").toLowerCase()).not.toMatch(/\bauthor\b/);
      }
    }
    expect(exampleProducts("clothing")[0].title).toBe("Example wool sweater");
    expect(exampleProducts("other")[0].title).toBe("Example stoneware mug");
    // A service shop's set has no products: it gets the home goods examples.
    expect(exampleProducts("hair")[0].title).toBe("Example stoneware mug");
  });
  test("a real product is not an example", () => {
    expect(isExampleProduct({})).toBe(false);
    expect(isExampleProduct(null)).toBe(false);
    expect(isExampleProduct({ isExample: false })).toBe(false);
  });
});
