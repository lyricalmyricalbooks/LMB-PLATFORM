import { describe, expect, it } from "vitest";
import { galleryThemes, lookPreview, pressNameOf, suggestedThemes, welcomeShows } from "./chooseLook";
import { THEME_LIBRARY } from "./studio/themeLibrary";

const HEX = /^#[0-9a-f]{3,8}$/i;

describe("Choose your look (plan 6.3)", () => {
  it("every theme in the library has a preview: three swatches, colours and type", () => {
    for (const theme of THEME_LIBRARY as any[]) {
      const look = lookPreview(theme);
      expect(look.swatches, theme.id).toHaveLength(3);
      for (const c of [look.bg, look.text, look.accent, look.headerBg, look.button]) expect(c, `${theme.id} ${c}`).toMatch(/^(#|rgb)/);
      expect(look.swatches.filter(c => HEX.test(c)).length, theme.id).toBeGreaterThanOrEqual(2);
      expect(look.headingFont.length, theme.id).toBeGreaterThan(0);
      expect(look.columns.phone).toBeGreaterThanOrEqual(1);
      expect(typeof theme.name === "string" && typeof theme.mood === "string", theme.id).toBe(true);
    }
  });
  it("each sign-up answer suggests two or three themes that are in the library, and the gallery lists every theme once", () => {
    for (const answer of ["books", "zines", "comics", "prints", "mix", null, "unknown"]) {
      const suggested = suggestedThemes(answer);
      expect(suggested.length, String(answer)).toBeGreaterThanOrEqual(2);
      expect(suggested.length).toBeLessThanOrEqual(3);
      const { others } = galleryThemes(answer);
      expect(suggested.length + others.length).toBe(THEME_LIBRARY.length);
      expect(new Set([...suggested, ...others].map(t => t.id)).size).toBe(THEME_LIBRARY.length);
    }
    expect(suggestedThemes("zines")[0].id).toBe("press-zine");
    expect(suggestedThemes("books")[0].id).toBe("press-imprint");
  });
  it("shows once, for a new shop only, never for a stockroom-only plan", () => {
    expect(welcomeShows(null)).toBe(false);
    expect(welcomeShows({ plan: "both" })).toBe(true);
    expect(welcomeShows({ plan: "shop", welcome: { theme: "press-zine", at: "now" } })).toBe(false);
    expect(welcomeShows({ plan: "stockroom" })).toBe(false);
  });
  it("the preview header carries the press's name", () => {
    expect(pressNameOf({ info: { name: "Moth Press" } })).toBe("Moth Press");
    expect(pressNameOf({ shopName: "Fern Books" })).toBe("Fern Books");
    expect(pressNameOf(null)).toBe("Your press");
  });
});
