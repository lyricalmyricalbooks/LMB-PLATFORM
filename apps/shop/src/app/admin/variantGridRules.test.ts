import { describe, expect, it } from "vitest";
import { fillEvery, gridStock, gridSummary, parseFill } from "./variantGridRules";
import { variantsForOptions, type ProductOption } from "../../shared/productOptions";
import { buildInventory } from "./inventoryInsights";
import { goodsWords } from "./sells";

const options: ProductOption[] = [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black", "White"] }];
let n = 0;
const shirt = () => ({
  id: "tee", title: "Tee", trackInventory: true, options,
  variants: variantsForOptions(options, [], () => ({ id: `v${++n}`, price: 30, stock: 0, stockLevel: 0, sku: `TEE-${n}` })).variants,
});

describe("Every combination grid", () => {
  it("counts combinations, units, sold-out and low ones, and the price range", () => {
    const vs = [{ id: "a", price: 30, stockLevel: 4 }, { id: "b", price: 35, stock: 0 }, { id: "c", price: "", stockLevel: 12 }];
    expect(gridSummary(vs, 5)).toEqual({ count: 3, units: 16, soldOut: 1, low: 1, minPrice: 30, maxPrice: 35 });
    expect(gridSummary([], 5)).toEqual({ count: 0, units: 0, soldOut: 0, low: 0, minPrice: null, maxPrice: null });
  });

  it("reads stock the way the server does: stockLevel first, never below zero", () => {
    expect(gridStock({ id: "a", stockLevel: 3, stock: 9 })).toBe(3);
    expect(gridStock({ id: "a", stock: 2 })).toBe(2);
    expect(gridStock({ id: "a", stockLevel: -4 })).toBe(0);
  });

  it("sets one price or stock on every combination, leaving stockroom-counted stock alone", () => {
    const p = shirt();
    const priced = fillEvery(p.variants, "price", "32.5");
    expect(priced.map((v) => v.price)).toEqual([32.5, 32.5, 32.5, 32.5]);
    // Picks, names, ids and SKUs stay as they were.
    expect(priced.map((v) => [v.id, v.name, v.sku])).toEqual(p.variants.map((v) => [v.id, v.name, v.sku]));
    const locked = new Set([p.variants[1].id]);
    const stocked = fillEvery(p.variants, "stock", "6", (id) => locked.has(id));
    expect(stocked.map((v) => v.stockLevel)).toEqual([6, 0, 6, 6]);
    expect(stocked.map((v) => v.stock)).toEqual([6, 0, 6, 6]);
  });

  it("changes nothing for a value that can't be used", () => {
    const p = shirt();
    for (const bad of ["", "  ", "-1", "abc"]) expect(fillEvery(p.variants, "price", bad)).toBe(p.variants);
    expect(fillEvery(p.variants, "stock", "2.5")).toBe(p.variants);
    expect(parseFill("price", "19.999")).toBe(20);
    expect(parseFill("stock", "0")).toBe(0);
  });

  it("each combination is its own Inventory row with its name and SKU", () => {
    const p = shirt();
    const rows = buildInventory([p], []);
    expect(rows.map((r) => [r.edition, r.sku])).toEqual(p.variants.map((v) => [v.name, v.sku]));
    expect(rows[0].edition).toBe("S / Black");
    // A book without editions keeps its own SKU on its one row.
    expect(buildInventory([{ id: "b", title: "B", sku: "ISBN-1", trackInventory: true }], [])[0].sku).toBe("ISBN-1");
  });

  it("calls editions variants in a shop that doesn't sell books", () => {
    expect(goodsWords("Make the editions")).toBe("Make the variants");
    expect(goodsWords("Remove 1 edition?")).toBe("Remove 1 variant?");
    expect(goodsWords("every combination becomes an edition below")).toBe("every combination becomes a variant below");
    expect(goodsWords("Edition image")).toBe("Variant image");
  });
});
