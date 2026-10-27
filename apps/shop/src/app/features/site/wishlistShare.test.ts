import { describe, expect, it } from "vitest";
import { cleanSharedIds, idsToMerge, MAX_SHARED_BOOKS, sharedWishlistIds, wishlistShareUrl } from "./wishlistShare";

describe("wishlist share links", () => {
  it("builds a link under the site base", () => {
    expect(wishlistShareUrl(["a1", "b2"], "https://shop.test")).toBe("https://shop.test/wishlist?shared=a1,b2");
    expect(wishlistShareUrl(["a1"], "https://shop.test", "/sub")).toBe("https://shop.test/sub/wishlist?shared=a1");
    expect(wishlistShareUrl([], "https://shop.test")).toBe("");
  });

  it("reads only shared links, dropping bad and repeated ids", () => {
    expect(sharedWishlistIds("")).toBeNull();
    expect(sharedWishlistIds("?preview=true")).toBeNull();
    expect(sharedWishlistIds("?shared=a1,a1,,b-2,<x>,c_3")).toEqual(["a1", "b-2", "c_3"]);
    expect(sharedWishlistIds("?shared=")).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 100 }, (_, i) => `id${i}`);
    expect(cleanSharedIds(many)).toHaveLength(MAX_SHARED_BOOKS);
  });

  it("merges only books not already saved", () => {
    expect(idsToMerge(["a", "b"], ["b", "c"])).toEqual(["c"]);
  });
});
