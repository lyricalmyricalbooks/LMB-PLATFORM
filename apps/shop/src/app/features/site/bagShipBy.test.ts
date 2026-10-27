import { describe, expect, it } from "vitest";
import { bagShipsOnSchedule, cartShipByOn } from "./bagShipBy";

const book = (over: any = {}) => ({ id: "b1", title: "Zine", format: "Paperback", trackInventory: true, stockLevel: 5, ...over });
const map = (...books: any[]) => new Map(books.map((b) => [b.id, b]));
const line = (over: any = {}) => ({ id: "b1", price: 20, quantity: 1, ...over });

describe("bag ships-by line", () => {
  it("is off unless switched on", () => {
    expect(cartShipByOn({})).toBe(false);
    expect(cartShipByOn({ cartDrawerShowShipBy: true })).toBe(true);
  });
  it("shows for printed books in stock", () => {
    expect(bagShipsOnSchedule([line({ quantity: 5 })], map(book()))).toBe(true);
  });
  it("hides when a line asks for more copies than are in stock", () => {
    expect(bagShipsOnSchedule([line({ quantity: 6 })], map(book()))).toBe(false);
  });
  it("hides for pre-orders, backorders and Coming soon", () => {
    expect(bagShipsOnSchedule([line({ preorder: true })], map(book()))).toBe(false);
    expect(bagShipsOnSchedule([line()], map(book({ onBackorder: true })))).toBe(false);
    expect(bagShipsOnSchedule([line()], map(book({ comingSoon: true })))).toBe(false);
  });
  it("ignores e-books but needs at least one printed book", () => {
    const ebook = book({ id: "e1", format: "E-book", digital: true, stockLevel: 0 });
    expect(bagShipsOnSchedule([line({ id: "e1" })], map(ebook))).toBe(false);
    expect(bagShipsOnSchedule([line({ id: "e1" }), line()], map(ebook, book()))).toBe(true);
  });
  it("checks the chosen edition's stock", () => {
    const b = book({ variants: [{ id: "v1", name: "Signed", format: "Paperback", stockLevel: 0 }, { id: "v2", name: "Plain", format: "Paperback", stockLevel: 3 }] });
    expect(bagShipsOnSchedule([line({ variantId: "v1" })], map(b))).toBe(false);
    expect(bagShipsOnSchedule([line({ variantId: "v2" })], map(b))).toBe(true);
  });
  it("hides when a book is missing from the catalog or the bag is empty", () => {
    expect(bagShipsOnSchedule([line({ id: "gone" })], map(book()))).toBe(false);
    expect(bagShipsOnSchedule([], map(book()))).toBe(false);
  });
});
