import { describe, expect, it } from "vitest";
import { emptyBagPicks, emptyBagPicksCount, emptyBagPicksOn } from "./emptyBagPicks";

describe("empty bag suggestions", () => {
  it("is off unless switched on", () => {
    expect(emptyBagPicksOn({})).toBe(false);
    expect(emptyBagPicksOn({ cartDrawerEmptyPicks: "true" })).toBe(false);
    expect(emptyBagPicksOn({ cartDrawerEmptyPicks: true })).toBe(true);
  });

  it("offers 1–4 books, 3 when unset", () => {
    expect(emptyBagPicksCount({})).toBe(3);
    expect(emptyBagPicksCount({ cartDrawerEmptyPicksCount: 0 })).toBe(3);
    expect(emptyBagPicksCount({ cartDrawerEmptyPicksCount: 1 })).toBe(1);
    expect(emptyBagPicksCount({ cartDrawerEmptyPicksCount: 9 })).toBe(4);
  });

  it("puts featured books first, then the newest, ties by id", () => {
    const books = [
      { id: "old", publishDate: "2024-01-01" },
      { id: "new", publishDate: "2026-09-01" },
      { id: "star", publishDate: "2020-01-01", isFeatured: true },
      { id: "b" },
      { id: "a" },
    ];
    expect(emptyBagPicks(books, 3).map((b) => b.id)).toEqual(["star", "new", "old"]);
    expect(emptyBagPicks(books, 5).map((b) => b.id)).toEqual(["star", "new", "old", "a", "b"]);
    expect(emptyBagPicks(books, 0)).toEqual([]);
    // The input list is left as it was.
    expect(books[0].id).toBe("old");
  });
});
