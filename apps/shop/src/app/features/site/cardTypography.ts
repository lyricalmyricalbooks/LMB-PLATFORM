import { phoneMinText } from "./smallPrint";

// One place that turns the Studio › Style › "Product cards & grid" title/price controls into CSS,
// so every storefront book card (shop grid, collection, wishlist, search) obeys them.
// Cards opt in with these class names:
//   fm-card-title       – the book title
//   fm-card-price-wrap  – the price element (colour + font)
//   fm-card-price       – the amount (size + weight)
//   fm-card-price-tag   – the boxed price tag (background)
//   fm-card-price-old   – the crossed-out price
//   fm-card-creator / fm-card-formats / fm-card-rating-stars – the optional lines under the title
// Every rule is only emitted when the merchant set the matching control, so defaults are untouched.

const num = (v: any) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};
const font = (name: any) => `'${String(name).replace(/['"\\;{}<>]/g, "")}', sans-serif`;
const clean = (v: any) => String(v).replace(/[;{}<>]/g, "");

/** Phone breakpoint used by the size controls (below = phone, at/above = desktop). */
const DESKTOP_MIN = 768;

function sizeRules(selector: string, desktop: number, mobile: number, floor = 0): string {
  const phone = mobile || desktop ? Math.max(mobile || desktop, floor) : 0;
  let css = "";
  if (phone) css += `@media (max-width:${DESKTOP_MIN - 1}px){${selector}{font-size:${phone}px !important;}}`;
  if (desktop) css += `@media (min-width:${DESKTOP_MIN}px){${selector}{font-size:${desktop}px !important;}}`;
  return css;
}

export function cardTypographyCss(design: any): string {
  const d = design || {};
  const S = "[data-fm-store]";
  // Style › Product cards & grid › "Smallest card title & price on phones" (default 14, 0 = off).
  const cardMin = Number(d.cardTitlePhoneMin ?? 14);
  const floor = Math.max(phoneMinText(d), Number.isFinite(cardMin) && cardMin > 0 ? cardMin : 0);
  // A title word wider than the card (an underscore name like "SISTEMA_NON_AUTORIZZATO") breaks instead of
  // spilling out of a two-column phone card. break-word, never anywhere/break-all: normal words still wrap
  // whole and only a word that can't fit on a line of its own is split. Titles that fit look the same.
  let css = `@media (max-width:767px){${S} .fm-card-title{overflow-wrap:break-word;}}`;

  const title: string[] = [];
  if (d.productTitleColor) title.push(`color:${clean(d.productTitleColor)} !important;`);
  if (d.cardTitleWeight) title.push(`font-weight:${num(d.cardTitleWeight) || 700} !important;`);
  if (d.cardTitleFont) title.push(`font-family:${font(d.cardTitleFont)} !important;`);
  if (d.cardTitleTracking != null && d.cardTitleTracking !== "" && Number.isFinite(Number(d.cardTitleTracking))) {
    title.push(`letter-spacing:${Number(d.cardTitleTracking)}em !important;`);
  }
  if (title.length) css += `${S} .fm-card-title{${title.join("")}}`;
  css += sizeRules(`${S} .fm-card-title`, num(d.cardTitleSize), d.cardTitleSizeMobile === undefined ? 16 : num(d.cardTitleSizeMobile), floor);

  const wrap: string[] = [];
  if (d.productPriceColor) wrap.push(`color:${clean(d.productPriceColor)} !important;`);
  if (d.cardPriceFont) wrap.push(`font-family:${font(d.cardPriceFont)} !important;`);
  if (wrap.length) css += `${S} .fm-card-price-wrap{${wrap.join("")}}`;
  if (d.cardPriceWeight) css += `${S} .fm-card-price{font-weight:${num(d.cardPriceWeight) || 700} !important;}`;
  css += sizeRules(`${S} .fm-card-price`, num(d.cardPriceSize), d.cardPriceSizeMobile === undefined ? 16 : num(d.cardPriceSizeMobile), floor);
  // Style › Product cards & grid › "Price under the title on phones" (default on): long titles get the full card width.
  if (d.cardPriceStackPhone !== false) {
    css += `@media (max-width:${DESKTOP_MIN - 1}px){${S} .fm-card-meta{flex-direction:column;gap:6px;}${S} .fm-card-meta .fm-card-price-wrap{align-items:flex-start;}${S} .fm-card-meta .fm-card-title{overflow-wrap:anywhere;}}`;
  }
  if (d.cardPriceTagBg) css += `${S} .fm-card-price-tag{background-color:${clean(d.cardPriceTagBg)} !important;}`;
  if (d.cardPriceOldColor) css += `${S} .fm-card-price-old{color:${clean(d.cardPriceOldColor)} !important;opacity:1 !important;}`;
  // The optional lines under the title (Grid & columns › author / formats / star ratings switches).
  if (d.cardCreatorColor) css += `${S} .fm-card-creator{color:${clean(d.cardCreatorColor)} !important;}`;
  css += sizeRules(`${S} .fm-card-creator`, num(d.cardCreatorSize), 0, phoneMinText(d));
  if (d.cardFormatsColor) css += `${S} .fm-card-formats{color:${clean(d.cardFormatsColor)} !important;}`;
  if (d.cardRatingStarColor) css += `${S} .fm-card-rating-stars{color:${clean(d.cardRatingStarColor)} !important;}`;

  css += cardDesignCss(d) + shopPageLayoutCss(d);
  return css;
}

/** Google Fonts the card controls may ask for (loaded by StorefrontThemeStyle). */
export const cardFontNames = (d: any): string[] => [d?.cardTitleFont, d?.cardPriceFont].filter(Boolean).map(String);

/**
 * Product card designs (frame designs, 26 November 2026): the same card (photo, title, price) drawn five ways on every
 * grid (home sections, the shop page, collections), so two starters never share a card. Empty is the card as it was.
 *   - "framed":   each card is a tile with its own background and a thin line around it.
 *   - "caption":  a large title in the heading font, the price underneath.
 *   - "centred":  title and price centred under the photo, in small capitals.
 *   - "numbered": each card carries its number in the grid (01, 02, 03…) above the title, like a catalogue.
 * Owner sizes and colours (the !important rules above) still win over a design.
 */
export const CARD_DESIGNS = ["", "framed", "caption", "centred", "numbered"] as const;
export type CardDesign = (typeof CARD_DESIGNS)[number];
export const CARD_DESIGN_OPTIONS: { value: CardDesign; label: string }[] = [
  { value: "", label: "Plain: photo, then title and price (default)" },
  { value: "framed", label: "Framed tile: each card on its own panel" },
  { value: "caption", label: "Big caption: large title, price underneath" },
  { value: "centred", label: "Centred: small capitals under the photo" },
  { value: "numbered", label: "Numbered: 01, 02, 03 above each title" },
];
export function cardDesign(d: any): CardDesign {
  return (CARD_DESIGNS as readonly string[]).includes(d?.cardDesign) ? d.cardDesign : "";
}

export function cardDesignCss(d: any): string {
  const S = "[data-fm-store]";
  const meta = `${S} .fm-card :has(> .fm-card-title)`;
  switch (cardDesign(d)) {
    case "framed":
      return `${S} .fm-card{padding:12px 12px 16px;background:var(--surface);border:1px solid rgba(var(--border-rgb), 0.5);}`;
    case "caption":
      return `${meta}{flex-direction:column;align-items:flex-start;gap:6px;}`
        + `${S} .fm-card .fm-card-title{font-family:var(--heading-font, inherit);font-size:clamp(19px, 1.7vw, 28px);font-weight:400;line-height:1.08;letter-spacing:-.01em;text-transform:none;}`
        + `${S} .fm-card .fm-card-price-wrap{align-items:flex-start;}`;
    case "centred":
      return `${meta}{flex-direction:column;align-items:center;text-align:center;gap:4px;}`
        + `${S} .fm-card .fm-card-title{font-size:12px;letter-spacing:.16em;text-transform:uppercase;}`
        + `${S} .fm-card .fm-card-price-wrap{align-items:center;}`;
    case "numbered":
      // Numbered in each section of the page: the counter starts again at every section (home sections, the shop grid).
      return `${S} section{counter-reset:fm-card;}`
        + `${S} .fm-card{counter-increment:fm-card;}`
        + `${meta}{flex-direction:column;align-items:flex-start;gap:4px;}`
        + `${S} .fm-card .fm-card-title::before{content:counter(fm-card, decimal-leading-zero);display:block;margin-bottom:6px;font-size:11px;letter-spacing:.14em;font-variant-numeric:tabular-nums;opacity:.6;}`;
    default:
      return "";
  }
}

/**
 * Shop page designs (frame designs, 26 November 2026): how the shop page and collections lay out their products.
 *   - "":          the grid (default).
 *   - "list":      an index: one product per row, a small photo beside the name and price, rows ruled like a catalogue.
 *   - "staggered": the grid with every other column set lower, like a magazine spread (computers only).
 */
export const SHOP_PAGE_LAYOUTS = ["", "list", "staggered"] as const;
export type ShopPageLayout = (typeof SHOP_PAGE_LAYOUTS)[number];
export const SHOP_PAGE_LAYOUT_OPTIONS: { value: ShopPageLayout; label: string }[] = [
  { value: "", label: "Grid (default)" },
  { value: "list", label: "Index list: one product per row with a small photo" },
  { value: "staggered", label: "Staggered grid: every other column set lower" },
];
export function shopPageLayout(d: any): ShopPageLayout {
  return (SHOP_PAGE_LAYOUTS as readonly string[]).includes(d?.shopPageLayout) ? d.shopPageLayout : "";
}

export function shopPageLayoutCss(d: any): string {
  const layout = shopPageLayout(d);
  const G = `[data-fm-store] .fm-shop-grid[data-shop-layout="${layout}"]`;
  if (layout === "list") {
    return `${G}{grid-template-columns:minmax(0,1fr) !important;row-gap:0 !important;}`
      + `${G}>.fm-card{padding:16px 0;border-top:1px solid rgba(var(--border-rgb), 0.45);transform:none !important;}`
      + `${G}>.fm-card>a{display:grid;grid-template-columns:88px minmax(0,1fr);gap:20px;align-items:center;}`
      + `@media (min-width:768px){${G}>.fm-card>a{grid-template-columns:120px minmax(0,1fr);gap:32px;}}`
      + `${G} .fm-photo-frame{margin-bottom:0 !important;}`;
  }
  if (layout === "staggered") {
    return `@media (min-width:1024px){${G}>.fm-card:nth-child(even){margin-top:64px;}}`;
  }
  return "";
}
