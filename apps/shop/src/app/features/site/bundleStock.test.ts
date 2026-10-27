import { describe, expect, it } from "vitest";
import { withBundleStock } from "./bundleStock";
import { applyBackorderPolicy } from "./backorder";

describe("withBundleStock", () => {
  const catalog = [
    { id: "a", trackInventory: true, stockLevel: 5 },
    { id: "b", trackInventory: true, variants: [{ id: "hc", stock: 1 }] },
    { id: "c", trackInventory: false },
    { id: "d", trackInventory: true, stockLevel: 0, allowBackorder: true },
    { id: "set1", stockLevel: 0, bundleItems: [{ bookId: "a", quantity: 2 }] },
    { id: "set2", trackInventory: true, stockLevel: 50, allowBackorder: true, bundleItems: [{ bookId: "a" }, { bookId: "b", variantId: "hc" }] },
    { id: "set3", trackInventory: true, stockLevel: 4, bundleItems: [{ bookId: "c" }, { bookId: "d" }] },
    { id: "set4", bundleItems: [{ bookId: "missing" }] },
  ];
  it("derives each box set's stock from its parts, leaving other books alone", () => {
    const out = withBundleStock(catalog) as any[];
    expect(out.slice(0, 4)).toEqual(catalog.slice(0, 4));
    expect(out[4]).toMatchObject({ trackInventory: true, stockLevel: 2 });
    expect(out[5]).toMatchObject({ trackInventory: true, stockLevel: 1, allowBackorder: false });
    expect(out[6]).toMatchObject({ trackInventory: false });
    expect(out[7]).toMatchObject({ trackInventory: true, stockLevel: 0 });
    expect(catalog[4].stockLevel).toBe(0); // never mutated
  });
  it("feeds the existing sold-out / untracked display rules", () => {
    const shown = withBundleStock(catalog).map(applyBackorderPolicy) as any[];
    expect(shown[6].stockLevel).toBe(999);
    expect(shown[7].stockLevel).toBe(0);
  });
  it("reads parts from the full catalog even when they aren't listed", () => {
    const listed = catalog.filter(b => b.id === "set1");
    expect((withBundleStock(listed, catalog)[0] as any).stockLevel).toBe(2);
    const plain = [{ id: "x" }];
    expect(withBundleStock(plain)).toBe(plain);
  });
});
