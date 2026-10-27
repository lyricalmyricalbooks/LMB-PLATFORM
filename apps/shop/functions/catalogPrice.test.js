import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { catalogUnitPrice } = require("./catalogPrice");
import { catalogUnitPrice as clientPrice } from "../src/app/CartContext";

describe("catalogUnitPrice (server)", () => {
  it("never charges a zero or negative sale price, even as a string", () => {
    expect(catalogUnitPrice({ isOnSale: true, salePrice: "0", retailPrice: 20 })).toBe(20);
    expect(catalogUnitPrice({ isOnSale: true, salePrice: -5, retailPrice: 20 })).toBe(20);
    expect(catalogUnitPrice({ isOnSale: true, salePrice: "12.5", retailPrice: 20 })).toBe(12.5);
    expect(catalogUnitPrice({ isOnSale: false, salePrice: 12, retailPrice: 20 })).toBe(20);
  });

  it("refuses an edition with no price instead of charging $0", () => {
    for (const price of [undefined, null, ""]) expect(catalogUnitPrice({ retailPrice: 20 }, { price })).toBeNaN();
    expect(catalogUnitPrice({ retailPrice: 20 }, { price: "0" })).toBe(0);
    expect(catalogUnitPrice({ retailPrice: 20 }, { price: 15 })).toBe(15);
  });

  it("matches the storefront's rule for every case", () => {
    const books = [
      { isOnSale: true, salePrice: "0", retailPrice: 20 },
      { isOnSale: true, salePrice: 9, retailPrice: 20 },
      { isOnSale: true, salePrice: -1, retailPrice: "18" },
      { retailPrice: undefined },
    ];
    const variants = [undefined, { price: "" }, { price: null }, { price: 7 }, { price: "0" }];
    for (const book of books) for (const variant of variants) {
      expect(Object.is(catalogUnitPrice(book, variant), clientPrice(book, variant))).toBe(true);
    }
  });
});
