import { describe, expect, it } from "vitest";
import { catalogUnitPrice } from "./CartContext";
import { bogoPercent } from "./features/site/checkoutFulfillment";

describe("catalogUnitPrice matches the server's charge rule", () => {
  it("uses the sale price only when it is a positive number", () => {
    expect(catalogUnitPrice({ isOnSale: true, salePrice: 15, retailPrice: 20 })).toBe(15);
    expect(catalogUnitPrice({ isOnSale: true, salePrice: 0, retailPrice: 20 })).toBe(20);
    expect(catalogUnitPrice({ isOnSale: true, retailPrice: 20 })).toBe(20);
  });
  it("uses a variant's own price and refuses a variant with none", () => {
    expect(catalogUnitPrice({ retailPrice: 20 }, { price: 45 })).toBe(45);
    expect(catalogUnitPrice({ retailPrice: 20 }, { price: 0 })).toBe(0);
    expect(Number.isNaN(catalogUnitPrice({ retailPrice: 20 }, {}))).toBe(true);
  });
  it("is NaN when the catalog has no price at all", () => {
    expect(Number.isNaN(catalogUnitPrice({}))).toBe(true);
  });
});

describe("bogoPercent", () => {
  it("treats a missing or invalid value as fully free", () => {
    for (const v of [undefined, null, "", "abc", NaN]) expect(bogoPercent(v)).toBe(100);
  });
  it("keeps explicit values and clamps to 0-100", () => {
    expect(bogoPercent(50)).toBe(50);
    expect(bogoPercent(0)).toBe(0);
    expect(bogoPercent(150)).toBe(100);
    expect(bogoPercent(-5)).toBe(0);
  });
});
