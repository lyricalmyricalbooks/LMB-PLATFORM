// Colour schemes (Studio › Theme settings › Colour schemes).
//
// A scheme is a named set of colour ROLES. A section picks one with its Style tab › Colour scheme
// (`settings.colorSchemeId`); the book cards, the product page buy card and the shopping bag can each
// pick one in Theme settings (`design.elementSchemes`). `schemeCss()` — emitted on every storefront
// surface by StorefrontOverrides — turns each scheme into `[data-scheme="<id>"]` CSS variables
// (the same token names the rest of the storefront already reads: --bg-color, --fg-rgb, --surface,
// --muted, --accent, --on-accent, --border-rgb, --btn-bg, --btn-text …), so anything inside a
// scheme follows it without per-element edits. `SectionList` sets `data-scheme` on the section.
//
// Schemes saved before Colour schemes 2.0 only had background / text / accent, and the storefront
// only ever painted the section's background and text with them (the accent was never shown).
// Those "legacy" schemes keep exactly that look (the section wrapper's inline background/colour,
// no variables) until the owner edits a colour, which upgrades the scheme to every role (`v: 2`).
// `colorSchemes.test.ts` holds the render-equivalence guard for that.
//
// This file defines default palette values (it is a TOKEN_SOURCE in designerCoverage.test.ts).

export const SCHEME_ROLES = ["background", "surface", "text", "muted", "accent", "onAccent", "border", "buttonBg", "buttonText", "link"] as const;
export type SchemeRole = (typeof SCHEME_ROLES)[number];

export type ColorScheme = {
  id: string;
  name: string;
  /** 2 = uses every role. Missing = saved before Colour schemes 2.0 (background + text only). */
  v?: number;
  background: string;
  text: string;
  accent: string;
} & Partial<Record<Exclude<SchemeRole, "background" | "text" | "accent">, string>>;

export type FullScheme = ColorScheme & Record<SchemeRole, string>;

/** Plain-English names for the role pickers (Studio) — the order is the editor's order. */
export const SCHEME_ROLE_LABELS: Record<SchemeRole, { label: string; hint: string }> = {
  background: { label: "Background", hint: "Behind everything in the section or element." },
  surface: { label: "Panels & cards", hint: "Boxes inside it: the buy card, photo wells, inputs." },
  text: { label: "Text", hint: "Headings and body text." },
  muted: { label: "Muted text", hint: "Captions, prices before a sale, small print." },
  accent: { label: "Accent", hint: "Highlights: tags, active states, progress bars." },
  onAccent: { label: "Text on accent", hint: "Words placed on the accent colour." },
  border: { label: "Borders & lines", hint: "Hairlines, dividers and field outlines." },
  buttonBg: { label: "Button background", hint: "The fill of buttons." },
  buttonText: { label: "Button text", hint: "Words on buttons." },
  link: { label: "Links", hint: "Plain links in text." },
};

// ── Colour maths (tiny, dependency-free) ─────────────────────────────────────

type RGB = [number, number, number];

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(). Alpha is blended over `over` (default black). */
export function parseColor(input: unknown, over: RGB = [0, 0, 0]): RGB | null {
  if (typeof input !== "string") return null;
  const c = input.trim();
  let rgb: RGB | null = null;
  let alpha = 1;
  const hex = /^#([0-9a-f]{3,8})$/i.exec(c);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    if (h.length === 8) alpha = parseInt(h.slice(6, 8), 16) / 255;
  } else {
    const fn = /^rgba?\(([^)]+)\)$/i.exec(c);
    if (!fn) return null;
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const n = parts.slice(0, 3).map(Number);
    if (n.some((x) => !Number.isFinite(x))) return null;
    rgb = [n[0], n[1], n[2]];
    if (parts[3] !== undefined) alpha = parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : Number(parts[3]);
    if (!Number.isFinite(alpha)) alpha = 1;
  }
  const a = Math.max(0, Math.min(1, alpha));
  return rgb.map((v, i) => Math.round(Math.max(0, Math.min(255, v)) * a + over[i] * (1 - a))) as RGB;
}

const toHex = (rgb: RGB) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** `amount` of `fg` laid over `bg` (0 = bg, 1 = fg), as a hex colour. */
export function mixColors(fg: string, bg: string, amount: number): string {
  const b = parseColor(bg) || [0, 0, 0];
  const f = parseColor(fg, b) || [255, 255, 255];
  return toHex(f.map((v, i) => v * amount + b[i] * (1 - amount)) as RGB);
}

function luminance(rgb: RGB): number {
  const lin = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
}

/** WCAG 2 contrast ratio of `fg` on `bg` (1–21), or null when either colour can't be read. */
export function contrastRatio(fg: string, bg: string): number | null {
  const b = parseColor(bg);
  const f = b && parseColor(fg, b);
  if (!b || !f) return null;
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastLevel = "AAA" | "AA" | "AA large" | "Low";
/** WCAG level for body text: 7 AAA, 4.5 AA, 3 large text only, else too low. */
export function contrastLevel(ratio: number | null): ContrastLevel | null {
  if (ratio == null) return null;
  return ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large" : "Low";
}

/** Black or white, whichever reads better on `bg`. */
export function readableOn(bg: string, dark = "#000000", light = "#ffffff"): string {
  return (contrastRatio(dark, bg) ?? 0) >= (contrastRatio(light, bg) ?? 0) ? dark : light;
}

// ── Defaults (from the Riso Noir tokens: black, white, one flare ink) ────────

const NOIR = { black: "#000000", white: "#ffffff", flare: "#e8402a", ink: "#100f0d", flareHover: "#ff6b55", pressBlue: "#3d5bff", panel: "#0d0d0d" };

/**
 * Three starter schemes with the same ids (and light / dark / accent roles) the old purple defaults
 * had, so a section that picked "Default", "Inverse" or "Accent" keeps its light or dark polarity.
 * Muted text and borders are the Noir alphas (64% / 22% of the text) flattened onto the background.
 */
export const DEFAULT_COLOR_SCHEMES: FullScheme[] = [
  { id: "scheme-default", name: "Paper (light)", v: 2, background: NOIR.white, surface: mixColors(NOIR.black, NOIR.white, 0.05), text: NOIR.black,
    muted: mixColors(NOIR.black, NOIR.white, 0.64), accent: NOIR.flare, onAccent: NOIR.ink, border: mixColors(NOIR.black, NOIR.white, 0.22),
    buttonBg: NOIR.flare, buttonText: NOIR.ink, link: NOIR.pressBlue },
  { id: "scheme-inverse", name: "Noir (dark)", v: 2, background: NOIR.black, surface: NOIR.panel, text: NOIR.white,
    muted: mixColors(NOIR.white, NOIR.black, 0.64), accent: NOIR.flare, onAccent: NOIR.ink, border: mixColors(NOIR.white, NOIR.black, 0.22),
    buttonBg: NOIR.flare, buttonText: NOIR.ink, link: NOIR.flareHover },
  { id: "scheme-accent", name: "Flare (accent)", v: 2, background: NOIR.flare, surface: NOIR.flareHover, text: NOIR.ink,
    muted: mixColors(NOIR.ink, NOIR.flare, 0.72), accent: NOIR.ink, onAccent: NOIR.white, border: NOIR.ink,
    buttonBg: NOIR.ink, buttonText: NOIR.white, link: NOIR.ink },
];

// ── Resolving ────────────────────────────────────────────────────────────────

/** The scheme list a design uses: its own when it has any, else the starter schemes. */
export function schemeList(design: any): ColorScheme[] {
  const own = design?.colorSchemes;
  return Array.isArray(own) && own.length > 0 ? own : DEFAULT_COLOR_SCHEMES;
}

/** True for a scheme that uses every role (made or edited with Colour schemes 2.0). */
export const usesAllRoles = (s: Partial<ColorScheme> | null | undefined) => Number(s?.v) >= 2;

const filled = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Every role filled in: stored values win, missing ones are worked out from background/text/accent. */
export function resolveScheme(s: Partial<ColorScheme>): FullScheme {
  const background = filled(s.background) ? s.background : NOIR.black;
  const text = filled(s.text) ? s.text : readableOn(background);
  const accent = filled(s.accent) ? s.accent : NOIR.flare;
  const onAccent = filled(s.onAccent) ? s.onAccent : readableOn(accent, NOIR.ink, NOIR.white);
  const buttonBg = filled(s.buttonBg) ? s.buttonBg : accent;
  return {
    ...(s as ColorScheme),
    id: String(s.id || ""), name: String(s.name || ""),
    background, text, accent, onAccent, buttonBg,
    surface: filled(s.surface) ? s.surface : background,
    muted: filled(s.muted) ? s.muted : mixColors(text, background, 0.64),
    border: filled(s.border) ? s.border : mixColors(text, background, 0.3),
    buttonText: filled(s.buttonText) ? s.buttonText : (buttonBg === accent ? onAccent : readableOn(buttonBg, NOIR.ink, NOIR.white)),
    link: filled(s.link) ? s.link : ((contrastRatio(accent, background) ?? 0) >= 4.5 ? accent : text),
  };
}

/** Upgrade a saved scheme to every role (what the first colour edit in Studio does). */
export const upgradeScheme = (s: ColorScheme): FullScheme => ({ ...resolveScheme(s), v: 2 });

/** The scheme an element or section asked for, or null (= the page's own colours). */
export function findScheme(schemes: ColorScheme[] | undefined, id: unknown): ColorScheme | null {
  if (!id || !Array.isArray(schemes)) return null;
  return schemes.find((s) => s && s.id === id) || null;
}

// ── CSS ──────────────────────────────────────────────────────────────────────

/**
 * Elements that can follow a scheme (Theme settings › Colour schemes) and the selector of their root.
 * The bag's root also carries data-fm-store / data-fm-checkout, which define the page tokens and the
 * checkout background on the same element, so its selector is more specific than those.
 */
export const ELEMENT_SCHEME_TARGETS = {
  cards: { label: "Book cards", selector: ".fm-card" },
  buyCard: { label: "Product page buy card", selector: ".fm-pdp-card" },
  cartDrawer: { label: "Shopping bag", selector: ".fm-bag[data-fm-store]" },
  header: { label: "Header", selector: "header[data-fm-header]" },
  footer: { label: "Footer", selector: "footer[data-fm-footer]" },
} as const;
export type ElementSchemeTarget = keyof typeof ELEMENT_SCHEME_TARGETS;

/**
 * The scheme a part of the shop follows (Theme settings › Colour schemes), or null. While a part
 * follows a scheme, the scheme's colours replace that part's own colour settings (cartDrawerStyle and
 * productPageStyle skip their palette keys; schemeCss outranks the card title/price colour), so
 * picking a scheme always shows.
 */
export const elementScheme = (design: any, target: ElementSchemeTarget): ColorScheme | null =>
  findScheme(schemeList(design), design?.elementSchemes?.[target]);

/**
 * Button colours for a button inside a part that may follow a scheme. Buttons that paint the
 * site-wide button colours inline (product page Add to bag, the shop card's hover button) would
 * otherwise hide the scheme's Button background / Button text roles.
 */
export function schemeButtonColors(design: any, target: ElementSchemeTarget, own: { bg: string; text: string }): { bg: string; text: string } {
  const s = elementScheme(design, target);
  if (!s) return own;
  const full = resolveScheme(s);
  return { bg: cssValue(full.buttonBg), text: cssValue(full.buttonText) };
}

const triplet = (c: string) => { const rgb = parseColor(c); return rgb ? rgb.join(", ") : null; };
// Scheme values come from the owner's design: keep them to one CSS value.
const cssValue = (v: string) => String(v).replace(/[;{}<>\\]/g, "").trim();
const cssId = (id: string) => String(id).replace(/["\\\n\r<>{}]/g, "");

/** The CSS custom properties for one scheme (the storefront's own token names). */
export function schemeVars(scheme: Partial<ColorScheme>): string {
  const s = resolveScheme(scheme);
  const v = (x: string) => cssValue(x);
  const decl: string[] = [
    `--bg-color:${v(s.background)}`, `--text-color:${v(s.text)}`,
    `--surface:${v(s.surface)}`, `--surface-2:${v(s.surface)}`,
    `--muted:${v(s.muted)}`, `--accent:${v(s.accent)}`, `--on-accent:${v(s.onAccent)}`,
    `--border-color:${v(s.border)}`, `--btn-bg:${v(s.buttonBg)}`, `--btn-text:${v(s.buttonText)}`,
    `--link-color:${v(s.link)}`, `--active-bg:${v(s.text)}`, `--active-fg:${v(s.background)}`,
    `--rp-outline:${v(s.text)}`,
  ];
  // Triplets stay comma-separated so rgba(var(--x-rgb), a) is valid CSS.
  const rgb: [string, string][] = [["--fg-rgb", s.text], ["--surface-rgb", s.surface], ["--surface-2-rgb", s.surface], ["--muted-rgb", s.muted], ["--accent-rgb", s.accent], ["--border-rgb", s.border]];
  for (const [name, color] of rgb) { const t = triplet(color); if (t) decl.push(`${name}:${t}`); }
  return decl.join(";") + ";";
}

/**
 * Every `[data-scheme]` rule plus the element schemes, for one page design. Empty for a design whose
 * schemes all predate Colour schemes 2.0 and that sets no element scheme — those pages look exactly
 * as before.
 */
export function schemeCss(design: any): string {
  const schemes = schemeList(design);
  let css = "";
  for (const s of schemes) {
    if (!s?.id || !usesAllRoles(s)) continue;
    const sel = `[data-scheme="${cssId(s.id)}"]`;
    css += `${sel}{${schemeVars(s)}}`;
    css += `:where(${sel}){background-color:var(--bg-color);color:var(--text-color);}`;
    css += `${sel} :where(a:not([class])){color:var(--link-color);}`;
  }
  const chosen = design?.elementSchemes;
  if (chosen && typeof chosen === "object") {
    for (const [key, target] of Object.entries(ELEMENT_SCHEME_TARGETS)) {
      const s = findScheme(schemes, chosen[key]);
      if (!s) continue;
      // Variables on the element itself: its own Studio rules fall back to these tokens, and skip
      // their colour keys while the part follows a scheme (elementScheme), so the scheme shows.
      css += `${target.selector}{${schemeVars(s)}}`;
      // Checkout & cart › background is painted on the bag with !important; the bag's scheme wins.
      if (key === "cartDrawer") css += `${target.selector}{background-color:var(--bg-color) !important;}`;
      if (key === "cards") {
        css += `:where(${target.selector}){background-color:var(--bg-color);color:var(--text-color);}`;
        // The scheme's text replaces Product cards & grid › title/price colour inside a card
        // (cardTypography's rule is [data-fm-store] .fm-card-title … !important; this one is more specific).
        css += `[data-fm-store] .fm-card .fm-card-title,[data-fm-store] .fm-card .fm-card-price-wrap{color:var(--text-color) !important;}`;
      } else css += `:where(${target.selector}){color:var(--text-color);}`;
    }
  }
  return css;
}

// ── Studio helpers (pure) ────────────────────────────────────────────────────

/** Three contrast checks the scheme editor shows as badges. */
export function schemeContrast(scheme: Partial<ColorScheme>) {
  const s = resolveScheme(scheme);
  return [
    { id: "text", label: "Text on background", ratio: contrastRatio(s.text, s.background) },
    { id: "button", label: "Button text on button", ratio: contrastRatio(s.buttonText, s.buttonBg) },
    { id: "accent", label: "Text on accent", ratio: contrastRatio(s.onAccent, s.accent) },
  ].map((c) => ({ ...c, level: contrastLevel(c.ratio) }));
}
