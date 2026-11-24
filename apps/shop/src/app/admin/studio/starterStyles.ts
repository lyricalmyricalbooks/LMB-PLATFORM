// Named styles for starters (24 November 2026, next starters plan phase 2). Every starter comes in three styles: the
// same layout with its own colours and fonts, for example Aurel Cobalt, Aurel Sand and Aurel Night. The first style is
// the starter as it ships; the others lay their `global` keys over the starter's look and their `sections` patches over
// the settings of every section of that type the starter brings (bands with their own colour, like Slow Season's).
//
// A style only sets keys Studio can change, so the owner can edit every part afterwards; the theme checks run on every
// style (`STYLED_LOOKS`). Picking a style is the same one-undo step as trying a starter. The control room can hide a
// style from shops (`platform/starters`, `hiddenStyles`).
import { THEME_LIBRARY } from "./themeLibrary";

export type StarterStyle = {
  id: string;
  name: string;
  /** Background, text and accent, for the swatch. */
  swatches: [string, string, string];
  global?: Record<string, any>;
  /** Section type → settings laid over every section of that type in the starter. */
  sections?: Record<string, Record<string, any>>;
};

/** Every colour the starters' looks set, for a style's palette in one line. */
const palette = (p: {
  bg: string; text: string; accent: string; second: string; surface: string; muted: string; border: string;
  button: string; buttonText: string; hover: string; hoverText: string; footer: string; footerText: string; footerHeading?: string;
  announce?: string; announceText?: string; checkout?: string; raised?: string; overlay?: string;
}) => ({
  backgroundColor: p.bg, textColor: p.text, primaryColor: p.accent, secondaryColor: p.second, surfaceColor: p.surface,
  mutedTextColor: p.muted, borderColor: p.border, buttonColor: p.button, buttonTextColor: p.buttonText,
  buttonHoverBgColor: p.hover, buttonHoverTextColor: p.hoverText, headerBg: p.bg, headerColor: p.text,
  footerBg: p.footer, footerTextColor: p.footerText, footerHeadingColor: p.footerHeading || p.footerText,
  ...(p.announce ? { announcementBg: p.announce, announcementColor: p.announceText } : {}),
  cartDrawerBg: p.bg, cartDrawerText: p.text, checkoutAccentColor: p.checkout || p.accent, checkoutBgColor: p.bg,
  linkColorHover: p.accent, surfaceRaisedColor: p.raised || p.surface, logoColor: p.text, cartDrawerMuted: p.muted,
  ...(p.overlay ? { overlayColor: p.overlay } : {}),
});

export const STARTER_STYLES: Record<string, StarterStyle[]> = {
  "aurel-editorial": [
    { id: "cobalt", name: "Cobalt", swatches: ["#f2eee6", "#0f1826", "#183dce"] },
    { id: "sand", name: "Sand", swatches: ["#efe7da", "#2a2119", "#9a4f24"],
      global: { ...palette({ bg: "#efe7da", text: "#2a2119", accent: "#9a4f24", second: "#e3d6c3", surface: "#e3d6c3", muted: "#5f5348",
        border: "#cdbfa9", button: "#2a2119", buttonText: "#efe7da", hover: "#9a4f24", hoverText: "#ffffff", footer: "#2a2119",
        footerText: "#efe7da", announce: "#9a4f24", announceText: "#ffffff" }),
        navLinkActiveColor: "#9a4f24", headingFont: "Playfair Display", bodyFont: "DM Sans", headingWeight: 500 } },
    { id: "night", name: "Night", swatches: ["#121722", "#ece6da", "#8fa8ff"],
      global: { ...palette({ bg: "#121722", text: "#ece6da", accent: "#8fa8ff", second: "#1c2331", surface: "#1c2331", muted: "#a9b0bd",
        border: "#2c3445", button: "#ece6da", buttonText: "#121722", hover: "#8fa8ff", hoverText: "#121722", footer: "#0b0f17",
        footerText: "#ece6da", announce: "#8fa8ff", announceText: "#121722" , overlay: "#000000" }),
        navLinkActiveColor: "#8fa8ff" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
  "juniper-slow-season": [
    { id: "terracotta", name: "Terracotta", swatches: ["#f9f7f0", "#151613", "#bd5238"] },
    { id: "sage", name: "Sage", swatches: ["#f7f6ef", "#1a1d17", "#4f6b4a"],
      global: { ...palette({ bg: "#f7f6ef", text: "#1a1d17", accent: "#4f6b4a", second: "#e9ecdf", surface: "#e3e6d6", muted: "#545a4e",
        border: "#d3d6c8", button: "#1a1d17", buttonText: "#f7f6ef", hover: "#4f6b4a", hoverText: "#ffffff", footer: "#1a1d17",
        footerText: "#f7f6ef", announce: "#1a1d17", announceText: "#f7f6ef" }),
        bodyFont: "Inter" },
      sections: {
        BigIntroSection: { bgColor: "#e9ecdf" },
        FeatureDuoSection: { leftBgColor: "#7d9474", rightBgColor: "#d9c7a7" },
        StoryOrbitSection: { bgColor: "#2b2f26", accentColor: "#e9d8a6" },
        NewsletterSection: { bgColor: "#f1e7c6" },
      } },
    { id: "night", name: "Night", swatches: ["#15140f", "#efe9dc", "#e07a52"],
      global: { ...palette({ bg: "#15140f", text: "#efe9dc", accent: "#e07a52", second: "#23211b", surface: "#23211b", muted: "#b3ac9d",
        border: "#3a372f", button: "#efe9dc", buttonText: "#15140f", hover: "#e07a52", hoverText: "#15140f", footer: "#0d0c09",
        footerText: "#efe9dc", announce: "#e07a52", announceText: "#15140f" , overlay: "#000000" }) },
      sections: {
        BigIntroSection: { bgColor: "#1f1d17" },
        FeatureDuoSection: { leftBgColor: "#9c4a2c", rightBgColor: "#3d4636" },
        StoryOrbitSection: { colorSchemeId: "scheme-default", bgColor: "#22291f", accentColor: "#e9d870" },
        NewsletterSection: { bgColor: "#23211b" },
      } },
  ],
  "juniper-catalogue": [
    { id: "acid", name: "Acid", swatches: ["#f2f0e8", "#161815", "#d8ff43"] },
    { id: "blueprint", name: "Blueprint", swatches: ["#eef1f6", "#10182b", "#2a4fd6"],
      global: { ...palette({ bg: "#eef1f6", text: "#10182b", accent: "#2a4fd6", second: "#9fe3ff", surface: "#dde3ee", muted: "#4d566a",
        border: "#b3bccc", button: "#10182b", buttonText: "#eef1f6", hover: "#9fe3ff", hoverText: "#10182b", footer: "#10182b",
        footerText: "#eef1f6", footerHeading: "#9fe3ff", checkout: "#10182b" }),
        navLinkActiveColor: "#10182b", headingFont: "Libre Baskerville" } },
    { id: "night", name: "Night", swatches: ["#121411", "#ecebe3", "#d8ff43"],
      global: { ...palette({ bg: "#121411", text: "#ecebe3", accent: "#ff7a4d", second: "#d8ff43", surface: "#1d201b", muted: "#a4a49a",
        border: "#34372f", button: "#ecebe3", buttonText: "#121411", hover: "#d8ff43", hoverText: "#121411", footer: "#0b0c0a",
        footerText: "#ecebe3", footerHeading: "#d8ff43", checkout: "#ecebe3" , overlay: "#000000" }),
        navLinkActiveColor: "#ecebe3" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
};

/** A starter's styles, its own first; empty for a look that has none. */
export const stylesFor = (id: string | undefined): StarterStyle[] => (id && STARTER_STYLES[id]) || [];

/**
 * The starter in one of its styles: the style's keys over its look, its section patches over its sections. The first
 * style (or an unknown one) gives the starter unchanged. The result keeps the starter's id and remembers `styleId`, so
 * Studio can tell an update to the starter from the style's own colours (themeSwitch `updatedTheme`).
 */
export function withStyle<T>(theme: T, styleId?: string | null): T {
  const t = theme as any;
  const styles = stylesFor(t?.id);
  const style = styles.find((s) => s.id === styleId);
  if (!style || style === styles[0]) return theme;
  const patch = style.sections || {};
  const sections: Record<string, any[]> = {};
  for (const [page, list] of Object.entries((t.content?.sections || {}) as Record<string, any[]>)) {
    sections[page] = Array.isArray(list)
      ? list.map((s: any) => (patch[s?.type] ? { ...s, settings: { ...(s.settings || {}), ...patch[s.type] } } : s))
      : list;
  }
  return {
    ...t,
    styleId: style.id,
    styleName: style.name,
    global: { ...(t.global || {}), ...(style.global || {}) },
    content: t.content ? { ...t.content, sections } : t.content,
  } as T;
}

/** Every starter in every style but its own, for the theme checks (id `starter/style`). */
export const STYLED_LOOKS: any[] = Object.keys(STARTER_STYLES).flatMap((id) => {
  const theme = (THEME_LIBRARY as any[]).find((t) => t.id === id);
  return theme ? stylesFor(id).slice(1).map((s) => ({ ...withStyle(theme, s.id), name: `${theme.name} ${s.name}`, checkId: `${id}/${s.id}` })) : [];
});

/** "Aurel Sand" for a starter in one of its styles, else the starter's own name. */
export const styledName = (theme: any): string => (theme?.styleName ? `${theme.name} ${theme.styleName}` : String(theme?.name || ""));
