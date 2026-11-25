// Style › Site styles (round three, phase 5): ready-made palettes and font pairings, one click each, like Squarespace's
// site styles. Pure rules; StudioSiteStyles.tsx shows them. Nothing here is new: a palette writes the same keys Apply
// writes for a look's palette (`paletteKeys`, `readableExtras`, the look's colour schemes), and a pairing writes the
// same three type keys Make it yours writes. The owner's own colour schemes are never replaced.
import { applyThemeKeysToSurfaces } from "../themeScope";
import { paletteKeys, readableExtras, withContrast } from "./brandKit";
import { lookSchemes } from "./themeLook";
import { PALETTES } from "./themeLibrary";
import { FONT_PAIRINGS, applyFonts, currentFonts, type FontPairing } from "./makeItYours";

export type SitePalette = { id: string; label: string; bg: string; text: string; accent: string; band: string; dark?: boolean };

/** Eight palettes, light ones first: each a page, words, an accent, and a band colour that fills the bright sections
 *  (the third starting scheme; lookSchemes picks readable words on it). */
const PICKS: { id: string; band: string; dark?: boolean }[] = [
  { id: "light", band: "#e9e4da" }, { id: "cotton", band: "#e8d9c4" }, { id: "newsprint", band: "#f1d36b" },
  { id: "bookcloth", band: "#d9c7a7" }, { id: "sage", band: "#c9d8c5" }, { id: "cobalt", band: "#ffd84d" },
  { id: "lantern", band: "#f2b45a", dark: true }, { id: "ink", band: "#e74c3c", dark: true },
];
export const SITE_PALETTES: SitePalette[] = PICKS.map(({ id, band, dark }) => {
  const p = PALETTES.find((x) => x.id === id)!;
  return { id, label: p.label, bg: p.bg, text: p.text, accent: withContrast(p.accent, p.bg, 3), band, dark };
});

export const SITE_FONTS: FontPairing[] = FONT_PAIRINGS;

/** True when the owner has made or edited a colour scheme of their own (a palette then leaves every scheme alone). */
export const hasOwnSchemes = (design: any) => Array.isArray(design?.colorSchemes) && design.colorSchemes.some((s: any) => !s?.fromLook);

/** The keys a palette writes: every colour role, the bright band, and the starting schemes when they still follow the look. */
export function paletteDesignKeys(design: any, p: SitePalette): Record<string, any> {
  const keys: Record<string, any> = { ...paletteKeys(p), ...readableExtras(design, p), secondaryColor: p.band, palettePreset: p.id };
  if (!hasOwnSchemes(design)) keys.colorSchemes = lookSchemes(keys);
  return keys;
}

/** The design with a palette on every page. Undo takes it back as one step (Studio's `change`). */
export const applyPalette = (design: any, p: SitePalette) => applyThemeKeysToSurfaces(design, paletteDesignKeys(design, p));

/** The palette the design is wearing now, if it is one of these (its page, words and accent still match). */
export function currentPalette(design: any): string | null {
  const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
  const hit = SITE_PALETTES.find((p) => same(design?.backgroundColor, p.bg) && same(design?.textColor, p.text) && same(design?.primaryColor, p.accent));
  return hit?.id ?? null;
}

/** A pairing writes the same three type keys as Make it yours. */
export const applyPairing = (design: any, f: FontPairing) => applyFonts(design, f);
export const currentPairing = (design: any) => currentFonts(design, SITE_FONTS) || null;
