import { describe, expect, it } from "vitest";
import { artistCounts, creditLine, markMatches, matchingArtists, matchingCategories, newestBooks, stockState, visibleCategoryCounts } from "./searchPanel";

const books = [
  { id: "a", title: "Oltre il tempo", subtitle: "Sara Ferri", categories: ["Photography books"], publishDate: "2026-03-01" },
  { id: "b", title: "Un fantastico altrove", subtitle: "Sara Ferri", categories: ["Photography books"], publishDate: "2026-09-01" },
  { id: "c", title: "Cream Show", subtitle: "Various artists", categories: ["Zines"], publishDate: "2025-01-01" },
  { id: "d", title: "The Hound", authorName: "Jan Achterberg", categories: ["Art books"] },
];
const categories = [
  { id: "p", name: "Photobooks" },
  { id: "ph", name: "Photography books", parentId: "p" },
  { id: "z", name: "Zines" },
  { id: "x", name: "Hidden", showInNav: false },
];

describe("search drawer helpers", () => {
  it("lists artists from the credit, counting their books and skipping group credits", () => {
    expect(matchingArtists(artistCounts(books), "ferri")).toEqual([{ name: "Sara Ferri", count: 2 }]);
    expect(matchingArtists(artistCounts(books), "achter")).toEqual([{ name: "Jan Achterberg", count: 1 }]);
    expect(matchingArtists(artistCounts(books), "various")).toEqual([]);
  });

  it("counts visible categories, parents including their sub-categories, children after their parent", () => {
    const counts = visibleCategoryCounts(categories, books);
    expect(counts.map(c => [c.name, c.count, c.child])).toEqual([
      ["Photobooks", 2, false],
      ["Photography books", 2, true],
      ["Zines", 1, false],
    ]);
    expect(matchingCategories(visibleCategoryCounts(categories, books), "photo").map(c => c.name)).toEqual(["Photobooks", "Photography books"]);
    expect(matchingCategories(visibleCategoryCounts(categories, books), "hidden")).toEqual([]);
  });

  it("keeps PUBLICATIONS (every book) and treats children of a hidden parent as top level", () => {
    const tree = [{ id: "p", name: "PUBLICATIONS" }, { id: "b", name: "BOOKS", parentId: "p" }, { id: "h", name: "Gone", showInNav: false }, { id: "k", name: "Kids", parentId: "h" }];
    expect(visibleCategoryCounts(tree, [{ categories: ["BOOKS"] }, { categories: ["Kids"] }]).map(c => [c.name, c.count, c.child])).toEqual([
      ["PUBLICATIONS", 2, false],
      ["BOOKS", 1, true],
      ["Kids", 1, false],
    ]);
  });

  it("counts a large catalog quickly", () => {
    const cats = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}`, parentId: i % 4 ? `c${i - (i % 4)}` : undefined }));
    const many = Array.from({ length: 1000 }, (_, i) => ({ categories: [`Cat ${i % 40}`] }));
    const start = performance.now();
    const counts = visibleCategoryCounts(cats, many);
    expect(performance.now() - start).toBeLessThan(100);
    expect(counts[0].count).toBe(100);
  });

  it("picks the newest books first", () => {
    expect(newestBooks(books, 2).map(b => b.id)).toEqual(["b", "a"]);
  });

  it("names the stock state the way the product page does", () => {
    expect(stockState({ comingSoon: true }).state).toBe("soon");
    expect(stockState({ trackInventory: true, stockLevel: 0 }).state).toBe("out");
    expect(stockState({ trackInventory: true, stockLevel: 3 }, 5)).toEqual({ state: "low", count: 3 });
    expect(stockState({ trackInventory: true, stockLevel: 30 }, 5).state).toBe("in");
  });

  it("marks every typed word, ignoring accents and case", () => {
    expect(markMatches("Photobooks", "photo")).toEqual([{ text: "Photo", mark: true }, { text: "books", mark: false }]);
    expect(markMatches("Bénédicte", "bene")).toEqual([{ text: "Béné", mark: true }, { text: "dicte", mark: false }]);
    expect(markMatches("Plain", "")).toEqual([{ text: "Plain", mark: false }]);
  });

  it("uses the contributors box before the legacy author", () => {
    expect(creditLine({ subtitle: "A, B", authorName: "C" })).toBe("A, B");
    expect(creditLine({ authorName: "C" })).toBe("C");
  });
});
