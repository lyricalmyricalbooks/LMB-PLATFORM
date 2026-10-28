// ─────────────────────────────────────────────────────────────────────────────
// Full storefront templates (plan 10.9 to 10.12): a template is a theme with its own `themeStyle` and its own
// scoped stylesheet, so its header, book cards, buttons, book page, bag and footer are drawn as one design system,
// not as a recolour of another look. Everything here is token-driven (no literal colour or font: themeTokens.test.ts
// style check below), so every part stays editable in Studio, and the stylesheet only exists while the design's
// `themeStyle` names the template. The look is picked in the theme picker; Theme settings › Printed-paper look ›
// Print style switches it off again.
//
//   marquee: a loud ruled masthead, a bare cover wall, round stickers and hard offset shadows on buttons.
//   shelf:   a colour-block hero, a white shelf of books that overlaps it, pill buttons and soft rounded covers.
//
// Read the tokens from buildStorefrontTokenVars (--accent, --surface, --rp-outline …). A new knob is a new design key
// with a Studio control, never a literal in here.
// ─────────────────────────────────────────────────────────────────────────────
import { RISO_STOREFRONT_CSS, risoGrainCss, type StorefrontTokenInput } from "./themeTokens";

export const TEMPLATE_STYLE_IDS = ["marquee", "shelf"] as const;
export type TemplateStyleId = (typeof TEMPLATE_STYLE_IDS)[number];

const S = "[data-fm-store]";

/** The pieces both templates share: a readable floor for faint words, focus rings and reduced motion. */
const TEMPLATE_BASE_CSS = `
${S} :where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--rp-focus);outline-offset:2px;}
${S} ::selection{background:var(--accent);color:var(--on-accent);}
${S} h1,${S} h2,${S} h3{text-wrap:balance;}
@media (pointer:coarse){${S} .custom-btn{min-height:44px;}}
@media (prefers-reduced-motion:reduce){${S} *{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important;}}
`;

/**
 * Marquee: ruled masthead, a wall of bare covers, round stickers, hard offset shadows on buttons. Black ink on white
 * paper with one loud sticker colour (the badge colour). Outline = Print style knobs (outline colour and width, offset
 * shadow colour and distance).
 */
export const MARQUEE_CSS = `
${S} h1,${S} h2,${S} h3{text-transform:uppercase;line-height:.95;letter-spacing:-.005em;font-weight:var(--rp-heading-weight,900);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);}
${S} .fm-ref-masthead{text-transform:uppercase;line-height:.82;letter-spacing:-.01em;font-weight:var(--rp-heading-weight,900);}
${S} .fm-ref-catbar{text-transform:uppercase;letter-spacing:.09em;font-size:.78rem;font-weight:800;}
${S} .fm-ref-catbar a[aria-current]{box-shadow:inset 0 -4px 0 var(--accent);padding-bottom:3px;}
${S} .fm-card{transition:none;}
${S} .fm-card:hover{translate:0 0;}
${S} .fm-card .fm-photo-frame{border:var(--rp-outline-w) solid var(--rp-outline);margin-bottom:.6rem;box-shadow:none;}
${S} .fm-card:hover .fm-photo-frame{box-shadow:var(--rp-shadow-x) var(--rp-shadow-x) 0 var(--rp-shadow-color);transition:box-shadow .12s ease;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.5rem;left:auto;right:.5rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{display:grid;place-items:center;width:3.4rem;height:3.4rem;border-radius:50% !important;border:var(--rp-outline-w) solid var(--rp-outline) !important;text-align:center;line-height:1.05;font-size:.58rem;font-weight:900;letter-spacing:.04em;padding:0;transform:rotate(10deg);}
${S} .fm-card [data-studio-label="Card title & price"]{border-top:0 !important;padding-top:0;}
${S} .fm-card-title{text-transform:uppercase;font-size:.8rem;font-weight:800;letter-spacing:.05em;line-height:1.2;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.8rem;}
${S} .custom-btn,${S} .store-btn-primary,${S} button.custom-btn{border:var(--rp-outline-w) solid var(--rp-outline);border-radius:0;text-transform:uppercase;letter-spacing:.1em;font-weight:800;box-shadow:5px 5px 0 var(--rp-shadow-color);transition:translate .1s ease,box-shadow .1s ease;}
${S} .custom-btn:hover,${S} .store-btn-primary:hover{translate:2px 2px;box-shadow:3px 3px 0 var(--rp-shadow-color);}
${S} .custom-btn:active,${S} .store-btn-primary:active{translate:5px 5px;box-shadow:0 0 0 var(--rp-shadow-color);}
${S} input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),${S} select,${S} textarea{border-radius:0 !important;}
${S} [class*="rounded-"]:not([class*="rounded-full"]):not([style*="border-radius"]){border-radius:0 !important;}
${S} :is(button,a,label).rounded-full:not([style*="border-radius"]){border-radius:0 !important;}
${S} .glass-card{backdrop-filter:none;border:var(--rp-outline-w) solid var(--rp-outline) !important;border-radius:0;background:var(--surface-2,var(--surface));}
${S} [data-store-region="newsletterPanel"]{border-top:6px solid var(--rp-outline);}
${S} footer[data-fm-footer]{border-top:6px solid var(--rp-outline);}
${S} .fm-footer-brand span{text-transform:uppercase;font-weight:var(--rp-heading-weight,900);letter-spacing:-.005em;}
${S} .fm-footer-heading{font-weight:800;letter-spacing:.14em;}
${S} .fm-announce{text-transform:uppercase;}
`;

/**
 * Shelf: soft rounded covers, pill buttons and pill filters, a warm hero band that the first row of books overlaps.
 * The overlap itself is the home layout's own Scoped CSS on its book grid section, so the press can remove it.
 */
export const SHELF_CSS = `
${S} h1,${S} h2,${S} h3{line-height:1.02;letter-spacing:0;font-weight:var(--rp-heading-weight,400);}
${S} header[data-section="navigation"]{background-color:var(--bg-color);}
${S} .fm-card .fm-photo-frame{border-radius:6px 12px 12px 6px !important;box-shadow:0 14px 24px -16px rgba(var(--fg-rgb),.55);transition:translate .25s ease,box-shadow .25s ease;}
${S} .fm-card:hover .fm-photo-frame{translate:0 -4px;box-shadow:0 20px 28px -16px rgba(var(--fg-rgb),.6);}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3{top:.6rem;left:.6rem;}
${S} .fm-card .fm-photo-frame > div.absolute.top-3.left-3 > span{border-radius:999px !important;border:0 !important;padding:.2rem .7rem;font-size:.62rem;letter-spacing:.04em;}
${S} .fm-card-title{font-family:var(--heading-font);font-weight:400;font-size:1.05rem;line-height:1.15;letter-spacing:0;text-transform:none !important;}
${S} .fm-card-price-tag{border:0 !important;padding:0 !important;font-size:.85rem;font-weight:500;}
${S} .custom-btn,${S} .store-btn-primary,${S} button.custom-btn{border-radius:999px !important;border:2px solid transparent;font-weight:700;letter-spacing:.01em;text-transform:none;box-shadow:none;transition:translate .15s ease,background-color .15s ease;}
${S} .custom-btn:hover,${S} .store-btn-primary:hover{translate:0 -2px;}
${S} :is(button,a).rounded-full{border-radius:999px;}
${S} [data-store-region="catalogSearch"],${S} [data-store-region="catalogSort"],${S} [data-store-region="catalogStock"],${S} [data-store-region="catalogSale"]{border-radius:999px !important;}
${S} .glass-card{border-radius:18px;}
${S} [data-store-region="newsletterPanel"]{background-color:var(--surface);}
${S} footer[data-fm-footer]{border-top:0;}
${S} .fm-footer-brand span{font-family:var(--heading-font);font-weight:400;}
${S} .fm-footer-heading{font-weight:700;letter-spacing:.06em;}
`;

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
  if (id === "marquee") return TEMPLATE_BASE_CSS + MARQUEE_CSS;
  if (id === "shelf") return TEMPLATE_BASE_CSS + SHELF_CSS;
  return "";
}
