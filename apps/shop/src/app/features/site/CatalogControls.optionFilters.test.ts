import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, appliedFilters, applyCatalogControls, filterView, filtersActive, matchesOptions, optionFilterKey, optionFiltersIn } from "./CatalogControls";

const tee = (id: string, sizes: string[], colours: string[], price = 30) => ({
  id, title: id, retailPrice: price, kind: "clothing", createdAt: id,
  options: [{ name: "Size", values: sizes }, { name: "Colour", values: colours }],
});
const candle = { id: "c", title: "c", retailPrice: 20, kind: "other", createdAt: "c", options: [{ name: "Scent", values: ["Fig", "Cedar"] }] };
const book = { id: "b", title: "b", retailPrice: 18, createdAt: "b", options: [{ name: "Format", values: ["Paperback", "Hardcover"] }] };

describe("option filters", () => {
  it("knows which options shoppers filter by, whatever the spelling", () => {
    expect(optionFilterKey("Color")).toBe("colour");
    expect(optionFilterKey(" SIZE ")).toBe("size");
    expect(optionFilterKey("Format")).toBeNull();
  });

  it("offers an option only when the products on screen have two or more of its values", () => {
    const filters = optionFiltersIn([tee("a", ["S", "M"], ["Black"]), tee("d", ["M", "L"], ["black"]), candle, book]);
    expect(filters.map((f) => f.key)).toEqual(["size", "scent"]);
    expect(filters[0].values.map((v) => v.label)).toEqual(["S", "M", "L"]);
  });

  it("keeps products that come in a picked value of every picked option", () => {
    const items = [tee("a", ["S", "M"], ["Black", "White"]), tee("d", ["L"], ["Black", "Red"]), candle];
    const view = filterView(items);
    const filters = { ...EMPTY_FILTERS, options: { size: ["m", "l"], colour: ["red"] } };
    const applied = appliedFilters(filters, view);
    expect(applyCatalogControls(items, "", "newest", false, applied.priceRange, applied.formats, applied.onSale, false, applied.options).map((i) => i.id)).toEqual(["d"]);
    expect(filtersActive(filters, "", false, view)).toBe(true);
    expect(matchesOptions(candle, {})).toBe(true);
  });

  it("ignores a picked value that isn't on screen", () => {
    const items = [tee("a", ["S", "M"], ["Black"])];
    const view = filterView(items);
    const filters = { ...EMPTY_FILTERS, options: { scent: ["fig"] } };
    expect(appliedFilters(filters, view).options).toEqual({});
    expect(filtersActive(filters, "", false, view)).toBe(false);
  });
});
