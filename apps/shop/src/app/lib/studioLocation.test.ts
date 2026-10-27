import { describe, expect, it } from "vitest";
import { locationForPath, parseStudioLocation, studioHash } from "./studioLocation";

describe("Studio links", () => {
  it("round-trips a location", () => {
    const loc = { templateId: "productPage", productSlug: "night-pages", leftTab: "style" as const, device: "mobile" as const };
    expect(parseStudioLocation(studioHash(loc))).toEqual(loc);
    expect(studioHash({})).toBe("#designer");
    expect(parseStudioLocation("#designer")).toEqual({});
  });
  it("ignores anything unexpected", () => {
    expect(parseStudioLocation("#orders/123")).toBeNull();
    expect(parseStudioLocation("#designer?t=<script>&tab=hack&d=watch&b=../../x")).toEqual({});
  });
  it("a book or collection implies its page type", () => {
    expect(parseStudioLocation("#designer?b=night")).toEqual({ templateId: "productPage", productSlug: "night" });
    expect(parseStudioLocation("#designer?c=zines")).toEqual({ templateId: "collectionPage", collectionSlug: "zines" });
  });
  it("maps storefront addresses to the page you were looking at", () => {
    const base = "/ShopTrial/";
    expect(locationForPath("/ShopTrial/books/night-pages", base)).toEqual({ templateId: "productPage", productSlug: "night-pages" });
    expect(locationForPath("/ShopTrial/page/about", base)).toEqual({ templateId: "page:about" });
    expect(locationForPath("/ShopTrial/collections/zines", base)).toEqual({ templateId: "collectionPage", collectionSlug: "zines" });
    expect(locationForPath("/ShopTrial/", base)).toEqual({ templateId: "heroPage" });
  });

  it("sends links to the retired Shared layout tab to Page layout", () => {
    expect(parseStudioLocation("#designer?tab=shared")?.leftTab).toBe("sections");
  });

  it("links straight to the Media library", () => {
    expect(parseStudioLocation(studioHash({ leftTab: "media" }))?.leftTab).toBe("media");
  });
});
