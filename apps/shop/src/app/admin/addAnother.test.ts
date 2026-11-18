import { describe, expect, it } from "vitest";
import { hasColourChoice, nextProductStart } from "./addAnother";

const shirt = {
  id: "p1", slug: "moth-tee", sku: "MT-1", title: "Moth Tee", subtitle: "Night Press", description: "<p>Soft.</p>", status: "published",
  typeId: "tops", kind: "clothing", format: "", googleCategory: "Apparel & Accessories > Clothing", retailPrice: 32, categories: ["Clothing"],
  photos: [{ id: "a", url: "x" }], material: "Cotton",
  options: [{ name: "Size", values: ["S", "M"] }, { name: "Colour", values: ["Black"] }],
  variants: [{ id: "v1", options: { Size: "S", Colour: "Black" }, price: 32, stockLevel: 4, sku: "MT-1-1" }],
  detailRows: [{ key: "fact:fit", label: "Fit", value: "Relaxed" }, { key: "fact:safety", label: "Safety", value: "Keep away" }],
};

describe("save and add another", () => {
  it("starts another of the same kind with its type, maker, price, sizes and safety line", () => {
    const next = nextProductStart(shirt, "another");
    expect(next).toMatchObject({ typeId: "tops", kind: "clothing", subtitle: "Night Press", retailPrice: 32, categories: ["Clothing"] });
    expect(next.title).toBeUndefined();
    expect(next.photos).toBeUndefined();
    expect(next.options).toEqual([{ name: "Size", values: ["S", "M"] }]);
    expect(next.variants).toHaveLength(2);
    expect(next.variants.every((v: any) => v.stockLevel === 0 && v.id !== "v1")).toBe(true);
    expect(next.detailRows).toEqual([{ key: "fact:safety", label: "Safety", value: "Keep away" }]);
  });

  it("starts a new colour with everything but the colour, photos and one-product codes", () => {
    const next = nextProductStart(shirt, "colour");
    expect(next).toMatchObject({ title: "Moth Tee", description: "<p>Soft.</p>", material: "Cotton", typeId: "tops" });
    for (const key of ["id", "slug", "sku", "photos", "status"]) expect(next[key]).toBeUndefined();
    expect(next.options).toEqual([{ name: "Size", values: ["S", "M"] }]);
    expect(next.variants.map((v: any) => v.name)).toEqual(["S", "M"]);
    expect(next.detailRows).toHaveLength(2);
  });

  it("knows when a product has a colour to change", () => {
    expect(hasColourChoice(shirt)).toBe(true);
    expect(hasColourChoice({ options: [{ name: "Scent", values: ["Fig"] }] })).toBe(false);
  });
});
