// Neutral starter websites (24 November 2026, the owner's approved plan): a starter keeps its Figma look, but its words
// describe what goes in each spot, its products are "Example …" samples named by what they show and it never names its own brand, a
// person or a made-up review. Add a starter to NEUTRAL once its words are rewritten .
import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";

const NEUTRAL = ["aurel-editorial", "juniper-slow-season", "juniper-catalogue", "starter-gallery", "starter-warehouse", "starter-larder", "starter-salon", "starter-workshop", "starter-commission"];
const BRANDS = /\b(aurel|juniper)\b/i;

describe.each(NEUTRAL.map((id) => [id]))("starter %s is neutral", (id) => {
  const look: any = THEME_LIBRARY.find((t: any) => t.id === id);
  const words = JSON.stringify({ sections: look.content.sections, global: look.global, samples: look.content.sampleProducts })
    .replace(/"(imageUrl|photo|ctaUrl|plusUrl|[a-zA-Z]*Font|themeStyle)":"[^"]*"/g, "");

  it("never names a brand", () => expect(words).not.toMatch(BRANDS));
  it("has no made-up reviews or star ratings", () => expect(words).not.toMatch(/★|\breview/i));
  it("shows its photos as they are, never under the product grid's default purple tint", () => {
    const grids = Object.values(look.content.sections as Record<string, any[]>).flat().filter((x: any) => x?.type === "ProductShowcaseGridSection");
    for (const grid of grids) expect(grid.settings.overlayOpacity, id).toBe(0);
  });
  it("sells only example products", () => {
    for (const p of look.content.sampleProducts || []) { // a services starter brings none (its price list shows the shop's own services)
      expect(p.title).toMatch(/^Example [a-z]/); // named by what it shows ("Example stoneware mug"), never a real product name
      expect(p.maker).toBe("Sample");
    }
  });
});
