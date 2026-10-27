import { describe, expect, it } from "vitest";
import { shopFilterBarCategories, shopFilterBarCss, shopFilterBarFontNames, showShopFilterBar, shopFilterBarCounts, shopFilterBarInStock } from "./shopFilterBar";
import { catalogHeaderMaxWidth, contentMaxWidth, isFullWidth } from "./headerNav";

const cats = [
  { id: "pub", name: "PUBLICATIONS", parentId: null, showInNav: true },
  { id: "b", name: "Books", parentId: "pub", showInNav: true },
  { id: "z", name: "Zines", parentId: "pub", showInNav: true },
  { id: "h", name: "Hidden", parentId: null, showInNav: false },
  { id: "p", name: "Prints", parentId: null },
];

describe("shop filter bar", () => {
  it("is off until the owner turns it on, numbers off, In stock on", () => {
    expect(showShopFilterBar({})).toBe(false);
    expect(shopFilterBarCounts({})).toBe(false);
    expect(shopFilterBarInStock({})).toBe(true);
    expect(shopFilterBarCss({})).toBe("");
    expect(shopFilterBarFontNames({})).toEqual([]);
  });

  it("offers the visible categories without visible sub-categories (Books, Zines — not their parent)", () => {
    expect(shopFilterBarCategories(cats).map((c: any) => c.name)).toEqual(["Books", "Zines", "Prints"]);
    expect(shopFilterBarCategories(["A", "B"])).toEqual(["A", "B"]);
    expect(shopFilterBarCategories(undefined as any)).toEqual([]);
  });

  it("keeps a parent whose sub-categories are all hidden", () => {
    const c = [{ id: "pub", name: "PUBLICATIONS" }, { id: "b", name: "Books", parentId: "pub", showInNav: false }];
    expect(shopFilterBarCategories(c).map((x: any) => x.name)).toEqual(["PUBLICATIONS"]);
  });

  it("draws the bar only while shown, and loads its font", () => {
    const css = shopFilterBarCss({ showShopFilterBar: true, shopFilterBarActiveColor: "#ff0000" });
    expect(css).toContain(".fm-filter-bar button[aria-pressed=\"true\"]{border-color:#ff0000");
    expect(shopFilterBarFontNames({ showShopFilterBar: true })).toEqual(["DM Mono"]);
  });

  it("styles the catalog heading only for the controls that are set", () => {
    const css = shopFilterBarCss({ catalogHeadingFont: "Anton", catalogHeadingSize: 72, catalogHeadingSizeMobile: 0 });
    expect(css).toContain("font-family:'Anton'");
    expect(css).toContain("font-size:72px");
    expect(css).not.toContain("max-width:767px");
    expect(shopFilterBarFontNames({ catalogHeadingFont: "Anton" })).toEqual(["Anton"]);
  });

  it("refuses CSS injection through colour fields", () => {
    expect(shopFilterBarCss({ showShopFilterBar: true, shopFilterBarBorderColor: "red;}body{x" })).not.toContain(";}body{");
  });
});

describe("full width", () => {
  it("keeps the content width until the switch is on", () => {
    expect(isFullWidth({})).toBe(false);
    expect(contentMaxWidth({ containerWidth: 1060 })).toBe(1060);
    expect(catalogHeaderMaxWidth({ containerWidth: 1060 })).toBe(1060);
    expect(catalogHeaderMaxWidth({ containerWidth: 1060, catalogHeaderWidth: 1500 })).toBe(1500);
  });
  it("runs every column to the screen edges when on", () => {
    expect(contentMaxWidth({ fullWidth: true, containerWidth: 1060 })).toBe("100%");
    expect(catalogHeaderMaxWidth({ fullWidth: true, catalogHeaderWidth: 1500 })).toBe("100%");
  });
});
