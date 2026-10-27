import { describe, expect, it } from "vitest";
import { queryFromSearch, searchResultsPath, MAX_SEARCH_QUERY } from "./searchResultsLink";

describe("search results link", () => {
  it("round-trips what was typed", () => {
    const path = searchResultsPath("  poems & más  ");
    expect(path.startsWith("/collections/all?q=")).toBe(true);
    expect(queryFromSearch(path.slice(path.indexOf("?")))).toBe("poems & más");
  });
  it("returns nothing when q is missing or blank", () => {
    expect(queryFromSearch("")).toBe("");
    expect(queryFromSearch("?q=%20")).toBe("");
    expect(queryFromSearch("?sort=new")).toBe("");
  });
  it("caps very long queries", () => {
    expect(queryFromSearch(`?q=${"a".repeat(500)}`).length).toBe(MAX_SEARCH_QUERY);
  });
});
