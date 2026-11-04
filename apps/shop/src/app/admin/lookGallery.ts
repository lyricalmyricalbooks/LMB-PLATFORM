// The look gallery's pure parts (plan 6.3): which themes to suggest, each one's small preview, and the press's name in
// it. Kept apart from chooseLook.ts, which also saves the chosen look to the shop's own database, so setup mode (code
// plan 18.6), which has no shop yet, shows the same gallery without loading anything that talks to a database.

import type { FirstWeekDoc } from "./firstWeek";
import { THEME_LIBRARY } from "./studio/themeLibrary";
import { themedDesign } from "./studio/themeLook";
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
  /** The template's own drawing style (themeStyle), so Market stall tilts its cards and Index rows draws rows. */
  style: string;
  /** The rest of what the try-on draws: the announcement bar, the footer, quieter words, the second colour, tags. */
  announcement: { bg: string; text: string } | null;
  footerBg: string; footerText: string; footerHeading: string;
  muted: string; secondary: string;
  badgeBg: string; badgeText: string;
  /** The shop's catalogue heading ("The wall", "On the shelf"…), or "" for the shop's own words. */
  heading: string;
  /** The button words on a product ("Add to bag", "Grab it"…). */
  cta: string;
  /** Picture shape as width / height (3:4 gives 0.75). */
  ratio: number;
  /** Printed outlines and hard shadows (Riso and Marquee): the width and offset in pixels, 0 when the look has none. */
  outline: number; outlineColor: string; shadow: number; shadowColor: string;
  headingWeight: number;
  chips: boolean;
}

const colour = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/**
 * `theme` as a small picture. With the press's own `design`, the picture is the shop exactly as Use this look would
 * leave it: the look's colours and fonts, plus the press's own settings the look doesn't set (button corners and
 * capitals, template outlines and shadows…). Without one, the look as it comes.
 */
export function lookPreview(theme: LibraryTheme, design?: Record<string, any> | null): LookPreview {
  const k = themedDesign(theme, design && typeof design === "object" ? design : {});
  // On a template, the template's own outline and shadow controls win over the Riso Press ones it falls back to.
  const template = typeof k.themeStyle === "string" && k.themeStyle !== "riso" && k.themeStyle !== "default";
  const set = (v: unknown) => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "");
  const pick = (own: string, riso: string) => (template && set(k[own]) ? k[own] : k[riso]);
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
    style: typeof k.themeStyle === "string" ? k.themeStyle : String((theme as any).global?.themeStyle || ""),
    announcement: k.showAnnouncement === true ? { bg: colour(k.announcementBg, text), text: colour(k.announcementColor, bg) } : null,
    footerBg: colour(k.footerBg, bg), footerText: colour(k.footerTextColor, text), footerHeading: colour(k.footerHeadingColor, colour(k.footerTextColor, text)),
    muted: colour(k.mutedTextColor, text), secondary: colour(k.secondaryColor, accent),
    badgeBg: colour(k.badgeBgPrimary, accent), badgeText: colour(k.badgeTextPrimary, colour(k.buttonTextColor, bg)),
    heading: typeof k.catalogHeading === "string" ? k.catalogHeading.slice(0, 40) : "",
    cta: sentenceCase(colour(k.productCTA ?? theme.productCTA, "Add to bag")),
    ratio: pictureRatio(k.imageAspectRatio ?? theme.imageAspectRatio),
    outline: Math.min(num(pick("templateOutlineWidth", "risoOutlineWidth"), 0), 4),
    outlineColor: colour(pick("templateOutlineColor", "risoOutlineColor"), text),
    shadow: Math.min(num(pick("templateShadowOffset", "risoShadowOffset"), 0), 8),
    shadowColor: colour(pick("templateShadowColor", "risoShadowColor"), text),
    headingWeight: Math.max(400, Math.min(num(k.headingWeight, 700), 900)),
    chips: k.showCategoryChips === true,
  };
}

/** "ADD TO BAG" reads as "Add to bag"; the look's own capitals come back through `uppercase`. */
function sentenceCase(words: string): string {
  const w = words.trim().slice(0, 24).toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** "3:4" as 0.75; anything unreadable is a book's 3:4. Kept between a tall 1:2 and a wide 2:1. */
export function pictureRatio(value: unknown): number {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(value ?? "").trim());
  const r = m ? Number(m[1]) / Number(m[2]) : 0.75;
  return Number.isFinite(r) && r > 0 ? Math.max(0.5, Math.min(r, 2)) : 0.75;
}

// --- Browsing the looks (the theme store) -----------------------------------------------------------------------

/** How light a colour is, 0 (black) to 1 (white); null when it isn't a #rgb / #rrggbb colour. */
export function lightness(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map(c => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A full template draws its own shop (its own `themeStyle`); every other look recolours and retypes the standard one. */
export const isTemplate = (theme: LibraryTheme) => { const s = lookPreview(theme).style; return !!s && s !== "default"; };
export const isDarkLook = (theme: LibraryTheme) => (lightness(lookPreview(theme).bg) ?? 1) < 0.35;

export type LookFilter = "all" | "templates" | "light" | "dark";
export const LOOK_FILTERS: { id: LookFilter; label: string }[] = [
  { id: "all", label: "All looks" },
  { id: "templates", label: "Full templates" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** The looks a filter keeps, in the library's order. */
export function filterLooks(themes: LibraryTheme[], filter: LookFilter): LibraryTheme[] {
  if (filter === "templates") return themes.filter(isTemplate);
  if (filter === "light") return themes.filter(t => !isDarkLook(t));
  if (filter === "dark") return themes.filter(isDarkLook);
  return themes;
}

/** The faces a look draws with, for loading them before it is shown. */
export const lookFonts = (look: LookPreview) => [...new Set([look.headingFont, look.bodyFont])].filter(f => f && f !== "inherit");

export type PreviewProduct = { title: string; photo: string; maker?: string; price?: string };

/**
 * Made-up products for the try-on when the press has none yet, worded for what they sell (the sign-up answer). Prices
 * are examples only; the covers are drawn in each look's own colours.
 */
const SAMPLES: Record<"books" | "general" | "clothing" | "jewelry" | "music" | "prints", PreviewProduct[]> = {
  books: [
    { title: "Salt Hours", maker: "Zoe Moss", photo: "", price: "$22" },
    { title: "Night Songs", maker: "A. Poet", photo: "", price: "$18" },
    { title: "Paper Weather", maker: "R. Lane", photo: "", price: "$30" },
    { title: "The Long Field", maker: "M. Okafor", photo: "", price: "$26" },
    { title: "Small Rooms", maker: "J. Tran", photo: "", price: "$15" },
    { title: "Blue Hour", maker: "S. Ferris", photo: "", price: "$24" },
    { title: "Field Notes", maker: "L. Haddad", photo: "", price: "$12" },
    { title: "Ink & Bone", maker: "P. Ruiz", photo: "", price: "$28" },
  ],
  prints: [
    { title: "Harbour at Dusk", maker: "Riso print", photo: "", price: "$40" },
    { title: "Two Moons", maker: "Screen print", photo: "", price: "$55" },
    { title: "Fern Study", maker: "Risograph", photo: "", price: "$30" },
    { title: "Night Market", maker: "Giclée", photo: "", price: "$65" },
    { title: "Paper Birds", maker: "Linocut", photo: "", price: "$45" },
    { title: "Tide Chart", maker: "Riso print", photo: "", price: "$35" },
    { title: "City Grid", maker: "Screen print", photo: "", price: "$50" },
    { title: "Wild Garden", maker: "Risograph", photo: "", price: "$30" },
  ],
  clothing: [
    { title: "Heavy Tee", maker: "Organic cotton", photo: "", price: "$38" },
    { title: "Canvas Tote", maker: "Natural", photo: "", price: "$24" },
    { title: "Crew Sweatshirt", maker: "Brushed fleece", photo: "", price: "$72" },
    { title: "Work Cap", maker: "Washed twill", photo: "", price: "$30" },
    { title: "Field Jacket", maker: "Waxed cotton", photo: "", price: "$140" },
    { title: "Rib Socks", maker: "Merino", photo: "", price: "$16" },
    { title: "Long Sleeve", maker: "Garment dyed", photo: "", price: "$46" },
    { title: "Wool Beanie", maker: "Hand knit", photo: "", price: "$34" },
  ],
  jewelry: [
    { title: "Moon Hoops", maker: "Gold vermeil", photo: "", price: "$85" },
    { title: "Seed Ring", maker: "Sterling silver", photo: "", price: "$60" },
    { title: "Pearl Drop", maker: "Freshwater pearl", photo: "", price: "$95" },
    { title: "Chain Bracelet", maker: "Recycled silver", photo: "", price: "$70" },
    { title: "Signet", maker: "Brass", photo: "", price: "$55" },
    { title: "Star Studs", maker: "Gold fill", photo: "", price: "$40" },
    { title: "Pebble Pendant", maker: "Sterling silver", photo: "", price: "$75" },
    { title: "Twist Cuff", maker: "Bronze", photo: "", price: "$65" },
  ],
  music: [
    { title: "Low Tide", maker: "LP", photo: "", price: "$32" },
    { title: "Night Drive", maker: "Cassette", photo: "", price: "$12" },
    { title: "Glass Garden", maker: "LP", photo: "", price: "$30" },
    { title: "Static Hearts", maker: "7-inch", photo: "", price: "$10" },
    { title: "Northern Lines", maker: "CD", photo: "", price: "$15" },
    { title: "Slow Rooms", maker: "LP", photo: "", price: "$28" },
    { title: "Paper Planes", maker: "Cassette", photo: "", price: "$12" },
    { title: "Heat Wave", maker: "LP", photo: "", price: "$34" },
  ],
  general: [
    { title: "Linen Napkins", maker: "Set of four", photo: "", price: "$32" },
    { title: "Stoneware Mug", maker: "Handmade", photo: "", price: "$28" },
    { title: "Beeswax Candle", maker: "Hand poured", photo: "", price: "$22" },
    { title: "Wool Throw", maker: "Woven", photo: "", price: "$120" },
    { title: "Field Notebook", maker: "Recycled paper", photo: "", price: "$14" },
    { title: "Ceramic Vase", maker: "Glazed", photo: "", price: "$48" },
    { title: "Tea Towel", maker: "Printed cotton", photo: "", price: "$18" },
    { title: "Wooden Spoon", maker: "Cherry wood", photo: "", price: "$20" },
  ],
};

export function sampleProducts(publishes?: string | null): PreviewProduct[] {
  const p = String(publishes || "");
  if (p === "prints") return SAMPLES.prints;
  if (p === "clothing" || p === "shoes") return SAMPLES.clothing;
  if (p === "jewelry") return SAMPLES.jewelry;
  if (p === "music") return SAMPLES.music;
  if (p === "other") return SAMPLES.general;
  return SAMPLES.books;
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

/**
 * The email theme (emailTheme.ts) that goes with a shop look: Market stall and Index rows have their own email colours.
 * Any other look returns null, which leaves a plain "light"/"dark" choice alone but turns a leftover Market stall or
 * Index rows email theme back to "light", so a press that changes its mind is not left with the old colours.
 */
export function emailThemeFor(themeId: string, current?: string | null): "market" | "index" | "light" | null {
  if (themeId === "press-market") return "market";
  if (themeId === "press-rows") return "index";
  return current === "market" || current === "index" ? "light" : null;
}

/**
 * The press's own books for the look previews: up to `limit` of them, each with its title and its first secure photo, so
 * every look shows the press's real covers and names. A book with neither a title nor a photo is skipped.
 */
export function ownBooks(books: any[] | null | undefined, limit = 8): { title: string; photo: string }[] {
  const out: { title: string; photo: string }[] = [];
  for (const book of books || []) {
    if (out.length >= limit) break;
    const title = String(book?.title || "").trim().slice(0, 60);
    const url = String(book?.photos?.[0]?.url || book?.photoUrl || "");
    const photo = url.startsWith("https://") ? url : "";
    if (title || photo) out.push({ title, photo });
  }
  return out;
}

/** The press's name for the preview header. */
export const pressNameOf = (settings: any) => String(settings?.info?.name || settings?.shopName || "Your press").slice(0, 60);
