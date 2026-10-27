import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../features/site/colorSchemes";
import { FONT_CHOICES } from "../../features/site/fonts";
import { STYLE_GROUPS } from "./styleSchema";
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import {
  BRAND_SCHEME_ID, brandAccent, brandKitDesign, brandKitSummary, dominantColours, palettesFromColours, paletteKeys,
  personalityKeys, PERSONALITIES, starterSections, withContrast,
} from "./brandKit";

const pixels = (...runs: [number, number, number, number, number][]) => {
  const out: number[] = [];
  for (const [r, g, b, a, n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return new Uint8ClampedArray(out);
};
const controlled = new Set(STYLE_GROUPS.flatMap(g => g.fields.map(f => f.key)));
const meta = (type: string) => ({ defaults: { registryDefault: type } });

describe("reading a logo's colours", () => {
  it("finds the inks, most used first, ignoring see-through pixels and a white background", () => {
    const logo = pixels([255, 255, 255, 255, 500], [232, 64, 42, 255, 200], [20, 40, 160, 255, 80], [0, 200, 0, 0, 900]);
    const colours = dominantColours(logo);
    expect(colours).toHaveLength(2);
    expect(colours[0]).toBe("#e8402a");
    expect(brandAccent(colours)).toBe("#e8402a");
  });
  it("keeps black and white when the logo has nothing else, and then has no brand accent", () => {
    const colours = dominantColours(pixels([0, 0, 0, 255, 50], [255, 255, 255, 255, 20]));
    expect(colours).toEqual(["#000000", "#ffffff"]);
    expect(brandAccent(colours)).toBeNull();
  });
  it("counts neighbouring shades of one ink once", () => {
    expect(dominantColours(pixels([200, 30, 30, 255, 10], [210, 35, 32, 255, 10]))).toHaveLength(1);
  });
});

describe("palettes", () => {
  it("builds light, dark and bold palettes from the logo, then the built-in ones, all readable", () => {
    const list = palettesFromColours(["#e8402a"]);
    expect(list.slice(0, 3).map(p => p.id)).toEqual(["logo-light", "logo-dark", "logo-bold"]);
    for (const p of list) {
      expect(contrastRatio(p.text, p.bg)!, `${p.id} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accent, p.bg)!, `${p.id} accent`).toBeGreaterThanOrEqual(3);
    }
  });
  it("offers only the built-in palettes for a black-and-white logo", () => {
    expect(palettesFromColours(["#000000"]).some(p => p.id.startsWith("logo-"))).toBe(false);
  });
  it("nudges a pale accent until it shows on a light page", () => {
    const c = withContrast("#ffe9a0", "#faf8f4", 3);
    expect(contrastRatio(c, "#faf8f4")!).toBeGreaterThanOrEqual(3);
  });
});

describe("personalities", () => {
  it("use real fonts and real starter Home layouts", () => {
    const fonts = new Set(FONT_CHOICES.map(f => f.name));
    for (const p of PERSONALITIES) {
      expect(fonts.has(p.headingFont) && fonts.has(p.bodyFont), p.id).toBe(true);
      expect(HOME_LAYOUT_TEMPLATES.some(t => t.id === p.homeLayoutId), p.id).toBe(true);
    }
  });
});

describe("applying the brand kit", () => {
  const palette = palettesFromColours(["#e8402a"])[0];
  const personality = PERSONALITIES.find(p => p.id === "bold")!;
  const design = {
    backgroundColor: "#000000", copy: { siteName: "Mine" },
    heroPage: { sections: [{ id: "keep", type: "NewsletterSection", settings: {} }], backgroundColor: "#123456" },
    colorSchemes: [{ id: "a", name: "A", v: 2, background: "#fff", text: "#000", accent: "#f00" }],
  };

  it("writes only keys that have a Studio › Style control", () => {
    const keys = Object.keys({ ...paletteKeys(palette), ...personalityKeys(personality), logoUrl: "x" });
    expect(keys.filter(k => !controlled.has(k))).toEqual([]);
  });

  it("sets colours and type on every page, adds the Brand colour scheme once, and keeps Home by default", () => {
    const once = brandKitDesign(design, { palette, personality, home: "keep", logoUrl: "https://x.test/logo.png" }, meta);
    expect(once.backgroundColor).toBe(palette.bg);
    expect(once.heroPage.backgroundColor).toBeUndefined();
    expect(once.headingFont).toBe("Anton");
    expect(once.logoUrl).toBe("https://x.test/logo.png");
    expect(once.heroPage.sections.map((s: any) => s.id)).toEqual(["keep"]);
    expect(once.copy).toEqual({ siteName: "Mine" });
    const twice = brandKitDesign(once, { palette, personality, home: "keep" }, meta);
    expect(twice.colorSchemes.filter((s: any) => s.id === BRAND_SCHEME_ID)).toHaveLength(1);
    expect(twice.colorSchemes.some((s: any) => s.id === "a")).toBe(true);
    expect(design.backgroundColor).toBe("#000000");
  });

  it("replaces Home with the starter layout only when asked, without the layout's fixed colours", () => {
    const next = brandKitDesign(design, { palette, personality, home: "starter" }, meta);
    const types = next.heroPage.sections.map((s: any) => s.type);
    expect(types).toContain("MarqueeSection");
    const marquee = next.heroPage.sections.find((s: any) => s.type === "MarqueeSection");
    expect(marquee.settings.background).toBeUndefined();
    expect(marquee.settings.color).toBeUndefined();
    expect(marquee.settings.text).toMatch(/SMALL RUNS/);
    expect(starterSections("missing", meta)).toBeNull();
  });

  it("summarises what will change in plain words", () => {
    const lines = brandKitSummary(design, { palette, personality, home: "starter" });
    expect(lines.join(" ")).toMatch(/Anton headings/);
    expect(lines.at(-1)).toMatch(/your 1 current section go/);
  });
});

describe("review fixes", () => {
  it("keeps status and the owner's part text colours readable on the new page", async () => {
    const { RISO_NOIR_TOKENS } = await import("../../features/site/risoNoir");
    const { readableExtras } = await import("./brandKit");
    for (const p of palettesFromColours(["#e8402a"])) {
      const next = brandKitDesign({ ...RISO_NOIR_TOKENS, footerTextColor: "#ffffff" }, { palette: p, personality: PERSONALITIES[1], home: "keep" }, meta);
      for (const k of ["successColor", "warningColor", "dangerColor", "lowInventoryColor", "footerTextColor"]) {
        expect(contrastRatio(next[k], next.backgroundColor)!, `${p.id} ${k}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // A readable part colour the owner chose is left alone.
    expect(readableExtras({ footerTextColor: "#000000" }, palettesFromColours([])[2])).not.toHaveProperty("footerTextColor");
  });
  it("lets the colour the owner picks win over the logo's", () => {
    const list = palettesFromColours(["#e8402a"], "#1a2a6c");
    expect(list[2]).toMatchObject({ id: "logo-bold", bg: "#1a2a6c" });
    expect(palettesFromColours([], "#000000").some(p => p.id === "logo-light")).toBe(true);
  });
  it("gives outline buttons a label colour with 4.5:1 on the page", () => {
    const palette = palettesFromColours(["#e8402a"])[0];
    for (const personality of PERSONALITIES.filter(p => p.buttonStyle !== "solid")) {
      const next = brandKitDesign({}, { palette, personality, home: "keep" }, meta);
      expect(contrastRatio(next.buttonColor, next.backgroundColor)!, personality.id).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("lets parts that followed a colour scheme take the brand colours, and says so", () => {
    const design = { elementSchemes: { header: "x", cards: "y" } };
    const choice = { palette: palettesFromColours([])[0], personality: PERSONALITIES[0], home: "keep" as const };
    expect(brandKitDesign(design, choice, meta).elementSchemes).toBeUndefined();
    expect(brandKitSummary(design, choice).join(" ")).toMatch(/followed a colour scheme \(2\)/);
  });
});
