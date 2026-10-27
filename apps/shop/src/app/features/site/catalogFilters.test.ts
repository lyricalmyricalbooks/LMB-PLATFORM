import { describe, expect, it } from "vitest";
import {
  appliedFilters, applyCatalogControls, bookFormats, bookInStock, bookSoldOut, soldOutLastOn, soldOutToEnd, EMPTY_FILTERS, filterView, filtersActive, formatKey, formatsIn, priceRangeFor,
} from "./CatalogControls";

const paperback = { id: "p", title: "Zine", format: "Paperback", retailPrice: 12, stockLevel: 4, createdAt: "2026-01-01" };
const hardcover = { id: "h", title: "Atlas", format: "Hardcover", retailPrice: 45, stockLevel: 0, trackInventory: true, createdAt: "2026-02-01" };
const editions = {
  id: "e", title: "Poems", retailPrice: 0, createdAt: "2026-03-01", isbn: "978-1-23456-789-7",
  variants: [{ id: "pb", name: "Paperback", price: 20, stock: 0 }, { id: "eb", name: "E-book (EPUB)", price: 9, stock: 5 }],
};
const audio = { id: "a", title: "Spoken", format: "Audiobook", retailPrice: 15, createdAt: "2026-04-01" };
const all = [paperback, hardcover, editions, audio];

describe("format buckets", () => {
  it("files format names into the shop's format chips", () => {
    expect(formatKey("Trade paperback")).toBe("paperback");
    expect(formatKey("Hardback")).toBe("hardcover");
    expect(formatKey("E-book (PDF)")).toBe("ebook");
    expect(formatKey("Audiobook (MP3)")).toBe("audiobook");
    expect(formatKey("Risograph print")).toBe("other");
    expect(formatKey("")).toBeNull();
  });
  it("uses every edition a book is sold in", () => {
    expect(bookFormats(editions)).toEqual(["paperback", "ebook"]);
    expect(bookFormats({ format: "Paperback", isDigital: true })).toEqual(["ebook"]);
    expect(formatsIn(all)).toEqual(["paperback", "hardcover", "ebook", "audiobook"]);
  });
});

describe("in stock", () => {
  it("counts a book whose e-book edition is available, and backorders", () => {
    expect(bookInStock(editions)).toBe(true);
    expect(bookInStock(hardcover)).toBe(false);
    expect(bookInStock({ ...hardcover, allowBackorder: true })).toBe(true);
    expect(applyCatalogControls(all, "", "newest", true, [0, Infinity]).map(b => b.id)).toEqual(["a", "e", "p"]);
  });
});

describe("price and format filters", () => {
  it("filters and sorts edition-only books by their cheapest edition", () => {
    expect(applyCatalogControls(all, "", "price_asc", false, [0, Infinity]).map(b => b.id)).toEqual(["e", "p", "a", "h"]);
    expect(applyCatalogControls(all, "", "newest", false, priceRangeFor({ ...EMPTY_FILTERS, minPrice: "10", maxPrice: "20" })).map(b => b.id)).toEqual(["a", "p"]);
  });
  it("reads Min/Max in the shopper's currency", () => {
    // 1 CAD = 0.5 shown units: "6" shown means 12 CAD.
    const [min, max] = priceRangeFor({ ...EMPTY_FILTERS, minPrice: "6", maxPrice: "6" }, 0.5);
    expect(min).toBeLessThanOrEqual(12);
    expect(max).toBeGreaterThanOrEqual(12);
    expect(priceRangeFor({ ...EMPTY_FILTERS, minPrice: "abc", maxPrice: "-3" })).toEqual([0, Infinity]);
  });
  it("keeps books matching any chosen format", () => {
    expect(applyCatalogControls(all, "", "newest", false, [0, Infinity], ["ebook", "audiobook"]).map(b => b.id)).toEqual(["a", "e"]);
  });
  it("searches ISBNs too", () => {
    expect(applyCatalogControls(all, "978-1-23456", "newest", false, [0, Infinity]).map(b => b.id)).toEqual(["e"]);
  });
  it("never applies a filter the current view doesn't show", () => {
    const onlyPaperbacks = [paperback, { ...paperback, id: "p2", retailPrice: 12 }];
    const view = filterView(onlyPaperbacks);
    expect(view).toEqual({ hasSale: false, availableFormats: ["paperback"], showPrice: false });
    const applied = appliedFilters({ formats: ["ebook"], minPrice: "100", maxPrice: "" }, view);
    expect(applied).toEqual({ onSale: false, formats: [], priceRange: [0, Infinity] });
    expect(filterView(all).showPrice).toBe(true);
    expect(appliedFilters({ formats: ["ebook", "other"], minPrice: "", maxPrice: "" }, filterView(all)).formats).toEqual(["ebook"]);
  });
  it("knows when there is anything to clear", () => {
    expect(filtersActive(EMPTY_FILTERS)).toBe(false);
    expect(filtersActive(EMPTY_FILTERS, " ")).toBe(false);
    expect(filtersActive(EMPTY_FILTERS, "", true)).toBe(true);
    expect(filtersActive({ ...EMPTY_FILTERS, maxPrice: "20" })).toBe(true);
  });
});

describe("on sale filter", () => {
  const sale = { id: "s", title: "Deal", retailPrice: 20, isOnSale: true, salePrice: 12, createdAt: "2026-05-01" };
  const items = [paperback, sale, editions];
  it("is offered only when a book in the view is on sale", () => {
    expect(filterView(items).hasSale).toBe(true);
    expect(filterView(all).hasSale).toBe(false);
  });
  it("keeps only books whose sale is charged, and never applies a hidden chip", () => {
    const view = filterView(items);
    const applied = appliedFilters({ ...EMPTY_FILTERS, onSale: true }, view);
    expect(applied.onSale).toBe(true);
    expect(applyCatalogControls(items, "", "newest", false, [0, Infinity], [], applied.onSale).map(b => b.id)).toEqual(["s"]);
    expect(appliedFilters({ ...EMPTY_FILTERS, onSale: true }, filterView(all)).onSale).toBe(false);
  });
  it("counts as an active filter so Clear filters appears", () => {
    const view = { availableFormats: [], showPrice: false, hasSale: true };
    expect(filtersActive({ ...EMPTY_FILTERS, onSale: true }, "", false, view)).toBe(true);
    expect(filtersActive({ ...EMPTY_FILTERS, onSale: true }, "", false, { ...view, hasSale: false })).toBe(false);
  });
});

describe("oldest sort", () => {
  it("lists the earliest-added book first, the reverse of newest", () => {
    const ids = (sort: any) => applyCatalogControls(all, "", sort, false, [0, Infinity]).map(b => b.id);
    expect(ids("oldest")).toEqual(["p", "h", "e", "a"]);
    expect(ids("newest")).toEqual(["a", "e", "h", "p"]);
  });
});

describe("sold-out books last (Studio › Book order)", () => {
  it("is off by default and keeps the chosen order", () => {
    expect(soldOutLastOn({})).toBe(false);
    expect(soldOutLastOn({ soldOutLast: true })).toBe(true);
    expect(applyCatalogControls(all, "", "price_asc", false, [0, Infinity]).map(b => b.id)).toEqual(["e", "p", "a", "h"]);
  });
  it("moves sold-out books to the end without reordering either group", () => {
    const soldPb = { ...paperback, id: "p0", stockLevel: 0, trackInventory: true, retailPrice: 5 };
    const list = [...all, soldPb];
    expect(applyCatalogControls(list, "", "price_asc", false, [0, Infinity], [], false, true).map(b => b.id)).toEqual(["e", "p", "a", "p0", "h"]);
  });
  it("leaves coming soon books in place", () => {
    const soon = { ...hardcover, id: "s", comingSoon: true, status: "published" };
    expect(bookSoldOut(soon)).toBe(false);
    expect(soldOutToEnd([hardcover, soon, paperback]).map(b => b.id)).toEqual(["s", "p", "h"]);
  });
});
