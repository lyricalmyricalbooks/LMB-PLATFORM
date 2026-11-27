import { DEVICE_MEDIA } from "./breakpoints";
import { elementScheme } from "./colorSchemes";

// Studio › Style › Footer & social links → CSS for the one storefront footer (StoreFooter.tsx).
// Spacing always has a value (the defaults are the footer's own look); colours are emitted only
// when set, so an untouched footer keeps the theme's token colours. While the footer follows a colour
// scheme (Style › Colour schemes › Footer), the scheme's colours replace the footer's own colour keys.

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

/**
 * Footer designs (frame designs, 26 November 2026): the same footer parts laid out five ways, so two starters never end
 * on the same footer. Empty (every existing shop) is the footer as it has always been.
 *   - "wordmark": the shop's name set huge across the bottom, above the bottom bar.
 *   - "line":     one quiet line: the name and every link in a single row, no headings or about words.
 *   - "centred":  everything stacked down the middle.
 *   - "contact":  a large band first with the shop's email and where to find it, then the links.
 */
export const FOOTER_DESIGNS = ["", "wordmark", "line", "centred", "contact"] as const;
export type FooterDesign = (typeof FOOTER_DESIGNS)[number];
export const FOOTER_DESIGN_OPTIONS: { value: FooterDesign; label: string }[] = [
  { value: "", label: "Columns: name and about on the left, link groups beside (default)" },
  { value: "wordmark", label: "Big name: your shop's name huge across the bottom" },
  { value: "line", label: "One line: name and links in a single quiet row" },
  { value: "centred", label: "Centred: everything stacked down the middle" },
  { value: "contact", label: "Contact first: your email and address large, then the links" },
];
export function footerDesign(d: any): FooterDesign {
  return (FOOTER_DESIGNS as readonly string[]).includes(d?.footerDesign) ? d.footerDesign : "";
}

/** The giant name's size: it fills the width for a short name and never runs off the screen for a long one. */
export function giantNameSize(name: string): string {
  const letters = Math.max(4, Array.from(String(name || "").trim()).length);
  return `clamp(44px, ${(150 / letters).toFixed(2)}vw, 260px)`;
}

/** The CSS each footer design adds on top of the footer's own rules. */
export function footerDesignCss(d: any = {}): string {
  const s = `${FOOTER_SCOPE}[data-footer-design="${footerDesign(d)}"]`;
  switch (footerDesign(d)) {
    case "wordmark":
      return (ownColour(d.footerTextColor) && !elementScheme(d, "footer") ? `${s} .fm-footer-giant{color:${ownColour(d.footerTextColor)} !important;}` : "") + `${s} .fm-footer-giant{margin:0;padding:8px 0 4px;font-weight:700;line-height:.82;letter-spacing:-.045em;white-space:nowrap;overflow:hidden;text-overflow:clip;color:inherit;}`;
    case "line":
      return `${s} .fm-footer-main{display:flex !important;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px 40px;}`
        + `${s} .fm-footer-brand{max-width:none;border-right:0 !important;padding-right:0 !important;display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;}`
        + `${s} .fm-footer-brand>*{margin-top:0 !important;}${s} .fm-footer-brand>p~p{display:none !important;}`
        + `${s} .fm-footer-heading{display:none !important;}`
        + `${s} .fm-footer-groups{display:flex !important;flex-wrap:wrap;gap:10px 28px !important;}`
        + `${s} .fm-footer-groups nav{display:block;min-width:0 !important;}`
        + `${s} .fm-footer-list{display:flex;flex-wrap:wrap;gap:10px 28px;}${s} .fm-footer-list>*+*{margin-top:0 !important;}`
        + `${s} .fm-footer-main .space-y-3{display:flex;flex-wrap:wrap;gap:10px 28px;}${s} .fm-footer-main .space-y-3>*{margin-top:0 !important;}`;
    case "centred":
      return `${s} .fm-footer-main{display:flex !important;flex-direction:column;align-items:center;text-align:center;}`
        + `${s} .fm-footer-brand{border-right:0 !important;padding-right:0 !important;align-items:center;text-align:center;margin-inline:auto;}`
        + `${s} .fm-footer-groups{display:flex !important;flex-wrap:wrap;justify-content:center;justify-self:center !important;}`
        + `${s} .fm-footer-groups nav{text-align:center;}`
        + `${s} .fm-footer-legal,${s} .fm-footer-bar{justify-content:center !important;align-items:center !important;text-align:center;}`;
    case "contact":
      return (ownColour(d.footerTextColor) && !elementScheme(d, "footer") ? `${s} .fm-footer-contact-big{color:${ownColour(d.footerTextColor)} !important;}` : "") + `${s} .fm-footer-contact{display:grid;gap:28px;padding:56px 0 40px;border-bottom:1px solid ${RULE};}`
        + `@media (min-width:768px){${s} .fm-footer-contact[data-two]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:end;}}`
        + `${s} .fm-footer-contact-big{margin:0;font-family:var(--heading-font, inherit);font-size:clamp(28px, 4.4vw, 64px);line-height:1.02;letter-spacing:-.02em;overflow-wrap:normal;color:inherit;}`
        + `${s} .fm-footer-contact-big a{color:inherit;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.12em;}`
        + `${s} .fm-footer-contact .fm-footer-heading{display:block;margin-bottom:14px;}`;
    default:
      return "";
  }
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
  if (text) css += `${s} .fm-footer-text,${s} .fm-footer-text a,${s} .fm-footer-icon,${s} .fm-footer-name{color:${text} !important;}`
    // The copyright line keeps its small faint type but follows the footer's text colour, so an inverted footer
    // (dark band, light words) never draws it in the page's ink on the same dark colour.
    + `${s} .fm-footer-copy{color:${text} !important;opacity:1;}`;
  if (heading) css += `${s} .fm-footer-heading{color:${heading} !important;}`;
  if (hover) css += `${s} a:hover,${s} a:focus-visible{color:${hover} !important;}`;
  if (divider) css += `${s} .fm-footer-rule{border-color:${divider} !important;}`;
  // Payment icons (Style › Footer & social links › What the footer shows): emitted only when changed, so the
  // default draws exactly as the classes do (30% at rest, full on hover).
  const iconRest = num(d.footerPaymentIconOpacity, 30, 10, 100);
  const iconHover = num(d.footerPaymentIconHoverOpacity, 100, 10, 100);
  // Full-colour icons show at full strength: the card companies' colours are never faded or recoloured.
  if (d.paymentIconsFullColour === true) css += `${s} .fm-footer-pay-icon{opacity:1 !important;}`;
  else if (iconRest !== 30 || iconHover !== 100) {
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
    const box = Math.max(32, Math.min(28, Math.max(12, Number(d.footerSocialIconSize) || 14)) + 18);
    css += `${s} .fm-footer-icon-box{width:${box}px;height:${box}px;display:inline-flex;align-items:center;justify-content:center;border:1px solid ${rule};transition:border-color .15s,color .15s;}`
      + `${s} .fm-footer-icon-box:hover,${s} .fm-footer-icon-box:focus-visible{border-color:${hoverBox} !important;color:${hoverBox} !important;}`;
  }
  return css;
}
