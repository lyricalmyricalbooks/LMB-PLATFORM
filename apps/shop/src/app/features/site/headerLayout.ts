/**
 * The shop header's named layouts (plan 1.22). The header used to switch between its two looks only through the
 * shop page's own layout (Shop page masthead & covers › Layout: Reference or Modern), so a press couldn't pick a header
 * without also changing the book grid. Now the header has its own setting, Header & announcement bar › Header layout:
 *
 *   - "classic": the big masthead (wordmark, bag total) over a ruled category bar. Called "Reference" before.
 *   - "modern":  logo, links and icons in one bar, with the bag button.
 *   - "centered": the modern bar with the logo in the middle and the links in their own centred row below.
 *   - "minimal": logo and icons only; every link sits behind the Menu button on every screen size.
 *   - "rail":    a side menu on computers: the shop name, links and icons run down the left edge and the page sits
 *                beside them (frame designs, 26 November 2026). On phones it draws like "modern".
 *   - "market":  a big-range shop: the logo on the left, a search box in the middle, the icons on the right and every
 *                link in a full-width row below (starter design upgrade, 26 November 2026). The box opens the same search
 *                drawer as the search icon; on phones it draws like "modern".
 *
 * Left empty (every existing shop), the header follows the shop page layout exactly as it did before: Modern draws
 * the modern header, anything else the classic one. Choosing a layout here never changes the shop page grid.
 */

export const HEADER_LAYOUTS = ["classic", "modern", "centered", "minimal", "rail", "market"] as const;
export type HeaderLayout = (typeof HEADER_LAYOUTS)[number];

/** The Studio choices for Header layout; the empty value keeps following the shop page layout. */
export const HEADER_LAYOUT_OPTIONS: { value: "" | HeaderLayout; label: string }[] = [
  { value: "", label: "Same as the shop page layout (default)" },
  { value: "classic", label: "Classic: big masthead over a ruled category bar" },
  { value: "modern", label: "Modern: logo, links and bag in one bar" },
  { value: "centered", label: "Centred: logo in the middle, links in a row below" },
  { value: "minimal", label: "Minimal: logo and bag, links behind a Menu button" },
  { value: "rail", label: "Side menu: shop name and links down the left on computers" },
  { value: "market", label: "Search bar: logo, a search box in the middle, links in a row below" },
];

/** Computers wide enough for the side menu; below this the "rail" header draws as the one-bar header. */
export const RAIL_MIN_WIDTH = 1024;
/** How wide the side menu is. */
export const RAIL_WIDTH = 248;

/**
 * The side menu's look: the header is fixed down the left edge and the page (announcement bar, sections, footer) moves
 * over by its width. Only colours the header already has are used (its own background, the theme's border token).
 */
export const RAIL_HEADER_CSS = `@media (min-width:${RAIL_MIN_WIDTH}px){`
  + `body:has(header[data-hdr-layout="rail"]){padding-left:${RAIL_WIDTH}px;}`
  + `header[data-hdr-layout="rail"]{position:fixed !important;top:0 !important;left:0;bottom:0;width:${RAIL_WIDTH}px;overflow-y:auto;border-bottom:0 !important;border-right:1px solid rgba(var(--border-rgb), 0.35) !important;backdrop-filter:none !important;}`
  + `header[data-hdr-layout="rail"] .fm-hdr-row{display:flex !important;flex-direction:column;align-items:stretch;justify-content:space-between;gap:40px;min-height:100%;max-width:none !important;padding:40px 28px 32px !important;}`
  + `header[data-hdr-layout="rail"] .fm-hdr-row>div{flex:0 0 auto !important;flex-direction:column;align-items:flex-start !important;justify-content:flex-start !important;gap:36px !important;order:0 !important;}`
  + `header[data-hdr-layout="rail"] .fm-hdr-row>div:last-child{flex-direction:row;flex-wrap:wrap;gap:16px !important;}`
  + `header[data-hdr-layout="rail"] nav[data-ga-menu="categories"]{flex-direction:column;align-items:flex-start;row-gap:14px;column-gap:0 !important;white-space:normal;}`
  // A long shop name wraps inside the rail instead of running out under the page ("Hollis & Pine Joinery").
  + `header[data-hdr-layout="rail"] .fm-logo{flex-wrap:wrap;row-gap:0.15em;}header[data-hdr-layout="rail"] .fm-logo,header[data-hdr-layout="rail"] .fm-logo *{white-space:normal !important;overflow-wrap:break-word;max-width:100%;}`
  + `}`;

/** The header layout a design draws. */
export function headerLayout(design: any): HeaderLayout {
  const chosen = design?.headerLayout;
  if ((HEADER_LAYOUTS as readonly string[]).includes(chosen)) return chosen;
  return design?.catalogLayoutStyle === "modern" ? "modern" : "classic";
}

/**
 * The "market" header's search box: computers only (phones keep the search icon), and the box takes the place of the
 * icon there. Colours come from the header's own text colour and the theme's border token.
 */
export const MARKET_HEADER_CSS = `header[data-hdr-layout="market"] .fm-hdr-searchbox{display:none;}`
  + `@media (min-width:768px){`
  + `header[data-hdr-layout="market"] .fm-hdr-searchbox{display:flex;flex:1 1 auto;max-width:520px;min-height:44px;margin:0 auto;align-items:center;gap:10px;padding:0 16px;border:1px solid rgba(var(--border-rgb), 0.9);background:transparent;font-size:13px;text-align:left;cursor:text;}`
  + `header[data-hdr-layout="market"] .fm-hdr-searchbox>span{opacity:.6;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}`
  + `header[data-hdr-layout="market"] .fm-hdr-searchbox:hover{border-color:currentColor;}`
  + `header[data-hdr-layout="market"] .fm-hdr-search-icon{display:none !important;}`
  + `}`;
