import { describe, expect, it } from "vitest";
import { sanitizeCart } from "./CartContext";

describe("sanitizeCart", () => {
  it("rejects non-arrays", () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeCart({ id: "a" })).toEqual([]);
  });

  it("keeps valid lines and coerces numeric strings", () => {
    const out = sanitizeCart([{ id: "b1", title: "Book", price: "12.5", quantity: "2", photoUrl: "" }]);
    expect(out).toHaveLength(1);
    expect(out[0].price).toBe(12.5);
    expect(out[0].quantity).toBe(2);
  });

  it("drops corrupt lines (no id, NaN/negative price, zero/NaN quantity)", () => {
    const out = sanitizeCart([
      { id: "", price: 1, quantity: 1 },
      { id: "a", price: "abc", quantity: 1 },
      { id: "b", price: -5, quantity: 1 },
      { id: "c", price: 5, quantity: 0 },
      { id: "d", price: 5, quantity: "x" },
      null,
      { id: "ok", price: 5, quantity: 1 },
    ]);
    expect(out.map(i => i.id)).toEqual(["ok"]);
  });
});
