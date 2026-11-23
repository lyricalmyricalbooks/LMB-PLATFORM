// What applying a theme-library entry writes (StudioEditor › Themes › Apply, and the theme checks).
//
// A theme with a palette sets every colour role from it (page, cards, buttons, tags, header, footer, bag, checkout,
// print treatment, the scrim over pictures), the same full set the brand kit writes (`paletteKeys`), then its own
// applied keys and `global` on top. Before plan 1.25 a theme set only the page, text and accent colours, so a light
// theme applied over the dark starting look kept black cards, a black footer and white muted text under dark words.
import { applyThemeKeysToSurfaces } from "../themeScope";
import { DEFAULT_COLOR_SCHEMES, mixColors, readableOn } from "../../features/site/colorSchemes";
import { paletteKeys, readableExtras } from "./brandKit";
import { PALETTES, THEME_APPLIED_KEYS } from "./themeLibrary";

/** The keys Apply writes for `theme` onto `design` (sections, words and pages are never touched). */
export function themeLookKeys(theme: any, design: any = {}): Record<string, any> {
  const palette: any = PALETTES.find((p: any) => p.id === theme?.palettePreset);
  const keys: Record<string, any> = palette
    ? { ...paletteKeys(palette), ...readableExtras(design, palette), palettePreset: palette.id }
    : {};
  keys.themeStyle = "default";
  for (const k of THEME_APPLIED_KEYS) if (theme?.[k] !== undefined) keys[k] = theme[k];
  const out: Record<string, any> = { ...keys, ...(theme?.global || {}), themeLibraryPreset: theme?.id };
  // A shop still on the starting colour schemes gets its three from this look, so dark and bright bands (sections set
  // to Noir / Flare) follow the look; `fromLook` marks them so the next look replaces them. Schemes the owner made or
  // edited (the scheme editor drops `fromLook`) are never replaced.
  const own = design?.colorSchemes;
  const mine = Array.isArray(own) && own.some((x: any) => !x?.fromLook);
  if (!mine && out.backgroundColor && out.textColor && out.primaryColor) out.colorSchemes = lookSchemes(out);
  return out;
}

/** The three starting colour schemes in a look's own colours (ids kept, so sections that name them follow). */
export function lookSchemes(look: Record<string, any>) {
  const bg = look.backgroundColor, text = look.textColor, accent = look.primaryColor;
  const onAccent = readableOn(accent, "#111111", "#ffffff");
  // The bright band uses the look's second colour when it has one (a fill colour, not one words are written in).
  const band = look.secondaryColor || accent, onBand = readableOn(band, "#000000", "#ffffff");
  return DEFAULT_COLOR_SCHEMES.map((s) => {
    if (s.id === "scheme-default") return { id: s.id, name: s.name, v: 2, fromLook: true, background: bg, text, muted: mixColors(text, bg, 0.8), accent, onAccent, buttonBg: look.buttonColor || accent, buttonText: look.buttonTextColor || onAccent };
    if (s.id === "scheme-inverse") return { id: s.id, name: s.name, v: 2, fromLook: true, background: text, text: bg, muted: mixColors(bg, text, 0.8), accent, onAccent, buttonBg: accent, buttonText: onAccent };
    return { id: s.id, name: s.name, v: 2, fromLook: true, background: band, text: onBand, muted: mixColors(onBand, band, 0.8), accent: onBand, onAccent: band, buttonBg: onBand, buttonText: band, link: onBand };
  });
}

/** `design` as it looks after applying `theme` (sections and words kept). */
export function themedDesign(theme: any, design: Record<string, any> = {}): Record<string, any> {
  return applyThemeKeysToSurfaces(design, themeLookKeys(theme, design));
}
