import { describe, expect, it } from "vitest";
import { catalogStateInUrlOn, catalogUrlSearch, readCatalogUrl } from "./catalogUrlState";
import { EMPTY_FILTERS } from "./CatalogControls";

const base = { query: "", sort: "featured" as const, inStockOnly: false, filters: EMPTY_FILTERS };

describe("catalog state in the address", () => {
  it("is off unless switched on", () => {
    expect(catalogStateInUrlOn({})).toBe(false);
    expect(catalogStateInUrlOn({ catalogStateInUrl: "yes" })).toBe(false);
    expect(catalogStateInUrlOn({ catalogStateInUrl: true })).toBe(true);
  });

  it("writes nothing for the default view and keeps other parameters", () => {
    expect(catalogUrlSearch("", base)).toBe("");
    expect(catalogUrlSearch("?utm_source=mail&sort=price_asc", base)).toBe("?utm_source=mail");
  });

  it("round-trips every choice", () => {
    const state = { query: "zine", sort: "price_desc" as const, inStockOnly: true, filters: { formats: ["ebook", "paperback"] as any, minPrice: "5", maxPrice: "40.50", onSale: true } };
    const search = catalogUrlSearch("?ref=ig", state);
    expect(search).toBe("?ref=ig&q=zine&sort=price_desc&stock=1&sale=1&format=paperback,ebook&min=5&max=40.50");
    expect(readCatalogUrl(search)).toEqual({ ...state, filters: { ...state.filters, formats: ["paperback", "ebook"] } });
  });

  it("ignores malformed values", () => {
    const read = readCatalogUrl("?sort=hack&format=vinyl,ebook&min=-3&max=1e9&stock=yes");
    expect(read.sort).toBe("featured");
    expect(read.filters.formats).toEqual(["ebook"]);
    expect(read.filters.minPrice).toBe("");
    expect(read.filters.maxPrice).toBe("");
    expect(read.inStockOnly).toBe(false);
    expect(readCatalogUrl("?q=" + "a".repeat(300)).query.length).toBe(100);
  });
});
