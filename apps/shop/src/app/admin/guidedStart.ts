// Guided start (next starters plan phase 3, 24 November 2026): after sign-up, three questions (what you sell, the feel
// you want, your logo) give a shortlist of starters already in the shop's name, its logo's colours and its first
// products. Pure rules only; the questions and the cards are in overview/GuidedStart.tsx.
//
// The shortlist is every starter the control room offers (lookGallery `offeredStarters`, its order), each in the style
// that answers the feel (studio/starterStyles.ts `feels`, the starter's own style when none does). A logo's main
// colour becomes the style's accent with the brand kit's rules (`withLogoColours`), so the style's page and colour bands
// stay as designed. Nothing
// here is a second way of styling: the result is the starter, a style and brand-kit keys, all Studio settings.
import { libraryLook, offeredStarters, offeredStyles, type LibraryTheme, type StarterChoice } from "./lookGallery";
import { styledName, withStyle, type StyleFeel } from "./studio/starterStyles";
import { brandAccent, withContrast } from "./studio/brandKit";
import { themeLookKeys } from "./studio/themeLook";
import { readableOn } from "../features/site/colorSchemes";
import { lookSignature } from "./studio/themeSwitch";

export type { StyleFeel };

export const GUIDED_FEELS: { id: StyleFeel; label: string; blurb: string }[] = [
  { id: "calm", label: "Calm", blurb: "Soft colours and plenty of space" },
  { id: "bold", label: "Bold", blurb: "Strong colours that stand out" },
  { id: "classic", label: "Classic", blurb: "Timeless type and a clear accent" },
];

/** The style of a starter that answers `feel`: the first style listing it, else the starter's own. */
export function styleForFeel(id: string, feel: StyleFeel, choice?: StarterChoice) {
  const styles = offeredStyles(id, choice);
  return styles.find((s) => s.feels.includes(feel)) || styles[0];
}

/**
 * A starter wearing a logo's colour: the logo's main colour (brandKit `brandAccent`) becomes the style's accent, made
 * readable on its page (3:1, the brand kit's rule), and fills what the style fills with its accent: the announcement
 * bar, links, tags, the checkout and the button colour when pointed at. The style's page, words and colour bands stay,
 * so every band still reads. Keeps the starter's id and style; `baseSig` is the unbranded style's fingerprint, so Studio
 * measures later updates against the starter as it ships, never against the logo's colour (themeSwitch `themeBaseFor`).
 */
export function withLogoColours<T>(theme: T, colours: string[] | null | undefined): T {
  const t = theme as any;
  const logo = colours?.length ? brandAccent(colours) : null;
  if (!logo) return theme;
  const own = { ...themeLookKeys(t, {}) };
  const bg = String(own.backgroundColor || "#ffffff");
  const accent = withContrast(logo, bg, 3);
  const onAccent = readableOn(accent);
  const was = String(own.primaryColor || "").toLowerCase();
  const swap = (key: string, value: string) => (String(own[key] || "").toLowerCase() === was ? { [key]: value } : {});
  return {
    ...t,
    baseSig: t.baseSig || lookSignature(t),
    branded: true,
    global: {
      ...(t.global || {}),
      primaryColor: accent, checkoutAccentColor: accent, linkColorHover: accent, focusRingColor: accent, favoriteColor: accent,
      badgeBgPrimary: accent, badgeTextPrimary: onAccent,
      ...swap("navLinkActiveColor", accent),
      ...swap("buttonHoverBgColor", accent), ...(String(own.buttonHoverBgColor || "").toLowerCase() === was ? { buttonHoverTextColor: onAccent } : {}),
      ...swap("buttonColor", accent), ...(String(own.buttonColor || "").toLowerCase() === was ? { buttonTextColor: onAccent } : {}),
      ...(String(own.announcementBg || "").toLowerCase() === was ? { announcementBg: accent, announcementColor: onAccent } : {}),
    },
  } as T;
}

export type ShortlistEntry = { theme: LibraryTheme; name: string; styleId?: string };

/** Up to `max` starters for the answers, in the control room's order, each in its fitting style and the logo's colours. */
export function shortlist({ feel, colours, choice, max = 3 }: { feel: StyleFeel; colours?: string[] | null; choice?: StarterChoice; max?: number }): ShortlistEntry[] {
  return offeredStarters(choice).slice(0, max).flatMap((id) => {
    const base = libraryLook(id);
    if (!base) return [];
    const style = styleForFeel(id, feel, choice);
    const theme = withLogoColours(withStyle(base, style?.id), colours) as LibraryTheme;
    return [{ theme, name: styledName(theme), styleId: style?.id }];
  });
}
