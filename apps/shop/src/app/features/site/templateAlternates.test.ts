import { describe, expect, it } from "vitest";
import { inheritedValue, isSurfaceKey, surfaceChain, writeDesignValue } from "./designModel";
import { resolveProductDesign } from "./surfaceDesign";
import {
  alternatesFor, bookTemplateSurface, categoryTemplateSurface, createAlternate, deleteAlternate, parseAltSurface,
  renameAlternate, sectionsSurface,
} from "./templateAlternates";

const base = () => ({
  accentColor: "#111111",
  storefront: { headerBg: "#222222" },
  productPage: { accentColor: "#333333", sections: [{ id: "a", type: "TextContentSection", settings: { title: "Default" } }] },
});

describe("alternate templates", () => {
  it("creates a template from the default with fresh section ids and inherited styles", () => {
    const { design, id } = createAlternate(base(), "productPage", "Poetry");
    expect(id).toBe("poetry");
    expect(alternatesFor(design, "productPage")).toEqual([{ id: "poetry", name: "Poetry" }]);
    const alt = design["productPage~poetry"];
    expect(alt.sections).toHaveLength(1);
    expect(alt.sections[0].id).not.toBe("a");
    expect(alt.sections[0].settings.title).toBe("Default");
    expect(alt.accentColor).toBeUndefined(); // follows the default's page style
    expect(createAlternate(design, "productPage", "Poetry").id).toBe("poetry-2");
  });
  it("copies another template's own page styles when made from it", () => {
    let { design } = createAlternate(base(), "productPage", "Poetry");
    design = writeDesignValue(design, "accentColor", "#ff0000", { surface: "productPage~poetry" });
    const made = createAlternate(design, "productPage", "Poetry large", "productPage~poetry");
    expect(made.design[`productPage~${made.id}`].accentColor).toBe("#ff0000");
  });
  it("renames and deletes", () => {
    let { design } = createAlternate(base(), "collectionPage", "Photo books");
    design = renameAlternate(design, "collectionPage", "photo-books", "Photography");
    expect(alternatesFor(design, "collectionPage")[0].name).toBe("Photography");
    design = deleteAlternate(design, "collectionPage", "photo-books");
    expect(alternatesFor(design, "collectionPage")).toEqual([]);
    expect(design["collectionPage~photo-books"]).toBeUndefined();
  });
  it("picks the book's or category's template only while it exists, and honours a preview override", () => {
    const { design } = createAlternate(base(), "productPage", "Poetry");
    expect(bookTemplateSurface(design, { templateId: "poetry" })).toBe("productPage~poetry");
    expect(bookTemplateSurface(design, { templateId: "gone" })).toBe("productPage");
    expect(bookTemplateSurface(design, { templateId: "poetry" }, "default")).toBe("productPage");
    expect(bookTemplateSurface(design, {}, "poetry")).toBe("productPage~poetry");
    expect(categoryTemplateSurface(design, { templateId: "poetry" })).toBe("collectionPage");
    expect(categoryTemplateSurface(design, "Zines")).toBe("collectionPage");
  });
  it("shows the default's sections when an alternate has none of its own", () => {
    const design = { ...base(), alternateTemplates: { productPage: [{ id: "x", name: "X" }] }, "productPage~x": { accentColor: "#fff" } };
    expect(sectionsSurface(design, "productPage~x")).toBe("productPage");
    expect(sectionsSurface({ ...design, "productPage~x": { sections: [] } }, "productPage~x")).toBe("productPage~x");
    expect(sectionsSurface(design, "heroPage")).toBe("heroPage");
  });
  it("only accepts well-formed template surfaces", () => {
    expect(parseAltSurface("productPage~poetry")).toEqual({ base: "productPage", id: "poetry" });
    expect(parseAltSurface("heroPage~x")).toBeNull();
    expect(parseAltSurface("productPage~Bad Id")).toBeNull();
  });
});

describe("alternate templates in the design model", () => {
  it("layers storefront → default → alternate", () => {
    let { design } = createAlternate(base(), "productPage", "Poetry");
    expect(isSurfaceKey("productPage~poetry")).toBe(true);
    expect(surfaceChain("productPage~poetry")).toEqual(["storefront", "productPage", "productPage~poetry"]);
    expect(inheritedValue(design, "productPage~poetry", "accentColor")).toBe("#333333");
    design = writeDesignValue(design, "accentColor", "#00ff00", { surface: "productPage~poetry" });
    expect(resolveProductDesign(design, "productPage~poetry").accentColor).toBe("#00ff00");
    expect(resolveProductDesign(design).accentColor).toBe("#333333");
    expect(resolveProductDesign(design, "productPage~poetry").headerBg).toBe("#222222");
  });
  it("an All pages edit clears the alternate's own value too", () => {
    let { design } = createAlternate(base(), "productPage", "Poetry");
    design = writeDesignValue(design, "accentColor", "#00ff00", { surface: "productPage~poetry" });
    design = writeDesignValue(design, "accentColor", "#abcdef", "all");
    expect(design["productPage~poetry"].accentColor).toBeUndefined();
    expect(resolveProductDesign(design, "productPage~poetry").accentColor).toBe("#abcdef");
  });
  it("keeps the template list shop-wide (a page can't override it)", async () => {
    const { layerDesign } = await import("./designModel");
    const d = { alternateTemplates: { productPage: [{ id: "a", name: "A" }] }, productPage: { alternateTemplates: { productPage: [] } } };
    expect(layerDesign(d, d.productPage).alternateTemplates.productPage).toHaveLength(1);
  });
});
