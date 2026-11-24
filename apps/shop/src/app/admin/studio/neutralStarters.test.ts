// Neutral starter websites (24 November 2026, the owner's approved plan): a starter keeps its Figma look, but its words
// describe what goes in each spot, its products are "Example product" samples and it never names its own brand, a
// person or a made-up review. Add a starter to NEUTRAL once its words are rewritten (Slow Season and Catalogue next).
import { describe, expect, it } from "vitest";
import { THEME_LIBRARY } from "./themeLibrary";

const NEUTRAL = ["aurel-editorial"];
const BRANDS = /\b(aurel|juniper|lyricalmyrical)\b/i;

describe.each(NEUTRAL.map((id) => [id]))("starter %s is neutral", (id) => {
  const look: any = THEME_LIBRARY.find((t: any) => t.id === id);
  const words = JSON.stringify({ sections: look.content.sections, global: look.global, samples: look.content.sampleProducts })
    .replace(/"(imageUrl|photo|ctaUrl|plusUrl|[a-zA-Z]*Font|themeStyle)":"[^"]*"/g, "");

  it("never names a brand", () => expect(words).not.toMatch(BRANDS));
  it("has no made-up reviews or star ratings", () => expect(words).not.toMatch(/★|\breview/i));
  it("sells only example products", () => {
    for (const p of look.content.sampleProducts) {
      expect(p.title).toMatch(/^Example product/);
      expect(p.maker).toBe("Sample");
    }
  });
});
