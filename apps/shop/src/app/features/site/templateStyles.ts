// ─────────────────────────────────────────────────────────────────────────────
// Full storefront templates (plan 10.9 to 10.12): a template is a theme with its own `themeStyle` and its own
// scoped stylesheet, so its header, book cards, buttons, book page, bag and footer are drawn as one design system,
// not as a recolour of another look. The stylesheet only exists while the design's `themeStyle` names the template.
// The look is picked in the theme picker; Theme settings › Print style & template details › Print style switches it.
//
//   marquee: a loud ruled masthead, a bare cover wall, round stickers and hard offset shadows on buttons.
//   shelf:   a colour-block hero, a white shelf of books that overlaps it, pill buttons and soft rounded covers.
//   atlas:   a clean catalogue: hairline frames, small square tags, tabular prices and quiet square buttons.
//   mosaic:  products on coloured tiles that cycle through the palette, chunky keycap buttons and heavy rules.
//   arch:    arch-topped photos, centred serif titles, thin pill buttons and a footer that rises in an arch.
//   market:  tilted sticker cards with hard shadows, black price tags and chunky buttons that press down.
//   index:   the catalogue as ruled rows: a small cover, a bold title and the price at the right edge.
//
// Designer coverage (4 November 2026): everything a template draws must stay editable in Studio. A template never
// writes a value a press could want to change as a literal: colours and fonts come from the theme tokens
// (buildStorefrontTokenVars: --accent, --surface, --rp-outline, --heading-font …) and every shape a Studio control
// owns (button corners, letter case and shadow, photo corners, card title and heading case, outlines, offset
// shadows, ruled lines, photo frames, card tilt, the footer curve, the price tag) reads a TEMPLATE_KNOBS variable,
// with the template's own look as the fallback: `var(--tpl-btn-radius, 999px)`. The variables are written only for
// the controls the press has set, so an untouched shop shows the template exactly as designed, and a changed
// control always wins. templateCoverage.test.ts fails a template (old or new) that writes one of those shapes as a
// literal, skips a knob, or is missing from the Print style list, the theme library or the home layouts.
// ─────────────────────────────────────────────────────────────────────────────
import { RISO_STOREFRONT_CSS, risoGrainCss, type StorefrontTokenInput } from "./themeTokens";
import { RADIUS_SCALES } from "./designTokens";
import { PHOTO_OUTLINES } from "./photoShapes";

/** Every template, with the name the Print style list shows. Add a new template here first. */
export const TEMPLATE_STYLES = [
  { id: "marquee", label: "Marquee (ruled masthead, stickers, offset buttons)" },
  { id: "shelf", label: "Shelf (soft covers, pill buttons)" },
  { id: "atlas", label: "Atlas (clean catalogue, hairline frames)" },
  { id: "mosaic", label: "Mosaic (coloured tiles, keycap buttons)" },
  { id: "arch", label: "Arch (arched photos, thin pill buttons)" },
  { id: "market", label: "Market stall (tilted sticker cards, hard shadows)" },
  { id: "index", label: "Index (the catalogue as ruled rows)" },
] as const;
export const TEMPLATE_STYLE_IDS = TEMPLATE_STYLES.map((t) => t.id);
export type TemplateStyleId = (typeof TEMPLATE_STYLES)[number]["id"];

const S = "[data-fm-store]";
/**
 * The buttons a template draws: the shop's own (`.custom-btn`, `.store-btn-primary`) and the newsletter sign-up
 * button under the page (`.fm-newsletter-btn`), which has no other template style.
 */
const BUTTON_CLASSES = [".custom-btn", ".store-btn-primary", "button.custom-btn", ".fm-newsletter-btn"];
const buttons = (state = "") => BUTTON_CLASSES.filter((c) => !state || !c.startsWith("button.")).map((c) => `${S} ${c}${state}`).join(",");
const BTN = buttons();
const BTN_HOVER = buttons(":hover");
const BTN_ACTIVE = buttons(":active");

// ── Knobs: the Studio controls every template obeys ─────────────────────────────────────────────────────────────
type Design = Record<string, any>;
const set = (v: unknown) => v !== undefined && v !== null && v !== "";
const px = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return set(v) && Number.isFinite(n) ? `${Math.max(min, Math.min(max, n))}px` : undefined;
};
const colour = (v: unknown) => (typeof v === "string" && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(v.trim()) ? v.trim() : undefined);
const yesNo = (v: unknown, yes: string, no: string) => (typeof v === "boolean" ? (v ? yes : no) : undefined);
const oneOf = (v: unknown, allowed: string[]) => (typeof v === "string" && allowed.includes(v) ? v : undefined);
const corner = (d: Design) => (RADIUS_SCALES[d.radiusScale] ? `${RADIUS_SCALES[d.radiusScale].m}px` : px(d.cardRadius, 0, 30));

export type TemplateKnob = {
  /** The CSS variable a template reads (`var(--tpl-…, <the template's own look>)`). */
  cssVar: string;
  /** The Studio › Theme settings keys behind it (each one is a Style control; the coverage test checks). */
  keys: string[];
  /** The variable's value from the design, or undefined to keep the template's own look. */
  value: (d: Design) => string | undefined;
  /**
   * Shapes only some templates draw by default (headings in capitals, a tilt, an arched footer, a boxed price), or
   * that buttons with their own inline border would hide. Once the press sets the control, this rule draws it on
   * every template and every button, so the control never does nothing.
   */
  rule?: string;
  /** Draw `rule` only for these values (default: whenever the control is set). */
  ruleFor?: string[];
};

/**
 * Some buttons draw their own border inline from the Button style setting (the header's bag button, the book page's
 * Add to bag and retry buttons), which beats a template's button rule. Once the press sets a template outline, the
 * border each template writes into `--template-btn-border` wins on every button. Untouched, those buttons keep the
 * border they have always had.
 */
const BUTTON_OUTLINE_RULE = `${BTN}{border:var(--template-btn-border) !important;}`;
/**
 * The same for shadows: the book page's Add to bag draws its own soft shadow (important), and hides any shadow on
 * hover. Once the press sets a template shadow control, each template's own button shadow (`--template-btn-shadow`,
 * including its hover and pressed shadows) wins there too. Add to bag's Glow animation (`.fm-cta-glow`) keeps its glow.
 */
const BUTTON_SHADOW_RULE = `${["", ":hover", ":active"].map((st) => buttons(`:not(.fm-cta-glow)${st}`)).join(",")}{box-shadow:var(--template-btn-shadow) !important;}`;

export const TEMPLATE_KNOBS: TemplateKnob[] = [
  { cssVar: "--tpl-btn-radius", keys: ["buttonRadius"], value: (d) => px(d.buttonRadius, 0, 999) },
  { cssVar: "--tpl-btn-case", keys: ["buttonUppercase"], value: (d) => yesNo(d.buttonUppercase, "uppercase", "none") },
  // On gives buttons the template's hard shadow on a template that draws none (Shelf, Atlas, Arch, Index); it
  // multiplies the shadow's distance. Off keeps the template's own: Hard shadow distance 0 takes a shadow away.
  { cssVar: "--tpl-btn-shadow", keys: ["buttonShadow"], value: (d) => (d.buttonShadow === true ? "1" : undefined), rule: BUTTON_SHADOW_RULE },
  {
    // "As typed" lifts a template's capitals (Marquee, Market stall); "Capitals" puts every heading in capitals. As
    // typed never forces the other templates' headings down, so a section's own capitals setting still shows.
    cssVar: "--tpl-heading-case", keys: ["templateHeadingCase"], value: (d) => oneOf(d.templateHeadingCase, ["uppercase", "none"]),
    rule: `${S} h1,${S} h2,${S} h3{text-transform:var(--tpl-heading-case);}`, ruleFor: ["uppercase"],
  },
  { cssVar: "--tpl-title-case", keys: ["catalogTitleTransform"], value: (d) => oneOf(d.catalogTitleTransform, ["none", "uppercase", "capitalize"]) },
  {
    // The shop grid's photo shape: an Image outline wins (a cut-out one, like hexagon, squares the corners), then a
    // Design scales corner set. Card corner radius is left out on purpose: every shop has one stored (the starting
    // look writes 8, Arch's look 0), so it would flatten Arch's arches and Shelf's book corners in shops that never
    // asked for it. Untouched, each template keeps its own photo shape.
    cssVar: "--tpl-photo-radius", keys: ["photoOutline", "radiusScale"],
    value: (d) => {
      const o = typeof d.photoOutline === "string" && d.photoOutline !== "default" ? PHOTO_OUTLINES[d.photoOutline] : undefined;
      if (o) return o.radius || "0px";
      return RADIUS_SCALES[d.radiusScale] ? `${RADIUS_SCALES[d.radiusScale].m}px` : undefined;
    },
  },
  { cssVar: "--tpl-corner", keys: ["radiusScale", "cardRadius"], value: corner },
  // Template keys of their own (not the Riso Press ones, which every look's palette writes): untouched, each template
  // draws its own outlines and shadows; Marquee's fall back to the Riso Press controls it has always followed.
  { cssVar: "--tpl-outline", keys: ["templateOutlineColor"], value: (d) => colour(d.templateOutlineColor), rule: BUTTON_OUTLINE_RULE },
  { cssVar: "--tpl-outline-w", keys: ["templateOutlineWidth"], value: (d) => px(d.templateOutlineWidth, 0, 8), rule: BUTTON_OUTLINE_RULE },
  { cssVar: "--tpl-shadow", keys: ["templateShadowColor"], value: (d) => colour(d.templateShadowColor), rule: BUTTON_SHADOW_RULE },
  { cssVar: "--tpl-shadow-x", keys: ["templateShadowOffset"], value: (d) => px(d.templateShadowOffset, 0, 16), rule: BUTTON_SHADOW_RULE },
  { cssVar: "--tpl-rule-w", keys: ["templateRuleWidth"], value: (d) => px(d.templateRuleWidth, 0, 12) },
  {
    cssVar: "--tpl-frame-w", keys: ["templateFrameWidth"], value: (d) => px(d.templateFrameWidth, 0, 24),
    rule: `${S} .fm-card .fm-photo-frame{border-width:var(--tpl-frame-w) !important;border-style:solid;}`,
  },
  {
    cssVar: "--tpl-tilt", keys: ["templateCardTilt"],
    value: (d) => { const n = Number(d.templateCardTilt); return set(d.templateCardTilt) && Number.isFinite(n) ? `${Math.max(0, Math.min(4, n))}deg` : undefined; },
    rule: `${S} .fm-card{rotate:calc(var(--tpl-tilt) * -1);}${S} .fm-card:nth-child(even){rotate:calc(var(--tpl-tilt) * 5 / 6);}${S} .fm-card:nth-child(3n){rotate:calc(var(--tpl-tilt) * -1 / 3);}${S} .fm-card:hover{rotate:0deg;}@media (prefers-reduced-motion:reduce){${S} .fm-card,${S} .fm-card:hover{rotate:0deg;}}`,
  },
  {
    cssVar: "--tpl-footer-curve", keys: ["templateFooterCurve"], value: (d) => px(d.templateFooterCurve, 0, 120),
    rule: `${S} footer[data-fm-footer]{border-radius:var(--tpl-footer-curve) var(--tpl-footer-curve) 0 0;}`,
  },
  {
    // Product cards & grid › Price style: boxed draws a ruled tag around the price, plain takes it away.
    cssVar: "--tpl-price-box", keys: ["catalogPriceStyle"], value: (d) => (d.catalogPriceStyle === "boxed" ? "1" : d.catalogPriceStyle === "plain" ? "0" : undefined),
    rule: `${S} .fm-card-price-tag{border:calc(var(--tpl-price-box) * var(--tpl-outline-w,1px)) solid currentColor !important;padding:calc(var(--tpl-price-box) * .12rem) calc(var(--tpl-price-box) * .45rem) !important;}`,
  },
];

/** The press's own settings for the template: knob variables, then the rules that bring a knob to every template. */
export function templateKnobCss(design: StorefrontTokenInput | null | undefined): string {
  const d = (design || {}) as Design;
  const vars: string[] = [];
  const rules = new Set<string>(); // two knobs can share a rule (outline colour and width)
  for (const k of TEMPLATE_KNOBS) {
    const v = k.value(d);
    if (v === undefined) continue;
    vars.push(`${k.cssVar}:${v}`);
    if (k.rule && (!k.ruleFor || k.ruleFor.includes(v))) rules.add(k.rule);
  }
  return vars.length ? `${S}{${vars.join(";")};}${[...rules].join("")}` : "";
}

/** `var(--tpl-<name>, <fallback>)`: a knob, with the template's own look when the press has not set it. */
const v = (name: string, fallback: string) => `var(--tpl-${name},${fallback})`;
const BTN_SHADOW = (x: string, y: string, colour: string) => `calc(${v("btn-shadow", "1")} * ${x}) calc(${v("btn-shadow", "1")} * ${y}) 0 ${colour}`;
const NO_BTN_SHADOW = (colour: string) => `calc(${v("btn-shadow", "0")} * ${v("shadow-x", "3px")}) calc(${v("btn-shadow", "0")} * ${v("shadow-x", "3px")}) 0 ${colour}`;

/** The pieces every template shares: a readable floor for faint words, focus rings and reduced motion. */
const TEMPLATE_BASE_CSS = `
${[["20", 0.7], ["25", 0.7], ["30", 0.7], ["40", 0.72], ["50", 0.75]].map(([n, a]) => `${S} .text-white\\/${n}{color:rgba(var(--fg-rgb),${a});}`).join("\n")}
${S} :where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--rp-focus);outline-offset:2px;}
${S} ::selection{background:var(--accent);color:var(--on-accent);}
${S} h1,${S} h2,${S} h3{text-wrap:balance;}
${S} .fm-card-price-old{opacity:.75 !important;}
${S} .fm-newsletter-btn{border:var(--template-btn-border) !important;box-shadow:var(--template-btn-shadow) !important;}
@media (pointer:coarse){${S} .custom-btn{min-height:44px;}}
@media (prefers-reduced-motion:reduce){${S} *{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}}
`;

/**
 * Marquee: ruled masthead, a wall of bare covers, round stickers, hard offset shadows on buttons. Black ink on white
 * paper with one loud sticker colour (the badge colour). Outlines and shadows follow Print style & template details.
 */
const OUTLINE_M = v("outline", "var(--rp-outline)");
const OUTLINE_W_M = v("outline-w", "var(--rp-outline-w)");
const SHADOW_M = v("shadow", "var(--rp-shadow-color)");
const SHADOW_X_M = v("shadow-x", "var(--rp-shadow-x)");
export const MARQUEE_CSS = `
${S} h1,${S} h2,${S} h3{text-transform:${v("heading-case", "uppercase")};line-height:.95;letter-spacing:-.005em;font-weight:var(--rp-heading-weight,900);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);}
${S} .fm-ref-masthead{text-transform:uppercase;line-height:.82;letter-spacing:-.01em;font-weight:var(--rp-heading-weight,900);}
${S} .fm-ref-catbar{text-transform:uppercase;letter-spacing:.09em;font-size:.78rem;font-weight:800;}
${S} .fm-ref-catbar a[aria-current]{box-shadow:inset 0 calc(-1 * ${v("rule-w", "4px")}) 0 var(--accent);padding-bottom:3px;}
${S} .fm-card{transition:none;}
${S} .fm-card:hover{translate:0 0;}
${S} .fm-card .fm-photo-frame{border:${v("frame-w", OUTLINE_W_M)} solid ${OUTLINE_M};border-radius:${v("photo-radius", "0px")} !important;margin-bottom:.6rem;box-shadow:none;}
${S} .fm-card:hover .fm-photo-frame{box-shadow:${SHADOW_X_M} ${SHADOW_X_M} 0 ${SHADOW_M};transition:box-shadow .12s ease;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.5rem;left:auto;right:.5rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{display:grid;place-items:center;width:3.4rem;height:3.4rem;border-radius:50% !important;border:${OUTLINE_W_M} solid ${OUTLINE_M} !important;text-align:center;line-height:1.05;font-size:.58rem;font-weight:900;letter-spacing:.04em;padding:0;transform:rotate(10deg);}
${S} .fm-card [data-studio-label="Card title & price"]{border-top:0 !important;padding-top:0;}
${S} .fm-card-title{text-transform:${v("title-case", "uppercase")};font-size:.8rem;font-weight:800;letter-spacing:.05em;line-height:1.2;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.8rem;}
${BTN}{--template-btn-border:${OUTLINE_W_M} solid ${OUTLINE_M};border:var(--template-btn-border);border-radius:${v("btn-radius", "0px")} !important;text-transform:${v("btn-case", "uppercase")};letter-spacing:.1em;font-weight:800;--template-btn-shadow:${BTN_SHADOW(v("shadow-x", "5px"), v("shadow-x", "5px"), SHADOW_M)};box-shadow:var(--template-btn-shadow);transition:translate .1s ease,box-shadow .1s ease;}
${BTN_HOVER}{translate:2px 2px;--template-btn-shadow:${BTN_SHADOW(`max(0px, ${v("shadow-x", "5px")} - 2px)`, `max(0px, ${v("shadow-x", "5px")} - 2px)`, SHADOW_M)};box-shadow:var(--template-btn-shadow);}
${BTN_ACTIVE}{translate:5px 5px;--template-btn-shadow:${BTN_SHADOW("0px", "0px", SHADOW_M)};box-shadow:var(--template-btn-shadow);}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select,${S} textarea{border-radius:${v("btn-radius", "0px")} !important;}
${S} [class*="rounded-"]:not([class*="rounded-full"]):not([style*="border-radius"]){border-radius:${v("corner", "0px")} !important;}
${S} :is(button,a,label).rounded-full:not([style*="border-radius"]){border-radius:${v("btn-radius", "0px")} !important;}
${S} .glass-card{backdrop-filter:none;border:${OUTLINE_W_M} solid ${OUTLINE_M} !important;border-radius:${v("corner", "0px")};background:var(--surface-2,var(--surface));}
${S} [data-store-region="newsletterPanel"]{border-top:${v("rule-w", "6px")} solid ${OUTLINE_M};}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "6px")} solid ${OUTLINE_M};}
${S} .fm-footer-brand span{text-transform:uppercase;font-weight:var(--rp-heading-weight,900);letter-spacing:-.005em;}
${S} .fm-footer-heading{font-weight:800;letter-spacing:.14em;}
${S} .fm-announce{text-transform:uppercase;}
`;

/**
 * Shelf: soft rounded covers, pill buttons and pill filters, a warm hero band that the first row of books overlaps.
 * The overlap itself is the home layout's own Scoped CSS on its book grid section, so the press can remove it.
 */
const HAIR_S = "rgba(var(--fg-rgb),.16)";
export const SHELF_CSS = `
${S} h1,${S} h2,${S} h3{line-height:1.02;letter-spacing:0;font-weight:var(--rp-heading-weight,400);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);}
${S} header[data-section="navigation"] [class*="opacity-"],${S} a[class*="hover:!opacity-100"]{opacity:1 !important;}
${S} a[aria-current]{text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:6px;}
${S} .fm-card .fm-photo-frame{border-radius:${v("photo-radius", "6px 12px 12px 6px")} !important;box-shadow:0 14px 24px -16px rgba(var(--fg-rgb),.55);transition:translate .25s ease,box-shadow .25s ease;}
${S} .fm-card:hover .fm-photo-frame{translate:0 -4px;box-shadow:0 20px 28px -16px rgba(var(--fg-rgb),.6);}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.6rem;left:.6rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{border-radius:999px !important;border:0 !important;padding:.2rem .7rem;font-size:.62rem;letter-spacing:.04em;}
${S} .fm-card-title{font-family:var(--heading-font);font-weight:400;font-size:1.05rem;line-height:1.15;letter-spacing:0;text-transform:${v("title-case", "none")} !important;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.85rem;font-weight:500;}
${BTN}{border-radius:${v("btn-radius", "999px")} !important;--template-btn-border:${v("outline-w", "2px")} solid ${v("outline", "transparent")};border:var(--template-btn-border);font-weight:700;letter-spacing:.01em;text-transform:${v("btn-case", "none")};--template-btn-shadow:${NO_BTN_SHADOW(v("shadow", "rgb(var(--fg-rgb))"))};box-shadow:var(--template-btn-shadow);transition:translate .15s ease,background-color .15s ease;}
${BTN_HOVER}{translate:0 -2px;}
${S} :is(button,a).rounded-full{border-radius:999px;}
${S} [data-store-region="catalogSearch"],${S} [data-store-region="catalogSort"],${S} [data-store-region="catalogStock"],${S} [data-store-region="catalogSale"]{border-radius:${v("btn-radius", "999px")} !important;}
${S} [data-store-region^="catalog"] :is(button,select),${S} button[data-store-region^="catalog"],${S} select[data-store-region^="catalog"]{color:rgba(var(--fg-rgb),.82);}
${S} .glass-card{border-radius:calc(${v("corner", "12px")} + 6px);}
${S} [data-store-region="newsletterPanel"]{background-color:var(--surface);}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "0px")} solid ${HAIR_S};}
${S} .fm-footer-brand span{font-family:var(--heading-font);font-weight:400;}
${S} .fm-footer-heading{font-weight:700;letter-spacing:.06em;}
`;

/**
 * Atlas: a clean catalogue for shops with many different products. Hairline frames, small square tags, tabular
 * prices and quiet square buttons; the page stays out of the way of the photos.
 */
const HAIR_A = "rgba(var(--fg-rgb),.16)";
export const ATLAS_CSS = `
${S} h1,${S} h2,${S} h3{line-height:1.08;letter-spacing:-.01em;font-weight:var(--rp-heading-weight,600);}
${S} header[data-section="navigation"] [class*="opacity-"],${S} a[class*="hover:!opacity-100"]{opacity:1 !important;}
${S} [data-store-region^="catalog"] :is(button,select),${S} button[data-store-region^="catalog"],${S} select[data-store-region^="catalog"]{color:rgba(var(--fg-rgb),.82);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);border-bottom:${v("rule-w", "1px")} solid ${HAIR_A};}
${S} .fm-ref-catbar{text-transform:uppercase;letter-spacing:.1em;font-size:.72rem;font-weight:600;}
${S} .fm-ref-catbar a[aria-current]{box-shadow:inset 0 calc(-2 * ${v("rule-w", "1px")}) 0 var(--accent);padding-bottom:3px;}
${S} .fm-card .fm-photo-frame{border:${v("frame-w", "1px")} solid ${v("outline", HAIR_A)};border-radius:${v("photo-radius", "2px")} !important;background-color:var(--surface);box-shadow:none;transition:border-color .15s ease;}
${S} .fm-card:hover .fm-photo-frame{border-color:var(--accent);}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.5rem;left:.5rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{border-radius:${v("corner", "2px")} !important;border:0 !important;padding:.18rem .5rem;font-size:.6rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
${S} .fm-card-title{font-size:.86rem;font-weight:600;line-height:1.25;letter-spacing:0;text-transform:${v("title-case", "none")} !important;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.82rem;font-variant-numeric:tabular-nums;}
${BTN}{--template-btn-border:${v("outline-w", "1px")} solid ${v("outline", "transparent")};border:var(--template-btn-border);border-radius:${v("btn-radius", "2px")} !important;text-transform:${v("btn-case", "uppercase")};letter-spacing:.08em;font-size:.78rem;font-weight:600;--template-btn-shadow:${NO_BTN_SHADOW(v("shadow", "rgb(var(--fg-rgb))"))};box-shadow:var(--template-btn-shadow);transition:background-color .15s ease,color .15s ease;}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select,${S} textarea{border-radius:${v("btn-radius", "2px")} !important;}
${S} [class*="rounded-"]:not([class*="rounded-full"]):not([style*="border-radius"]){border-radius:${v("corner", "2px")} !important;}
${S} .glass-card{backdrop-filter:none;border:${v("outline-w", "1px")} solid ${v("outline", HAIR_A)};border-radius:${v("corner", "2px")};background:var(--surface);}
${S} [data-store-region="newsletterPanel"]{border-top:${v("rule-w", "1px")} solid ${HAIR_A};}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "1px")} solid ${HAIR_A};}
${S} .fm-footer-brand span{font-weight:var(--rp-heading-weight,600);letter-spacing:-.01em;}
${S} .fm-footer-heading{font-weight:600;letter-spacing:.12em;font-size:.72rem;}
${S} .fm-announce{text-transform:uppercase;letter-spacing:.1em;}
`;

/**
 * Mosaic: every product sits on a coloured tile, and the tiles cycle through the palette (accent, second accent,
 * warning, favourite). Chunky keycap buttons, heavy rules, rounded but not soft.
 */
const INK = v("outline", "rgb(var(--fg-rgb))");
export const MOSAIC_CSS = `
${S} h1,${S} h2,${S} h3{line-height:.98;letter-spacing:-.015em;font-weight:var(--rp-heading-weight,800);}
${S} header[data-section="navigation"] [class*="opacity-"],${S} a[class*="hover:!opacity-100"]{opacity:1 !important;}
${S} [data-store-region^="catalog"] :is(button,select),${S} button[data-store-region^="catalog"],${S} select[data-store-region^="catalog"]{color:rgba(var(--fg-rgb),.82);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);border-bottom:${v("rule-w", "3px")} solid ${INK};}
${S} .fm-ref-catbar{font-weight:800;letter-spacing:.04em;}
${S} .fm-ref-catbar a[aria-current]{box-shadow:inset 0 calc(-4 / 3 * ${v("rule-w", "3px")}) 0 var(--accent);padding-bottom:3px;}
${S} .fm-card{--tile:var(--accent);}
${S} .fm-card:nth-child(4n+2){--tile:var(--accent-2);}
${S} .fm-card:nth-child(4n+3){--tile:var(--warning);}
${S} .fm-card:nth-child(4n+4){--tile:var(--favorite);}
${S} .fm-card .fm-photo-frame{border:${v("frame-w", ".7rem")} solid var(--tile);border-radius:${v("photo-radius", "14px")} !important;background-color:var(--tile);box-shadow:none;transition:rotate .2s ease,scale .2s ease;}
${S} .fm-card:hover .fm-photo-frame{rotate:-1.2deg;scale:1.03;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.4rem;left:.4rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{border-radius:999px !important;border:${v("outline-w", "2px")} solid ${INK} !important;padding:.15rem .6rem;font-size:.62rem;font-weight:800;letter-spacing:.04em;}
${S} .fm-card-title{font-family:var(--heading-font);font-size:1rem;font-weight:800;line-height:1.1;letter-spacing:-.005em;text-transform:${v("title-case", "none")} !important;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.85rem;font-weight:700;}
${BTN}{--template-btn-border:${v("outline-w", "2px")} solid ${INK};border:var(--template-btn-border);border-radius:${v("btn-radius", "12px")} !important;font-weight:800;letter-spacing:.02em;text-transform:${v("btn-case", "none")};--template-btn-shadow:${BTN_SHADOW("0px", v("shadow-x", "4px"), v("shadow", INK))};box-shadow:var(--template-btn-shadow);transition:translate .1s ease,box-shadow .1s ease;}
${BTN_HOVER}{translate:0 2px;--template-btn-shadow:${BTN_SHADOW("0px", `calc(${v("shadow-x", "4px")} / 2)`, v("shadow", INK))};box-shadow:var(--template-btn-shadow);}
${BTN_ACTIVE}{translate:0 4px;--template-btn-shadow:${BTN_SHADOW("0px", "0px", v("shadow", INK))};box-shadow:var(--template-btn-shadow);}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select,${S} textarea{border-radius:calc(${v("btn-radius", "12px")} * 5 / 6) !important;}
${S} .glass-card{backdrop-filter:none;border:${v("outline-w", "2px")} solid ${INK};border-radius:calc(${v("corner", "14px")} + 2px);background:var(--surface);}
${S} [data-store-region="newsletterPanel"]{border-top:${v("rule-w", "3px")} solid ${INK};}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "3px")} solid ${INK};}
${S} .fm-footer-brand span{font-weight:var(--rp-heading-weight,800);letter-spacing:-.015em;}
${S} .fm-footer-heading{font-weight:800;letter-spacing:.08em;}
@media (prefers-reduced-motion:reduce){${S} .fm-card:hover .fm-photo-frame{rotate:0deg;scale:1;}}
`;

/**
 * Arch: photos with an arched top, centred serif titles, thin pill buttons and a footer that rises in an arch.
 * Calm and earthy; suits jewellery, ceramics and anything handmade.
 */
const HAIR_R = "rgba(var(--fg-rgb),.2)";
export const ARCH_CSS = `
${S} h1,${S} h2,${S} h3{line-height:1.05;letter-spacing:0;font-weight:var(--rp-heading-weight,500);}
${S} header[data-section="navigation"] [class*="opacity-"],${S} a[class*="hover:!opacity-100"]{opacity:1 !important;}
${S} [data-store-region^="catalog"] :is(button,select),${S} button[data-store-region^="catalog"],${S} select[data-store-region^="catalog"]{color:rgba(var(--fg-rgb),.82);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);border-bottom:${v("rule-w", "1px")} solid ${HAIR_R};}
${S} a[aria-current]{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:6px;}
${S} .fm-card .fm-photo-frame{border-radius:${v("photo-radius", "999px 999px 0 0 / 55% 55% 0 0")} !important;box-shadow:none;transition:translate .25s ease;}
${S} .fm-card:hover .fm-photo-frame{translate:0 -4px;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:auto;bottom:.6rem;left:50%;translate:-50% 0;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{border-radius:999px !important;border:0 !important;padding:.2rem .8rem;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;}
${S} .fm-card [data-studio-label="Card title & price"]{text-align:center;}
${S} .fm-card-title{font-family:var(--heading-font);font-size:1.2rem;font-weight:500;line-height:1.1;letter-spacing:0;text-transform:${v("title-case", "none")} !important;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.8rem;letter-spacing:.08em;}
${BTN}{--template-btn-border:${v("outline-w", "1px")} solid ${v("outline", "transparent")};border:var(--template-btn-border);border-radius:${v("btn-radius", "999px")} !important;text-transform:${v("btn-case", "uppercase")};letter-spacing:.14em;font-size:.74rem;font-weight:600;--template-btn-shadow:${NO_BTN_SHADOW(v("shadow", "rgb(var(--fg-rgb))"))};box-shadow:var(--template-btn-shadow);transition:translate .15s ease,background-color .15s ease;}
${BTN_HOVER}{translate:0 -2px;}
${S} :is(button,a).rounded-full{border-radius:999px;}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select{border-radius:${v("btn-radius", "999px")} !important;}
${S} textarea{border-radius:min(${v("btn-radius", "999px")}, 20px) !important;}
${S} .glass-card{backdrop-filter:none;border:${v("outline-w", "1px")} solid ${v("outline", HAIR_R)};border-radius:calc(${v("corner", "0px")} + 24px);background:var(--surface);}
${S} [data-store-region="newsletterPanel"]{background-color:var(--surface);}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "0px")} solid ${HAIR_R};border-radius:${v("footer-curve", "56px")} ${v("footer-curve", "56px")} 0 0;}
${S} .fm-footer-brand span{font-family:var(--heading-font);font-weight:500;}
${S} .fm-footer-heading{font-weight:600;letter-spacing:.16em;font-size:.72rem;}
`;

/**
 * Market stall: a hand-made fair table. Cards are white stickers with a thick outline and a hard shadow, tilted a
 * little each way; prices are black tags; buttons are chunky and press down. Loud, friendly, for zines, comics and merch.
 */
const INK_K = v("outline", "rgb(var(--fg-rgb))");
const SHADOW_K = v("shadow", "rgb(var(--fg-rgb))");
const W_K = v("outline-w", "3px");
const TILT = v("tilt", "1.2deg");
// Cards and panels cast a shadow half again as long as the buttons' (6px to 4px untouched).
const CARD_X = `calc(${v("shadow-x", "4px")} * 1.5)`;
export const MARKET_CSS = `
${S} h1,${S} h2,${S} h3{text-transform:${v("heading-case", "uppercase")};line-height:.92;letter-spacing:-.015em;font-weight:var(--rp-heading-weight,400);}
${S} header[data-section="navigation"] [class*="opacity-"],${S} a[class*="hover:!opacity-100"]{opacity:1 !important;}
${S} [data-store-region^="catalog"] :is(button,select),${S} button[data-store-region^="catalog"],${S} select[data-store-region^="catalog"]{color:rgba(var(--fg-rgb),.86);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);border-bottom:${v("rule-w", "4px")} solid ${INK_K};}
${S} .fm-ref-catbar{text-transform:uppercase;letter-spacing:.04em;font-weight:800;}
${S} .fm-ref-catbar a[aria-current]{background:rgb(var(--fg-rgb));color:var(--bg-color);padding:.1rem .6rem;}
${S} .fm-card{background:var(--surface);border:${W_K} solid ${INK_K};border-radius:calc(${v("corner", "6px")} + 4px);box-shadow:${CARD_X} ${CARD_X} 0 ${SHADOW_K};padding:.6rem;rotate:calc(${TILT} * -1);transition:rotate .15s ease,translate .15s ease,box-shadow .15s ease;}
${S} .fm-card:nth-child(even){rotate:calc(${TILT} * 5 / 6);}
${S} .fm-card:nth-child(3n){rotate:calc(${TILT} * -1 / 3);}
${S} .fm-card:hover{rotate:0deg;translate:-2px -3px;box-shadow:calc(${CARD_X} + 3px) calc(${CARD_X} + 3px) 0 ${SHADOW_K};}
${S} .fm-card .fm-photo-frame{border:${v("frame-w", W_K)} solid ${INK_K};border-radius:${v("photo-radius", "6px")} !important;box-shadow:none;margin-bottom:.6rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.5rem;left:.5rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{border-radius:999px !important;border:${v("outline-w", "2px")} solid ${INK_K} !important;padding:.15rem .6rem;font-size:.62rem;font-weight:800;letter-spacing:.04em;transform:rotate(-4deg);}
${S} .fm-card-title{font-family:var(--heading-font);font-size:1rem;font-weight:400;line-height:1;letter-spacing:-.005em;text-transform:${v("title-case", "uppercase")} !important;}
${S} .fm-card-price{background:rgb(var(--fg-rgb));color:var(--bg-color);padding:.12rem .5rem;font-size:.8rem;font-weight:700;border:0 !important;}
${BTN}{--template-btn-border:${W_K} solid ${INK_K};border:var(--template-btn-border);border-radius:${v("btn-radius", "10px")} !important;text-transform:${v("btn-case", "uppercase")};font-weight:800;letter-spacing:.04em;--template-btn-shadow:${BTN_SHADOW(v("shadow-x", "4px"), v("shadow-x", "4px"), SHADOW_K)};box-shadow:var(--template-btn-shadow);transition:translate .1s ease,box-shadow .1s ease;}
${BTN_HOVER}{translate:2px 2px;--template-btn-shadow:${BTN_SHADOW(`calc(${v("shadow-x", "4px")} / 2)`, `calc(${v("shadow-x", "4px")} / 2)`, SHADOW_K)};box-shadow:var(--template-btn-shadow);}
${BTN_ACTIVE}{translate:4px 4px;--template-btn-shadow:${BTN_SHADOW("0px", "0px", SHADOW_K)};box-shadow:var(--template-btn-shadow);}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select,${S} textarea{border-radius:calc(${v("btn-radius", "10px")} * .8) !important;border-width:2px;}
${S} .glass-card{backdrop-filter:none;border:${W_K} solid ${INK_K};border-radius:calc(${v("corner", "6px")} + 6px);background:var(--surface);box-shadow:calc(${CARD_X} - 1px) calc(${CARD_X} - 1px) 0 ${SHADOW_K};}
${S} [data-store-region="newsletterPanel"]{border-top:${v("rule-w", "4px")} solid ${INK_K};}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "4px")} solid ${INK_K};}
${S} .fm-footer-brand span{text-transform:uppercase;font-weight:var(--rp-heading-weight,400);}
${S} .fm-footer-heading{font-weight:800;letter-spacing:.1em;}
${S} .fm-announce{text-transform:uppercase;letter-spacing:.06em;}
@media (prefers-reduced-motion:reduce){${S} .fm-card,${S} .fm-card:hover{rotate:0deg;translate:0 0;}}
`;

/**
 * Index: the catalogue as a table. In the shop's product list every product is one ruled row: a small cover, a bold
 * title, the price at the right edge. Quiet hairlines, square corners, black and white with one highlight colour.
 * Only the main product list becomes rows; the home page's own sections keep their grids.
 */
const INK_I = v("outline", "rgb(var(--fg-rgb))");
export const INDEX_CSS = `
${S} h1,${S} h2,${S} h3{line-height:1;letter-spacing:-.02em;font-weight:var(--rp-heading-weight,700);}
${S} header[data-section="navigation"] [class*="opacity-"],${S} a[class*="hover:!opacity-100"]{opacity:1 !important;}
${S} [data-store-region^="catalog"] :is(button,select),${S} button[data-store-region^="catalog"],${S} select[data-store-region^="catalog"]{color:rgba(var(--fg-rgb),.86);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);border-bottom:${v("rule-w", "2px")} solid ${INK_I};}
${S} .fm-ref-catbar{text-transform:uppercase;letter-spacing:.08em;font-size:.74rem;font-weight:600;}
${S} .fm-ref-catbar a[aria-current]{background:rgb(var(--fg-rgb));color:var(--bg-color);padding:.1rem .5rem;}
${S} [data-studio-label="Product grid"]{display:block !important;border-top:${v("rule-w", "2px")} solid ${INK_I};}
${S} [data-studio-label="Product grid"] > .fm-card{display:block;border:0;border-bottom:calc(${v("rule-w", "2px")} / 2) solid ${INK_I};padding:.7rem .25rem;background:transparent;transition:background-color .12s ease;}
${S} [data-studio-label="Product grid"] > .fm-card:hover{background:var(--accent-2);}
${S} [data-studio-label="Product grid"] > .fm-card > a{display:grid;grid-template-columns:3.4rem minmax(0,1fr);gap:1rem;align-items:center;}
${S} [data-studio-label="Product grid"] > .fm-card .fm-photo-frame{width:3.4rem;margin:0 !important;border:${v("frame-w", "1px")} solid ${INK_I};border-radius:${v("photo-radius", "0px")} !important;box-shadow:none;}
${S} [data-studio-label="Product grid"] > .fm-card .fm-photo-frame > div.absolute{display:none;}
${S} [data-studio-label="Product grid"] > .fm-card [data-studio-label="Card title & price"]{border-top:0 !important;padding:0;}
${S} [data-studio-label="Product grid"] > .fm-card .fm-card-meta{align-items:center;}
${S} .fm-card .fm-photo-frame{border-radius:${v("photo-radius", "0px")} !important;}
${S} .fm-card-title{font-size:1.15rem !important;font-weight:700;line-height:1.1;letter-spacing:-.01em;text-transform:${v("title-case", "none")} !important;}
${S} .fm-card-price{font-variant-numeric:tabular-nums;font-size:.95rem !important;font-weight:600;border:0 !important;padding:0 !important;}
${S} [data-studio-label="Product grid"] > .fm-card :is(.fm-card-creator,.fm-card-formats,.fm-card-rating){font-size:.72rem;}
${BTN}{--template-btn-border:${v("outline-w", "2px")} solid ${INK_I};border:var(--template-btn-border);border-radius:${v("btn-radius", "0px")} !important;text-transform:${v("btn-case", "uppercase")};letter-spacing:.08em;font-size:.74rem;font-weight:700;--template-btn-shadow:${NO_BTN_SHADOW(v("shadow", INK_I))};box-shadow:var(--template-btn-shadow);transition:background-color .12s ease,color .12s ease;}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select,${S} textarea{border-radius:${v("btn-radius", "0px")} !important;border-width:1px;}
${S} [class*="rounded-"]:not([class*="rounded-full"]):not([style*="border-radius"]){border-radius:${v("corner", "0px")} !important;}
${S} .glass-card{backdrop-filter:none;border:calc(${v("outline-w", "2px")} / 2) solid ${INK_I};border-radius:${v("corner", "0px")};background:var(--surface);}
${S} [data-store-region="newsletterPanel"]{border-top:${v("rule-w", "2px")} solid ${INK_I};}
${S} footer[data-fm-footer]{border-top:${v("rule-w", "2px")} solid ${INK_I};}
${S} .fm-footer-heading{font-weight:700;letter-spacing:.1em;font-size:.72rem;}
${S} .fm-announce{text-transform:uppercase;letter-spacing:.08em;}
`;

/** Each template's own stylesheet, by id. A template missing here fails the coverage test. */
export const TEMPLATE_CSS: Record<TemplateStyleId, string> = {
  marquee: MARQUEE_CSS, shelf: SHELF_CSS, atlas: ATLAS_CSS, mosaic: MOSAIC_CSS, arch: ARCH_CSS, market: MARKET_CSS, index: INDEX_CSS,
};

/** Which template a design draws, or "" for any other look. */
export function templateStyleId(design: StorefrontTokenInput | null | undefined): TemplateStyleId | "" {
  const s = design?.themeStyle;
  return (TEMPLATE_STYLE_IDS as readonly string[]).includes(s) ? (s as TemplateStyleId) : "";
}

/** The stylesheet of the design's print style: Riso, one of the templates, or nothing for the standard look. */
export function themeStyleCss(design: StorefrontTokenInput | null | undefined): string {
  const d = design || {};
  if (d.themeStyle === "riso") return RISO_STOREFRONT_CSS + risoGrainCss(d);
  const id = templateStyleId(d);
  // The press's own settings come last, so a changed control always wins over the template's look.
  return id ? TEMPLATE_BASE_CSS + TEMPLATE_CSS[id] + templateKnobCss(d) : "";
}
