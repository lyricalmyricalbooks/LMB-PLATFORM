import { describe, expect, it } from "vitest";
import { isSoldOut, stockRowsFor, trackedStockRows } from "./stockRules";

describe("stockRules", () => {
  it("classifies books and editions", () => {
    expect(stockRowsFor({ id: "g", productType: "giftCard", variants: [{ id: "25" }] })[0].kind).toBe("giftCard");
    expect(stockRowsFor({ id: "s", trackInventory: true, bundleItems: [{ bookId: "a" }] })[0].kind).toBe("bundle");
    expect(stockRowsFor({ id: "e", trackInventory: true, format: "E-book (EPUB)" })[0].kind).toBe("digital");
    expect(stockRowsFor({ id: "p", stockLevel: 3 })[0].kind).toBe("untracked");
    const rows = stockRowsFor({ id: "v", trackInventory: true, stockLevel: 99, variants: [
      { id: "pb", name: "Paperback", stockLevel: 2, price: 20 }, { id: "eb", name: "E-book", digital: true, stock: 0 }] });
    expect(rows.map((r) => [r.variantId, r.kind, r.stock])).toEqual([["pb", "tracked", 2], ["eb", "digital", 0]]);
  });
  it("lists only tracked rows of live books; backorders are never sold out", () => {
    const rows = trackedStockRows([
      { id: "a", trackInventory: true, stockLevel: 0 }, { id: "b", trackInventory: true, stockLevel: 0, allowBackorder: true },
      { id: "c", trackInventory: true, stockLevel: 1, status: "archived" }, { id: "d", trackInventory: true, status: "draft" },
    ]);
    expect(rows.map((r) => r.bookId)).toEqual(["a", "b"]);
    expect(rows.filter(isSoldOut).map((r) => r.bookId)).toEqual(["a"]);
  });
});
