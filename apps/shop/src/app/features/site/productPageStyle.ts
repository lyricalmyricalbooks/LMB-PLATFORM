// The Riso "catalogue card" product page (BookDetail.tsx). Every value here comes from a
// Studio › Style › "Product page · buy card & details" control (the `pdp*` design keys); when a
// control is empty the rule falls back to a theme token, so the page always follows the palette.
// BookDetail opts elements in with these class names:
//   fm-pdp-crumb        breadcrumb row             fm-pdp-meta         small mono labels
//   fm-pdp-media        photo column (data-thumbs) fm-pdp-rail / -thumb thumbnail rail
//   fm-pdp-frame        framed main photo          fm-pdp-caption      "Fig. 1 · 1 of 3" bar
//   fm-pdp-card         the bordered buy card      fm-pdp-card-section one ruled row of the card
//   fm-pdp-tag          category tag               fm-pdp-title / -price title and price
//   fm-pdp-stock        stock line (dot + words)   fm-pdp-chip         format / edition choice
//   fm-pdp-qty          quantity stepper           fm-pdp-sq           square icon buttons
//   fm-pdp-tabs / -tab / -panel  details tabs     fm-pdp-record       catalogue-record specs

import { phoneMinText } from "./smallPrint";
import { elementScheme } from "./colorSchemes";

const S = "[data-fm-store]";
const clean = (v: any) => String(v).replace(/[;{}<>]/g, "");
const font = (name: any) => `'${String(name).replace(/['"\\;{}<>]/g, "")}', sans-serif`;
const has = (v: any) => v !== undefined && v !== null && v !== "";

/** A number control, clamped; `fallback` when the control is empty or not a number. */
function num(d: any, key: string, fallback: number, min: number, max: number): number {
  const x = Number(d[key]);
  if (!has(d[key]) || !Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
/** A colour control, or the theme token it falls back to. */
const color = (d: any, key: string, fallback: string) => (has(d[key]) ? clean(d[key]) : fallback);

/** Phone breakpoint shared with the card typography controls. */
const PHONE_MAX = 767;

/**
 * Desktop size, then the phone size. A phone size of 0 no longer copies the desktop size as is
 * (a 49px title broke "LYRICALMYRICAL" mid-word on a 360px phone): it scales down with the screen
 * (`phoneScale`, never above the desktop size). `fit` caps every size so the longest word still
 * fits the line (see `titleFitSize`). The plain `font-size` before each `min()` is the fallback
 * for browsers without `min()` or container units.
 */
function sizeRules(selector: string, desktop: number, phone: number, auto: string, phoneScale = "", fit = ""): string {
  const decl = (plain: string, sized: string) =>
    `${plain ? `font-size:${plain};` : ""}${sized && sized !== plain ? `font-size:${sized};` : ""}`;
  const capped = (v: string) => (fit ? `min(${v}, ${fit})` : v);
  const desk = desktop ? `${desktop}px` : "";
  let css = `${selector}{${decl(desk || auto, capped(desk || auto))}}`;
  let phoneSize = "";
  if (phone) phoneSize = `${phone}px`;
  else if (desktop && phoneScale) phoneSize = `min(${desktop}px, ${phoneScale})`;
  if (phoneSize) css += `@media (max-width:${PHONE_MAX}px){${selector}{${decl(phone ? phoneSize : desk, capped(phoneSize))}}}`;
  return css;
}

/** How far a phone title's size may scale with the screen when no phone size is set. */
const PHONE_TITLE_SCALE = "8.5vw";
const PHONE_PRICE_SCALE = "9vw";
/** Widest average letter of a heading font in capitals, in em (Archivo/Arial ≈ .65; Anton is narrower). */
const WIDE_LETTER_EM = 0.72;

/**
 * The largest font size at which the title's longest word still fits on one line of the buy card,
 * as a CSS length for `--pdp-title-fit` (`cqi` = the card section's width, see `container-type`
 * below). Empty for a short title (nothing to cap). Long words otherwise break mid-word
 * ("COLLECTION / S") because the title allows breaking anywhere rather than overflowing.
 */
export function titleFitSize(title: unknown): string {
  const longest = String(title ?? "").split(/\s+/).reduce((n, w) => Math.max(n, Array.from(w).length), 0);
  if (longest < 6) return "";
  const em = Math.round(longest * WIDE_LETTER_EM * 100) / 100;
  return `calc(100cqi / ${em})`;
}

/**
 * Studio › Style › Product page · buy card & details › Description text. Empty controls emit nothing
 * for the words themselves, so an untouched design looks exactly as before; the formatting pieces
 * (headings, lists, quotes, dividers) always get token-based defaults.
 */
export function descriptionTextCss(d: any): string {
  const T = `${S} .fm-pdp-desc-text`;
  let css = "";
  const size = num(d, "pdpDescSize", 0, 0, 24);
  const phone = num(d, "pdpDescSizeMobile", 0, 0, 24);
  if (size) css += `${T}{font-size:${size}px;}`;
  if (phone) css += `@media (max-width:${PHONE_MAX}px){${T}{font-size:${phone}px;}}`;
  const lh = num(d, "pdpDescLineHeight", 0, 0, 2.6);
  if (lh >= 1) css += `${T}{line-height:${lh};}`;
  if (has(d.pdpDescColor)) css += `${T}{color:${clean(d.pdpDescColor)};}`;
  if (has(d.pdpDescFont)) css += `${T}{font-family:${font(d.pdpDescFont)};}`;
  if (d.pdpDescAlign === "center" || d.pdpDescAlign === "justify") css += `${T}{text-align:${d.pdpDescAlign};}`;
  const gap = num(d, "pdpDescBlockGap", 12, 0, 40);
  const headingFont = has(d.pdpDescHeadingFont) ? font(d.pdpDescHeadingFont) : "var(--heading-font, inherit)";
  const headingSize = num(d, "pdpDescHeadingSize", 0, 0, 40);
  const headingColor = color(d, "pdpDescHeadingColor", "inherit");
  const linkColor = color(d, "pdpDescLinkColor", "inherit");
  const quoteColor = color(d, "pdpDescQuoteColor", "var(--accent)");
  css += `${T} .fm-pdp-desc-heading{font-family:${headingFont};font-size:${headingSize ? `${headingSize}px` : "1.25em"};line-height:1.25;color:${headingColor};margin:${gap * 1.5}px 0 ${gap / 2}px;white-space:normal;}`;
  css += `${T} .fm-pdp-desc-subheading{font-size:${headingSize ? `${Math.round(headingSize * 0.8)}px` : "1.05em"};}`;
  css += `${T} > :first-child{margin-top:0;}`;
  const ruleLine = color(d, "pdpCardDividerColor", "rgba(var(--border-rgb), 0.45)");
  if (d.pdpRuledEveryLine === true) css += notebookCss(d, T, ruleLine);
  else if (d.pdpRuledText === true) css += `${T} > * + *{border-top:1px solid ${ruleLine};padding-top:${gap}px;margin-top:${gap}px;}`;
  css += `${T} .fm-pdp-desc-list{margin:${gap}px 0;padding-left:1.4em;white-space:normal;}`;
  css += `${T} ul.fm-pdp-desc-list{list-style:disc;}${T} ol.fm-pdp-desc-list{list-style:decimal;}`;
  css += `${T} .fm-pdp-desc-list li{margin:.2em 0;}`;
  css += `${T} .fm-pdp-desc-quote{margin:${gap}px 0;padding-left:1em;border-left:3px solid ${quoteColor};font-style:italic;}`;
  css += `${T} .fm-pdp-desc-rule{margin:${gap * 1.5}px 0;border:0;border-top:1px solid rgba(var(--border-rgb), 0.45);}`;
  css += `${T} .fm-pdp-desc-link{color:${linkColor};text-decoration:${d.pdpDescLinkUnderline === false ? "none" : "underline"};}`;
  css += `${T} strong{font-weight:700;}${T} em{font-style:italic;}`;
  if (d.pdpRuledEveryLine === true) css += notebookBlocksCss(d, T);
  return css;
}

/** Notebook line height in px for a text size: the Description line height when it is airy enough, else 2. */
function notebookLine(d: any, size: number): number {
  const lh = num(d, "pdpDescLineHeight", 0, 0, 2.6);
  return Math.round(size * (lh >= 1.8 ? lh : 2));
}

/**
 * Notebook lines (`pdpRuledEveryLine`) = a ruled notebook page: a hairline under every wrapped line, drawn as a
 * background that repeats at exactly the line height (px, so it can't drift from the text), plus one rule
 * above the first line. Blank lines in the text stay as empty ruled lines.
 */
function notebookCss(d: any, T: string, rule: string): string {
  const size = num(d, "pdpDescSize", 15, 10, 24);
  const phone = num(d, "pdpDescSizeMobile", 0, 0, 24) || size;
  const page = (s: number, inset: number) => {
    const line = notebookLine(d, s);
    return `${T}.fm-pdp-desc-ruled{font-size:${s}px;line-height:${line}px;padding-left:${inset}px;`
      + `background-image:repeating-linear-gradient(to bottom,transparent 0,transparent ${line - 1}px,${rule} ${line - 1}px,${rule} ${line}px);}`;
  };
  return `${T}.fm-pdp-desc-ruled{border-top:1px solid ${rule};}`
    + page(size, 20) + `@media (max-width:${PHONE_MAX}px){${page(phone, 14)}}`;
}

/** Inside a notebook page every block keeps to the line grid: no margins, an empty line before a heading, a divider = one empty line. */
function notebookBlocksCss(d: any, T: string): string {
  const N = `${T}.fm-pdp-desc-ruled`;
  const size = num(d, "pdpDescSize", 15, 10, 24);
  const phone = num(d, "pdpDescSizeMobile", 0, 0, 24) || size;
  const blocks = (s: number) => {
    const line = notebookLine(d, s);
    return `${N} > *,${N} > * + *,${N} .fm-pdp-desc-list li,${N} p{margin:0;padding-top:0;border-top:0;line-height:${line}px;}`
      + `${N} > * + .fm-pdp-desc-heading{margin-top:${line}px;}`
      + `${N} .fm-pdp-desc-rule{margin:0;height:${line}px;border:0;}`;
  };
  return blocks(size) + `@media (max-width:${PHONE_MAX}px){${blocks(phone)}}`;
}

/**
 * Studio › Style › Product page · buy card & details › "Notify me" signup box (BackInStockForm: the
 * back-in-stock and coming-soon signups). Each empty control emits nothing, so an untouched design keeps
 * the box's built-in look. Doubled classes outrank the Riso corner/colour-utility rules they replace.
 */
export function signupBoxCss(d: any): string {
  const A = `${S} div.fm-pdp-alert.fm-pdp-alert`;
  let css = "";
  if (has(d.pdpAlertBg)) css += `${A}{background:${clean(d.pdpAlertBg)};}`;
  if (has(d.pdpAlertBorderColor)) css += `${A}{border-color:${clean(d.pdpAlertBorderColor)};}`;
  if (has(d.pdpAlertBorderWidth)) css += `${A}{border-width:${num(d, "pdpAlertBorderWidth", 1, 0, 6)}px;border-style:solid;}`;
  if (has(d.pdpAlertRadius)) css += `${A}{border-radius:${num(d, "pdpAlertRadius", 0, 0, 32)}px !important;}`;
  if (has(d.pdpAlertPadding)) css += `${A}{padding:${num(d, "pdpAlertPadding", 16, 8, 48)}px;}`;
  if (has(d.pdpAlertHeadingColor)) css += `${A} p.fm-pdp-alert-heading{color:${clean(d.pdpAlertHeadingColor)};}`;
  if (has(d.pdpAlertFieldBorderColor)) css += `${A} input.fm-pdp-alert-input{border-color:${clean(d.pdpAlertFieldBorderColor)};}`;
  if (has(d.pdpAlertButtonBg)) css += `${A} button.fm-pdp-alert-btn{background:${clean(d.pdpAlertButtonBg)};}${A} button.fm-pdp-alert-btn:hover:not(:disabled){opacity:.85;}`;
  if (has(d.pdpAlertButtonText)) css += `${A} button.fm-pdp-alert-btn{color:${clean(d.pdpAlertButtonText)};}`;
  if (has(d.pdpAlertButtonBorderColor)) css += `${A} button.fm-pdp-alert-btn{border-color:${clean(d.pdpAlertButtonBorderColor)};}`;
  return css;
}

/**
 * Studio › Style › Product page · buy card & details › Extras & gift card fields: the inscription box
 * and the gift card recipient form (ProductOptions.tsx, `fm-pdp-field`). Each empty control emits
 * nothing, so an untouched design keeps the fields' built-in look.
 */
export function extraFieldsCss(d: any): string {
  const F = `${S} .fm-pdp-field.fm-pdp-field`;
  let css = "";
  if (has(d.pdpFieldBg)) css += `${F}{background:${clean(d.pdpFieldBg)};}`;
  if (has(d.pdpFieldText)) css += `${F}{color:${clean(d.pdpFieldText)};}`;
  if (has(d.pdpFieldBorderColor)) css += `${F}{border-color:${clean(d.pdpFieldBorderColor)};}`;
  if (has(d.pdpFieldBorderWidth)) css += `${F}{border-width:${num(d, "pdpFieldBorderWidth", 1, 0, 6)}px;border-style:solid;}`;
  if (has(d.pdpFieldRadius)) css += `${F}{border-radius:${num(d, "pdpFieldRadius", 0, 0, 24)}px !important;}`;
  if (has(d.pdpFieldFocusColor)) css += `${F}:focus{border-color:${clean(d.pdpFieldFocusColor)};}`;
  return css;
}

/**
 * Studio › Style › Product page · buy card & details › Enlarged photo viewer: the round "enlarge" button
 * on the main photo and the full-screen viewer it opens (PhotoLightbox.tsx: `fm-lightbox`, `fm-lightbox-btn`,
 * `fm-lightbox-count`). Each empty control emits nothing, so an untouched design keeps the built-in look.
 * Doubled classes outrank the Tailwind colour utilities they replace (hover included).
 */
export function photoViewerCss(d: any): string {
  const V = `${S} .fm-lightbox.fm-lightbox`;
  const B = `${S} .fm-lightbox-btn.fm-lightbox-btn`;
  let css = "";
  if (has(d.pdpViewerShade)) css += `${V}{background:${clean(d.pdpViewerShade)};}`;
  if (has(d.pdpViewerButtonBg)) css += `${B}{background:${clean(d.pdpViewerButtonBg)};}${B}:hover{opacity:.85;}`;
  if (has(d.pdpViewerButtonIcon)) css += `${B}{color:${clean(d.pdpViewerButtonIcon)};}`;
  if (has(d.pdpViewerButtonBorderColor)) css += `${B}{border-color:${clean(d.pdpViewerButtonBorderColor)};}`;
  if (d.pdpViewerButtonShape === "square") css += `${B}{border-radius:0 !important;}`;
  if (d.pdpViewerButtonShape === "soft") css += `${B}{border-radius:8px !important;}`;
  if (has(d.pdpViewerCountColor)) css += `${S} .fm-lightbox-count.fm-lightbox-count{color:${clean(d.pdpViewerCountColor)};}`;
  return css;
}

export function productPageCss(design: any): string {
  const d = design || {};

  const outlineW = has(d.pdpCardBorderWidth) ? `${num(d, "pdpCardBorderWidth", 2, 0, 6)}px` : "var(--rp-outline-w, 2px)";
  const photoW = has(d.pdpPhotoBorderWidth) ? `${num(d, "pdpPhotoBorderWidth", 2, 0, 6)}px` : "var(--rp-outline-w, 2px)";
  const outline = "var(--rp-outline, rgb(var(--fg-rgb)))";
  // Theme settings › Colour schemes › Product page buy card: while the buy card follows a scheme, the
  // scheme's colours (tokens on .fm-pdp-card, from schemeCss) replace the card's own colour controls.
  const schemed = Boolean(elementScheme(d, "buyCard"));
  const cardTint = (key: string, fallback: string) => (schemed ? fallback : color(d, key, fallback));
  const cardBorder = cardTint("pdpCardBorderColor", outline);
  const photoBorder = color(d, "pdpPhotoBorderColor", outline);
  const divider = color(d, "pdpCardDividerColor", "rgba(var(--border-rgb), 0.45)");
  const cardDivider = cardTint("pdpCardDividerColor", "rgba(var(--border-rgb), 0.45)");
  const shadow = cardTint("pdpCardShadowColor", "var(--accent)");
  const offset = num(d, "pdpCardShadowOffset", 8, 0, 16);
  const pad = num(d, "pdpCardPadding", 24, 8, 48);
  const metaFont = font(has(d.pdpMetaFont) ? d.pdpMetaFont : "DM Mono");
  const metaSize = num(d, "pdpMetaSize", 11, 8, 16);
  const chipSize = num(d, "pdpChipTextSize", 11, 9, 18);
  const metaColor = color(d, "pdpMetaColor", "var(--muted)");
  const titleFont = has(d.pdpTitleFont) ? font(d.pdpTitleFont) : "var(--heading-font, inherit)";
  const priceFont = has(d.pdpPriceFont) ? font(d.pdpPriceFont) : "var(--heading-font, inherit)";
  const titleCase = d.pdpTitleCase === "uppercase" || d.pdpTitleCase === "none" ? `text-transform:${d.pdpTitleCase};` : "";
  const tabBg = color(d, "pdpTabActiveBg", "var(--active-bg)");
  const tabText = color(d, "pdpTabActiveText", "var(--active-fg)");
  const panelBorder = color(d, "pdpPanelBorderColor", outline);
  const descWidth = num(d, "pdpPanelTextWidth", 65, 0, 160);
  const thumbActive = color(d, "pdpThumbActiveColor", "var(--accent)");
  const thumbSize = num(d, "pdpThumbSize", 64, 40, 160);
  const thumbGap = num(d, "pdpThumbGap", 10, 0, 24);
  const stockDot = color(d, "pdpStockColor", "var(--success)");

  let css = "";
  css += `${S} .fm-pdp-desc{max-width:${descWidth ? `${descWidth}ch` : "none"};}`;
  css += descriptionTextCss(d);
  css += `${S} .fm-pdp-meta{font-family:${metaFont};font-size:${metaSize}px;letter-spacing:.14em;text-transform:uppercase;color:${metaColor};}`;
  css += `${S} .fm-pdp-crumb{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:14px 0;border-bottom:1px solid ${divider};}`;
  css += `${S} .fm-pdp-crumb a{color:inherit;text-decoration:none;}`;
  css += `${S} .fm-pdp-crumb a:hover{color:var(--link-hover-color, var(--accent));}`;
  css += `${S} .fm-pdp-crumb [aria-current]{color:rgb(var(--fg-rgb));}`;

  // Photo column: thumbnail rail beside (side) or under (below) the framed photo.
  css += `${S} .fm-pdp-media{display:grid;gap:14px;align-items:start;grid-template-columns:minmax(0,1fr);}`;
  css += `${S} .fm-pdp-media[data-thumbs="side"]{grid-template-columns:${thumbSize + 12}px minmax(0,1fr);}`;
  css += `${S} .fm-pdp-rail{display:flex;gap:${thumbGap}px;overflow-x:auto;padding-bottom:2px;}`;
  css += `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-rail{flex-direction:column;max-height:min(80vh, 760px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;}`;
  css += `${S} .fm-pdp-media[data-thumbs="below"] .fm-pdp-rail{order:2;}`;
  css += `${S} .fm-pdp-thumb{flex:none;width:${thumbSize}px;padding:0;overflow:hidden;background:var(--surface);border:2px solid rgba(var(--border-rgb), 0.5);opacity:.72;transition:opacity 140ms,border-color 140ms;}`;
  css += `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-thumb{width:100%;}`;
  css += `${S} .fm-pdp-thumb:hover{opacity:1;}`;
  css += `${S} .fm-pdp-thumb[aria-current="true"]{opacity:1;border-color:${thumbActive};}`;
  css += `${S} .fm-pdp-frame{border:${photoW} solid ${photoBorder};}`;
  css += `${S} .fm-pdp-caption{display:flex;justify-content:space-between;gap:12px;padding:9px 12px;border:${photoW} solid ${photoBorder};border-top:0;}`;

  // The buy card.
  css += `${S} .fm-pdp-card{width:100%;background:${cardTint("pdpCardBg", "var(--surface)")};border:${outlineW} solid ${cardBorder};box-shadow:${offset}px ${offset}px 0 ${shadow};border-radius:var(--rp-card-radius, 0);}`;
  css += `${S} .fm-pdp-card-section{display:flex;flex-direction:column;gap:16px;padding:${pad}px;border-top:1px solid ${cardDivider};}`;
  css += `${S} .fm-pdp-card-section:first-child{border-top:0;}`;
  css += `${S} .fm-pdp-tag{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;font-size:10px;font-weight:900;letter-spacing:.3em;text-transform:uppercase;line-height:1;}`;
  css += `${S} .fm-pdp-tag[data-style="filled"]{background:var(--badge-bg-primary, var(--accent));color:var(--badge-text-primary, var(--on-accent));}`;
  css += `${S} .fm-pdp-tag[data-style="outline"]{border:2px solid currentColor;color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-title{margin:0;font-family:${titleFont};font-weight:${has(d.headingWeight) ? Number(d.headingWeight) || 400 : 400};line-height:.98;overflow-wrap:anywhere;text-wrap:balance;color:${cardTint("pdpTitleColor", "rgb(var(--fg-rgb))")};${titleCase}}`;
  css += sizeRules(`${S} .fm-pdp-title`, num(d, "pdpTitleSize", 0, 0, 120), num(d, "pdpTitleSizeMobile", 0, 0, 96), "var(--pdp-title-auto, clamp(34px, 4.6vw, 62px))", PHONE_TITLE_SCALE, "var(--pdp-title-fit, 100vw)");
  // The title's word-fit cap measures the card section it sits in.
  css += `${S} .fm-pdp-card-section{container-type:inline-size;}`;
  css += `${S} .fm-pdp-price{font-family:${priceFont};font-weight:400;line-height:1;letter-spacing:.01em;font-variant-numeric:tabular-nums;color:${cardTint("pdpPriceColor", "rgb(var(--fg-rgb))")};}`;
  css += sizeRules(`${S} .fm-pdp-price`, num(d, "pdpPriceSize", 0, 0, 96), num(d, "pdpPriceSizeMobile", 0, 0, 80), "clamp(34px, 5vw, 60px)", PHONE_PRICE_SCALE);
  css += `${S} .fm-pdp-stock{display:inline-flex;align-items:center;gap:8px;}`;
  css += `${S} .fm-pdp-tagrow{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}`;
  css += `${S} .fm-pdp-stock::before{content:"";width:10px;height:10px;flex:none;background:${stockDot};}`;
  css += `${S} .fm-pdp-stock[data-state="out"]::before{background:var(--danger);}`;

  // Format chips, quantity and the square wishlist/share buttons.
  css += `${S} .fm-pdp-select{width:100%;min-height:48px;padding:0 14px;background:var(--surface);color:rgb(var(--fg-rgb));border:2px solid rgba(var(--border-rgb), 0.6);font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;}`;
  css += `${S} .fm-pdp-select:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}`;
  css += `${S} .fm-pdp-select[aria-invalid="true"]{border-color:var(--danger);}`;
  css += `${S} .fm-pdp-select option{background:var(--surface);color:rgb(var(--fg-rgb));}`;
  // Edition buttons (Style › Product page · buy card & details › Edition choices; defaults = the original look).
  const chipActiveBg = cardTint("pdpChipActiveBg", "var(--active-bg)");
  const chipRadius = num(d, "pdpChipRadius", 0, 0, 32);
  css += `${S} .fm-pdp-chip{min-height:44px;padding:0 16px;background:transparent;border:${num(d, "pdpChipBorderWidth", 2, 0, 6)}px solid ${cardTint("pdpChipBorderColor", "rgba(var(--border-rgb), 0.6)")};font-size:${num(d, "pdpChipTextSize", 11, 9, 18)}px;font-weight:800;letter-spacing:.16em;text-transform:${d.pdpChipCase === "none" ? "none" : "uppercase"};color:${cardTint("pdpChipTextColor", "var(--muted)")};${chipRadius ? `border-radius:${chipRadius}px;` : ""}}`;
  css += `${S} .fm-pdp-chip:hover{border-color:rgb(var(--fg-rgb));color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-chip[aria-pressed="true"]{background:${chipActiveBg};border-color:${chipActiveBg};color:${cardTint("pdpChipActiveText", "var(--active-fg)")};}`;
  css += `${S} .fm-pdp-chip[data-soldout="true"]{${d.pdpChipSoldOutStrike === false ? "" : "text-decoration:line-through;"}opacity:.55;}`;
  css += `${S} .fm-pdp-qty{display:inline-flex;align-items:stretch;height:52px;flex:none;border:2px solid ${outline};}`;
  css += `${S} .fm-pdp-qty button{width:44px;display:grid;place-items:center;background:transparent;}`;
  css += `${S} .fm-pdp-qty button:hover:not(:disabled){background:var(--surface-2);}`;
  css += `${S} .fm-pdp-qty button:disabled{opacity:.3;}`;
  css += `${S} .fm-pdp-qty output{min-width:40px;display:grid;place-items:center;font-family:${metaFont};font-size:15px;border-inline:1px solid ${cardDivider};}`;
  css += `${S} .fm-pdp-sq{width:52px;height:52px;flex:none;display:grid;place-items:center;background:transparent;border:2px solid rgba(var(--border-rgb), 0.6);color:rgb(var(--fg-rgb));}`;
  // Sticky add-to-bag bar (pdpStickyBar): fixed to the bottom edge, in the page's own colours.
  css += `${S} .fm-pdp-sticky{position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:var(--surface);border-top:${outlineW} solid ${outline};}`;
  css += `${S} .fm-pdp-sticky-text{display:flex;flex-direction:column;min-width:0;}`;
  css += `${S} .fm-pdp-sticky-title{font-family:${titleFont};font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-sticky-price{font-family:${priceFont};color:${color(d, "pdpPriceColor", "rgb(var(--fg-rgb))")};}`;
  css += `${S} .fm-pdp-sticky-btn{flex:none;min-height:44px;display:inline-flex;align-items:center;gap:8px;padding:0 20px;font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;}`;
  css += `@media (min-width:${PHONE_MAX + 1}px){${S} .fm-pdp-sticky-phone{display:none;}}`;
  // "Buy it now" (pdpShowBuyNow): full-width second button, outlined in the page's text colour.
  css += `${S} .fm-pdp-buynow{display:flex;width:100%;min-height:48px;margin-top:10px;align-items:center;justify-content:center;font-size:10px;font-weight:900;letter-spacing:.3em;background:transparent;color:rgb(var(--fg-rgb));border:${outlineW} solid ${outline};cursor:pointer;}`;
  css += `${S} .fm-pdp-buynow:hover{background:rgb(var(--fg-rgb));color:var(--surface);}`;
  css += `${S} .fm-pdp-sq:hover{border-color:rgb(var(--fg-rgb));}`;
  css += signupBoxCss(d);
  css += extraFieldsCss(d);
  css += photoViewerCss(d);

  // Details: tabs + bordered panel, catalogue-record specs.
  css += `${S} .fm-pdp-tabs [role="tablist"]{display:flex;flex-wrap:wrap;}`;
  css += `${S} .fm-pdp-tab{min-height:48px;padding:0 22px;margin-right:-2px;background:transparent;border:2px solid rgba(var(--border-rgb), 0.6);border-bottom:0;font-size:10px;font-weight:900;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);}`;
  css += `${S} .fm-pdp-tab:hover{color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-tab[aria-selected="true"]{background:${tabBg};border-color:${tabBg};color:${tabText};}`;
  css += `${S} .fm-pdp-panel{border:${outlineW} solid ${panelBorder};padding:${pad}px;}`;
  css += `${S} .fm-pdp-record{display:grid;grid-template-columns:minmax(110px,190px) minmax(0,1fr);margin:0;}`;
  css += `${S} .fm-pdp-record dt,${S} .fm-pdp-record dd{margin:0;padding:11px 0;border-top:1px solid ${divider};}`;
  css += `${S} .fm-pdp-record dt{padding-right:12px;font-size:9px;font-weight:800;letter-spacing:.3em;text-transform:uppercase;line-height:1.6;color:var(--muted);}`;
  css += `${S} .fm-pdp-record dd{white-space:pre-line;font-family:${metaFont};font-size:14px;line-height:1.5;color:rgb(var(--fg-rgb));}`;
  css += `${S} .fm-pdp-record dt:first-of-type,${S} .fm-pdp-record dd:first-of-type{border-top:0;}`;

  css += `@media (max-width:${PHONE_MAX}px){`
    + `${S} .fm-pdp-media[data-thumbs="side"]{grid-template-columns:minmax(0,1fr);}`
    + `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-rail{flex-direction:row;max-height:none;overflow-x:auto;overflow-y:hidden;order:2;}`
    + `${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-thumb{width:${thumbSize}px;}`
    + `${S} .fm-pdp-card-section,${S} .fm-pdp-panel{padding:${Math.min(pad, 18)}px;}`
    + `${S} .fm-pdp-record{grid-template-columns:minmax(0,1fr);}`
    + `${S} .fm-pdp-record dd{border-top:0;padding-top:2px;}`
    + `}`;
  // Thumbnails on several rows (pdpThumbWrap): a rail under the photo becomes a grid exactly as wide as
  // the photo. As many columns fit as the thumbnail size allows, then they stretch to share the width
  // evenly, so the last column lines up with the photo's right edge (no empty strip on the right).
  // On phones the "beside" rail moves under the photo too, so it becomes the same grid there.
  if (d.pdpThumbWrap === true) {
    const grid = `display:grid;grid-template-columns:repeat(auto-fill,minmax(min(${thumbSize}px,100%),1fr));overflow:visible;`;
    const cell = `width:100%;`;
    css += `${S} .fm-pdp-media[data-thumbs="below"] .fm-pdp-rail{${grid}}${S} .fm-pdp-media[data-thumbs="below"] .fm-pdp-thumb{${cell}}`;
    css += `@media (max-width:${PHONE_MAX}px){${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-rail{${grid}}${S} .fm-pdp-media[data-thumbs="side"] .fm-pdp-thumb{${cell}}}`;
  }
  css += phoneThumbsCss(d, thumbSize, thumbGap);
  // Smallest text on phones (Style › Small print › Smallest text on phones): the book page's small labels
  // (tabs, tag, meta lines, chips, detail names, buy-now) never go below it, with tighter tracking so they still fit.
  const floor = phoneMinText(d);
  if (floor) {
    const at = (px: number) => `${Math.max(px, floor)}px`;
    css += `@media (max-width:${PHONE_MAX}px){`
      + `${S} .fm-pdp-tab{font-size:${at(10)};letter-spacing:.2em;padding:0 16px;}`
      + `${S} .fm-pdp-tag{font-size:${at(10)};letter-spacing:.22em;}`
      + `${S} .fm-pdp-meta{font-size:${at(metaSize)};}`
      + `${S} .fm-pdp-chip{font-size:${at(chipSize)};}`
      + `${S} .fm-pdp-record dt{font-size:${at(9)};letter-spacing:.2em;}`
      + `${S} .fm-pdp-buynow{font-size:${at(10)};letter-spacing:.22em;}`
      + `${S} .fm-pdp-sticky-btn{font-size:${at(11)};}`
      + `}`;
  }
  // Add to bag + wishlist + share on one line on phones (full-width Add to bag only, `.fm-pdp-cta`): the
  // button shares the row with the square buttons instead of pushing Share onto a line of its own, and a
  // quantity stepper sits on the line above. Computers keep the wrapping flex row.
  css += `@media (max-width:${PHONE_MAX}px){`
    + `${S} .fm-pdp-cta{display:grid;grid-template-columns:minmax(0,1fr);}`
    + `${S} .fm-pdp-cta[data-icons="1"]{grid-template-columns:minmax(0,1fr) 52px;}`
    + `${S} .fm-pdp-cta[data-icons="2"]{grid-template-columns:minmax(0,1fr) 52px 52px;}`
    + `${S} .fm-pdp-cta>*{min-width:0;}`
    + `${S} .fm-pdp-cta>.fm-pdp-qty{grid-column:1/-1;justify-self:start;}`
    + `}`;
  // Thumbnails that fill the strip edge to edge (pdpThumbFill, on by default): ThumbStrip measures the strip
  // and sets data-fill, --thumb-cols and --thumb-h (thumbStrip.ts). Each thumbnail takes an equal share of
  // the row; every thumbnail keeps the same height, and a short last row stretches (data-last-row="stretch"),
  // sits left or is centred. Without data-fill (prerendered HTML, a strip beside the photo) nothing changes.
  const fill = `${S} .fm-pdp-media[data-thumbs] .fm-pdp-rail[data-fill]`;
  const share = `calc((100% - (var(--thumb-cols) - 1) * ${thumbGap}px) / var(--thumb-cols))`;
  css += `${fill}{display:flex;flex-direction:row;max-height:none;}`;
  css += `${fill} .fm-pdp-thumb{width:auto;min-width:0;height:var(--thumb-h);aspect-ratio:auto !important;}`;
  css += `${fill}[data-fill="line"]{flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;}`;
  css += `${fill}[data-fill="line"] .fm-pdp-thumb{flex:0 0 ${share};}`;
  css += `${fill}[data-fill="wrap"]{flex-wrap:wrap;overflow:visible;}`;
  css += `${fill}[data-fill="wrap"] .fm-pdp-thumb{flex:1 1 ${share};max-width:100%;}`;
  css += `${fill}[data-last-row="left"] .fm-pdp-thumb,${fill}[data-last-row="center"] .fm-pdp-thumb{flex-grow:0;}`;
  css += `${fill}[data-last-row="center"]{justify-content:center;}`;
  return css;
}

/**
 * Style › Book page · photos & layout › Thumbnails on phones (`pdpThumbsPhone`). "" = same as on a computer
 * (nothing emitted); "row" = one line that scrolls sideways even when Thumbnails on several rows is on;
 * "hidden" = no thumbnails on phones (shoppers swipe the photo). Comes after the several-rows and fill rules
 * so it wins over both, only below the phone breakpoint.
 */
export function phoneThumbsCss(d: any, thumbSize = 64, thumbGap = 10): string {
  const mode = d?.pdpThumbsPhone;
  const rail = `${S} .fm-pdp-media[data-thumbs] .fm-pdp-rail`;
  if (mode === "hidden") return `@media (max-width:${PHONE_MAX}px){${rail}{display:none !important;}}`;
  if (mode !== "row") return "";
  const share = `calc((100% - (var(--thumb-cols) - 1) * ${thumbGap}px) / var(--thumb-cols))`;
  return `@media (max-width:${PHONE_MAX}px){`
    + `${rail},${rail}[data-fill][data-fill]{display:flex;flex-direction:row;flex-wrap:nowrap;max-height:none;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;}`
    + `${rail} .fm-pdp-thumb{flex:none;width:${thumbSize}px;}`
    + `${rail}[data-fill][data-fill] .fm-pdp-thumb{flex:0 0 ${share};width:auto;max-width:none;}`
    + `}`;
}

/** Google Fonts the product-page controls may ask for. */
export const productPageFontNames = (d: any): string[] =>
  [d?.pdpTitleFont, d?.pdpPriceFont, d?.pdpMetaFont, d?.pdpDescFont, d?.pdpDescHeadingFont].filter(Boolean).map(String);
