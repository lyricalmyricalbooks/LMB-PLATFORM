// The look gallery's pure parts (plan 6.3): which themes to suggest, each one's small preview, and the press's name in
// it. Kept apart from chooseLook.ts, which also saves the chosen look to the shop's own database, so setup mode (code
// plan 18.6), which has no shop yet, shows the same gallery without loading anything that talks to a database.

import type { FirstWeekDoc } from "./firstWeek";
import { THEME_LIBRARY } from "./studio/themeLibrary";
import { themeLookKeys } from "./studio/themeLook";
import type { Sells } from "./sells";

/** The sign-up answers to "What do you sell?" (signup/form.js, plans 6.2 and 10.1; sells.ts SELLS). */
export type Publishes = Sells;

/** Two or three themes to start from for each answer; no answer gets the general three. */
const SUGGESTED: Record<Publishes | "general", string[]> = {
  books: ["press-imprint", "press-letterpress", "press-arch"],
  zines: ["press-zine", "press-market", "press-punk"],
  comics: ["press-market", "press-mosaic", "press-riso-noir"],
  prints: ["press-index", "press-atlas", "press-market"],
  mix: ["press-rows", "press-atlas", "press-market"],
  mixed: ["press-rows", "press-atlas", "press-shelf"],
  clothing: ["press-market", "press-atlas", "press-marquee"],
  shoes: ["press-atlas", "urban-streetwear", "press-marquee"],
  jewelry: ["press-arch", "press-shelf", "golden-noir"],
  music: ["night-neon", "press-poster", "press-punk"],
  other: ["press-arch", "press-atlas", "press-shelf"],
  general: ["press-riso-noir", "press-riso", "press-imprint"],
};

export type LibraryTheme = { id: string; name: string; mood: string } & Record<string, any>;

const library = () => THEME_LIBRARY as unknown as LibraryTheme[];

/** The suggested themes for a sign-up answer, as they are in the library (unknown ids are left out). */
export function suggestedThemes(publishes?: string | null): LibraryTheme[] {
  const ids = SUGGESTED[(publishes && publishes in SUGGESTED ? publishes : "general") as Publishes | "general"];
  return ids.map(id => library().find(t => t.id === id)).filter((t): t is LibraryTheme => !!t);
}

/** Every theme, the suggested ones first. */
export function galleryThemes(publishes?: string | null): { suggested: LibraryTheme[]; others: LibraryTheme[] } {
  const suggested = suggestedThemes(publishes);
  const picked = new Set(suggested.map(t => t.id));
  return { suggested, others: library().filter(t => !picked.has(t.id)) };
}

/** The welcome shows once, for a shop whose setup wrote `firstWeek/start`, unless its plan has no shop. */
export function welcomeShows(doc: FirstWeekDoc | null): boolean {
  return !!doc && doc.plan !== "stockroom" && !doc.welcome;
}

/** What the small preview needs from a theme: its colours and type once applied, as the shop would show them. */
export interface LookPreview {
  bg: string; text: string; accent: string;
  headerBg: string; headerText: string;
  button: string; buttonText: string;
  surface: string; border: string;
  headingFont: string; bodyFont: string;
  radius: number; buttonRadius: number; uppercase: boolean;
  columns: { desktop: number; phone: number };
  /** Page, words and accent: the three swatches on the card. */
  swatches: [string, string, string];
}

const colour = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function lookPreview(theme: LibraryTheme): LookPreview {
  const k = themeLookKeys(theme, {});
  const bg = colour(k.backgroundColor, "#ffffff");
  const text = colour(k.textColor, "#111111");
  const accent = colour(k.primaryColor, text);
  const font = colour(k.bodyFont ?? theme.font, "inherit");
  return {
    bg, text, accent,
    headerBg: colour(k.headerBg, bg), headerText: colour(k.headerColor, text),
    button: colour(k.buttonColor, accent), buttonText: colour(k.buttonTextColor, bg),
    surface: colour(k.surfaceColor, bg), border: colour(k.borderColor, text),
    headingFont: colour(k.headingFont ?? theme.font, font), bodyFont: font,
    radius: Math.min(num(k.cardRadius ?? theme.cardRadius, 0), 24),
    buttonRadius: Math.min(num(k.buttonRadius, num(theme.cardRadius, 0)), 999),
    uppercase: k.buttonUppercase === true,
    columns: { desktop: Math.max(2, Math.min(num(k.productColumnsDesktop, 3), 4)), phone: Math.max(1, Math.min(num(k.productColumnsMobile, 1), 2)) },
    swatches: [bg, text, accent],
  };
}

/**
 * The first book's photo, for the look previews (plan 17.8), so a press sees its own cover in each look. Only a secure
 * web address is used; a book with no photo, or a broken one, is skipped.
 */
export function firstBookPhoto(books: any[] | null | undefined): string {
  for (const book of books || []) {
    const url = String(book?.photos?.[0]?.url || book?.photoUrl || "");
    if (url.startsWith("https://")) return url;
  }
  return "";
}

/** The press's name for the preview header. */
export const pressNameOf = (settings: any) => String(settings?.info?.name || settings?.shopName || "Your press").slice(0, 60);
