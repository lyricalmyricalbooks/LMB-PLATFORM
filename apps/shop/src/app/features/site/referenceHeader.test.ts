import { describe, expect, it } from "vitest";
import { ownNavLinkStyle } from "./headerNav";
import { referenceCategoryLimit, referenceNavCategories, usesReferenceHeader } from "./navItems";

describe("the default (Reference) shop header", () => {
  it("is every layout except Modern", () => {
    expect(usesReferenceHeader({})).toBe(true);
    expect(usesReferenceHeader({ catalogLayoutStyle: "reference" })).toBe(true);
    expect(usesReferenceHeader({ catalogLayoutStyle: "modern" })).toBe(false);
  });

  it("shows the first N visible top-level categories (Max categories in the nav, default 1)", () => {
    const cats = [{ id: "a", name: "A" }, { id: "h", name: "Hidden", showInNav: false }, { id: "b", name: "B" }, { id: "c", name: "C", parentId: "a" }, { id: "d", name: "D" }];
    expect(referenceNavCategories(cats, {}).map(c => c.id)).toEqual(["a"]);
    expect(referenceNavCategories(cats, { referenceCategoryLimit: 3 }).map(c => c.id)).toEqual(["a", "b", "d"]);
    expect(referenceCategoryLimit({ referenceCategoryLimit: 40 })).toBe(12);
  });

  it("takes only the Navigation links values the owner set, so an untouched design looks the same", () => {
    expect(ownNavLinkStyle({}, false)).toEqual({});
    expect(ownNavLinkStyle({ navLinkColor: "#ff0000", navLinkSize: 14, navLinkTransform: "uppercase" }, false))
      .toEqual({ color: "#ff0000", fontSize: "14px", textTransform: "uppercase" });
    expect(ownNavLinkStyle({ navLinkColor: "#ff0000", navLinkActiveColor: "#00ff00", navLinkOpacity: 0.5 }, true)).toEqual({ color: "#00ff00" });
    expect(ownNavLinkStyle({ navLinkOpacity: 0.5 }, false)).toEqual({ opacity: 0.5 });
  });
});
