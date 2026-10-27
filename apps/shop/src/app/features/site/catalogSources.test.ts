import { describe, expect, it } from "vitest";
import live from "./__fixtures__/liveDesign.json";
import { bookDateMs, joinSlugList, parseSlugList, pickBook, sectionBookQuery, selectBooks } from "./merchandising";

// Studio 2.3 catalog sources. The first block freezes the selection rule every catalog section used
// before sources existed (SectionComponents `filterBooksBySource`) and proves saved designs pick the
// same books in the same order through `selectBooks`.

const legacySlug = (book: any) => book?.slug || book?.title?.toLowerCase?.().replace(/[^a-z0-9]+/g, "-");
function legacyFilter(books: any[], settings: any): any[] {
  const manualSlugs = String(settings.manualSlugs || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const source = settings.productSource || "all";
  return (books || []).filter((book: any) => {
    if (source === "featured") return (book.isFeatured ?? book.featured) === true;
    if (source === "manual") return manualSlugs.includes(legacySlug(book));
    return true;
  });
}

const BOOKS = [
  { id: "a", slug: "alpha", title: "Alpha", retailPrice: 30, isFeatured: true, categories: ["Poetry"], publishDate: "2024-03-01" },
  { id: "b", slug: "beta", title: "beta", retailPrice: 12, salePrice: 9, isOnSale: true, categories: ["Zines"], createdAt: { seconds: 1_800_000_000 } },
  { id: "c", title: "Gamma Ray", retailPrice: 20, featured: true, categories: ["Chapbooks"], preorder: true, publishDate: "2999-01-01" },
  { id: "d", slug: "delta", title: "Delta", retailPrice: 0, variants: [{ id: "v", price: 15 }], isOnSale: true, salePrice: 5, genres: ["Poetry"], scheduleDate: "2025-06-01" },
  { id: "e", slug: "e", title: "Echo", retailPrice: 44, isFeatured: false, featured: true, categories: [] },
];

describe("saved catalog sections pick the same books as before", () => {
  const settingsMatrix: any[] = [
    {}, { productSource: "all" }, { productSource: "featured" }, { productSource: "manual", manualSlugs: "" },
    { productSource: "manual", manualSlugs: "delta, alpha" }, { productSource: "manual", manualSlugs: " gamma-ray ,beta,nope" },
    { productSource: "manual", manualSlugs: "e,, alpha" }, { productSource: "something-old" }, { manualSlugs: "alpha" },
  ];
  it.each(settingsMatrix.map((s) => [JSON.stringify(s), s]))("%s", (_name, settings) => {
    expect(selectBooks(BOOKS, sectionBookQuery(settings)).map((b) => b.id)).toEqual(legacyFilter(BOOKS, settings).map((b) => b.id));
  });

  it("matches the old rule for every catalog section in the published design", () => {
    const found: any[] = [];
    const walk = (v: any) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        if (/^Product(GridHeader|CoverCarousel|ShowcaseGrid)Section$/.test(v.type) && v.settings) found.push(v.settings);
        Object.values(v).forEach(walk);
      }
    };
    walk((live as any).design);
    expect(found.length).toBeGreaterThan(0);
    for (const settings of found) expect(selectBooks(BOOKS, sectionBookQuery(settings))).toEqual(legacyFilter(BOOKS, settings));
  });

  it("featured product still prefers the saved id, then the slug, then the first book", () => {
    expect(pickBook(BOOKS, { productId: "c", productSlug: "alpha" })?.id).toBe("c");
    expect(pickBook(BOOKS, { productSlug: "delta" })?.id).toBe("d");
    expect(pickBook(BOOKS, { productSlug: "nope" })?.id).toBe("a");
    // Storefront books always carry a resolved slug (resolveProductRoutes), so blank = the first book.
    expect(pickBook(BOOKS.filter((b) => b.slug), {})?.id).toBe("a");
    expect(pickBook([], {})).toBeUndefined();
  });
});

describe("new catalog sources", () => {
  const ids = (q: any) => selectBooks(BOOKS, q).map((b) => b.id);
  it("category includes books filed under a renamed name and sub-categories", () => {
    const categories = [{ id: "p", name: "Poetry", aliases: ["Verse"] }, { id: "s", name: "Small press", parentId: "p" }];
    expect(ids({ source: "category", category: "Poetry", categories })).toEqual(["a", "d"]);
    const withChild = [...BOOKS, { id: "f", slug: "f", title: "Foxtrot", categories: ["Small press"] }, { id: "g", slug: "g", title: "Golf", categories: ["Verse"] }];
    expect(selectBooks(withChild, { source: "category", category: "Poetry", categories }).map((b) => b.id)).toEqual(["a", "d", "f", "g"]);
    expect(ids({ source: "category", category: "Zines" })).toEqual(["b"]);
    expect(ids({ source: "category", category: "" })).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("on sale follows the card's SALE badge (editions never show one)", () => {
    expect(ids({ source: "onSale" })).toEqual(["b"]);
  });
  it("pre-orders are books still waiting for their publication date", () => {
    expect(ids({ source: "preorder" })).toEqual(["c"]);
  });
  it("newest sorts by publication date, release date, then when the book was added", () => {
    expect(ids({ source: "newest" })).toEqual(["c", "b", "d", "a", "e"]);
    expect(bookDateMs({ createdAt: { toMillis: () => 5 } })).toBe(5);
    expect(bookDateMs({})).toBe(0);
  });
  it("sorts by title, price (cheapest edition) and the picked order", () => {
    expect(ids({ sort: "title" })).toEqual(["a", "b", "d", "e", "c"]);
    expect(ids({ sort: "priceLow" })).toEqual(["b", "d", "c", "a", "e"]);
    expect(ids({ sort: "priceHigh" })).toEqual(["e", "a", "c", "d", "b"]);
    expect(ids({ source: "manual", manual: "delta, gamma-ray, alpha", sort: "picked" })).toEqual(["d", "c", "a"]);
    expect(ids({ source: "manual", manual: "delta, gamma-ray, alpha" })).toEqual(["a", "c", "d"]);
    // A picker saves the immutable id for a book whose slug collides; slugs and ids mix freely.
    expect(ids({ source: "manual", manual: "e, c, alpha", sort: "picked" })).toEqual(["e", "c", "a"]);
    expect(pickBook(BOOKS, { productSlug: "c" })?.id).toBe("c");
  });
  it("applies a limit after sorting", () => {
    expect(ids({ sort: "priceHigh", limit: 2 })).toEqual(["e", "a"]);
    expect(ids({ limit: 0 })).toEqual([]);
  });
  it("saves picked books in the comma-separated form typed before", () => {
    expect(joinSlugList(["a", " b ", "", "c"])).toBe("a, b, c");
    expect(parseSlugList("a, b ,,c")).toEqual(["a", "b", "c"]);
    expect(parseSlugList(undefined)).toEqual([]);
  });
});
