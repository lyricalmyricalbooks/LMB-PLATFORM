import { describe, expect, it } from "vitest";
import { reorderPlan } from "./reorder";

const book = { id: "b1", title: "A", status: "published", price: 10, stockLevel: 5 };
const edBook = { id: "b2", title: "B", status: "published", price: 10, variants: [{ id: "v1", name: "Hardcover", price: 20, stockLevel: 3 }] };

describe("reorderPlan", () => {
  it("re-adds live books with their quantities", () => {
    const p = reorderPlan({ items: [{ itemId: "b1", quantity: 2 }, { itemId: "b2", variantId: "v1", quantity: 1 }] }, [book, edBook]);
    expect(p.lines.map(l => [l.book.id, l.variant?.id, l.quantity])).toEqual([["b1", undefined, 2], ["b2", "v1", 1]]);
    expect(p.skipped).toBe(0);
  });
  it("skips missing books, gifts, add-ons and unknown editions", () => {
    const p = reorderPlan({ items: [{ itemId: "zz", quantity: 1 }, { itemId: "b1", promoGift: true }, { itemId: "b1", addOns: [{ id: "x" }] }, { itemId: "b2", variantId: "gone" }] }, [book, edBook]);
    expect(p.lines).toHaveLength(0);
    expect(p.skipped).toBe(4);
  });
  it("clamps quantity to 1..99", () => {
    expect(reorderPlan({ items: [{ itemId: "b1", quantity: 500 }] }, [book]).lines[0].quantity).toBe(99);
  });
});
