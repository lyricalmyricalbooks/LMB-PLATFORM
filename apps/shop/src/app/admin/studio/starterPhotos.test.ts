import { describe, expect, it } from "vitest";
import { getSectionMeta } from "../ThemeEditorExtensions";
import { libraryLook, STARTER_SITES } from "../lookGallery";
import { applyStarter, PRODUCT_SECTIONS, starterForShop } from "./starterDesign";
import { presetSections } from "./presetContent";
import { themeProblems } from "./themeCheck";
import { mainPictureKeys, starterPhotos } from "./starterPhotos";

describe("starters arrive with the shop's sample photos", () => {
  it("knows each section's main picture field", () => {
    expect(mainPictureKeys("ImageWithTextSection")).toEqual(["imageUrl"]);
    expect(mainPictureKeys("NewsletterSection")).not.toContain("mobileImageUrl");
  });
  it("fills every whole-website starter's empty pictures for a clothing shop, and keeps photos a starter brings", () => {
    for (const id of STARTER_SITES) {
      const theme = libraryLook(id);
      const plain = JSON.stringify(applyStarter({}, theme, getSectionMeta));
      const filled = JSON.stringify(applyStarter({}, theme, getSectionMeta, (t) => t, starterPhotos("clothing", "/")));
      for (const own of plain.match(/\/starters\/[^"]+/g) || []) expect(filled, id).toContain(own);
      expect(filled.includes("/samples/") || !/"imageUrl":""/.test(plain), id).toBe(true);
      expect(filled, id).not.toMatch(/\/samples\/(?!clothing\/)/);
    }
  });
});

describe("a services shop's version of every starter", () => {
  it("swaps product rows for the price list and booking cards, adds hours, and keeps the rest", () => {
    for (const id of STARTER_SITES) {
      const theme = libraryLook(id);
      const goods = presetSections(theme);
      const services = presetSections(starterForShop(theme, "hair"));
      for (const [page, list] of Object.entries(services)) {
        const before = goods[page];
        expect(list.some((s) => PRODUCT_SECTIONS.has(s.type)), `${id} ${page}`).toBe(false);
        const hadProducts = before.some((s) => PRODUCT_SECTIONS.has(s.type));
        expect(list.some((s) => s.type === "ServiceMenuSection"), `${id} ${page}`).toBe(hadProducts);
        expect(list.some((s) => s.type === "BookingHoursSection"), `${id} ${page}`).toBe(hadProducts);
        expect(list.filter((s) => !/Service|Book/.test(s.type)).map((s) => s.type)).toEqual(before.filter((s) => !PRODUCT_SECTIONS.has(s.type)).map((s) => s.type));
      }
      expect(starterForShop(theme, "clothing")).toBe(theme);
      expect(starterForShop(theme, null)).toBe(theme);
      const design = applyStarter({}, starterForShop(theme, "hair"), getSectionMeta, (t) => t, starterPhotos("hair", "/"));
      expect(themeProblems(starterForShop(theme, "hair")), id).toEqual([]);
      expect(JSON.stringify(design)).toContain("ServiceMenuSection");
      // The price list keeps its own words: its Book button is never turned into "Product".
      expect(JSON.stringify(design), id).not.toMatch(/"(?:buttonLabel|buttonText|ctaText)":"Product"/);
    }
  });
});
