// What applying a theme-library entry writes (StudioEditor › Themes › Apply, and the theme checks).
//
// A theme with a palette sets every colour role from it (page, cards, buttons, tags, header, footer, bag, checkout,
// print treatment, the scrim over pictures), the same full set the brand kit writes (`paletteKeys`), then its own
// applied keys and `global` on top. Before plan 1.25 a theme set only the page, text and accent colours, so a light
// theme applied over the dark starting look kept black cards, a black footer and white muted text under dark words.
import { applyThemeKeysToSurfaces } from "../themeScope";
import { paletteKeys, readableExtras } from "./brandKit";
import { PALETTES, THEME_APPLIED_KEYS, THEME_LIBRARY } from "./themeLibrary";

// Photo shapes a template look sets (Arch's tall arch, Shelf's book covers) go away with it, the way its print style
// does, unless the next look sets its own: a switch from Arch to Atlas must not leave arched photos behind.
const LOOK_OWNED_SHAPES: Record<string, any> = { photoOutline: "default", productPhotoOutline: "grid" };

/** The keys Apply writes for `theme` onto `design` (sections, words and pages are never touched). */
export function themeLookKeys(theme: any, design: any = {}): Record<string, any> {
  const palette: any = PALETTES.find((p: any) => p.id === theme?.palettePreset);
  const keys: Record<string, any> = palette
    ? { ...paletteKeys(palette), ...readableExtras(design, palette), palettePreset: palette.id }
    : {};
  keys.themeStyle = "default";
  const previous: any = THEME_LIBRARY.find((t: any) => t.id === design?.themeLibraryPreset);
  for (const [k, off] of Object.entries(LOOK_OWNED_SHAPES)) {
    if (previous?.global?.[k] !== undefined && design?.[k] === previous.global[k]) keys[k] = off;
  }
  for (const k of THEME_APPLIED_KEYS) if (theme?.[k] !== undefined) keys[k] = theme[k];
  return { ...keys, ...(theme?.global || {}), themeLibraryPreset: theme?.id };
}

/** `design` as it looks after applying `theme` (sections and words kept). */
export function themedDesign(theme: any, design: Record<string, any> = {}): Record<string, any> {
  return applyThemeKeysToSurfaces(design, themeLookKeys(theme, design));
}
