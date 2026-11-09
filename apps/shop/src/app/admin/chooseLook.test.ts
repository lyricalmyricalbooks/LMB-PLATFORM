import { describe, expect, it } from "vitest";
import { firstBookPhoto, emailThemeFor, galleryThemes, ownBooks, lookPreview, pressNameOf, suggestedThemes, welcomeShows } from "./chooseLook";
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
  it("gives the previews each product's real price, the sale price when it is on sale", () => {
    expect(ownBooks([{ title: "A", retailPrice: 22 }, { title: "B", retailPrice: 24, salePrice: 18.5, isOnSale: true }, { title: "C", retailPrice: 0 }]))
      .toEqual([{ title: "A", photo: "", price: "CA$ 22.00" }, { title: "B", photo: "", price: "CA$ 18.50" }, { title: "C", photo: "" }]);
  });
  it("tells the preview which template style to draw", () => {
    const style = (id: string) => lookPreview((THEME_LIBRARY as any[]).find(t => t.id === id)).style;
    expect(style("press-market")).toBe("market");
    expect(style("press-rows")).toBe("index");
  });
  it("picks the email theme that goes with the look, and undoes a leftover one", () => {
    expect(emailThemeFor("press-market")).toBe("market");
    expect(emailThemeFor("press-rows", "dark")).toBe("index");
    expect(emailThemeFor("press-zine", "market")).toBe("light");
    expect(emailThemeFor("press-zine", "index")).toBe("light");
    expect(emailThemeFor("press-zine", "dark")).toBeNull();
    expect(emailThemeFor("press-zine")).toBeNull();
  });
});

describe("browsing the looks (theme store)", () => {
  it("reads picture shapes, keeping odd ones sensible", async () => {
    const { pictureRatio } = await import("./lookGallery");
    expect(pictureRatio("3:4")).toBe(0.75);
    expect(pictureRatio("1:1")).toBe(1);
    expect(pictureRatio("9:1")).toBe(2);
    expect(pictureRatio("tall")).toBe(0.75);
    expect(pictureRatio(undefined)).toBe(0.75);
  });
  it("tells light from dark and finds the full templates", async () => {
    const { filterLooks, isTemplate, lightness, LOOK_FILTERS } = await import("./lookGallery");
    expect(lightness("#000")).toBe(0);
    expect(lightness("#ffffff")).toBe(1);
    expect(lightness("rgb(0,0,0)")).toBeNull();
    const all = THEME_LIBRARY as any[];
    const templates = filterLooks(all, "templates").map(t => t.id);
    for (const id of ["press-marquee", "press-shelf", "press-atlas", "press-mosaic", "press-market", "press-rows", "press-arch"]) expect(templates).toContain(id);
    expect(templates).not.toContain("press-zine");
    expect(isTemplate(all.find(t => t.id === "press-zine"))).toBe(false);
    const dark = filterLooks(all, "dark").map(t => t.id);
    expect(dark).toContain("night-neon");
    expect(dark).not.toContain("press-shelf");
    expect(filterLooks(all, "light").length + dark.length).toBe(all.length);
    expect(filterLooks(all, "all")).toHaveLength(all.length);
    expect(LOOK_FILTERS.map(f => f.id)).toEqual(["all", "templates", "light", "dark"]);
  });
  it("every look gives the try-on what it draws", () => {
    for (const theme of THEME_LIBRARY as any[]) {
      const look = lookPreview(theme);
      expect(look.ratio, theme.id).toBeGreaterThan(0);
      expect(look.cta.length, theme.id).toBeGreaterThan(0);
      expect(look.cta, theme.id).toBe(look.cta.charAt(0) + look.cta.slice(1).toLowerCase());
      for (const c of [look.footerBg, look.footerText, look.muted, look.secondary, look.badgeBg]) expect(c, theme.id).toMatch(/^(#|rgb|var)/);
    }
    const marquee = lookPreview((THEME_LIBRARY as any[]).find(t => t.id === "press-marquee"));
    expect(marquee.heading).toBe("The wall");
    expect(marquee.outline).toBe(3);
    expect(marquee.announcement).not.toBeNull();
  });
  it("draws each look with the press's own settings, as Use this look would leave the shop", () => {
    const shelf = (THEME_LIBRARY as any[]).find(t => t.id === "press-shelf");
    const stock = lookPreview(shelf);
    expect(lookPreview(shelf, null)).toEqual(stock);
    const own = lookPreview(shelf, { templateOutlineWidth: 2, templateOutlineColor: "#123456", templateShadowOffset: 6, backgroundColor: "#000000" });
    expect(own.outline).toBe(2);
    expect(own.outlineColor).toBe("#123456");
    expect(own.shadow).toBe(6);
    expect(own.bg).toBe(stock.bg); // the look's colours still replace the press's, exactly as choosing it does
    // A template's own outline wins over the Riso Press one; Riso Press keeps reading its own.
    const riso = (THEME_LIBRARY as any[]).find(t => t.id === "press-riso");
    expect(lookPreview(riso, { templateOutlineWidth: 4 }).outline).toBe(lookPreview(riso).outline);
  });
  it("samples are worded for what the press sells", async () => {
    const { sampleProducts } = await import("./lookGallery");
    expect(sampleProducts("books")[0].title).toBe("Salt Hours");
    expect(sampleProducts(null)[0].title).toBe("Salt Hours");
    expect(sampleProducts("clothing")[0].title).toBe("Heavy Tee");
    expect(sampleProducts("jewelry")[0].title).toBe("Moon Hoops");
    for (const s of ["books", "prints", "clothing", "shoes", "jewelry", "music", "other"]) expect(sampleProducts(s).length, s).toBeGreaterThanOrEqual(8);
  });
});
