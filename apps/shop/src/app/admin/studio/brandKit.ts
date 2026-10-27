// Brand kit (Studio 3.0 phase 6): a guided setup that turns a logo, a palette and a personality into a whole-shop look
// as ONE undoable draft change. Pure: StudioBrandKit.tsx asks the owner, logoColours.ts reads the picture's pixels, and
// `brandKitDesign` writes only ordinary design keys that already have a Studio › Style control, so everything it sets
// stays editable afterwards.
import { contrastRatio, parseColor, readableOn, type ColorScheme } from "../../features/site/colorSchemes";
import { applyThemeKeysToSurfaces } from "../themeScope";
import { editableSchemes, writeSchemes } from "./colorSchemeOps";
import { HOME_LAYOUT_TEMPLATES } from "./homeLayouts";
import { PALETTES } from "./themeLibrary";
import { makeSection, setSections } from "./studioModel";

type RGB = [number, number, number];
export type BrandPalette = { id: string; label: string; bg: string; text: string; accent: string };

const hex = ([r, g, b]: RGB) => "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const rgbOf = (c: string): RGB => (parseColor(c) || [0, 0, 0]) as RGB;
/** `a` moved `t` (0–1) of the way towards `b`. */
export const mix = (a: string, b: string, t: number) => {
  const x = rgbOf(a), y = rgbOf(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};

function hsl([r, g, b]: RGB) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return { s, l };
}

/** The colours a picture is mostly made of: pixels bucketed at 4 bits per channel, near-transparent ones skipped and
 *  near-white/near-black backgrounds dropped when there are other colours; most frequent first. */
export function dominantColours(rgba: ArrayLike<number>, max = 5): string[] {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += r; c.g += g; c.b += b;
    counts.set(key, c);
  }
  const all = [...counts.values()].sort((a, b) => b.n - a.n).map(c => ({ n: c.n, rgb: [c.r / c.n, c.g / c.n, c.b / c.n] as RGB }));
  const plain = (rgb: RGB) => { const { l } = hsl(rgb); return l > 0.94 || l < 0.06; };
  const coloured = all.filter(c => !plain(c.rgb));
  const picked: RGB[] = [];
  // Neighbouring buckets of one ink count as one colour.
  const near = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 48;
  for (const c of (coloured.length ? coloured : all)) {
    if (picked.some(p => near(p, c.rgb))) continue;
    picked.push(c.rgb);
    if (picked.length >= max) break;
  }
  return picked.map(hex);
}

/** The colour that reads most as "the brand": the most saturated one that isn't almost white or black. */
export function brandAccent(colours: string[]): string | null {
  let best: { c: string; score: number } | null = null;
  for (const c of colours) {
    const p = parseColor(c); if (!p) continue;
    const { s, l } = hsl(p as RGB);
    if (l > 0.94 || l < 0.06) continue;
    const score = s * (1 - Math.abs(l - 0.5));
    if (!best || score > best.score) best = { c: hex(p as RGB), score };
  }
  return best?.c || null;
}

/** `colour` nudged lighter or darker (whichever helps) until it has `min` contrast against `bg`. */
export function withContrast(colour: string, bg: string, min: number): string {
  if ((contrastRatio(colour, bg) ?? 0) >= min) return colour;
  const towards = readableOn(bg);
  let c = colour;
  for (let i = 1; i <= 10; i++) {
    c = mix(colour, towards, i / 10);
    if ((contrastRatio(c, bg) ?? 0) >= min) return c;
  }
  return towards;
}

const LIGHT_PAGE = "#faf8f4", DARK_PAGE = "#0d0d0d";

/** Palettes built from the logo's colours (light page, dark page, the brand colour as the page), then the built-in
 *  palettes. Text always has at least 4.5:1 contrast with the page, the accent at least 3:1. */
export function palettesFromColours(colours: string[], chosen?: string | null): BrandPalette[] {
  // A colour the owner picked themselves always wins over the one read from the logo.
  const picked = chosen && parseColor(chosen) ? hex(parseColor(chosen) as RGB) : null;
  const accent = picked || brandAccent(colours);
  const out: BrandPalette[] = [];
  if (accent) {
    out.push({ id: "logo-light", label: "Light page, your colour", bg: LIGHT_PAGE, text: "#111111", accent: withContrast(accent, LIGHT_PAGE, 3) });
    out.push({ id: "logo-dark", label: "Dark page, your colour", bg: DARK_PAGE, text: "#f5f5f5", accent: withContrast(accent, DARK_PAGE, 3) });
    const text = readableOn(accent);
    out.push({ id: "logo-bold", label: "Your colour as the page", bg: accent, text, accent: text });
  }
  for (const p of PALETTES) out.push({ id: p.id, label: p.label, bg: p.bg, text: p.text, accent: withContrast(p.accent, p.bg, 3) });
  return out;
}

export type Personality = {
  id: "bookish" | "bold" | "minimal"; label: string; blurb: string;
  headingFont: string; bodyFont: string; buttonStyle: "solid" | "outline" | "soft";
  buttonRadius: number; cardRadius: number; uppercase: boolean;
  /** A starter Home layout from HOME_LAYOUT_TEMPLATES. */
  homeLayoutId: string;
};

export const PERSONALITIES: Personality[] = [
  { id: "bookish", label: "Bookish", blurb: "Classic serif type and quiet outlined buttons, like a reading room.",
    headingFont: "Cormorant Garamond", bodyFont: "Libre Baskerville", buttonStyle: "outline", buttonRadius: 0, cardRadius: 0, uppercase: false, homeLayoutId: "editorial-launch" },
  { id: "bold", label: "Bold", blurb: "Tall poster headings and solid buttons, like a print shop.",
    headingFont: "Anton", bodyFont: "Archivo", buttonStyle: "solid", buttonRadius: 0, cardRadius: 0, uppercase: true, homeLayoutId: "lyricalmyrical-riso" },
  { id: "minimal", label: "Minimal", blurb: "One clean sans-serif, soft corners and plenty of space.",
    headingFont: "Inter", bodyFont: "Inter", buttonStyle: "outline", buttonRadius: 4, cardRadius: 4, uppercase: false, homeLayoutId: "minimal-gallery" },
];

/** Every colour key the brand kit sets, worked out from one palette (the same keys Riso Noir sets). */
export function paletteKeys(p: BrandPalette): Record<string, string> {
  const onAccent = readableOn(p.accent);
  const muted = mix(p.text, p.bg, 0.36);
  const surface = mix(p.bg, p.text, 0.06);
  return {
    backgroundColor: p.bg, textColor: p.text, primaryColor: p.accent,
    surfaceColor: surface, surfaceRaisedColor: mix(p.bg, p.text, 0.1), mutedTextColor: muted, borderColor: mix(p.text, p.bg, 0.78),
    favoriteColor: p.accent, focusRingColor: p.accent, linkColorHover: mix(p.accent, p.text, 0.25),
    activeControlBg: p.text, activeControlText: p.bg,
    buttonColor: p.accent, buttonTextColor: onAccent, buttonHoverBgColor: p.text, buttonHoverTextColor: p.bg,
    badgeBgPrimary: p.accent, badgeTextPrimary: onAccent,
    headerBg: p.bg, headerColor: p.text, footerBg: p.bg, logoColor: p.text,
    announcementBg: p.accent, announcementColor: onAccent,
    checkoutAccentColor: p.accent, checkoutBgColor: p.bg,
    cartDrawerBg: p.bg, cartDrawerText: p.text, cartDrawerMuted: muted, cartDrawerSurface: surface, cartDrawerBorder: p.text,
    risoOutlineColor: p.text, risoShadowColor: p.accent,
  };
}

/** Fixed-meaning colours (stock, success, warning, error) and their defaults: kept, but made readable on the new page. */
const STATUS_COLOURS: Record<string, string> = { successColor: "#3ddc97", warningColor: "#ffc93c", dangerColor: "#ff5a4a", lowInventoryColor: "#ffc93c" };
/** Text colours the owner may have set on single parts: kept when readable on the new page, otherwise nudged until they are. */
const PART_TEXT_COLOURS = ["footerTextColor", "footerHeadingColor", "navLinkColor", "navLinkActiveColor", "productTitleColor", "productPriceColor"];
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v.trim());

/** Status and part text colours adjusted to have 4.5:1 against the new page (only keys that would otherwise be unreadable). */
export function readableExtras(design: any, p: BrandPalette): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(STATUS_COLOURS)) {
    const own = isHex(design?.[key]) ? design[key] : fallback;
    out[key] = withContrast(own, p.bg, 4.5);
  }
  for (const key of PART_TEXT_COLOURS) {
    const own = design?.[key];
    if (isHex(own) && (contrastRatio(own, p.bg) ?? 0) < 4.5) out[key] = withContrast(own, p.bg, 4.5);
  }
  return out;
}

/** The type and shape keys a personality sets. */
export function personalityKeys(p: Personality): Record<string, any> {
  return {
    headingFont: p.headingFont, bodyFont: p.bodyFont, font: p.bodyFont,
    buttonStyle: p.buttonStyle, buttonRadius: p.buttonRadius, cardRadius: p.cardRadius,
    buttonUppercase: p.uppercase, risoUppercaseHeadings: p.uppercase,
  };
}

export const BRAND_SCHEME_ID = "brand-accent";

/** A colour scheme with the brand colour as the background, for sections that should stand out. */
export function brandScheme(p: BrandPalette): ColorScheme {
  const on = readableOn(p.accent);
  return {
    id: BRAND_SCHEME_ID, name: "Brand colour", v: 2,
    background: p.accent, surface: mix(p.accent, on, 0.1), text: on, muted: mix(on, p.accent, 0.3), accent: on,
    onAccent: p.accent, border: on, buttonBg: on, buttonText: p.accent, link: on,
  };
}

/** Starter Home sections from a layout, without the layout's own fixed colours (they follow the palette instead). */
export function starterSections(layoutId: string, meta: (type: string) => any) {
  const tpl = HOME_LAYOUT_TEMPLATES.find(t => t.id === layoutId);
  if (!tpl) return null;
  const isColour = (k: string, v: unknown) => typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) && /colou?r|background|bg$/i.test(k);
  return tpl.sections.map(s => {
    const own = Object.fromEntries(Object.entries(s.settings || {}).filter(([k, v]) => !isColour(k, v)));
    return makeSection(s.type, { ...(meta(s.type)?.defaults || {}), ...own });
  });
}

export type BrandKitChoice = {
  logoUrl?: string;
  palette: BrandPalette;
  personality: Personality;
  /** "starter" replaces the Home page's sections with the personality's starter layout. */
  home: "keep" | "starter";
};

/** The draft with the brand kit applied: colours, type and shape on every page, the logo, a "Brand colour" scheme and
 *  (when asked) a starter Home page. Everything else in the design is kept. */
export function brandKitDesign(design: any, choice: BrandKitChoice, meta: (type: string) => any): any {
  const keys: Record<string, any> = { ...paletteKeys(choice.palette), ...readableExtras(design, choice.palette), ...personalityKeys(choice.personality) };
  // Outline and soft buttons draw their label in the button colour on the page, so it needs text contrast (4.5:1).
  if (choice.personality.buttonStyle !== "solid") {
    keys.buttonColor = withContrast(choice.palette.accent, choice.palette.bg, 4.5);
    keys.buttonTextColor = readableOn(keys.buttonColor);
  }
  if (choice.logoUrl) keys.logoUrl = choice.logoUrl;
  // Parts that followed a colour scheme (header, footer, bag, cards, buy card) follow the brand colours instead.
  if (design?.elementSchemes && Object.keys(design.elementSchemes).length) keys.elementSchemes = undefined;
  let next = applyThemeKeysToSurfaces(design, keys);
  const schemes = editableSchemes(next).filter(s => s.id !== BRAND_SCHEME_ID);
  next = writeSchemes(next, [...schemes, brandScheme(choice.palette)]);
  if (choice.home === "starter") {
    const sections = starterSections(choice.personality.homeLayoutId, meta);
    if (sections) next = setSections(next, { kind: "template", id: "heroPage" }, sections);
  }
  return next;
}

/** Plain-English lines for the Review step. */
export function brandKitSummary(design: any, choice: BrandKitChoice): string[] {
  const home = Array.isArray(design?.heroPage?.sections) ? design.heroPage.sections.length : 0;
  const followed = Object.keys(design?.elementSchemes || {}).filter(k => design.elementSchemes[k]);
  const layout = HOME_LAYOUT_TEMPLATES.find(t => t.id === choice.personality.homeLayoutId);
  return [
    choice.logoUrl ? "Logo: your new picture in the header" : "Logo: unchanged",
    `Colours: ${choice.palette.label} on every page, header, footer, bag and checkout`,
    `Type: ${choice.personality.headingFont} headings, ${choice.personality.bodyFont} text`,
    `Buttons: ${choice.personality.buttonStyle}, ${choice.personality.buttonRadius ? "soft" : "square"} corners`,
    "A “Brand colour” scheme you can give any section (Style tab › Colour scheme)",
    ...(followed.length ? [`Parts that followed a colour scheme (${followed.length}) take the brand colours instead`] : []),
    choice.home === "starter" && layout
      ? `Home page: replaced with the ${layout.name} layout${home ? ` (your ${home} current section${home === 1 ? "" : "s"} go)` : ""}`
      : "Home page: unchanged",
  ];
}
