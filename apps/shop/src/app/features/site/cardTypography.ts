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

  return css;
}

/** Google Fonts the card controls may ask for (loaded by StorefrontThemeStyle). */
export const cardFontNames = (d: any): string[] => [d?.cardTitleFont, d?.cardPriceFont].filter(Boolean).map(String);
