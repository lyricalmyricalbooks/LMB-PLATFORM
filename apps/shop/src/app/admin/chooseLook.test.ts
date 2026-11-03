import { describe, expect, it } from "vitest";
import { firstBookPhoto, galleryThemes, ownBooks, lookPreview, pressNameOf, suggestedThemes, welcomeShows } from "./chooseLook";
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

describe("the look previews show the first book's photo (plan 17.8)", () => {
  it("uses the first book that has a secure photo, and nothing else", () => {
    expect(firstBookPhoto([{ photos: [] }, { photos: [{ url: "https://cdn.example/a.jpg" }] }, { photos: [{ url: "https://cdn.example/b.jpg" }] }])).toBe("https://cdn.example/a.jpg");
    expect(firstBookPhoto([{ photoUrl: "https://cdn.example/c.jpg" }])).toBe("https://cdn.example/c.jpg");
    expect(firstBookPhoto([{ photos: [{ url: "http://insecure.example/x.jpg" }] }])).toBe("");
    expect(firstBookPhoto([])).toBe("");
    expect(firstBookPhoto(null)).toBe("");
  });
  it("shows the press's own books with their titles and secure covers, skipping empty ones", () => {
    const list = ownBooks([
      { title: "  Salt Hours ", photos: [{ url: "https://cdn.example/a.jpg" }] },
      { title: "", photos: [] },
      { title: "No Cover", photos: [{ url: "http://insecure.example/x.jpg" }] },
      { photoUrl: "https://cdn.example/c.jpg" },
    ], 3);
    expect(list).toEqual([
      { title: "Salt Hours", photo: "https://cdn.example/a.jpg" },
      { title: "No Cover", photo: "" },
      { title: "", photo: "https://cdn.example/c.jpg" },
    ]);
    expect(ownBooks(null)).toEqual([]);
  });
  it("tells the preview which template style to draw", () => {
    const style = (id: string) => lookPreview((THEME_LIBRARY as any[]).find(t => t.id === id)).style;
    expect(style("press-market")).toBe("market");
    expect(style("press-rows")).toBe("index");
  });
});
