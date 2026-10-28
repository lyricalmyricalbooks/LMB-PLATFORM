// Choose your look (plan 6.3): the welcome a new platform shop's owner sees the first time they open the admin, before
// the setup guide. A gallery of every theme in Studio's THEME_LIBRARY (name, mood, three swatches and a small preview
// with the press's name in the header), two or three suggested by sign-up's "What do you sell?" answer
// (`firstWeek/start` › `publishes`). Choosing applies the theme to Studio's draft exactly as Studio › Themes › Use this
// look does (`applyLook`, which also stores the look as the design's `themeBase`), then records `welcome` in
// `firstWeek/start` so the welcome never shows again; Studio's theme switcher changes it later. Skip takes the first
// suggestion. A shop with no `firstWeek/start` (made before this, or by hand) and a stockroom-only plan never see it.

import type { FirstWeekDoc } from "./firstWeek";
import { THEME_LIBRARY } from "./studio/themeLibrary";
import { themeLookKeys } from "./studio/themeLook";
import { applyLook } from "./studio/themeSwitch";
import { openWorkspace, saveDraft, ThemeConflictError } from "./themeStore";
import { withStarterWords, type Sells } from "./sells";

/** The sign-up answers to "What do you sell?" (signup/form.js, plans 6.2 and 10.1; sells.ts SELLS). */
export type Publishes = Sells;

/** Two or three themes to start from for each answer; no answer gets the general three. */
const SUGGESTED: Record<Publishes | "general", string[]> = {
  books: ["press-imprint", "press-letterpress", "press-chapbook"],
  zines: ["press-zine", "press-riso", "press-punk"],
  comics: ["press-poster", "press-riso-noir", "press-zine"],
  prints: ["press-index", "press-poster", "press-archive"],
  mix: ["press-riso", "press-broadsheet", "press-index"],
  clothing: ["urban-streetwear", "modern-atelier", "nordic-minimal"],
  shoes: ["urban-streetwear", "conversion-engine", "tech-minimal"],
  jewelry: ["golden-noir", "velvet-rose", "editorial-luxe"],
  music: ["night-neon", "press-poster", "press-punk"],
  other: ["artisan-market", "nordic-minimal", "modern-atelier"],
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
 * Puts `theme` in Studio's draft the way Use this look does. If another tab saved the draft meanwhile, it reads the
 * draft again and tries once more, so nothing that tab saved is lost. Applying the same look twice gives the same draft.
 * A shop that doesn't sell books also gets its starter words (sells.ts, plan 10.1) under any words the owner wrote.
 */
export async function applyChosenLook(theme: LibraryTheme, settings: any, publishes?: string | null): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const ws = await openWorkspace(settings);
    try {
      await saveDraft(ws, withStarterWords(applyLook(ws.draft || {}, theme), publishes), ws.rev);
      return;
    } catch (error) {
      if (!(error instanceof ThemeConflictError) || attempt >= 1) throw error;
    }
  }
}

/** The press's name for the preview header. */
export const pressNameOf = (settings: any) => String(settings?.info?.name || settings?.shopName || "Your press").slice(0, 60);
