import { describe, expect, it } from "vitest";
import { addRecentSearch, MAX_RECENT_SEARCHES } from "./recentSearches";

describe("addRecentSearch", () => {
  it("puts the newest first and drops case-insensitive repeats", () => {
    expect(addRecentSearch(["poetry", "Lyric"], "lyric")).toEqual(["lyric", "poetry"]);
  });
  it("ignores empty or one-letter terms and tidies spaces", () => {
    expect(addRecentSearch(["a b"], " x ")).toEqual(["a b"]);
    expect(addRecentSearch([], "  new   poems ")).toEqual(["new poems"]);
  });
  it("keeps only the most recent few", () => {
    let list: string[] = [];
    for (let i = 0; i < 9; i++) list = addRecentSearch(list, `term ${i}`);
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0]).toBe("term 8");
  });
});
