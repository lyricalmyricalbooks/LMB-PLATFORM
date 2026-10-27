import { describe, expect, it, vi } from "vitest";
import { CATALOG_PAGE_SIZE, loadCatalog, newestFirst } from "./loadCatalog";
describe("public catalog pagination", () => {
  it("loads past the first page without caching document snapshots", async () => {
    const first = Array.from({ length: CATALOG_PAGE_SIZE }, (_, i) => ({ id: String(i), _lastDoc: { id: String(i) } }));
    const fetch = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce([{ id: "extra" }]);
    const books = await loadCatalog(fetch);
    expect(books).toHaveLength(CATALOG_PAGE_SIZE + 1);
    expect(fetch).toHaveBeenNthCalledWith(2, CATALOG_PAGE_SIZE, first[CATALOG_PAGE_SIZE - 1]._lastDoc);
    expect(books[0]).not.toHaveProperty("_lastDoc");
  });
  it("rejects a stuck cursor instead of looping forever", async () => {
    const fetch = vi.fn().mockResolvedValue(Array.from({ length: CATALOG_PAGE_SIZE }, () => ({ id: "same", _lastDoc: { id: "same" } })));
    await expect(loadCatalog(fetch)).rejects.toThrow();
  });
});

it("preserves newest-first product selection with undated legacy entries last", () => {
  const books = [{ id: "a" }, { id: "b", createdAt: "2025-01-01T00:00:00Z" }, { id: "c", createdAt: "2026-01-01T00:00:00Z" }];
  expect(newestFirst(books).map(book => book.id)).toEqual(["c", "b", "a"]);
  expect(books.map(book => book.id)).toEqual(["a", "b", "c"]);
});
