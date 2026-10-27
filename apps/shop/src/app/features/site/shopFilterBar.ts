// Studio › Style › "Catalog page header & filters": the shop filter bar (All · shop categories ·
// In stock, drawn beside the catalog heading) and the catalog heading's own look. Everything here is
// off until the owner turns it on, so the shop is unchanged by default.

const S = "[data-fm-store]";
const clean = (v: any) => String(v).replace(/[;{}<>]/g, "");
const font = (name: any) => `'${String(name).replace(/['"\\;{}<>]/g, "")}', sans-serif`;
const px = (v: any, min: number, max: number): number | null => {
  const n = Number(v);
  return v === "" || v == null || !Number.isFinite(n) || n <= 0 ? null : Math.max(min, Math.min(max, n));
};

/** Style › Catalog page header & filters › Show the shop filter bar (off by default). */
export const showShopFilterBar = (d: any): boolean => d?.showShopFilterBar === true;
/** …› Show how many books each button finds (off by default). */
export const shopFilterBarCounts = (d: any): boolean => d?.shopFilterBarCounts === true;
/** …› Include an "In stock" button (on by default). */
export const shopFilterBarInStock = (d: any): boolean => d?.shopFilterBarInStock !== false;

/**
 * The categories the bar offers: every visible shop category that has no visible sub-categories.
 * A parent such as PUBLICATIONS (whose Books and Zines sit under it) is left out, because "All"
 * already shows everything; a category with no parent and no children is offered as it is.
 */
export function shopFilterBarCategories(categories: any[]): any[] {
  const visible = (categories || []).filter((c: any) => c && (typeof c === "string" || c.showInNav !== false));
  return visible.filter((c: any) =>
    typeof c === "string" || !visible.some((o: any) => typeof o !== "string" && o.parentId && o.parentId === c.id));
}

/** CSS for the bar (only while it is shown) and the catalog heading look (only for controls that are set). */
export function shopFilterBarCss(design: any): string {
  const d = design || {};
  let css = "";
  const hFont = d.catalogHeadingFont ? `font-family:${font(d.catalogHeadingFont)};` : "";
  const hSize = px(d.catalogHeadingSize, 16, 200);
  const hSizeM = px(d.catalogHeadingSizeMobile, 14, 120);
  const hCase = ["uppercase", "none", "capitalize"].includes(d.catalogHeadingCase) ? `text-transform:${d.catalogHeadingCase};` : "";
  const hColor = d.catalogHeadingColor ? `color:${clean(d.catalogHeadingColor)};` : "";
  if (hFont || hCase || hColor) css += `${S} .fm-catalog-heading{${hFont}${hCase}${hColor}}`;
  if (hSize) css += `@media (min-width:768px){${S} .fm-catalog-heading{font-size:${hSize}px;line-height:1;}}`;
  if (hSizeM) css += `@media (max-width:767px){${S} .fm-catalog-heading{font-size:${hSizeM}px;line-height:1;}}`;
  if (!showShopFilterBar(d)) return css;
  const border = d.shopFilterBarBorderColor ? clean(d.shopFilterBarBorderColor) : "rgba(var(--border-rgb, 255, 255, 255), 0.22)";
  const active = d.shopFilterBarActiveColor ? clean(d.shopFilterBarActiveColor) : "rgb(var(--fg-rgb, 237, 237, 237))";
  const barFont = d.shopFilterBarFont ? font(d.shopFilterBarFont) : "'DM Mono', ui-monospace, monospace";
  css += `${S} .fm-filter-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}`
    + `${S} .fm-filter-bar button{font-family:${barFont};font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:9px 14px;border:1px solid ${border};color:var(--muted, inherit);background:transparent;transition:color .15s,border-color .15s;}`
    + `${S} .fm-filter-bar button:hover{color:${active};}`
    + `${S} .fm-filter-bar button[aria-pressed="true"]{border-color:${active};color:${active};}`;
  return css;
}

/** Google Fonts the heading / bar controls may ask for. */
export const shopFilterBarFontNames = (d: any): string[] =>
  [d?.catalogHeadingFont, showShopFilterBar(d) ? (d?.shopFilterBarFont || "DM Mono") : ""].filter(Boolean).map(String);
