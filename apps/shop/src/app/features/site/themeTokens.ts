// ─────────────────────────────────────────────────────────────────────────────
// Semantic theme tokens for the storefront.
//
// This is the shared "token layer" that lets the Theme Editor reach every visual
// surface of the outer-facing app instead of leaving large parts hardcoded.
//
// Two pieces:
//   1. buildStorefrontTokenVars(design) — emits the CSS custom properties
//      (--fg-rgb, --surface, --accent, --success, …) derived from the saved
//      design object, with defaults that preserve the current dark look.
//   2. STOREFRONT_TOKEN_CSS — a static stylesheet that remaps the Tailwind
//      white/black alpha utilities (text-white/40, bg-white/[0.03], border-white/10,
//      bg-black/70, …) onto those tokens. Because the selectors are scoped under
//      [data-fm-store] they out-specify Tailwind's base utilities, so hundreds of
//      previously-hardcoded muted-text / surface / border values become themeable
//      with no per-element edits.
//
// Anything that needs a *solid* brand/status color (sale badge, wishlist, active
// tab, …) reads a token directly via var(--success), var(--favorite), etc.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a hex or rgb()/rgba() color to an "r, g, b" triplet for use in rgba(var(--x), a).
 * Commas are required: `rgba(255 255 255, 0.4)` (space triplet + comma alpha) is invalid CSS, which
 * silently dropped every text-white/N, bg-white/N and border-white/N remap.
 */
import { STOREFRONT_COLOR_CLASSES } from "./storefrontColorClasses";
import { trackingEm } from "./shopTypography";

export function hexToRgbTriplet(input?: string, fallback = "255, 255, 255"): string {
  if (!input) return fallback;
  let c = String(input).trim();

  const rgbMatch = c.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,\s/]+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      if ([r, g, b].every((n) => !Number.isNaN(parseInt(n, 10)))) {
        return `${parseInt(r, 10)}, ${parseInt(g, 10)}, ${parseInt(b, 10)}`;
      }
    }
    return fallback;
  }

  c = c.replace("#", "");
  if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
  if (c.length < 6) return fallback;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return fallback;
  return `${r}, ${g}, ${b}`;
}

export interface StorefrontTokenInput {
  /** Base foreground (text / icon) color. */
  textColor?: string;
  /** Page background. */
  backgroundColor?: string;
  /** Brand accent. */
  primaryColor?: string;
  /** Solid background for image wells & cards (defaults to near-black). */
  surfaceColor?: string;
  /** Solid background for raised / elevated cards. */
  surfaceRaisedColor?: string;
  /** Success / confirmation color (added-to-cart, savings badge). */
  successColor?: string;
  /** Favorite / wishlist accent. */
  favoriteColor?: string;
  /** Background of an active control (selected tab / variant). */
  activeControlBg?: string;
  /** Text of an active control. */
  activeControlText?: string;
  /** Color used for scrims / overlays (sold-out, image darken). */
  overlayColor?: string;
  [key: string]: any;
}

/**
 * Emit the CSS custom-property declarations (without the wrapping selector) for a
 * design object. Drop the result inside any `[data-fm-store] { … }` rule.
 */
export function buildStorefrontTokenVars(design: StorefrontTokenInput = {}): string {
  const fg = design?.textColor || "#ffffff";
  const bg = design?.backgroundColor || "#050508";
  const accent = design?.primaryColor || "#A855F7";
  const surface = design?.surfaceColor || "#0a0a0a";
  const surface2 = design?.surfaceRaisedColor || "#171717";
  const success = design?.successColor || "#34d399";
  const favorite = design?.favoriteColor || "#fb7185";
  const activeBg = design?.activeControlBg || fg;
  const activeFg = design?.activeControlText || bg;
  const overlay = design?.overlayColor || "#000000";
  const onSuccess = design?.successTextColor || "#ffffff";
  // Secondary accent (cyan), warning (amber), danger/error (rose).
  const accent2 = design?.secondaryColor || "#22d3ee";
  const warning = design?.warningColor || "#f59e0b";
  const danger = design?.dangerColor || "#f43f5e";
  // Muted/secondary body text.
  const muted = design?.mutedTextColor || "#94a3b8";
  const fgTriplet = hexToRgbTriplet(fg, "255, 255, 255");

  return [
    `--fg-rgb: ${fgTriplet};`,
    // Border tint: follows the dedicated "Border" color when set, else the
    // foreground. Alpha gradation of each border utility is preserved.
    `--border-rgb: ${hexToRgbTriplet(design?.borderColor, fgTriplet)};`,
    `--overlay-rgb: ${hexToRgbTriplet(overlay, "0, 0, 0")};`,
    `--surface: ${surface};`,
    `--surface-rgb: ${hexToRgbTriplet(surface, "10, 10, 10")};`,
    `--surface-2: ${surface2};`,
    `--surface-2-rgb: ${hexToRgbTriplet(surface2, "23, 23, 23")};`,
    `--accent: ${accent};`,
    `--accent-rgb: ${hexToRgbTriplet(accent, "168, 85, 247")};`,
    `--accent-2: ${accent2};`,
    `--accent-2-rgb: ${hexToRgbTriplet(accent2, "34, 211, 238")};`,
    `--success: ${success};`,
    `--success-rgb: ${hexToRgbTriplet(success, "52, 211, 153")};`,
    `--warning: ${warning};`,
    `--warning-rgb: ${hexToRgbTriplet(warning, "245, 158, 11")};`,
    `--danger: ${danger};`,
    `--danger-rgb: ${hexToRgbTriplet(danger, "244, 63, 94")};`,
    `--favorite: ${favorite};`,
    `--favorite-rgb: ${hexToRgbTriplet(favorite, "251, 113, 133")};`,
    `--active-bg: ${activeBg};`,
    `--active-fg: ${activeFg};`,
    `--on-success: ${onSuccess};`,
    `--muted: ${muted};`,
    `--muted-rgb: ${hexToRgbTriplet(muted, "148, 163, 184")};`,
    // Riso Press print treatment — every literal is an editable design key.
    `--rp-outline: ${design?.risoOutlineColor || fg};`,
    `--rp-outline-w: ${Number.isFinite(Number(design?.risoOutlineWidth)) && design?.risoOutlineWidth !== "" && design?.risoOutlineWidth != null ? Number(design.risoOutlineWidth) : 2}px;`,
    `--rp-shadow-color: ${design?.risoShadowColor || `rgba(${fgTriplet},0.3)`};`,
    `--rp-shadow-x: ${Number.isFinite(Number(design?.risoShadowOffset)) && design?.risoShadowOffset != null && design?.risoShadowOffset !== "" ? Number(design.risoShadowOffset) : 3}px;`,
    `--rp-focus: ${design?.focusRingColor || accent};`,
    `--rp-card-radius: ${Number.isFinite(Number(design?.risoCardRadius)) && design?.risoCardRadius != null && design?.risoCardRadius !== "" ? Number(design.risoCardRadius) : 4}px;`,
    `--rp-heading-transform: ${design?.risoUppercaseHeadings === false ? "none" : "uppercase"};`,
    // Typography › Heading weight and Letter spacing must win over the Riso heading treatment.
    `--rp-heading-weight: ${["300", "400", "500", "600", "700", "800", "900"].includes(String(design?.headingWeight)) ? design.headingWeight : 400};`,
    `--rp-heading-tracking: ${(0.01 + trackingEm(design?.letterSpacing)).toFixed(2)}em;`,
    `--on-accent: ${design?.buttonTextColor || "#100f0d"};`,
  ].join("\n      ");
}

// ── Tailwind colour-utility remap ────────────────────────────────────────────
// Nothing on the storefront may keep a fixed Tailwind colour: every colour class the
// public site uses (listed in storefrontColorClasses.ts, kept complete by
// designerCoverage.test.ts) is re-pointed here at a Studio token, including its
// hover/focus/selection/responsive variants. Rules are scoped under [data-fm-store]
// so they out-specify Tailwind's own utilities. Only classes actually in use are
// emitted, which keeps the stylesheet a few KB instead of every possible shade.

type Role = { solid: string; rgb: string };
const HUE_ROLES: Record<string, Role> = {
  violet: { solid: "--accent", rgb: "--accent-rgb" },
  purple: { solid: "--accent", rgb: "--accent-rgb" },
  indigo: { solid: "--accent", rgb: "--accent-rgb" },
  sky: { solid: "--accent", rgb: "--accent-rgb" },
  blue: { solid: "--accent", rgb: "--accent-rgb" },
  pink: { solid: "--accent", rgb: "--accent-rgb" },
  fuchsia: { solid: "--accent", rgb: "--accent-rgb" },
  cyan: { solid: "--accent-2", rgb: "--accent-2-rgb" },
  teal: { solid: "--success", rgb: "--success-rgb" },
  emerald: { solid: "--success", rgb: "--success-rgb" },
  green: { solid: "--success", rgb: "--success-rgb" },
  lime: { solid: "--success", rgb: "--success-rgb" },
  amber: { solid: "--warning", rgb: "--warning-rgb" },
  yellow: { solid: "--warning", rgb: "--warning-rgb" },
  orange: { solid: "--warning", rgb: "--warning-rgb" },
  rose: { solid: "--danger", rgb: "--danger-rgb" },
  red: { solid: "--danger", rgb: "--danger-rgb" },
};
const GREYS = new Set(["slate", "gray", "zinc", "neutral", "stone"]);

const COLOR_CLASS_RE =
  /^(bg|text|border|ring|from|via|to|placeholder|outline|divide|fill|stroke|decoration|caret|accent)-(white|black|slate|gray|zinc|neutral|stone|violet|purple|indigo|sky|blue|pink|fuchsia|cyan|teal|emerald|green|lime|amber|yellow|orange|rose|red)(?:-(\d{2,3}))?(?:\/(\d+|\[[\d.]+\]))?$/;

function alphaOf(suffix?: string): number | null {
  if (!suffix) return null;
  return suffix.startsWith("[") ? parseFloat(suffix.slice(1, -1)) : parseInt(suffix, 10) / 100;
}

/** The token-driven colour value for one Tailwind colour utility (without variants). */
function tokenValue(prefix: string, color: string, shade: number, alpha: number | null): string | null {
  const rgba = (v: string, a: number) => `rgba(var(${v}), ${a})`;
  if (color === "white") {
    const v = prefix === "border" || prefix === "divide" ? "--border-rgb" : prefix === "bg" && alpha !== null ? "--surface-rgb" : "--fg-rgb";
    return alpha === null ? `rgb(var(${v}))` : rgba(v, alpha);
  }
  if (color === "black") {
    if (alpha !== null) return rgba("--overlay-rgb", alpha);
    return prefix === "text" ? "var(--bg-color)" : "rgb(var(--overlay-rgb))";
  }
  if (GREYS.has(color)) {
    if (alpha !== null) return rgba(prefix === "border" || prefix === "divide" ? "--border-rgb" : "--fg-rgb", alpha);
    if (prefix === "border" || prefix === "divide" || prefix === "outline") return rgba("--border-rgb", shade >= 400 ? 0.65 : 0.4);
    if (prefix === "bg") {
      if (shade <= 100) return "var(--surface-2)";
      if (shade <= 300) return rgba("--fg-rgb", 0.16);
      if (shade <= 500) return "var(--muted)";
      if (shade <= 700) return "rgb(var(--fg-rgb))";
      return "var(--surface)";
    }
    if (shade >= 800) return "rgb(var(--fg-rgb))";
    if (shade >= 600) return rgba("--fg-rgb", 0.8);
    if (shade >= 400) return "var(--muted)";
    return rgba("--fg-rgb", 0.5);
  }
  const role = HUE_ROLES[color];
  if (!role) return null;
  if (alpha !== null) return rgba(role.rgb, alpha);
  if (shade <= 200 && prefix === "bg") return rgba(role.rgb, 0.14);
  if (shade <= 200 && (prefix === "border" || prefix === "divide")) return rgba(role.rgb, 0.5);
  return `var(${role.solid})`;
}

function declaration(prefix: string, value: string): string {
  switch (prefix) {
    case "text": return `color:${value};`;
    case "bg": return `background-color:${value};`;
    case "border": return `border-color:${value};`;
    case "divide": return `border-color:${value};`;
    case "outline": return `outline-color:${value};`;
    case "ring": return `--tw-ring-color:${value};`;
    case "from": return `--tw-gradient-from:${value};`;
    case "via": return `--tw-gradient-via:${value};`;
    case "to": return `--tw-gradient-to:${value};`;
    case "fill": return `fill:${value};`;
    case "stroke": return `stroke:${value};`;
    case "decoration": return `text-decoration-color:${value};`;
    case "caret": return `caret-color:${value};`;
    case "accent": return `accent-color:${value};`;
    default: return `color:${value};`; // placeholder-*
  }
}

const BREAKPOINTS: Record<string, string> = { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem", "2xl": "96rem" };
const PSEUDO: Record<string, string> = {
  hover: ":hover", focus: ":focus", "focus-visible": ":focus-visible", "focus-within": ":focus-within",
  active: ":active", disabled: ":disabled", checked: ":checked",
};

/** Escape a Tailwind class so it can be used as a CSS selector. */
function escapeClass(cls: string): string {
  return cls.replace(/[/[\].:]/g, (ch) => "\\" + ch);
}

/**
 * The scoped rule that re-points one storefront colour class (e.g. `hover:bg-neutral-800`,
 * `text-white/40`, `md:from-black/80`) at the Studio tokens, or null when it is not a colour
 * utility this layer understands.
 */
export function colorUtilityCss(cls: string): string | null {
  const parts = cls.split(":");
  const base = parts.pop()!;
  const m = COLOR_CLASS_RE.exec(base);
  if (!m) return null;
  const [, prefix, color, shadeStr, alphaStr] = m;
  const value = tokenValue(prefix, color, shadeStr ? parseInt(shadeStr, 10) : 500, alphaOf(alphaStr));
  if (!value) return null;
  let decl = declaration(prefix, value);
  // Solid dark grey chips/buttons (quantity badge, Apply) sit under light words: invert them.
  if (prefix === "bg" && GREYS.has(color) && alphaStr === undefined && /^(600|700)$/.test(shadeStr || "")) {
    decl += "color:var(--bg-color) !important;";
  }
  let sel = `.${escapeClass(cls)}`;
  let media = "";
  let pseudoEl = prefix === "placeholder" ? "::placeholder" : "";
  let groupHover = false;
  let selection = false;
  for (const v of parts) {
    if (BREAKPOINTS[v]) media = `@media (width >= ${BREAKPOINTS[v]})`;
    else if (PSEUDO[v]) sel += PSEUDO[v];
    else if (v === "group-hover") groupHover = true;
    else if (v === "placeholder") pseudoEl = "::placeholder";
    else if (v === "selection") selection = true;
    else return null; // unknown variant (dark:, aria-*, …)
  }
  let selector = `[data-fm-store] ${groupHover ? ".group:hover " : ""}${sel}${pseudoEl}`;
  if (selection) selector = `[data-fm-store] ${sel}::selection,[data-fm-store] ${sel} ::selection`;
  const rule = `${selector}{${decl}}`;
  return media ? `${media}{${rule}}` : rule;
}

/** Every colour class in `classes`, re-pointed at the tokens. */
export function colorUtilitiesCss(classes: readonly string[]): string {
  return classes.map(colorUtilityCss).filter(Boolean).join("\n");
}

/**
 * Static stylesheet that wires the storefront's Tailwind colour utilities + a few semantic
 * helper classes onto the token layer. Inject once per storefront surface.
 *
 * The `[data-fm-store].fm-page` / `.fm-surface` / `.text-white` rules exist because roots such as
 * Account, Tracking and the Checkout states carry `data-fm-store` AND the class on the SAME element,
 * which the descendant selectors never match. Every line must stay scoped (see themeTokens.test.ts).
 */
export const STOREFRONT_TOKEN_CSS = `
${colorUtilitiesCss(STOREFRONT_COLOR_CLASSES)}
[data-fm-store] .fm-page{background-color:var(--bg-color);}
[data-fm-store].fm-page{background-color:var(--bg-color);}
[data-fm-store].fm-surface{background-color:var(--surface);}
[data-fm-store].text-white{color:rgb(var(--fg-rgb));}
[data-fm-store] .fm-muted{color:var(--muted);}
[data-fm-store] .fm-accent-text{color:var(--accent);}
[data-fm-store] .fm-accent-bg{background-color:var(--accent);}
[data-fm-store] .fm-success-text{color:var(--success);}
[data-fm-store] .fm-favorite-text{color:var(--favorite);}
[data-fm-store] .fm-surface{background-color:var(--surface);}
[data-fm-store] .fm-surface-2{background-color:var(--surface-2);}
[data-fm-store] .fm-success-solid{background-color:var(--success);color:var(--on-success);}
[data-fm-store] .fm-active{background-color:var(--active-bg);color:var(--active-fg);}
[data-fm-store] .fm-favorite-active{color:var(--favorite);background-color:rgba(var(--favorite-rgb), 0.1);border-color:rgba(var(--favorite-rgb), 0.4);}
[data-fm-store] .fm-accent-hover-border:hover{border-color:rgba(var(--accent-rgb), 0.3);}
[data-fm-store] .fm-accent-shadow{box-shadow:0 10px 30px rgba(var(--accent-rgb), 0.25);}
`;

/**
 * Riso Press treatment shared by every storefront surface when the Riso theme is
 * active: flat ink on newsprint, 2px ink outlines on objects, square corners,
 * flat offset shadows, one flare focus ring. Mirrors the published design system
 * (payment clarity always outranks decoration — inputs stay conventional).
 */
// Riso Press legibility floor: the storefront's faint `text-white/20…50` greys were tuned for a
// glassy dark UI. Print-style pages need real contrast, so lift them (still theme-driven).
const RISO_TEXT_FLOOR = ([["20", 0.55], ["25", 0.55], ["30", 0.55], ["40", 0.65], ["50", 0.72]] as const)
  .map(([n, a]) => `[data-fm-store] .text-white\\/${n}{color:rgba(var(--fg-rgb),${a});}`)
  .join("\n");

export const RISO_STOREFRONT_CSS = `
${RISO_TEXT_FLOOR}
[data-fm-store] h1,[data-fm-store] h2,[data-fm-store] h3{text-wrap:balance;text-transform:var(--rp-heading-transform,uppercase);letter-spacing:var(--rp-heading-tracking,.01em);font-weight:var(--rp-heading-weight,400);}
[data-fm-store] button,[data-fm-store] a{transition-timing-function:cubic-bezier(.2,.7,.2,1);}
[data-fm-store] .glass-card{
  backdrop-filter:none;
  background:var(--surface-2,var(--surface));
  border:var(--rp-outline-w) solid var(--rp-outline) !important;
  border-radius:var(--rp-card-radius);
  box-shadow:var(--rp-shadow-x) var(--rp-shadow-x) 0 var(--rp-shadow-color);
}
[data-fm-store] .custom-btn,[data-fm-store] button.custom-btn{
  border:var(--rp-outline-w) solid var(--rp-outline);border-radius:0;box-shadow:2px 2px 0 var(--rp-shadow-color);
  text-transform:uppercase;letter-spacing:.09em;font-weight:800;
}
[data-fm-store] .custom-btn:hover{box-shadow:var(--rp-shadow-x) var(--rp-shadow-x) 0 var(--rp-shadow-color);}
[data-fm-store] input,[data-fm-store] select,[data-fm-store] textarea{border-radius:0 !important;box-shadow:none;}
[data-fm-store] :is(input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),select,textarea):not(.bg-transparent){border:1px solid rgba(var(--border-rgb),.75) !important;}
[data-fm-store] :is(input,select,textarea):focus-visible{border-color:var(--rp-focus) !important;}
[data-fm-store] [class*="rounded-"]:not([class*="rounded-full"]):not([style*="border-radius"]){border-radius:0 !important;}
[data-fm-store] :is(button,a,input,select,label).rounded-full:not([style*="border-radius"]){border-radius:0 !important;}
[data-fm-store] .glass-card,[data-fm-store] [class*="rounded-[2"],[data-fm-store] [class*="rounded-[3"]{border-radius:var(--rp-card-radius) !important;}
[data-fm-store] [class*="shadow-"]:not([class*="shadow-none"]):not(.custom-btn){box-shadow:var(--rp-shadow-x) var(--rp-shadow-x) 0 var(--rp-shadow-color) !important;}
[data-fm-store] :where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--rp-focus);outline-offset:2px;}
[data-fm-store] .fm-accent-bg,[data-fm-store] .fm-success-solid{color:var(--on-accent);}
[data-fm-store] ::selection{background:var(--accent);color:var(--on-accent);}
@media (pointer:coarse){[data-fm-store] .custom-btn{min-height:44px;}}
@media (prefers-reduced-motion:reduce){[data-fm-store] *{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}}
`;

/**
 * Optional halftone dot texture (design.risoGrain, 0–1, default 0 = off). Kept out of
 * RISO_STOREFRONT_CSS so the base treatment stays flat; only emitted when a merchant opts in.
 */
export function risoGrainCss(design: StorefrontTokenInput = {}): string {
  const g = Number(design?.risoGrain);
  if (!Number.isFinite(g) || g <= 0) return "";
  const a = Math.min(g, 1) * 0.16;
  return `[data-fm-store]{background-image:radial-gradient(rgba(var(--fg-rgb),${a.toFixed(3)}) 1px,transparent 1.3px);background-size:6px 6px;}`;
}

/**
 * Dark checkout for dark themes. Checkout markup is deliberately conventional (white paper, slate
 * text) so payment stays legible; on any dark theme these remaps turn that same markup into
 * white-on-black without touching a single class, and every colour still comes from the tokens.
 */
export const RISO_CHECKOUT_DARK_CSS = (() => {
  const P = "[data-fm-checkout]";
  const rules: string[] = [
    `${P}.bg-white{background-color:var(--bg-color);}`,
    `${P}.text-slate-900{color:rgb(var(--fg-rgb));}`,
    `${P} .bg-white{background-color:var(--surface);}`,
    `${P} header.bg-white{background-color:var(--bg-color);}`,
    `${P} .bg-white\\/90{background-color:rgba(var(--surface-rgb),.9);}`,
  ];
  for (const fam of ["slate", "gray", "zinc", "neutral"]) {
    for (const n of ["800", "900", "950"]) rules.push(`${P} .text-${fam}-${n}{color:rgb(var(--fg-rgb));}`);
    for (const n of ["600", "700"]) rules.push(`${P} .text-${fam}-${n}{color:rgba(var(--fg-rgb),.8);}`);
    for (const n of ["400", "500"]) rules.push(`${P} .text-${fam}-${n}{color:var(--muted);}`);
    rules.push(`${P} .text-${fam}-300{color:rgba(var(--fg-rgb),.5);}`);
    for (const n of ["100", "200", "300"]) rules.push(`${P} .border-${fam}-${n}{border-color:rgba(var(--border-rgb),.4);}`);
    rules.push(`${P} .border-${fam}-400{border-color:rgba(var(--border-rgb),.65);}`);
    for (const n of ["50", "100"]) rules.push(`${P} .bg-${fam}-${n}{background-color:var(--surface-2);}`);
    for (const n of ["200", "300"]) rules.push(`${P} .bg-${fam}-${n}{background-color:rgba(var(--fg-rgb),.16);}`);
    rules.push(`${P} .placeholder\\:text-${fam}-400::placeholder{color:var(--muted);}`);
    rules.push(`${P} .hover\\:bg-${fam}-50:hover{background-color:var(--surface-2);}`);
    rules.push(`${P} .hover\\:text-${fam}-900:hover{color:rgb(var(--fg-rgb));}`);
    rules.push(`${P} .disabled\\:bg-${fam}-100:disabled{background-color:var(--surface-2);}`);
  }
  const tint = (hue: string, rgb: string, solid: string) => {
    rules.push(`${P} .bg-${hue}-50,${P} .bg-${hue}-100{background-color:rgba(var(${rgb}),.14);}`);
    rules.push(`${P} .border-${hue}-200,${P} .border-${hue}-300{border-color:rgba(var(${rgb}),.5);}`);
    for (const n of ["600", "700", "800", "900"]) rules.push(`${P} .text-${hue}-${n}{color:var(${solid});}`);
  };
  tint("amber", "--warning-rgb", "--warning");
  tint("red", "--danger-rgb", "--danger");
  tint("rose", "--danger-rgb", "--danger");
  tint("emerald", "--success-rgb", "--success");
  tint("green", "--success-rgb", "--success");
  tint("sky", "--accent-rgb", "--accent");
  tint("blue", "--accent-rgb", "--accent");
  return rules.join("\n");
})();
