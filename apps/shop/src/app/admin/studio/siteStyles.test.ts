import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../features/site/colorSchemes";
import { FONT_CHOICES } from "../../features/site/fonts";
import { STYLE_GROUPS } from "./styleSchema";
import { applyPairing, applyPalette, currentPairing, currentPalette, hasOwnSchemes, paletteDesignKeys, SITE_FONTS, SITE_PALETTES } from "./siteStyles";

const controlled = new Set(STYLE_GROUPS.flatMap((g: any) => g.fields.map((f: any) => f.key)));

describe("Site styles: palettes", () => {
  it("offers eight palettes, light ones first, each readable", () => {
    expect(SITE_PALETTES).toHaveLength(8);
    const firstDark = SITE_PALETTES.findIndex((p) => p.dark);
    expect(SITE_PALETTES.slice(firstDark).every((p) => p.dark)).toBe(true);
    for (const p of SITE_PALETTES) {
      expect(contrastRatio(p.text, p.bg) ?? 0, p.id).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(p.accent, p.bg) ?? 0, p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("writes only keys that have a Studio control, plus the starting schemes", () => {
    for (const p of SITE_PALETTES) {
      const keys = Object.keys(paletteDesignKeys({}, p)).filter((k) => k !== "colorSchemes" && k !== "palettePreset");
      expect(keys.filter((k) => !controlled.has(k)), p.id).toEqual([]);
    }
  });

  it("sets the three starting schemes from the palette, with a readable bright band", () => {
    for (const p of SITE_PALETTES) {
      const schemes = applyPalette({}, p).colorSchemes;
      expect(schemes).toHaveLength(3);
      expect(schemes.every((s: any) => s.fromLook)).toBe(true);
      expect(schemes[0].background).toBe(p.bg);
      const band = schemes.find((s: any) => s.background === p.band);
      expect(band, p.id).toBeTruthy();
      expect(contrastRatio(band.text, band.background) ?? 0, p.id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("never replaces colour schemes the owner made or edited", () => {
    const own = [{ id: "scheme-default", name: "Mine", background: "#123456", text: "#ffffff" }];
    const design = { colorSchemes: own };
    expect(hasOwnSchemes(design)).toBe(true);
    const next = applyPalette(design, SITE_PALETTES[2]);
    expect(next.colorSchemes).toBe(own);
    expect(next.backgroundColor).toBe(SITE_PALETTES[2].bg);
  });

  it("replaces schemes that still follow the look", () => {
    const first = applyPalette({}, SITE_PALETTES[0]);
    expect(hasOwnSchemes(first)).toBe(false);
    const second = applyPalette(first, SITE_PALETTES[5]);
    expect(second.colorSchemes[0].background).toBe(SITE_PALETTES[5].bg);
  });

  it("knows which palette the design is wearing", () => {
    expect(currentPalette({})).toBeNull();
    for (const p of SITE_PALETTES) expect(currentPalette(applyPalette({}, p))).toBe(p.id);
    expect(currentPalette({ ...applyPalette({}, SITE_PALETTES[1]), primaryColor: "#ff00ff" })).toBeNull();
  });
});

describe("Site styles: fonts", () => {
  it("offers 8 to 10 pairings, each in families and weights Studio lists", () => {
    expect(SITE_FONTS.length).toBeGreaterThanOrEqual(8);
    expect(SITE_FONTS.length).toBeLessThanOrEqual(10);
    for (const f of SITE_FONTS) {
      const heading = FONT_CHOICES.find((c) => c.name === f.heading);
      expect(heading?.weights, f.heading).toContain(f.headingWeight);
      expect(FONT_CHOICES.some((c) => c.name === f.body), f.body).toBe(true);
    }
  });

  it("writes the heading font, the body font and the heading weight, and reads them back", () => {
    const f = SITE_FONTS[3];
    const next = applyPairing({ textColor: "#111111" }, f);
    expect(next).toEqual({ textColor: "#111111", headingFont: f.heading, bodyFont: f.body, headingWeight: f.headingWeight });
    expect(currentPairing(next)).toBe(f.id);
    expect(currentPairing({})).toBeNull();
  });
});
