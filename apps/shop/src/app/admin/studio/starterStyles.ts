// Named styles for starters (24 November 2026, next starters plan phase 2). Every starter comes in three styles: the
// same layout with its own colours and fonts, for example Aurel Cobalt, Aurel Sand and Aurel Night. The first style is
// the starter as it ships; the others lay their `global` keys over the starter's look and their `sections` patches over
// the settings of every section of that type the starter brings (bands with their own colour, like Slow Season's).
//
// A style only sets keys Studio can change, so the owner can edit every part afterwards; the theme checks run on every
// style (`STYLED_LOOKS`). Picking a style is the same one-undo step as trying a starter. The control room can hide a
// style from shops (`platform/starters`, `hiddenStyles`).
import { THEME_LIBRARY } from "./themeLibrary";

export type StyleFeel = "calm" | "bold" | "classic";

export type StarterStyle = {
  id: string;
  name: string;
  /** Background, text and accent, for the swatch. */
  swatches: [string, string, string];
  /** The feels this style answers in the guided start (guidedStart.ts): calm, bold or classic. */
  feels: StyleFeel[];
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
    { id: "cobalt", name: "Cobalt", swatches: ["#f2eee6", "#0f1826", "#183dce"], feels: ["classic"] },
    { id: "sand", name: "Sand", swatches: ["#efe7da", "#2a2119", "#9a4f24"], feels: ["calm"],
      global: { ...palette({ bg: "#efe7da", text: "#2a2119", accent: "#9a4f24", second: "#e3d6c3", surface: "#e3d6c3", muted: "#5f5348",
        border: "#cdbfa9", button: "#2a2119", buttonText: "#efe7da", hover: "#9a4f24", hoverText: "#ffffff", footer: "#2a2119",
        footerText: "#efe7da", announce: "#9a4f24", announceText: "#ffffff" }),
        navLinkActiveColor: "#9a4f24", headingFont: "Playfair Display", bodyFont: "DM Sans", headingWeight: 500 } },
    { id: "night", name: "Night", swatches: ["#121722", "#ece6da", "#8fa8ff"], feels: ["bold"],
      global: { ...palette({ bg: "#121722", text: "#ece6da", accent: "#8fa8ff", second: "#1c2331", surface: "#1c2331", muted: "#a9b0bd",
        border: "#2c3445", button: "#ece6da", buttonText: "#121722", hover: "#8fa8ff", hoverText: "#121722", footer: "#0b0f17",
        footerText: "#ece6da", announce: "#8fa8ff", announceText: "#121722" , overlay: "#000000" }),
        navLinkActiveColor: "#8fa8ff" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
  "juniper-slow-season": [
    { id: "terracotta", name: "Terracotta", swatches: ["#f9f7f0", "#151613", "#bd5238"], feels: ["classic"] },
    { id: "sage", name: "Sage", swatches: ["#f7f6ef", "#1a1d17", "#4f6b4a"], feels: ["calm"],
      global: { ...palette({ bg: "#f7f6ef", text: "#1a1d17", accent: "#4f6b4a", second: "#e9ecdf", surface: "#e3e6d6", muted: "#545a4e",
        border: "#d3d6c8", button: "#1a1d17", buttonText: "#f7f6ef", hover: "#4f6b4a", hoverText: "#ffffff", footer: "#1a1d17",
        footerText: "#f7f6ef", announce: "#1a1d17", announceText: "#f7f6ef" }),
        headingFont: "Space Grotesk", headingWeight: 600, bodyFont: "Inter" },
      sections: {
        BigIntroSection: { bgColor: "#e9ecdf" },
        FeatureDuoSection: { leftBgColor: "#7d9474", rightBgColor: "#d9c7a7" },
        StoryOrbitSection: { bgColor: "#2b2f26", accentColor: "#e9d8a6" },
        NewsletterSection: { bgColor: "#f1e7c6" },
      } },
    { id: "night", name: "Night", swatches: ["#15140f", "#efe9dc", "#e07a52"], feels: ["bold"],
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
    { id: "acid", name: "Acid", swatches: ["#e7e8e2", "#161815", "#d8ff43"], feels: ["bold"] },
    { id: "blueprint", name: "Blueprint", swatches: ["#eef1f6", "#10182b", "#2a4fd6"], feels: ["classic", "calm"],
      global: { ...palette({ bg: "#eef1f6", text: "#10182b", accent: "#2a4fd6", second: "#9fe3ff", surface: "#dde3ee", muted: "#4d566a",
        border: "#b3bccc", button: "#10182b", buttonText: "#eef1f6", hover: "#9fe3ff", hoverText: "#10182b", footer: "#10182b",
        footerText: "#eef1f6", footerHeading: "#9fe3ff", checkout: "#10182b" }),
        navLinkActiveColor: "#10182b", headingFont: "Libre Baskerville" } },
    { id: "night", name: "Night", swatches: ["#121411", "#ecebe3", "#d8ff43"], feels: ["bold"],
      global: { ...palette({ bg: "#121411", text: "#ecebe3", accent: "#ff7a4d", second: "#d8ff43", surface: "#1d201b", muted: "#a4a49a",
        border: "#34372f", button: "#ecebe3", buttonText: "#121411", hover: "#d8ff43", hoverText: "#121411", footer: "#0b0c0a",
        footerText: "#ecebe3", footerHeading: "#d8ff43", checkout: "#ecebe3" , overlay: "#000000" }),
        navLinkActiveColor: "#ecebe3" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
  "starter-gallery": [
    { id: "linen", name: "Linen", swatches: ["#f7f6f3", "#161616", "#7d5a3c"], feels: ["calm", "classic"] },
    { id: "stone", name: "Stone", swatches: ["#e9e6df", "#23211d", "#5b6b5a"], feels: ["calm"],
      global: { ...palette({ bg: "#e9e6df", text: "#23211d", accent: "#5b6b5a", second: "#dcd8cf", surface: "#dcd8cf", muted: "#57534b", border: "#c7c2b7", button: "#23211d", buttonText: "#e9e6df", hover: "#5b6b5a", hoverText: "#ffffff", footer: "#2f3a2e", footerText: "#e9e6df", footerHeading: "#e9e6df", checkout: "#23211d" }),
        navLinkActiveColor: "#23211d", headingFont: "Familjen Grotesk", headingWeight: 500, bodyFont: "Inter" } },
    { id: "night", name: "Night", swatches: ["#141414", "#ecebe6", "#c9a27a"], feels: ["bold"],
      global: { ...palette({ bg: "#141414", text: "#ecebe6", accent: "#c9a27a", second: "#262624", surface: "#1f1f1e", muted: "#a5a39d", border: "#363634", button: "#ecebe6", buttonText: "#141414", hover: "#c9a27a", hoverText: "#141414", footer: "#0c0c0c", footerText: "#ecebe6", footerHeading: "#262624", checkout: "#ecebe6", overlay: "#000000" }),
        navLinkActiveColor: "#ecebe6" } },
  ],
  "starter-warehouse": [
    { id: "signal", name: "Signal", swatches: ["#f4f4f1", "#111111", "#d63f12"], feels: ["bold"] },
    { id: "cobalt", name: "Cobalt", swatches: ["#f1f3f7", "#0d1526", "#1f4fd6"], feels: ["classic", "calm"],
      global: { ...palette({ bg: "#f1f3f7", text: "#0d1526", accent: "#1f4fd6", second: "#c8f169", surface: "#e2e6ee", muted: "#4a5366", border: "#c2c8d4", button: "#0d1526", buttonText: "#f1f3f7", hover: "#1f4fd6", hoverText: "#ffffff", footer: "#0d1526", footerText: "#f1f3f7", footerHeading: "#c8f169", announce: "#c8f169", announceText: "#0d1526", checkout: "#0d1526" }),
        navLinkActiveColor: "#1f4fd6", headingFont: "Big Shoulders Display", headingWeight: 800, bodyFont: "Archivo" } },
    { id: "night", name: "Night", swatches: ["#101010", "#efefea", "#ffe14a"], feels: ["bold"],
      global: { ...palette({ bg: "#101010", text: "#efefea", accent: "#ff6a3d", second: "#ffe14a", surface: "#1c1c1b", muted: "#a8a8a1", border: "#333331", button: "#efefea", buttonText: "#101010", hover: "#ff6a3d", hoverText: "#101010", footer: "#080808", footerText: "#efefea", footerHeading: "#ffe14a", checkout: "#efefea", overlay: "#000000" }),
        navLinkActiveColor: "#efefea", announcementBg: "#ffe14a", announcementColor: "#101010" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
  "starter-larder": [
    { id: "harvest", name: "Harvest", swatches: ["#fbf5ea", "#2b1d14", "#a8401f"], feels: ["classic"] },
    { id: "olive", name: "Olive", swatches: ["#f5f3e7", "#1f2617", "#5c6b2e"], feels: ["calm"],
      global: { ...palette({ bg: "#f5f3e7", text: "#1f2617", accent: "#5c6b2e", second: "#e3d27a", surface: "#e9e6d3", muted: "#4d5442", border: "#d3cfb5", button: "#5c6b2e", buttonText: "#ffffff", hover: "#1f2617", hoverText: "#f5f3e7", footer: "#1f2617", footerText: "#f5f3e7", footerHeading: "#e3d27a", announce: "#1f2617", announceText: "#f5f3e7", checkout: "#5c6b2e" }),
        navLinkActiveColor: "#5c6b2e", headingFont: "Newsreader", headingWeight: 600, bodyFont: "Work Sans" } },
    { id: "night", name: "Night", swatches: ["#1b1410", "#f6ecdd", "#f0a35e"], feels: ["bold"],
      global: { ...palette({ bg: "#1b1410", text: "#f6ecdd", accent: "#f0a35e", second: "#f0c96b", surface: "#271e18", muted: "#b9ab9a", border: "#3d3129", button: "#f6ecdd", buttonText: "#1b1410", hover: "#f0a35e", hoverText: "#1b1410", footer: "#120d0a", footerText: "#f6ecdd", footerHeading: "#f0c96b", checkout: "#f6ecdd", overlay: "#000000" }),
        navLinkActiveColor: "#f6ecdd", announcementBg: "#f0c96b", announcementColor: "#1b1410" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
  "starter-salon": [
    { id: "blush", name: "Blush", swatches: ["#f7e8e3", "#2a2422", "#874a3e"], feels: ["calm", "classic"] },
    { id: "sage", name: "Sage", swatches: ["#eff2ec", "#1f2620", "#56705a"], feels: ["calm"],
      global: { ...palette({ bg: "#eff2ec", text: "#1f2620", accent: "#56705a", second: "#dbe3d6", surface: "#e1e7dc", muted: "#4f5850", border: "#c8d1c3", button: "#1f2620", buttonText: "#eff2ec", hover: "#56705a", hoverText: "#ffffff", footer: "#1f2620", footerText: "#eff2ec", footerHeading: "#dbe3d6", checkout: "#56705a" }),
        navLinkActiveColor: "#56705a", headingFont: "Libre Baskerville", headingWeight: 400, bodyFont: "Nunito" } },
    { id: "night", name: "Night", swatches: ["#17131a", "#f1eaf0", "#d8a1b4"], feels: ["bold"],
      global: { ...palette({ bg: "#17131a", text: "#f1eaf0", accent: "#d8a1b4", second: "#3a2f3d", surface: "#221c25", muted: "#b2a7b0", border: "#3a323d", button: "#f1eaf0", buttonText: "#17131a", hover: "#d8a1b4", hoverText: "#17131a", footer: "#0e0b10", footerText: "#f1eaf0", footerHeading: "#3a2f3d", checkout: "#f1eaf0", overlay: "#000000" }),
        navLinkActiveColor: "#f1eaf0" } },
  ],
  "starter-workshop": [
    { id: "sunny", name: "Sunny", swatches: ["#fff1c7", "#1d1b2e", "#d2471c"], feels: ["bold"] },
    { id: "mint", name: "Mint", swatches: ["#f0f7f2", "#13241c", "#1f7a52"], feels: ["calm", "classic"],
      global: { ...palette({ bg: "#f0f7f2", text: "#13241c", accent: "#1f7a52", second: "#ffd166", surface: "#e0eee5", muted: "#44564c", border: "#c6dccd", button: "#13241c", buttonText: "#f0f7f2", hover: "#1f7a52", hoverText: "#ffffff", footer: "#13241c", footerText: "#f0f7f2", footerHeading: "#ffd166", checkout: "#1f7a52" }),
        navLinkActiveColor: "#1f7a52", headingFont: "Archivo", headingWeight: 800, bodyFont: "Nunito" } },
    { id: "night", name: "Night", swatches: ["#14131f", "#f4f1ff", "#ffd166"], feels: ["bold"],
      global: { ...palette({ bg: "#14131f", text: "#f4f1ff", accent: "#ff8a5c", second: "#ffd166", surface: "#1f1d2e", muted: "#aeaac2", border: "#35324a", button: "#f4f1ff", buttonText: "#14131f", hover: "#ff8a5c", hoverText: "#14131f", footer: "#0b0a13", footerText: "#f4f1ff", footerHeading: "#ffd166", checkout: "#f4f1ff", overlay: "#000000" }),
        navLinkActiveColor: "#f4f1ff" },
      sections: { NewsletterSection: { colorSchemeId: "scheme-default" } } },
  ],
  "starter-commission": [
    { id: "walnut", name: "Walnut", swatches: ["#f3efe8", "#1f1a14", "#7a4b2a"], feels: ["classic", "calm"] },
    { id: "chalk", name: "Chalk", swatches: ["#f6f6f4", "#1a1a1a", "#3d5a73"], feels: ["calm"],
      global: { ...palette({ bg: "#f6f6f4", text: "#1a1a1a", accent: "#3d5a73", second: "#d8dde2", surface: "#e8e9e6", muted: "#53524f", border: "#cfd0cc", button: "#1a1a1a", buttonText: "#f6f6f4", hover: "#3d5a73", hoverText: "#ffffff", footer: "#1a1a1a", footerText: "#f6f6f4", footerHeading: "#d8dde2", checkout: "#3d5a73" }),
        navLinkActiveColor: "#3d5a73", headingFont: "Playfair Display", headingWeight: 500, bodyFont: "Familjen Grotesk" } },
    { id: "night", name: "Night", swatches: ["#16130f", "#efe8dc", "#c99a6b"], feels: ["bold"],
      global: { ...palette({ bg: "#16130f", text: "#efe8dc", accent: "#c99a6b", second: "#3b3128", surface: "#221d17", muted: "#ada392", border: "#3a3229", button: "#efe8dc", buttonText: "#16130f", hover: "#c99a6b", hoverText: "#16130f", footer: "#0d0b08", footerText: "#efe8dc", footerHeading: "#3b3128", checkout: "#efe8dc", overlay: "#000000" }),
        navLinkActiveColor: "#efe8dc" },
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
