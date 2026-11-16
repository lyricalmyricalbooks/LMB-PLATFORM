import { describe, it, expect } from "vitest";
import { isStockLinked, linkedTo } from "./inventoryLink";

describe("stockroom links", () => {
  const links = { b1: { _: "hound" }, b2: { pb: "alt-pb", hc: "" } };
  it("finds the stockroom book of a book or edition", () => {
    expect(linkedTo(links, "b1", null)).toBe("hound");
    expect(linkedTo(links, "b2", "pb")).toBe("alt-pb");
    expect(linkedTo(links, "b2", "hc")).toBeNull();
    expect(linkedTo(null, "b1", null)).toBeNull();
  });
  it("says whether the stockroom counts a book or one of its editions", () => {
    expect(isStockLinked(links, "b1")).toBe(true);
    expect(isStockLinked(links, "b2")).toBe(true);
    expect(isStockLinked(links, "b2", "hc")).toBe(false);
    expect(isStockLinked(links, "b3")).toBe(false);
    expect(isStockLinked(undefined, "b1")).toBe(false);
  });
});
