import { describe, expect, it } from "vitest";
import { applyThemeKeysToSurfaces } from "./themeScope";
import { layerDesign } from "../features/site/designModel";

describe("applyThemeKeysToSurfaces", () => {
  it("applies visual settings to every template and the root", () => {
    const result = applyThemeKeysToSurfaces(
      {
        backgroundColor: "#000000",
        heroPage: { sections: [{ id: "hero" }], backgroundColor: "#111111" },
        productPage: { sections: [{ id: "details" }] },
      },
      { backgroundColor: "#fafafa", primaryColor: "#ff00aa" },
      ["heroPage", "productPage", "page:about"],
    );

    expect(result.backgroundColor).toBe("#fafafa");
    expect(result.primaryColor).toBe("#ff00aa");
    // Page overrides of those keys are cleared, so every page shows the new values…
    expect(layerDesign(result, result.heroPage).backgroundColor).toBe("#fafafa");
    expect(layerDesign(result, result.productPage).primaryColor).toBe("#ff00aa");
    expect(result.heroPage.backgroundColor).toBeUndefined();
    // …and no empty page copies are created.
    expect(result["page:about"]).toBeUndefined();
  });

  it("preserves each template's sections and unrelated settings", () => {
    const sections = [{ id: "hero" }];
    const result = applyThemeKeysToSurfaces(
      { heroPage: { sections, showHero: false } },
      { textColor: "#222222" },
      ["heroPage"],
    );

    expect(result.heroPage.sections).toBe(sections);
    expect(result.heroPage.showHero).toBe(false);
    expect(layerDesign(result, result.heroPage).textColor).toBe("#222222");
  });

  it("does not mutate the current draft", () => {
    const design = { heroPage: { textColor: "#ffffff" } };
    const result = applyThemeKeysToSurfaces(design, { textColor: "#000000" }, ["heroPage"]);

    expect(result).not.toBe(design);
    expect(result.heroPage).not.toBe(design.heroPage);
    expect(design.heroPage.textColor).toBe("#ffffff");
    expect(result.heroPage.textColor).toBeUndefined();
  });
});
