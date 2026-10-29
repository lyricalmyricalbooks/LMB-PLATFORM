import { describe, expect, it } from "vitest";
import { exchangeChoices } from "./ReturnExchange";

const shirt = { id: "shirt", retailPrice: 28, variants: [
  { id: "m", name: "M", price: 28, stockLevel: 1 }, { id: "l", name: "L", price: 28, stockLevel: 4 },
  { id: "xl", name: "XL", price: 30, stockLevel: 9 }, { id: "xs", name: "XS", price: 28, stockLevel: 0 },
] };
const order = { id: "o1", items: [{ id: "shirt", variantId: "m", title: "Shirt", quantity: 2 }] };

describe("swap for another size (plan 10.22)", () => {
  it("offers only other versions at the same price that are in stock", () => {
    const rows = exchangeChoices(order, [{ index: 0, quantity: 1 }], { shirt });
    expect(rows).toHaveLength(1);
    expect(rows[0].options.map((v: any) => v.id)).toEqual(["l"]);
  });
  it("offers nothing for an item that didn't come back, a book, a box set or a product with no other version", () => {
    expect(exchangeChoices(order, [{ index: 0, quantity: 0 }], { shirt })).toEqual([]);
    expect(exchangeChoices({ items: [{ id: "book", quantity: 1 }] }, [{ index: 0, quantity: 1 }], { book: { retailPrice: 20 } })).toEqual([]);
    expect(exchangeChoices({ items: [{ id: "shirt", variantId: "m", components: [{ id: "x" }] }] }, [{ index: 0, quantity: 1 }], { shirt })).toEqual([]);
    expect(exchangeChoices(order, [{ index: 0, quantity: 1 }], { shirt: null as any })).toEqual([]);
  });
});
