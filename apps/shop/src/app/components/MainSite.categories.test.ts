import { describe, expect, it } from "vitest";
import { CATEGORIES } from "../features/site/constants";
import { storefrontCategories } from "./MainSite";

describe("storefrontCategories", () => {
  it("keeps valid category arrays", () => {
    expect(storefrontCategories(["Books", { id: "zines", name: "Zines" }])).toEqual([
      "Books",
      { id: "zines", name: "Zines" },
    ]);
  });

  it("falls back safely for stale non-array designs", () => {
    expect(storefrontCategories({ Books: true })).toEqual(CATEGORIES);
    expect(storefrontCategories(null)).toEqual(CATEGORIES);
  });
});
