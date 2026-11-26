import { describe, expect, it } from "vitest";
import { getSectionMeta } from "../ThemeEditorExtensions";
import { libraryLook, STARTER_SITES } from "../lookGallery";
import { applyStarter, PRODUCT_SECTIONS, SERVICE_SECTIONS, starterForShop } from "./starterDesign";
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
      const own = plain.match(/\/(?:starters|samples)\/[^"]+/g) || [];
      for (const photo of own) expect(filled, id).toContain(photo);
      expect(filled.includes("/samples/") || !/"imageUrl":""/.test(plain), id).toBe(true);
      // Empty pictures come from the shop's own set; a photo the starter brings (its own sample shop) stays.
      for (const photo of filled.match(/\/samples\/[^"]+/g) || []) expect(own.includes(photo) || photo.startsWith("/samples/clothing/"), `${id} ${photo}`).toBe(true);
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
        const had = (type: string) => before.some((s) => s.type === type);
        expect(list.some((s) => s.type === "ServiceMenuSection"), `${id} ${page}`).toBe(hadProducts || had("ServiceMenuSection"));
        expect(list.some((s) => s.type === "BookingHoursSection"), `${id} ${page}`).toBe(hadProducts || had("BookingHoursSection"));
        expect(list.filter((s) => !/Service|Book/.test(s.type)).map((s) => s.type)).toEqual(before.filter((s) => !PRODUCT_SECTIONS.has(s.type) && !/Service|Book/.test(s.type)).map((s) => s.type));
      }
      const forServices = Object.values(goods).some((list) => list.some((s) => SERVICE_SECTIONS.has(s.type)));
      if (!forServices) expect(starterForShop(theme, "clothing")).toBe(theme);
      if (!forServices) expect(starterForShop(theme, null)).toBe(theme);
      const design = applyStarter({}, starterForShop(theme, "hair"), getSectionMeta, (t) => t, starterPhotos("hair", "/"));
      expect(themeProblems(starterForShop(theme, "hair")), id).toEqual([]);
      expect(JSON.stringify(design)).toMatch(/ServiceMenuSection|BookTimeSection/);
      // The price list keeps its own words: its Book button is never turned into "Product".
      expect(JSON.stringify(design), id).not.toMatch(/"(?:buttonLabel|buttonText|ctaText)":"Product"/);
    }
  });
});

describe("a product shop's version of a starter made for appointments or classes", () => {
  it("turns the first booking row into the product grid, drops the other booking rows and keeps the rest", () => {
    for (const id of ["starter-salon", "starter-workshop"]) {
      const theme = libraryLook(id);
      const goods = presetSections(starterForShop(theme, "clothing")).heroPage;
      const before = presetSections(theme).heroPage;
      expect(goods.some((s) => SERVICE_SECTIONS.has(s.type)), id).toBe(false);
      expect(goods.filter((s) => s.type === "ProductShowcaseGridSection"), id).toHaveLength(1);
      expect(goods.filter((s) => s.type !== "ProductShowcaseGridSection").map((s) => s.type)).toEqual(before.filter((s) => !SERVICE_SECTIONS.has(s.type)).map((s) => s.type));
      expect(themeProblems(starterForShop(theme, "books")), id).toEqual([]);
      expect(JSON.stringify(goods), id).not.toContain('"ctaUrl":"/book"');
    }
  });
});

describe("a Both shop's version of every starter (products and services)", () => {
  const firstIndex = (list: any[], test: (s: any) => boolean) => list.findIndex(test);
  const isProducts = (s: any) => PRODUCT_SECTIONS.has(s.type);
  const isServices = (s: any) => s.type === "ServiceMenuSection" || s.type === "BookTimeSection";
  it("shows both halves, keeps the bag, adds hours and passes the look checks", () => {
    for (const id of STARTER_SITES) {
      const both = starterForShop(libraryLook(id), "both");
      const home = presetSections(both).heroPage;
      expect(home.some(isProducts), id).toBe(true);
      expect(home.some(isServices), id).toBe(true);
      expect(home.some((s) => s.type === "BookingHoursSection"), id).toBe(true);
      expect((both as any).global?.hideCartButton, id).not.toBe(true);
      expect(themeProblems(both), id).toEqual([]);
    }
  });
  it("puts the side most customers come for first", () => {
    for (const id of STARTER_SITES) {
      for (const lead of ["products", "services"] as const) {
        const home = presetSections(starterForShop(libraryLook(id), "both", lead)).heroPage;
        const p = firstIndex(home, isProducts), s = firstIndex(home, isServices);
        expect(lead === "products" ? p < s : s < p, `${id} ${lead}`).toBe(true);
      }
    }
  });
  it("reads the kind from a sign-up answer or a kind name", () => {
    const theme = libraryLook("aurel-editorial");
    expect(starterForShop(theme, "products")).toBe(starterForShop(theme, "clothing"));
    expect(presetSections(starterForShop(theme, "services")).heroPage.some(isServices)).toBe(true);
  });
});

describe("a services shop's version sends every opening button to booking", () => {
  it("leaves no 'shop the collection' button on a services home page", () => {
    for (const id of STARTER_SITES) {
      const home = presetSections(starterForShop(libraryLook(id), "hair")).heroPage;
      const opening = home[0];
      expect(JSON.stringify(opening), id).not.toContain('"ctaUrl":"/collections/all"');
    }
  });
});
