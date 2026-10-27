import { DEVICE_MEDIA } from "./breakpoints";
import { elementScheme } from "./colorSchemes";

// Studio › Style › Footer & social links → CSS for the one storefront footer (StoreFooter.tsx).
// Spacing always has a value (the defaults are the footer's own look); colours are emitted only
// when set, so an untouched footer keeps the theme's token colours. While the footer follows a colour
// scheme (Theme settings › Colour schemes › Footer), the scheme's colours replace the footer's own colour keys.

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  return value !== "" && value != null && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const ownColour = (value: unknown) => typeof value === "string" && value.trim() && !/[;{}<>]/.test(value) ? value.trim() : "";

export const FOOTER_SCOPE = "[data-fm-footer]";

export type FooterLinksAlign = "end" | "start" | "spread";
export function footerLinksAlign(d: any): FooterLinksAlign {
  return d?.footerLinksAlign === "start" || d?.footerLinksAlign === "spread" ? d.footerLinksAlign : "end";
}

export type FooterBrandAlign = "center" | "start";
export function footerBrandAlign(d: any): FooterBrandAlign {
  return d?.footerBrandAlign === "start" ? "start" : "center";
}

// The look picked in October 2026 (design "E3"): accent line on top, accent group headings, the brand
// centred in its own area with a thin line beside it, and square social buttons. Each one is its own
// Studio control; the defaults below are that look.
const RULE = "rgba(var(--fg-rgb, 255, 255, 255), 0.2)";

// Phones: footer links are ~19px-tall lines of small text. Each link gets an invisible tap area of at least
// TAP px (a centred ::after, so nothing moves), and the gap between stacked links grows to at least
// TAP − one line so neighbouring tap areas meet instead of overlapping. A larger Studio link gap still wins.
export const FOOTER_TAP_PX = 42;
const LINE_PX = 19;
function phoneTapTargetsCss(linkGap: number): string {
  const s = FOOTER_SCOPE;
  const stackGap = Math.max(linkGap, FOOTER_TAP_PX - LINE_PX - 1);
  const hit = [`${s} .fm-footer-main a`, `${s} .fm-footer-legal a`, `${s} .fm-footer-icon`];
  return `@media${DEVICE_MEDIA.mobile}{`
    + `${hit.join(",")}{position:relative;}`
    + `${hit.map(h => h + "::after").join(",")}{content:"";position:absolute;left:50%;top:50%;width:max(100%,${FOOTER_TAP_PX}px);height:max(100%,${FOOTER_TAP_PX}px);transform:translate(-50%,-50%);}`
    + `${s} .fm-footer-list>*+*{margin-top:${stackGap}px;}`
    + `${s} .fm-footer-main .space-y-3>*+*{margin-top:${stackGap}px;}`
    + `${s} .fm-footer-legal{row-gap:${stackGap}px;}`
    + `}`;
}

export function footerStyleCss(d: any = {}): string {
  const s = FOOTER_SCOPE;
  const padY = num(d.footerPaddingY, 32, 16, 160);
  const padYPhone = num(d.footerPaddingYMobile, 28, 16, 120);
  const colGap = num(d.footerColumnGap, 64, 16, 200);
  const linkGap = num(d.footerLinkGap, 8, 4, 32);
  const barPad = num(d.footerBarPaddingY, 12, 4, 40);
  const size = num(d.footerTextSize, 12, 10, 18);
  const schemed = Boolean(elementScheme(d, "footer"));
  const colour = (value: unknown) => schemed ? "" : ownColour(value);
  let css = `${s} .fm-footer-main{padding-top:${padY}px;padding-bottom:${padY}px;}`
    + `@media${DEVICE_MEDIA.mobile}{${s} .fm-footer-main{padding-top:${padYPhone}px;padding-bottom:${padYPhone}px;}}`
    + `${s} .fm-footer-groups{column-gap:${colGap}px;}`
    + `${s} .fm-footer-list>*+*{margin-top:${linkGap}px;}`
    + `${s} .fm-footer-text{font-size:${size}px !important;}`
    + `${s} .fm-footer-brand>[data-empty]{display:none !important;}`
    + `${s} .fm-footer-bar{padding-top:${barPad}px;padding-bottom:${barPad}px;}`
    + phoneTapTargetsCss(linkGap);
  const text = colour(d.footerTextColor);
  const heading = colour(d.footerHeadingColor);
  const hover = colour(d.footerLinkHoverColor);
  const divider = colour(d.footerDividerColor);
  if (text) css += `${s} .fm-footer-text,${s} .fm-footer-text a,${s} .fm-footer-icon{color:${text} !important;}`;
  if (heading) css += `${s} .fm-footer-heading{color:${heading} !important;}`;
  if (hover) css += `${s} a:hover,${s} a:focus-visible{color:${hover} !important;}`;
  if (divider) css += `${s} .fm-footer-rule{border-color:${divider} !important;}`;
  // Payment icons (Style › Footer & social links › What the footer shows): emitted only when changed, so the
  // default draws exactly as the classes do (30% at rest, full on hover).
  const iconRest = num(d.footerPaymentIconOpacity, 30, 10, 100);
  const iconHover = num(d.footerPaymentIconHoverOpacity, 100, 10, 100);
  if (iconRest !== 30 || iconHover !== 100) {
    css += `${s} .fm-footer-pay-icon{opacity:${iconRest / 100} !important;}`
      + `${s} .fm-footer-pay-icon:hover{opacity:${iconHover / 100} !important;}`;
  }
  const iconColour = colour(d.footerPaymentIconColor);
  if (iconColour) css += `${s} .fm-footer-pay-icons{color:${iconColour} !important;}`;
  if (d.showFooterDividers === false) css += `${s} .fm-footer-rule{border-top-width:0 !important;}`;
  const accent = colour(d.footerAccentColor) || "var(--accent, currentColor)";
  const rule = divider || RULE;
  if (d.showFooterAccentLine !== false) {
    css += `${s}{border-top:${num(d.footerAccentLineWidth, 3, 1, 12)}px solid ${accent} !important;}`;
  }
  if (d.footerGroupHeadingsAccent !== false && !heading) css += `${s} .fm-footer-groups .fm-footer-heading{color:${accent} !important;}`;
  if (footerBrandAlign(d) === "center") {
    const vAlign = d.footerBrandVAlign === "top" ? "flex-start" : "center";
    const centred = `${s} .fm-footer-brand{max-width:none;justify-self:stretch;align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:${vAlign};text-align:center;}`
      + `${s} .fm-footer-brand>*{margin-top:0 !important;}${s} .fm-footer-brand>*+*{margin-top:12px !important;}${s} .fm-footer-brand img{margin-inline:auto;}`;
    // Phones stack the logo above the links; "Centre the logo on phones too" centres it there as well.
    css += d.footerBrandCenterMobile !== false ? centred : `@media (min-width:768px){${centred}}`;
  }
  if (d.showFooterBrandDivider !== false) {
    css += `@media (min-width:768px){${s} .fm-footer-brand{border-right:1px solid ${rule};padding-right:${num(d.footerColumnGap, 64, 16, 200)}px;}}`;
  }
  if (d.footerSocialBoxes !== false) {
    const hoverBox = colour(d.footerSocialHoverColor) || accent;
    css += `${s} .fm-footer-icon-box{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${rule};transition:border-color .15s,color .15s;}`
      + `${s} .fm-footer-icon-box:hover,${s} .fm-footer-icon-box:focus-visible{border-color:${hoverBox} !important;color:${hoverBox} !important;}`;
  }
  return css;
}
