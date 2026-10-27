import { describe, expect, it } from "vitest";
import { quickAddChoice } from "./buyable";

describe("quickAddChoice", () => {
  it("picks the first edition with stock", () => {
    const book = { variants: [{ id: "a", stock: 0, price: 10 }, { id: "b", stockLevel: 3, price: 10 }] };
    expect(quickAddChoice(book)).toEqual({ variant: book.variants[1], inStock: true });
  });
  it("reports a book whose editions are all sold out as out of stock", () => {
    expect(quickAddChoice({ stockLevel: 5, variants: [{ id: "a", stock: 0 }] }).inStock).toBe(false);
  });
  it("uses the book's own stock when it has no editions", () => {
    expect(quickAddChoice({ stockLevel: 0 }).inStock).toBe(false);
    expect(quickAddChoice({})).toEqual({ inStock: true });
  });
});

it("skips an in-stock edition that has no price", () => {
  const book = { variants: [{ id: "a", stock: 2 }, { id: "b", stock: 2, price: 30 }] };
  expect(quickAddChoice(book).variant?.id).toBe("b");
});

it("never quick-adds a Coming soon book, even with stock", () => {
  expect(quickAddChoice({ comingSoon: true, stockLevel: 5 })).toEqual({ inStock: false, comingSoon: true });
  expect(quickAddChoice({ comingSoon: false, stockLevel: 5 }).inStock).toBe(true);
});
