// The look gallery's pure parts (plan 6.3): which themes to suggest, each one's small preview, and the press's name in
// it. Kept apart from chooseLook.ts, which also saves the chosen look to the shop's own database, so setup mode (code
// plan 18.6), which has no shop yet, shows the same gallery without loading anything that talks to a database.

import type { FirstWeekDoc } from "./firstWeek";
import { THEME_LIBRARY } from "./studio/themeLibrary";
import { TEMPLATE_STYLE_IDS } from "../features/site/templateStyles";
import { themedDesign } from "./studio/themeLook";
import type { Sells } from "./sells";

/** The sign-up answers to "What do you sell?" (signup/form.js, plans 6.2 and 10.1; sells.ts SELLS). */
export type Publishes = Sells;

/** Two or three themes to start from for each answer; no answer gets the general three. */
const SUGGESTED: Record<Publishes | "general", string[]> = {
  books: ["press-folio", "press-almanac", "press-shelf"],
  zines: ["press-gutter", "press-cutout", "press-market"],
  comics: ["press-gutter", "press-market", "press-mosaic"],
  prints: ["press-signal", "press-rows", "press-atlas"],
  mix: ["press-rows", "press-atlas", "press-market"],
  mixed: ["press-rows", "press-atlas", "press-shelf"],
  clothing: ["press-cutout", "press-atlas", "press-marquee"],
  shoes: ["press-atlas", "press-signal", "press-marquee"],
  jewelry: ["press-kiln", "press-arch", "press-lantern"],
  music: ["press-reel", "press-console", "press-lantern"],
  other: ["press-kiln", "press-atlas", "press-shelf"],
  general: ["press-folio", "press-atlas", "press-shelf"],
};

export type LibraryTheme = { id: string; name: string; mood: string } & Record<string, any>;

/**
 * The looks a press can pick from: the seventeen built shop templates. The library keeps its older colour variants so a
 * shop already on one still opens, switches and keeps its settings (themeSwitch.ts finds them by id), but they are
 * not offered again: each was a recolour of a template, so the picker showed repeats.
 */
export const isBuiltLook = (t: any) => (TEMPLATE_STYLE_IDS as readonly string[]).includes(String(t.global?.themeStyle || ""));
export const builtLooks = () => (THEME_LIBRARY as unknown as LibraryTheme[]).filter(isBuiltLook);
/** Any look in the library by id, including the older variants that are no longer offered. */
export const libraryLook = (id: string) => (THEME_LIBRARY as unknown as LibraryTheme[]).find(t => t.id === id);
const library = builtLooks;

/** The suggested themes for a sign-up answer, as they are in the library (unknown ids are left out). */
export function suggestedThemes(publishes?: string | null): LibraryTheme[] {
  const ids = SUGGESTED[(publishes && publishes in SUGGESTED ? publishes : "general") as Publishes | "general"];
  return ids.map(id => library().find(t => t.id === id)).filter((t): t is LibraryTheme => !!t);
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

/** How a look feels, the way a press would say it. Every look has exactly one, so the filters never overlap. */
export type LookFeel = "quiet" | "bold" | "warm" | "dark";
export const LOOK_FEELS: { id: LookFeel; label: string }[] = [
  { id: "quiet", label: "Quiet & classic" },
  { id: "bold", label: "Bold & loud" },
  { id: "warm", label: "Warm & friendly" },
  { id: "dark", label: "Dark & moody" },
];
const BOLD = new Set(["press-marquee", "press-mosaic", "press-market", "press-gutter", "press-cutout"]);
const WARM = new Set(["press-shelf", "press-kiln", "press-picnic", "press-arch"]);
/** Dark looks are told by their page colour; the rest are bold, warm or (by default) quiet. */
export const lookFeel = (theme: LibraryTheme): LookFeel => (isDarkLook(theme) ? "dark" : BOLD.has(theme.id) ? "bold" : WARM.has(theme.id) ? "warm" : "quiet");
export const feelLabel = (theme: LibraryTheme) => LOOK_FEELS.find(f => f.id === lookFeel(theme))!.label;

export type LookFilter = "all" | LookFeel;
export const LOOK_FILTERS: { id: LookFilter; label: string }[] = [{ id: "all", label: "All looks" }, ...LOOK_FEELS];

/** The looks a filter keeps, in the library's order. */
export function filterLooks(themes: LibraryTheme[], filter: LookFilter): LibraryTheme[] {
  return filter === "all" ? themes : themes.filter(t => lookFeel(t) === filter);
}

/** The faces a look draws with, for loading them before it is shown. */
export const lookFonts = (look: LookPreview) => [...new Set([look.headingFont, look.bodyFont])].filter(f => f && f !== "inherit");

/** What a sample product is, so the try-on draws it (a tee, a tote, a cover…) instead of a blank block. */
export type ProductKind = "book" | "print" | "tee" | "tote" | "sweatshirt" | "cap" | "ring" | "vinyl" | "mug" | "tape";
export type PreviewProduct = { title: string; photo: string; maker?: string; price?: string; kind?: ProductKind };

/**
 * Made-up products for the try-on when the press has none yet, worded for what they sell (the sign-up answer). Prices
 * are examples only; the covers are drawn in each look's own colours.
 */
const SAMPLES: Record<"books" | "general" | "clothing" | "jewelry" | "music" | "prints", PreviewProduct[]> = {
  books: [
    { title: "Salt Hours", maker: "Zoe Moss", photo: "", kind: "book", price: "CA$ 22.00" },
    { title: "Night Songs", maker: "A. Poet", photo: "", kind: "book", price: "CA$ 18.00" },
    { title: "Paper Weather", maker: "R. Lane", photo: "", kind: "book", price: "CA$ 30.00" },
    { title: "The Long Field", maker: "M. Okafor", photo: "", kind: "book", price: "CA$ 26.00" },
    { title: "Small Rooms", maker: "J. Tran", photo: "", kind: "book", price: "CA$ 15.00" },
    { title: "Blue Hour", maker: "S. Ferris", photo: "", kind: "book", price: "CA$ 24.00" },
    { title: "Field Notes", maker: "L. Haddad", photo: "", kind: "book", price: "CA$ 12.00" },
    { title: "Ink & Bone", maker: "P. Ruiz", photo: "", kind: "book", price: "CA$ 28.00" },
  ],
  prints: [
    { title: "Harbour at Dusk", maker: "Riso print", photo: "", kind: "print", price: "CA$ 40.00" },
    { title: "Two Moons", maker: "Screen print", photo: "", kind: "print", price: "CA$ 55.00" },
    { title: "Fern Study", maker: "Risograph", photo: "", kind: "print", price: "CA$ 30.00" },
    { title: "Night Market", maker: "Giclée", photo: "", kind: "print", price: "CA$ 65.00" },
    { title: "Paper Birds", maker: "Linocut", photo: "", kind: "print", price: "CA$ 45.00" },
    { title: "Tide Chart", maker: "Riso print", photo: "", kind: "print", price: "CA$ 35.00" },
    { title: "City Grid", maker: "Screen print", photo: "", kind: "print", price: "CA$ 50.00" },
    { title: "Wild Garden", maker: "Risograph", photo: "", kind: "print", price: "CA$ 30.00" },
  ],
  clothing: [
    { title: "Heavy Tee", maker: "Organic cotton", photo: "", kind: "tee", price: "CA$ 38.00" },
    { title: "Canvas Tote", maker: "Natural", photo: "", kind: "tote", price: "CA$ 24.00" },
    { title: "Crew Sweatshirt", maker: "Brushed fleece", photo: "", kind: "sweatshirt", price: "CA$ 72.00" },
    { title: "Work Cap", maker: "Washed twill", photo: "", kind: "cap", price: "CA$ 30.00" },
    { title: "Field Jacket", maker: "Waxed cotton", photo: "", kind: "sweatshirt", price: "CA$ 140.00" },
    { title: "Rib Socks", maker: "Merino", photo: "", kind: "tee", price: "CA$ 16.00" },
    { title: "Long Sleeve", maker: "Garment dyed", photo: "", kind: "sweatshirt", price: "CA$ 46.00" },
    { title: "Wool Beanie", maker: "Hand knit", photo: "", kind: "cap", price: "CA$ 34.00" },
  ],
  jewelry: [
    { title: "Moon Hoops", maker: "Gold vermeil", photo: "", kind: "ring", price: "CA$ 85.00" },
    { title: "Seed Ring", maker: "Sterling silver", photo: "", kind: "ring", price: "CA$ 60.00" },
    { title: "Pearl Drop", maker: "Freshwater pearl", photo: "", kind: "ring", price: "CA$ 95.00" },
    { title: "Chain Bracelet", maker: "Recycled silver", photo: "", kind: "ring", price: "CA$ 70.00" },
    { title: "Signet", maker: "Brass", photo: "", kind: "ring", price: "CA$ 55.00" },
    { title: "Star Studs", maker: "Gold fill", photo: "", kind: "ring", price: "CA$ 40.00" },
    { title: "Pebble Pendant", maker: "Sterling silver", photo: "", kind: "ring", price: "CA$ 75.00" },
    { title: "Twist Cuff", maker: "Bronze", photo: "", kind: "ring", price: "CA$ 65.00" },
  ],
  music: [
    { title: "Low Tide", maker: "LP", photo: "", kind: "vinyl", price: "CA$ 32.00" },
    { title: "Night Drive", maker: "Cassette", photo: "", kind: "tape", price: "CA$ 12.00" },
    { title: "Glass Garden", maker: "LP", photo: "", kind: "vinyl", price: "CA$ 30.00" },
    { title: "Static Hearts", maker: "7-inch", photo: "", kind: "vinyl", price: "CA$ 10.00" },
    { title: "Northern Lines", maker: "CD", photo: "", kind: "vinyl", price: "CA$ 15.00" },
    { title: "Slow Rooms", maker: "LP", photo: "", kind: "vinyl", price: "CA$ 28.00" },
    { title: "Paper Planes", maker: "Cassette", photo: "", kind: "tape", price: "CA$ 12.00" },
    { title: "Heat Wave", maker: "LP", photo: "", kind: "vinyl", price: "CA$ 34.00" },
  ],
  general: [
    { title: "Linen Napkins", maker: "Set of four", photo: "", kind: "tote", price: "CA$ 32.00" },
    { title: "Stoneware Mug", maker: "Handmade", photo: "", kind: "mug", price: "CA$ 28.00" },
    { title: "Beeswax Candle", maker: "Hand poured", photo: "", kind: "mug", price: "CA$ 22.00" },
    { title: "Wool Throw", maker: "Woven", photo: "", kind: "tote", price: "CA$ 120.00" },
    { title: "Field Notebook", maker: "Recycled paper", photo: "", kind: "book", price: "CA$ 14.00" },
    { title: "Ceramic Vase", maker: "Glazed", photo: "", kind: "mug", price: "CA$ 48.00" },
    { title: "Tea Towel", maker: "Printed cotton", photo: "", kind: "tote", price: "CA$ 18.00" },
    { title: "Wooden Spoon", maker: "Cherry wood", photo: "", kind: "mug", price: "CA$ 20.00" },
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
 * A product's price as the preview shows it, in the shop's own currency and the way the storefront writes it
 * ("CA$ 22.00", as CurrencyContext does: shop prices are kept in Canadian dollars), or "" when it has none. On sale,
 * the sale price.
 */
export function previewPrice(book: any): string {
  const sale = book?.isOnSale && Number(book?.salePrice) > 0 ? Number(book.salePrice) : NaN;
  const n = Number.isFinite(sale) ? sale : Number(book?.retailPrice ?? book?.price);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `CA$ ${n.toFixed(2)}`;
}

/**
 * The press's own books for the look previews: up to `limit` of them, each with its title, its first secure photo and
 * its real price, so every look shows the press's real covers, names and prices. A book with neither a title nor a
 * photo is skipped.
 */
export function ownBooks(books: any[] | null | undefined, limit = 8): { title: string; photo: string; price?: string }[] {
  const out: { title: string; photo: string; price?: string }[] = [];
  for (const book of books || []) {
    if (out.length >= limit) break;
    const title = String(book?.title || "").trim().slice(0, 60);
    const url = String(book?.photos?.[0]?.url || book?.photoUrl || "");
    const photo = url.startsWith("https://") ? url : "";
    const price = previewPrice(book);
    if (title || photo) out.push(price ? { title, photo, price } : { title, photo });
  }
  return out;
}

/** The press's name for the preview header. */
export const pressNameOf = (settings: any) => String(settings?.info?.name || settings?.shopName || "Your press").slice(0, 60);
