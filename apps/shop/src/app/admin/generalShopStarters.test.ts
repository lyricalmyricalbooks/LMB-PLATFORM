import { describe, expect, it } from "vitest";
import { exampleProducts } from "./exampleProducts";
import { kindStarterParcels, kindStarterPrices } from "./kindShippingStarters";
import { starterPrices } from "./shippingProfileStarters";
import { productKind } from "../../shared/productOptions";

describe("shipping starters by what the shop sells", () => {
  it("gives a books shop, a mixed shop and no answer the original prices and no parcel sizes", () => {
    for (const a of [undefined, null, "books", "zines", "mixed", "mix"]) {
      expect(kindStarterPrices(a)).toEqual({ ca: [8, 3], us: [12, 4], world: [20, 6] });
      expect(kindStarterParcels(a)).toEqual([]);
    }
    expect(starterPrices("world").map((p) => [p.first, p.extra])).toEqual([["8.00", "3.00"], ["12.00", "4.00"], ["20.00", "6.00"]]);
  });
  it("starts a clothing shop with its own prices and box sizes", () => {
    expect(starterPrices("canada", "clothing")[0].first).toBe("9.00");
    expect(starterPrices("north-america", "shoes").map((p) => p.first)).toEqual(["14.00", "20.00"]);
    const boxes = kindStarterParcels("jewelry");
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(Number(b.parcel.length)).toBeGreaterThan(0);
  });
});

describe("example products by what the shop sells", () => {
  it("keeps the original three for books and no answer", () => {
    expect(exampleProducts().map((p) => p.title)).toEqual(["Example tote bag", "Example enamel pin", "Example art print"]);
    expect(exampleProducts("books").map((p) => p.title)).toEqual(exampleProducts().map((p) => p.title));
  });
  it("shows a clothing shop clothing, flagged as examples", () => {
    const list = exampleProducts("clothing");
    expect(list).toHaveLength(3);
    for (const p of list) {
      expect(p.isExample).toBe(true);
      expect(productKind(p)).toBe("clothing");
    }
  });
});
