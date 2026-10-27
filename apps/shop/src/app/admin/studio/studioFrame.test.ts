import { describe, expect, it } from "vitest";
import { fitScale, parseUiState } from "./studioUiState";
import { currentOption, filterOptions, pickerOptions } from "./templatePicker";

const templates = [
  { id: "heroPage", label: "Home" }, { id: "storefront", label: "Catalog / Shop" }, { id: "productPage", label: "Product" },
  { id: "collectionPage", label: "Collection" }, { id: "cartPage", label: "Cart" }, { id: "page", label: "Custom Pages" },
  { id: "page404", label: "404" }, { id: "page:about", label: "About", pageSlug: "about" },
];

describe("page picker", () => {
  const options = pickerOptions({ templates, books: [{ slug: "night", title: "Night Pages" }], collections: [{ slug: "zines", label: "Zines" }] });
  it("lists store pages, collections, books, custom pages and every-page sections", () => {
    expect(options.map(o => o.group)).toEqual(expect.arrayContaining(["Store pages", "Collections", "Book pages", "Custom pages", "Every page"]));
    expect(options.find(o => o.label === "Night Pages")).toMatchObject({ templateId: "productPage", productSlug: "night" });
    expect(options.find(o => o.label === "Zines")).toMatchObject({ templateId: "collectionPage", collectionSlug: "zines" });
  });
  it("finds options by any word", () => {
    expect(filterOptions(options, "book night").map(o => o.label)).toEqual(["Night Pages"]);
    expect(filterOptions(options, "")).toHaveLength(options.length);
  });
  it("names what is on screen now", () => {
    expect(currentOption(options, { templateId: "productPage", showGlobal: false, productSlug: "night" })?.label).toBe("Night Pages");
    expect(currentOption(options, { templateId: "heroPage", showGlobal: true })?.global).toBe(true);
    expect(currentOption(options, { templateId: "page:about", showGlobal: false })?.label).toBe("About");
  });
  it("still offers the book page when no book is published yet", () => {
    expect(pickerOptions({ templates, books: [], collections: [] }).some(o => o.templateId === "productPage")).toBe(true);
  });
});

describe("remembered Studio layout", () => {
  it("keeps valid values and drops anything unexpected", () => {
    expect(parseUiState(JSON.stringify({ leftTab: "style", device: "tablet", zoom: 75, templateId: "page:about" })))
      .toMatchObject({ leftTab: "style", device: "tablet", zoom: 75, templateId: "page:about" });
    expect(parseUiState(JSON.stringify({ leftTab: "hack", device: "watch", zoom: 33 }))).toMatchObject({ leftTab: undefined, device: undefined, zoom: undefined });
    expect(parseUiState(JSON.stringify({ leftTab: "shared" })).leftTab).toBe("sections");
    expect(parseUiState("not json")).toEqual({});
  });
  it("fits a preview into the canvas without enlarging it", () => {
    expect(fitScale(600, 1200)).toBe(0.5);
    expect(fitScale(2000, 1200)).toBe(1);
    expect(fitScale(0, 1200)).toBe(1);
  });
});
