// Starter sample shops (26 November 2026, plan "Starters vs Shopify and Squarespace", step 2, approved by the owner):
// each starter is a finished sample shop for a made-up brand, like a shop-builder's theme demo. Its words, products and
// prices read as a real business, never as a form to fill in ("Your headline", "Example …"). A new shop keeps its own
// name and products; the starter's words arrive marked Sample in Studio until the owner changes them (applyStarter).
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";
import { starterSampleBooks } from "./presetContent";
import { MAX_OPTIONS, productOptions } from "../../../shared/productOptions";

const STARTERS = THEME_LIBRARY.filter((t: any) => t.homeLayoutTemplate && t.content?.sections && (t.id.startsWith("starter-") || t.id.startsWith("juniper-") || t.id === "aurel-editorial"));
const FORM_WORDS = /Your (headline|big|story|first|second|third|delivery|returns|help|opening|featured|season|shop\b|studio|space|kitchen|products)|Example |Write a short|Tell (shoppers|people|your)|Say (what|how|which|whether|in one)|Share (who|how)|Introduce (your|this)|Join our letter|A short (line|caption|label|detail)|\$00/;
const BRANDS = /\b(aurel|juniper)\b/i;

it("all nine starters are covered", () => expect(STARTERS.map((t: any) => t.id).sort()).toEqual([
  "aurel-editorial", "juniper-catalogue", "juniper-slow-season", "starter-commission", "starter-gallery", "starter-larder", "starter-salon", "starter-warehouse", "starter-workshop",
]));

describe.each(STARTERS.map((t: any) => [t.id, t]))("starter %s is a finished sample shop", (id, look: any) => {
  const words = JSON.stringify({ sections: look.content.sections, global: look.global, samples: look.content.sampleProducts })
    .replace(/"(imageUrl|photo|ctaUrl|plusUrl|[a-zA-Z]*Font|themeStyle)":"[^"]*"/g, "")
    .replace(/"morePhotos":\[[^\]]*\]/g, "");

  it("has its own made-up brand, unlike every other starter", () => {
    expect(look.content.sampleBrand).toMatch(/^[A-Z]/);
    const others = STARTERS.filter((t: any) => t.id !== id).map((t: any) => t.content.sampleBrand);
    expect(others).not.toContain(look.content.sampleBrand);
  });
  it("reads as a real shop, never as a form to fill in", () => expect(words).not.toMatch(FORM_WORDS));
  it("never names a design's own name", () => expect(words).not.toMatch(BRANDS));
  it("has no made-up reviews or star ratings", () => expect(words).not.toMatch(/★|\breview/i));
  it("shows its photos as they are, never under the product grid's default purple tint", () => {
    const grids = Object.values(look.content.sections as Record<string, any[]>).flat().filter((x: any) => x?.type === "ProductShowcaseGridSection");
    for (const grid of grids) expect(grid.settings.overlayOpacity, id).toBe(0);
  });
  it("shows at least two photos of every product, all of them in the shop's files", () => {
    for (const p of look.content.sampleProducts || []) {
      const photos = [p.photo, ...(p.morePhotos || [])];
      expect(photos.length, p.title).toBeGreaterThanOrEqual(2);
      for (const url of photos) expect(existsSync(`public${url}`), url).toBe(true);
    }
    for (const book of starterSampleBooks(look)) expect(new Set(book.photos.map((ph: any) => ph.id)).size).toBe(book.photos.length);
  });
  it("sells real-sounding products with a shelf, two sentences and working options", () => {
    const list = look.content.sampleProducts || [];
    expect(list.length).toBeGreaterThanOrEqual(4);
    for (const p of list) {
      expect(p.category, p.title).toMatch(/\S/);
      expect(p.description, p.title).toMatch(/\S+\.\s.*\.$|^[^.]+\.$/);
      expect((p.options || []).length).toBeLessThanOrEqual(MAX_OPTIONS);
    }
    for (const book of starterSampleBooks(look)) {
      expect(book.sample).toBe(true);
      expect(book.description).not.toMatch(/sample product/i);
      if (book.options) {
        expect(productOptions(book)).toHaveLength(book.options.length);
        expect(book.variants.length).toBe(book.options.reduce((n: number, o: any) => n * o.values.length, 1));
        for (const v of book.variants) expect(v.name).toBe(book.options.map((o: any) => v.options[o.name]).join(" / "));
      }
    }
  });
});

describe("a real shop never goes live with a sample brand's promise", () => {
  it("swaps the starter's banner for the shop's own starting line, and keeps one the owner wrote", async () => {
    const { withOwnBanner, startingBanner } = await import("../sells");
    const aurel: any = THEME_LIBRARY.find((t: any) => t.id === "aurel-editorial");
    const sample = aurel.global.announcementText;
    expect(sample).toMatch(/Free shipping/);
    expect(withOwnBanner({ announcementText: sample }, aurel, "other").announcementText).toBe(startingBanner("other"));
    expect(withOwnBanner({ announcementText: "Open late on Fridays" }, aurel, "other").announcementText).toBe("Open late on Fridays");
  });
});
