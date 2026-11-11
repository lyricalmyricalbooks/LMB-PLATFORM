import { describe, expect, it } from "vitest";
import { bookAuthor, bookTiles, listStatus, bookReferences, duplicateBookData, inlineEditable, matchesStatus, matchesStock, priceInfo, publicationBadge, sharedIsbns, stockInfo } from "./catalogList";
import { inventoryCsv, planPriceChange } from "./bulkPricing";

describe("catalog list rows", () => {
  it("shows archived, draft and scheduled books as such (archived used to read Published)", () => {
    expect(publicationBadge({ status: "archived" }).text).toBe("Archived");
    expect(publicationBadge({ status: "draft" }).text).toBe("Draft");
    expect(publicationBadge({ status: "published", scheduleDate: "2999-01-01" }).text).toBe("Scheduled");
    expect(matchesStatus({ status: "archived" }, "Published")).toBe(false);
    expect(matchesStatus({ status: "archived" }, "Archived")).toBe(true);
  });
  it("credits the editor's contributors field, then legacy/linked authors", () => {
    expect(bookAuthor({ subtitle: "Zoe Moss", authorName: "Old" })).toBe("Zoe Moss");
    expect(bookAuthor({ authorId: "a1" }, { a1: "Linked" })).toBe("Linked");
  });
  it("reads stock like the server", () => {
    expect(stockInfo({ trackInventory: false, stockLevel: 0 }).text).toBe("Not tracked");
    expect(stockInfo({ trackInventory: true, allowBackorder: true, stockLevel: 0 }).kind).toBe("backorder");
    expect(stockInfo({ productType: "giftCard" }).kind).toBe("giftcard");
    expect(stockInfo({ trackInventory: true, variants: [{ stock: 2 }, { stockLevel: 7 }] }).count).toBe(9);
    const parts: any = { a: { trackInventory: true, stockLevel: 4 } };
    expect(stockInfo({ bundleItems: [{ bookId: "a", quantity: 2 }] }, id => parts[id]).count).toBe(2);
    expect(matchesStock(stockInfo({ trackInventory: true, stockLevel: 0 }), "Sold out")).toBe(true);
    expect(matchesStock(stockInfo({ trackInventory: true, stockLevel: 3 }), "Low")).toBe(true);
  });
  it("calls a count low at the shop's own low-stock line", () => {
    expect(stockInfo({ trackInventory: true, stockLevel: 8 }).kind).toBe("instock");
    expect(stockInfo({ trackInventory: true, stockLevel: 8 }, undefined, 10).kind).toBe("low");
    expect(stockInfo({ trackInventory: true, stockLevel: 3 }, undefined, 2).kind).toBe("instock");
  });
  it("prices editions, gift cards and sales like the shop", () => {
    expect(priceInfo({ retailPrice: 0, variants: [{ price: 20 }, { price: 30 }] }).text).toBe("from CA$20.00");
    expect(priceInfo({ productType: "giftCard", variants: [{ price: 25 }, { price: 100 }] }).text).toBe("CA$25.00–CA$100.00");
    expect(priceInfo({ retailPrice: 20, isOnSale: true, salePrice: 15 })).toMatchObject({ price: 15, was: 20 });
    expect(inlineEditable({ variants: [{}] })).toBe(false);
    expect(inlineEditable({ retailPrice: 5 })).toBe(true);
  });
  it("duplicates without identifiers, stock or featured flag", () => {
    const c = duplicateBookData({ id: "x", title: "A", isbn: "1", sku: "S", slug: "a", stockLevel: 4, isFeatured: true, status: "published", digitalFileUrl: "u" });
    expect(c).toMatchObject({ title: "A (Copy)", isbn: "", sku: "", slug: "", stockLevel: 0, isFeatured: false, status: "draft", digitalFileUrl: "" });
    expect(c.id).toBeUndefined();
  });
  it("names box sets and recommendations that point at deleted books", () => {
    const books = [{ id: "a", title: "A" }, { id: "s", title: "Set", bundleItems: [{ bookId: "a" }] }, { id: "r", title: "R", relatedBookIds: ["a"] }];
    expect(bookReferences(["a"], books)).toEqual([{ id: "a", title: "A", usedBy: ["Set", "R"] }]);
    expect(sharedIsbns([{ isbn: "978-1", title: "X" }, { isbn: "9781", title: "Y" }, { isbn: "9781", title: "Z", status: "draft" }])).toEqual([{ isbn: "9781", titles: ["X", "Y"] }]);
  });
});

describe("bulk price change", () => {
  it("skips gift cards, edition books (unless asked) and sales that would not be below the new price", () => {
    const books = [
      { id: "g", productType: "giftCard", variants: [{ price: 25 }] },
      { id: "e", variants: [{ name: "PB", price: 10 }] },
      { id: "s", retailPrice: 20, isOnSale: true, salePrice: 15 },
      { id: "p", retailPrice: 20 },
    ];
    const plan = planPriceChange(books, "set", 12);
    expect(plan.changes.map(c => c.id)).toEqual(["p"]);
    expect(plan.skipped.map(s => s.id)).toEqual(["g", "e", "s"]);
    const withEditions = planPriceChange(books, "set", 12, { includeEditions: true });
    expect(withEditions.changes.find(c => c.id === "e")?.patch.variants[0].price).toBe(12);
  });
  it("exports an inventory file per edition", () => {
    expect(inventoryCsv([{ id: "b", title: "T", trackInventory: true, variants: [{ name: "HC", stock: 3 }] }])).toContain(`"HC","3"`);
  });
});

describe("the Books list (redesign to the mockup)", () => {
  const live = (extra: any = {}) => ({ status: "published", trackInventory: true, stockLevel: 20, ...extra });
  it("names each book's status in the mockup's words", () => {
    expect(listStatus(live(), stockInfo(live())).text).toBe("Live");
    expect(listStatus(live({ stockLevel: 0 }), stockInfo(live({ stockLevel: 0 }))).text).toBe("Sold out");
    expect(listStatus({ status: "draft" }, stockInfo({ status: "draft" })).text).toBe("Draft");
    expect(listStatus({ status: "archived" }, stockInfo({ status: "archived" })).text).toBe("Archived");
  });
  it("counts the four tiles from published books only for low and sold out", () => {
    const books = [live(), live({ stockLevel: 2 }), live({ stockLevel: 0 }), { status: "draft", trackInventory: true, stockLevel: 0 }];
    expect(bookTiles(books, (b) => stockInfo(b))).toEqual({ books: 4, online: 3, low: 1, soldOut: 1 });
  });
});
