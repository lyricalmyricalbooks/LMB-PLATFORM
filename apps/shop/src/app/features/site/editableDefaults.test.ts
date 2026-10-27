import { describe, expect, it } from "vitest";
import { getCopy } from "./storeCopy";
import { designNumber } from "./designNumber";
import { placeholderImage, DEFAULT_IMAGE } from "./constants";
import { getFeaturedBooks } from "./selectors";

describe("values that used to be hard-coded are now Studio settings", () => {
  it("{name} in any copy string follows Site & sharing › Site name", () => {
    expect(getCopy(null, "seoCheckoutDescription")).toBe("Secure checkout for Lyricalmyrical Books.");
    expect(getCopy({ copy: { siteName: "Acme Press" } }, "seoCheckoutDescription")).toBe("Secure checkout for Acme Press.");
    expect(getCopy({ copy: { siteName: "Acme Press" } }, "siteTitleFormat", { title: "Cart" })).toBe("Cart — Acme Press");
  });

  it("checkout error messages are editable and take their numbers as tokens", () => {
    expect(getCopy({ copy: { coErrMinItems: "Need {count} books" } }, "coErrMinItems", { count: 3 })).toBe("Need 3 books");
  });

  it("designNumber uses the Studio value, else the default", () => {
    expect(designNumber({ lowStockCardThreshold: 3 }, "lowStockCardThreshold", 5)).toBe(3);
    expect(designNumber({ lowStockCardThreshold: "" }, "lowStockCardThreshold", 5)).toBe(5);
    expect(designNumber({}, "lowStockCardThreshold", 5)).toBe(5);
    expect(designNumber({ lowStockCardThreshold: "abc" }, "lowStockCardThreshold", 5)).toBe(5);
  });

  it("the no-photo placeholder can be replaced", () => {
    expect(placeholderImage({})).toBe(DEFAULT_IMAGE);
    expect(placeholderImage({ placeholderImageUrl: "https://x/y.png" })).toBe("https://x/y.png");
  });

  it("never invents sample books when none are featured", () => {
    expect(getFeaturedBooks([])).toEqual([]);
    const published = [{ id: "a", title: "A", status: "published" }, { id: "b", title: "B", status: "draft" }] as any[];
    expect(getFeaturedBooks(published).map((b) => b.id)).toEqual(["a"]);
  });
});
